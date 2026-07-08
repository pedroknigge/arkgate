#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __arkCheckCli = fileURLToPath(import.meta.url);

import {
  DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_RULES,
  applyFrameworkLayoutOverlays,
  arkCommand,
  collectForbiddenGlobalUses,
  ADOPTION_PLAN_FILENAME,
  buildArchitectureRecommendation,
  createElevenLayerConfig,
  enrichViolationWithFixClass,
  listPolicyPackIds,
  loadPolicyPackMeta,
  writeAdoptionPlan,
  classifyRemediation,
  detectPackageManager,
  execCommandParts,
  execRunner,
  formatArchitectureRecommendationHuman,
  globToRegExp,
  installDevHint,
  presentLockfiles,
  layerForFile,
  looksLikeIntent,
  patternSpecificity,
  resolveIntentLayer,
  resolveOperatingMode,
  shouldShowNewHereNudge,
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
    coverage: false,
    migrateCommands: false,
    doctor: false,
    plan: false,
    recommend: false,
    writePlan: false,
    listPolicyPacks: false,
    applyPolicyPack: undefined,
    watch: false,
    beginner: false,
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
    else if (arg === '--coverage') args.coverage = true;
    else if (arg === '--doctor') args.doctor = true;
    else if (arg === '--plan') args.plan = true;
    else if (arg === '--recommend') args.recommend = true;
    else if (arg === '--write-plan') args.writePlan = true;
    else if (arg === '--list-policy-packs') args.listPolicyPacks = true;
    else if (arg === '--apply-policy-pack') args.applyPolicyPack = argv[++i];
    else if (arg === '--watch') args.watch = true;
    else if (arg === '--beginner') args.beginner = true;
    else if (arg === '--codex-home') args.codexHome = true;
    else if (arg === '--migrate-commands') args.migrateCommands = true;
    else if (arg === '--no-cache') args.noCache = true;
    else if (arg === '--report') {
      const next = argv[i + 1];
      args.report = next && !next.startsWith('-') ? argv[++i] : 'ark-report.html';
    }
    else if (arg === '--reset-origin') args.resetOrigin = true;
    else if (arg === '--no-archive') args.noArchive = true;
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
    '       ark-check --coverage [--json]          per-layer file counts + full unclassified list (report only, exit 0)',
    '       ark-check --plan [--json]              classified remediation plan (mechanical-safe / judgment / deferred) + goal; report only',
    '       ark-check --recommend [--json] [--write-plan]  application-shape plan; --write-plan emits ark-adoption-plan.json',
    '       ark-check --list-policy-packs            enthusiast preset configs (hexagonal, layered, feature-sliced, monorepo)',
    '       ark-check --apply-policy-pack <id> [--force]  write ark.config.json from templates/policy-packs/ (uses preset factory)',
    '       ark-check --watch                      re-run the check when governed files change (debounced)',
    '       ark-check --report [file.html] [--beginner] [--reset-origin] [--no-archive]',
    '           HTML report + snapshots under .ark/reports/ (origin once, latest each run, history JSON)',
    '       ark-check --init [--preset hexagonal|layered|feature-sliced|monorepo] [--force]',
    '       ark-check --install-agent-gates [--tools claude,cursor,codex,grok] [--skills-only] [--codex-home] [--force]',
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
    'project, plus tool-specific templates. Known tools: claude, cursor, codex, grok',
    '(full MCP/hook gates) and windsurf, cline, copilot, kiro, roo, continue, gemini',
    '(instruction-tier rule files derived from the same contract).',
    'It also installs the /ark-* skills shipped in templates/skills/ into each',
    'detected tool\'s command location (.claude/skills/, .cursor/commands/,',
    '.codex/prompts/, .grok/skills/, .windsurf/workflows/, .clinerules/workflows/,',
    '.github/prompts/).',
    'Kiro, Roo, Continue, and Gemini have no command mechanism and receive only their',
    'rule file. Existing files are never overwritten without --force, so re-running',
    'after an update only adds what is missing. --skills-only restricts the write to',
    'just the /ark-* skills (safe to --force-refresh — it leaves a customized AGENTS.md,',
    'settings, and CI workflow untouched).',
    'Pass --tools to pick which tool configs to write; otherwise they are auto-detected',
    'from their config directories (.claude/, .cursor/, .codex/, .grok/, .windsurf/,',
    '.clinerules/, .kiro/, .roo/, .continue/, .gemini/; copilot is explicit-only).',
    'claude+cursor+codex are written when nothing is detected.',
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
];
const REQUIRED_GATE_WORKFLOW = '.github/workflows/*.yml running ark-check';

function hasArkWorkflow(root) {
  const workflowsDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return false;
  return fs
    .readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/i.test(file))
    .some((file) => {
      try {
        const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
        return /\bark-check\b/.test(content) || /\bcheck:architecture\b/.test(content);
      } catch {
        return false;
      }
    });
}

function missingGates(root) {
  const missing = REQUIRED_GATE_FILES.filter(
    (relativePath) => !fs.existsSync(path.join(root, relativePath))
  );
  if (!hasArkWorkflow(root)) missing.push(REQUIRED_GATE_WORKFLOW);
  return missing;
}

