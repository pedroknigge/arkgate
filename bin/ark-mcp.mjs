#!/usr/bin/env node
/**
 * ark-mcp — zero-dependency MCP server exposing Ark's architectural contract and a
 * code-validation gate over stdio (JSON-RPC 2.0, newline-delimited).
 *
 * Purpose: the AI write-path gate. A host (e.g. Claude Code) binds the `validate_code`
 * tool to PreToolUse on Write/Edit, so generated code is checked against the architecture
 * BEFORE it lands — turning Ark's manifest + AI code gate from a library you must remember
 * to call into an enforced checkpoint on the operation that actually matters for agents.
 *
 * Capabilities:
 *   - resource  ark://manifest  — the architectural contract (layers + rules, or a project
 *                                 manifest file when --manifest is provided)
 *   - tool      validate_code   — runs Ark's AI code gate on a source snippet; returns
 *                                 { valid, violations } and sets isError when invalid
 *
 * Usage: ark-mcp [--root <dir>] [--config ark.config.json] [--manifest <manifest.json>]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

function parseArgs(argv) {
  const args = { root: process.cwd(), config: 'ark.config.json', manifest: undefined };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--root') args.root = path.resolve(argv[++i]);
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--manifest') args.manifest = argv[++i];
  }
  return args;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function resolveInRoot(root, maybePath) {
  if (!maybePath) return undefined;
  return path.isAbsolute(maybePath) ? maybePath : path.join(root, maybePath);
}

function globToRegExp(pattern) {
  const escaped = pattern
    .split(path.sep)
    .join('/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function inferLayer(filePath, config, root) {
  if (!filePath) return undefined;
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  for (const layer of config.layers ?? []) {
    for (const pattern of layer.patterns ?? []) {
      if (globToRegExp(pattern).test(rel)) return layer.name;
    }
  }
  return undefined;
}

async function loadArk() {
  const url = new URL('../dist/index.js', import.meta.url);
  if (!fs.existsSync(url)) {
    throw new Error(
      'ark-mcp requires the built library at dist/index.js. Run "npm run build" first.'
    );
  }
  return import(url.href);
}

async function main() {
  const args = parseArgs(process.argv);
  const ark = await loadArk();

  const configPath = resolveInRoot(args.root, args.config);
  const config = (configPath && readJson(configPath)) || { include: ['src'], layers: [], rules: [] };
  const manifestPath = resolveInRoot(args.root, args.manifest);
  const projectManifest = manifestPath ? readJson(manifestPath) : undefined;

  const intents = Array.isArray(projectManifest?.intents)
    ? projectManifest.intents.map((i) => (typeof i === 'string' ? i : i.name)).filter(Boolean)
    : [];

  const gate = ark.createAICodeGate({
    architectureProfile: ark.elevenLayerProfile,
    intents,
    enforceIntentAllowlist: intents.length > 0,
  });

  const SERVER_INFO = { name: 'ark-runtime-kernel', version: ark.version };
  const DEFAULT_PROTOCOL = '2024-11-05';

  const TOOLS = [
    {
      name: 'validate_code',
      description:
        "Validate a source snippet about to be written against Ark's architecture " +
        '(forbidden infra imports, unknown intents, and layer-reference violations). ' +
        'Bind to PreToolUse on Write/Edit to block architecturally-invalid generated code. ' +
        'Returns { valid, violations }; isError is true when the code is invalid.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Full source text about to be written.' },
          layer: {
            type: 'string',
            description:
              'Architecture layer of the target file (e.g. DomainModel). If omitted, ' +
              'inferred from filePath via ark.config.json layer patterns.',
          },
          filePath: {
            type: 'string',
            description: 'Target file path (used to infer layer and for messages).',
          },
        },
        required: ['source'],
      },
    },
  ];

  const RESOURCES = [
    {
      uri: 'ark://manifest',
      name: 'Ark architectural contract',
      description:
        'The architecture agents must obey before generating code: layers and layer rules ' +
        '(plus the full project manifest when --manifest is provided).',
      mimeType: 'application/json',
    },
  ];

  function manifestText() {
    if (projectManifest) return JSON.stringify(projectManifest, null, 2);
    const profile = ark.elevenLayerProfile;
    return JSON.stringify(
      { source: 'elevenLayerProfile', name: profile.name, layers: profile.layers, rules: profile.rules },
      null,
      2
    );
  }

  function runValidate(params) {
    const source = params?.arguments?.source;
    if (typeof source !== 'string') {
      return { content: [{ type: 'text', text: 'Missing required "source" argument.' }], isError: true };
    }
    const layer = params.arguments.layer ?? inferLayer(params.arguments.filePath, config, args.root);
    const result = gate.validate(source, {
      layer,
      filePath: params.arguments.filePath,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ ...result, layer }, null, 2) }],
      isError: !result.valid,
    };
  }

  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  function handle(msg) {
    const { id, method, params } = msg;
    const isNotification = !('id' in msg);

    switch (method) {
      case 'initialize':
        reply(id, {
          protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL,
          capabilities: { tools: {}, resources: {} },
          serverInfo: SERVER_INFO,
        });
        return;
      case 'notifications/initialized':
        return; // notification, no response
      case 'ping':
        reply(id, {});
        return;
      case 'tools/list':
        reply(id, { tools: TOOLS });
        return;
      case 'tools/call':
        if (params?.name !== 'validate_code') {
          fail(id, -32602, `Unknown tool: ${params?.name}`);
          return;
        }
        reply(id, runValidate(params));
        return;
      case 'resources/list':
        reply(id, { resources: RESOURCES });
        return;
      case 'resources/read':
        if (params?.uri !== 'ark://manifest') {
          fail(id, -32602, `Unknown resource: ${params?.uri}`);
          return;
        }
        reply(id, {
          contents: [{ uri: 'ark://manifest', mimeType: 'application/json', text: manifestText() }],
        });
        return;
      default:
        if (!isNotification) fail(id, -32601, `Method not found: ${method}`);
    }
  }

  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      fail(null, -32700, 'Parse error');
      return;
    }
    try {
      handle(msg);
    } catch (err) {
      fail(msg?.id ?? null, -32603, err instanceof Error ? err.message : String(err));
    }
  });
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
