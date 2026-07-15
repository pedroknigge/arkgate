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
 *                                 { valid, violations, autoPatch? } and sets isError when invalid.
 *                                 autoPatch (W1) is a gate-revalidated rewrite for mechanical-safe
 *                                 import-type kinds only (not W6 port-proof — signature change is judgment);
 *                                 discarded if post-patch still invalid.
 *   - tool      ark_prepare_write — W2: place + constrain + validate + autoPatch + judgmentBrief
 *                                 + contentHash (composes ark_place + write gate; not a second contract).
 *   - tool      ark_prepare_change — atomically preflights a create/update/delete batch without writes.
 *   - tool      ark_policy_delta — classifies a base/candidate ark.config.json transition and
 *                                 rejects weakening without an exact hash-bound acknowledgement.
 *   - tool      ark_recommend   — deterministic application-shape plan (same as
 *                                 ark-check --recommend --json)
 *
 * Usage: ark-mcp [--root <dir>] [--config ark.config.json] [--manifest <manifest.json>]
 *        ark-mcp --hook [--hook-repair] [--root <dir>] [--config ark.config.json]
 *
 * --hook runs one-shot instead of serving: it reads a Claude Code PreToolUse payload from
 * stdin, validates the file content a Write/Edit/MultiEdit is about to produce, and exits
 * 2 with the violations on stderr when the write must be blocked (0 otherwise). This is
 * the copy-paste integration for agent runtimes whose hooks run shell commands.
 *
 * --hook-repair (W4, also ARK_HOOK_REPAIR=1): on deny, emit machine-readable
 * ARK_REPAIR_JSON / ARK_AUTOPATCH_JSON on stderr (and autoPatch in Grok deny JSON).
 * Never silently writes the file — default and repair mode both hard-block.
 *
 * --session-context runs one-shot and prints a compact contract summary (layers, rule
 * count, forbidden globals, baseline state, check command) to stdout. Bind it to a
 * SessionStart hook so the agent has the architecture in context from the first token,
 * instead of learning it by rejection.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_RULES,
  arkCommand,
  globToRegExp,
  layerForFile,
  shouldShowNewHereNudge,
  detectWorkspaces,
  detectTsPackageRoots,
  resolveIncludeRoots,
} from './ark-shared.mjs';
import { createImportTargetResolver } from './lib/import-resolve.mjs';
import { validateWithAutoPatch, resolveImportFileAbs } from './lib/auto-patch.mjs';
import { composePrepareWrite } from './lib/prepare-write.mjs';
import { loadArkConfigContract } from './lib/config-contract.mjs';
import { ARK_ANALYSIS_RESULT_SCHEMA, createAdapterResult } from './lib/adapter-contract.mjs';
import { loadGoldenPattern, attachGoldenToPlacement } from './lib/golden-pattern.mjs';
import { prepareChangeFromRoot } from './lib/prepare-change.mjs';

const arkCheckBin = fileURLToPath(new URL('./ark-check.mjs', import.meta.url));

/**
 * W4 — opt-in hook repair payload.
 * True when CLI `--hook-repair` or env ARK_HOOK_REPAIR is 1/true/yes.
 * Default remains hard block with prose violations only (no machine-readable patch).
 */