function checkArchitectureScriptSnippet(root) {
  // The package manager's runner resolves the installed binary; `node bin/ark-check.mjs`
  // only works inside Ark's own repo. Package-manager aware so a pnpm/yarn repo isn't
  // handed an `npx` alias that violates its "never npx" policy.
  return `"check:architecture": "${arkCheckCommand(root)}"`;
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

// Reads workspace globs from package.json (npm/yarn/bun `workspaces`, array or
// `{ packages: [] }`) and pnpm-workspace.yaml, returning the distinct base directories
// (the glob prefix before the first `*`), e.g. "packages/*" -> "packages". Empty when
// the project declares no workspaces — the signal that says "this is a monorepo".
function detectWorkspaces(root) {
  const dirs = new Set();
  const addGlob = (glob) => {
    if (typeof glob !== 'string') return;
    const beforeStar = glob.split('*')[0].replace(/\/+$/, '');
    if (beforeStar && beforeStar !== '.') dirs.add(normalize(beforeStar));
  };
  const pkg = readPackageJson(root);
  const ws = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages;
  if (Array.isArray(ws)) ws.forEach(addGlob);
  const pnpmFile = path.join(root, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmFile)) {
    // Minimal read (no YAML dep): collect list items under the top-level `packages:` key
    // ONLY. pnpm files also carry other list-valued keys (onlyBuiltDependencies, catalog,
    // …) whose items are NOT workspace globs — a key-agnostic scan would pull those in.
    let inPackages = false;
    for (const line of fs.readFileSync(pnpmFile, 'utf8').split('\n')) {
      const keyMatch = line.match(/^([A-Za-z0-9_-]+):/); // top-level key (no indentation)
      if (keyMatch) {
        inPackages = keyMatch[1] === 'packages';
        continue;
      }
      if (!inPackages) continue;
      const item = line.match(/^\s+-\s*['"]?([^'"#]+?)['"]?\s*$/); // indented list item
      if (item) addGlob(item[1].trim());
    }
  }
  return [...dirs];
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
//
// Framework internals live under conventional names like `kernel/` and are NOT application
// architecture — a broad `src/**/domain/**` would otherwise swallow `src/kernel/domain`
// (DI/runtime wiring) and fire domain-purity rules on it, the false-positive class that
// motivated `exclude`. Carve those out of every wildcard preset layer by default; a config
// author who really does keep app code under kernel/ can drop the exclude.
const FRAMEWORK_INTERNAL_EXCLUDE = ['**/kernel/**'];
function presetWithOverlays(baseConfig, root) {
  if (!root) return baseConfig;
  return applyFrameworkLayoutOverlays(baseConfig, root);
}

const ARCHITECTURE_PRESETS = {
  // Second arg `root` is optional — when provided (init/start on a real repo), framework
  // filename conventions (Nest/Next/express) are overlaid so starters get real governed%.
  hexagonal: (_workspaces, root) =>
    presetWithOverlays(
      {
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            description: 'Pure business rules and entities. No I/O, no framework, no ambient globals.',
            patterns: ['src/**/domain/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description: 'Use cases that coordinate the domain through ports. No I/O of its own.',
            patterns: ['src/**/application/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PresentationAdapters',
            description: 'Entrypoints — HTTP routes, controllers, UI. Drives use cases.',
            patterns: [
              'src/**/presentation/**',
              'src/**/controllers/**',
              'src/**/interface-adapters/**',
              'src/**/http/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Implements ports with real infrastructure: DB, external APIs, filesystem.',
            patterns: [
              'src/**/infrastructure/**',
              'src/**/adapters/**',
              'src/**/persistence/**',
              'src/**/repositories/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
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
      },
      root
    ),
  layered: (_workspaces, root) =>
    presetWithOverlays(
      {
        include: ['src'],
        layers: [
          {
            name: 'PresentationAdapters',
            description: 'UI and API entrypoints.',
            patterns: [
              'src/**/presentation/**',
              'src/**/controllers/**',
              'src/**/ui/**',
              'src/**/http/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description: 'Business services and use-case coordination.',
            patterns: ['src/**/application/**', 'src/**/services/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
          {
            name: 'DomainModel',
            description: 'Pure business rules and entities. No I/O, no framework, no ambient globals.',
            patterns: ['src/**/domain/**'],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Data access and infrastructure.',
            patterns: [
              'src/**/persistence/**',
              'src/**/data/**',
              'src/**/repositories/**',
              'src/**/infrastructure/**',
            ],
            exclude: FRAMEWORK_INTERNAL_EXCLUDE,
            optional: true,
          },
        ],
        rules: denyUpward([
          'PresentationAdapters',
          'ApplicationOrchestration',
          'DomainModel',
          'PersistenceAdapters',
        ]),
      },
      root
    ),
  'feature-sliced': (_workspaces, root) => {
    const order = ['App', 'Pages', 'Widgets', 'Features', 'Entities', 'Shared'];
    const purpose = {
      App: 'App-wide setup, providers, and routing.',
      Pages: 'Route-level compositions.',
      Widgets: 'Self-contained UI blocks composed from features and entities.',
      Features: 'User-facing feature units.',
      Entities: 'Business entities with their UI and logic.',
      Shared: 'Reusable primitives with no business knowledge.',
    };
    return presetWithOverlays(
      {
        include: ['src'],
        layers: order.map((name) => ({
          name,
          description: purpose[name],
          patterns: [`src/${name.toLowerCase()}/**`],
          optional: true,
        })),
        rules: denyUpward(order),
      },
      root
    );
  },
  // Cross-package profile for workspace monorepos. Patterns match by directory NAME
  // anywhere in the tree (`**/domain/**` hits packages/x/domain AND apps/y/src/domain),
  // so one profile governs every package. include defaults to the detected workspace
  // roots (falls back to packages+apps). Naming varies by repo — adjust and re-check.
  monorepo: (includeDirs, root) =>
    presetWithOverlays(
      {
        include: includeDirs && includeDirs.length > 0 ? includeDirs : ['packages', 'apps'],
        layers: [
          {
            name: 'DomainModel',
            description:
              'Pure business rules and entities, in any package. No I/O, no framework, no ambient globals.',
            patterns: ['**/domain/**', '**/entities/**'],
            forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            description: 'Use cases and services that coordinate the domain through ports.',
            patterns: ['**/application/**', '**/use-cases/**', '**/services/**'],
            optional: true,
          },
          {
            name: 'PresentationAdapters',
            description: 'Entrypoints — HTTP routes, controllers, UI, framework app/pages dirs.',
            patterns: [
              '**/app/**',
              '**/pages/**',
              '**/components/**',
              '**/controllers/**',
              '**/http/**',
              '**/routes/**',
            ],
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            description: 'Implements ports with real infrastructure: DB, external APIs, filesystem.',
            patterns: [
              '**/infrastructure/**',
              '**/adapters/**',
              '**/persistence/**',
              '**/repositories/**',
            ],
            optional: true,
          },
        ],
        rules: [
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          { from: 'ApplicationOrchestration', to: 'PresentationAdapters', allowed: false },
          { from: 'PresentationAdapters', to: 'PersistenceAdapters', allowed: false },
          { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
        ],
      },
      root
    ),
};

// ── Layer suggestion engine ──────────────────────────────────────────────────
// Everything here is HARVESTED from Ark's own canonical sources — the 11-layer defaults
// (DEFAULT_LAYER_DIRECTORIES) and the named presets — so a suggestion can never drift from
// what the gate actually enforces. No ad-hoc directory heuristics: a directory Ark doesn't
// already know about is reported as "unrecognized — you classify", never guessed. This is
// what lets `init`/`--coverage` PROPOSE where ungoverned code belongs instead of silently
// leaving the majority of a repo ungoverned behind a false-green check.
const CANONICAL_LAYER_NAMES = new Set(DEFAULT_INTENT_PREFIXES.map((entry) => entry.layer));

function dirSegmentsFromGlob(pattern) {
  return String(pattern)
    .split('/')
    .filter((segment) => segment && !segment.includes('*'));
}

let _layerByDir;
// Map<dirBasename, string[] layers>. A basename mapping to >1 layer (e.g. `app` — Application
// orchestration in the 11-layer defaults, but Presentation in the monorepo/Next preset) is
// genuinely ambiguous; every candidate is surfaced rather than silently picked.
function layerByDir() {
  if (_layerByDir) return _layerByDir;
  const map = new Map();
  const add = (segment, layer) => {
    if (!segment) return;
    const existing = map.get(segment) ?? [];
    if (!existing.includes(layer)) existing.push(layer);
    map.set(segment, existing);
  };
  for (const [layer, dirs] of Object.entries(DEFAULT_LAYER_DIRECTORIES)) {
    for (const dir of dirs) add(dirSegmentsFromGlob(dir).pop(), layer);
  }
  // The canonical-named presets reuse the 11 layer names, so their directory synonyms
  // (services→Application, components/pages→Presentation, data/infrastructure→Persistence…)
  // map cleanly onto the same taxonomy. feature-sliced uses a different vocabulary
  // (Widgets/Entities/…) that doesn't reduce to the 11, so it's covered by model-fit, not here.
  for (const preset of ['hexagonal', 'layered', 'monorepo']) {
    for (const layer of ARCHITECTURE_PRESETS[preset]([]).layers) {
      if (!CANONICAL_LAYER_NAMES.has(layer.name)) continue;
      for (const pattern of layer.patterns ?? []) {
        add(dirSegmentsFromGlob(pattern).pop(), layer.name);
      }
    }
  }
  _layerByDir = map;
  return map;
}

// Suggest a canonical layer for a directory by its basename. null when Ark doesn't recognize
// it (the honest "you classify this" case), else { layer, alternatives }.
function suggestLayerForDir(name) {
  const layers = layerByDir().get(name);
  if (!layers || layers.length === 0) return null;
  return { layer: layers[0], alternatives: layers.slice(1) };
}

// Suggest a layer for a directory PATH by finding the deepest segment Ark recognizes, so
// `src/lib/repositories` proposes PersistenceAdapters even though `lib` itself is unknown.
function suggestLayerForPath(relDir) {
  const segments = relDir.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const hit = suggestLayerForDir(segments[i]);
    if (hit) return { ...hit, matchedDir: segments[i] };
  }
  return null;
}

// Which starter model does this set of directory basenames most resemble? Scored purely by
// how many of the repo's directories each preset's patterns recognize — a hint toward
// `ark init --preset <name>`. null when nothing lines up.
function detectBestFitModel(dirBasenames) {
  const present = new Set(dirBasenames);
  const scored = ['hexagonal', 'layered', 'feature-sliced', 'monorepo'].map((name) => {
    const segments = new Set();
    for (const layer of ARCHITECTURE_PRESETS[name]([]).layers) {
      for (const pattern of layer.patterns ?? []) {
        const seg = dirSegmentsFromGlob(pattern).pop();
        if (seg) segments.add(seg);
      }
    }
    let hits = 0;
    for (const dir of present) if (segments.has(dir)) hits += 1;
    return { name, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  return scored[0].hits > 0 ? scored[0] : null;
}

// Group ungoverned files by their parent directory and attach a proposed layer (or the
// honest "unrecognized"). The single source the coverage report and init both format.
function buildUnclassifiedSuggestions(unclassifiedRelFiles) {
  const byDir = new Map();
  for (const rel of unclassifiedRelFiles) {
    const dir = rel.split('/').slice(0, -1).join('/') || '.';
    byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
  }
  return [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir, files]) => {
    const hit = suggestLayerForPath(dir);
    return hit
      ? {
          dir,
          files,
          layer: hit.layer,
          ...(hit.alternatives.length > 0 ? { alternatives: hit.alternatives } : {}),
        }
      : { dir, files, unrecognized: true };
  });
}

// For `init`: propose a layer for every ungoverned top-level directory, descending one level
// into unrecognized ones so `lib/repositories`, `lib/db` etc. still get a concrete proposal
// instead of a blanket "lib is ungoverned".
function proposeForUncovered(root, srcDir, layers) {
  const proposals = [];
  for (const top of uncoveredDirectories(root, srcDir, layers)) {
    const direct = suggestLayerForDir(top);
    if (direct) {
      proposals.push({ dir: `${srcDir}/${top}`, ...direct });
      continue;
    }
    let children = [];
    try {
      children = fs
        .readdirSync(path.join(root, srcDir, top), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.'))
        .map((e) => e.name);
    } catch {
      /* not a readable directory — treat as unrecognized below */
    }
    if (children.length > 0) {
      // Descend: propose per child so a mixed `lib/` yields lib/repositories → Persistence
      // AND flags lib/db as unrecognized, instead of dropping the parts Ark can't place.
      for (const child of children) {
        const hit = suggestLayerForDir(child);
        proposals.push(
          hit
            ? { dir: `${srcDir}/${top}/${child}`, ...hit }
            : { dir: `${srcDir}/${top}/${child}`, unrecognized: true }
        );
      }
    } else {
      proposals.push({ dir: `${srcDir}/${top}`, unrecognized: true });
    }
  }
  return proposals;
}

function printInitNextSteps(root) {
  console.log('');
  console.log('Next steps:');
  console.log(`  1. CI gate:        ${arkCheckCommand(root)}`);
  console.log(`  2. AI write gate:  ${arkCommand(root, 'ark-mcp', '--root . --config ark.config.json')}`);
  console.log('     (bind its validate_code tool to your agent\'s pre-write hook — see README)');
  if (!hasCheckArchitectureScript(root)) {
    console.log('  3. Add the package.json alias if you want `run check:architecture`:');
    console.log(`     ${checkArchitectureScriptSnippet(root)}`);
  }
}

function buildConfigFromPolicyPack(packId, root) {
  const pack = loadPolicyPackMeta(packId);
  const factory = ARCHITECTURE_PRESETS[pack.preset];
  if (!factory) {
    throw new Error(
      `Policy pack "${packId}" references unknown preset "${pack.preset}".`
    );
  }
  const workspaces = pack.preset === 'monorepo' ? detectWorkspaces(root) : [];
  const config = factory(workspaces, root);
  if (pack.layerDescriptions) {
    for (const layer of config.layers) {
      const enthusiast = pack.layerDescriptions[layer.name];
      if (enthusiast) layer.description = enthusiast;
    }
  }
  return { pack, config };
}

function runListPolicyPacks(args) {
  const ids = listPolicyPackIds();
  if (args.json) {
    const packs = ids.map((id) => {
      const meta = loadPolicyPackMeta(id);
      return {
        id: meta.id,
        preset: meta.preset,
        variant: meta.variant,
        label: meta.label,
        summary: meta.summary,
        phases: meta.phases,
      };
    });
    console.log(JSON.stringify({ ok: true, packs }, null, 2));
    return;
  }
  console.log('Enthusiast policy packs (apply with --apply-policy-pack <id>):');
  for (const id of ids) {
    const meta = loadPolicyPackMeta(id);
    console.log(`  ${meta.id} — ${meta.label} (preset: ${meta.preset})`);
    if (meta.summary) console.log(`    ${meta.summary}`);
  }
}

function runApplyPolicyPack(args) {
  const configPath = path.isAbsolute(args.config)
    ? args.config
    : path.join(args.root, args.config);

  if (fs.existsSync(configPath) && !args.force) {
    console.error(
      `${configPath} already exists. Re-run with --force to overwrite, or use /ark-contract to evolve it.`
    );
    process.exitCode = 2;
    return;
  }

  try {
    const { pack, config } = buildConfigFromPolicyPack(args.applyPolicyPack, args.root);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            pack: pack.id,
            preset: pack.preset,
            configPath,
            phases: pack.phases,
          },
          null,
          2
        )
      );
    } else {
      console.log(`Wrote ${configPath} (${pack.label})`);
      console.log(`Preset: ${pack.preset}. Phase 1: ${(pack.phases?.['1'] ?? []).join(', ')}`);
      console.log(`Verify: ${arkCommand(args.root, 'ark-check', '--root . --config ark.config.json --strict-config')}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.json) {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      console.error(message);
    }
    process.exitCode = 2;
  }
}

// A repo this size is not greenfield; a "starter" contract needs judgment `ark init` can't apply.
const BROWNFIELD_FILE_THRESHOLD = 150;
// Below this, the starter governs too thin a slice to be the real contract.
const THIN_COVERAGE_PERCENT = 50;

// `ark init` scaffolds a starter contract from conventional directory names (preset wildcards
// or convention detection). On a MATURE repo that pattern breaks down two ways: (1) most code
// lives in directories that don't match DDD names, so the starter governs a thin slice and a
// green check really means "unchecked"; (2) a broad glob like `src/**/domain/**` can swallow
// framework internals (e.g. src/kernel/domain) and fire domain-purity rules on them — 17
// violations that are a contract mismatch, not real debt. Both are exactly what the adoption
// flow (/ark-adopt) exists to resolve with structure-aware judgment. Detect the case and route
// there instead of leaving the user with a thin or false-red gate. Returns true if it warned.
function maybeWarnBrownfield(root, config) {
  let files;
  try {
    files = (config.include ?? []).flatMap((entry) => walk(path.join(root, entry)));
  } catch {
    return false;
  }
  if (files.length < BROWNFIELD_FILE_THRESHOLD) return false;
  const cov = computeCoverage(root, config, files, config.rules ?? []);
  if (cov.governed.percent >= THIN_COVERAGE_PERCENT) return false;
  console.log('');
  console.log(
    `Heads up — this looks like an existing codebase (${files.length} source files), and this`
  );
  console.log(
    `starter contract governs only ${cov.governed.percent}% of it (${cov.governed.classifiedFiles}/${files.length} files).`
  );
  console.log('`ark init` scaffolds from conventional directory names; on a mature repo that is');
  console.log('usually a thin slice, and a broad domain glob can mis-flag framework internals as');
  console.log('impure domain code (a contract mismatch, not real debt). For a contract aligned to');
  console.log('your actual structure — governing more, with only genuine debt frozen — run adoption:');
  console.log(`  ${arkCommand(root, 'ark-check', '--recommend --write-plan')}   # plan + ark-adoption-plan.json`);
  console.log('  then run /ark-adopt in your agent   # re-scope layers to reality, freeze real debt only');
  console.log(`Inspect what is governed right now: ${arkCommand(root, 'ark-check', '--coverage')}`);
  return true;
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
    const finalConfig = factory(detectWorkspaces(args.root), args.root);
    fs.writeFileSync(configPath, `${JSON.stringify(finalConfig, null, 2)}\n`);
    console.log(`Wrote ${configPath} (${args.preset} preset)`);
    if (finalConfig.frameworkOverlay) {
      console.log(
        `Framework layout overlay applied: ${finalConfig.frameworkOverlay} (filename conventions merged into layer globs).`
      );
    }
    console.log('');
    console.log('Layers (every layer optional, so the strict check passes before the directories exist):');
    for (const layer of finalConfig.layers) {
      console.log(`  ${layer.name}: ${layer.patterns.join(', ')}`);
    }
    if (args.preset === 'monorepo') {
      console.log('');
      console.log(`include: ${finalConfig.include.join(', ')} — patterns match by directory name in any`);
      console.log(`package; adjust to your naming, then verify: ${arkCommand(args.root, 'ark-check', '--coverage')}`);
    }
    maybeWarnBrownfield(args.root, finalConfig);
    printInitNextSteps(args.root);
    return;
  }

  const { srcDir, config } = detectConfig(args.root);
  const greenfield = config.layers.length === 0;
  // When no conventional src/ layout is found, a `workspaces` declaration means this is a
  // monorepo — the src/** 11-layer starter would match nothing there, so use the
  // cross-package monorepo profile anchored at the real workspace roots instead.
  const workspaces = greenfield ? detectWorkspaces(args.root) : [];
  const mode = !greenfield ? 'detected' : workspaces.length > 0 ? 'monorepo' : 'greenfield';
  // Greenfield: anchor the starter profile at src/ (the convention a fresh project will
  // scaffold under) even when src/ doesn't exist yet — the layers are optional, so the
  // check passes today and governance switches on the moment src/domain/ etc. appear.
  // Detected configs also get framework overlays so Nest/Next flat files are classified.
  const finalConfig =
    mode === 'detected'
      ? applyFrameworkLayoutOverlays(config, args.root)
      : mode === 'monorepo'
        ? ARCHITECTURE_PRESETS.monorepo(workspaces, args.root)
        : createElevenLayerConfig({
            rootDir: srcDir === '.' ? 'src' : srcDir,
            root: args.root,
          });

  fs.writeFileSync(configPath, `${JSON.stringify(finalConfig, null, 2)}\n`);

  console.log(`Wrote ${configPath}`);
  console.log('');
  if (mode === 'monorepo') {
    console.log(`Monorepo detected (workspaces: ${workspaces.join(', ')}). Generated a cross-package`);
    console.log('profile matching domain/application/presentation/persistence directories in any');
    console.log('package. Every layer is optional, so the strict check passes now and each switches');
    console.log('on as matching directories gain files. Adjust patterns to your naming if they differ:');
    for (const layer of finalConfig.layers) {
      console.log(`  ${layer.name}: ${layer.patterns.join(', ')}`);
    }
    console.log('');
    console.log(`Verify what each layer actually governs: ${arkCommand(args.root, 'ark-check', '--coverage')}`);
  } else if (mode === 'greenfield') {
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
    const proposals = proposeForUncovered(args.root, srcDir, finalConfig.layers);
    if (proposals.length > 0) {
      const recognized = proposals.filter((p) => !p.unrecognized);
      const unrecognized = proposals.filter((p) => p.unrecognized);
      console.log('');
      console.log('Ungoverned directories — Ark enforces NOTHING here until they are classified.');
      console.log('A green check ignores this code; it is not "clean", it is unchecked.');
      if (recognized.length > 0) {
        console.log('');
        console.log('Proposed layer for each (from the 11-layer profile + presets — apply via /ark-contract):');
        for (const p of recognized) {
          const alt = p.alternatives?.length ? ` (or ${p.alternatives.join(' / ')} — confirm)` : '';
          console.log(`  ${p.dir}/ → ${p.layer}${alt}`);
        }
      }
      if (unrecognized.length > 0) {
        console.log('');
        console.log(`Not recognized — you decide the layer: ${unrecognized.map((p) => p.dir).join(', ')}`);
      }
      const fit = detectBestFitModel(
        [
          ...finalConfig.layers.flatMap((l) => (l.patterns ?? []).map((p) => dirSegmentsFromGlob(p).pop())),
          ...proposals.map((p) => p.dir.split('/').pop()),
        ].filter(Boolean)
      );
      if (fit) {
        console.log('');
        console.log(`Closest starter model: ${fit.name} — \`ark init --preset ${fit.name} --force\` to start from its rule set.`);
      }
    }
  }
  maybeWarnBrownfield(args.root, finalConfig);
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

/**
 * Normalize a required/imported TypeScript module. TS 5.x exposes `sys` on the root
 * export; TS 7+ (and some ESM interop shapes) may not — those are unusable for ark-check's
 * module resolution host, so we reject them and fall through to Ark's own TypeScript.
 */
function usableTypescript(mod) {
  if (!mod) return null;
  const ts = mod.default && mod.sys == null ? mod.default : mod;
  if (ts && typeof ts === 'object' && ts.sys && typeof ts.sys.fileExists === 'function') {
    return ts;
  }
  return null;
}

/**
 * Load a TypeScript module with a working `sys`. Prefer the project's install when it is
 * API-compatible; otherwise Ark's dependency (or a bare import). Returns null only when
 * nothing usable is available.
 */
async function loadTypeScript(root) {
  const loaders = [];
  try {
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(root, 'package.json'));
    loaders.push(() => req('typescript'));
  } catch {
    /* project has no package.json resolvable tree */
  }
  try {
    const { createRequire } = await import('node:module');
    const req = createRequire(__arkCheckCli);
    loaders.push(() => req('typescript'));
  } catch {
    /* ark install tree unavailable */
  }
  loaders.push(async () => {
    const m = await import('typescript');
    return m;
  });

  for (const load of loaders) {
    try {
      const ts = usableTypescript(await load());
      if (ts) return ts;
    } catch {
      /* try next loader */
    }
  }
  return null;
}

function packageManager(root) {
  // If the project already froze violations in a baseline, the generated CI must
  // keep the ratchet — otherwise regenerating the workflow (especially with
  // --force) silently drops --baseline and CI starts failing on frozen violations.
  const baselineFlag = fs.existsSync(path.join(root, '.ark-baseline.json'))
    ? ' --baseline .ark-baseline.json'
    : '';
  const checkArgs = `--root . --config ark.config.json --strict-config${baselineFlag} --require-gates`;
  // Same detection as every emitted command (execRunner): honors the packageManager field and
  // won't let a stray pnpm-lock.yaml hijack an npm project (package-lock.json wins the tie).
  const pm = detectPackageManager(root);
  if (pm === 'pnpm') {
    return {
      cache: 'pnpm',
      setup: ['corepack enable'],
      install: 'pnpm install --frozen-lockfile',
      // Same runner as execRunner(): skip pnpm's verify-deps gate (ERR_PNPM_IGNORED_BUILDS).
      run: `pnpm --config.verify-deps-before-run=false exec ark-check ${checkArgs}`,
    };
  }
  if (pm === 'yarn') {
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

// The args every emitted `ark-check` command carries. The runner prefix (npx / pnpm exec /
// yarn) is added per project by arkCheckCommand so a pnpm-only repo never gets an `npx`
// instruction — see execRunner() in ark-shared.mjs.
const CHECK_ARGS = '--root . --config ark.config.json --strict-config';
function arkCheckCommand(root) {
  return arkCommand(root, 'ark-check', CHECK_ARGS);
}

// Canonical agent contract. AGENTS.md and the Cursor rule both derive from this single
// source so the steps can never drift out of sync between the two files. `steps(checkCommand)`
// is a builder because the check command's runner prefix varies with the package manager.
const AGENT_CONTRACT = {
  manifestResource: 'ark://manifest',
  steps: (checkCommand) => [
    `Read the Ark contract from \`ark://manifest\` when the MCP server is available.`,
    `Keep source files inside the layer boundaries declared in \`ark.config.json\`.`,
    `Do not bypass Ark publishers, event contracts, or source metadata for runtime mutations.`,
    `After edits, run \`${checkCommand}\`.`,
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

function agentInstructions(root) {
  const steps = AGENT_CONTRACT.steps(arkCheckCommand(root))
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
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

function mcpJson(root) {
  return `${JSON.stringify({
    mcpServers: {
      ark: {
        type: 'stdio',
        ...execCommandParts(root, 'ark-mcp', ['--root', '.', '--config', 'ark.config.json']),
      },
    },
  }, null, 2)}\n`;
}

// Sample for docs/ — `ark-check --install-agent-gates --tools codex` auto-merges the real
// block (with absolute paths) into ~/.codex/config.toml. This copy is a reference only, so
// it flags the two gotchas of hand-editing the global config: absolute paths (config.toml is
// loaded without the project as cwd) and the required restart.
function codexTomlSnippet(root) {
  const { command, args } = execCommandParts(root, 'ark-mcp', [
    '--root',
    '/absolute/path/to/project',
    '--config',
    '/absolute/path/to/project/ark.config.json',
  ]);
  const argsToml = args.map((value) => `"${value}"`).join(', ');
  return `# Add to ~/.codex/config.toml (or $CODEX_HOME/config.toml), then RESTART Codex —
# it does not hot-load MCP servers. Use ABSOLUTE paths: config.toml is global, so
# "." would resolve against Codex's launch dir, not this project. Prefer:
#   ark-check --install-agent-gates --tools codex   (auto-merges the absolute paths)
[mcp_servers.ark]
command = "${command}"
args = [${argsToml}]
`;
}

/**
 * Compact always-on rule for instruction-tier hosts (Windsurf, Cline, GitHub Copilot,
 * Kiro, ...): agents that read a project rule file but have no MCP tools or hooks.
 * Derived from the same AGENT_CONTRACT as AGENTS.md and the Cursor rule so the steps
 * can never drift; points at AGENTS.md for the full placement table.
 */
function instructionRule(root) {
  const steps = AGENT_CONTRACT.steps(arkCheckCommand(root))
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
  return `# Ark architecture contract

This project's architecture is governed by Ark (\`ark.config.json\` is authoritative).
Before writing or editing TypeScript or JavaScript source files:

${steps}

See \`AGENTS.md\` for the full contract and the layer placement table.
`;
}

function cursorRule(root) {
  return `---
description: Ark architecture contract
alwaysApply: true
---

Before writing or editing TypeScript or JavaScript source files, read the
\`${AGENT_CONTRACT.manifestResource}\` resource from the \`ark\` MCP server when available.

${AGENT_CONTRACT.cursorValidateStep} After edits, run:

\`\`\`bash
${arkCheckCommand(root)}
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
  // pnpm/yarn setup (corepack enable) MUST run before actions/setup-node so the package
  // manager is on PATH when setup-node's `cache: pnpm|yarn` tries to resolve the store —
  // otherwise the cache step fails on a fresh runner ("Unable to locate executable file: pnpm").
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
${setupSteps ? `${setupSteps}\n` : ''}      - name: Setup Node
        uses: actions/setup-node@v4
        with:
${nodeSetup}
          cache: ${pm.cache}
      - name: Install dependencies
        run: ${pm.install}
      - name: Ark architecture check
        run: ${pm.run}
`;
}

function claudeSettings(root) {
  const runner = execRunner(root);
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
              command: `${runner} ark-mcp --session-context --root "$CLAUDE_PROJECT_DIR" --config ark.config.json`,
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
              command: `${runner} ark-mcp --hook --root "$CLAUDE_PROJECT_DIR" --config ark.config.json`,
            },
          ],
        },
      ],
    },
  }, null, 2)}\n`;
}

// Grok Build project config: MCP registration (commit-friendly relative paths — unlike
// Codex's global config.toml, Grok loads .grok/config.toml from the project).
function grokProjectConfig(root) {
  const { command, args } = execCommandParts(root, 'ark-mcp', [
    '--root',
    '.',
    '--config',
    'ark.config.json',
  ]);
  const argsToml = args.map((value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ');
  return `# Generated by ark-check --install-agent-gates (Grok Build project scope).
# Restart Grok (or /mcps → refresh) after changes. Also loads repo-root .mcp.json.
[mcp_servers.ark]
command = "${command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
args = [${argsToml}]
`;
}

// Grok Build hooks: same ark-mcp contracts as Claude. Grok sets CLAUDE_PROJECT_DIR as
// an alias for GROK_WORKSPACE_ROOT. Matcher keeps Claude names (Write|Edit|MultiEdit)
// and Grok natives (write|search_replace) — Grok aliases both directions.
function grokHooks(root) {
  const runner = execRunner(root);
  return `${JSON.stringify({
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              timeout: 30,
              command: `${runner} ark-mcp --session-context --root "$CLAUDE_PROJECT_DIR" --config ark.config.json`,
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit|write|search_replace',
          hooks: [
            {
              type: 'command',
              timeout: 30,
              command: `${runner} ark-mcp --hook --root "$CLAUDE_PROJECT_DIR" --config ark.config.json`,
            },
          ],
        },
      ],
    },
  }, null, 2)}\n`;
}

function resolveTools(args) {
  if (args.tools && args.tools.length > 0) {
    return { tools: new Set(args.tools), source: 'explicit' };
  }
  const root = args.root;
  const detected = new Set();
  if (fs.existsSync(path.join(root, '.claude'))) detected.add('claude');
  if (fs.existsSync(path.join(root, '.cursor'))) detected.add('cursor');
  if (fs.existsSync(path.join(root, '.codex'))) detected.add('codex');
  if (fs.existsSync(path.join(root, '.grok'))) detected.add('grok');
  if (fs.existsSync(path.join(root, '.windsurf'))) detected.add('windsurf');
  // .clinerules can also be a single FILE (older Cline convention); only a directory
  // can receive .clinerules/ark.md, so a file must not trigger detection.
  if (fs.statSync(path.join(root, '.clinerules'), { throwIfNoEntry: false })?.isDirectory()) {
    detected.add('cline');
  }
  if (fs.existsSync(path.join(root, '.kiro'))) detected.add('kiro');
  if (fs.existsSync(path.join(root, '.roo'))) detected.add('roo');
  if (fs.existsSync(path.join(root, '.continue'))) detected.add('continue');
  if (fs.existsSync(path.join(root, '.gemini'))) detected.add('gemini');
  // copilot has no reliable directory signal (.github exists in most repos),
  // so it is explicit-only via --tools.
  // No signal at all: fall back to writing the primary tools' templates so a fresh
  // project still gets a complete, reviewable starter set.
  if (detected.size === 0) {
    return { tools: new Set(['claude', 'cursor', 'codex']), source: 'default' };
  }
  return { tools: detected, source: 'detected' };
}

const KNOWN_TOOLS = [
  'claude',
  'cursor',
  'codex',
  'grok',
  'windsurf',
  'cline',
  'copilot',
  'kiro',
  'roo',
  'continue',
  'gemini',
];

// One canonical markdown per skill (templates/skills/*.md, shipped in the npm
// package); installed into each tool's slash-command location. The YAML
// frontmatter (name/description) is understood or harmlessly ignored by every
// host. Kiro has no command mechanism — its steering rule file is the only gate.
const SKILL_TOOL_TARGETS = {
  claude: (name) => `.claude/skills/${name}/SKILL.md`,
  cursor: (name) => `.cursor/commands/${name}.md`,
  codex: (name) => `.codex/prompts/${name}.md`,
  // Grok Build: project skills at .grok/skills/<name>/SKILL.md (slash-invocable).
  grok: (name) => `.grok/skills/${name}/SKILL.md`,
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

// A normal ark-check run is the reliable discovery point for new /ark-* skills.
// Ark ships no install lifecycle script (a postinstall banner would be blocked by
// modern package managers' script-approval policy anyway, so careful users never
// saw it — and it broke hardened installs). When a project has adopted Ark agent
// gates (AGENTS.md present) but a detected tool is missing
// skills this version ships, surface it here so agents and CI actually notice.
// Advisory only — never affects the exit code. Copilot has no reliable directory
// signal, so it is not auto-detected (explicit --tools only), matching resolveTools.
// Where Codex loads slash-command prompts from. Codex reads $CODEX_HOME/prompts
// (defaulting to ~/.codex/prompts), NOT the repo — so home copies of the /ark-*
// skills drift out of date when a repo refresh only touches in-repo tool dirs.
function codexPromptsDir() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(base, 'prompts');
}

// Where Codex reads its MCP server registrations. Unlike Claude (.claude/settings.json)
// and Cursor (.cursor/mcp.json), Codex loads MCP servers only from $CODEX_HOME/config.toml
// (~/.codex/config.toml) — never from .mcp.json — so wiring Codex means editing the user's
// home config, not a repo file.
function codexConfigPath() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(base, 'config.toml');
}

// Merge the [mcp_servers.ark] table into Codex's config.toml so `ark://manifest` and the
// AI write gate are live from the first edit — the piece that was previously only shipped as
// a copy-me sample in docs/ark-codex-config.toml. Idempotent: an existing ark table is left
// untouched unless `force` replaces it; other content in the file is preserved. Returns a
// status for the install summary. The table match runs from the [mcp_servers.ark] header to
// the line before the next top-level table header (a line starting with `[`) or EOF.
//
// Unlike .mcp.json / .cursor/mcp.json (loaded relative to the project), config.toml is a
// GLOBAL file — Codex launches it without the project as cwd — so `--root .` would resolve
// against the wrong directory. The paths must be absolute, and TOML string values need the
// backslashes/quotes escaped (matters on Windows and for repo paths containing quotes).
function wireCodexMcp(root, force) {
  const file = codexConfigPath();
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const absRoot = path.resolve(root);
  const absConfig = path.join(absRoot, 'ark.config.json');
  const { command, args } = execCommandParts(root, 'ark-mcp', [
    '--root',
    esc(absRoot),
    '--config',
    esc(absConfig),
  ]);
  const argsToml = args.map((value) => `"${value}"`).join(', ');
  const block = `[mcp_servers.ark]
command = "${command}"
args = [${argsToml}]`;
  let existing = '';
  try {
    if (fs.existsSync(file)) existing = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return { status: 'failed', file, message: error.message };
  }
  const tableRe = /(^|\n)\[mcp_servers\.ark\][^\n]*\n(?:(?!\[)[^\n]*\n?)*/;
  const hasTable = tableRe.test(existing);
  if (hasTable && !force) {
    return { status: 'skipped', file };
  }
  let next;
  if (hasTable) {
    next = existing.replace(tableRe, (match) => `${match.startsWith('\n') ? '\n' : ''}${block}\n`);
  } else {
    const sep = existing.length === 0 ? '' : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
    next = `${existing}${sep}${block}\n`;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next);
  } catch (error) {
    return { status: 'failed', file, message: error.message };
  }
  return { status: hasTable ? 'updated' : 'written', file };
}

// Detects stale/missing /ark-* skills in the Codex home prompts dir. Only nags
// when at least one ark-* prompt already lives there (evidence Codex was set up
// for this user) — never introduces Codex to someone who doesn't use it. Same
// guards as detectSkillGaps (adopted repo, not the Ark source tree).
function detectCodexHomeGap(root) {
  if (!fs.existsSync(path.join(root, 'AGENTS.md'))) return null;
  if (fs.existsSync(path.join(root, 'templates', 'skills'))) return null;
  const skillNames = skillTemplateNames();
  if (skillNames.length === 0) return null;
  const dir = codexPromptsDir();
  if (!fs.existsSync(dir)) return null;
  const present = skillNames.filter((name) => fs.existsSync(path.join(dir, `${name}.md`)));
  if (present.length === 0) return null; // Codex home never set up for Ark — don't nag.
  const version = arkPackageVersion();
  const missing = skillNames.length - present.length;
  let stale = 0;
  if (version) {
    for (const name of present) {
      const installed = installedSkillVersion(path.join(dir, `${name}.md`));
      if (installed === null || isVersionOlder(installed, version)) stale += 1;
    }
  }
  return missing > 0 || stale > 0 ? { missing, stale } : null;
}

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
  if (fs.existsSync(path.join(root, '.grok'))) detected.push('grok');
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

// Files carrying an emitted Ark command whose runner (npx / pnpm exec / yarn) should match
// the project's package manager. .mcp.json / .cursor/mcp.json hold it structurally
// (command/args); the rest hold it as text ("npx ark-check …", incl. .claude/settings.json
// hook strings and the package.json check:architecture script).
const COMMAND_GATE_TEXT_FILES = [
  '.claude/settings.json', 'AGENTS.md', '.cursor/rules/ark.mdc', '.windsurf/rules/ark.md',
  '.clinerules/ark.md', '.github/copilot-instructions.md', '.kiro/steering/ark.md',
  '.roo/rules/ark.md', '.continue/rules/ark.md', 'GEMINI.md', 'package.json',
  '.grok/hooks/ark-write-gate.json', '.grok/config.toml',
];
const COMMAND_GATE_JSON_FILES = ['.mcp.json', '.cursor/mcp.json'];
// The runner token immediately before an ark command in a text command string.
// Matches npm/yarn runners and both pnpm forms (legacy `pnpm exec` + verify-deps-safe form).
const RUNNER_BEFORE_ARK =
  /\b(?:npx|pnpm --config\.verify-deps-before-run=false exec|pnpm exec|yarn)(?= (?:ark-check|ark-mcp|ark)\b)/g;

// Gate files whose Ark command runner doesn't match this project's package manager — the
// advisory (and --migrate-commands) target. Returns [] for npm/unknown projects (npx is right)
// so the check is silent unless there's a real mismatch.
function staleRunnerGateFiles(root) {
  const want = execRunner(root);
  if (want === 'npx') return [];
  const stale = [];
  for (const rel of COMMAND_GATE_TEXT_FILES) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    RUNNER_BEFORE_ARK.lastIndex = 0;
    let match;
    while ((match = RUNNER_BEFORE_ARK.exec(text))) {
      if (match[0] !== want) {
        stale.push(rel);
        break;
      }
    }
  }
  for (const rel of COMMAND_GATE_JSON_FILES) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    } catch {
      continue;
    }
    const ark = json?.mcpServers?.ark;
    if (ark && ark.command && ark.command !== want.split(' ')[0]) stale.push(rel);
  }
  return stale;
}

// When more than one lockfile is present the project is ambiguous. detectPackageManager()
// resolves it (package-lock.json wins so a stray pnpm-lock.yaml can't hijack an npm project),
// but the user should know it happened and how to make it explicit — otherwise a leftover
// lockfile silently steers which runner every emitted command uses.
function warnLockfileConflict(root) {
  const locks = presentLockfiles(root);
  if (locks.length <= 1) return;
  const chosen = detectPackageManager(root);
  const files = { pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', npm: 'package-lock.json' };
  console.log('');
  console.log(
    `Note: multiple lockfiles present (${locks.map((pm) => files[pm]).join(', ')}). Treating this`
  );
  console.log(
    `as a ${chosen} project — Ark commands use "${execRunner(root)}". If that's wrong, set`
  );
  console.log(
    '"packageManager" in package.json (e.g. "pnpm@9") to declare it, or remove the stray lockfile.'
  );
}

// --migrate-commands: rewrite ONLY the Ark command runner in existing gate files to the
// project's package manager (no --force clobber). Closes the upgrade gap where a repo that
// adopted before the package-manager-aware templates keeps a stale `npx`.
function runMigrateCommands(root) {
  const runner = execRunner(root);
  const changed = [];
  for (const rel of COMMAND_GATE_TEXT_FILES) {
    const full = path.join(root, rel);
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const next = text.replace(RUNNER_BEFORE_ARK, runner);
    if (next !== text) {
      fs.writeFileSync(full, next);
      changed.push(rel);
    }
  }
  for (const rel of COMMAND_GATE_JSON_FILES) {
    const full = path.join(root, rel);
    let json;
    try {
      json = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch {
      continue;
    }
    const ark = json?.mcpServers?.ark;
    if (!ark) continue;
    const binArgs = Array.isArray(ark.args)
      ? ark.args.filter((entry) => entry !== 'exec' && entry !== 'ark-mcp')
      : ['--root', '.', '--config', 'ark.config.json'];
    const parts = execCommandParts(root, 'ark-mcp', binArgs);
    if (ark.command !== parts.command || JSON.stringify(ark.args) !== JSON.stringify(parts.args)) {
      json.mcpServers.ark = { ...ark, ...parts };
      fs.writeFileSync(full, `${JSON.stringify(json, null, 2)}\n`);
      changed.push(rel);
    }
  }
  const pm = runner === 'pnpm exec' ? 'pnpm' : runner;
  console.log(`Migrated the Ark command runner to "${pm}" in existing gate files.`);
  if (changed.length === 0) {
    console.log('  Nothing to change — all Ark commands already use the right runner.');
  } else {
    for (const rel of changed) console.log(`  updated ${rel}`);
    console.log('  (only the command runner changed; customized content is untouched.)');
  }
  warnLockfileConflict(root);
}

function runInstallAgentGates(args) {
  const root = args.root;
  if (args.migrateCommands) {
    runMigrateCommands(root);
    return;
  }
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
  const { tools, source } = resolveTools(args);
  const toolSource =
    source === 'explicit'
      ? 'from --tools'
      : source === 'detected'
        ? 'auto-detected from config dirs'
        : 'default set — no agent config dirs found';
  console.log(`Agent gates for: ${[...tools].sort().join(', ')} (${toolSource})`);
  const templates = [];
  // --skills-only refreshes just the canonical /ark-* skills, which are safe to
  // overwrite (they track the package). The gate/instruction files (AGENTS.md,
  // settings.json, CI workflow, rules) are the ones users customize, so a plain
  // `--force` clobbers them — this is the safe way to pick up new skill versions.
  if (!args.skillsOnly) {
    // Base gates: tool-agnostic contract + CI backstop, always written.
    templates.push(['AGENTS.md', agentInstructions(root)]);
    templates.push(['.mcp.json', mcpJson(root)]);
    templates.push([
      '.github/workflows/ark-check.yml',
      githubWorkflow(pm, detectCiNode(root)),
    ]);
    if (tools.has('cursor')) {
      templates.push(['.cursor/mcp.json', mcpJson(root)]);
      templates.push(['.cursor/rules/ark.mdc', cursorRule(root)]);
    }
    if (tools.has('claude')) {
      templates.push(['.claude/settings.json', claudeSettings(root)]);
    }
    if (tools.has('codex')) {
      templates.push(['docs/ark-codex-config.toml', codexTomlSnippet(root)]);
    }
    if (tools.has('grok')) {
      templates.push(['.grok/config.toml', grokProjectConfig(root)]);
      templates.push(['.grok/hooks/ark-write-gate.json', grokHooks(root)]);
    }
    // Instruction-tier hosts: one shared rule text, host-specific path.
    if (tools.has('windsurf')) {
      templates.push(['.windsurf/rules/ark.md', instructionRule(root)]);
    }
    if (tools.has('cline')) {
      templates.push(['.clinerules/ark.md', instructionRule(root)]);
    }
    if (tools.has('copilot')) {
      templates.push(['.github/copilot-instructions.md', instructionRule(root)]);
    }
    if (tools.has('kiro')) {
      templates.push(['.kiro/steering/ark.md', instructionRule(root)]);
    }
    if (tools.has('roo')) {
      templates.push(['.roo/rules/ark.md', instructionRule(root)]);
    }
    if (tools.has('continue')) {
      templates.push(['.continue/rules/ark.md', instructionRule(root)]);
    }
    // Gemini CLI reads GEMINI.md as its primary project context (it also reads
    // AGENTS.md, but GEMINI.md wins when both are present), so the rule lives there.
    if (tools.has('gemini')) {
      templates.push(['GEMINI.md', instructionRule(root)]);
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
    console.log(`    ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --force')}`);
  }

  // --codex-home writes the canonical skills straight to $CODEX_HOME/prompts.
  // Codex reads prompts from there (not the repo), so this is the only way to
  // refresh them for a repo that isn't itself configured for Codex. It writes to
  // the user's home dir, hence explicit opt-in rather than part of a normal run.
  const homeResults = [];
  if (args.codexHome) {
    const dir = codexPromptsDir();
    console.log('');
    console.log(`Codex home skills (${dir}):`);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error(`  FAILED to create ${dir} (${error.message})`);
      homeResults.push({ status: 'failed' });
    }
    if (homeResults.length === 0) {
      for (const [name, content] of skills) {
        const file = path.join(dir, `${name}.md`);
        if (fs.existsSync(file) && !args.force) {
          const installed = installedSkillVersion(file);
          const behind = installed === null || (version && isVersionOlder(installed, version));
          const note = behind
            ? `  (stale: ${installed ?? 'no stamp'} < ${version}; use --force)`
            : '  (up to date)';
          console.log(`  ${'skipped'.padEnd(7)} ${name}.md${note}`);
          homeResults.push({ status: 'skipped' });
          continue;
        }
        try {
          fs.writeFileSync(file, content);
          console.log(`  ${'wrote'.padEnd(7)} ${name}.md`);
          homeResults.push({ status: 'written' });
        } catch (error) {
          console.log(`  ${'FAILED'.padEnd(7)} ${name}.md (${error.message})`);
          homeResults.push({ status: 'failed' });
        }
      }
    }
  }

  // Auto-wire the ark MCP server into Codex's home config.toml. Claude and Cursor get
  // machine-readable registrations (.claude/settings.json, .cursor/mcp.json) written as repo
  // templates above; Codex reads MCP servers only from ~/.codex/config.toml, so it needs a
  // home-dir merge instead. Fires whenever Codex is in play so `ark://manifest` is live
  // without a manual copy step.
  let codexMcp = null;
  if (tools.has('codex') || args.codexHome) {
    codexMcp = wireCodexMcp(root, args.force);
    console.log('');
    console.log(`Codex MCP registration (${codexMcp.file}):`);
    if (codexMcp.status === 'skipped') {
      console.log(`  ${'skipped'.padEnd(7)} [mcp_servers.ark] already present (use --force to overwrite)`);
    } else if (codexMcp.status === 'failed') {
      console.log(`  ${'FAILED'.padEnd(7)} [mcp_servers.ark] (${codexMcp.message})`);
    } else {
      const verb = codexMcp.status === 'updated' ? 'updated' : 'wrote';
      console.log(`  ${verb.padEnd(7)} [mcp_servers.ark] with absolute paths`);
      console.log('          RESTART Codex — it does not hot-load MCP servers.');
      console.log('          Then expect: resource ark://manifest + tools validate_code, ark_check, ark_coverage, ark_place.');
    }
  }

  const failed = [...results, ...homeResults, ...(codexMcp ? [codexMcp] : [])].filter((result) => result.status === 'failed');
  if (failed.length > 0) {
    console.error(`\nFailed to write ${failed.length} template(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the generated files and commit the ones that match your tools.');
  console.log(`  2. Run: ${arkCheckCommand(root)}`);
  if (!hasCheckScript) {
    console.log('  3. Add the package.json alias if you want `run check:architecture`:');
    console.log(`     ${checkArchitectureScriptSnippet(root)}`);
  }
  if ((tools.has('codex') || args.codexHome)) {
    console.log('');
    if (codexMcp && codexMcp.status !== 'failed') {
      console.log(`  Codex: ark MCP registered in ${codexMcp.file} — restart Codex so \`ark://manifest\` loads.`);
    }
    if (args.codexHome) {
      console.log(`  Codex: refreshed the /ark-* skills in ${codexPromptsDir()} — Codex loads them from there.`);
    } else if (skills.length > 0) {
      console.log('  Codex loads slash-command prompts from $CODEX_HOME/prompts (~/.codex/prompts),');
      console.log('  not the repo. Install the /ark-* skills there with:');
      console.log(`    ${arkCommand(root, 'ark-check', '--install-agent-gates --codex-home')}`);
      console.log('  (writes to your home dir; agents driving this setup should offer to run it).');
    }
  }
  warnLockfileConflict(root);
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

/** Unit/e2e test files are not architecture surface — agents and Nest put them next
 *  to production code (*.spec.ts). Counting them as ungoverned forces false
 *  CONFIG_UNCLASSIFIED_FILES under --strict-config on every starter. */
const TEST_FILE_NAME =
  /\.(spec|test)\.(tsx?|jsx?|mts|cts)$/i;

function isGovernableSourceFile(name) {
  return SOURCE_FILE_NAME.test(name) && !name.endsWith('.d.ts') && !TEST_FILE_NAME.test(name);
}

function isSkippedSourceDir(name) {
  return (
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'coverage' ||
    name === '__tests__' ||
    name === '__mocks__' ||
    name === 'e2e' ||
    // Top-level style Nest/Jest folders (not "testing" helpers inside src)
    name === 'test' ||
    name === 'tests'
  );
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
      if (isSkippedSourceDir(entry.name)) continue;
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

  // Ambiguous overlap: a file matched by two different layers at the SAME top specificity.
  // layerForFile breaks the tie by declaration order, but the config is genuinely undecided
  // (unlike a facade split, where the surface pattern is strictly more specific and wins
  // cleanly). Surface the layer pairs so the author disambiguates instead of relying on order.
  const ambiguousPairs = new Set();
  if (layers.length > 1) {
    for (const file of files) {
      const rel = normalize(path.relative(root, file));
      let topScore = -1;
      let topLayers = [];
      for (const layer of layers) {
        for (const pattern of layer.patterns ?? []) {
          if (!globToRegExp(pattern).test(rel)) continue;
          const score = patternSpecificity(pattern);
          if (score > topScore) {
            topScore = score;
            topLayers = [layer.name];
          } else if (score === topScore && !topLayers.includes(layer.name)) {
            topLayers.push(layer.name);
          }
        }
      }
      if (topLayers.length > 1) {
        ambiguousPairs.add([...topLayers].sort().join(' + '));
      }
    }
  }
  if (ambiguousPairs.size > 0) {
    warnings.push(
      configWarning(
        'CONFIG_AMBIGUOUS_LAYERS',
        `Some files match multiple layers at equal specificity; classification falls back to declaration order. Disambiguate the overlapping patterns: ${[...ambiguousPairs].join(', ')}.`,
        { pairs: [...ambiguousPairs] }
      )
    );
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
  const sys = ts?.sys;
  const fileExists = (f) => {
    if (sys?.fileExists) return sys.fileExists(f);
    return fs.existsSync(f);
  };
  const readFile = (f) => {
    if (sys?.readFile) return sys.readFile(f);
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return undefined;
    }
  };
  const directoryExists = (d) => {
    if (sys?.directoryExists) return sys.directoryExists(d);
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  };
  return {
    fileExists,
    readFile,
    directoryExists,
    getCurrentDirectory: () =>
      sys?.getCurrentDirectory ? sys.getCurrentDirectory() : process.cwd(),
    getDirectories: (d) => {
      if (sys?.getDirectories) return sys.getDirectories(d);
      try {
        return fs
          .readdirSync(d, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        return [];
      }
    },
    realpath: sys?.realpath ? (p) => sys.realpath(p) : undefined,
    useCaseSensitiveFileNames: sys?.useCaseSensitiveFileNames ?? true,
  };
}

function parseTsconfig(ts, configPath) {
  const host = createModuleResolutionHost(ts);
  const read = ts.readConfigFile(configPath, host.readFile);
  if (read.error) return {};
  // parseJsonConfigFileContent wants a ParseConfigHost-like object; our resolution host
  // is enough for option extraction.
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    {
      useCaseSensitiveFileNames: host.useCaseSensitiveFileNames,
      readDirectory: ts.sys?.readDirectory
        ? (...args) => ts.sys.readDirectory(...args)
        : () => [],
      fileExists: host.fileExists,
      readFile: host.readFile,
    },
    path.dirname(configPath)
  );
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
  // Bump this schema tag whenever the cached scan shape changes, so a warm cache from an
  // older Ark can't feed stale entries to new logic. v2: violation/edge records gained the
  // `typeOnly` field — a v1 cache would otherwise report every violation as a value edge
  // after upgrade until files changed. The tag invalidates every existing cache exactly once.
  return crypto
    .createHash('sha1')
    .update(`ark-check-cache-v2\0${read(configPath)}\0${manifestPath ? read(manifestPath) : ''}`)
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

// True when an import/export edge carries ONLY types (`import type …`, or a named import
// where every binding is `type`-qualified). Type-only edges are erased at compile time —
// they create no runtime coupling, only a design/type-placement dependency — so callers can
// rank them below real value imports in a burn-down. A side-effect import (`import "x"`) or
// any default/namespace/value binding is NOT type-only.
function isTypeOnlyModuleReference(ts, node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false; // side-effect import — runtime edge
    if (clause.isTypeOnly) return true; // `import type …`
    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named) && named.elements.length > 0) {
      return named.elements.every((element) => element.isTypeOnly);
    }
    return false; // default or namespace binding of a value
  }
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    const clause = node.exportClause;
    if (clause && ts.isNamedExports(clause) && clause.elements.length > 0) {
      return clause.elements.every((element) => element.isTypeOnly);
    }
    return false;
  }
  return false;
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

// ── Violation diagnosis ──────────────────────────────────────────────────────
// Groups violations by their layer EDGE (and target subtree) so a wall of N violations reads
// as "M distinct problems, ranked by size" — the burn-down order. The killer signal: when
// one edge dominates, the CONTRACT is usually wrong, not the code (e.g. every API route
// importing the kernel through a sanctioned entrypoint). Freezing that as "debt" buries a
// config fix behind a baseline, so --update-baseline refuses a lopsided freeze (see guard).
const CONCENTRATION_MIN_VIOLATIONS = 10;
const CONCENTRATION_SHARE = 0.9;

function violationEdge(violation) {
  if (violation.ruleId === 'CIRCULAR_DEPENDENCY') return 'circular dependency';
  if (violation.ruleId === 'FORBIDDEN_GLOBAL') return `${violation.fromLayer ?? '?'} → ambient global`;
  if (violation.fromLayer && violation.toLayer) return `${violation.fromLayer} → ${violation.toLayer}`;
  return violation.ruleId;
}

// The directory the offending import lands in — the signal for "where does this edge go?".
// For a LAYER_IMPORT_VIOLATION the target is a resolved file path; cluster by its dir prefix
// so `kernel/internal/x` and `kernel/internal/y` collapse to one "into kernel/internal/".
function violationTargetSubtree(violation) {
  if (!violation.target || typeof violation.target !== 'string' || !violation.target.includes('/')) {
    return undefined;
  }
  const segments = violation.target.split('/');
  return segments.slice(0, Math.min(3, segments.length - 1)).join('/');
}

function summarizeViolations(violations) {
  const byEdge = new Map();
  let typeOnly = 0;
  for (const violation of violations) {
    if (violation.typeOnly) typeOnly += 1;
    const key = violationEdge(violation);
    const entry = byEdge.get(key) ?? { edge: key, count: 0, typeOnly: 0, targets: new Map() };
    entry.count += 1;
    if (violation.typeOnly) entry.typeOnly += 1;
    const subtree = violationTargetSubtree(violation);
    if (subtree) entry.targets.set(subtree, (entry.targets.get(subtree) ?? 0) + 1);
    byEdge.set(key, entry);
  }
  const edges = [...byEdge.values()]
    .map((entry) => ({
      edge: entry.edge,
      count: entry.count,
      typeOnly: entry.typeOnly,
      topTargets: [...entry.targets.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([dir, count]) => ({ dir, count })),
    }))
    .sort((a, b) => b.count - a.count);
  const total = violations.length;
  const dominant = edges[0];
  const dominantShare = total > 0 && dominant ? dominant.count / total : 0;
  return {
    total,
    // Value edges are real runtime coupling; type-only edges (erased at compile time) are
    // just type placement — fix the value ones first, the type-only ones move with the type.
    valueCount: total - typeOnly,
    typeOnlyCount: typeOnly,
    edges,
    dominant: dominant ? dominant.edge : undefined,
    dominantShare,
    concentrated: total >= CONCENTRATION_MIN_VIOLATIONS && dominantShare >= CONCENTRATION_SHARE,
  };
}

function printViolationBreakdown(summary, { toStderr = false } = {}) {
  const out = toStderr ? (line) => console.error(line) : (line) => console.log(line);
  out('');
  out(`Violation breakdown — ${summary.total} across ${summary.edges.length} edge(s), largest first:`);
  if (summary.typeOnlyCount > 0) {
    out(
      `  ${summary.valueCount} value (runtime coupling — fix first) · ${summary.typeOnlyCount} type-only (type placement — moves with the type)`
    );
  }
  for (const edge of summary.edges) {
    const pct = Math.round((edge.count / summary.total) * 100);
    const typeNote = edge.typeOnly > 0 ? `, ${edge.typeOnly} type-only` : '';
    out(`  ${String(edge.count).padStart(5)}  ${edge.edge}  (${pct}%${typeNote})`);
    for (const target of edge.topTargets) {
      out(`         ↳ ${target.count}× into ${target.dir}/`);
    }
  }
  if (summary.concentrated) {
    out('');
    out(`⚠ ${Math.round(summary.dominantShare * 100)}% of violations are a SINGLE edge: ${summary.dominant}.`);
    out('  That usually means the CONTRACT is wrong, not the code — e.g. app-land reaching a');
    out('  framework/kernel through a sanctioned entrypoint. Before treating it as debt:');
    out('    • If the edge is intended, allow it — or split the target layer into a public');
    out('      surface app-land may import + internals it may not (see the target dirs above');
    out('      to find the surface). Do it via /ark-contract.');
    out('    • Only the minority hitting real internals is genuine debt for /ark-fix.');
    out(`  Fixing the contract clears ~${summary.edges[0].count} of ${summary.total} at once.`);
  }
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
    if (!fs.existsSync(dir)) return null;
    const hit = fs
      .readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .find((f) => fileIncludes(path.join('.github', 'workflows', f), 'ark-check'));
    return hit ? `.github/workflows/${hit}` : null;
  };
  const eslintFile = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs', '.eslintrc.json', '.eslintrc.cjs'].find(
    (f) => has(f) && fileIncludes(f, 'ark-runtime-kernel')
  );
  const writeGateFile =
    (fileIncludes('.claude/settings.json', 'ark-mcp') && '.claude/settings.json') ||
    (has('.cursor/mcp.json') && '.cursor/mcp.json') ||
    null;
  return [
    { name: 'Write gate', where: writeGateFile, what: 'blocks a bad edit as you type (PreToolUse hook / MCP)' },
    { name: 'ESLint', where: eslintFile || null, what: 'flags violations in your editor' },
    { name: 'CI check', where: workflowsMentionArk(), what: 'blocks the merge if the architecture breaks' },
    { name: 'Baseline', where: has('.ark-baseline.json') ? '.ark-baseline.json' : null, what: 'old violations frozen; new ones fail' },
  ].map((e) => ({ ...e, on: !!e.where }));
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Directory for origin / latest / history architecture report snapshots. */
const ARK_REPORTS_DIR = path.join('.ark', 'reports');
const ARK_REPORT_HISTORY_MAX = 20;

