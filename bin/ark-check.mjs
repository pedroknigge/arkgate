#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_RULES,
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
    baseline: undefined,
    updateBaseline: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--strict-config') args.strictConfig = true;
    else if (arg === '--require-gates') args.requireGates = true;
    else if (arg === '--init') args.init = true;
    else if (arg === '--install-agent-gates') args.installAgentGates = true;
    else if (arg === '--tools') {
      const next = argv[++i];
      args.tools = (next ?? '')
        .split(',')
        .map((tool) => tool.trim().toLowerCase())
        .filter(Boolean);
    }
    else if (arg === '--force') args.force = true;
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
    'Usage: ark-check --root <project> --config <ark.config.json> [--manifest <ark.manifest.json>] [--tsconfig <tsconfig.json>] [--strict-config] [--require-gates] [--json] [--baseline [file]]',
    '       ark-check --init [--force]',
    '       ark-check --install-agent-gates [--tools claude,cursor,codex] [--force]',
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
    '',
    'Resolves relative, tsconfig path-alias, and package imports via the TypeScript',
    'module resolver, then checks each resolved cross-layer import against the rules.',
    'If no tsconfig is found, path aliases are unavailable but relative/package imports',
    'still resolve.',
    '',
    'Config shape:',
    '{',
    '  "include": ["src"],',
    '  "layers": [',
    '    { "name": "DomainModel", "patterns": ["src/domain/**"], "intentPrefixes": ["Domain."] }',
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
    'project, plus tool-specific templates. Pass --tools claude,cursor,codex to pick',
    'which tool configs to write; otherwise they are auto-detected from .claude/ and',
    '.cursor/ (all are written when nothing is detected).',
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
  return '"check:architecture": "node bin/ark-check.mjs --root . --config ark.config.json --strict-config"';
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