function envTruthy(name) {
  const v = process.env[name];
  if (v == null || v === '') return false;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    config: 'ark.config.json',
    configExplicit: false,
    manifest: undefined,
    hook: false,
    /** When true with --hook: emit ARK_REPAIR_JSON / ARK_AUTOPATCH_JSON (never silent write). */
    hookRepair: false,
    sessionContext: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--hook') args.hook = true;
    else if (a === '--hook-repair') {
      args.hook = true;
      args.hookRepair = true;
    } else if (a === '--session-context') args.sessionContext = true;
    else if (a === '--root') args.root = path.resolve(argv[++i]);
    else if (a === '--config') {
      args.config = argv[++i];
      args.configExplicit = true;
    } else if (a === '--manifest') args.manifest = argv[++i];
  }
  // Env can enable repair without rewriting host templates (ARK_HOOK_REPAIR=1).
  if (envTruthy('ARK_HOOK_REPAIR')) {
    args.hookRepair = true;
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

function readArkConfig(file, { required } = {}) {
  const raw = readJson(file, { required });
  return raw === undefined ? undefined : loadArkConfigContract(raw, file).config;
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
 * Normalize agent PreToolUse payloads.
 * Claude Code: { tool_name, tool_input: { file_path, content | old_string/new_string } }
 * Grok Build:  { toolName, toolInput:  { file_path, content | old_string/new_string } }
 *              (aliases Write/Edit/MultiEdit → write/search_replace; matcher keeps both)
 */
function normalizeHookPayload(payload) {
  const rawName = payload?.tool_name ?? payload?.toolName ?? '';
  const toolInput = payload?.tool_input ?? payload?.toolInput ?? {};
  const nameMap = {
    Write: 'Write',
    write: 'Write',
    Edit: 'Edit',
    search_replace: 'Edit',
    MultiEdit: 'MultiEdit',
    ApplyPatch: 'ApplyPatch',
    apply_patch: 'ApplyPatch',
  };
  const toolName = nameMap[rawName] ?? rawName;
  const filePath =
    toolInput.file_path ?? toolInput.filePath ?? toolInput.path ?? toolInput.target_file;
  return {
    toolName,
    toolInput: { ...toolInput, file_path: filePath },
    // Grok-style camelCase (or GROK_HOOK_EVENT) → also emit deny JSON on stdout.
    grokStyle:
      Boolean(process.env.GROK_HOOK_EVENT) ||
      (payload != null && typeof payload === 'object' && 'toolName' in payload),
  };
}

function applyCodexUpdatePatch(current, lines) {
  let source = current.split('\n');
  let cursor = 0;
  const hunks = [];
  let hunk = [];
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (hunk.length > 0) hunks.push(hunk);
      hunk = [];
    } else if (/^[ +\-]/.test(line)) {
      hunk.push(line);
    }
  }
  if (hunk.length > 0) hunks.push(hunk);
  for (const entries of hunks) {
    const oldLines = entries.filter((line) => !line.startsWith('+')).map((line) => line.slice(1));
    const newLines = entries.filter((line) => !line.startsWith('-')).map((line) => line.slice(1));
    let found = -1;
    for (let at = cursor; at <= source.length - oldLines.length; at += 1) {
      if (oldLines.every((line, index) => source[at + index] === line)) {
        found = at;
        break;
      }
    }
    if (found < 0) return null;
    source.splice(found, oldLines.length, ...newLines);
    cursor = found + newLines.length;
  }
  return source.join('\n');
}

function codexPatchWrites(patch, root) {
  if (typeof patch !== 'string' || !patch.includes('*** Begin Patch')) return [];
  const lines = patch.split('\n');
  const writes = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (!match) continue;
    const [, action, relativePath] = match;
    const body = [];
    for (index += 1; index < lines.length && !lines[index].startsWith('*** '); index += 1) {
      body.push(lines[index]);
    }
    index -= 1;
    if (action === 'Delete') continue;
    const filePath = path.resolve(root, relativePath);
    let content;
    if (action === 'Add') {
      content = body.filter((line) => line.startsWith('+')).map((line) => line.slice(1)).join('\n');
      if (body.some((line) => line.startsWith('+'))) content += '\n';
    } else {
      let current;
      try {
        current = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }
      content = applyCodexUpdatePatch(current, body);
    }
    if (typeof content === 'string') writes.push({ filePath, content });
  }
  return writes;
}

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
 * One-shot PreToolUse gate (Claude Code + Grok Build hook contracts): payload on stdin,
 * exit 2 + violations on stderr to block, exit 0 to allow. Grok also receives a deny
 * decision JSON on stdout. Gate plumbing problems (no stdin, malformed JSON, non-file
 * tools, non-source files) never block the agent.
 */
function runHook(gate, config, args, ts) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return;
  }

  runHookPayload(payload, gate, config, args, ts);
}