function reportsDir(root) {
  return path.join(root, ARK_REPORTS_DIR);
}

/**
 * Compact metrics snapshot — machine-readable so future reports can diff against origin.
 * Intentionally small (not the full HTML). Layer file counts included for evolution.
 */
function buildReportSnapshot({
  root,
  config,
  coverage,
  violations,
  ok,
  suppressed,
  version,
  fileCountByLayer,
  enforcement,
  score,
  mode,
}) {
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  const counts = {};
  if (fileCountByLayer instanceof Map) {
    for (const [name, n] of fileCountByLayer) counts[name] = n;
  }
  const gatesOn = (enforcement || []).filter((e) => e.on).length;
  return {
    version: 1,
    kind: 'ark-architecture-snapshot',
    generatedAt: new Date().toISOString(),
    arkVersion: version ?? null,
    project: (() => {
      try {
        return readJson(path.join(root, 'package.json')).name || path.basename(root);
      } catch {
        return path.basename(root);
      }
    })(),
    ok: Boolean(ok),
    mode: mode ?? null,
    score: score ?? null,
    governedPercent: coverage?.governed?.percent ?? null,
    classifiedFiles: coverage?.governed?.classifiedFiles ?? 0,
    totalFiles: coverage?.governed?.totalFiles ?? 0,
    unclassifiedFiles: coverage?.unclassified?.count ?? 0,
    layerCount: layers.length,
    denyRules: rules.filter((r) => r.allowed === false).length,
    allowRules: rules.filter((r) => r.allowed === true).length,
    activeViolations: Array.isArray(violations) ? violations.length : 0,
    typeOnlyViolations: Array.isArray(violations)
      ? violations.filter((v) => v.typeOnly).length
      : 0,
    valueViolations: Array.isArray(violations)
      ? violations.filter((v) => !v.typeOnly).length
      : 0,
    suppressed: suppressed ?? 0,
    gatesOn,
    gatesTotal: (enforcement || []).length,
    layerFiles: counts,
  };
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function deltaField(current, origin, key) {
  const a = current?.[key];
  const b = origin?.[key];
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return a - b;
}

/**
 * Persist origin (once), latest, optional history; return { origin, createdOrigin }.
 */
/** Shared fitness numbers for HTML report + machine-readable snapshots. */
function computeReportFitness({ coverage, violations, ok, enforcement, config }) {
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  const deniedCount = rules.filter((r) => r.allowed === false).length;
  const gatesOn = (enforcement || []).filter((e) => e.on).length;
  const governedPercent = coverage?.governed?.percent ?? null;
  const totalFiles = coverage?.governed?.totalFiles ?? 0;
  const classifiedFiles = coverage?.governed?.classifiedFiles ?? 0;
  const mode = resolveOperatingMode({
    governedPercent: totalFiles === 0 ? 0 : governedPercent,
    planMet:
      ok &&
      (violations?.length ?? 0) === 0 &&
      totalFiles > 0 &&
      (governedPercent == null || governedPercent >= 50),
    mature: totalFiles >= 150,
    totalFiles,
  });
  const modeLabel = { suggest: 'SUGGEST', adapt: 'ADAPT', enforce: 'ENFORCE' }[mode] || String(mode).toUpperCase();
  const modeBlurb = {
    suggest: 'Starter shape — expand layers as the codebase grows.',
    adapt: 'Contract is live; raise governed coverage or match real folders.',
    enforce: 'Contract governs the tree. Gates can honestly hold the line.',
  }[mode];
  const scoreCoverage = governedPercent == null ? 50 : governedPercent;
  const scoreClean =
    (violations?.length ?? 0) === 0
      ? 100
      : Math.max(0, 100 - Math.min(100, violations.length * 4));
  const scoreGates = enforcement?.length
    ? Math.round((gatesOn / enforcement.length) * 100)
    : 40;
  const scoreRules = layers.length
    ? Math.min(
        100,
        Math.round((deniedCount / Math.max(1, layers.length * (layers.length - 1))) * 120)
      )
    : 0;
  const score = Math.round(
    scoreCoverage * 0.4 + scoreClean * 0.3 + scoreGates * 0.2 + scoreRules * 0.1
  );
  const scoreTone = score >= 90 ? 'elite' : score >= 70 ? 'strong' : score >= 50 ? 'ok' : 'weak';
  const scoreCaption =
    score >= 90
      ? 'World-class architecture fitness'
      : score >= 70
        ? 'Solid architecture discipline'
        : score >= 50
          ? 'Useful guardrails — room to grow'
          : 'Early stage — keep adopting layers';
  return {
    governedPercent,
    totalFiles,
    classifiedFiles,
    mode,
    modeLabel,
    modeBlurb,
    score,
    scoreCoverage,
    scoreClean,
    scoreGates,
    scoreRules,
    scoreTone,
    scoreCaption,
    gatesOn,
    deniedCount,
  };
}

function formatDelta(n, opts = {}) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n === 0) return '0';
  const sign = n > 0 ? '+' : '';
  const suffix = opts.suffix ?? '';
  return `${sign}${n}${suffix}`;
}