function runInit(args) {
  const configPath = path.isAbsolute(args.config)
    ? args.config
    : path.join(args.root, args.config);

  if (fs.existsSync(configPath) && !args.force) {
    console.error(`${configPath} already exists. Re-run with --force to overwrite it.`);
    process.exitCode = 2;
    return;
  }

  const { srcDir, config } = detectConfig(args.root);
  if (config.layers.length === 0) {
    console.error(
      [
        'No conventional layer directories found (looked for src/domain, src/application,',
        'src/adapters/persistence, ...). Generate the full template instead and adapt the',
        'patterns to your layout:',
        '  ark-check --print-config eleven-layer > ark.config.json',
      ].join('\n')
    );
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  console.log(`Wrote ${configPath}`);
  console.log('');
  console.log('Detected layers:');
  for (const layer of config.layers) {
    console.log(`  ${layer.name}: ${layer.patterns.join(', ')}`);
  }
  const uncovered = uncoveredDirectories(args.root, srcDir, config.layers);
  if (uncovered.length > 0) {
    console.log('');
    console.log(
      `Not covered by any layer (add patterns for these or they stay ungoverned): ${uncovered.join(', ')}`
    );
  }
  console.log('');
  console.log('Next steps:');
  console.log('  1. CI gate:        npx ark-check --root . --config ark.config.json --strict-config');
  console.log('  2. AI write gate:  npx ark-mcp --root . --config ark.config.json');
  console.log('     (bind its validate_code tool to your agent\'s pre-write hook — see README)');
  if (!hasCheckArchitectureScript(args.root)) {
    console.log('  3. Add the npm alias if you want `npm run check:architecture`:');
    console.log(`     ${checkArchitectureScriptSnippet()}`);
  }
}

function ensureDirForFile(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function writeTemplate(root, relativePath, content, force) {
  const fullPath = path.join(root, relativePath);
  if (fs.existsSync(fullPath) && !force) {
    return { relativePath, status: 'skipped' };
  }
  ensureDirForFile(fullPath);
  fs.writeFileSync(fullPath, content);
  return { relativePath, status: fs.existsSync(fullPath) ? 'written' : 'failed' };
}

function packageManager(root) {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
    return {
      cache: 'pnpm',
      setup: ['corepack enable'],
      install: 'pnpm install --frozen-lockfile',
      run: 'pnpm exec ark-check --root . --config ark.config.json --strict-config --require-gates',
    };
  }
  if (fs.existsSync(path.join(root, 'yarn.lock'))) {
    return {
      cache: 'yarn',
      setup: ['corepack enable'],
      install: 'yarn install --frozen-lockfile',
      run: 'yarn ark-check --root . --config ark.config.json --strict-config --require-gates',
    };
  }
  return {
    cache: 'npm',
    setup: [],
    install: fs.existsSync(path.join(root, 'package-lock.json')) ? 'npm ci' : 'npm install',
    run: 'npx ark-check --root . --config ark.config.json --strict-config --require-gates',
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

function agentInstructions() {
  const steps = AGENT_CONTRACT.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  return `# Ark Enforcement

Before editing TypeScript or JavaScript source files:

${steps}

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

function githubWorkflow(pm) {
  const setupSteps = pm.setup.map((command) => `      - run: ${command}`).join('\n');
  return `name: Ark architecture gate

on:
  pull_request:
  push:
    branches: [main, master]

jobs:
  ark-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: ${pm.cache}
${setupSteps ? `${setupSteps}\n` : ''}      - run: ${pm.install}
      - run: ${pm.run}
`;
}

function claudeSettings() {
  return `${JSON.stringify({
    hooks: {
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
  if (fs.existsSync(path.join(root, '.codex'))) {
    detected.add('codex');
  }
  // No signal at all: fall back to writing every tool's templates so a fresh
  // project still gets a complete, reviewable starter set.
  if (detected.size === 0) {
    return new Set(['claude', 'cursor', 'codex']);
  }
  return detected;
}

function runInstallAgentGates(args) {
  const root = args.root;
  const pm = packageManager(root);
  const hasCheckScript = hasCheckArchitectureScript(root);
  const tools = resolveTools(args);
  const templates = [
    // Base gates: tool-agnostic contract + CI backstop, always written.
    ['AGENTS.md', agentInstructions()],
    ['.mcp.json', mcpJson()],
    ['.github/workflows/ark-check.yml', githubWorkflow(pm)],
  ];
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

  const results = templates.map(([relativePath, content]) =>
    writeTemplate(root, relativePath, content, args.force)
  );

  console.log('Ark agent gate templates:');
  for (const result of results) {
    const marker =
      result.status === 'written' ? 'wrote' : result.status === 'failed' ? 'FAILED' : 'skipped';
    console.log(`  ${marker.padEnd(7)} ${result.relativePath}`);
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

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, files);
    } else if (/\.[cm]?[tj]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
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

function loadCompilerOptions(ts, root, tsconfigArg) {
  const configPath = tsconfigArg
    ? path.isAbsolute(tsconfigArg)
      ? tsconfigArg
      : path.join(root, tsconfigArg)
    : ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath || !fs.existsSync(configPath)) return {};
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) return {};
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
  return parsed.options;
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
 * pattern (`**`) can't false-flag vendored deps or files outside the project. For monorepos,
 * run ark-check per package rather than reaching across package roots.
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

// ponytail: baseline keys exclude the line number so unrelated edits that shift lines
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
  const compilerOptions = loadCompilerOptions(ts, root, args.tsconfig);
  const moduleHost = createModuleResolutionHost(ts);
  const files = config.include.flatMap((entry) => walk(path.join(root, entry)));
  const violations = [];
  const warnings = collectConfigWarnings(root, config, files, rules, manifest);

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const sourceLayer = layerForFile(root, file, config.layers);
    if (!sourceLayer) continue;

    const checkModuleEdge = (specifier, node, kind) => {
      const target = resolveImport(ts, specifier, file, compilerOptions, moduleHost, root);
      const targetLayer = target ? layerForFile(root, target, config.layers) : undefined;
      const rule = targetLayer ? isBlocked(rules, sourceLayer, targetLayer) : undefined;
      if (rule) {
        violations.push({
          ruleId: 'LAYER_IMPORT_VIOLATION',
          file: normalize(path.relative(root, file)),
          line: lineOf(sourceFile, node.getStart(sourceFile)),
          fromLayer: sourceLayer,
          toLayer: targetLayer,
          target: normalize(path.relative(root, target)),
          message:
            rule.message ??
            `${sourceLayer} must not ${kind} ${targetLayer}.`,
        });
      }
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
  }

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

  if (args.json) {
    console.log(JSON.stringify({
      ok,
      violations: activeViolations,
      suppressedViolations: suppressed.length,
      staleBaselineKeys,
      warnings,
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
  }

  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
