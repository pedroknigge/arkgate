#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_RULES,
  collectForbiddenGlobalUses,
  createElevenLayerConfig,
  globToRegExp,
  layerForFile,
  looksLikeIntent,
  resolveIntentLayer,
} from './ark-shared.mjs';

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    config: 'ark.config.json',
    manifest: undefined,
    printConfig: undefined,
    tsconfig: undefined,
    json: false,
    strictConfig: false,
    requireGates: false,
    init: false,
    installAgentGates: false,
    tools: undefined,
    force: false,
    skillsOnly: false,
    baseline: undefined,
    updateBaseline: false,
    noCache: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--strict-config') args.strictConfig = true;
    else if (arg === '--require-gates') args.requireGates = true;
    else if (arg === '--init') args.init = true;
    else if (arg === '--preset') args.preset = argv[++i];
    else if (arg === '--install-agent-gates') args.installAgentGates = true;
    else if (arg === '--tools') {
      // Consume the next arg only when it isn't another flag (same rule as --baseline),
      // so `--tools --force` can't silently eat --force as a "tool name".
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        i += 1;
        args.tools = next
          .split(',')
          .map((tool) => tool.trim().toLowerCase())
          .filter(Boolean);
      } else {
        args.tools = []; // flag without a value — rejected in runInstallAgentGates
      }
    }
    else if (arg === '--force') args.force = true;
    else if (arg === '--skills-only') args.skillsOnly = true;
    else if (arg === '--no-cache') args.noCache = true;
    else if (arg === '--report') {
      const next = argv[i + 1];
      args.report = next && !next.startsWith('-') ? argv[++i] : 'ark-report.html';
    }
    else if (arg === '--baseline' || arg === '--update-baseline') {
      if (arg === '--update-baseline') args.updateBaseline = true;
      // optional path value: consume the next arg only when it isn't another flag
      const next = argv[i + 1];
      args.baseline = next && !next.startsWith('-') ? argv[++i] : '.ark-baseline.json';
    }
    else if (arg === '--root') args.root = path.resolve(argv[++i]);
    else if (arg === '--config') args.config = argv[++i];
    else if (arg === '--manifest') args.manifest = argv[++i];
    else if (arg === '--print-config') args.printConfig = argv[++i];
    else if (arg === '--tsconfig') args.tsconfig = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function usage() {
  return [
    'Usage: ark-check --root <project> --config <ark.config.json> [--manifest <ark.manifest.json>] [--tsconfig <tsconfig.json>] [--strict-config] [--require-gates] [--json] [--baseline [file]] [--report [file.html]] [--no-cache]',
    '       ark-check --init [--preset hexagonal|layered|feature-sliced] [--force]',
    '       ark-check --install-agent-gates [--tools claude,cursor,codex] [--skills-only] [--force]',
    '       ark-check --update-baseline [file]     freeze current violations (default .ark-baseline.json)',
    '       ark-check --print-config eleven-layer',
    '',
    'Adopting Ark in an existing codebase? Run --update-baseline once to freeze existing',
    'violations, commit the baseline file, and gate CI with --baseline: only NEW violations',
    'fail the check, so the ratchet only moves toward zero.',
    '',
    '--init scans the project for the built-in layer directory conventions (src/domain,',
    'src/application, src/adapters/persistence, ...) and writes an ark.config.json covering',
    'only the layers that actually exist, with the default rules filtered to those layers.',
    'Undetected profile layers are printed as suggestions with their conventional',
    'directories. When nothing is detected, the full 11-layer starter profile is written',
    'instead (all layers optional, anchored at src/), so the strict check passes today and',
    'each layer starts being enforced as soon as its directory gains source files.',
    '',
    'Resolves relative, tsconfig path-alias, and package imports via the TypeScript',
    'module resolver, then checks each resolved cross-layer import against the rules.',
    'Path aliases resolve against the NEAREST tsconfig.json above each source file, so',
    'monorepo packages with per-package configs work under a single --root. Pass',
    '--tsconfig to force one config for every file. If no tsconfig is found, path',
    'aliases are unavailable but relative/package imports still resolve.',
    '',
    'Parsed files are cached in node_modules/.cache/ark-check.json (keyed by mtime+size',
    'and the config/manifest contents); import edges are always re-resolved against the',
    'live filesystem, so the cache can never hide a new violation. --no-cache disables it.',
    '',
    'Config shape:',
    '{',
    '  "include": ["src"],',
    '  "layers": [',
    '    { "name": "DomainModel", "patterns": ["src/domain/**"], "intentPrefixes": ["Domain."],',
    '      "forbiddenGlobals": ["fetch", "process", "Date.now", "Math.random"] }',
    '  ],',
    '  "rules": [{ "from": "DomainModel", "to": "PersistenceAdapters", "allowed": false }]',
    '}',
    '',
    'Config warnings are advisory by default and are included in JSON output.',
    'Use --strict-config to make config warnings fail the check.',
    '',
    '--require-gates fails the check when AGENTS.md, .mcp.json, or the generated CI',
    'workflow is missing, so "installed but never configured" is a red CI. Combine it',
    'with --strict-config to enforce gate presence and architecture in one run.',
    '',
    '--install-agent-gates writes AGENTS.md, .mcp.json, and the CI workflow for every',
    'project, plus tool-specific templates. Known tools: claude, cursor, codex (full',
    'MCP/hook gates) and windsurf, cline, copilot, kiro (instruction-tier rule files',
    'derived from the same contract; Gemini CLI needs no template — it reads AGENTS.md).',
    'It also installs the /ark-* skills shipped in templates/skills/ into each',
    'detected tool\'s command location (.claude/skills/, .cursor/commands/,',
    '.codex/prompts/, .windsurf/workflows/, .clinerules/workflows/, .github/prompts/).',
    'Kiro has no command mechanism and receives only its steering rule. Existing',
    'files are never overwritten without --force, so re-running after an update',
    'only adds what is missing. --skills-only restricts the write to just the',
    '/ark-* skills (safe to --force-refresh — it leaves a customized AGENTS.md,',
    'settings, and CI workflow untouched).',
    'Pass --tools to pick which tool configs to write; otherwise they are auto-detected',
    'from their config directories (.claude/, .cursor/, .codex/, .windsurf/, .clinerules/,',
    '.kiro/; copilot is explicit-only). claude+cursor+codex are written when nothing is',
    'detected.',
    '',
    'Generate a starter 11-layer config:',
    '  ark-check --print-config eleven-layer > ark.config.json',
    '',
    'Install agent + CI enforcement templates:',
    '  ark-check --install-agent-gates',
  ].join('\n');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readPackageJson(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) return null;
  return readJson(file);
}

function hasCheckArchitectureScript(root) {
  const pkg = readPackageJson(root);
  return Boolean(pkg?.scripts?.['check:architecture']);
}

const REQUIRED_GATE_FILES = [
  'AGENTS.md',
  '.mcp.json',
  '.github/workflows/ark-check.yml',
];

function missingGates(root) {
  return REQUIRED_GATE_FILES.filter(
    (relativePath) => !fs.existsSync(path.join(root, relativePath))
  );
}

function checkArchitectureScriptSnippet() {
  // npx resolves the installed package binary; `node bin/ark-check.mjs` only works
  // inside Ark's own repo.
  return '"check:architecture": "npx ark-check --root . --config ark.config.json --strict-config"';
}

function readConfig(root, configPath) {
  const fullPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(root, configPath);
  if (!fs.existsSync(fullPath)) {
    return {
      include: ['src'],
      layers: [],
      rules: DEFAULT_RULES,
    };
  }
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return {
    include: raw.include ?? ['src'],
    layers: raw.layers ?? [],
    rules: raw.rules ?? DEFAULT_RULES,
  };
}

/**
 * Infer an ark.config.json from the directories that actually exist in the project,
 * using the same layer→directory conventions as the eleven-layer template. A directory
 * only counts when it contains at least one source file, so an empty scaffold dir can't
 * produce a layer whose pattern matches nothing (which --strict-config would fail).
 */
function detectConfig(root) {
  const srcDir = fs.existsSync(path.join(root, 'src')) ? 'src' : '.';
  const layers = [];

  for (const entry of DEFAULT_INTENT_PREFIXES) {
    const directories = (DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? []).filter(
      (directory) => walk(path.join(root, srcDir, directory)).length > 0
    );
    if (directories.length === 0) continue;
    layers.push({
      name: entry.layer,
      patterns: directories.map((directory) => `${normalize(path.join(srcDir, directory))}/**`),
      intentPrefixes: entry.prefixes,
      ...(entry.layer === 'DomainModel'
        ? { forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS }
        : {}),
    });
  }

  const names = new Set(layers.map((layer) => layer.name));
  const rules = DEFAULT_RULES.filter((rule) => names.has(rule.from) && names.has(rule.to));

  return { srcDir, config: { include: [srcDir], layers, rules } };
}

/** Top-level directories under srcDir not covered by any detected layer pattern. */
function uncoveredDirectories(root, srcDir, layers) {
  const base = path.join(root, srcDir);
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        entry.name !== 'dist' &&
        !entry.name.startsWith('.')
    )
    .map((entry) => entry.name)
    .filter((name) => {
      const prefix = `${normalize(path.join(srcDir, name))}/`;
      return !layers.some((layer) =>
        layer.patterns.some((pattern) => pattern.startsWith(prefix))
      );
    });
}

// Deny every "upward" edge for an ordered layer list (index 0 = outermost/top,
// which may import everything below it). Inner/lower layers must not import outer
// ones — the shared shape behind linear layered and feature-sliced layouts.
function denyUpward(names) {
  const rules = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      rules.push({ from: names[j], to: names[i], allowed: false });
    }
  }
  return rules;
}

