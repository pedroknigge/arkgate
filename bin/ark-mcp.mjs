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
 *        ark-mcp --hook [--root <dir>] [--config ark.config.json]
 *
 * --hook runs one-shot instead of serving: it reads a Claude Code PreToolUse payload from
 * stdin, validates the file content a Write/Edit/MultiEdit is about to produce, and exits
 * 2 with the violations on stderr when the write must be blocked (0 otherwise). This is
 * the copy-paste integration for agent runtimes whose hooks run shell commands.
 *
 * --session-context runs one-shot and prints a compact contract summary (layers, rule
 * count, forbidden globals, baseline state, check command) to stdout. Bind it to a
 * SessionStart hook so the agent has the architecture in context from the first token,
 * instead of learning it by rejection.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_RULES,
  layerForFile,
} from './ark-shared.mjs';

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    config: 'ark.config.json',
    configExplicit: false,
    manifest: undefined,
    hook: false,
    sessionContext: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--hook') args.hook = true;
    else if (a === '--session-context') args.sessionContext = true;
    else if (a === '--root') args.root = path.resolve(argv[++i]);
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

async function loadOptionalTypeScript() {
  try {
    return await import('typescript');
  } catch {
    return undefined;
  }
}

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/**
 * Compute the file content a Write/Edit/MultiEdit is about to produce. Edits are applied
 * to the CURRENT on-disk file so the gate judges the real post-edit state, not the edit
 * snippet out of context. Replacement uses a function argument so `$&`-style sequences in
 * generated code are inserted literally, never interpreted as replacement patterns.
 */
function proposedSource(toolName, toolInput) {
  if (toolName === 'Write') return toolInput.content;

  let text = '';
  try {
    text = fs.readFileSync(toolInput.file_path, 'utf8');
  } catch {
    // New file created via Edit: fall through with an empty base.
  }
  const edits = toolName === 'MultiEdit' ? toolInput.edits ?? [] : [toolInput];
  for (const edit of edits) {
    const from = edit.old_string ?? '';
    const to = edit.new_string ?? '';
    if (from === '') {
      text = to;
    } else if (edit.replace_all) {
      text = text.split(from).join(to);
    } else {
      text = text.replace(from, () => to);
    }
  }
  return text;
}

/**
 * One-shot PreToolUse gate (Claude Code hook contract): payload on stdin, exit 2 +
 * violations on stderr to block, exit 0 to allow. Gate plumbing problems (no stdin,
 * malformed JSON, non-file tools, non-source files) never block the agent.
 */
function runHook(gate, config, args) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return;
  }

  const toolName = payload?.tool_name;
  const toolInput = payload?.tool_input ?? {};
  const filePath = toolInput.file_path;
  if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) return;
  if (typeof filePath !== 'string' || !SOURCE_FILE.test(filePath) || filePath.endsWith('.d.ts')) {
    return;
  }
  const rel = path.relative(args.root, path.resolve(filePath));
  const segments = rel.split(path.sep);
  if (segments[0] === '..' || segments.includes('node_modules')) return;

  const source = proposedSource(toolName, toolInput);
  if (typeof source !== 'string') return;

  const layer = inferLayer(filePath, config, args.root);
  const result = gate.validate(source, { layer, filePath });
  if (result.valid) return;

  // Ratchet semantics (same philosophy as ark-check --baseline): an edit is blocked only
  // when it ADDS violations relative to the file's current on-disk state. Otherwise a
  // pre-existing violation — frozen in a baseline or predating Ark adoption — would make
  // every subsequent edit to that file un-writable while CI passes. Keys ignore line
  // numbers (edits shift them) and collapse duplicates, mirroring ark-check's baselineKey.
  const violationKey = (violation) => `${violation.ruleId}|${violation.target ?? violation.message}`;
  let existingKeys = new Set();
  try {
    const current = fs.readFileSync(filePath, 'utf8');
    existingKeys = new Set(
      gate.validate(current, { layer, filePath }).violations.map(violationKey)
    );
  } catch {
    // New file: nothing pre-exists, every violation is new.
  }
  const newViolations = result.violations.filter(
    (violation) => !existingKeys.has(violationKey(violation))
  );
  if (newViolations.length === 0) return;

  const lines = newViolations.map(
    (violation) =>
      `- [${violation.ruleId}] ${violation.message}${violation.line ? ` (line ${violation.line})` : ''}`
  );
  // Surface the per-violation fix hints (the gate carries them in `suggestion`,
  // but the hook was dropping them). Dedupe so two infra violations sharing one
  // hint — e.g. the mayImportInfrastructure escape hatch — print it once.
  const suggestions = [
    ...new Set(newViolations.map((violation) => violation.suggestion).filter(Boolean)),
  ];
  process.stderr.write(
    [
      `Ark architecture gate blocked this write to ${rel}${layer ? ` (layer: ${layer})` : ''}:`,
      ...lines,
      ...(suggestions.length > 0 ? ['fix:', ...suggestions.map((s) => `  ${s}`)] : []),
      'Fix the violations and retry. The architecture contract is available as the ark://manifest MCP resource.',
    ].join('\n') + '\n'
  );
  process.exitCode = 2;
}