function archiveReportSnapshots(root, { html, snapshot, resetOrigin = false, noArchive = false }) {
  const dir = reportsDir(root);
  const historyDir = path.join(dir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  const originJson = path.join(dir, 'origin.json');
  const originHtml = path.join(dir, 'origin.html');
  const latestJson = path.join(dir, 'latest.json');
  const latestHtml = path.join(dir, 'latest.html');

  let origin = readJsonSafe(originJson);
  let createdOrigin = false;
  if (!origin || resetOrigin) {
    fs.writeFileSync(originJson, `${JSON.stringify(snapshot, null, 2)}\n`);
    fs.writeFileSync(originHtml, html);
    origin = snapshot;
    createdOrigin = true;
  }

  fs.writeFileSync(latestJson, `${JSON.stringify(snapshot, null, 2)}\n`);
  fs.writeFileSync(latestHtml, html);

  if (!noArchive) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(historyDir, `${stamp}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
    // Cap history: keep newest ARK_REPORT_HISTORY_MAX JSON files.
    try {
      const files = fs
        .readdirSync(historyDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, t: fs.statSync(path.join(historyDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      for (const old of files.slice(ARK_REPORT_HISTORY_MAX)) {
        fs.unlinkSync(path.join(historyDir, old.f));
      }
    } catch {
      /* ignore prune errors */
    }
  }

  // Ensure .ark/ is gitignored when a .gitignore exists.
  const gitignore = path.join(root, '.gitignore');
  if (fs.existsSync(gitignore)) {
    const text = fs.readFileSync(gitignore, 'utf8');
    const hasArk =
      text.split('\n').some((line) => {
        const t = line.trim();
        return t === '.ark/' || t === '.ark' || t === '/.ark/' || t === '**/.ark/';
      });
    if (!hasArk) {
      const suffix = text.endsWith('\n') || text.length === 0 ? '' : '\n';
      fs.writeFileSync(
        gitignore,
        `${text}${suffix}\n# Ark generated reports / local state\n.ark/\n`
      );
    }
  }

  return { origin, createdOrigin, dir, originJson, latestHtml };
}

