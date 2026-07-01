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
import { layerForFile } from './ark-shared.mjs';

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    config: 'ark.config.json',
    configExplicit: false,
    manifest: undefined,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--root') args.root = path.resolve(argv[++i]);
    else if (a === '--config') {
      args.config = argv[++i];
      args.configExplicit = true;
    } else if (a === '--manifest') args.manifest = argv[++i];
  }
  return args;
}

/**
 * Read a JSON file. Missing files return undefined unless `required` (so the caller can
 * fall back), but malformed JSON always throws — silently swallowing a syntax error would
 * turn the layer gate into a no-op that reports every write as valid.
 */
function readJson(file, { required } = {}) {
  if (!fs.existsSync(file)) {
    if (required) throw new Error(`File not found: ${file}`);
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function resolveInRoot(root, maybePath) {
  if (!maybePath) return undefined;
  return path.isAbsolute(maybePath) ? maybePath : path.join(root, maybePath);
}

function inferLayer(filePath, config, root) {
  if (!filePath) return undefined;
  return layerForFile(root, filePath, config.layers);
}

async function loadArk() {
  const url = new URL('../dist/index.js', import.meta.url);
  if (!fs.existsSync(url)) {
    throw new Error(
      'ark-mcp requires the built library at dist/index.js. Run "npm run build" first.'
    );
  }
  try {
    return await import(url.href);
  } catch (err) {
    throw new Error(
      `ark-mcp failed to load dist/index.js (rebuild with "npm run build"): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const ark = await loadArk();

  const configPath = resolveInRoot(args.root, args.config);
  const config =
    (configPath ? readJson(configPath, { required: args.configExplicit }) : undefined) ?? {
      include: ['src'],
      layers: [],
      rules: [],
    };
  if (!config.layers || config.layers.length === 0) {
    process.stderr.write(
      '[ark-mcp] warning: no layers configured; layer-reference checks are disabled ' +
        '(only forbidden-pattern and intent-allowlist checks run).\n'
    );
  }

  const manifestPath = resolveInRoot(args.root, args.manifest);
  const projectManifest = manifestPath ? readJson(manifestPath, { required: true }) : undefined;

  const intents = Array.isArray(projectManifest?.intents)
    ? projectManifest.intents.map((i) => (typeof i === 'string' ? i : i?.name)).filter(Boolean)
    : [];

  // Build the enforcement profile from the PROJECT's config so validate_code uses the same
  // layer names and rules as ark-check (CI). Falling back to elevenLayerProfile only when
  // the project declares no layers keeps a sensible default contract.
  const profile =
    config.layers && config.layers.length > 0
      ? ark.createArchitectureProfile({
          name: 'project',
          layers: config.layers.map((layer) => ({
            name: layer.name,
            prefixes: layer.intentPrefixes ?? [],
          })),
          rules: config.rules ?? [],
        })
      : ark.elevenLayerProfile;

  const gate = ark.createAICodeGate({
    architectureProfile: profile,
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
    return JSON.stringify(
      {
        source: profile === ark.elevenLayerProfile ? 'elevenLayerProfile' : 'project',
        name: profile.name,
        layers: profile.layers,
        rules: profile.rules,
      },
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

    // Notifications carry no id and MUST never receive a response (JSON-RPC 2.0).
    // The only notification we care about is notifications/initialized (a no-op here).
    if (!('id' in msg)) return;

    switch (method) {
      case 'initialize':
        reply(id, {
          protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL,
          capabilities: { tools: {}, resources: {} },
          serverInfo: SERVER_INFO,
        });
        return;
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
        fail(id, -32601, `Method not found: ${method}`);
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