function runHookPayload(payload, gate, config, args, ts) {
  const { toolName, toolInput, grokStyle } = normalizeHookPayload(payload);
  if (toolName === 'ApplyPatch') {
    const patch = toolInput.patch ?? toolInput.input ?? toolInput.content;
    for (const write of codexPatchWrites(patch, args.root)) {
      runHookPayload(
        {
          tool_name: 'Write',
          tool_input: { file_path: write.filePath, content: write.content },
        },
        gate,
        config,
        args,
        ts
      );
    }
    return;
  }
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
  const validateOnce = (src) => gate.validate(src, { layer, filePath });
  // W1: one validation pass (+ optional autoPatch). Original write still blocked when
  // invalid; hosts must apply autoPatch explicitly (never silent write).
  const result = ts
    ? validateWithAutoPatch({
        source,
        filePath,
        root: args.root,
        ts,
        validate: validateOnce,
        resolveTargetAbs: resolveImportFileAbs,
      })
    : (() => {
        const once = validateOnce(source);
        return {
          valid: Boolean(once.valid),
          violations: once.violations ?? [],
          autoPatch: null,
        };
      })();
  if (result.valid) return;

  // Ratchet semantics (same philosophy as ark-check --baseline): an edit is blocked only
  // when it ADDS violations relative to the file's current on-disk state. Otherwise a
  // pre-existing violation — frozen in a baseline or predating Ark adoption — would make
  // every subsequent edit to that file un-writable while CI passes. Same-file keys ignore
  // line numbers (edits shift them); simpler than full baselineKey (no file/layer fields
  // needed — this file is fixed).
  const violationKey = (violation) => `${violation.ruleId}|${violation.target ?? violation.message}`;
  let existingCounts = new Map();
  try {
    const current = fs.readFileSync(filePath, 'utf8');
    for (const violation of gate.validate(current, { layer, filePath }).violations) {
      const key = violationKey(violation);
      existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
    }
  } catch {
    // New file: nothing pre-exists, every violation is new.
  }
  const newViolations = (result.violations ?? []).filter((violation) => {
    const key = violationKey(violation);
    const remaining = existingCounts.get(key) ?? 0;
    if (remaining === 0) return true;
    existingCounts.set(key, remaining - 1);
    return false;
  });
  if (newViolations.length === 0) return;
  const normalizedRel = rel.split(path.sep).join('/');
  const adapterResult = createAdapterResult({
    valid: false,
    violations: newViolations.map((violation) => ({ ...violation, file: normalizedRel })),
  });

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
  const autoPatch = result.autoPatch;
  // W4: structured repair payload is opt-in (--hook-repair / ARK_HOOK_REPAIR).
  // Default remains hard block with prose only — hosts that cannot re-inject stay clean.
  const repair = Boolean(args.hookRepair);
  const message = [
    `Ark architecture gate blocked this write to ${rel}${layer ? ` (layer: ${layer})` : ''}:`,
    ...lines,
    ...(suggestions.length > 0 ? ['Fix:', ...suggestions.map((s) => `  ${s}`)] : []),
    ...(autoPatch && repair
      ? [
          `autoPatch available (${autoPatch.remediationKind}, confidence ${autoPatch.confidence}): ` +
            'apply the patched source from ARK_AUTOPATCH_JSON / ARK_REPAIR_JSON on stderr' +
            (grokStyle ? ' (or autoPatch in the deny JSON on stdout)' : '') +
            ' instead of re-drafting. Gate still denies this write (never silent apply).',
        ]
      : []),
    ...(autoPatch && !repair
      ? [
          `Mechanical-safe autoPatch is available (${autoPatch.remediationKind}). ` +
            'Enable repair payload with ARK_HOOK_REPAIR=1 or --hook-repair to receive ' +
            'machine-readable source (still hard-blocks; host re-injects).',
        ]
      : []),
    'Fix the violations and retry. The architecture contract is available as the ark://manifest MCP resource.',
  ].join('\n');
  process.stderr.write(message + '\n');

  if (repair) {
    // Structured envelope for any host that can re-inject. Never writes the file.
    const repairPayload = {
      ...adapterResult,
      mode: 'repair',
      decision: 'deny',
      filePath: normalizedRel,
      ...(layer ? { layer } : {}),
      ...(autoPatch
        ? {
            autoPatch: {
              source: autoPatch.source,
              remediationKind: autoPatch.remediationKind,
              confidence: autoPatch.confidence,
              valid: autoPatch.valid,
            },
          }
        : { autoPatch: null }),
    };
    process.stderr.write(`ARK_REPAIR_JSON:${JSON.stringify(repairPayload)}\n`);
    if (autoPatch) {
      process.stderr.write(`ARK_AUTOPATCH_JSON:${JSON.stringify(autoPatch)}\n`);
    }
  }

  // Grok Build honors { decision: "deny" } on stdout (exit 2 alone is also deny).
  // autoPatch in stdout only when repair mode is on (same opt-in as stderr).
  if (grokStyle) {
    process.stdout.write(
      JSON.stringify({
        decision: 'deny',
        reason: message,
        analysis: adapterResult,
        ...(repair && autoPatch ? { autoPatch } : {}),
        ...(repair ? { repair: true } : {}),
      }) + '\n'
    );
  }
  process.exitCode = 2;
}