// Simplified onboarding report: compact diagram, placement table, short violation list.
function renderBeginnerHtmlReport({ root, config, violations, ok, version, configPath, generatedAt }) {
  const layers = Array.isArray(config.layers) ? config.layers : [];
  const esc = htmlEscape;
  const project = (() => {
    try {
      return readJson(path.join(root, 'package.json')).name || path.basename(root);
    } catch {
      return path.basename(root);
    }
  })();
  const status = ok ? 'PASS' : 'FAIL';
  const phase1 = layers.slice(0, 4);
  const diagram = phase1
    .map((layer, index) => `${index + 1}. ${layer.name}`)
    .join('  →  ') || 'Add layers in ark.config.json';

  const placementRows = layers
    .map((layer) => {
      const purpose = layer.description || 'See ark.config.json';
      const folders = (layer.patterns || []).join(', ') || '—';
      return `<tr><td><strong>${esc(layer.name)}</strong></td><td>${esc(purpose)}</td><td><code>${esc(folders)}</code></td></tr>`;
    })
    .join('\n');

  const violationRows = violations.length
    ? violations
        .slice(0, 12)
        .map((v) => {
          const enriched = enrichViolationWithFixClass(v);
          return `<li><code>${esc(v.file)}:${v.line}</code> — ${esc(enriched.enthusiastHint ?? v.message)}</li>`;
        })
        .join('\n')
    : '<li class="dim">No active violations — architecture matches the contract.</li>';

  const meta = [version ? `ark-check v${esc(version)}` : '', generatedAt ? esc(generatedAt) : '']
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ark beginner guide — ${esc(project)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; max-width: 720px; }
  h1 { font-size: 1.4rem; }
  .badge { padding: .2em .6em; border-radius: 999px; font-weight: 700; font-size: .85rem; }
  .PASS { background: #dcfce7; color: #166534; }
  .FAIL { background: #fee2e2; color: #991b1b; }
  .diagram { background: #f4f4f5; padding: 1rem; border-radius: 8px; font-family: monospace; margin: 1rem 0; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
  th { font-size: .75rem; text-transform: uppercase; color: #71717a; }
  ul { padding-left: 1.2rem; }
  .dim { color: #71717a; }
  footer { margin-top: 2rem; font-size: .85rem; color: #71717a; }
</style></head>
<body>
  <h1>${esc(project)} <span class="badge ${status}">${status}</span></h1>
  <p class="dim">Beginner architecture guide · ${meta}</p>
  <h2>How layers flow (inner → outer)</h2>
  <div class="diagram">${esc(diagram)}</div>
  <p>Business rules live in inner layers; UI and databases live in outer adapter layers. Inner code must not import outer code.</p>
  <h2>Where code goes</h2>
  <table>
    <tr><th>Layer</th><th>Purpose</th><th>Typical folders</th></tr>
    ${placementRows || '<tr><td colspan="3">No layers configured.</td></tr>'}
  </table>
  <h2>What to fix first</h2>
  <ul>${violationRows}</ul>
  <h2>Next steps</h2>
  <p><code>${arkCheckCommand(root)}</code></p>
  <p><code>${arkCommand(root, 'ark-check', '--recommend')}</code></p>
  <footer>Generated by ark-check --report --beginner. Config: ${esc(configPath)}</footer>
</body></html>`;
}

/**
 * Showcase HTML architecture report — the visual product of `/ark-explain` + ark-check.
 * Self-contained (no CDN), print-friendly, works offline. Designed to look great on a
 * fully governed repo (100% coverage, clean gates) and still be useful when debt remains.
 */
function renderHtmlReport({
  root,
  config,
  exampleByLayer,
  fileCountByLayer,
  coverage,
  violations,
  ok,
  suppressed,
  version,
  configPath,
  generatedAt,
  skillGaps = [],
  originSnapshot = null,
  currentSnapshot = null,
  originJustCreated = false,
}) {
  const layers = Array.isArray(config.layers) ? config.layers : [];
  const rules = Array.isArray(config.rules) ? config.rules : [];
  const esc = htmlEscape;
  const project = (() => {
    try {
      return readJson(path.join(root, 'package.json')).name || path.basename(root);
    } catch {
      return path.basename(root);
    }
  })();

  const findRule = (from, to) => rules.find((r) => r.from === from && r.to === to);
  const deniedOut = (name) => rules.filter((r) => r.from === name && r.allowed === false).length;
  // Innermost first: more outbound denies → deeper (pure core).
  const ordered = [...layers].sort(
    (a, b) => deniedOut(b.name) - deniedOut(a.name) || a.name.localeCompare(b.name)
  );

  const deniedCount = rules.filter((r) => r.allowed === false).length;
  const allowedCount = rules.filter((r) => r.allowed === true).length;
  const guarded = layers.filter(
    (l) => Array.isArray(l.forbiddenGlobals) && l.forbiddenGlobals.length
  ).length;
  const enforcement = detectEnforcement(root);
  const gatesOn = enforcement.filter((e) => e.on).length;
  const status = ok ? 'PASS' : 'FAIL';

  const fitness = computeReportFitness({
    coverage,
    violations,
    ok,
    enforcement,
    config,
  });
  const {
    governedPercent,
    totalFiles,
    classifiedFiles,
    mode,
    modeLabel,
    modeBlurb,
    score,
    scoreCoverage,
    scoreClean,
    scoreGates,
    scoreRules,
    scoreTone,
    scoreCaption,
  } = fitness;

  // ── Senior diagnostics (coupling, purity, contract density) ──────────────
  const layerNames = ordered.map((l) => l.name);
  const pairCount = Math.max(1, layers.length * Math.max(0, layers.length - 1));
  const denyRatio = Math.round((deniedCount / pairCount) * 1000) / 10;
  const fanOut = new Map(layerNames.map((n) => [n, 0]));
  const fanIn = new Map(layerNames.map((n) => [n, 0]));
  for (const from of layerNames) {
    for (const to of layerNames) {
      if (from === to) continue;
      const rule = findRule(from, to);
      const denied = rule && rule.allowed === false;
      if (!denied) {
        fanOut.set(from, (fanOut.get(from) || 0) + 1);
        fanIn.set(to, (fanIn.get(to) || 0) + 1);
      }
    }
  }
  const couplingRows = ordered
    .map((layer) => {
      const fo = fanOut.get(layer.name) || 0;
      const fi = fanIn.get(layer.name) || 0;
      const files = (fileCountByLayer instanceof Map ? fileCountByLayer.get(layer.name) : 0) || 0;
      const density = files > 0 ? Math.round((fo / files) * 100) / 100 : fo;
      return { name: layer.name, fo, fi, files, density, denyOut: deniedOut(layer.name) };
    })
    .sort((a, b) => b.fo - a.fo || b.fi - a.fi);

  const purityLayers = ordered.filter(
    (l) => Array.isArray(l.forbiddenGlobals) && l.forbiddenGlobals.length
  );
  const infraLayers = ordered.filter((l) => l.mayImportInfrastructure);
  const excludeLayers = ordered.filter((l) => Array.isArray(l.exclude) && l.exclude.length);
  const intentMap = ordered
    .filter((l) => Array.isArray(l.intentPrefixes) && l.intentPrefixes.length)
    .map((l) => ({ name: l.name, prefixes: l.intentPrefixes }));

  const emptyLayers = coverage?.emptyLayers ?? [];
  const layersWithoutRules = coverage?.layersWithoutRules ?? [];
  const unclassifiedCount = coverage?.unclassified?.count ?? 0;
  const includeRoots = Array.isArray(config.include) ? config.include : [];

  const typeOnlyN = violations.filter((v) => v.typeOnly).length;
  const valueN = violations.length - typeOnlyN;
  const byEdge = new Map();
  for (const v of violations) {
    if (!v.fromLayer || !v.toLayer) continue;
    const key = `${v.fromLayer} → ${v.toLayer}`;
    byEdge.set(key, (byEdge.get(key) || 0) + 1);
  }
  const topEdges = [...byEdge.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  let packageManagerLabel = 'npm';
  try {
    packageManagerLabel = detectPackageManager(root);
  } catch {
    /* ignore */
  }

  const baselinePath = path.join(root, '.ark-baseline.json');
  let baselineKeys = 0;
  if (fs.existsSync(baselinePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      baselineKeys = Array.isArray(raw?.violations)
        ? raw.violations.length
        : Array.isArray(raw)
          ? raw.length
          : typeof raw === 'object' && raw
            ? Object.keys(raw).length
            : 0;
    } catch {
      baselineKeys = suppressed || 0;
    }
  }

  // Pattern specificity hotspots: very broad globs (**/ or bare *) vs file-precise.
  const broadPatterns = [];
  const precisePatterns = [];
  for (const layer of ordered) {
    for (const pattern of layer.patterns || []) {
      const p = String(pattern);
      const scoreP = patternSpecificity(p);
      if (p.includes('**') && p.split('/').filter(Boolean).length <= 2) {
        broadPatterns.push({ layer: layer.name, pattern: p, score: scoreP });
      }
      if (!p.includes('*') || /\.[a-zA-Z0-9]+$/.test(p.replace(/\*$/, ''))) {
        if (p.includes('.') && !p.endsWith('/**')) {
          precisePatterns.push({ layer: layer.name, pattern: p, score: scoreP });
        }
      }
    }
  }
  broadPatterns.sort((a, b) => a.score - b.score);
  precisePatterns.sort((a, b) => b.score - a.score);

  const counts = fileCountByLayer instanceof Map ? fileCountByLayer : new Map();
  const maxFiles = Math.max(1, ...ordered.map((l) => counts.get(l.name) || 0));

  // Concentric “onion” SVG — outer entrypoints, pure core in the center.
  const palette = [
    '#38bdf8',
    '#818cf8',
    '#a78bfa',
    '#e879f9',
    '#fb7185',
    '#fb923c',
    '#fbbf24',
    '#a3e635',
    '#34d399',
    '#2dd4bf',
    '#22d3ee',
    '#60a5fa',
  ];
  // ordered is inner→outer; reverse for drawing outer rings first
  const outerFirst = [...ordered].reverse();
  const n = outerFirst.length || 1;
  const cx = 200;
  const cy = 200;
  const rMax = 185;
  const rMin = 28;
  const rings = outerFirst
    .map((layer, i) => {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const rOuter = rMax - t0 * (rMax - rMin);
      const rInner = rMax - t1 * (rMax - rMin);
      const color = palette[i % palette.length];
      const files = counts.get(layer.name) || 0;
      // Donut sector as full ring (annulus) via two arcs
      const ringPath = (() => {
        if (rInner <= 0.5) {
          return `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.2"/>`;
        }
        return `<circle cx="${cx}" cy="${cy}" r="${(rOuter + rInner) / 2}" fill="none" stroke="${color}" stroke-width="${Math.max(6, rOuter - rInner - 2)}" stroke-opacity="0.85"/>`;
      })();
      const labelR = (rOuter + rInner) / 2;
      const labelY = cy - labelR + (i === n - 1 ? 0 : 0);
      // Labels stacked on the right of the diagram for readability
      return { layer, color, files, ringPath, labelR, i };
    })
    .map((item, idx, arr) => {
      const legendY = 28 + idx * 22;
      return `${item.ringPath}
        <circle cx="430" cy="${legendY}" r="5" fill="${item.color}"/>
        <text x="442" y="${legendY + 4}" class="svg-lbl">${esc(item.layer.name)} · ${item.files}</text>`;
    })
    .join('\n');
  const coreLabel =
    ordered.length > 0
      ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="svg-core">${esc(ordered[0].name)}</text>`
      : '';
  const onionSvg = `<svg viewBox="0 0 560 400" class="onion" role="img" aria-label="Architecture layers from outer adapters to inner core">
    <rect x="0" y="0" width="560" height="400" fill="transparent"/>
    ${rings}
    ${coreLabel}
    <text x="${cx}" y="388" text-anchor="middle" class="svg-cap">outer adapters → pure core</text>
  </svg>`;

  // Coverage bars
  const barRows = ordered
    .map((layer) => {
      const files = counts.get(layer.name) || 0;
      const pct = Math.round((files / maxFiles) * 100);
      const example = exampleByLayer?.get?.(layer.name);
      return `<div class="bar-row">
        <div class="bar-name">${esc(layer.name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-n">${files}</div>
        <div class="bar-ex">${example ? `<code>${esc(example)}</code>` : '<span class="dim">—</span>'}</div>
      </div>`;
    })
    .join('\n');

  const layerRows = ordered
    .map((layer) => {
      const tags = [
        Array.isArray(layer.forbiddenGlobals) && layer.forbiddenGlobals.length
          ? `<span class="tag warn">no ${layer.forbiddenGlobals.map(esc).join(', ')}</span>`
          : '',
        layer.mayImportInfrastructure ? '<span class="tag">may import infra</span>' : '',
        Array.isArray(layer.intentPrefixes) && layer.intentPrefixes.length
          ? `<span class="tag">${layer.intentPrefixes.map(esc).join(' ')}</span>`
          : '',
        layer.optional ? '<span class="tag dim-tag">optional</span>' : '',
      ].join(' ');
      const example = exampleByLayer?.get?.(layer.name);
      const files = counts.get(layer.name) || 0;
      return `<tr>
        <td class="ln">${esc(layer.name)}<div class="tags">${tags}</div></td>
        <td>${layer.description ? esc(layer.description) : '<span class="dim">—</span>'}</td>
        <td class="num">${files}</td>
        <td><code class="pat">${(layer.patterns || []).map(esc).join('<br>') || '—'}</code></td>
        <td>${example ? `<code>${esc(example)}</code>` : '<span class="dim">no files yet</span>'}</td>
      </tr>`;
    })
    .join('\n');

  const flowRows = ordered
    .map((layer) => {
      const targets = ordered
        .filter((other) => other.name !== layer.name)
        .filter((other) => {
          const rule = findRule(layer.name, other.name);
          return !(rule && rule.allowed === false);
        })
        .map((other) => `<span class="chip ok">${esc(other.name)}</span>`)
        .join('');
      return `<div class="flow"><span class="flow-name">${esc(layer.name)}</span>
        <span class="flow-arrow">may import →</span>
        <span class="flow-targets">${targets || '<span class="dim">nothing (pure core)</span>'}</span></div>`;
    })
    .join('\n');

  const matrixHead = ordered.map((l) => `<th class="rot"><span>${esc(l.name)}</span></th>`).join('');
  const matrixBody = ordered
    .map((from) => {
      const cells = ordered
        .map((to) => {
          if (from.name === to.name) return '<td class="self">·</td>';
          const rule = findRule(from.name, to.name);
          if (!rule) return '<td class="implicit" title="no rule (implicitly allowed)">·</td>';
          return rule.allowed
            ? '<td class="allow" title="allowed">✓</td>'
            : `<td class="deny" title="${esc(rule.message || 'denied')}">✕</td>`;
        })
        .join('');
      return `<tr><th class="rowlbl">${esc(from.name)}</th>${cells}</tr>`;
    })
    .join('\n');

  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.ruleId)) byRule.set(v.ruleId, []);
    byRule.get(v.ruleId).push(v);
  }
  const violationBlocks = violations.length
    ? [...byRule.entries()]
        .map(([ruleId, items]) => {
          const hint = FIX_HINTS[ruleId];
          const rows = items
            .map((v) => {
              const edge =
                v.fromLayer && v.toLayer ? `${esc(v.fromLayer)} → ${esc(v.toLayer)}` : '';
              const enriched = enrichViolationWithFixClass(v);
              return `<li>
                <code>${esc(v.file)}:${v.line}</code>
                ${edge ? `<span class="edge">${edge}${v.target ? ` <span class="dim">(${esc(v.target)})</span>` : ''}</span>` : ''}
                <div class="msg">${esc(enriched.enthusiastHint || v.message)}</div>
              </li>`;
            })
            .join('\n');
          return `<div class="vgroup">
            <div class="vghead"><span class="rule">${esc(ruleId)}</span> <span class="dim">${items.length}</span></div>
            <ul class="vitems">${rows}</ul>
            ${hint ? `<div class="fix">fix: ${esc(hint)}</div>` : ''}
          </div>`;
        })
        .join('\n')
    : `<div class="clean hero-clean">
        <div class="clean-title">Architecture matches the contract</div>
        <div class="clean-body">No active violations${suppressed ? ` · ${suppressed} frozen by baseline` : ''}. This is what “honest green” looks like when coverage is real.</div>
      </div>`;

  const enforcementRows = enforcement
    .map(
      (e) =>
        `<div class="gate ${e.on ? 'on' : 'off'}">
          <span class="dot"></span>
          <div><b>${esc(e.name)}</b><div class="gdesc">${esc(e.what)}</div>
          ${e.where ? `<code>${esc(e.where)}</code>` : '<span class="dim">not configured</span>'}</div>
        </div>`
    )
    .join('\n');

  const skillsNote =
    skillGaps.length === 0
      ? '<div class="pill good">Agent skills current for detected tools</div>'
      : `<div class="pill warn">${skillGaps.length} skill gap(s) — run ark upgrade / --install-agent-gates</div>`;

  const meta = [
    version ? `ark-check v${esc(version)}` : '',
    generatedAt ? esc(generatedAt) : '',
    configPath ? `config: ${esc(configPath)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const govLabel =
    governedPercent == null ? '—' : `${governedPercent}% (${classifiedFiles}/${totalFiles})`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ark · ${esc(project)}</title>
<style>
  :root {
    --bg: #07090d; --panel: #10141b; --panel2: #161b24; --ink: #eef1f5; --dim: #8b93a0;
    --line: #243041; --green: #34d399; --red: #f87171; --accent: #38bdf8; --gold: #fbbf24;
    --violet: #a78bfa; --radius: 14px;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f4f6f9; --panel: #fff; --panel2: #f8fafc; --ink: #0f172a; --dim: #64748b;
      --line: #e2e8f0; --green: #059669; --red: #dc2626; --accent: #0284c7; --gold: #d97706;
      --violet: #7c3aed;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 0 4rem;
    background:
      radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 60%),
      radial-gradient(900px 500px at 100% 0%, color-mix(in srgb, var(--violet) 14%, transparent), transparent 55%),
      var(--bg);
    color: var(--ink);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 2rem 1.25rem; }
  .hero {
    display: grid; grid-template-columns: 1.4fr 0.9fr; gap: 1.25rem; align-items: stretch;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 820px) { .hero { grid-template-columns: 1fr; } }
  .card {
    background: linear-gradient(180deg, color-mix(in srgb, var(--panel) 92%, #fff 4%), var(--panel));
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 1.15rem 1.25rem; box-shadow: 0 20px 50px rgba(0,0,0,.18);
  }
  h1 { font-size: 1.65rem; margin: 0 0 .35rem; letter-spacing: -0.02em; }
  h2 { font-size: 1.05rem; margin: 0 0 .35rem; letter-spacing: -0.01em; }
  h3 { font-size: .92rem; margin: 1rem 0 .4rem; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
  .lede { color: var(--dim); margin: 0 0 1rem; max-width: 42rem; }
  .meta { color: var(--dim); font-size: .8rem; margin: .75rem 0 0; }
  .badge, .pill {
    display: inline-flex; align-items: center; gap: .35rem;
    padding: .2em .65em; border-radius: 999px; font-weight: 700; font-size: .78rem;
    letter-spacing: .03em; border: 1px solid transparent;
  }
  .PASS { background: color-mix(in srgb, var(--green) 18%, transparent); color: var(--green); border-color: color-mix(in srgb, var(--green) 35%, transparent); }
  .FAIL { background: color-mix(in srgb, var(--red) 18%, transparent); color: var(--red); border-color: color-mix(in srgb, var(--red) 35%, transparent); }
  .mode { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
  .pill.good { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green); }
  .pill.warn { background: color-mix(in srgb, var(--gold) 16%, transparent); color: var(--gold); }
  .score-card { display: flex; flex-direction: column; justify-content: center; text-align: center; min-height: 100%; }
  .score-ring {
    --p: ${score};
    width: 148px; height: 148px; margin: .25rem auto 0.85rem;
    border-radius: 50%;
    background:
      radial-gradient(var(--panel) 58%, transparent 59%),
      conic-gradient(var(--accent) calc(var(--p) * 1%), var(--line) 0);
    display: grid; place-items: center;
  }
  .score-ring.elite { background:
      radial-gradient(var(--panel) 58%, transparent 59%),
      conic-gradient(var(--green) calc(var(--p) * 1%), var(--line) 0); }
  .score-ring.strong { background:
      radial-gradient(var(--panel) 58%, transparent 59%),
      conic-gradient(var(--accent) calc(var(--p) * 1%), var(--line) 0); }
  .score-ring.ok { background:
      radial-gradient(var(--panel) 58%, transparent 59%),
      conic-gradient(var(--gold) calc(var(--p) * 1%), var(--line) 0); }
  .score-ring.weak { background:
      radial-gradient(var(--panel) 58%, transparent 59%),
      conic-gradient(var(--red) calc(var(--p) * 1%), var(--line) 0); }
  .score-n { font-size: 2.1rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
  .score-cap { color: var(--dim); font-size: .85rem; margin: 0; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: .65rem; margin: 1rem 0 0; }
  @media (max-width: 720px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
  .kpi { background: var(--panel2); border: 1px solid var(--line); border-radius: 12px; padding: .7rem .8rem; }
  .kpi b { display: block; font-size: 1.25rem; letter-spacing: -0.02em; }
  .kpi span { color: var(--dim); font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; }
  .section { margin-top: 1.35rem; }
  .grid-2 { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 1rem; }
  @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
  .onion { width: 100%; height: auto; display: block; }
  .svg-lbl { fill: var(--dim); font-size: 11px; font-family: ui-sans-serif, system-ui, sans-serif; }
  .svg-core { fill: var(--ink); font-size: 11px; font-weight: 700; font-family: ui-sans-serif, system-ui, sans-serif; }
  .svg-cap { fill: var(--dim); font-size: 11px; font-family: ui-sans-serif, system-ui, sans-serif; }
  .bar-row { display: grid; grid-template-columns: 10.5rem 1fr 2.2rem minmax(0, 1fr); gap: .55rem; align-items: center; padding: .28rem 0; border-bottom: 1px solid var(--line); }
  .bar-name { font-weight: 600; font-size: .86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-track { height: 8px; background: var(--line); border-radius: 99px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--violet)); border-radius: 99px; }
  .bar-n { text-align: right; font-variant-numeric: tabular-nums; color: var(--dim); font-size: .85rem; }
  .bar-ex { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dim { color: var(--dim); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .84em; }
  code.pat { font-size: .78em; color: var(--dim); }
  table { width: 100%; border-collapse: collapse; }
  .layers td, .layers th { text-align: left; padding: .65rem .55rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  .layers th { color: var(--dim); font-weight: 600; font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; }
  .ln { font-weight: 650; }
  .num { font-variant-numeric: tabular-nums; font-weight: 650; }
  .tags { margin-top: .3rem; display: flex; flex-wrap: wrap; gap: .25rem; }
  .tag { display: inline-block; padding: .08em .45em; border: 1px solid var(--line); border-radius: 6px; font-size: .68rem; color: var(--dim); }
  .tag.warn { border-color: color-mix(in srgb, var(--gold) 40%, var(--line)); color: var(--gold); }
  .dim-tag { opacity: .75; }
  .flow { display: flex; gap: .5rem; align-items: baseline; padding: .45rem 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .flow-name { font-weight: 650; min-width: 12rem; }
  .flow-arrow { color: var(--dim); font-size: .8rem; }
  .flow-targets { display: flex; flex-wrap: wrap; gap: .3rem; }
  .chip { display: inline-block; padding: .12em .5em; border: 1px solid var(--line); border-radius: 6px; font-size: .76rem; color: var(--dim); background: var(--panel2); }
  .chip.ok { color: var(--ink); border-color: color-mix(in srgb, var(--accent) 30%, var(--line)); }
  details { margin-top: .85rem; }
  summary { cursor: pointer; color: var(--accent); font-size: .9rem; }
  /* Matrix must NOT inherit global table{width:100%} — that bloated the label column
     and shoved every cell to the right. Keep it compact and left-aligned. */
  .matrix-scroll {
    overflow-x: auto; margin-top: .75rem; max-width: 100%;
    text-align: left; -webkit-overflow-scrolling: touch;
  }
  .matrix {
    width: max-content; max-width: none; border-collapse: collapse;
    font-size: .8rem; margin: 0; table-layout: fixed;
  }
  .matrix th, .matrix td { border: 1px solid var(--line); }
  .matrix td {
    width: 2.05rem; min-width: 2.05rem; max-width: 2.05rem;
    height: 2.05rem; text-align: center; font-weight: 700; padding: 0;
  }
  .matrix .rowlbl {
    text-align: left; padding: 0 .75rem 0 .35rem; color: var(--dim);
    font-weight: 600; white-space: nowrap; width: auto; min-width: 9.5rem;
    max-width: none; position: sticky; left: 0; z-index: 1;
    background: var(--panel); box-shadow: 4px 0 8px -4px rgba(0,0,0,.25);
  }
  .matrix thead th:first-child,
  .matrix tr th.rowlbl { background: var(--panel); }
  .matrix .corner {
    position: sticky; left: 0; z-index: 2; background: var(--panel);
    min-width: 9.5rem; box-shadow: 4px 0 8px -4px rgba(0,0,0,.25);
  }
  .matrix .rot {
    height: 9.5rem; vertical-align: bottom; padding: .2rem .15rem;
    width: 2.05rem; min-width: 2.05rem; max-width: 2.05rem;
  }
  .matrix .rot span {
    writing-mode: vertical-rl; transform: rotate(180deg); color: var(--dim);
    font-weight: 600; white-space: nowrap; display: inline-block; max-height: 9rem;
    overflow: hidden; text-overflow: ellipsis;
  }
  .allow { color: var(--green); background: color-mix(in srgb, var(--green) 12%, transparent); }
  .deny { color: var(--red); background: color-mix(in srgb, var(--red) 12%, transparent); }
  .implicit { color: var(--dim); }
  .self { color: var(--line); }
  .legend { color: var(--dim); font-size: .8rem; margin: .55rem 0 0; }
  .gates { display: grid; grid-template-columns: repeat(2, 1fr); gap: .65rem; }
  @media (max-width: 700px) { .gates { grid-template-columns: 1fr; } }
  .gate { display: flex; gap: .65rem; align-items: flex-start; padding: .75rem .8rem; border-radius: 12px; border: 1px solid var(--line); background: var(--panel2); }
  .gate .dot { width: .65rem; height: .65rem; border-radius: 50%; margin-top: .35rem; background: var(--line); flex: 0 0 auto; }
  .gate.on .dot { background: var(--green); box-shadow: 0 0 0 4px color-mix(in srgb, var(--green) 20%, transparent); }
  .gate.off { opacity: .72; }
  .gdesc { color: var(--dim); font-size: .85rem; margin: .1rem 0 .25rem; }
  .vgroup { background: var(--panel2); border: 1px solid var(--line); border-left: 3px solid var(--red); border-radius: 10px; padding: .75rem .9rem; margin-bottom: .6rem; }
  .vghead { display: flex; gap: .5rem; align-items: baseline; }
  .rule { font-weight: 700; font-size: .8rem; color: var(--red); }
  .vitems { list-style: none; padding: 0; margin: .4rem 0 0; }
  .vitems li { padding: .35rem 0; border-top: 1px solid var(--line); }
  .vitems li:first-child { border-top: none; }
  .edge { color: var(--accent); font-weight: 650; margin-left: .35rem; }
  .fix { margin-top: .4rem; color: var(--dim); font-size: .86rem; }
  .clean, .hero-clean { background: var(--panel2); border: 1px solid var(--line); border-left: 3px solid var(--green); border-radius: 12px; padding: 1rem 1.1rem; }
  .clean-title { font-weight: 750; color: var(--green); margin-bottom: .25rem; }
  .clean-body { color: var(--dim); }
  .cmds { display: grid; gap: .35rem; background: var(--panel2); border: 1px solid var(--line); border-radius: 12px; padding: .9rem 1rem; }
  .cmds code { display: block; padding: .15rem 0; overflow-x: auto; }
  footer { margin-top: 2.25rem; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--dim); font-size: .8rem; }
  .brand { display: inline-flex; align-items: center; gap: .4rem; color: var(--dim); font-size: .78rem; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; margin-bottom: .55rem; }
  .brand i { width: .55rem; height: .55rem; border-radius: 2px; background: linear-gradient(135deg, var(--accent), var(--violet)); display: inline-block; }
  .senior h3 { margin-top: 1.25rem; }
  .senior-list { margin: .2rem 0 0; padding-left: 1.1rem; color: var(--ink); }
  .senior-list li { margin: .2rem 0; }
  .senior-list .edge { margin-left: 0; }
  .delta.up { color: var(--green); font-weight: 700; }
  .delta.down { color: var(--red); font-weight: 700; }
  .delta.flat { color: var(--dim); }
  .evolve { border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); }
  @media print {
    body { background: #fff; color: #111; padding: 0; }
    .card, .kpi, .gate, .cmds, .clean, .vgroup { box-shadow: none; break-inside: avoid; }
    details { open: true; }
  }
</style></head>
<body><div class="wrap">
  <div class="hero">
    <div class="card">
      <div class="brand"><i></i> Ark architecture report</div>
      <h1>${esc(project)} <span class="badge ${status}">${status}</span> <span class="badge mode">${esc(modeLabel)}</span></h1>
      <p class="lede">${esc(modeBlurb)} One machine-readable contract · write gate · CI · optional runtime.</p>
      <div class="kpis">
        <div class="kpi"><b>${esc(govLabel)}</b><span>Governed</span></div>
        <div class="kpi"><b>${layers.length}</b><span>Layers</span></div>
        <div class="kpi"><b>${gatesOn}/${enforcement.length}</b><span>Gates live</span></div>
        <div class="kpi"><b>${violations.length}${suppressed ? ` · ${suppressed}Δ` : ''}</b><span>Violations${suppressed ? ' · frozen' : ''}</span></div>
      </div>
      <p class="meta">${meta}</p>
      ${skillsNote}
    </div>
    <div class="card score-card">
      <div class="score-ring ${scoreTone}"><div><div class="score-n">${score}</div><div class="dim" style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase">Ark score</div></div></div>
      <p class="score-cap">${esc(scoreCaption)}</p>
      <p class="meta" style="margin-top:.65rem">Coverage ${scoreCoverage} · Clean ${scoreClean} · Gates ${scoreGates} · Rules ${scoreRules}</p>
    </div>
  </div>

  <div class="section grid-2">
    <div class="card">
      <h2>Architecture map</h2>
      <p class="dim" style="margin:.15rem 0 0.75rem;font-size:.88rem">Outer rings = entrypoints & adapters. Center = purest core.</p>
      ${onionSvg}
    </div>
    <div class="card">
      <h2>Files per layer</h2>
      <p class="dim" style="margin:.15rem 0 0.75rem;font-size:.88rem">${classifiedFiles} classified · ${totalFiles} in scope${coverage?.unclassified?.count ? ` · ${coverage.unclassified.count} unclassified` : ''}</p>
      ${barRows || '<p class="dim">No layer file counts.</p>'}
    </div>
  </div>

  <div class="section card">
    <h2>Layers</h2>
    <p class="dim" style="margin:.15rem 0 .75rem;font-size:.88rem">Innermost (most restricted) → outermost (entrypoints). Forbidden globals protect pure cores.</p>
    <table class="layers">
      <tr><th>Layer</th><th>Purpose</th><th>Files</th><th>Patterns</th><th>Example</th></tr>
      ${layerRows || '<tr><td colspan="5" class="dim">No layers configured.</td></tr>'}
    </table>
  </div>

  <div class="section card">
    <h2>Dependency direction</h2>
    <p class="dim" style="margin:.15rem 0 .75rem;font-size:.88rem">Inner layers stay ignorant of outer ones. Each row lists what it may import.</p>
    ${flowRows || '<p class="dim">No layers configured.</p>'}
    <details open>
      <summary>Full matrix (precise ✓ / ✕ grid)</summary>
      <div class="matrix-scroll"><table class="matrix">
        <thead><tr><th class="corner"></th>${matrixHead}</tr></thead>
        <tbody>${matrixBody}</tbody>
      </table></div>
      <p class="legend">Row imports column (left → top). ✓ allowed · ✕ denied · · = no explicit rule / self. Denied edges: ${deniedCount} · explicit allows: ${allowedCount} · purity-guarded layers: ${guarded}</p>
    </details>
  </div>

  <div class="section card">
    <h2>Violations</h2>
    ${violationBlocks}
  </div>

  <div class="section card">
    <h2>Enforcement points</h2>
    <p class="dim" style="margin:.15rem 0 .85rem;font-size:.88rem">Write-time · merge-time · editor · ratchet. Same contract everywhere.</p>
    <div class="gates">${enforcementRows}</div>
  </div>

  ${(() => {
    if (!currentSnapshot) return '';
    // First report: originSnapshot is null at render time (written to disk just after).
    if (originJustCreated || !originSnapshot) {
      return `<div class="section card evolve">
        <h2>Origin baseline captured</h2>
        <p class="dim" style="margin:.2rem 0 0;font-size:.9rem">
          This is the <b>first</b> architecture snapshot for this project
          (<code>.ark/reports/origin.json</code> + <code>origin.html</code>).
          Future reports will show deltas against this starting point so you can prove evolution.
        </p>
      </div>`;
    }
    const rows = [
      ['Ark score', originSnapshot.score, currentSnapshot.score, ''],
      ['Governed %', originSnapshot.governedPercent, currentSnapshot.governedPercent, 'pp'],
      ['Files in scope', originSnapshot.totalFiles, currentSnapshot.totalFiles, ''],
      ['Classified files', originSnapshot.classifiedFiles, currentSnapshot.classifiedFiles, ''],
      ['Active violations', originSnapshot.activeViolations, currentSnapshot.activeViolations, ''],
      ['Value violations', originSnapshot.valueViolations, currentSnapshot.valueViolations, ''],
      ['Type-only violations', originSnapshot.typeOnlyViolations, currentSnapshot.typeOnlyViolations, ''],
      ['Layers', originSnapshot.layerCount, currentSnapshot.layerCount, ''],
      ['Deny rules', originSnapshot.denyRules, currentSnapshot.denyRules, ''],
      ['Gates live', originSnapshot.gatesOn, currentSnapshot.gatesOn, ''],
    ];
    const originDate = (originSnapshot.generatedAt || '').slice(0, 10) || 'origin';
    const nowDate = (currentSnapshot.generatedAt || '').slice(0, 10) || 'now';
    const tr = rows
      .map(([label, from, to, unit]) => {
        const d =
          typeof from === 'number' && typeof to === 'number' ? to - from : null;
        const good =
          label.includes('violation') || label.includes('Violation')
            ? d != null && d <= 0
            : label.includes('Governed') || label.includes('score') || label.includes('Classified') || label.includes('Gates')
              ? d != null && d >= 0
              : null;
        const cls =
          d == null || d === 0 ? 'flat' : good === true ? 'up' : good === false ? 'down' : 'flat';
        const delta =
          d == null
            ? '—'
            : unit === 'pp'
              ? formatDelta(Math.round(d * 10) / 10, { suffix: ' pp' })
              : formatDelta(d);
        return `<tr>
          <td>${esc(label)}</td>
          <td class="num">${from ?? '—'}</td>
          <td class="num">${to ?? '—'}</td>
          <td class="num delta ${cls}">${esc(delta)}</td>
        </tr>`;
      })
      .join('\n');
    // Layer file deltas
    const originLayers = originSnapshot.layerFiles || {};
    const currentLayers = currentSnapshot.layerFiles || {};
    const layerKeys = [...new Set([...Object.keys(originLayers), ...Object.keys(currentLayers)])].sort();
    const layerTr = layerKeys
      .map((name) => {
        const from = originLayers[name] || 0;
        const to = currentLayers[name] || 0;
        const d = to - from;
        const cls = d === 0 ? 'flat' : d > 0 ? 'up' : 'down';
        return `<tr>
          <td class="ln">${esc(name)}</td>
          <td class="num">${from}</td>
          <td class="num">${to}</td>
          <td class="num delta ${cls}">${esc(formatDelta(d))}</td>
        </tr>`;
      })
      .join('\n');
    return `<div class="section card evolve">
      <h2>Evolution vs origin</h2>
      <p class="dim" style="margin:.15rem 0 .75rem;font-size:.88rem">
        Origin snapshot <code>${esc(originDate)}</code> → this report <code>${esc(nowDate)}</code>
        · frozen at <code>.ark/reports/origin.*</code> · reopen origin HTML anytime for the starting picture.
      </p>
      <table class="layers">
        <tr><th>Metric</th><th>Origin</th><th>Now</th><th>Δ</th></tr>
        ${tr}
      </table>
      <h3>Files per layer</h3>
      <table class="layers">
        <tr><th>Layer</th><th>Origin</th><th>Now</th><th>Δ</th></tr>
        ${layerTr || '<tr><td colspan="4" class="dim">No layer file data in snapshots.</td></tr>'}
      </table>
      <p class="legend">Green Δ = improvement for that metric (↑ coverage/score/gates, ↓ violations). History JSON under <code>.ark/reports/history/</code> (last ${ARK_REPORT_HISTORY_MAX}).</p>
    </div>`;
  })()}

  <div class="section card senior">
    <h2>Senior diagnostics</h2>
    <p class="dim" style="margin:.15rem 0 .85rem;font-size:.88rem">
      Coupling, purity surface, contract density, and config forensics — for tech leads reviewing the fitness of the gate itself.
    </p>

    <h3>Contract density</h3>
    <div class="kpis" style="margin-top:.35rem">
      <div class="kpi"><b>${denyRatio}%</b><span>Edges denied</span></div>
      <div class="kpi"><b>${deniedCount}</b><span>Deny rules</span></div>
      <div class="kpi"><b>${allowedCount}</b><span>Explicit allows</span></div>
      <div class="kpi"><b>${pairCount}</b><span>Directed pairs</span></div>
    </div>
    <p class="dim" style="margin:.55rem 0 0;font-size:.84rem">
      Deny ratio = denied ÷ (layers × (layers−1)). High ratio = strict inward architecture.
      Package manager detected: <code>${esc(packageManagerLabel)}</code>
      · include roots: <code>${includeRoots.map(esc).join('</code>, <code>') || '—'}</code>
      ${emptyLayers.length ? ` · empty layers: <code>${emptyLayers.map(esc).join(', ')}</code>` : ''}
      ${layersWithoutRules.length ? ` · layers with no rule edge: <code>${layersWithoutRules.map(esc).join(', ')}</code>` : ''}
      ${unclassifiedCount ? ` · unclassified files: <b>${unclassifiedCount}</b>` : ''}
    </p>

    <h3>Layer coupling (allowed import graph)</h3>
    <p class="dim" style="margin:.1rem 0 .55rem;font-size:.84rem">
      Fan-out = layers this layer may import · Fan-in = layers that may import it · based on non-denied edges (implicit allow counts as open).
    </p>
    <table class="layers">
      <tr><th>Layer</th><th>Files</th><th>Fan-out</th><th>Fan-in</th><th>Deny-out</th><th>FO/files</th></tr>
      ${couplingRows
        .map(
          (r) => `<tr>
          <td class="ln">${esc(r.name)}</td>
          <td class="num">${r.files}</td>
          <td class="num">${r.fo}</td>
          <td class="num">${r.fi}</td>
          <td class="num">${r.denyOut}</td>
          <td class="num">${r.density}</td>
        </tr>`
        )
        .join('\n')}
    </table>
    <p class="legend">High fan-out on a large presentation layer is normal. High fan-out on a “domain” layer is a smell — the core is leaking outward privileges.</p>

    <h3>Purity &amp; infrastructure surface</h3>
    <div class="grid-2" style="margin-top:.5rem">
      <div>
        <div class="pill ${purityLayers.length ? 'good' : 'warn'}" style="margin-bottom:.55rem">
          ${purityLayers.length} purity-guarded layer(s)
        </div>
        ${
          purityLayers.length
            ? `<ul class="senior-list">${purityLayers
                .map(
                  (l) =>
                    `<li><b>${esc(l.name)}</b> forbids <code>${(l.forbiddenGlobals || []).map(esc).join('</code>, <code>')}</code></li>`
                )
                .join('')}</ul>`
            : '<p class="dim">No <code>forbiddenGlobals</code> — ambient I/O can still leak into pure cores.</p>'
        }
      </div>
      <div>
        <div class="pill ${infraLayers.length ? 'good' : 'warn'}" style="margin-bottom:.55rem">
          ${infraLayers.length} infra-capable layer(s)
        </div>
        ${
          infraLayers.length
            ? `<ul class="senior-list">${infraLayers
                .map((l) => `<li><b>${esc(l.name)}</b> <span class="tag">mayImportInfrastructure</span></li>`)
                .join('')}</ul>`
            : '<p class="dim">No layer opts into infrastructure imports via <code>mayImportInfrastructure</code> (write-gate heuristic still applies to ungoverned targets).</p>'
        }
        ${
          excludeLayers.length
            ? `<p class="dim" style="margin-top:.65rem">Exclude globs (facade / kernel carve-outs):</p>
               <ul class="senior-list">${excludeLayers
                 .map(
                   (l) =>
                     `<li><b>${esc(l.name)}</b> · <code>${(l.exclude || []).map(esc).join('</code>, <code>')}</code></li>`
                 )
                 .join('')}</ul>`
            : ''
        }
      </div>
    </div>

    <h3>Intent prefixes</h3>
    ${
      intentMap.length
        ? `<table class="layers"><tr><th>Layer</th><th>Prefixes</th></tr>
          ${intentMap
            .map(
              (row) =>
                `<tr><td class="ln">${esc(row.name)}</td><td><code>${row.prefixes.map(esc).join('</code> <code>')}</code></td></tr>`
            )
            .join('\n')}</table>`
        : '<p class="dim">No <code>intentPrefixes</code> on layers — runtime intent governance and string-intent checks have less to bind to.</p>'
    }

    <h3>Pattern forensics</h3>
    <div class="grid-2" style="margin-top:.45rem">
      <div>
        <p class="dim" style="margin:0 0 .4rem;font-size:.84rem">Broadest globs (watch for over-governance / false layer hits)</p>
        ${
          broadPatterns.length
            ? `<ul class="senior-list">${broadPatterns
                .slice(0, 8)
                .map(
                  (p) =>
                    `<li><b>${esc(p.layer)}</b> · <code>${esc(p.pattern)}</code> <span class="dim">spec ${p.score}</span></li>`
                )
                .join('')}</ul>`
            : '<p class="dim">No ultra-broad patterns detected.</p>'
        }
      </div>
      <div>
        <p class="dim" style="margin:0 0 .4rem;font-size:.84rem">Most precise patterns (file-level overlays, facades)</p>
        ${
          precisePatterns.length
            ? `<ul class="senior-list">${precisePatterns
                .slice(0, 8)
                .map(
                  (p) =>
                    `<li><b>${esc(p.layer)}</b> · <code>${esc(p.pattern)}</code> <span class="dim">spec ${p.score}</span></li>`
                )
                .join('')}</ul>`
            : '<p class="dim">No file-level patterns — only directory globs.</p>'
        }
      </div>
    </div>

    <h3>Debt &amp; violation taxonomy</h3>
    <div class="kpis" style="margin-top:.35rem">
      <div class="kpi"><b>${violations.length}</b><span>Active</span></div>
      <div class="kpi"><b>${valueN}</b><span>Value edges</span></div>
      <div class="kpi"><b>${typeOnlyN}</b><span>Type-only</span></div>
      <div class="kpi"><b>${suppressed || baselineKeys}</b><span>Baseline keys</span></div>
    </div>
    ${
      topEdges.length
        ? `<p class="dim" style="margin:.55rem 0 .35rem;font-size:.84rem">Hottest active edges</p>
           <ul class="senior-list">${topEdges
             .map(([edge, n]) => `<li><span class="edge">${esc(edge)}</span> · <b>${n}</b></li>`)
             .join('')}</ul>`
        : '<p class="dim" style="margin-top:.55rem">No active edge concentration — either clean or all debt is baselined.</p>'
    }

    <details style="margin-top:1rem">
      <summary>Score model (transparent)</summary>
      <p class="legend">
        Ark score = 0.4×coverage + 0.3×clean + 0.2×gates + 0.1×rule-density.
        Coverage=${scoreCoverage}, clean=${scoreClean}, gates=${scoreGates}, rules=${scoreRules} → <b>${score}</b>.
        This is a fitness signal for humans, not a CI gate.
      </p>
    </details>
  </div>

  <div class="section card">
    <h2>Commands worth memorizing</h2>
    <div class="cmds">
      <code>${arkCheckCommand(root)}</code>
      <code>${arkCommand(root, 'ark-check', '--coverage')}</code>
      <code>${arkCommand(root, 'ark-check', '--plan')}</code>
      <code>${arkCommand(root, 'ark-check', '--doctor')}</code>
      <code>${arkCommand(root, 'ark-check', '--report ark-report.html')}</code>
      <code>/ark-place "&lt;what you're building&gt;"</code>
      <code>/ark-explain</code>
    </div>
  </div>

  <footer>
    Generated by ${meta || 'ark-check'} · visual twin of <code>/ark-explain</code>.
    Regenerate with <code>ark-check --report</code>; add the file to <code>.gitignore</code> rather than committing it.
  </footer>
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

// --coverage: a standalone visibility report (never changes the exit code). Answers
// "which files does each layer actually govern, and what is slipping through?" — the
// data the /ark-coverage skill otherwise has to hand-roll with find/readdir walks.
// Pure coverage computation (glob-only, no TypeScript): the object both `--coverage` and
// `--doctor` render. `governed` is the headline honesty number — the share of in-scope code
// Ark actually enforces rules on; `suggestions` proposes a layer for each ungoverned dir.
function computeCoverage(root, config, files, rules) {
  const layers = config.layers ?? [];
  const counts = new Map(layers.map((layer) => [layer.name, 0]));
  const unclassified = [];
  for (const file of files) {
    const layer = layerForFile(root, file, layers);
    if (layer && counts.has(layer)) counts.set(layer, counts.get(layer) + 1);
    else unclassified.push(normalize(path.relative(root, file)));
  }
  unclassified.sort();
  const layerRows = layers.map((layer) => ({
    name: layer.name,
    patterns: layer.patterns ?? [],
    files: counts.get(layer.name) ?? 0,
  }));
  // A layer whose patterns match zero files is dead config — it enforces nothing, usually a
  // wrong glob (the #1 monorepo mistake). A layer with no rule edge can import anything.
  const emptyLayers = layerRows.filter((row) => row.files === 0).map((row) => row.name);
  const layersWithoutRules = layerRows
    .map((row) => row.name)
    .filter((name) => !rules.some((rule) => rule.from === name || rule.to === name));
  const classifiedFiles = files.length - unclassified.length;
  // Empty scope is NOT "100% governed" — that was a false-green for monorepos/mis-includes
  // (0/0 → ENFORCE). Zero files means the contract is not checking anything yet.
  const fraction = files.length > 0 ? classifiedFiles / files.length : 0;
  return {
    include: config.include ?? [],
    totalFiles: files.length,
    emptyScope: files.length === 0,
    governed: { classifiedFiles, totalFiles: files.length, percent: Math.round(fraction * 100) },
    layers: layerRows,
    unclassified: { count: unclassified.length, files: unclassified },
    suggestions: buildUnclassifiedSuggestions(unclassified),
    emptyLayers,
    layersWithoutRules,
  };
}

function runCoverage(root, config, files, rules, asJson) {
  const cov = computeCoverage(root, config, files, rules);
  if (asJson) {
    console.log(JSON.stringify({ ok: true, coverage: cov }, null, 2));
    return;
  }
  const { governed, layers: layerRows, suggestions, layersWithoutRules } = cov;
  const classifiedFiles = governed.classifiedFiles;
  const unclassified = cov.unclassified.files;

  const nameWidth = Math.max(
    'Layer'.length,
    '(unclassified)'.length,
    ...layerRows.map((row) => row.name.length)
  );
  const pad = (value) => value.padEnd(nameWidth);
  console.log(`Ark coverage (include: ${(config.include ?? []).join(', ') || '.'}):`);
  console.log('');
  console.log(`  ${pad('Layer')}  Files`);
  for (const row of layerRows) {
    const flag = row.files === 0 ? '   (pattern matches nothing)' : '';
    console.log(`  ${pad(row.name)}  ${String(row.files).padStart(5)}${flag}`);
  }
  console.log(`  ${pad('(unclassified)')}  ${String(unclassified.length).padStart(5)}`);
  console.log('');
  console.log(
    `${files.length} source file(s) in scope; ${unclassified.length} not matched by any layer.`
  );
  console.log(`Governed: ${governed.percent}% (${classifiedFiles}/${files.length} files).`);
  if (files.length > 0 && governed.percent < 50) {
    console.log('');
    console.log(
      `⚠ Ark governs a MINORITY of your code (${governed.percent}%). A green check here does NOT`
    );
    console.log('  mean the codebase is checked — the rest is ungoverned. Classify the directories');
    console.log('  below to actually cover it.');
  }
  if (suggestions.length > 0) {
    console.log('');
    console.log('Ungoverned directories (proposed layer — from the 11-layer profile + presets):');
    for (const s of suggestions) {
      const count = `(${s.files})`.padStart(6);
      if (s.unrecognized) {
        console.log(`  ${count}  ${s.dir}/  — unrecognized, you classify`);
      } else {
        const alt = s.alternatives ? ` (or ${s.alternatives.join(' / ')})` : '';
        console.log(`  ${count}  ${s.dir}/  → ${s.layer}${alt}`);
      }
    }
    console.log('');
    console.log('Apply these via /ark-contract (adds the layer patterns to ark.config.json).');
  }
  if (layersWithoutRules.length > 0) {
    console.log('');
    console.log(`Layers with no rule edge (can import anything): ${layersWithoutRules.join(', ')}`);
  }
}

// --doctor: one consolidated health view — coverage, violations, gates, skills, baseline,
// and command runners — each with the exact command to fix it. Folds the data the other
// modes already produce so a team sees "what state is my Ark adoption in?" at a glance.
// Co-pilot Phase F — turn active violations into a classified, ordered remediation PLAN with an
// embedded GOAL. This is the `plan` primitive the future apply-loop (Phase H, `loop`) consumes
// and the autopilot (Phase I) drives toward the `goal`. Read-only: it changes no files.
function buildRemediationPlan(root, activeViolations, governedPercent = null, totalFiles = null) {
  // A plan with 0 violations but ~0% governed (or ZERO files in scope) is a FALSE green:
  // nothing is actually being checked. Treat as "not done — classify / fix include first."
  const governedLow = governedPercent != null && governedPercent < 50;
  const emptyScope = totalFiles === 0;
  const notHonestlyEnforced = governedLow || emptyScope;
  const steps = activeViolations.map((v, index) => {
    const verdict = classifyRemediation(v);
    return {
      id: `${v.ruleId}:${v.file}:${v.line ?? 0}:${index}`,
      class: verdict.class,
      confidence: verdict.confidence,
      rationale: verdict.rationale,
      ruleId: v.ruleId,
      edge: violationEdge(v),
      file: v.file,
      ...(v.line ? { line: v.line } : {}),
      ...(v.target ? { target: v.target } : {}),
      ...(v.typeOnly ? { typeOnly: true } : {}),
    };
  });
  // Order: auto-applicable first (quick, safe wins), then human decisions, then deferred.
  const rank = { 'mechanical-safe': 0, judgment: 1, deferred: 2 };
  steps.sort((a, b) => rank[a.class] - rank[b.class]);
  const countOf = (cls) => steps.filter((s) => s.class === cls).length;
  const counts = {
    mechanicalSafe: countOf('mechanical-safe'),
    judgment: countOf('judgment'),
    deferred: countOf('deferred'),
  };
  return {
    version: '1',
    goal: {
      statement:
        activeViolations.length > 0
          ? `Resolve ${activeViolations.length} architecture violation(s) without weakening the contract.`
          : emptyScope
            ? 'No source files matched the contract include paths — this "clean" result checks nothing. Fix include/layers (monorepo → apps/packages, or /ark-adopt) so Ark has real code to govern.'
            : governedLow
              ? `No violations — but Ark governs only ${governedPercent}% of your code, so this "clean" result checks almost nothing. Classify the rest (ark-check --coverage, then /ark-adopt) so it's actually enforced.`
              : 'No active violations — the architecture already meets its contract.',
      // The loop's termination signal (Phase H): nothing left to remediate AND the contract
      // actually governs real code. Empty scope or low coverage is not "met".
      met: activeViolations.length === 0 && !notHonestlyEnforced,
      ...(governedPercent != null ? { governedPercent } : {}),
      ...(totalFiles != null ? { totalFiles } : {}),
      ...(emptyScope ? { emptyScope: true } : {}),
      activeViolations: activeViolations.length,
      autoApplicable: counts.mechanicalSafe,
      needsDecision: counts.judgment,
      deferred: counts.deferred,
    },
    counts,
    steps,
  };
}

// `--plan`: print the classified remediation plan. Dual-focus output — a one-line headline
// anyone can read, then the per-step detail a developer acts on. Read-only.
function runPlan(root, activeViolations, asJson, governedPercent = null, totalFiles = null) {
  const plan = buildRemediationPlan(root, activeViolations, governedPercent, totalFiles);
  // Honesty: a zero-violation plan with almost nothing governed is NOT "ok".
  const planOk = plan.goal.met === true;
  if (asJson) {
    console.log(JSON.stringify({ ok: planOk, plan }, null, 2));
    return plan;
  }
  console.log(color.bold(`Ark plan — ${path.basename(path.resolve(root)) || '.'}`));
  console.log('');
  console.log(plan.goal.statement);
  if (governedPercent != null) {
    const pctLabel =
      governedPercent < 50
        ? color.yellow(`Governed: ${governedPercent}% of in-scope files`)
        : color.dim(`Governed: ${governedPercent}% of in-scope files`);
    console.log(pctLabel);
  }
  if (activeViolations.length === 0) return plan;
  console.log('');
  console.log(
    `  ${color.green(`${plan.counts.mechanicalSafe} safe to auto-apply`)} · ` +
      `${color.yellow(`${plan.counts.judgment} need your decision`)} · ` +
      `${color.dim(`${plan.counts.deferred} deferred`)}`
  );
  console.log('');
  const tag = {
    'mechanical-safe': color.green('auto  '),
    judgment: color.yellow('decide'),
    deferred: color.dim('defer '),
  };
  for (const step of plan.steps) {
    const where = `${step.file}${step.line ? `:${step.line}` : ''}`;
    console.log(`  [${tag[step.class]}] ${step.edge}  ${color.dim(where)}`);
    console.log(color.dim(`           ${step.rationale}`));
  }
  console.log('');
  console.log(
    color.dim(
      'Plan only — no files changed. "auto" = an agent can safely apply it; "decide" = your call.'
    )
  );
  return plan;
}

function runDoctor(root, config, files, rules, violations, asJson, options = {}) {
  const cov = computeCoverage(root, config, files, rules);
  const summary = summarizeViolations(violations);
  const configPath = options.configPath ?? path.join(root, 'ark.config.json');
  const configMissing = options.configMissing ?? !fs.existsSync(configPath);
  const showNewHere = shouldShowNewHereNudge(root, configPath, cov.governed.percent, configMissing);
  let recommendation;
  if (showNewHere) {
    try {
      recommendation = buildArchitectureRecommendation(root);
    } catch {
      recommendation = undefined;
    }
  }
  const gatesMissing = missingGates(root);
  const skillGaps = detectSkillGaps(root);
  const staleRunners = staleRunnerGateFiles(root);
  const baseline = readBaseline(root, '.ark-baseline.json');
  const currentKeys = new Set(violations.map(baselineKey));
  const suppressed = baseline.exists
    ? violations.filter((v) => baseline.keys.has(baselineKey(v))).length
    : 0;
  const staleBaseline = baseline.exists
    ? [...baseline.keys].filter((key) => !currentKeys.has(key)).length
    : 0;
  const activeCount = violations.length - suppressed;
  const missingSkills = skillGaps.reduce((sum, gap) => sum + gap.missing, 0);
  const staleSkills = skillGaps.reduce((sum, gap) => sum + gap.stale, 0);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          doctor: {
            operatingMode: resolveOperatingMode({
              governedPercent: cov.governed.percent,
              planMet: activeCount === 0 && cov.governed.percent >= 50,
              mature: cov.governed.totalFiles >= 150,
            }),
            governed: cov.governed,
            emptyLayers: cov.emptyLayers,
            layersWithoutRules: cov.layersWithoutRules,
            ungovernedDirs: cov.suggestions.length,
            violations: {
              total: violations.length,
              active: activeCount,
              suppressed,
              value: summary.valueCount,
              typeOnly: summary.typeOnlyCount,
              concentrated: summary.concentrated,
              dominant: summary.dominant,
              topEdges: summary.edges.slice(0, 5),
            },
            baseline: {
              exists: baseline.exists,
              frozen: baseline.exists ? baseline.keys.size : 0,
              stale: staleBaseline,
            },
            gatesMissing,
            skillGaps,
            staleRunnerFiles: staleRunners,
            newHere: showNewHere
              ? {
                  show: true,
                  archetype: recommendation?.archetype,
                  label: recommendation?.label,
                  preset: recommendation?.preset,
                  recommendCommand: arkCommand(root, 'ark-check', '--recommend'),
                  initCommand: recommendation?.archetype
                    ? arkCommand(root, 'ark', `init --archetype ${recommendation.archetype} --yes`)
                    : undefined,
                }
              : { show: false },
          },
        },
        null,
        2
      )
    );
    return;
  }

  const ok = color.green('✓');
  const warn = color.yellow('!');
  const bad = color.red('✗');
  const actions = [];
  const line = (mark, text) => console.log(`  ${mark} ${text}`);

  console.log(color.bold(`Ark doctor — ${path.basename(path.resolve(root)) || '.'}`));

  const emptyScope = cov.governed.totalFiles === 0;
  const mode = resolveOperatingMode({
    governedPercent: emptyScope ? 0 : cov.governed.percent,
    planMet:
      activeCount === 0 && !emptyScope && cov.governed.percent >= 50,
    mature: cov.governed.totalFiles >= 150,
  });
  console.log('');
  console.log(color.bold('Operating mode'));
  const modeMark = mode === 'enforce' ? ok : mode === 'adapt' ? warn : warn;
  const modeHelp = {
    suggest: 'starter shape / thin tree — expand layers as you grow',
    adapt: 'contract still needs to match real layout or raise coverage',
    enforce: 'contract governs enough code; gates can honestly hold the line',
  };
  line(modeMark, `${mode.toUpperCase()} — ${modeHelp[mode]}`);
  if (emptyScope) {
    line(
      bad,
      'Empty scope: include paths match 0 source files — a green check is meaningless until include/layers match the tree (monorepo → apps/packages, or /ark-adopt).'
    );
  }

  console.log('');
  console.log(color.bold('Coverage'));
  const govMark =
    emptyScope || cov.governed.percent < 50
      ? bad
      : cov.governed.percent >= 80
        ? ok
        : warn;
  line(govMark, `Governed: ${cov.governed.percent}% (${cov.governed.classifiedFiles}/${cov.governed.totalFiles} files)`);
  if (cov.suggestions.length > 0) {
    line(warn, `${cov.suggestions.length} ungoverned director(y/ies) — proposals: ${arkCommand(root, 'ark-check', '--coverage')}`);
    actions.push('classify the ungoverned directories (/ark-contract)');
  }
  if (cov.emptyLayers.length > 0) line(warn, `Empty layers (pattern matches nothing): ${cov.emptyLayers.join(', ')}`);
  if (cov.layersWithoutRules.length > 0) line(warn, `Layers with no rule edge: ${cov.layersWithoutRules.join(', ')}`);
  if (cov.suggestions.length === 0 && cov.emptyLayers.length === 0) line(ok, 'Every layer classifies files; no empty layers');

  if (showNewHere) {
    console.log('');
    console.log(color.bold('New here?'));
    if (recommendation) {
      line(warn, `Suggested application shape: ${recommendation.archetype} — ${recommendation.label} (preset ${recommendation.preset})`);
    } else {
      line(warn, 'Low governed coverage or fresh config — pick an application shape before adding code.');
    }
    line(ok, `See the plan: ${arkCommand(root, 'ark-check', '--recommend')}`);
    if (recommendation?.archetype) {
      line(ok, `Quick setup: ${arkCommand(root, 'ark', `init --archetype ${recommendation.archetype} --yes`)}`);
    }
    actions.unshift('run ark-check --recommend or /ark-architect to choose your application shape');
  }

  console.log('');
  console.log(color.bold('Violations'));
  if (violations.length === 0) {
    line(ok, 'None — the code matches the contract');
  } else {
    const typeNote = summary.typeOnlyCount > 0 ? ` (${summary.valueCount} value · ${summary.typeOnlyCount} type-only)` : '';
    const supNote = suppressed > 0 ? `, ${suppressed} frozen` : '';
    line(
      activeCount > 0 ? warn : ok,
      `${violations.length} total${typeNote}${supNote}${activeCount > 0 ? ` — ${activeCount} NOT baselined` : ''}`
    );
    for (const edge of summary.edges.slice(0, 3)) line(' ', color.dim(`${edge.count}  ${edge.edge}`));
    if (summary.concentrated) {
      line(warn, color.dim(`${Math.round(summary.dominantShare * 100)}% on one edge (${summary.dominant}) — likely a contract fix, not debt`));
    }
    if (activeCount > 0) {
      actions.push(
        `resolve the non-baselined violations — see the classified plan (${arkCommand(root, 'ark-check', '--plan')}), then /ark-fix`
      );
    }
  }

  console.log('');
  console.log(color.bold('Gates & skills'));
  if (gatesMissing.length === 0) line(ok, 'Gate files present (AGENTS.md, .mcp.json, CI, write gate)');
  else {
    line(bad, `Missing gates: ${gatesMissing.join(', ')}`);
    actions.push(`install gates (${arkCommand(root, 'ark-check', '--install-agent-gates')})`);
  }
  if (missingSkills + staleSkills === 0) line(ok, '/ark-* skills current for detected tools');
  else {
    line(warn, `${missingSkills} missing / ${staleSkills} outdated /ark-* skill(s) for ${skillGaps.map((g) => g.tool).join(', ')}`);
    actions.push('refresh /ark-* skills (--install-agent-gates --skills-only --force)');
  }

  console.log('');
  console.log(color.bold('Baseline'));
  if (!baseline.exists) {
    line(violations.length > 0 ? warn : ok, violations.length > 0 ? 'No baseline — adopting a dirty repo? freeze with --update-baseline' : 'No baseline (nothing to freeze)');
  } else {
    // Baseline keys are line-agnostic, so N keys can suppress ≥N violations — label as keys
    // to avoid an apparent mismatch with the "frozen" violation count above.
    line(ok, `${baseline.keys.size} frozen key(s)`);
    if (staleBaseline > 0) {
      line(warn, `${staleBaseline} stale entr(y/ies) no longer occur — tighten with --update-baseline`);
      actions.push('tighten the baseline (--update-baseline)');
    }
  }

  console.log('');
  console.log(color.bold('Command runners'));
  if (staleRunners.length === 0) line(ok, 'Emitted commands match the package manager');
  else {
    line(warn, `Stale runner in ${staleRunners.join(', ')}`);
    actions.push(`migrate command runners (${arkCommand(root, 'ark-check', '--install-agent-gates --migrate-commands')})`);
  }

  console.log('');
  if (actions.length === 0) {
    console.log(color.green('✔ Healthy — nothing to do.'));
  } else {
    console.log(color.bold(`Top actions (${actions.length}):`));
    actions.forEach((action, index) => console.log(`  ${index + 1}. ${action}`));
  }
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

  if (args.listPolicyPacks) {
    runListPolicyPacks(args);
    return;
  }

  if (args.applyPolicyPack) {
    runApplyPolicyPack(args);
    return;
  }

  if (args.recommend) {
    try {
      const recommendation = buildArchitectureRecommendation(args.root);
      let planWritten;
      if (args.writePlan) {
        const result = writeAdoptionPlan(args.root, recommendation);
        planWritten = result.path;
      }
      if (args.json) {
        console.log(
          JSON.stringify(
            {
              ...recommendation,
              ...(planWritten
                ? { adoptionPlanPath: path.relative(args.root, planWritten) || ADOPTION_PLAN_FILENAME }
                : {}),
            },
            null,
            2
          )
        );
      } else {
        console.log(formatArchitectureRecommendationHuman(recommendation));
        if (planWritten) {
          console.log('');
          console.log(`Wrote ${path.relative(args.root, planWritten) || ADOPTION_PLAN_FILENAME}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (args.json) {
        console.log(JSON.stringify({ ok: false, error: message }, null, 2));
      } else {
        console.error(`ark-check --recommend failed: ${message}`);
      }
      process.exitCode = 2;
    }
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
        console.error(`\nRun \`${arkCommand(args.root, 'ark', 'init')}\` (or \`ark-check --install-agent-gates\`) to configure enforcement.`);
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

  const root = args.root;
  const config = readConfig(root, args.config);
  const manifest = readManifest(root, args.manifest);
  const rules = manifest?.architecture?.rules ?? config.rules;
  const files = config.include.flatMap((entry) => walk(path.join(root, entry)));

  // --coverage is a pure glob/report view (no TypeScript resolver), so serve it BEFORE the
  // TS import: the report must work — and exit 0 — even when typescript isn't installed.
  if (args.coverage) {
    runCoverage(root, config, files, rules, args.json);
    return;
  }

  // Resolve TypeScript from the project first, then Ark's own install, then bare import.
  // --plan can still run honestly (coverage + empty violations) when TS is missing.
  const ts = await loadTypeScript(root);
  if (!ts) {
    if (args.plan) {
      const cov = computeCoverage(root, config, files, rules);
      if (!args.json) {
        console.log(
          color.yellow(
            `TypeScript not found — plan shows coverage honesty only (no import graph). Install with: ${installDevHint(root, 'typescript')}`
          )
        );
      }
      runPlan(root, [], args.json, cov.governed.percent, cov.governed.totalFiles);
      return;
    }
    console.error(`ark-check requires TypeScript. Install it with: ${installDevHint(root, 'typescript')}`);
    process.exitCode = 2;
    return;
  }

  const manifestIntentLayers = intentLayersFromManifest(manifest);
  const compilerOptionsFor = createCompilerOptionsLookup(ts, root, args.tsconfig);
  const moduleHost = createModuleResolutionHost(ts);

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

    const checkModuleEdge = (specifier, node, kind, typeOnly = false) => {
      edges.push({ specifier, line: lineOf(sourceFile, node.getStart(sourceFile)), kind, typeOnly });
    };

    const visit = (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = textOfModuleSpecifier(node);
        if (specifier) {
          checkModuleEdge(
            specifier,
            node,
            ts.isImportDeclaration(node) ? 'import' : 'export',
            isTypeOnlyModuleReference(ts, node)
          );
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
          ...(edge.typeOnly ? { typeOnly: true } : {}),
          message: rule.message ?? `${sourceLayer} must not ${edge.kind} ${targetLayer}.`,
        });
      }
    }
  }

  if (cacheKey) saveScanCache(root, cacheKey, nextCacheFiles);

  violations.push(...detectCycles(importGraph));

  if (args.doctor) {
    runDoctor(root, config, files, rules, violations, args.json, {
      configPath: path.isAbsolute(args.config) ? args.config : path.join(root, args.config),
      configMissing: !fs.existsSync(path.isAbsolute(args.config) ? args.config : path.join(root, args.config)),
    });
    return;
  }

  if (args.updateBaseline) {
    const summary = summarizeViolations(violations);
    // Bloquear y avisar: a lopsided freeze buries a likely contract bug as "debt". Refuse it
    // (unless --force), diagnose, and point at the contract fix instead of the baseline.
    if (summary.concentrated && !args.force) {
      console.error(
        `Refusing to freeze ${summary.total} violations: ${Math.round(summary.dominantShare * 100)}% are a single edge (${summary.dominant}).`
      );
      printViolationBreakdown(summary, { toStderr: true });
      console.error('');
      console.error('Freezing this would bury a likely CONTRACT bug as "debt". Fix the contract');
      console.error('first (/ark-contract), then re-run. To freeze anyway: --update-baseline --force.');
      process.exitCode = 2;
      return;
    }
    const { fullPath, count } = writeBaseline(root, args.baseline, violations);
    console.log(`Wrote ${fullPath} with ${count} frozen violation key(s).`);
    console.log('Commit it and gate CI with: ark-check --baseline (only NEW violations fail).');
    if (summary.total > 0) printViolationBreakdown(summary);
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

  if (args.plan) {
    const cov = computeCoverage(root, config, files, rules);
    runPlan(root, activeViolations, args.json, cov.governed.percent, cov.governed.totalFiles);
    return;
  }

  const skillGaps = detectSkillGaps(root);
  const codexHomeGap = detectCodexHomeGap(root);

  if (args.report) {
    const exampleByLayer = new Map();
    const fileCountByLayer = new Map();
    for (const file of files) {
      const layer = layerForFile(root, file, config.layers);
      if (!layer) continue;
      fileCountByLayer.set(layer, (fileCountByLayer.get(layer) || 0) + 1);
      if (!exampleByLayer.has(layer)) {
        exampleByLayer.set(layer, normalize(path.relative(root, file)));
      }
    }
    const coverage = computeCoverage(root, config, files, rules);
    const enforcementForReport = detectEnforcement(root);
    const fitness = computeReportFitness({
      coverage,
      violations: activeViolations,
      ok,
      enforcement: enforcementForReport,
      config,
    });
    const currentSnapshot = buildReportSnapshot({
      root,
      config,
      coverage,
      violations: activeViolations,
      ok,
      suppressed: suppressed.length,
      version: arkPackageVersion(),
      fileCountByLayer,
      enforcement: enforcementForReport,
      score: fitness.score,
      mode: fitness.mode,
    });
    // Origin is read before archive so the HTML can show "just created" vs deltas.
    const existingOrigin = args.resetOrigin
      ? null
      : readJsonSafe(path.join(reportsDir(root), 'origin.json'));
    const reportPayload = {
      root,
      config,
      exampleByLayer,
      fileCountByLayer,
      coverage,
      violations: activeViolations,
      ok,
      suppressed: suppressed.length,
      version: arkPackageVersion(),
      configPath: args.config,
      generatedAt: new Date().toISOString().slice(0, 10),
      skillGaps,
      originSnapshot: existingOrigin,
      currentSnapshot,
      originJustCreated: !existingOrigin,
    };
    const html = args.beginner
      ? renderBeginnerHtmlReport(reportPayload)
      : renderHtmlReport(reportPayload);
    const reportPath = path.isAbsolute(args.report) ? args.report : path.join(root, args.report);
    fs.writeFileSync(reportPath, html);

    const archive = archiveReportSnapshots(root, {
      html,
      snapshot: currentSnapshot,
      resetOrigin: Boolean(args.resetOrigin),
      noArchive: Boolean(args.noArchive),
    });
    if (!args.json) {
      const rel = path.relative(root, reportPath) || reportPath;
      console.log(`${color.green('✎')} Wrote HTML report: ${rel}`);
      if (archive.createdOrigin) {
        console.log(
          `${color.green('✎')} Origin snapshot saved (first report): ${path.relative(root, archive.originJson) || archive.originJson}`
        );
        console.log(
          color.dim('  Future reports will show evolution vs this starting point (.ark/reports/).')
        );
      } else {
        console.log(
          color.dim(
            `  Snapshots: .ark/reports/latest.* (origin frozen${args.resetOrigin ? ' — reset this run' : ''})`
          )
        );
      }
      // Nudge .gitignore for loose report files (origin/latest already under .ark/).
      const gitignore = path.join(root, '.gitignore');
      const base = path.basename(reportPath);
      if (!path.isAbsolute(args.report) && fs.existsSync(gitignore)) {
        const ignored = fs
          .readFileSync(gitignore, 'utf8')
          .split('\n')
          .some(
            (line) =>
              line.trim() === base ||
              line.trim() === `/${base}` ||
              line.trim() === args.report ||
              line.trim() === '.ark/' ||
              line.trim() === '.ark'
          );
        if (!ignored) {
          console.log(
            color.dim(`  (generated artifact — prefer .ark/reports/; add "${base}" or ".ark/" to .gitignore)`)
          );
        }
      }
    }
  }

  if (args.json) {
    console.log(JSON.stringify({
      ok,
      violations: activeViolations.map(enrichViolationWithFixClass),
      suppressedViolations: suppressed.length,
      staleBaselineKeys,
      warnings,
      ...(activeViolations.length > 0 ? { summary: summarizeViolations(activeViolations) } : {}),
      ...(skillGaps.length > 0 ? { skillGaps } : {}),
      ...(codexHomeGap ? { codexHomeGap } : {}),
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

    // On a large violation set, print the ranked edge breakdown so the wall of failures reads
    // as an ordered burn-down (and flags a concentrated edge as a likely contract bug).
    if (activeViolations.length >= CONCENTRATION_MIN_VIOLATIONS) {
      printViolationBreakdown(summarizeViolations(activeViolations), { toStderr: true });
    }

    if (skillGaps.length > 0) {
      const missingTotal = skillGaps.reduce((sum, gap) => sum + gap.missing, 0);
      const staleTotal = skillGaps.reduce((sum, gap) => sum + gap.stale, 0);
      const tools = skillGaps.map((gap) => gap.tool).join(', ');
      if (missingTotal > 0) {
        console.log(
          color.dim(
            `${missingTotal} /ark-* skill(s) not installed for ${tools} (this Ark version ships them). ` +
              `Install: ${arkCommand(root, 'ark-check', '--install-agent-gates')}`
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
              `Refresh: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --force')}`
          )
        );
      }
    }

    const staleRunners = staleRunnerGateFiles(root);
    if (staleRunners.length > 0) {
      console.log(
        color.dim(
          `Ark commands in ${staleRunners.join(', ')} use a runner that doesn't match this repo's ` +
            `package manager. Fix (no clobber): ${arkCommand(root, 'ark-check', '--install-agent-gates --migrate-commands')}`
        )
      );
    }

    if (codexHomeGap) {
      const parts = [];
      if (codexHomeGap.missing > 0) parts.push(`${codexHomeGap.missing} missing`);
      if (codexHomeGap.stale > 0) parts.push(`${codexHomeGap.stale} outdated`);
      console.log(
        color.dim(
          `/ark-* skills in ${codexPromptsDir()} are behind this Ark (${parts.join(', ')}). ` +
            `Codex loads them from there, not the repo. Refresh: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --codex-home --force')}`
        )
      );
    }
  }

  if (args.watch) {
    await runWatchMode(args);
    return;
  }

  process.exitCode = ok ? 0 : 1;
}

async function runWatchMode(args) {
  const argv = process.argv.slice(2).filter((token) => token !== '--watch');
  let debounce;
  const rerun = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const result = spawnSync(process.execPath, [__arkCheckCli, ...argv], {
        cwd: args.root,
        stdio: 'inherit',
        env: process.env,
      });
      process.exitCode = result.status ?? 1;
    }, 300);
  };

  let config;
  try {
    config = readConfig(args.root, args.config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  for (const entry of config.include ?? []) {
    const target = path.join(args.root, entry);
    if (!fs.existsSync(target)) continue;
    try {
      fs.watch(target, { recursive: true }, rerun);
    } catch {
      fs.watch(target, rerun);
    }
  }

  console.log(color.dim('Watching governed paths for changes… (Ctrl+C to stop)'));
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