// Named starter configs. Globs use `**` so they fit both flat (src/domain/**) and
// modular (src/modules/x/domain/**) layouts. Every layer is optional, so the strict
// check passes on a greenfield repo and each layer switches on as its dir gains files.
const ARCHITECTURE_PRESETS = {
  hexagonal: () => ({
    include: ['src'],
    layers: [
      {
        name: 'DomainModel',
        patterns: ['src/**/domain/**'],
        forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
        optional: true,
      },
      { name: 'ApplicationOrchestration', patterns: ['src/**/application/**'], optional: true },
      {
        name: 'PresentationAdapters',
        patterns: ['src/**/presentation/**', 'src/**/controllers/**', 'src/**/interface-adapters/**', 'src/**/http/**'],
        optional: true,
      },
      {
        name: 'PersistenceAdapters',
        patterns: ['src/**/infrastructure/**', 'src/**/adapters/**', 'src/**/persistence/**', 'src/**/repositories/**'],
        optional: true,
      },
    ],
    rules: [
      { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
      { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
      { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
      { from: 'ApplicationOrchestration', to: 'PersistenceAdapters', allowed: false },
      { from: 'ApplicationOrchestration', to: 'PresentationAdapters', allowed: false },
      { from: 'PresentationAdapters', to: 'PersistenceAdapters', allowed: false },
      { from: 'PresentationAdapters', to: 'DomainModel', allowed: false },
      { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
      { from: 'PersistenceAdapters', to: 'PresentationAdapters', allowed: false },
    ],
  }),
  layered: () => ({
    include: ['src'],
    layers: [
      {
        name: 'PresentationAdapters',
        patterns: ['src/**/presentation/**', 'src/**/controllers/**', 'src/**/ui/**', 'src/**/http/**'],
        optional: true,
      },
      {
        name: 'ApplicationOrchestration',
        patterns: ['src/**/application/**', 'src/**/services/**'],
        optional: true,
      },
      {
        name: 'DomainModel',
        patterns: ['src/**/domain/**'],
        forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
        optional: true,
      },
      {
        name: 'PersistenceAdapters',
        patterns: ['src/**/persistence/**', 'src/**/data/**', 'src/**/repositories/**', 'src/**/infrastructure/**'],
        optional: true,
      },
    ],
    rules: denyUpward([
      'PresentationAdapters',
      'ApplicationOrchestration',
      'DomainModel',
      'PersistenceAdapters',
    ]),
  }),
  'feature-sliced': () => {
    const order = ['App', 'Pages', 'Widgets', 'Features', 'Entities', 'Shared'];
    return {
      include: ['src'],
      layers: order.map((name) => ({
        name,
        patterns: [`src/${name.toLowerCase()}/**`],
        optional: true,
      })),
      rules: denyUpward(order),
    };
  },
};

function printInitNextSteps(root) {
  console.log('');
  console.log('Next steps:');
  console.log('  1. CI gate:        npx ark-check --root . --config ark.config.json --strict-config');
  console.log('  2. AI write gate:  npx ark-mcp --root . --config ark.config.json');
  console.log('     (bind its validate_code tool to your agent\'s pre-write hook — see README)');
  if (!hasCheckArchitectureScript(root)) {
    console.log('  3. Add the npm alias if you want `npm run check:architecture`:');
    console.log(`     ${checkArchitectureScriptSnippet()}`);
  }
}

function runInit(args) {
  const configPath = path.isAbsolute(args.config)
    ? args.config
    : path.join(args.root, args.config);

  if (fs.existsSync(configPath) && !args.force) {
    console.error(`${configPath} already exists. Re-run with --force to overwrite it.`);
    process.exitCode = 2;
    return;
  }

  if (args.preset) {
    const factory = ARCHITECTURE_PRESETS[args.preset];
    if (!factory) {
      console.error(
        `Unknown preset "${args.preset}". Valid presets: ${Object.keys(ARCHITECTURE_PRESETS).join(', ')}.`
      );
      process.exitCode = 2;
      return;
    }
    const finalConfig = factory();
    fs.writeFileSync(configPath, `${JSON.stringify(finalConfig, null, 2)}\n`);
    console.log(`Wrote ${configPath} (${args.preset} preset)`);
    console.log('');
    console.log('Layers (every layer optional, so the strict check passes before the directories exist):');
    for (const layer of finalConfig.layers) {
      console.log(`  ${layer.name}: ${layer.patterns.join(', ')}`);
    }
    printInitNextSteps(args.root);
    return;
  }

  const { srcDir, config } = detectConfig(args.root);
  const greenfield = config.layers.length === 0;
  // Greenfield: anchor the starter profile at src/ (the convention a fresh project will
  // scaffold under) even when src/ doesn't exist yet — the layers are optional, so the
  // check passes today and governance switches on the moment src/domain/ etc. appear.
  const finalConfig = greenfield
    ? createElevenLayerConfig({ rootDir: srcDir === '.' ? 'src' : srcDir })
    : config;

  fs.writeFileSync(configPath, `${JSON.stringify(finalConfig, null, 2)}\n`);

  console.log(`Wrote ${configPath}`);
  console.log('');
  if (greenfield) {
    console.log('No conventional layer directories found — generated the full 11-layer starter');
    console.log('profile instead. Every layer is marked optional, so the strict check passes now');
    console.log('and each layer starts being enforced as soon as its directory gains source files:');
    for (const layer of finalConfig.layers) {
      console.log(`  ${layer.name}: ${layer.patterns.join(', ')}`);
    }
    // The starter profile only governs src/. Existing source elsewhere would make the
    // gate silently green, so surface it instead of pretending the project is covered.
    const outside = walk(args.root)
      .map((file) => normalize(path.relative(args.root, file)))
      .filter((rel) => !rel.startsWith('src/') && !rel.split('/').some((s) => s.startsWith('.')));
    if (outside.length > 0) {
      console.log('');
      console.log(`WARNING: ${outside.length} source file(s) live outside src/ and are NOT governed`);
      console.log(`by this config (e.g. ${outside.slice(0, 3).join(', ')}).`);
      console.log('Move them under src/, or edit the "include" and layer patterns to match your layout.');
    }
  } else {
    console.log('Detected layers:');
    for (const layer of finalConfig.layers) {
      console.log(`  ${layer.name}: ${layer.patterns.join(', ')}`);
    }
    const detected = new Set(finalConfig.layers.map((layer) => layer.name));
    const suggested = DEFAULT_INTENT_PREFIXES.filter((entry) => !detected.has(entry.layer));
    if (suggested.length > 0) {
      console.log('');
      console.log('Suggested layers from the 11-layer profile (not detected — conventional');
      console.log('directories shown; create one and re-run --init, or add the layer by hand):');
      for (const entry of suggested) {
        const dirs = (DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? [])
          .map((directory) => `${srcDir}/${directory}`)
          .join(', ');
        console.log(`  ${entry.layer}: ${dirs}`);
      }
    }
    const uncovered = uncoveredDirectories(args.root, srcDir, finalConfig.layers);
    if (uncovered.length > 0) {
      console.log('');
      console.log(
        `Not covered by any layer (add patterns for these or they stay ungoverned): ${uncovered.join(', ')}`
      );
    }
  }
  printInitNextSteps(args.root);
}

function ensureDirForFile(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function writeTemplate(root, relativePath, content, force) {
  const fullPath = path.join(root, relativePath);
  if (fs.existsSync(fullPath) && !force) {
    return { relativePath, status: 'skipped' };
  }
  try {
    ensureDirForFile(fullPath);
    fs.writeFileSync(fullPath, content);
    return { relativePath, status: 'written' };
  } catch {
    return { relativePath, status: 'failed' };
  }
}

function packageManager(root) {
  // If the project already froze violations in a baseline, the generated CI must
  // keep the ratchet — otherwise regenerating the workflow (especially with
  // --force) silently drops --baseline and CI starts failing on frozen violations.
  const baselineFlag = fs.existsSync(path.join(root, '.ark-baseline.json'))
    ? ' --baseline .ark-baseline.json'
    : '';
  const checkArgs = `--root . --config ark.config.json --strict-config${baselineFlag} --require-gates`;
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
    return {
      cache: 'pnpm',
      setup: ['corepack enable'],
      install: 'pnpm install --frozen-lockfile',
      run: `pnpm exec ark-check ${checkArgs}`,
    };
  }
  if (fs.existsSync(path.join(root, 'yarn.lock'))) {
    return {
      cache: 'yarn',
      setup: ['corepack enable'],
      install: 'yarn install --frozen-lockfile',
      run: `yarn ark-check ${checkArgs}`,
    };
  }
  return {
    cache: 'npm',
    setup: [],
    install: fs.existsSync(path.join(root, 'package-lock.json')) ? 'npm ci' : 'npm install',
    run: `npx ark-check ${checkArgs}`,
  };
}

const ARK_CHECK_COMMAND = 'npx ark-check --root . --config ark.config.json --strict-config';

// Canonical agent contract. AGENTS.md and the Cursor rule both derive from this
// single source so the steps can never drift out of sync between the two files.
const AGENT_CONTRACT = {
  manifestResource: 'ark://manifest',
  steps: [
    `Read the Ark contract from \`ark://manifest\` when the MCP server is available.`,
    `Keep source files inside the layer boundaries declared in \`ark.config.json\`.`,
    `Do not bypass Ark publishers, event contracts, or source metadata for runtime mutations.`,
    `After edits, run \`${ARK_CHECK_COMMAND}\`.`,
    `If Ark reports violations, fix the architecture instead of weakening the gate.`,
  ],
  // Cursor-only guidance: the write-time validate_code tool is available in
  // Cursor's runtime but has no equivalent in a plain AGENTS.md read.
  cursorValidateStep: `Validate the full post-edit file content with the \`validate_code\` tool before writing whenever your runtime supports it.`,
};

function layerPlacementTable() {
  const rows = DEFAULT_INTENT_PREFIXES.map((entry) => {
    const dirs = (DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? [])
      .map((directory) => `\`${directory}/\``)
      .join(', ');
    return `| ${entry.layer} | ${dirs} | ${entry.prefixes.map((p) => `\`${p}\``).join(', ')} |`;
  }).join('\n');
  return `| Layer | Conventional directories (under the source root) | Intent prefixes |
|-------|---------------------------------------------------|-----------------|
${rows}`;
}

function agentInstructions() {
  const steps = AGENT_CONTRACT.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  return `# Ark Enforcement

Before editing TypeScript or JavaScript source files:

${steps}

## Where new code belongs

\`ark.config.json\` is authoritative for this project. When creating a NEW kind of code
that no existing layer covers (a saga, a background job, a read model, ...), use the
default 11-layer placement below and add the layer to \`ark.config.json\` — do not invent
an ungoverned location:

${layerPlacementTable()}

The project is only considered Ark-enforced when the write gate, CI gate, and runtime path all pass.
`;
}

function mcpJson() {
  return `${JSON.stringify({
    mcpServers: {
      ark: {
        type: 'stdio',
        command: 'npx',
        args: ['ark-mcp', '--root', '.', '--config', 'ark.config.json'],
      },
    },
  }, null, 2)}\n`;
}

function codexTomlSnippet() {
  return `[mcp_servers.ark]
command = "npx"
args = ["ark-mcp", "--root", ".", "--config", "ark.config.json"]
`;
}

/**
 * Compact always-on rule for instruction-tier hosts (Windsurf, Cline, GitHub Copilot,
 * Kiro, ...): agents that read a project rule file but have no MCP tools or hooks.
 * Derived from the same AGENT_CONTRACT as AGENTS.md and the Cursor rule so the steps
 * can never drift; points at AGENTS.md for the full placement table.
 */
function instructionRule() {
  const steps = AGENT_CONTRACT.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  return `# Ark architecture contract

This project's architecture is governed by Ark (\`ark.config.json\` is authoritative).
Before writing or editing TypeScript or JavaScript source files:

${steps}

See \`AGENTS.md\` for the full contract and the layer placement table.
`;
}

function cursorRule() {
  return `---
description: Ark architecture contract
alwaysApply: true
---

Before writing or editing TypeScript or JavaScript source files, read the
\`${AGENT_CONTRACT.manifestResource}\` resource from the \`ark\` MCP server when available.

${AGENT_CONTRACT.cursorValidateStep} After edits, run:

\`\`\`bash
${ARK_CHECK_COMMAND}
\`\`\`

If Ark reports violations, fix the architecture instead of bypassing the gate.
`;
}

// Default CI Node when the project declares nothing. A current LTS, NOT the
// oldest supported: the npm-ci-lockfile-mismatch failure only happens when CI's
// npm is OLDER than the npm that wrote the lockfile, so defaulting high is safer.
const DEFAULT_CI_NODE_VERSION = '22';

// Decide the Node the generated CI should use, preferring the project's own
// declaration so CI's npm matches the dev's (a mismatch makes `npm ci` fail with
// "missing from lock file" — a red gate unrelated to architecture). In order:
//   1. .nvmrc / .node-version → setup-node's node-version-file (exact, best)
//   2. package.json engines.node → its concrete major
//   3. a current-LTS default
function detectCiNode(root) {
  for (const file of ['.nvmrc', '.node-version']) {
    if (fs.existsSync(path.join(root, file))) return { kind: 'file', value: file };
  }
  const enginesNode = readPackageJson(root)?.engines?.node;
  if (typeof enginesNode === 'string') {
    const major = enginesNode.match(/\d+/)?.[0];
    if (major) return { kind: 'version', value: major };
  }
  return { kind: 'default', value: DEFAULT_CI_NODE_VERSION };
}

function githubWorkflow(pm, ciNode) {
  const setupSteps = pm.setup.map((command) => `      - run: ${command}`).join('\n');
  // node-version-file keeps CI locked to the dev's exact toolchain; an explicit
  // version comes from engines.node; the default carries a hint for the mismatch
  // symptom since we can't know which npm wrote the lockfile.
  const nodeSetup =
    ciNode.kind === 'file'
      ? `          node-version-file: ${ciNode.value}`
      : ciNode.kind === 'version'
        ? `          node-version: '${ciNode.value}'`
        : `          # If the install step fails with "missing from lock file" / lockfile out
          # of sync, your local package manager is newer than this Node's — add a
          # .nvmrc with your Node version so CI matches the dev environment.
          node-version: '${ciNode.value}'`;
  return `name: Ark architecture gate

on:
  pull_request:
  push:
    branches: [main, master]

jobs:
  ark-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
${nodeSetup}
          cache: ${pm.cache}
${setupSteps ? `${setupSteps}\n` : ''}      - name: Install dependencies
        run: ${pm.install}
      - name: Ark architecture check
        run: ${pm.run}
`;
}

function claudeSettings() {
  return `${JSON.stringify({
    hooks: {
      // Inject the contract at session start so the agent knows the architecture from
      // the first token. Project-scoped by design; --session-context is also a silent
      // no-op when no ark.config.json exists, so it can never leak into other projects.
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command:
                'npx ark-mcp --session-context --root "$CLAUDE_PROJECT_DIR" --config ark.config.json',
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit',
          hooks: [
            {
              type: 'command',
              command:
                'npx ark-mcp --hook --root "$CLAUDE_PROJECT_DIR" --config ark.config.json',
            },
          ],
        },
      ],
    },
  }, null, 2)}\n`;
}

function resolveTools(args) {
  if (args.tools && args.tools.length > 0) {
    return new Set(args.tools);
  }
  const root = args.root;
  const detected = new Set();
  if (fs.existsSync(path.join(root, '.claude'))) detected.add('claude');
  if (fs.existsSync(path.join(root, '.cursor'))) detected.add('cursor');
  if (fs.existsSync(path.join(root, '.codex'))) detected.add('codex');
  if (fs.existsSync(path.join(root, '.windsurf'))) detected.add('windsurf');
  // .clinerules can also be a single FILE (older Cline convention); only a directory
  // can receive .clinerules/ark.md, so a file must not trigger detection.
  if (fs.statSync(path.join(root, '.clinerules'), { throwIfNoEntry: false })?.isDirectory()) {
    detected.add('cline');
  }
  if (fs.existsSync(path.join(root, '.kiro'))) detected.add('kiro');
  // copilot has no reliable directory signal (.github exists in most repos),
  // so it is explicit-only via --tools.
  // No signal at all: fall back to writing the primary tools' templates so a fresh
  // project still gets a complete, reviewable starter set.
  if (detected.size === 0) {
    return new Set(['claude', 'cursor', 'codex']);
  }
  return detected;
}

const KNOWN_TOOLS = ['claude', 'cursor', 'codex', 'windsurf', 'cline', 'copilot', 'kiro'];

// One canonical markdown per skill (templates/skills/*.md, shipped in the npm
// package); installed into each tool's slash-command location. The YAML
// frontmatter (name/description) is understood or harmlessly ignored by every
// host. Kiro has no command mechanism — its steering rule file is the only gate.
const SKILL_TOOL_TARGETS = {
  claude: (name) => `.claude/skills/${name}/SKILL.md`,
  cursor: (name) => `.cursor/commands/${name}.md`,
  codex: (name) => `.codex/prompts/${name}.md`,
  windsurf: (name) => `.windsurf/workflows/${name}.md`,
  cline: (name) => `.clinerules/workflows/${name}.md`,
  copilot: (name) => `.github/prompts/${name}.prompt.md`,
};

// The version of the ark-runtime-kernel package these bins ship with. Used to
// stamp installed skills so a normal ark-check can tell "outdated skill from an
// older Ark" apart from "user-customized skill" — the stamp moves with the
// package, editing the body doesn't.
function arkPackageVersion() {
  try {
    const pkg = readJson(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
    );
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

// Insert `arkVersion: <v>` into a skill's YAML frontmatter (before its closing
// `---`). No frontmatter → returned unchanged. Idempotent for a given version.
function stampSkill(content, version) {
  if (!version) return content;
  const lines = content.split('\n');
  if (lines[0] !== '---') return content;
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return content;
  const existing = lines.findIndex(
    (line, i) => i > 0 && i < closeIdx && /^arkVersion:/.test(line)
  );
  if (existing !== -1) {
    lines[existing] = `arkVersion: ${version}`;
  } else {
    lines.splice(closeIdx, 0, `arkVersion: ${version}`);
  }
  return lines.join('\n');
}

// Read the `arkVersion:` stamp from an installed skill file. Returns null when
// the file is absent or has no stamp (installed by a pre-stamp Ark, or hand-authored).
function installedSkillVersion(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const match = content.match(/^arkVersion:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

// Numeric-tuple compare of dotted versions; true when `a` is strictly older than
// `b`. Non-numeric/absent segments compare as 0, so "1.7" < "1.7.5".
function isVersionOlder(a, b) {
  const parse = (v) => String(v).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const x = av[i] ?? 0;
    const y = bv[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

function skillTemplates() {
  const dir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'templates',
    'skills'
  );
  // A missing/mispackaged templates dir would otherwise install zero skills with
  // exit 0 — warn so a packaging regression (e.g. "templates" dropped from the
  // package.json files array) is visible instead of a silent no-op.
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    console.error(
      `Warning: skill templates directory not found (${dir}); no /ark-* skills installed.`
    );
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /^[a-z0-9-]+\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => [path.basename(name, '.md'), fs.readFileSync(path.join(dir, name), 'utf8')]);
}

// Skill names only, silent on a missing templates dir — for the freshness
// advisory below, which must not print packaging warnings on every check run.
function skillTemplateNames() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'skills');
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /^[a-z0-9-]+\.md$/.test(entry.name))
    .map((entry) => path.basename(entry.name, '.md'));
}

// A normal ark-check run is the reliable discovery point for new /ark-* skills:
// the postinstall message that advertises them is blocked by modern npm's
// script-approval policy, so the most careful users never see it. When a project
// has adopted Ark agent gates (AGENTS.md present) but a detected tool is missing
// skills this version ships, surface it here so agents and CI actually notice.
// Advisory only — never affects the exit code. Copilot has no reliable directory
// signal, so it is not auto-detected (explicit --tools only), matching resolveTools.
function detectSkillGaps(root) {
  if (!fs.existsSync(path.join(root, 'AGENTS.md'))) return [];
  // The Ark source tree keeps the skill templates at templates/skills/ — it's the
  // producer, not a consumer, so it must not nag itself to "install" its own skills.
  if (fs.existsSync(path.join(root, 'templates', 'skills'))) return [];
  const skillNames = skillTemplateNames();
  if (skillNames.length === 0) return [];
  const detected = [];
  if (fs.existsSync(path.join(root, '.claude'))) detected.push('claude');
  if (fs.existsSync(path.join(root, '.cursor'))) detected.push('cursor');
  if (fs.existsSync(path.join(root, '.codex'))) detected.push('codex');
  if (fs.existsSync(path.join(root, '.windsurf'))) detected.push('windsurf');
  if (fs.statSync(path.join(root, '.clinerules'), { throwIfNoEntry: false })?.isDirectory()) {
    detected.push('cline');
  }
  const version = arkPackageVersion();
  const gaps = [];
  for (const tool of detected) {
    const target = SKILL_TOOL_TARGETS[tool];
    if (!target) continue;
    let missing = 0;
    let stale = 0;
    for (const name of skillNames) {
      const file = path.join(root, target(name));
      if (!fs.existsSync(file)) {
        missing += 1;
      } else if (version) {
        // An installed skill with no stamp predates stamping (older Ark), or one
        // stamped behind the current version is left over from an older install.
        // Either way the shipped skill has moved on — offer a --force refresh.
        const installed = installedSkillVersion(file);
        if (installed === null || isVersionOlder(installed, version)) stale += 1;
      }
    }
    if (missing > 0 || stale > 0) gaps.push({ tool, missing, stale });
  }
  return gaps;
}

function runInstallAgentGates(args) {
  const root = args.root;
  if (args.tools) {
    const unknown = args.tools.filter((tool) => !KNOWN_TOOLS.includes(tool));
    if (args.tools.length === 0 || unknown.length > 0) {
      console.error(
        `--tools expects a comma-separated subset of: ${KNOWN_TOOLS.join(', ')}` +
          (unknown.length > 0 ? ` (unknown: ${unknown.join(', ')})` : '')
      );
      process.exitCode = 2;
      return;
    }
  }
  const pm = packageManager(root);
  const hasCheckScript = hasCheckArchitectureScript(root);
  const tools = resolveTools(args);
  const templates = [];
  // --skills-only refreshes just the canonical /ark-* skills, which are safe to
  // overwrite (they track the package). The gate/instruction files (AGENTS.md,
  // settings.json, CI workflow, rules) are the ones users customize, so a plain
  // `--force` clobbers them — this is the safe way to pick up new skill versions.
  if (!args.skillsOnly) {
    // Base gates: tool-agnostic contract + CI backstop, always written.
    templates.push(['AGENTS.md', agentInstructions()]);
    templates.push(['.mcp.json', mcpJson()]);
    templates.push([
      '.github/workflows/ark-check.yml',
      githubWorkflow(pm, detectCiNode(root)),
    ]);
    if (tools.has('cursor')) {
      templates.push(['.cursor/mcp.json', mcpJson()]);
      templates.push(['.cursor/rules/ark.mdc', cursorRule()]);
    }
    if (tools.has('claude')) {
      templates.push(['.claude/settings.json', claudeSettings()]);
    }
    if (tools.has('codex')) {
      templates.push(['docs/ark-codex-config.toml', codexTomlSnippet()]);
    }
    // Instruction-tier hosts: one shared rule text, host-specific path.
    if (tools.has('windsurf')) {
      templates.push(['.windsurf/rules/ark.md', instructionRule()]);
    }
    if (tools.has('cline')) {
      templates.push(['.clinerules/ark.md', instructionRule()]);
    }
    if (tools.has('copilot')) {
      templates.push(['.github/copilot-instructions.md', instructionRule()]);
    }
    if (tools.has('kiro')) {
      templates.push(['.kiro/steering/ark.md', instructionRule()]);
    }
  }
  // /ark-* skills for every detected tool that supports project-level commands.
  // Stamp each with the shipping version so a later ark-check can flag skills
  // left behind by an older Ark (see detectSkillGaps) without nagging about
  // user edits to the body.
  const version = arkPackageVersion();
  const skills = skillTemplates().map(([name, content]) => [name, stampSkill(content, version)]);
  const skillPaths = new Set();
  for (const tool of tools) {
    const target = SKILL_TOOL_TARGETS[tool];
    if (!target) continue;
    for (const [name, content] of skills) {
      const relativePath = target(name);
      skillPaths.add(relativePath);
      templates.push([relativePath, content]);
    }
  }

  const results = templates.map(([relativePath, content]) =>
    writeTemplate(root, relativePath, content, args.force)
  );

  console.log('Ark agent gate templates:');
  let staleSkipped = 0;
  for (const result of results) {
    const marker =
      result.status === 'written' ? 'wrote' : result.status === 'failed' ? 'FAILED' : 'skipped';
    // A skipped skill reads as "you're fine" — but it may be a version behind.
    // Say which, so the user isn't left guessing (and knows the safe refresh cmd).
    let note = '';
    if (result.status === 'skipped' && skillPaths.has(result.relativePath) && version) {
      const installed = installedSkillVersion(path.join(root, result.relativePath));
      if (installed === null || isVersionOlder(installed, version)) {
        staleSkipped += 1;
        note = `  (stale: ${installed ?? 'no stamp'} < ${version})`;
      } else {
        note = '  (up to date)';
      }
    }
    console.log(`  ${marker.padEnd(7)} ${result.relativePath}${note}`);
  }
  if (staleSkipped > 0 && !args.skillsOnly) {
    console.log('');
    console.log(
      `  ${staleSkipped} skill(s) are outdated but were left untouched. Refresh them with:`
    );
    console.log('    npx ark-check --install-agent-gates --skills-only --force');
  }
  const failed = results.filter((result) => result.status === 'failed');
  if (failed.length > 0) {
    console.error(`\nFailed to write ${failed.length} template(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the generated files and commit the ones that match your tools.');
  console.log('  2. Run: npx ark-check --root . --config ark.config.json --strict-config');
  if (!hasCheckScript) {
    console.log('  3. Add the npm alias if you want `npm run check:architecture`:');
    console.log(`     ${checkArchitectureScriptSnippet()}`);
    console.log('  4. If you use Codex in this project, wire it now so `ark://manifest` is available from the first edit.');
  } else {
    console.log('  3. If you use Codex in this project, wire it now so `ark://manifest` is available from the first edit.');
  }
  if (tools.has('codex') && skills.length > 0) {
    console.log('');
    console.log('  Codex loads slash-command prompts from $CODEX_HOME/prompts (~/.codex/prompts),');
    console.log('  not the repo, so the /ark-* skills need one copy there to work in Codex:');
    console.log('    mkdir -p ~/.codex/prompts && cp .codex/prompts/*.md ~/.codex/prompts/');
    console.log('  (Safe to run now — agents driving this setup should offer to do it.)');
  }
}

function readManifest(root, manifestPath) {
  if (!manifestPath) return undefined;
  const fullPath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.join(root, manifestPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Manifest not found: ${fullPath}`);
  }
  return readJson(fullPath);
}

const SOURCE_FILE_NAME = /\.[cm]?[tj]sx?$/;

function isGovernableSourceFile(name) {
  return SOURCE_FILE_NAME.test(name) && !name.endsWith('.d.ts');
}

function walk(dir, files = []) {
  const stat = fs.statSync(dir, { throwIfNoEntry: false });
  if (!stat) return files;
  // An `include` entry may be a single file (e.g. a root-level "middleware.ts"),
  // not just a directory — govern it directly instead of trying to scandir it
  // (which threw ENOTDIR). The extension filter still applies.
  if (stat.isFile()) {
    if (isGovernableSourceFile(path.basename(dir))) files.push(dir);
    return files;
  }
  if (!stat.isDirectory()) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, files);
    } else if (isGovernableSourceFile(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function normalize(value) {
  return value.split(path.sep).join('/');
}

function intentLayersFromManifest(manifest) {
  const layers = manifest?.architecture?.layers;
  if (!Array.isArray(layers)) return undefined;
  return layers
    .filter((layer) => Array.isArray(layer.prefixes) && layer.prefixes.length > 0)
    .map((layer) => ({ name: layer.name, prefixes: layer.prefixes }));
}

function layerForIntent(intent, layers, manifestIntentLayers) {
  // Use only layers that declare intent prefixes; fall back to the built-in defaults when
  // none do (mirrors the write-gate). resolveIntentLayer applies the library's exact
  // longest-prefix + trailing-dot semantics so CI and the MCP gate classify identically.
  const configured =
    manifestIntentLayers ??
    layers
      .filter((layer) => (layer.intentPrefixes ?? []).length > 0)
      .map((layer) => ({ name: layer.name, prefixes: layer.intentPrefixes }));
  const source =
    configured.length > 0
      ? configured
      : DEFAULT_INTENT_PREFIXES.map((entry) => ({ name: entry.layer, prefixes: entry.prefixes }));
  return resolveIntentLayer(intent, source);
}

function isBlocked(rules, from, to) {
  return rules.find((rule) => !rule.allowed && rule.from === from && rule.to === to);
}

function configWarning(ruleId, message, extra = {}) {
  return { ruleId, message, ...extra };
}

function collectConfigWarnings(root, config, files, rules, manifest) {
  const warnings = [];
  const layers = Array.isArray(config.layers) ? config.layers : [];
  const manifestLayers = Array.isArray(manifest?.architecture?.layers)
    ? manifest.architecture.layers
    : [];
  const knownLayers = new Set([
    ...layers.map((layer) => layer.name).filter(Boolean),
    ...manifestLayers.map((layer) => layer.name).filter(Boolean),
  ]);

  if (layers.length === 0) {
    warnings.push(
      configWarning(
        'CONFIG_NO_LAYERS',
        'No file layers are configured; ark-check cannot classify files for import-boundary enforcement.'
      )
    );
  }

  const seenLayers = new Set();
  const duplicateLayers = new Set();
  for (const layer of layers) {
    if (!layer.name) {
      warnings.push(
        configWarning('CONFIG_LAYER_WITHOUT_NAME', 'A configured layer is missing a name.')
      );
      continue;
    }
    if (seenLayers.has(layer.name)) duplicateLayers.add(layer.name);
    seenLayers.add(layer.name);

    if (
      layer.forbiddenGlobals !== undefined &&
      (!Array.isArray(layer.forbiddenGlobals) ||
        layer.forbiddenGlobals.some((entry) => typeof entry !== 'string'))
    ) {
      warnings.push(
        configWarning(
          'CONFIG_INVALID_FORBIDDEN_GLOBALS',
          `Layer "${layer.name}" has an invalid forbiddenGlobals value; expected an array of strings (e.g. ["fetch", "Date.now"]). The entry is ignored.`,
          { layer: layer.name }
        )
      );
    }

    const patterns = Array.isArray(layer.patterns) ? layer.patterns : [];
    if (patterns.length === 0) {
      warnings.push(
        configWarning(
          'CONFIG_LAYER_WITHOUT_PATTERNS',
          `Layer "${layer.name}" has no file patterns and will never classify files.`,
          { layer: layer.name }
        )
      );
      continue;
    }

    for (const pattern of patterns) {
      let re;
      try {
        re = globToRegExp(pattern);
      } catch (err) {
        warnings.push(
          configWarning(
            'CONFIG_INVALID_LAYER_PATTERN',
            `Layer "${layer.name}" has an invalid pattern "${pattern}": ${
              err instanceof Error ? err.message : String(err)
            }`,
            { layer: layer.name, pattern }
          )
        );
        continue;
      }

      const matched = files.some((file) => {
        const rel = normalize(path.relative(root, file));
        return re.test(rel);
      });
      if (!matched && !layer.optional) {
        warnings.push(
          configWarning(
            'CONFIG_LAYER_PATTERN_NO_MATCHES',
            `Layer "${layer.name}" pattern "${pattern}" matched no included files.`,
            { layer: layer.name, pattern }
          )
        );
      }
    }
  }

  for (const name of duplicateLayers) {
    warnings.push(
      configWarning(
        'CONFIG_DUPLICATE_LAYER',
        `Layer "${name}" is configured more than once.`,
        { layer: name }
      )
    );
  }

  if (knownLayers.size > 0) {
    for (const rule of rules ?? []) {
      if (rule.from && !knownLayers.has(rule.from)) {
        warnings.push(
          configWarning(
            'CONFIG_RULE_UNKNOWN_FROM_LAYER',
            `Rule references unknown source layer "${rule.from}".`,
            { fromLayer: rule.from, toLayer: rule.to }
          )
        );
      }
      if (rule.to && !knownLayers.has(rule.to)) {
        warnings.push(
          configWarning(
            'CONFIG_RULE_UNKNOWN_TO_LAYER',
            `Rule references unknown target layer "${rule.to}".`,
            { fromLayer: rule.from, toLayer: rule.to }
          )
        );
      }
    }
  }

  const unclassified = files.filter((file) => !layerForFile(root, file, layers));
  if (unclassified.length > 0) {
    warnings.push(
      configWarning(
        'CONFIG_UNCLASSIFIED_FILES',
        `${unclassified.length} included source file(s) are not matched by any configured layer; ark-check will not enforce import rules for those source files.`,
        {
          count: unclassified.length,
          samples: unclassified.slice(0, 5).map((file) => normalize(path.relative(root, file))),
        }
      )
    );
  }

  return warnings;
}

function createModuleResolutionHost(ts) {
  return {
    fileExists: (f) => ts.sys.fileExists(f),
    readFile: (f) => ts.sys.readFile(f),
    directoryExists: ts.sys.directoryExists ? (d) => ts.sys.directoryExists(d) : undefined,
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getDirectories: ts.sys.getDirectories ? (d) => ts.sys.getDirectories(d) : undefined,
    realpath: ts.sys.realpath ? (p) => ts.sys.realpath(p) : undefined,
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  };
}

function parseTsconfig(ts, configPath) {
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) return {};
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
  return parsed.options;
}

/**
 * Compiler options for a given source file. With --tsconfig every file uses that one
 * config; otherwise each file uses the NEAREST tsconfig.json above it (like tsc does),
 * so monorepo packages with per-package path aliases resolve correctly under one --root.
 */
function createCompilerOptionsLookup(ts, root, tsconfigArg) {
  if (tsconfigArg) {
    const configPath = path.isAbsolute(tsconfigArg) ? tsconfigArg : path.join(root, tsconfigArg);
    const options = fs.existsSync(configPath) ? parseTsconfig(ts, configPath) : {};
    return () => options;
  }
  const byDir = new Map();
  const byConfig = new Map();
  return (file) => {
    const dir = path.dirname(file);
    if (byDir.has(dir)) return byDir.get(dir);
    const configPath = ts.findConfigFile(dir, ts.sys.fileExists, 'tsconfig.json');
    let options = {};
    if (configPath) {
      if (!byConfig.has(configPath)) byConfig.set(configPath, parseTsconfig(ts, configPath));
      options = byConfig.get(configPath);
    }
    byDir.set(dir, options);
    return options;
  };
}

/**
 * Per-file scan cache. A cache entry stores the parsed file's content-derived results:
 * content violations (forbidden globals, publish checks, intent references) and the list
 * of module-edge specifiers. Edges are NEVER cached as violations — they are re-resolved
 * against the live filesystem every run, because resolution depends on files and tsconfigs
 * outside the cached file. The whole cache is keyed by the config+manifest contents, so
 * any rule change invalidates everything.
 */
function scanCachePath(root) {
  return path.join(root, 'node_modules', '.cache', 'ark-check.json');
}

function scanCacheKey(root, args) {
  const read = (p) => {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return '';
    }
  };
  const configPath = path.isAbsolute(args.config) ? args.config : path.join(root, args.config);
  const manifestPath = args.manifest
    ? path.isAbsolute(args.manifest)
      ? args.manifest
      : path.join(root, args.manifest)
    : undefined;
  return crypto
    .createHash('sha1')
    .update(`ark-check-cache-v1\0${read(configPath)}\0${manifestPath ? read(manifestPath) : ''}`)
    .digest('hex');
}

function loadScanCache(root, key) {
  try {
    const data = JSON.parse(fs.readFileSync(scanCachePath(root), 'utf8'));
    return data.key === key && data.files && typeof data.files === 'object' ? data.files : undefined;
  } catch {
    return undefined;
  }
}

function saveScanCache(root, key, files) {
  try {
    const target = scanCachePath(root);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ key, files }));
  } catch {
    // cache is best-effort: read-only filesystems just re-parse every run
  }
}

/**
 * Fallback resolver for extensionless relative imports whose on-disk target uses an
 * extension `ts.resolveModuleName` won't resolve without a matching tsconfig
 * (notably `.mts`/`.cts`). Mirrors the classic candidate list.
 */
function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveRelativeFallback(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base, // only used when the specifier already carries an extension (isFile filters dirs)
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.mts'),
    path.join(base, 'index.cts'),
  ];
  // isFile (not existsSync) so a directory named like the specifier never shadows the
  // real module file — e.g. `./foo` must not resolve to a `foo/` directory before `foo.mts`.
  return candidates.find(isFile);
}

/**
 * Resolve any import specifier (relative, tsconfig path-alias, or package) to a source
 * file using TypeScript's module resolver, returning the resolved file (or undefined for
 * unresolved / declaration-only targets).
 *
 * ark-check governs one project rooted at --root. A resolved target is skipped when its
 * path RELATIVE TO ROOT either escapes the root (leading `..`) or contains a `node_modules`
 * segment. Using the root-relative path (not an absolute substring) means a project that
 * itself lives under a node_modules segment is still governed, while a broad catch-all
 * pattern (`**`) can't false-flag vendored deps or files outside the project. Monorepos can
 * run under a single --root (per-package tsconfigs are honored via the nearest-tsconfig
 * lookup); edges that resolve outside the root are still skipped.
 */
function resolveImport(ts, specifier, containingFile, options, host, root) {
  const res = ts.resolveModuleName(specifier, containingFile, options, host);
  let file = res.resolvedModule?.resolvedFileName;
  if (!file && specifier.startsWith('.')) {
    file = resolveRelativeFallback(containingFile, specifier);
  }
  if (!file) return undefined;
  if (file.endsWith('.d.ts')) return undefined;
  const abs = path.resolve(file);
  const segments = path.relative(root, abs).split(path.sep);
  if (segments[0] === '..' || segments.includes('node_modules')) return undefined;
  return abs;
}

function lineOf(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function textOfModuleSpecifier(node) {
  return node.moduleSpecifier && typeof node.moduleSpecifier.text === 'string'
    ? node.moduleSpecifier.text
    : undefined;
}

function propertyName(ts, node) {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

function objectProperty(ts, node, name) {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  return node.properties.find((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return false;
    }
    return propertyName(ts, property.name) === name;
  });
}

function objectHasProperty(ts, node, name) {
  return objectProperty(ts, node, name) !== undefined;
}

function objectPropertyValue(ts, node, name) {
  const property = objectProperty(ts, node, name);
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined;
}

function objectHasMetadataSource(ts, node) {
  const metadata = objectPropertyValue(ts, node, 'metadata');
  return objectHasProperty(ts, metadata, 'source');
}

function stringLiteralText(ts, node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function isPublishCall(ts, node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === 'publish';
  }
  return ts.isIdentifier(expression) && expression.text === 'publish';
}

function looksLikeIntentCreatorExpression(ts, node) {
  if (!node) return false;
  if (ts.isIdentifier(node)) {
    return /^[A-Z]/.test(node.text);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return looksLikeIntentCreatorExpression(ts, node.name);
  }
  return false;
}

function isArkPublishCandidate(ts, node) {
  if (!ts.isCallExpression(node)) return false;
  const firstArg = node.arguments[0];
  const rawIntent = stringLiteralText(ts, firstArg);
  return (
    (rawIntent !== undefined && looksLikeIntent(rawIntent)) ||
    objectHasProperty(ts, firstArg, 'intent') ||
    looksLikeIntentCreatorExpression(ts, firstArg)
  );
}

function publishSourceLiteral(ts, node) {
  if (!ts.isCallExpression(node)) return undefined;
  const [firstArg, secondArg, thirdArg] = node.arguments;
  const rawMetadata = objectPropertyValue(ts, firstArg, 'metadata');
  return (
    stringLiteralText(ts, objectPropertyValue(ts, rawMetadata, 'source')) ??
    stringLiteralText(ts, objectPropertyValue(ts, secondArg, 'source')) ??
    stringLiteralText(ts, objectPropertyValue(ts, thirdArg, 'source'))
  );
}

function publishHasSource(ts, node) {
  if (!ts.isCallExpression(node)) return false;
  const [firstArg, secondArg, thirdArg] = node.arguments;
  return (
    objectHasMetadataSource(ts, firstArg) ||
    objectHasProperty(ts, secondArg, 'source') ||
    objectHasProperty(ts, thirdArg, 'source')
  );
}

// Baseline keys exclude the line number so unrelated edits that shift lines
// don't resurrect frozen violations; the trade-off is that N identical violations in one
// file collapse to one key.
function baselineKey(violation) {
  return [
    violation.ruleId,
    violation.file,
    violation.fromLayer ?? '',
    violation.toLayer ?? '',
    violation.target ?? '',
  ].join('|');
}

function readBaseline(root, baselinePath) {
  const fullPath = path.isAbsolute(baselinePath) ? baselinePath : path.join(root, baselinePath);
  if (!fs.existsSync(fullPath)) return { keys: new Set(), fullPath, exists: false };
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return { keys: new Set(raw.violations ?? []), fullPath, exists: true };
}

function writeBaseline(root, baselinePath, violations) {
  const fullPath = path.isAbsolute(baselinePath) ? baselinePath : path.join(root, baselinePath);
  const keys = [...new Set(violations.map(baselineKey))].sort();
  fs.writeFileSync(
    fullPath,
    `${JSON.stringify({ version: 1, note: 'Frozen ark-check violations. Only NEW violations fail --baseline runs. Regenerate with: ark-check --update-baseline', violations: keys }, null, 2)}\n`
  );
  return { fullPath, count: keys.length };
}

const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const color = {
  red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

const FIX_HINTS = {
  LAYER_IMPORT_VIOLATION:
    'Depend on a port/interface owned by an inner layer instead, or move this code to a layer allowed to make this import.',
  LAYER_INTENT_REFERENCE_VIOLATION:
    'Reference intents through a layer that owns them (e.g. subscribe from an adapter, not from the domain).',
  RAW_EVENT_PUBLISH:
    'Define the intent with ark.registry.define(...) and publish through the returned creator.',
  PUBLISH_MISSING_SOURCE:
    'Add metadata.source (the publishing intent name) to the publish call.',
  PUBLISH_SOURCE_LAYER_MISMATCH:
    'Use a source intent that belongs to the same layer as the publishing file, or move the file.',
  FORBIDDEN_GLOBAL:
    'Inject the capability through a port (e.g. a Clock, IdGenerator, or HttpPort) instead of reaching for the ambient global.',
  CIRCULAR_DEPENDENCY:
    'Break the cycle: extract the shared code into a module both sides import, invert one edge behind a port/interface, or merge the files if they are really one unit.',
};

function printViolation(violation) {
  const location = `${violation.file}:${violation.line}`;
  console.error(`${color.red('✖')} ${color.bold(violation.ruleId)}  ${location}`);
  if (violation.fromLayer && violation.toLayer) {
    const target = violation.target ? `  ${color.dim(`(${violation.target})`)}` : '';
    console.error(`  ${violation.fromLayer} → ${violation.toLayer}${target}`);
  }
  console.error(`  ${violation.message}`);
  const hint = FIX_HINTS[violation.ruleId];
  if (hint) console.error(`  ${color.dim(`fix: ${hint}`)}`);
  console.error('');
}

// Finds strongly-connected components in the resolved import graph. Any component
// with more than one file is a set of files that transitively import each other —
// a circular dependency. One violation per component keeps the output minimal and
// the baseline key stable (anchored at the alphabetically-first member).
function detectCycles(graph) {
  let index = 0;
  const indices = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];

  // ponytail: recursive Tarjan; make it iterative only if a real repo blows the stack.
  const strongconnect = (v) => {
    indices.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of [...(graph.get(v) ?? [])].sort()) {
      if (!graph.has(w)) continue;
      if (!indices.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) components.push(comp.sort());
    }
  };

  for (const v of [...graph.keys()].sort()) {
    if (!indices.has(v)) strongconnect(v);
  }

  return components
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((members) => ({
      ruleId: 'CIRCULAR_DEPENDENCY',
      file: members[0],
      line: 1,
      target: members.join(' → '),
      message: `Circular dependency among ${members.length} files: ${members.join(' → ')} → ${members[0]}.`,
    }));
}

function detectEnforcement(root) {
  const has = (rel) => fs.existsSync(path.join(root, rel));
  const fileIncludes = (rel, needle) => {
    try {
      return fs.readFileSync(path.join(root, rel), 'utf8').includes(needle);
    } catch {
      return false;
    }
  };
  const workflowsMentionArk = () => {
    const dir = path.join(root, '.github', 'workflows');
    if (!fs.existsSync(dir)) return false;
    return fs
      .readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .some((f) => fileIncludes(path.join('.github', 'workflows', f), 'ark-check'));
  };
  const eslintConfigured = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs', '.eslintrc.json', '.eslintrc.cjs'].some(
    (f) => has(f) && fileIncludes(f, 'ark-runtime-kernel')
  );
  return [
    {
      name: 'Write gate',
      on: fileIncludes('.claude/settings.json', 'ark-mcp') || has('.cursor/mcp.json'),
      what: 'blocks a bad edit as you type (PreToolUse hook / MCP)',
    },
    { name: 'ESLint', on: eslintConfigured, what: 'flags violations in your editor' },
    { name: 'CI check', on: workflowsMentionArk(), what: 'blocks the merge if the architecture breaks' },
    { name: 'Baseline', on: has('.ark-baseline.json'), what: 'old violations frozen; new ones fail' },
  ];
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Renders a self-contained HTML architecture report: the layer map, the
// who-may-import-whom matrix, current violations with fix hints, and which
// gates are live. No external assets (CSP-safe, works offline). This is the
// visual sibling of `/ark-explain` — an artifact for PRs and onboarding.
function renderHtmlReport({ root, config, exampleByLayer, violations, warnings, ok, suppressed }) {
  const layers = Array.isArray(config.layers) ? config.layers : [];
  const rules = Array.isArray(config.rules) ? config.rules : [];
  const project = (() => {
    try {
      return readJson(path.join(root, 'package.json')).name || path.basename(root);
    } catch {
      return path.basename(root);
    }
  })();
  const esc = htmlEscape;

  const layerRows = layers
    .map((layer) => {
      const globals = Array.isArray(layer.forbiddenGlobals) && layer.forbiddenGlobals.length
        ? `<span class="tag">no ${layer.forbiddenGlobals.map(esc).join(', ')}</span>`
        : '';
      const example = exampleByLayer.get(layer.name);
      return `<tr>
        <td class="ln">${esc(layer.name)} ${globals}</td>
        <td><code>${(layer.patterns || []).map(esc).join('<br>') || '—'}</code></td>
        <td>${example ? `<code>${esc(example)}</code>` : '<span class="dim">no files yet</span>'}</td>
      </tr>`;
    })
    .join('\n');

  // Matrix: for each from→to pair, denied (explicit allowed:false), allowed
  // (explicit allowed:true), or implicit (no rule = ungoverned).
  const findRule = (from, to) => rules.find((r) => r.from === from && r.to === to);
  const matrixHead = layers.map((l) => `<th class="rot"><span>${esc(l.name)}</span></th>`).join('');
  const matrixBody = layers
    .map((from) => {
      const cells = layers
        .map((to) => {
          if (from.name === to.name) return '<td class="self">·</td>';
          const rule = findRule(from.name, to.name);
          if (!rule) return '<td class="implicit" title="no rule (implicitly allowed)"></td>';
          return rule.allowed
            ? '<td class="allow" title="allowed">✓</td>'
            : '<td class="deny" title="denied">✕</td>';
        })
        .join('');
      return `<tr><th class="rowlbl">${esc(from.name)}</th>${cells}</tr>`;
    })
    .join('\n');

  const violationRows = violations.length
    ? violations
        .map((v) => {
          const hint = FIX_HINTS[v.ruleId];
          const edge = v.fromLayer && v.toLayer ? `${esc(v.fromLayer)} → ${esc(v.toLayer)}` : '';
          return `<li>
            <div class="vhead"><span class="rule">${esc(v.ruleId)}</span> <code>${esc(v.file)}:${v.line}</code></div>
            ${edge ? `<div class="edge">${edge}${v.target ? ` <span class="dim">(${esc(v.target)})</span>` : ''}</div>` : ''}
            <div class="msg">${esc(v.message)}</div>
            ${hint ? `<div class="fix">fix: ${esc(hint)}</div>` : ''}
          </li>`;
        })
        .join('\n')
    : '<li class="clean">No active violations. The architecture matches the contract.</li>';

  const enforcementRows = detectEnforcement(root)
    .map(
      (e) =>
        `<li class="${e.on ? 'on' : 'off'}"><span class="dot"></span><b>${esc(e.name)}</b> — ${esc(e.what)}</li>`
    )
    .join('\n');

  const suppressedNote = suppressed
    ? `<span class="dim">${suppressed} frozen by baseline</span>`
    : '';
  const status = ok ? 'PASS' : 'FAIL';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ark architecture — ${esc(project)}</title>
<style>
  :root { --bg:#0d0f12; --panel:#15181d; --ink:#e6e8ea; --dim:#8b929c; --line:#262b32;
    --green:#4ade80; --red:#f87171; --accent:#7dd3fc; }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f7f8fa; --panel:#fff; --ink:#1a1d21; --dim:#697079; --line:#e2e5ea;
      --green:#16a34a; --red:#dc2626; --accent:#0369a1; }
  }
  * { box-sizing:border-box; }
  body { margin:0; padding:2rem 1.25rem 4rem; background:var(--bg); color:var(--ink);
    font:15px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .wrap { max-width:980px; margin:0 auto; }
  h1 { font-size:1.5rem; margin:0 0 .25rem; }
  h2 { font-size:1.05rem; margin:2.25rem 0 .75rem; }
  .sub { color:var(--dim); margin:0 0 1.5rem; }
  .badge { display:inline-block; padding:.15em .6em; border-radius:999px; font-weight:700;
    font-size:.8rem; letter-spacing:.03em; }
  .PASS { background:color-mix(in srgb,var(--green) 20%,transparent); color:var(--green); }
  .FAIL { background:color-mix(in srgb,var(--red) 20%,transparent); color:var(--red); }
  .dim { color:var(--dim); }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.86em; }
  table { width:100%; border-collapse:collapse; }
  .layers td, .layers th { text-align:left; padding:.55rem .6rem; border-bottom:1px solid var(--line);
    vertical-align:top; }
  .layers th { color:var(--dim); font-weight:600; font-size:.8rem; text-transform:uppercase; letter-spacing:.04em; }
  .ln { font-weight:600; white-space:nowrap; }
  .tag { display:inline-block; margin-left:.35rem; padding:.05em .45em; border:1px solid var(--line);
    border-radius:5px; font-size:.7rem; color:var(--dim); }
  .matrix-scroll { overflow-x:auto; }
  .matrix { border-collapse:collapse; font-size:.82rem; }
  .matrix th, .matrix td { border:1px solid var(--line); }
  .matrix td { width:2.1rem; height:2.1rem; text-align:center; font-weight:700; }
  .matrix .rowlbl { text-align:right; padding:0 .6rem; color:var(--dim); font-weight:600; white-space:nowrap; }
  .matrix .rot { height:8.5rem; vertical-align:bottom; padding:.3rem; }
  .matrix .rot span { writing-mode:vertical-rl; transform:rotate(180deg); color:var(--dim);
    font-weight:600; white-space:nowrap; }
  .allow { color:var(--green); background:color-mix(in srgb,var(--green) 12%,transparent); }
  .deny { color:var(--red); background:color-mix(in srgb,var(--red) 12%,transparent); }
  .implicit { background:transparent; }
  .self { color:var(--line); }
  .legend { color:var(--dim); font-size:.82rem; margin:.6rem 0 0; }
  .legend b { font-weight:700; }
  ul.viol, ul.enf { list-style:none; padding:0; margin:0; }
  ul.viol li { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--red);
    border-radius:8px; padding:.7rem .85rem; margin-bottom:.6rem; }
  ul.viol li.clean { border-left-color:var(--green); color:var(--dim); }
  .vhead { display:flex; gap:.6rem; align-items:baseline; flex-wrap:wrap; }
  .rule { font-weight:700; font-size:.78rem; color:var(--red); letter-spacing:.02em; }
  .edge { color:var(--accent); font-weight:600; margin-top:.15rem; }
  .msg { margin-top:.25rem; }
  .fix { margin-top:.3rem; color:var(--dim); font-size:.88rem; }
  ul.enf li { display:flex; align-items:center; gap:.55rem; padding:.35rem 0; }
  ul.enf .dot { width:.6rem; height:.6rem; border-radius:50%; flex:0 0 auto; background:var(--line); }
  ul.enf li.on .dot { background:var(--green); }
  ul.enf li.off { color:var(--dim); }
  .cmds { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:.85rem 1rem; }
  .cmds code { display:block; padding:.15rem 0; }
</style></head>
<body><div class="wrap">
  <h1>${esc(project)} <span class="badge ${status}">${status}</span></h1>
  <p class="sub">Ark architecture report · ${layers.length} layers · ${violations.length} active violation(s) ${suppressedNote}</p>

  <h2>Layers</h2>
  <table class="layers">
    <tr><th>Layer</th><th>Folders</th><th>Example file</th></tr>
    ${layerRows || '<tr><td colspan="3" class="dim">No layers configured.</td></tr>'}
  </table>

  <h2>Who may import whom</h2>
  <div class="matrix-scroll"><table class="matrix">
    <tr><th></th>${matrixHead}</tr>
    ${matrixBody}
  </table></div>
  <p class="legend">Row imports column. <b class="allow" style="background:none">✓</b> allowed ·
    <b class="deny" style="background:none">✕</b> denied · blank = no rule (implicitly allowed) · · = self.</p>

  <h2>Violations</h2>
  <ul class="viol">${violationRows}</ul>

  <h2>Enforcement points</h2>
  <ul class="enf">${enforcementRows}</ul>

  <h2>Commands to remember</h2>
  <div class="cmds">
    <code>npx ark-check --root . --config ark.config.json --strict-config</code>
    <code>/ark-place "&lt;what you're building&gt;"</code>
  </div>
</div></body></html>
`;
}

function moduleSpecifierFromCall(ts, node) {
  if (!ts.isCallExpression(node)) return undefined;

  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const first = node.arguments[0];
    const value = stringLiteralText(ts, first);
    return value ? { value, kind: 'dynamic-import' } : undefined;
  }

  if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
    const first = node.arguments[0];
    const value = stringLiteralText(ts, first);
    return value ? { value, kind: 'require' } : undefined;
  }

  return undefined;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.init) {
    runInit(args);
    return;
  }
  if (args.installAgentGates) {
    runInstallAgentGates(args);
    return;
  }
  if (args.printConfig) {
    if (args.printConfig !== 'eleven-layer') {
      console.error(`Unknown config profile: ${args.printConfig}`);
      process.exitCode = 2;
      return;
    }
    console.log(JSON.stringify(createElevenLayerConfig(), null, 2));
    return;
  }

  if (args.requireGates) {
    const missing = missingGates(args.root);
    if (missing.length > 0) {
      const payload = {
        ok: false,
        error: 'missing-gates',
        missing,
      };
      if (args.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.error('Ark gates are not installed. Missing:');
        for (const relativePath of missing) {
          console.error(`  - ${relativePath}`);
        }
        console.error('\nRun `npx ark init` (or `ark-check --install-agent-gates`) to configure enforcement.');
      }
      process.exitCode = 1;
      return;
    }
    // Gates present. This is a precondition, not a standalone report: stay quiet
    // in --json mode so the architecture check below owns the single JSON output.
    // When --require-gates is the only intent (no config/architecture run needed),
    // callers still get a clear signal from the exit code and the human-mode line.
    if (!args.json) {
      console.log('Ark gates present: ' + REQUIRED_GATE_FILES.join(', '));
    }
  }

  let ts;
  try {
    ts = await import('typescript');
  } catch {
    console.error('ark-check requires TypeScript. Install it with: npm install -D typescript');
    process.exitCode = 2;
    return;
  }

  const root = args.root;
  const config = readConfig(root, args.config);
  const manifest = readManifest(root, args.manifest);
  const rules = manifest?.architecture?.rules ?? config.rules;
  const manifestIntentLayers = intentLayersFromManifest(manifest);
  const compilerOptionsFor = createCompilerOptionsLookup(ts, root, args.tsconfig);
  const moduleHost = createModuleResolutionHost(ts);
  const files = config.include.flatMap((entry) => walk(path.join(root, entry)));
  const violations = [];
  const warnings = collectConfigWarnings(root, config, files, rules, manifest);
  const cacheKey = args.noCache ? undefined : scanCacheKey(root, args);
  const cachedFiles = cacheKey ? loadScanCache(root, cacheKey) : undefined;
  const nextCacheFiles = {};

  // Parses one file and returns its cacheable scan result: violations derived purely from
  // the file's content (+config/manifest, hashed into the cache key) and the module-edge
  // specifiers found, which the driver loop below resolves fresh on every run.
  function scanSourceFile(file, sourceLayer) {
    const source = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const violations = [];
    const edges = [];

    const layerConfig = config.layers.find((layer) => layer.name === sourceLayer);
    const forbiddenGlobals = Array.isArray(layerConfig?.forbiddenGlobals)
      ? layerConfig.forbiddenGlobals.filter((entry) => typeof entry === 'string')
      : [];
    for (const use of collectForbiddenGlobalUses(ts, sourceFile, forbiddenGlobals)) {
      violations.push({
        ruleId: 'FORBIDDEN_GLOBAL',
        file: normalize(path.relative(root, file)),
        line: lineOf(sourceFile, use.node.getStart(sourceFile)),
        fromLayer: sourceLayer,
        target: use.name,
        message: `${sourceLayer} must not use the ambient global "${use.name}".`,
      });
    }

    const checkModuleEdge = (specifier, node, kind) => {
      edges.push({ specifier, line: lineOf(sourceFile, node.getStart(sourceFile)), kind });
    };

    const visit = (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = textOfModuleSpecifier(node);
        if (specifier) {
          checkModuleEdge(specifier, node, ts.isImportDeclaration(node) ? 'import' : 'export');
        }
      }

      if (ts.isCallExpression(node)) {
        const moduleCall = moduleSpecifierFromCall(ts, node);
        if (moduleCall) {
          checkModuleEdge(moduleCall.value, node, moduleCall.kind);
        }

        if (isPublishCall(ts, node)) {
          const firstArg = node.arguments[0];
          const rawIntent = stringLiteralText(ts, firstArg);
          if (
            (rawIntent && looksLikeIntent(rawIntent)) ||
            objectHasProperty(ts, firstArg, 'intent')
          ) {
            violations.push({
              ruleId: 'RAW_EVENT_PUBLISH',
              file: normalize(path.relative(root, file)),
              line: lineOf(sourceFile, node.getStart(sourceFile)),
              message:
                'Publish through a registered intent creator; raw event objects or intent strings bypass Ark contracts and tooling.',
            });
          }

          if (isArkPublishCandidate(ts, node) && !publishHasSource(ts, node)) {
            violations.push({
              ruleId: 'PUBLISH_MISSING_SOURCE',
              file: normalize(path.relative(root, file)),
              line: lineOf(sourceFile, node.getStart(sourceFile)),
              fromLayer: sourceLayer,
              message: 'Strict Ark publish calls must include metadata.source.',
            });
          }

          const sourceIntent = publishSourceLiteral(ts, node);
          if (sourceIntent && looksLikeIntent(sourceIntent)) {
            const sourceIntentLayer = layerForIntent(
              sourceIntent,
              config.layers,
              manifestIntentLayers
            );
            if (sourceIntentLayer && sourceIntentLayer !== sourceLayer) {
              violations.push({
                ruleId: 'PUBLISH_SOURCE_LAYER_MISMATCH',
                file: normalize(path.relative(root, file)),
                line: lineOf(sourceFile, node.getStart(sourceFile)),
                fromLayer: sourceLayer,
                toLayer: sourceIntentLayer,
                target: sourceIntent,
                message:
                  `Publish source "${sourceIntent}" resolves to ${sourceIntentLayer}, but the publishing file is classified as ${sourceLayer}.`,
              });
            }
          }
        }
      }

      if (ts.isStringLiteralLike(node) && looksLikeIntent(node.text)) {
        const targetLayer = layerForIntent(node.text, config.layers, manifestIntentLayers);
        const rule = targetLayer ? isBlocked(rules, sourceLayer, targetLayer) : undefined;
        if (rule) {
          violations.push({
            ruleId: 'LAYER_INTENT_REFERENCE_VIOLATION',
            file: normalize(path.relative(root, file)),
            line: lineOf(sourceFile, node.getStart(sourceFile)),
            fromLayer: sourceLayer,
            toLayer: targetLayer,
            target: node.text,
            message:
              rule.message ??
              `${sourceLayer} must not reference ${targetLayer} intent ${node.text}.`,
          });
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return { contentViolations: violations, edges };
  }

  const importGraph = new Map();
  for (const file of files) {
    const sourceLayer = layerForFile(root, file, config.layers);
    if (!sourceLayer) continue;
    const relFile = normalize(path.relative(root, file));
    if (!importGraph.has(relFile)) importGraph.set(relFile, new Set());
    const stat = fs.statSync(file);
    const fileKey = `${stat.mtimeMs}:${stat.size}`;
    const cached = cachedFiles?.[relFile];
    const entry =
      cached && cached.fileKey === fileKey
        ? cached
        : { fileKey, ...scanSourceFile(file, sourceLayer) };
    nextCacheFiles[relFile] = entry;

    violations.push(...entry.contentViolations);
    for (const edge of entry.edges) {
      const target = resolveImport(ts, edge.specifier, file, compilerOptionsFor(file), moduleHost, root);
      const targetLayer = target ? layerForFile(root, target, config.layers) : undefined;
      if (target && targetLayer) {
        const relTarget = normalize(path.relative(root, target));
        if (relTarget !== relFile) importGraph.get(relFile).add(relTarget);
      }
      const rule = targetLayer ? isBlocked(rules, sourceLayer, targetLayer) : undefined;
      if (rule) {
        violations.push({
          ruleId: 'LAYER_IMPORT_VIOLATION',
          file: relFile,
          line: edge.line,
          fromLayer: sourceLayer,
          toLayer: targetLayer,
          target: normalize(path.relative(root, target)),
          message: rule.message ?? `${sourceLayer} must not ${edge.kind} ${targetLayer}.`,
        });
      }
    }
  }

  if (cacheKey) saveScanCache(root, cacheKey, nextCacheFiles);

  violations.push(...detectCycles(importGraph));

  if (args.updateBaseline) {
    const { fullPath, count } = writeBaseline(root, args.baseline, violations);
    console.log(`Wrote ${fullPath} with ${count} frozen violation key(s).`);
    console.log('Commit it and gate CI with: ark-check --baseline (only NEW violations fail).');
    return;
  }

  let suppressed = [];
  let activeViolations = violations;
  let staleBaselineKeys = 0;
  if (args.baseline) {
    const baseline = readBaseline(root, args.baseline);
    if (baseline.exists) {
      suppressed = violations.filter((violation) => baseline.keys.has(baselineKey(violation)));
      activeViolations = violations.filter(
        (violation) => !baseline.keys.has(baselineKey(violation))
      );
      const currentKeys = new Set(violations.map(baselineKey));
      staleBaselineKeys = [...baseline.keys].filter((key) => !currentKeys.has(key)).length;
    } else {
      warnings.push(
        configWarning(
          'BASELINE_NOT_FOUND',
          `Baseline file not found: ${baseline.fullPath}. Generate it with: ark-check --update-baseline`
        )
      );
    }
  }

  const ok = activeViolations.length === 0 && (!args.strictConfig || warnings.length === 0);
  const skillGaps = detectSkillGaps(root);

  if (args.report) {
    const exampleByLayer = new Map();
    for (const file of files) {
      const layer = layerForFile(root, file, config.layers);
      if (layer && !exampleByLayer.has(layer)) {
        exampleByLayer.set(layer, normalize(path.relative(root, file)));
      }
    }
    const html = renderHtmlReport({
      root,
      config,
      exampleByLayer,
      violations: activeViolations,
      warnings,
      ok,
      suppressed: suppressed.length,
    });
    const reportPath = path.isAbsolute(args.report) ? args.report : path.join(root, args.report);
    fs.writeFileSync(reportPath, html);
    if (!args.json) {
      console.log(`${color.green('✎')} Wrote HTML report: ${path.relative(root, reportPath) || reportPath}`);
    }
  }

  if (args.json) {
    console.log(JSON.stringify({
      ok,
      violations: activeViolations,
      suppressedViolations: suppressed.length,
      staleBaselineKeys,
      warnings,
      ...(skillGaps.length > 0 ? { skillGaps } : {}),
    }, null, 2));
  } else {
    for (const warning of warnings) {
      console.error(`${color.yellow('warning')} ${warning.ruleId} ${warning.message}`);
    }
    for (const violation of activeViolations) {
      printViolation(violation);
    }

    const baselineNote =
      suppressed.length > 0 ? ` (${suppressed.length} suppressed by baseline)` : '';
    if (staleBaselineKeys > 0) {
      console.error(
        color.dim(
          `${staleBaselineKeys} baseline entr(y/ies) no longer occur — tighten the ratchet with: ark-check --update-baseline`
        )
      );
    }
    if (activeViolations.length === 0) {
      if (warnings.length === 0) {
        console.log(`${color.green('✔')} Ark check passed.${baselineNote}`);
      } else if (args.strictConfig) {
        console.error(
          `${color.red('✖')} Ark check failed with ${warnings.length} config warning(s).${baselineNote}`
        );
      } else {
        console.log(
          `${color.green('✔')} Ark check passed with ${warnings.length} config warning(s).${baselineNote}`
        );
      }
    } else {
      console.error(
        `${color.red('✖')} ${activeViolations.length} violation(s).${baselineNote}`
      );
    }

    if (skillGaps.length > 0) {
      const missingTotal = skillGaps.reduce((sum, gap) => sum + gap.missing, 0);
      const staleTotal = skillGaps.reduce((sum, gap) => sum + gap.stale, 0);
      const tools = skillGaps.map((gap) => gap.tool).join(', ');
      if (missingTotal > 0) {
        console.log(
          color.dim(
            `${missingTotal} /ark-* skill(s) not installed for ${tools} (this Ark version ships them). ` +
              `Install: npx ark-check --install-agent-gates`
          )
        );
      }
      if (staleTotal > 0) {
        // Stale skills already exist, so refreshing needs --force. --skills-only
        // scopes the overwrite to the canonical skills, leaving a customized
        // AGENTS.md / settings / CI untouched (a bare --force would clobber them).
        console.log(
          color.dim(
            `${staleTotal} /ark-* skill(s) outdated for ${tools} (this Ark ships newer versions). ` +
              `Refresh: npx ark-check --install-agent-gates --skills-only --force`
          )
        );
      }
    }
  }

  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