function runArkCheckJsonFromRoot(root, config, extraArgs, manifest) {
  const manifestArgs = manifest ? ['--manifest', manifest] : [];
  const result = spawnSync(
    process.execPath,
    [arkCheckBin, '--root', root, '--config', config, ...manifestArgs, '--json', ...extraArgs],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 }
  );
  if (result.error) {
    return {
      data: null,
      raw: `ark-check failed to execute: ${result.error.message}`,
    };
  }
  const stdout = result.stdout ?? '';
  try {
    return { data: JSON.parse(stdout), raw: stdout };
  } catch {
    return { data: null, raw: stdout || result.stderr || 'ark-check produced no output' };
  }
}

/**
 * One-shot SessionStart context: a compact summary of the contract on stdout so the
 * agent starts the session already knowing the architecture. Advisory — never blocks
 * and never exits non-zero for missing optional inputs (e.g. no baseline file).
 */
function printSessionContext(config, profile, forbiddenGlobals, args, configPath) {
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

  lines.push(
    `After edits run: ${arkCommand(args.root, 'ark-check', '--root . --config ark.config.json --strict-config')}`
  );
  lines.push('If Ark reports violations, fix the architecture instead of weakening the gate.');

  const { data: coverage } = runArkCheckJsonFromRoot(args.root, args.config, ['--coverage'], undefined);
  const governedPercent = coverage?.coverage?.governed?.percent ?? coverage?.governed?.percent;
  if (shouldShowNewHereNudge(args.root, configPath, governedPercent, false)) {
    lines.push('');
    lines.push('New to Ark? Run /ark-architect or: ark-check --recommend');
  }

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
    (configPath ? readArkConfig(configPath, { required: args.configExplicit }) : undefined) ??
    loadArkConfigContract(
      { include: ['src'], layers: [], rules: DEFAULT_RULES },
      configPath ?? 'ark.config.json'
    ).config;
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
    // Contract-first: one resolve step yields layer + relPath for rules + peerIsolation.
    resolveImportTarget: createImportTargetResolver(ts, args.root, config),
    architectureLayers: configLayers.map((layer) => ({
      name: layer.name,
      patterns: layer.patterns,
    })),
    allowNonLiteralDynamicImport: (filePath) => {
      if (!filePath || !Array.isArray(config.dynamicImportAllowlist)) return false;
      const rel = path.relative(args.root, path.resolve(args.root, filePath)).split(path.sep).join('/');
      return config.dynamicImportAllowlist.some((pattern) => {
        if (typeof pattern !== 'string') return false;
        try {
          return globToRegExp(pattern).test(rel);
        } catch {
          return false;
        }
      });
    },
  });

  if (args.hook) {
    runHook(gate, config, args, ts);
    return;
  }

  if (args.sessionContext) {
    printSessionContext(config, profile, forbiddenGlobals, args, configPath);
    return;
  }

  const SERVER_INFO = { name: 'arkgate', version: ark.version };
  const DEFAULT_PROTOCOL = '2024-11-05';

  const TOOLS = [
    {
      name: 'validate_code',
      description:
        "Validate a source snippet about to be written against Ark's architecture " +
        '(forbidden infra imports, unknown intents, and layer-reference violations). ' +
        'Bind to PreToolUse on Write/Edit to block architecturally-invalid generated code. ' +
        'Returns { valid, violations, autoPatch? }. autoPatch (when present) is a ' +
        'mechanical-safe rewrite of the source (import type conversion) that re-validates green; ' +
        'hosts may apply it instead of re-drafting. isError is true when valid is false.',
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
      outputSchema: ARK_ANALYSIS_RESULT_SCHEMA,
    },
    {
      name: 'ark_check',
      description:
        'Run the full Ark architecture check on the project and return structured results ' +
        '(layer-import violations, forbidden globals, circular deps, config warnings). Use ' +
        'this to answer "is the architecture currently valid?" instead of shelling out to ' +
        'ark-check. Applies the baseline automatically when one exists. isError when not ok.',
      inputSchema: {
        type: 'object',
        properties: {
          strict: {
            type: 'boolean',
            description: 'Fail on config warnings too (--strict-config). Default true.',
          },
          baseline: {
            type: 'boolean',
            description:
              'Suppress pre-frozen violations via .ark-baseline.json. Default: auto (on when the file exists).',
          },
        },
      },
      outputSchema: ARK_ANALYSIS_RESULT_SCHEMA,
    },
    {
      name: 'ark_policy_delta',
      description:
        'Classify a complete ark.config.json transition as strengthening, neutral, ' +
        'judgment-required, or weakening. Pass the previous baseConfig and optional ' +
        'candidateConfig (defaults to this project contract). Weakening and judgment-required ' +
        'results set isError unless acknowledgement exactly matches both policy hashes and all ' +
        'blocking finding ids. Read-only; never edits the contract.',
      inputSchema: {
        type: 'object',
        properties: {
          baseConfig: {
            type: 'object',
            description: 'Previous complete ark.config.json object.',
          },
          candidateConfig: {
            type: 'object',
            description: 'Candidate complete config; defaults to the current project contract.',
          },
          acknowledgement: {
            type: 'object',
            description:
              'Optional schemaVersion/basePolicyHash/candidatePolicyHash/findingIds/reason object.',
          },
        },
        required: ['baseConfig'],
      },
    },
    {
      name: 'ark_coverage',
      description:
        'Report what each layer actually governs: per-layer file counts, the FULL list of ' +
        'unclassified (ungoverned) files, layers whose patterns match nothing, and layers ' +
        'with no rule edge. Use this to audit config coverage instead of hand-rolling ' +
        'find/readdir. Report only — never an error.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'ark_place',
      description:
        'Place a file in the architecture: pass filePath (preferred) and/or description. ' +
        'Returns layer, mayImport / mustNotImport, forbiddenGlobals, and optional goldenPattern ' +
        '(advisory for NEW code when .ark/golden-pattern.json exists — never clears design-weak). ' +
        'Call BEFORE writing a new file. ' +
        'If only description is given, returns a conventional path proposal under a governed layer. ' +
        'Prefer ark_prepare_write when you already have the source snippet (place+validate+autoPatch in one call).',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path (relative to project root or absolute) of the file to place.',
          },
          description: {
            type: 'string',
            description:
              'What you are building (e.g. "Remotion caption overlay"). Used when filePath is omitted to propose a path.',
          },
        },
      },
    },
    {
      name: 'ark_prepare_write',
      description:
        'Prepare a write against the architecture contract: place (filePath and/or description) + ' +
        'constrain (layer, mayImport, mustNotImport, forbiddenGlobals) + validate source + optional ' +
        'mechanical-safe autoPatch + judgmentBrief when judgment is needed + contentHash for host commit. ' +
        'Composes ark_place + write-gate — call BEFORE Write/Edit when you have the snippet. ' +
        'Returns { filePath, layer, valid, violations?, autoPatch?, judgmentBrief?, contentHash, ... }.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Full source text about to be written.' },
          filePath: {
            type: 'string',
            description: 'Target path (preferred). Used for layer inference and autoPatch resolution.',
          },
          description: {
            type: 'string',
            description: 'When filePath omitted: propose a conventional path from this description.',
          },
          layer: {
            type: 'string',
            description: 'Optional explicit layer override (otherwise inferred from filePath).',
          },
        },
        required: ['source'],
      },
    },
    {
      name: 'ark_prepare_change',
      description:
        'Validate one complete governed-source create/update/delete batch as an atomic in-memory candidate. ' +
        'Catches cross-file forbidden edges and cycles before any host write, and returns ' +
        'per-file content hashes plus base/candidate tree and policy hashes. Never writes files.',
      inputSchema: {
        type: 'object',
        properties: {
          changes: {
            type: 'array',
            description:
              'Full candidate batch. Each item is {path, content} for create/update or {path, delete:true}.',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
                delete: { type: 'boolean' },
              },
              required: ['path'],
            },
          },
        },
        required: ['changes'],
      },
    },
    {
      name: 'ark_recommend',
      description:
        'Score this repository against templates/architecture-playbook.json and return the ' +
        'tool-agnostic application shape to adopt (archetype, preset, phased layer plan, ' +
        'analogy, anti-patterns). Same structured output as ark-check --recommend --json. ' +
        'Call BEFORE generating project structure on greenfield or early-adoption repos.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'ark_suggest_include',
      description:
        'Propose ark.config.json include roots from workspaces and nested TypeScript packages ' +
        '(polyglot-safe). Same idea as ark-check --suggest-include. Use when coverage is empty ' +
        'or the contract misses package roots.',
      inputSchema: { type: 'object', properties: {} },
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
    const activeNames = new Set([
      ...configLayers.map((layer) => layer.name),
      ...profile.layers.map((layer) => layer.name),
    ]);
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
    const contractLayers = usedProjectConfig
      ? configLayers.map((layer) => ({
          ...layer,
          prefixes: Array.isArray(layer.intentPrefixes) ? layer.intentPrefixes : [],
        }))
      : profile.layers;
    return JSON.stringify(
      {
        source: profile === ark.elevenLayerProfile ? 'strictDefaultElevenLayerProfile' : 'project',
        name: profile.name,
        // File placement contract: every configured layer, including layers that do not
        // own intent prefixes (e.g. Tooling / FrameworkAdapters).
        layers: contractLayers,
        // Runtime/intent resolution profile kept explicit so consumers never have to infer
        // why a prefix-less file layer is absent from intent resolution.
        intentLayers: profile.layers,
        rules: profile.rules,
        ...(Object.keys(forbiddenGlobals).length > 0 ? { forbiddenGlobals } : {}),
        ...(Array.isArray(config.dynamicImportAllowlist)
          ? { dynamicImportAllowlist: config.dynamicImportAllowlist }
          : {}),
        ...(config.safety && typeof config.safety === 'object'
          ? { safety: config.safety }
          : {}),
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
    const filePath = params.arguments.filePath;
    const layer = params.arguments.layer ?? inferLayer(filePath, config, args.root);
    const validateOnce = (src) =>
      gate.validate(src, {
        layer,
        filePath,
      });
    // W1: attempt mechanical-safe single-file autoPatch (import type), re-validate or discard.
    const result = validateWithAutoPatch({
      source,
      filePath,
      root: args.root,
      ts,
      validate: validateOnce,
      resolveTargetAbs: resolveImportFileAbs,
    });
    const adapterResult = createAdapterResult({
      valid: result.valid,
      violations: result.violations,
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...adapterResult,
              valid: result.valid,
              violations: result.violations,
              ...(result.autoPatch ? { autoPatch: result.autoPatch } : {}),
              layer,
            },
            null,
            2
          ),
        },
      ],
      structuredContent: adapterResult,
      isError: !result.valid,
    };
  }

  // ark_check / ark_coverage reuse the canonical CLI engine (TS resolver, baseline,
  // Tarjan cycle detection) by shelling out to the sibling ark-check.mjs with --json —
  // no second copy of the check logic to drift. These are occasional agent queries, not
  // a hot path, so the per-call spawn cost is irrelevant.
  function runArkCheckJson(extraArgs) {
    return runArkCheckJsonFromRoot(args.root, args.config, extraArgs, args.manifest);
  }

  function runCheckTool(params) {
    const strict = params?.arguments?.strict !== false; // default true
    const baselineArg = params?.arguments?.baseline;
    const baselineExists = fs.existsSync(path.join(args.root, '.ark-baseline.json'));
    const useBaseline = baselineArg === undefined ? baselineExists : Boolean(baselineArg);
    const extra = [];
    if (strict) extra.push('--strict-config');
    if (useBaseline) extra.push('--baseline');
    const { data, raw } = runArkCheckJson(extra);
    if (!data) {
      return { content: [{ type: 'text', text: `ark-check produced no JSON:\n${raw}` }], isError: true };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: {
        schemaVersion: data.schemaVersion,
        valid: data.valid,
        diagnostics: data.diagnostics,
      },
      isError: data.ok === false,
    };
  }

  function runCoverageTool() {
    const { data, raw } = runArkCheckJson(['--coverage']);
    if (!data) {
      return {
        content: [{ type: 'text', text: `ark-check --coverage produced no JSON:\n${raw}` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: false };
  }

  function runPolicyDeltaTool(params) {
    const baseConfig = params?.arguments?.baseConfig;
    if (!baseConfig || typeof baseConfig !== 'object' || Array.isArray(baseConfig)) {
      return {
        content: [{ type: 'text', text: 'ark_policy_delta requires baseConfig (object).' }],
        isError: true,
      };
    }
    try {
      const result = ark.analyzePolicyDelta({
        baseConfig,
        candidateConfig: params?.arguments?.candidateConfig ?? config,
        acknowledgement: params?.arguments?.acknowledgement,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: !result.valid,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  }

  function runRecommendTool() {
    const { data, raw } = runArkCheckJson(['--recommend']);
    if (!data) {
      return {
        content: [{ type: 'text', text: `ark-check --recommend produced no JSON:\n${raw}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      isError: data.ok === false,
    };
  }

  // Deterministic placement guidance (in-process; no TS resolver needed): which layer a
  // path falls in, and — from the same rules ark-check enforces (default allow, explicit
  // `allowed:false` denies) — which layers it may and must not import.
  // Q03: when present, attach optional `.ark/golden-pattern.json` (advisory for NEW code only).
  function placeResult(filePath, description) {
    const golden = loadGoldenPattern(args.root);
    const withGolden = (placement) => attachGoldenToPlacement(placement, golden);

    if ((typeof filePath !== 'string' || !filePath) && typeof description === 'string' && description.trim()) {
      const slug = description
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'component';
      const proposedPath = `src/components/${slug}.tsx`;
      const layerName = inferLayer(proposedPath, config, args.root) || 'PresentationAdapters';
      return withGolden({
        filePath: proposedPath,
        proposed: true,
        description: description.trim(),
        layer: layerName,
        governed: Boolean(inferLayer(proposedPath, config, args.root)),
        note:
          'filePath was omitted — proposed a conventional path from description. ' +
          'Pass filePath explicitly for authoritative placement.',
      });
    }
    if (typeof filePath !== 'string' || !filePath) {
      return {
        error:
          'Needs filePath and/or description. ' +
          'Example: { "filePath": "src/components/Foo.tsx" } or { "description": "caption overlay UI component" }.',
      };
    }
    const layerName = inferLayer(filePath, config, args.root);
    if (!layerName) {
      const noLayers = configLayers.length === 0;
      return withGolden({
        filePath,
        layer: null,
        governed: noLayers,
        message: noLayers
          ? 'This project declares no path-based layers in ark.config.json, so a ' +
            'layer cannot be inferred from the path. The gate still enforces the ' +
            'default 11-layer profile by intent-name prefix — read ark://manifest ' +
            'for the layers and validate the actual snippet with validate_code.'
          : 'No layer pattern matches this path — code here is UNGOVERNED (no import ' +
            'rules enforced). Place it under a directory a layer in ark.config.json ' +
            'matches, or add a layer. See suggestedLayers for conventional homes.',
        suggestedLayers: suggestedLayers(),
      });
    }
    const layerMeta = configLayers.find((layer) => layer.name === layerName);
    const rules = config.rules ?? DEFAULT_RULES;
    const otherNames = configLayers.map((layer) => layer.name).filter((name) => name !== layerName);
    const mustNotImport = otherNames.filter((to) =>
      rules.some((rule) => !rule.allowed && rule.from === layerName && rule.to === to)
    );
    const mayImport = otherNames.filter((name) => !mustNotImport.includes(name));
    return withGolden({
      filePath,
      layer: layerName,
      governed: true,
      description: layerMeta?.description,
      forbiddenGlobals: layerMeta?.forbiddenGlobals ?? [],
      ...(layerMeta?.mayImportInfrastructure ? { mayImportInfrastructure: true } : {}),
      mayImport,
      mustNotImport,
      note:
        'mayImport = layers with no explicit deny (default is allow). Respect ' +
        'forbiddenGlobals, then verify the actual snippet with validate_code or ark_prepare_write.',
    });
  }

  function runPlace(params) {
    const placement = placeResult(params?.arguments?.filePath, params?.arguments?.description);
    if (placement.error) {
      return {
        content: [{ type: 'text', text: `ark_place: ${placement.error}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(placement, null, 2) }],
      isError: false,
    };
  }

  /**
   * W2: place + constrain + validate + autoPatch + judgmentBrief + contentHash.
   * Composes ark_place + write-boundary gate — not a second contract.
   */
  function runPrepareWrite(params) {
    const source = params?.arguments?.source;
    const filePath = params?.arguments?.filePath;
    const description = params?.arguments?.description;
    if (typeof source !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: 'ark_prepare_write requires "source" (string). Optional: filePath, description.',
          },
        ],
        isError: true,
      };
    }
    const placement = placeResult(filePath, description);
    if (placement.error) {
      return {
        content: [{ type: 'text', text: `ark_prepare_write: ${placement.error}` }],
        isError: true,
      };
    }
    const layer =
      placement.layer ||
      params?.arguments?.layer ||
      inferLayer(placement.filePath, config, args.root);
    const validateOnce = (src) =>
      gate.validate(src, {
        layer,
        filePath: placement.filePath,
      });
    const result = composePrepareWrite({
      source,
      placement: { ...placement, layer },
      root: args.root,
      ts,
      validate: validateOnce,
      resolveTargetAbs: resolveImportFileAbs,
    });
    if (!result.ok) {
      return {
        content: [{ type: 'text', text: result.error || 'prepare_write failed' }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      // Align with validate_code / --hook: proposed source still invalid → isError.
      // autoPatch is additive recovery guidance in the body, never soft-success.
      isError: !result.valid,
    };
  }

  function runPrepareChange(params) {
    try {
      const result = prepareChangeFromRoot({
        root: args.root,
        config,
        configSource: configPath,
        changes: params?.arguments?.changes,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: !result.valid,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  }

  function runSuggestIncludeTool() {
    try {
      const workspaces = detectWorkspaces(args.root);
      const tsPackages = detectTsPackageRoots(args.root);
      const suggestedInclude = resolveIncludeRoots(args.root);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ok: true,
                workspaces,
                tsPackages,
                suggestedInclude:
                  suggestedInclude.length > 0
                    ? suggestedInclude
                    : tsPackages.length > 0
                      ? tsPackages
                      : ['src'],
                next: 'npx ark-check --adopt-contract --write',
              },
              null,
              2
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  }

  const TOOL_HANDLERS = {
    validate_code: runValidate,
    ark_check: runCheckTool,
    ark_policy_delta: runPolicyDeltaTool,
    ark_coverage: runCoverageTool,
    ark_place: runPlace,
    ark_prepare_write: runPrepareWrite,
    ark_prepare_change: runPrepareChange,
    ark_recommend: runRecommendTool,
    ark_suggest_include: runSuggestIncludeTool,
  };

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
      case 'tools/call': {
        const handler = TOOL_HANDLERS[params?.name];
        if (!handler) {
          fail(id, -32602, `Unknown tool: ${params?.name}`);
          return;
        }
        reply(id, handler(params));
        return;
      }
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