/**
 * One-shot SessionStart context: a compact summary of the contract on stdout so the
 * agent starts the session already knowing the architecture. Advisory — never blocks
 * and never exits non-zero for missing optional inputs (e.g. no baseline file).
 */
function printSessionContext(config, profile, forbiddenGlobals, args) {
  const lines = ['Ark architecture contract governs this project (ark.config.json is authoritative).'];

  const configLayers = Array.isArray(config.layers) ? config.layers : [];
  if (configLayers.length > 0) {
    lines.push('Layers:');
    for (const layer of configLayers) {
      const globals = forbiddenGlobals[layer.name];
      const globalsNote = globals ? ` — forbidden globals: ${globals.join(', ')}` : '';
      lines.push(`  - ${layer.name}: ${(layer.patterns ?? []).join(', ')}${globalsNote}`);
    }
  } else {
    lines.push(
      `Layers: none configured — the default 11-layer profile applies to intent references.`
    );
  }

  const denied = (profile.rules ?? []).filter((rule) => !rule.allowed).length;
  lines.push(
    `Rules: ${denied} denied layer edge(s). Full contract: ark://manifest MCP resource.`
  );

  // Advisory output: a malformed baseline must not abort the summary.
  let baseline;
  try {
    baseline = readJson(path.join(args.root, '.ark-baseline.json'));
  } catch {
    baseline = undefined;
  }
  if (Array.isArray(baseline?.violations)) {
    lines.push(
      `Baseline: ${baseline.violations.length} frozen violation(s) — only NEW violations fail; do not add to them.`
    );
  }

  lines.push('After edits run: npx ark-check --root . --config ark.config.json --strict-config');
  lines.push('If Ark reports violations, fix the architecture instead of weakening the gate.');
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main() {
  const args = parseArgs(process.argv);
  const configPath = resolveInRoot(args.root, args.config);

  // SessionStart contract injection is only meaningful in Ark-governed projects. Bail
  // out silently (before loading dist) when there is no config, so the hook is safe
  // even if a user installs it in their GLOBAL settings instead of per-project.
  if (args.sessionContext && !(configPath && fs.existsSync(configPath))) {
    return;
  }

  const ark = await loadArk();
  const ts = await loadOptionalTypeScript();

  const config =
    (configPath ? readJson(configPath, { required: args.configExplicit }) : undefined) ?? {
      include: ['src'],
      layers: [],
      rules: [],
    };
  if (!config.layers || config.layers.length === 0) {
    process.stderr.write(
      '[ark-mcp] warning: no layers configured — file→layer inference from config patterns ' +
        'is unavailable, so layer-reference checks run only when the caller passes an explicit ' +
        '"layer" (checked against the default 11-layer profile).\n'
    );
  }

  const manifestPath = resolveInRoot(args.root, args.manifest);
  const projectManifest = manifestPath ? readJson(manifestPath, { required: true }) : undefined;

  const intents = Array.isArray(projectManifest?.intents)
    ? projectManifest.intents.map((i) => (typeof i === 'string' ? i : i?.name)).filter(Boolean)
    : [];

  // Build the enforcement profile with the SAME semantics ark-check (CI) applies to the
  // config, so the write-path gate and CI can't disagree:
  //   - rules: config.rules ?? DEFAULT_RULES  (ark-check readConfig substitutes DEFAULT_RULES)
  //   - intent prefixes: the config layers that declare intentPrefixes; when none do, fall
  //     back to DEFAULT_INTENT_PREFIXES (mirrors ark-check's layerForIntent fallback).
  // Only layers WITH prefixes enter the profile, so no layer has empty prefixes (which would
  // also make it unresolvable). A project with no layers at all gets the 11-layer default.
  const configLayers = Array.isArray(config.layers) ? config.layers : [];
  const manifestLayers = Array.isArray(projectManifest?.architecture?.layers)
    ? projectManifest.architecture.layers
    : [];
  const usedProjectConfig = configLayers.length > 0;
  let profile;
  if (manifestLayers.length > 0) {
    profile = ark.createArchitectureProfile({
      name: projectManifest.architecture.profile ?? 'manifest',
      layers: manifestLayers.map((layer) => ({
        name: layer.name,
        prefixes: layer.prefixes,
      })),
      rules: projectManifest.architecture.rules ?? DEFAULT_RULES,
    });
  } else if (!usedProjectConfig) {
    profile = ark.elevenLayerProfile;
  } else {
    const layersWithPrefixes = configLayers.filter(
      (layer) => (layer.intentPrefixes ?? []).length > 0
    );
    const profileLayers =
      layersWithPrefixes.length > 0
        ? layersWithPrefixes.map((layer) => ({ name: layer.name, prefixes: layer.intentPrefixes }))
        : DEFAULT_INTENT_PREFIXES.map((d) => ({ name: d.layer, prefixes: d.prefixes }));
    profile = ark.createArchitectureProfile({
      name: 'ark.config',
      layers: profileLayers,
      rules: config.rules ?? DEFAULT_RULES,
    });
  }

  // Layer → forbidden ambient globals, straight from ark.config.json. Enforced by the
  // gate only when the target file's layer is known (same data ark-check enforces in CI).
  const forbiddenGlobals = Object.fromEntries(
    configLayers
      .filter(
        (layer) =>
          layer.name &&
          Array.isArray(layer.forbiddenGlobals) &&
          layer.forbiddenGlobals.some((entry) => typeof entry === 'string')
      )
      .map((layer) => [
        layer.name,
        layer.forbiddenGlobals.filter((entry) => typeof entry === 'string'),
      ])
  );

  // Layers explicitly flagged as infrastructure in ark.config.json may import
  // infrastructure — the built-in infra-import heuristics skip them (in addition
  // to layers whose name conventionally signals an infra role). Lets a project
  // with an unconventionally-named infra layer opt in without renaming.
  const infrastructureLayers = configLayers
    .filter((layer) => layer.name && layer.mayImportInfrastructure === true)
    .map((layer) => layer.name);

  const gate = ark.createAICodeGate({
    architectureProfile: profile,
    intents,
    enforceIntentAllowlist: intents.length > 0,
    typescript: ts,
    forbiddenGlobals,
    infrastructureLayers,
  });

  if (args.hook) {
    runHook(gate, config, args);
    return;
  }

  if (args.sessionContext) {
    printSessionContext(config, profile, forbiddenGlobals, args);
    return;
  }

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

  // Layers from the 11-layer profile that this project has NOT declared, with their
  // conventional directories: tells the agent where a new kind of code (a saga, a job,
  // a read model, ...) belongs BEFORE it improvises a location the gate can't govern.
  // A default layer is dropped when the project already claims any of its intent
  // prefixes under another name (e.g. a `core` layer owning `Domain.`) — suggesting
  // DomainModel there would tell the agent to create a second layer for the same
  // prefix, making longest-prefix resolution ambiguous.
  function suggestedLayers() {
    const activeNames = new Set(profile.layers.map((layer) => layer.name));
    const claimedPrefixes = new Set(
      profile.layers.flatMap((layer) =>
        (layer.prefixes ?? []).map((p) => (p.endsWith('.') ? p : `${p}.`))
      )
    );
    return DEFAULT_INTENT_PREFIXES.filter(
      (entry) =>
        !activeNames.has(entry.layer) &&
        !entry.prefixes.some((p) => claimedPrefixes.has(p.endsWith('.') ? p : `${p}.`))
    ).map((entry) => ({
      layer: entry.layer,
      intentPrefixes: entry.prefixes,
      conventionalDirectories: DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? [],
    }));
  }

  function manifestText() {
    if (projectManifest) {
      return JSON.stringify(
        { ...projectManifest, source: projectManifest.source ?? 'manifest' },
        null,
        2
      );
    }
    const suggestions = suggestedLayers();
    return JSON.stringify(
      {
        source: profile === ark.elevenLayerProfile ? 'strictDefaultElevenLayerProfile' : 'project',
        name: profile.name,
        layers: profile.layers,
        rules: profile.rules,
        ...(Object.keys(forbiddenGlobals).length > 0 ? { forbiddenGlobals } : {}),
        ...(suggestions.length > 0
          ? {
              suggestedLayers: suggestions,
              suggestedLayersNote:
                'Layers from the default 11-layer profile this project has not declared. ' +
                'When creating a NEW kind of code that fits one of these, place it in a ' +
                'conventional directory and add the layer to ark.config.json instead of ' +
                'inventing an ungoverned location.',
            }
          : {}),
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
