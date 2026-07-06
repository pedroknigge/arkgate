#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_RULES,
  arkCommand,
  collectForbiddenGlobalUses,
  createElevenLayerConfig,
  execCommandParts,
  execRunner,
  globToRegExp,
  installDevHint,
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
    coverage: false,
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
    else if (arg === '--codex-home') args.codexHome = true;
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
    '       ark-check --coverage [--json]          per-layer file counts + full unclassified list (report only, exit 0)',
    '       ark-check --init [--preset hexagonal|layered|feature-sliced|monorepo] [--force]',
    '       ark-check --install-agent-gates [--tools claude,cursor,codex] [--skills-only] [--codex-home] [--force]',
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
    'MCP/hook gates) and windsurf, cline, copilot, kiro, roo, continue, gemini',
    '(instruction-tier rule files derived from the same contract).',
    'It also installs the /ark-* skills shipped in templates/skills/ into each',
    'detected tool\'s command location (.claude/skills/, .cursor/commands/,',
    '.codex/prompts/, .windsurf/workflows/, .clinerules/workflows/, .github/prompts/).',
    'Kiro, Roo, Continue, and Gemini have no command mechanism and receive only their',
    'rule file. Existing files are never overwritten without --force, so re-running',
    'after an update only adds what is missing. --skills-only restricts the write to',
    'just the /ark-* skills (safe to --force-refresh — it leaves a customized AGENTS.md,',
    'settings, and CI workflow untouched).',
    'Pass --tools to pick which tool configs to write; otherwise they are auto-detected',
    'from their config directories (.claude/, .cursor/, .codex/, .windsurf/, .clinerules/,',
    '.kiro/, .roo/, .continue/, .gemini/; copilot is explicit-only). claude+cursor+codex',
    'are written when nothing is detected.',
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
const ARCHITECTURE_PRESETS = {
  hexagonal: () => ({
    include: ['src'],
    layers: [
      {
        name: 'DomainModel',
        description: 'Pure business rules and entities. No I/O, no framework, no ambient globals.',
        patterns: ['src/**/domain/**'],
        forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
        optional: true,
      },
      {
        name: 'ApplicationOrchestration',
        description: 'Use cases that coordinate the domain through ports. No I/O of its own.',
        patterns: ['src/**/application/**'],
        optional: true,
      },
      {
        name: 'PresentationAdapters',
        description: 'Entrypoints — HTTP routes, controllers, UI. Drives use cases.',
        patterns: ['src/**/presentation/**', 'src/**/controllers/**', 'src/**/interface-adapters/**', 'src/**/http/**'],
        optional: true,
      },
      {
        name: 'PersistenceAdapters',
        description: 'Implements ports with real infrastructure: DB, external APIs, filesystem.',
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
        description: 'UI and API entrypoints.',
        patterns: ['src/**/presentation/**', 'src/**/controllers/**', 'src/**/ui/**', 'src/**/http/**'],
        optional: true,
      },
      {
        name: 'ApplicationOrchestration',
        description: 'Business services and use-case coordination.',
        patterns: ['src/**/application/**', 'src/**/services/**'],
        optional: true,
      },
      {
        name: 'DomainModel',
        description: 'Pure business rules and entities. No I/O, no framework, no ambient globals.',
        patterns: ['src/**/domain/**'],
        forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
        optional: true,
      },
      {
        name: 'PersistenceAdapters',
        description: 'Data access and infrastructure.',
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
    const purpose = {
      App: 'App-wide setup, providers, and routing.',
      Pages: 'Route-level compositions.',
      Widgets: 'Self-contained UI blocks composed from features and entities.',
      Features: 'User-facing feature units.',
      Entities: 'Business entities with their UI and logic.',
      Shared: 'Reusable primitives with no business knowledge.',
    };
    return {
      include: ['src'],
      layers: order.map((name) => ({
        name,
        description: purpose[name],
        patterns: [`src/${name.toLowerCase()}/**`],
        optional: true,
      })),
      rules: denyUpward(order),
    };
  },
  // Cross-package profile for workspace monorepos. Patterns match by directory NAME
  // anywhere in the tree (`**/domain/**` hits packages/x/domain AND apps/y/src/domain),
  // so one profile governs every package. include defaults to the detected workspace
  // roots (falls back to packages+apps). Naming varies by repo — adjust and re-check.
  monorepo: (includeDirs) => ({
    include: includeDirs && includeDirs.length > 0 ? includeDirs : ['packages', 'apps'],
    layers: [
      {
        name: 'DomainModel',
        description: 'Pure business rules and entities, in any package. No I/O, no framework, no ambient globals.',
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
        patterns: ['**/app/**', '**/pages/**', '**/components/**', '**/controllers/**', '**/http/**', '**/routes/**'],
        optional: true,
      },
      {
        name: 'PersistenceAdapters',
        description: 'Implements ports with real infrastructure: DB, external APIs, filesystem.',
        patterns: ['**/infrastructure/**', '**/adapters/**', '**/persistence/**', '**/repositories/**'],
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
  }),
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
    const finalConfig = factory(detectWorkspaces(args.root));
    fs.writeFileSync(configPath, `${JSON.stringify(finalConfig, null, 2)}\n`);
    console.log(`Wrote ${configPath} (${args.preset} preset)`);
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
  const finalConfig =
    mode === 'detected'
      ? config
      : mode === 'monorepo'
        ? ARCHITECTURE_PRESETS.monorepo(workspaces)
        : createElevenLayerConfig({ rootDir: srcDir === '.' ? 'src' : srcDir });

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

function resolveTools(args) {
  if (args.tools && args.tools.length > 0) {
    return { tools: new Set(args.tools), source: 'explicit' };
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
  for (const violation of violations) {
    const key = violationEdge(violation);
    const entry = byEdge.get(key) ?? { edge: key, count: 0, targets: new Map() };
    entry.count += 1;
    const subtree = violationTargetSubtree(violation);
    if (subtree) entry.targets.set(subtree, (entry.targets.get(subtree) ?? 0) + 1);
    byEdge.set(key, entry);
  }
  const edges = [...byEdge.values()]
    .map((entry) => ({
      edge: entry.edge,
      count: entry.count,
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
  for (const edge of summary.edges) {
    const pct = Math.round((edge.count / summary.total) * 100);
    out(`  ${String(edge.count).padStart(5)}  ${edge.edge}  (${pct}%)`);
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

// Renders a self-contained HTML architecture report: the layer map, the
// who-may-import-whom matrix, current violations with fix hints, and which
// gates are live. No external assets (CSP-safe, works offline). This is the
// visual sibling of `/ark-explain` — an artifact for PRs and onboarding.
function renderHtmlReport({ root, config, exampleByLayer, violations, ok, suppressed, version, configPath, generatedAt }) {
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
  // Innermost first: the more layers a layer is forbidden from importing, the
  // deeper it sits (a pure core denies everything; an entrypoint denies little).
  const ordered = [...layers].sort((a, b) => deniedOut(b.name) - deniedOut(a.name) || a.name.localeCompare(b.name));

  const deniedCount = rules.filter((r) => r.allowed === false).length;
  const allowedCount = rules.filter((r) => r.allowed === true).length;
  const guarded = layers.filter((l) => Array.isArray(l.forbiddenGlobals) && l.forbiddenGlobals.length).length;
  const enforcement = detectEnforcement(root);
  const gatesOn = enforcement.filter((e) => e.on).length;
  const status = ok ? 'PASS' : 'FAIL';

  const chip = (label, value) => `<span class="chip"><b>${value}</b> ${esc(label)}</span>`;
  const stats = [
    chip('layers', layers.length),
    chip('rules denied', deniedCount),
    chip('allowed', allowedCount),
    chip('layers guard globals', guarded),
    chip('gates live', `${gatesOn}/${enforcement.length}`),
    chip('violations', violations.length),
    ...(suppressed ? [chip('frozen by baseline', suppressed)] : []),
  ].join('');

  // Layers table — ordered inner→outer, with purpose (optional `description`),
  // config tags, folders, and a real example file.
  const layerRows = ordered
    .map((layer) => {
      const tags = [
        Array.isArray(layer.forbiddenGlobals) && layer.forbiddenGlobals.length
          ? `<span class="tag">no ${layer.forbiddenGlobals.map(esc).join(', ')}</span>`
          : '',
        layer.mayImportInfrastructure ? '<span class="tag">may import infra</span>' : '',
        Array.isArray(layer.intentPrefixes) && layer.intentPrefixes.length
          ? `<span class="tag">${layer.intentPrefixes.map(esc).join(' ')}</span>`
          : '',
      ].join(' ');
      const example = exampleByLayer.get(layer.name);
      return `<tr>
        <td class="ln">${esc(layer.name)}<div class="tags">${tags}</div></td>
        <td>${layer.description ? esc(layer.description) : '<span class="dim">—</span>'}</td>
        <td><code>${(layer.patterns || []).map(esc).join('<br>') || '—'}</code></td>
        <td>${example ? `<code>${esc(example)}</code>` : '<span class="dim">no files yet</span>'}</td>
      </tr>`;
    })
    .join('\n');

  // Readable dependency direction: each layer inner→outer with the layers it may
  // import. This is the "get it at a glance" view; the precise grid follows.
  const flowRows = ordered
    .map((layer) => {
      const targets = ordered
        .filter((other) => other.name !== layer.name)
        .filter((other) => {
          const rule = findRule(layer.name, other.name);
          return !(rule && rule.allowed === false);
        })
        .map((other) => `<span class="chip">${esc(other.name)}</span>`)
        .join('');
      return `<div class="flow"><span class="flow-name">${esc(layer.name)}</span>
        <span class="flow-arrow">may import →</span>
        <span class="flow-targets">${targets || '<span class="dim">nothing (pure core)</span>'}</span></div>`;
    })
    .join('\n');

  // Precise matrix (kept, in a <details> so it doesn't dominate the page).
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

  // Violations grouped by rule so a big report stays scannable.
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
              const edge = v.fromLayer && v.toLayer ? `${esc(v.fromLayer)} → ${esc(v.toLayer)}` : '';
              return `<li>
                <code>${esc(v.file)}:${v.line}</code>
                ${edge ? `<span class="edge">${edge}${v.target ? ` <span class="dim">(${esc(v.target)})</span>` : ''}</span>` : ''}
                <div class="msg">${esc(v.message)}</div>
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
    : '<div class="clean">No active violations. The architecture matches the contract.</div>';

  const enforcementRows = enforcement
    .map(
      (e) =>
        `<li class="${e.on ? 'on' : 'off'}"><span class="dot"></span><b>${esc(e.name)}</b> — ${esc(e.what)}` +
        (e.where ? ` <code>${esc(e.where)}</code>` : ' <span class="dim">not configured</span>') +
        `</li>`
    )
    .join('\n');

  const meta = [version ? `ark-check v${esc(version)}` : '', generatedAt ? esc(generatedAt) : '', configPath ? `config: ${esc(configPath)}` : '']
    .filter(Boolean)
    .join(' · ');

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
  h1 { font-size:1.5rem; margin:0 0 .3rem; }
  h2 { font-size:1.05rem; margin:2.25rem 0 .35rem; }
  .hint { color:var(--dim); font-size:.85rem; margin:.1rem 0 .85rem; }
  .meta { color:var(--dim); font-size:.82rem; margin:0 0 1.1rem; }
  .badge { display:inline-block; padding:.15em .6em; border-radius:999px; font-weight:700;
    font-size:.8rem; letter-spacing:.03em; vertical-align:middle; }
  .PASS { background:color-mix(in srgb,var(--green) 20%,transparent); color:var(--green); }
  .FAIL { background:color-mix(in srgb,var(--red) 20%,transparent); color:var(--red); }
  .dim { color:var(--dim); }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.86em; }
  .stats { display:flex; flex-wrap:wrap; gap:.4rem; margin:0 0 .5rem; }
  .stats .chip b { color:var(--ink); }
  .chip { display:inline-block; padding:.12em .55em; border:1px solid var(--line); border-radius:6px;
    font-size:.78rem; color:var(--dim); background:var(--panel); }
  table { width:100%; border-collapse:collapse; }
  .layers td, .layers th { text-align:left; padding:.6rem .6rem; border-bottom:1px solid var(--line); vertical-align:top; }
  .layers th { color:var(--dim); font-weight:600; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; }
  .ln { font-weight:600; white-space:nowrap; }
  .tags { margin-top:.25rem; display:flex; flex-direction:column; gap:.2rem; align-items:flex-start; white-space:normal; }
  .tag { display:inline-block; padding:.05em .45em; border:1px solid var(--line); border-radius:5px;
    font-size:.68rem; color:var(--dim); font-weight:500; }
  .flow { display:flex; gap:.5rem; align-items:baseline; padding:.4rem 0; border-bottom:1px solid var(--line); flex-wrap:wrap; }
  .flow-name { font-weight:600; min-width:13rem; }
  .flow-arrow { color:var(--dim); font-size:.8rem; }
  .flow-targets { display:flex; flex-wrap:wrap; gap:.3rem; }
  details { margin-top:.75rem; }
  summary { cursor:pointer; color:var(--accent); font-size:.9rem; }
  .matrix-scroll { overflow-x:auto; margin-top:.75rem; }
  .matrix { border-collapse:collapse; font-size:.82rem; }
  .matrix th, .matrix td { border:1px solid var(--line); }
  .matrix td { width:2.1rem; height:2.1rem; text-align:center; font-weight:700; }
  .matrix .rowlbl { text-align:right; padding:0 .6rem; color:var(--dim); font-weight:600; white-space:nowrap; }
  .matrix .rot { height:9rem; vertical-align:bottom; padding:.3rem; }
  .matrix .rot span { writing-mode:vertical-rl; transform:rotate(180deg); color:var(--dim); font-weight:600; white-space:nowrap; }
  .allow { color:var(--green); background:color-mix(in srgb,var(--green) 12%,transparent); }
  .deny { color:var(--red); background:color-mix(in srgb,var(--red) 12%,transparent); }
  .implicit { color:var(--dim); }
  .self { color:var(--line); }
  .legend { color:var(--dim); font-size:.82rem; margin:.6rem 0 0; }
  .vgroup { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--red);
    border-radius:8px; padding:.7rem .85rem; margin-bottom:.6rem; }
  .vghead { display:flex; gap:.5rem; align-items:baseline; }
  .rule { font-weight:700; font-size:.8rem; color:var(--red); letter-spacing:.02em; }
  .vitems { list-style:none; padding:0; margin:.4rem 0 0; }
  .vitems li { padding:.3rem 0; border-top:1px solid var(--line); }
  .vitems li:first-child { border-top:none; }
  .edge { color:var(--accent); font-weight:600; margin-left:.4rem; }
  .msg { margin-top:.15rem; }
  .fix { margin-top:.4rem; color:var(--dim); font-size:.88rem; }
  .clean { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--green);
    border-radius:8px; padding:.7rem .85rem; color:var(--dim); }
  ul.enf { list-style:none; padding:0; margin:0; }
  ul.enf li { display:flex; align-items:center; gap:.55rem; padding:.35rem 0; flex-wrap:wrap; }
  ul.enf .dot { width:.6rem; height:.6rem; border-radius:50%; flex:0 0 auto; background:var(--line); }
  ul.enf li.on .dot { background:var(--green); }
  ul.enf li.off { color:var(--dim); }
  .cmds { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:.85rem 1rem; }
  .cmds code { display:block; padding:.15rem 0; }
  footer { margin-top:2.5rem; padding-top:1rem; border-top:1px solid var(--line); color:var(--dim); font-size:.8rem; }
  @media print { body { padding:0; } details { open:true; } .chip,.tag { border-color:#ccc; } }
</style></head>
<body><div class="wrap">
  <h1>${esc(project)} <span class="badge ${status}">${status}</span></h1>
  <div class="stats">${stats}</div>
  <p class="meta">${meta}</p>

  <h2>Layers</h2>
  <p class="hint">Ordered innermost (most restricted) → outermost (entrypoints).</p>
  <table class="layers">
    <tr><th>Layer</th><th>Purpose</th><th>Folders</th><th>Example file</th></tr>
    ${layerRows || '<tr><td colspan="4" class="dim">No layers configured.</td></tr>'}
  </table>

  <h2>Dependency direction</h2>
  <p class="hint">Inner layers stay ignorant of outer ones. Each layer may import only what's listed.</p>
  ${flowRows || '<p class="dim">No layers configured.</p>'}
  <details>
    <summary>Full matrix (precise ✓ / ✕ grid)</summary>
    <div class="matrix-scroll"><table class="matrix">
      <tr><th></th>${matrixHead}</tr>
      ${matrixBody}
    </table></div>
    <p class="legend">Row imports column. ✓ allowed · ✕ denied (hover for the reason) · · = no explicit rule / self.</p>
  </details>

  <h2>Violations</h2>
  ${violationBlocks}

  <h2>Enforcement points</h2>
  <ul class="enf">${enforcementRows}</ul>

  <h2>Commands to remember</h2>
  <div class="cmds">
    <code>${arkCheckCommand(root)}</code>
    <code>/ark-place "&lt;what you're building&gt;"</code>
  </div>

  <footer>Generated by ${meta || 'ark-check'}. A generated artifact — regenerate with <code>ark-check --report</code>; gitignore it rather than committing.</footer>
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
function runCoverage(root, config, files, rules, asJson) {
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
  // A layer whose patterns match zero files is dead config — it enforces nothing, and
  // usually means the patterns are wrong (the #1 monorepo mistake). Surface it.
  const emptyLayers = layerRows.filter((row) => row.files === 0).map((row) => row.name);
  // Rule coverage (skill checklist item 9): a layer with no rule edge can import anything.
  const layersWithoutRules = layerRows
    .map((row) => row.name)
    .filter((name) => !rules.some((rule) => rule.from === name || rule.to === name));

  // The headline honesty number: what share of the in-scope code Ark actually governs. A
  // green check over a low fraction is the false-green trap this report exists to expose.
  const classifiedFiles = files.length - unclassified.length;
  const fraction = files.length > 0 ? classifiedFiles / files.length : 1;
  const governed = {
    classifiedFiles,
    totalFiles: files.length,
    percent: Math.round(fraction * 100),
  };
  // Per-directory proposals for the ungoverned files, sourced from the 11 layers + presets.
  const suggestions = buildUnclassifiedSuggestions(unclassified);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          coverage: {
            include: config.include ?? [],
            totalFiles: files.length,
            governed,
            layers: layerRows,
            unclassified: { count: unclassified.length, files: unclassified },
            suggestions,
            emptyLayers,
            layersWithoutRules,
          },
        },
        null,
        2
      )
    );
    return;
  }

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

  let ts;
  try {
    ts = await import('typescript');
  } catch {
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
  const skillGaps = detectSkillGaps(root);
  const codexHomeGap = detectCodexHomeGap(root);

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
      ok,
      suppressed: suppressed.length,
      version: arkPackageVersion(),
      configPath: args.config,
      generatedAt: new Date().toISOString().slice(0, 10),
    });
    const reportPath = path.isAbsolute(args.report) ? args.report : path.join(root, args.report);
    fs.writeFileSync(reportPath, html);
    if (!args.json) {
      const rel = path.relative(root, reportPath) || reportPath;
      console.log(`${color.green('✎')} Wrote HTML report: ${rel}`);
      // The report is a generated artifact. Nudge toward .gitignore so it doesn't
      // get swept into a commit (only when a .gitignore exists and misses it).
      const gitignore = path.join(root, '.gitignore');
      const base = path.basename(reportPath);
      if (!path.isAbsolute(args.report) && fs.existsSync(gitignore)) {
        const ignored = fs
          .readFileSync(gitignore, 'utf8')
          .split('\n')
          .some((line) => line.trim() === base || line.trim() === `/${base}` || line.trim() === args.report);
        if (!ignored) {
          console.log(color.dim(`  (generated artifact — add "${base}" to .gitignore so it isn't committed)`));
        }
      }
    }
  }

  if (args.json) {
    console.log(JSON.stringify({
      ok,
      violations: activeViolations,
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

  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
