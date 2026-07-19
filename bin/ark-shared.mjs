import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ARK_CONFIG_RULES,
  withArkConfigMetadata,
} from './lib/config-contract.mjs';
import { collectForbiddenCapabilityUses } from './lib/analysis-engine.mjs';
import {
  DEFAULT_INTENT_PREFIXES as DOMAIN_DEFAULT_INTENT_PREFIXES,
  looksLikeArkIntent,
  resolveIntentLayer as resolveConfiguredIntentLayer,
} from './lib/source-policy.mjs';

/**
 * Default intent-prefix map shared by both CLIs and the ark-mcp write-path gate. The rule
 * matrix comes from the generated Domain config contract above. Prefixes mirror the runtime
 * profile but stay in this standalone CLI module because the CLIs run without a build step.
 */
export const DEFAULT_INTENT_PREFIXES = DOMAIN_DEFAULT_INTENT_PREFIXES;

export const DEFAULT_LAYER_DIRECTORIES = {
  DomainModel: ['domain'],
  ApplicationOrchestration: ['application', 'app'],
  PersistenceAdapters: [
    'adapters/persistence',
    'adapters/repository',
    'repositories',
    'infra/persistence',
  ],
  IntegrationAdapters: ['adapters/integration', 'adapters/external', 'integrations'],
  WorkflowSagaEngine: ['workflows', 'sagas'],
  BackgroundJobsScheduling: ['jobs', 'schedules'],
  PresentationAdapters: ['presentation', 'adapters/presentation', 'adapters/api'],
  ReportingReadModels: ['reporting', 'read-models', 'projections'],
  ExtensibilityMetadata: ['metadata', 'extensions'],
  SecurityAuditObservability: ['security', 'audit', 'observability'],
  Kernel: ['kernel'],
};

export const DEFAULT_RULES = DEFAULT_ARK_CONFIG_RULES;

/**
 * Default ambient globals forbidden in the domain layer: a pure domain does no I/O and is
 * deterministic. `console` is deliberately omitted (too common during adoption); add it per
 * project via the layer's `forbiddenGlobals` in ark.config.json.
 */
export const DEFAULT_DOMAIN_FORBIDDEN_GLOBALS = ['fetch', 'process', 'Date.now', 'Math.random'];

export function createElevenLayerConfig(options = {}) {
  const rootDir = options.rootDir ?? 'src';
  const optional = options.optionalLayers ?? true;
  const prefix = rootDir === '.' ? '' : `${rootDir}/`;
  const config = withArkConfigMetadata({
    include: options.include ?? [rootDir],
    layers: DEFAULT_INTENT_PREFIXES.map((entry) => ({
      name: entry.layer,
      patterns: (DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? [entry.layer]).map(
        (directory) => `${prefix}${directory}/**`
      ),
      intentPrefixes: entry.prefixes,
      optional,
      ...(entry.layer === 'DomainModel'
        ? { forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS }
        : {}),
    })),
    rules: DEFAULT_RULES,
  });
  // When a project root is known, overlay Nest/Next/express filename conventions so a
  // flat framework starter is governed on day one (not "0% governed / false green").
  if (options.root) return applyFrameworkLayoutOverlays(config, options.root);
  return config;
}

/**
 * Merge unique glob patterns onto a named layer (create the layer if missing).
 * More-specific file globs (*.controller.ts) win over broad dirs via layerForFile scoring.
 */
function mergeLayerPatterns(config, layerName, patterns, extras = {}) {
  if (!patterns?.length) return;
  const layers = config.layers ?? (config.layers = []);
  let layer = layers.find((entry) => entry.name === layerName);
  if (!layer) {
    layer = { name: layerName, patterns: [], optional: true, ...extras };
    layers.push(layer);
  }
  const set = new Set(layer.patterns ?? []);
  for (const pattern of patterns) set.add(pattern);
  layer.patterns = [...set];
  for (const [key, value] of Object.entries(extras)) {
    if (layer[key] === undefined) layer[key] = value;
  }
}

/**
 * Framework-aware layout overlays. Detection uses collectRepoShapeSignals (deps + filenames).
 * Pure additive: never removes existing preset patterns. Goal: Nest/Next/express starters
 * reach meaningful governed% under hexagonal/layered without a hand-written adopt pass.
 */
export function applyFrameworkLayoutOverlays(config, root) {
  if (!config || !root) return config;
  let signals;
  try {
    signals = collectRepoShapeSignals(root);
  } catch {
    return withArkConfigMetadata(config);
  }

  const next = {
    ...config,
    layers: (config.layers ?? []).map((layer) => ({
      ...layer,
      patterns: [...(layer.patterns ?? [])],
      ...(layer.exclude ? { exclude: [...layer.exclude] } : {}),
    })),
    rules: [...(config.rules ?? [])],
    include: [...(config.include ?? ['src'])],
  };

  // Ensure include covers where framework code actually lives.
  const ensureInclude = (dir) => {
    if (!next.include.includes(dir) && fs.existsSync(path.join(root, dir))) {
      next.include.push(dir);
    }
  };

  // Framework-free application layouts are common in clean-room starters and
  // brownfield products. Govern their explicit source conventions without
  // claiming a framework that package.json does not declare.
  if (signals.apiSurface && !signals.nestFramework && !signals.expressLike) {
    ensureInclude('src');
    mergeLayerPatterns(next, 'PresentationAdapters', [
      'src/**/routes/**',
      'src/**/controllers/**',
      'src/**/http/**',
      'src/**/api/**',
    ]);
    mergeLayerPatterns(next, 'ApplicationOrchestration', [
      'src/**/services/**',
      'src/**/use-cases/**',
      'src/**/usecases/**',
    ]);
  }

  if (signals.ui && !signals.nextFramework) {
    ensureInclude('src');
    mergeLayerPatterns(next, 'PresentationAdapters', [
      'src/**/components/**',
      'src/**/layouts/**',
      'src/**/ui/**',
      'src/**/routes/**',
      'src/**/pages/**',
    ]);
    // Match the existing ui-surface profile: UI components may consume their
    // display-domain models, while the domain still cannot depend on UI.
    next.rules = next.rules.filter(
      (rule) => !(rule.from === 'PresentationAdapters' && rule.to === 'DomainModel' && rule.allowed === false)
    );
  }

  if (signals.nestFramework) {
    ensureInclude('src');
    // Nest flat + modular conventions (controllers/services next to modules).
    mergeLayerPatterns(next, 'PresentationAdapters', [
      'src/**/*.controller.ts',
      'src/**/*.controller.js',
      'src/**/*.gateway.ts',
      'src/**/*.resolver.ts',
      'src/**/*.module.ts',
      'src/**/main.ts',
      'src/**/main.js',
    ]);
    mergeLayerPatterns(next, 'ApplicationOrchestration', [
      'src/**/*.service.ts',
      'src/**/*.service.js',
      'src/**/*.provider.ts',
      'src/**/*.interceptor.ts',
      'src/**/*.guard.ts',
      'src/**/*.pipe.ts',
      'src/**/*.use-case.ts',
      'src/**/*.usecase.ts',
    ]);
    mergeLayerPatterns(next, 'DomainModel', [
      'src/**/*.entity.ts',
      'src/**/*.vo.ts',
      'src/**/*.value-object.ts',
      'src/**/*.aggregate.ts',
      'src/**/entities/**',
      'src/**/domain/**',
    ]);
    mergeLayerPatterns(next, 'PersistenceAdapters', [
      'src/**/*.repository.ts',
      'src/**/*.repository.js',
      'src/**/repositories/**',
      'src/**/persistence/**',
      'src/**/infra/**',
      'src/**/infrastructure/**',
    ]);
    next.frameworkOverlay = 'nestjs';
  }

  if (signals.nextFramework || (signals.ui && signals.toolHints?.includes('next'))) {
    ensureInclude('src');
    ensureInclude('app');
    ensureInclude('pages');
    mergeLayerPatterns(next, 'PresentationAdapters', [
      'src/app/**',
      'src/pages/**',
      'src/components/**',
      'src/layouts/**',
      'src/ui/**',
      'app/**',
      'pages/**',
      'components/**',
      'src/**/page.tsx',
      'src/**/page.ts',
      'src/**/layout.tsx',
      'src/**/layout.ts',
      'src/**/loading.tsx',
      'src/**/error.tsx',
      'src/**/route.ts',
      'src/**/route.tsx',
      // Next middleware edge entry (classic + Next 16 proxy rename)
      'src/middleware.ts',
      'src/middleware.js',
      'middleware.ts',
      'middleware.js',
      'src/proxy.ts',
      'src/proxy.js',
      'proxy.ts',
      'proxy.js',
    ]);
    mergeLayerPatterns(next, 'ApplicationOrchestration', [
      'src/features/**',
      'src/server/**',
      'src/services/**',
      'src/use-cases/**',
      'src/lib/**',
      // Common Next "app core" bags (API clients, hooks, auth, stores) — not UI routes.
      // Without these, monorepos like */src/core/** stay ungoverned and produce false greens.
      'src/core/**',
      '**/core/**',
      'src/actions/**',
      'src/**/actions.ts',
      'src/**/actions.tsx',
    ]);
    mergeLayerPatterns(next, 'DomainModel', [
      'src/domain/**',
      'src/entities/**',
      'src/**/model/**',
      'src/**/models/**',
    ]);
    mergeLayerPatterns(next, 'PersistenceAdapters', [
      'src/db/**',
      'src/data/**',
      'src/repositories/**',
      'src/persistence/**',
      'src/infrastructure/**',
      'src/lib/db/**',
      'src/lib/prisma/**',
      'src/server/db/**',
      // Conventional client data bags under lib/ (higher specificity than bare src/lib/**).
      'src/lib/supabase/**',
      'src/lib/airtable/**',
      'src/lib/firebase/**',
      'src/lib/firestore/**',
      'src/lib/mongodb/**',
      'src/lib/mongoose/**',
      'src/lib/drizzle/**',
      'src/lib/kysely/**',
      'src/lib/planetscale/**',
      'src/lib/neon/**',
      '**/lib/supabase/**',
      '**/lib/airtable/**',
      '**/lib/prisma/**',
      '**/lib/db/**',
    ]);
    // Demo assets, generated public output, and tool configs are not architecture surface.
    const nextExcludes = [
      '**/public/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/*.config.mjs',
      '**/playwright*.ts',
      '**/eslint.config.*',
      '**/postcss.config.*',
      '**/prettier.config.*',
      '**/rstest.config.*',
      '**/scripts/**',
    ];
    next.exclude = [...new Set([...(next.exclude ?? []), ...nextExcludes])];
    // Idempotent: re-applying overlays (e.g. re-init / re-start) must not yield "next+next".
    if (!String(next.frameworkOverlay || '').split('+').includes('next')) {
      next.frameworkOverlay = next.frameworkOverlay
        ? `${next.frameworkOverlay}+next`
        : 'next';
    }
  }

  if (signals.expressLike && !signals.nestFramework) {
    ensureInclude('src');
    mergeLayerPatterns(next, 'PresentationAdapters', [
      'src/**/routes/**',
      'src/**/controllers/**',
      'src/**/http/**',
      'src/**/api/**',
      'src/**/middlewares/**',
      'src/**/middleware/**',
      'src/**/app.ts',
      'src/**/app.js',
      'src/**/server.ts',
      'src/**/server.js',
      'src/index.ts',
      'src/index.js',
    ]);
    mergeLayerPatterns(next, 'ApplicationOrchestration', [
      'src/**/services/**',
      'src/**/use-cases/**',
      'src/**/usecases/**',
      'src/**/controllers/**', // thin express controllers often mix app logic
    ]);
    mergeLayerPatterns(next, 'DomainModel', [
      'src/**/domain/**',
      'src/**/entities/**',
      'src/**/models/**',
    ]);
    mergeLayerPatterns(next, 'PersistenceAdapters', [
      'src/**/repositories/**',
      'src/**/persistence/**',
      'src/**/infrastructure/**',
      'src/**/db/**',
      'src/**/data/**',
    ]);
    next.frameworkOverlay = next.frameworkOverlay
      ? `${next.frameworkOverlay}+express`
      : 'express';
  }

  // Pure library: keep domain/application as the public surface under src/.
  if (signals.libraryOnly && !signals.nestFramework && !signals.nextFramework) {
    ensureInclude('src');
    ensureInclude('lib');
    // Published libraries commonly expose a root entrypoint instead of src/. Include that
    // real surface, but not test files: a public package entrypoint is application code and
    // must not remain outside the contract simply because it is JavaScript or root-level.
    ensureInclude('.');
    mergeLayerPatterns(next, 'DomainModel', [
      'src/**/*.ts',
      'src/**/*.tsx',
      'src/**/*.js',
      'src/**/*.mjs',
      'src/**/*.cjs',
      'lib/**/*.ts',
      'lib/**/*.js',
      'lib/**/*.mjs',
      'lib/**/*.cjs',
      '*.ts',
      '*.tsx',
      '*.js',
      '*.mjs',
      '*.cjs',
    ]);
    // Prefer domain over application for a single-folder lib: only domain if no split.
    next.frameworkOverlay = next.frameworkOverlay
      ? `${next.frameworkOverlay}+library`
      : 'library';
  }

  return withArkConfigMetadata(next);
}

/**
 * Operating mode for the co-pilot surfaces (not "who the user is"):
 *   suggest | adapt | enforce
 *
 * ENFORCE means gates can honestly protect the tree. High governed% alone is not
 * enough when core layers are empty (presentation bag false-green) or core layers
 * with real files remain optional: true.
 *
 * @param {object} opts
 * @param {number|null} [opts.governedPercent]
 * @param {boolean|null} [opts.planMet]
 * @param {boolean} [opts.mature]
 * @param {number|null} [opts.totalFiles]
 * @param {string[]} [opts.emptyLayers] layer names with zero matched files
 * @param {number} [opts.coreOptionalWithFiles] count of core layers that have files but optional:true
 * @param {number|null} [opts.presentationShare] PresentationAdapters file share 0..1 when known
 */
export function resolveOperatingMode({
  governedPercent = null,
  planMet = null,
  mature = false,
  totalFiles = null,
  emptyLayers = null,
  coreOptionalWithFiles = 0,
  presentationShare = null,
} = {}) {
  // Zero files in scope is never ENFORCE — the contract is not looking at any code.
  if (totalFiles === 0) return 'adapt';
  // Core layers still optional while holding real files → contract weaker than the tree.
  if (coreOptionalWithFiles > 0) return 'adapt';
  // Presentation-bag false green: almost everything is Presentation, Domain+Persistence empty.
  const empty = Array.isArray(emptyLayers) ? emptyLayers : [];
  const domainEmpty = empty.includes('DomainModel');
  const persistenceEmpty = empty.includes('PersistenceAdapters');
  if (
    planMet === true &&
    domainEmpty &&
    persistenceEmpty &&
    presentationShare != null &&
    presentationShare >= 0.5 &&
    (governedPercent ?? 0) >= 50
  ) {
    return 'adapt';
  }
  if (planMet === true && (governedPercent == null || governedPercent >= 50)) return 'enforce';
  if (governedPercent != null && governedPercent < 50) return 'adapt';
  if (mature) return 'adapt';
  if (governedPercent != null && governedPercent >= 50 && planMet === false) return 'adapt';
  return 'suggest';
}

export function collectForbiddenGlobalUses(ts, sourceFile, forbidden) {
  return collectForbiddenCapabilityUses(ts, sourceFile, forbidden ?? []);
}

// Layer glob matching — generated from canonical src/domain/layerMatch.ts (see generate:layer-match).
export {
  globToRegExp,
  patternSpecificity,
  layerForFile,
  layerForRelativePath,
  isEdgeDenied,
  findDeniedEdgeRule,
  sliceIdForPath,
  inferSliceFoldersFromPatterns,
  DEFAULT_GENERATED_FILE_GLOBS,
  scanExcludePatterns,
  isScanExcludedRelative,
} from './ark-layer-match.mjs';

/**
 * Resolve an intent name to its layer using the SAME semantics as
 * ArchitectureProfile.resolveLayer in src/kernel/layers/ArchitectureProfile.ts (which the
 * ark-mcp write-gate uses via createArchitectureProfile): every prefix is normalized to a
 * trailing '.', and the layer whose matching prefix is longest wins — regardless of config
 * declaration order. Keeping ark-check on these exact rules is what makes the CI gate and
 * the write-path gate classify identically. `layers` is an array of { name, prefixes }.
 */
export function resolveIntentLayer(intent, layers) {
  return resolveConfiguredIntentLayer(intent, layers);
}

export function looksLikeIntent(value) {
  return looksLikeArkIntent(value);
}

/**
 * Co-pilot Phase F — work classifier + fix-class enrich (R4).
 * Canonical TypeScript: src/domain/remediation.ts
 * Generated CLI load path: bin/lib/remediation.mjs (`npm run generate:cli-pure`).
 */
export {
  REMEDIATION_CLASSES,
  classifyRemediation,
  enrichViolationWithFixClass,
} from './lib/remediation.mjs';

/**
 * Normalize a required/imported TypeScript module for ark-check's host.
 * TS 5/6 expose `sys` on the root export. Early TS 7 / some ESM interop shapes
 * may nest under `.default` or omit `sys` — those are unusable for resolve/scan
 * and must fall through to a JS-API-compatible TypeScript (Ark's own or 5/6).
 *
 * @param {unknown} mod
 * @returns {object | null} usable typescript namespace, or null
 */
export function usableTypescript(mod) {
  if (!mod || typeof mod !== 'object') return null;
  // Prefer root; if root has no sys but default does (CJS/ESM interop), use default.
  const candidates = [mod];
  if (mod.default && typeof mod.default === 'object') candidates.push(mod.default);
  for (const ts of candidates) {
    if (
      ts &&
      typeof ts === 'object' &&
      ts.sys &&
      typeof ts.sys.fileExists === 'function' &&
      typeof ts.createSourceFile === 'function' &&
      typeof ts.resolveModuleName === 'function'
    ) {
      return ts;
    }
  }
  return null;
}

/**
 * Human-readable reason a typescript package module is unusable for the gate.
 * @param {unknown} mod
 */
export function typescriptUsabilityHint(mod) {
  if (!mod) return 'module is null/undefined';
  const ts = mod.default && mod.sys == null ? mod.default : mod;
  if (!ts || typeof ts !== 'object') return 'not an object export';
  // TS 7.0.x main export is only { version, versionMajorMinor }; classic JS host is not there.
  if (
    typeof ts.version === 'string' &&
    !ts.sys &&
    typeof ts.createSourceFile !== 'function' &&
    typeof ts.resolveModuleName !== 'function'
  ) {
    return `version-only export (${ts.version}) — TypeScript 7 main entry no longer ships the classic JS host (sys/AST/resolve); gate falls back to a JS-API TypeScript`;
  }
  if (!ts.sys) return 'missing ts.sys (common with early TypeScript 7 native builds without a full JS host)';
  if (typeof ts.sys.fileExists !== 'function') return 'ts.sys.fileExists is not a function';
  if (typeof ts.createSourceFile !== 'function') return 'missing createSourceFile (AST API)';
  if (typeof ts.resolveModuleName !== 'function') return 'missing resolveModuleName';
  return 'unknown shape incompatibility';
}

/** The three package managers Ark emits commands for. */
const LOCKFILES = { pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', npm: 'package-lock.json' };

/**
 * The Corepack `packageManager` field (and the newer `devEngines.packageManager`) is the
 * project's OWN authoritative statement of its package manager. When present it wins over any
 * lockfile guess. Returns 'pnpm' | 'yarn' | 'npm' | undefined.
 */
function declaredPackageManager(root) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
  const raw =
    (typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : undefined) ??
    (typeof pkg.devEngines?.packageManager?.name === 'string'
      ? pkg.devEngines.packageManager.name
      : undefined);
  const name = raw?.trim().toLowerCase();
  return name === 'pnpm' || name === 'yarn' || name === 'npm' ? name : undefined;
}

/** Lockfiles present in the project root, in { pnpm, yarn, npm } key order. */
export function presentLockfiles(root) {
  return Object.entries(LOCKFILES)
    .filter(([, file]) => fs.existsSync(path.join(root, file)))
    .map(([pm]) => pm);
}

/**
 * Detect the project's package manager: 'pnpm' | 'yarn' | 'npm'.
 *
 * Priority: (1) the `packageManager` / `devEngines` field (the project's own declaration);
 * (2) a single lockfile; (3) on CONFLICT (more than one lockfile and no declaration) prefer
 * npm whenever a package-lock.json is present. Rationale: `npx` runs fine inside a pnpm/yarn
 * repo, but `pnpm exec` / `yarn` in an npm repo BREAKS (frozen-lockfile / no-TTY / a spurious
 * pnpm-lock). So a stray pnpm-lock.yaml left in an npm project must NOT hijack it into pnpm —
 * package-lock.json wins the tie, and the field is the escape hatch for a genuine pnpm repo
 * that still carries a package-lock.json. Falls back to npm when nothing is detectable.
 */
export function detectPackageManager(root) {
  const declared = declaredPackageManager(root);
  if (declared) return declared;
  const locks = presentLockfiles(root);
  if (locks.length <= 1) return locks[0] ?? 'npm';
  if (locks.includes('npm')) return 'npm';
  return locks[0]; // pnpm over yarn when only those two collide
}

// pnpm 10+ `pnpm exec` runs a deps-status pre-check that fails with ERR_PNPM_IGNORED_BUILDS
// when the repo has un-approved native build scripts (sharp, esbuild, tailwind oxide, …) —
// the common state of real pnpm apps. Skip that gate so Ark's emitted commands still run.
const PNPM_EXEC = 'pnpm --config.verify-deps-before-run=false exec';
const RUNNER_BY_PM = { pnpm: PNPM_EXEC, yarn: 'yarn', npm: 'npx' };

/**
 * The command prefix that runs an INSTALLED package binary, matched to the project's
 * package manager. `npx` is used for npm and as the safe fallback.
 *
 * This is the single source of truth that makes every command Ark EMITS — the AGENTS.md
 * contract, .mcp.json, the Claude/Codex hooks, the check:architecture script, the
 * SessionStart summary and every console hint — respect a pnpm-only or yarn repo instead
 * of hardcoding `npx`. (A "pnpm only, never npx" repo treats an emitted `npx` as a policy
 * violation.) `packageManager()` in ark-check.mjs builds the CI-workflow variant on the
 * same detection.
 */
export function execRunner(root) {
  return RUNNER_BY_PM[detectPackageManager(root)];
}

/** Full runnable command string for an installed Ark binary, package-manager aware. */
export function arkCommand(root, bin, argsStr = '') {
  return `${execRunner(root)} ${bin}${argsStr ? ` ${argsStr}` : ''}`;
}

/**
 * Split { command, args } form for JSON/TOML configs (.mcp.json, config.toml) that spawn
 * the binary directly. `pnpm exec ark-mcp` becomes command "pnpm" + args ["exec","ark-mcp",…]
 * so the runner is a real argv[0], not a space-joined string a shell would mis-split.
 */
export function execCommandParts(root, bin, binArgs = []) {
  const runner = execRunner(root);
  if (runner === PNPM_EXEC || runner.startsWith('pnpm ')) {
    return {
      command: 'pnpm',
      args: ['--config.verify-deps-before-run=false', 'exec', bin, ...binArgs],
    };
  }
  if (runner === 'yarn') return { command: 'yarn', args: [bin, ...binArgs] };
  return { command: 'npx', args: [bin, ...binArgs] };
}

/** Package-manager aware "install a dev dependency" hint (e.g. for a missing typescript). */
export function installDevHint(root, pkg) {
  const pm = detectPackageManager(root);
  if (pm === 'pnpm') return `pnpm add -D ${pkg}`;
  if (pm === 'yarn') return `yarn add -D ${pkg}`;
  return `npm install -D ${pkg}`;
}

export const ARCHETYPE_IDS = [
  'crud-product',
  'api-backend',
  'frontend-surface',
  'library-sdk',
  'cli-utility',
  'worker-pipeline',
  'event-coordinator',
  'integration-bridge',
  'multi-app-workspace',
  'prototype-spike',
  'vertical-slice-product',
  'ddd-bounded-contexts',
];

const UI_DIR_NAMES = new Set([
  'components',
  'pages',
  'app',
  'ui',
  'presentation',
  'views',
  'widgets',
]);
const API_DIR_NAMES = new Set(['routes', 'controllers', 'http', 'api', 'handlers', 'server']);
const PERSISTENCE_DIR_NAMES = new Set([
  'persistence',
  'repositories',
  'repository',
  'data',
  'infrastructure',
  'adapters',
  'db',
]);
const JOB_DIR_NAMES = new Set(['jobs', 'workers', 'worker', 'cron', 'schedules', 'queues']);
const WORKFLOW_DIR_NAMES = new Set(['workflows', 'sagas', 'saga']);
const INTEGRATION_DIR_NAMES = new Set([
  'integrations',
  'integration',
  'webhooks',
  'sync',
  'external',
]);
const FSD_DIR_NAMES = new Set(['app', 'pages', 'features', 'entities', 'shared', 'widgets']);

function normalizeRel(value) {
  return value.split(path.sep).join('/');
}

function readPackageJson(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Workspace / multi-package roots for monorepo include.
 * Sources (universal — no project-specific names):
 * 1. package.json workspaces + pnpm-workspace.yaml
 * 2. rush.json projectFolder top segments (JSONC-tolerant)
 * 3. lerna.json packages globs
 * 4. If still empty: conventional multi-package top-level dirs that exist and
 *    contain at least one package.json (packages, apps, plugins, services, …)
 */
export function detectWorkspaces(root) {
  const dirs = new Set();
  const addGlob = (glob) => {
    if (typeof glob !== 'string') return;
    const beforeStar = glob.split('*')[0].replace(/\/+$/, '');
    if (beforeStar && beforeStar !== '.') dirs.add(normalizeRel(beforeStar));
  };
  const addTop = (rel) => {
    if (typeof rel !== 'string') return;
    const top = rel.split(/[/\\]/).filter(Boolean)[0];
    if (top && top !== '.') dirs.add(normalizeRel(top));
  };

  const pkg = readPackageJson(root);
  const ws = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages;
  if (Array.isArray(ws)) ws.forEach(addGlob);

  const pnpmFile = path.join(root, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmFile)) {
    let inPackages = false;
    for (const line of fs.readFileSync(pnpmFile, 'utf8').split('\n')) {
      const keyMatch = line.match(/^([A-Za-z0-9_-]+):/);
      if (keyMatch) {
        inPackages = keyMatch[1] === 'packages';
        continue;
      }
      if (!inPackages) continue;
      const item = line.match(/^\s+-\s*['"]?([^'"#]+?)['"]?\s*$/);
      if (item) addGlob(item[1].trim());
    }
  }

  // Rush monorepos often have no root package.json workspaces — only rush.json.
  const rushFile = path.join(root, 'rush.json');
  if (fs.existsSync(rushFile)) {
    try {
      let text = fs.readFileSync(rushFile, 'utf8');
      text = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const rush = JSON.parse(text);
      for (const project of rush.projects || []) {
        if (typeof project?.projectFolder === 'string') addTop(project.projectFolder);
      }
    } catch {
      /* ignore malformed rush.json */
    }
  }

  // Lerna packages globs.
  const lernaFile = path.join(root, 'lerna.json');
  if (fs.existsSync(lernaFile)) {
    try {
      const lerna = JSON.parse(fs.readFileSync(lernaFile, 'utf8'));
      if (Array.isArray(lerna.packages)) lerna.packages.forEach(addGlob);
    } catch {
      /* ignore */
    }
  }

  // Conventional multi-package roots when no explicit workspace manifest listed roots.
  if (dirs.size === 0) {
    const conventional = [
      'packages',
      'apps',
      'plugins',
      'services',
      'server',
      'servers',
      'server-plugins',
      'libs',
      'lib',
      'modules',
      'foundations',
      'pods',
      'models',
      'clients',
      'sdks',
      'tools',
      'tooling',
      'desktop',
      'common',
    ];
    for (const name of conventional) {
      const abs = path.join(root, name);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
      if (dirContainsPackageJson(abs, 2)) dirs.add(name);
    }
  }

  return [...dirs];
}

/** True if dir (or a child within maxDepth) has a package.json — multi-package root signal. */
function dirContainsPackageJson(dir, maxDepth) {
  try {
    if (fs.existsSync(path.join(dir, 'package.json'))) return true;
    if (maxDepth <= 0) return false;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      if (dirContainsPackageJson(path.join(dir, entry.name), maxDepth - 1)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.next',
  '.turbo',
  '.cache',
  'vendor',
  '__pycache__',
]);

function dirHasTsSources(dir, maxDepth) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && /\.(tsx?|jsx?|mts|cts)$/i.test(entry.name)) return true;
      if (!entry.isDirectory()) continue;
      if (SKIP_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
      if (maxDepth > 0 && dirHasTsSources(path.join(dir, entry.name), maxDepth - 1)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Discover package roots that contain TypeScript/JS sources (polyglot-safe).
 * Returns relative paths (e.g. remotion-composer, packages/ui). Caps depth/count
 * to avoid scanning huge trees. Universal — no project-specific names.
 */
export function detectTsPackageRoots(root, options = {}) {
  const maxDepth = options.maxDepth ?? 3;
  const maxRoots = options.maxRoots ?? 40;
  const found = [];

  const visit = (abs, rel, depth) => {
    if (found.length >= maxRoots || depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    const hasPkg = entries.some((e) => e.isFile() && e.name === 'package.json');
    if (hasPkg && rel && dirHasTsSources(abs, 3)) {
      found.push(rel.split(path.sep).join('/'));
      // Do not descend into nested packages under an already-selected package root
      // unless maxDepth allows and we want monorepo packages/* children — still scan children
      // for nested packages (packages/foo).
    }
    if (depth >= maxDepth) return;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
      // Skip agent skill asset trees (not app code).
      if (entry.name === 'skills' || entry.name === 'templates' || entry.name === 'fixtures') continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      visit(path.join(abs, entry.name), childRel, depth + 1);
    }
  };

  visit(root, '', 0);
  // Also treat root itself if it has package.json + TS
  if (fs.existsSync(path.join(root, 'package.json')) && dirHasTsSources(root, 2)) {
    if (!found.includes('.')) {
      // Prefer explicit '.' only when no nested packages found
      if (found.length === 0) found.push('.');
    }
  }
  return [...new Set(found)].sort();
}

/**
 * Merge workspace globs with TS package roots. If workspaces alone would miss
 * all TS (or are empty), fill from detectTsPackageRoots.
 */
export function resolveIncludeRoots(root) {
  const workspaces = detectWorkspaces(root);
  const tsRoots = detectTsPackageRoots(root);
  if (workspaces.length === 0) {
    if (tsRoots.length > 0) return tsRoots.filter((r) => r !== '.');
    return [];
  }
  // Workspaces present: keep them, add TS package roots not covered by a workspace prefix
  const merged = new Set(workspaces);
  for (const tr of tsRoots) {
    if (tr === '.') continue;
    const covered = workspaces.some(
      (w) => tr === w || tr.startsWith(`${w}/`) || w.startsWith(`${tr}/`)
    );
    if (!covered) merged.add(tr.split('/')[0]); // top segment if nested
    // Prefer full package path when it's a direct child
    if (!tr.includes('/') || workspaces.includes(tr.split('/')[0])) {
      if (fs.existsSync(path.join(root, tr, 'package.json'))) merged.add(tr);
    }
  }
  return [...merged];
}

function isSourceFile(name) {
  return /\.(tsx?|jsx?|mjsx?|cjsx?|mts|cts)$/i.test(name);
}

function readJsonc(file) {
  try {
    const text = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function packageRole(rel, pkg) {
  const tokens = rel.toLowerCase().split('/');
  if (tokens.some((token) => ['docs', 'documentation', 'website', 'examples', 'example', 'tests', 'test', 'fixtures'].includes(token))) {
    return tokens.some((token) => token.startsWith('doc') || token === 'website')
      ? 'docs'
      : tokens.some((token) => token.startsWith('test') || token === 'fixtures')
        ? 'test'
        : 'example';
  }
  if (pkg?.bin) return 'cli';
  if (pkg?.exports || pkg?.main || pkg?.module || pkg?.types || pkg?.typings) return 'library';
  return 'application';
}

function entrypointDirs(pkg) {
  const values = [];
  const add = (value) => {
    if (typeof value === 'string' && !value.includes('*')) values.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(add);
  };
  for (const key of ['main', 'module', 'types', 'typings', 'exports']) add(pkg?.[key]);
  return values.map((value) => path.posix.dirname(value.replace(/^\.\//, ''))).filter((dir) => dir !== '.');
}

/** Package/import units and their explicit source roots, before framework inference. */
export function discoverRepoUnits(root) {
  const packageRels = new Set(['.']);
  for (const rel of detectTsPackageRoots(root)) packageRels.add(rel);
  const units = [];
  for (const rel of packageRels) {
    const abs = rel === '.' ? root : path.join(root, rel);
    const pkg = readPackageJson(abs);
    if (!pkg && rel !== '.') continue;
    const roots = new Set();
    for (const name of ['src', 'source']) {
      if (fs.existsSync(path.join(abs, name))) roots.add(name);
    }
    if (rel === '.') {
      for (const name of ['api', 'lib', 'app', 'frontend', 'web', 'client']) {
        if (dirHasTsSources(path.join(abs, name), 3)) roots.add(name);
      }
    }
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const config = readJsonc(path.join(abs, name));
      const rootDir = config?.compilerOptions?.rootDir;
      if (typeof rootDir === 'string') roots.add(normalizeRel(rootDir));
      for (const ref of config?.references ?? []) {
        if (typeof ref?.path === 'string') roots.add(normalizeRel(ref.path).replace(/^\.\//, ''));
      }
    }
    for (const dir of entrypointDirs(pkg)) {
      if (!['dist', 'build', 'lib'].includes(dir.split('/')[0])) roots.add(normalizeRel(dir));
    }
    if (roots.size === 0 && dirHasTsSources(abs, 2)) roots.add('.');
    const productionDeps = { ...(pkg?.dependencies ?? {}), ...(pkg?.peerDependencies ?? {}), ...(pkg?.optionalDependencies ?? {}) };
    units.push({
      root: rel,
      role: packageRole(rel, pkg),
      sourceRoots: [...roots],
      productionDeps,
      devDependencies: { ...(pkg?.devDependencies ?? {}) },
    });
  }
  return units;
}

function walkSourceFiles(dir, files = [], depth = 0) {
  if (depth > 12) return files;
  const stat = fs.statSync(dir, { throwIfNoEntry: false });
  if (!stat) return files;
  if (stat.isFile()) {
    if (isSourceFile(path.basename(dir))) files.push(dir);
    return files;
  }
  if (!stat.isDirectory()) return files;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    // Skip node_modules/dist and ALL dot-directories (.github, .next, .claude, .cursor, …):
    // they aren't application source, and counting them skews the shape signals — e.g. a
    // `.github/workflows/` CI dir must not read as an app "workflows"/saga signal, and Ark's
    // own installed `.claude`/`.codex` dirs must not perturb a re-run's recommendation.
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    walkSourceFiles(path.join(dir, entry.name), files, depth + 1);
  }
  return files;
}

function listTopLevelDirNames(root, baseDir) {
  const base = path.join(root, baseDir);
  if (!fs.existsSync(base)) return [];
  try {
    return fs
      .readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function dirExistsAnywhere(root, names) {
  const queue = ['.'];
  const seen = new Set();
  while (queue.length > 0) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip node_modules/dist and ALL dot-dirs so `.github/workflows/` (CI YAML) can't be read
      // as an app "workflows"/saga signal, and Ark's own `.claude`/`.codex` don't self-perturb.
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
      if (names.has(entry.name)) return true;
      const child = rel === '.' ? entry.name : `${rel}/${entry.name}`;
      if (child.split('/').length < 8) queue.push(child);
    }
  }
  return false;
}

function countTsxFiles(files) {
  return files.filter((f) => /\.(tsx|jsx)$/i.test(f)).length;
}

/**
 * Merge root + nested package.json dependencies (frontend/, packages/*, apps/*, …).
 * Hosts that only put `arkgate` at the monorepo root and Next under frontend/ must
 * still detect nextFramework so layout overlays (src/core/**) apply on day one.
 */
export function collectAggregatedDeps(root) {
  const deps = {};
  for (const unit of discoverRepoUnits(root)) {
    if (['docs', 'example', 'test'].includes(unit.role)) continue;
    Object.assign(deps, unit.productionDeps);
  }
  return deps;
}

/**
 * Collect deterministic repo shape signals for architecture archetype scoring.
 * Vendor packages may appear in toolHints only — never as the primary label.
 */
export function collectRepoShapeSignals(root) {
  const pkg = readPackageJson(root);
  const repoUnits = discoverRepoUnits(root);
  const workspaceDirs = detectWorkspaces(root);
  const workspaces = workspaceDirs.length > 0;
  // Include frontend/web/client — common Next monorepo app folders.
  const candidateScanDirs = repoUnits
    .filter((unit) => !['docs', 'example', 'test'].includes(unit.role))
    .flatMap((unit) => unit.sourceRoots.map((sourceRoot) =>
      normalizeRel(path.posix.join(unit.root === '.' ? '' : unit.root, sourceRoot))
    ));
  const srcDirs = [...new Set(candidateScanDirs)].filter((d) =>
    fs.existsSync(path.join(root, d))
  );
  const scanRoots = srcDirs.length > 0 ? srcDirs.map((d) => path.join(root, d)) : [root];
  const sourceFiles = [...new Set(scanRoots.flatMap((dir) => walkSourceFiles(dir)))];
  const sourceFileCount = sourceFiles.length;
  const excludedUnitRoots = repoUnits
    .filter((unit) => ['docs', 'example', 'test'].includes(unit.role) && unit.root !== '.')
    .map((unit) => `${unit.root}/`);
  const productionFiles = walkSourceFiles(root).filter((file) => {
    const rel = path.relative(root, file).split(path.sep).join('/');
    return !excludedUnitRoots.some((prefix) => rel.startsWith(prefix));
  });
  const discoveredFileSet = new Set(sourceFiles.map((file) => path.resolve(file)));
  const projectedGovernedCoverage = productionFiles.length === 0
    ? 0
    : Math.round((productionFiles.filter((file) => discoveredFileSet.has(path.resolve(file))).length / productionFiles.length) * 100);
  const tinyTree = sourceFileCount < 3;

  // Nested package.json deps (not root-only) — critical for monorepo Next under frontend/
  const deps = collectAggregatedDeps(root);
  const hasUiFramework = Object.keys(deps).some((name) =>
    /^(react|react-dom|vue|svelte|preact|solid-js)$/i.test(name.split('/')[0])
  );
  const srcUiFiles = sourceFiles.filter((file) => {
    const rel = path.relative(root, file).split(path.sep).join('/');
    return (rel.includes('/src/') || rel.startsWith('src/')) && /\.(tsx|jsx)$/i.test(file);
  });

  const topNames = new Set(srcDirs.flatMap((d) => listTopLevelDirNames(root, d)));
  // Framework / filename signals — strong enough that a tiny Nest starter is not a "prototype".
  // Nest detection: require real Nest surface (@nestjs/* or controller/module/gateway/resolver).
  // Do NOT treat bare `*.service.ts` / `*.guard.ts` as Nest — many Next/Node apps use those
  // names without Nest (false nestjs overlay + wrong doctor toolHints).
  const nestFramework =
    Object.keys(deps).some((name) => name.startsWith('@nestjs/')) ||
    sourceFiles.some((file) =>
      /\.(controller|module|gateway|resolver)\.ts$/i.test(file)
    );
  const nextFramework =
    Boolean(deps.next) ||
    sourceFiles.some((file) => {
      const rel = path.relative(root, file).split(path.sep).join('/');
      return (
        /(^|\/)next\.config\./.test(rel) ||
        // app/page.tsx OR app/dashboard/page.tsx (middle segment optional)
        /(^|\/)app\/(?:.*\/)?page\.(t|j)sx?$/.test(rel) ||
        /(^|\/)pages\/.+\.(t|j)sx?$/.test(rel)
      );
    });
  const expressLike = Object.keys(deps).some((name) =>
    /^(express|fastify|hono|koa|@hapi\/hako|restify)$/i.test(name)
  );

  const ui =
    dirExistsAnywhere(root, UI_DIR_NAMES) ||
    countTsxFiles(sourceFiles) >= 2 ||
    topNames.has('components') ||
    topNames.has('pages') ||
    nextFramework ||
    (hasUiFramework && srcUiFiles.length >= 1);
  const apiSurface =
    dirExistsAnywhere(root, API_DIR_NAMES) ||
    topNames.has('routes') ||
    topNames.has('controllers') ||
    nestFramework ||
    expressLike;
  const persistenceFromDeps = Object.keys(deps).some((name) =>
    /^(prisma|drizzle-orm|typeorm|@libsql\/client|@supabase\/supabase-js|mongodb|pg|mysql2|better-sqlite3|knex)$/i.test(
      name
    )
  );
  const persistence = dirExistsAnywhere(root, PERSISTENCE_DIR_NAMES) || persistenceFromDeps;
  const jobs = dirExistsAnywhere(root, JOB_DIR_NAMES);
  // App saga/workflow code only — CI under .github is skipped by walk/dirExists (dot-dirs).
  const workflows = dirExistsAnywhere(root, WORKFLOW_DIR_NAMES);
  const integration = dirExistsAnywhere(root, INTEGRATION_DIR_NAMES);
  const domain = dirExistsAnywhere(root, new Set(['domain'])) || topNames.has('domain');
  const application =
    dirExistsAnywhere(root, new Set(['application', 'app', 'services'])) ||
    topNames.has('application') ||
    nestFramework;
  const featureSlicedLayout =
    fs.existsSync(path.join(root, 'src')) &&
    ['app', 'pages', 'features', 'entities', 'shared'].some((name) =>
      fs.existsSync(path.join(root, 'src', name))
    );
  // Vertical slice: features/* co-located slices + shared/lib escape, without full FSD ladder
  // (entities/widgets). Distinct from featureSlicedLayout which matches any FSD folder.
  const verticalSliceLayout =
    fs.existsSync(path.join(root, 'src', 'features')) &&
    (fs.existsSync(path.join(root, 'src', 'shared')) ||
      fs.existsSync(path.join(root, 'src', 'lib'))) &&
    !fs.existsSync(path.join(root, 'src', 'entities')) &&
    !fs.existsSync(path.join(root, 'src', 'widgets'));
  // DDD multi-context tree (contexts/*/domain|application|infrastructure).
  const dddBoundedContextsLayout =
    fs.existsSync(path.join(root, 'src', 'contexts')) ||
    fs.existsSync(path.join(root, 'src', 'bounded-contexts'));

  const hasBin = Boolean(pkg?.bin);
  const hasExports = Boolean(pkg?.exports);
  const hasMain = Boolean(pkg?.main || pkg?.module);
  // A Nest/Next/express app is never a library-sdk, even if it has "main".
  const library =
    !hasBin &&
    !nestFramework &&
    !nextFramework &&
    !expressLike &&
    (hasExports || hasMain || pkg?.type === 'module') &&
    !ui &&
    !apiSurface &&
    sourceFileCount > 0 &&
    sourceFileCount < 80;
  const cli = hasBin;

  const tsxCount = countTsxFiles(sourceFiles);
  const uiHeavy = ui && tsxCount >= 3;
  const apiSurfaceOnly = apiSurface && !uiHeavy;
  const persistenceHeavy = persistence && sourceFileCount >= 8;
  const domainHeavy = domain && application;
  const jobsOnly = jobs && !ui && !apiSurface;
  const uiOnly = ui && !persistence && !apiSurface && !jobs;
  const libraryOnly = library && !cli;

  const fullStackProduct = ui && apiSurface && persistence;

  const toolHints = Object.keys(deps).filter((name) =>
    /^(next|@nestjs|express|fastify|hono|prisma|drizzle|typeorm|supabase|react|vue|svelte)$/i.test(
      name.split('/')[0]
    )
  );
  if (nestFramework && !toolHints.some((h) => h.startsWith('@nestjs') || h === 'nestjs')) {
    toolHints.push('@nestjs/*');
  }
  if (nextFramework && !toolHints.includes('next')) toolHints.push('next');

  // Turborepo / Nx markers (monorepo tooling — maps to monorepo preset, not separate engines).
  const monorepoTooling = [];
  if (fs.existsSync(path.join(root, 'turbo.json'))) monorepoTooling.push('turborepo');
  if (
    fs.existsSync(path.join(root, 'nx.json')) ||
    fs.existsSync(path.join(root, 'workspace.json'))
  ) {
    monorepoTooling.push('nx');
  }
  if (monorepoTooling.includes('turborepo') && !toolHints.includes('turborepo')) {
    toolHints.push('turborepo');
  }
  if (monorepoTooling.includes('nx') && !toolHints.includes('nx')) {
    toolHints.push('nx');
  }

  return {
    repoUnits,
    discoveredRoots: srcDirs,
    workspaces,
    workspaceDirs,
    ui,
    uiHeavy,
    apiSurface,
    apiSurfaceOnly,
    persistence,
    persistenceHeavy,
    jobs,
    jobsOnly,
    workflows,
    integration,
    cli,
    library,
    libraryOnly,
    tinyTree,
    sourceFileCount,
    projectedGovernedCoverage,
    domain,
    application,
    domainHeavy,
    uiOnly,
    featureSlicedLayout,
    verticalSliceLayout,
    dddBoundedContextsLayout,
    // null when absent so scoreArchetypes `if (signals.x)` is false for empty tooling
    monorepoTooling: monorepoTooling.length > 0 ? monorepoTooling : null,
    fullStackProduct,
    persistenceFromDeps,
    nestFramework,
    nextFramework,
    expressLike,
    toolHints,
  };
}

const SIGNAL_WHY = {
  workspaces: (signals) => `workspace roots declared (${signals.workspaceDirs.join(', ')})`,
  tinyTree: (signals) => `few source files (${signals.sourceFileCount})`,
  ui: () => 'UI directories or multiple TSX files present',
  uiHeavy: () => 'substantial UI surface (multiple TSX files)',
  apiSurface: () => 'API/route/controller directories present',
  apiSurfaceOnly: () => 'API surface without a heavy UI layer',
  persistence: () => 'persistence or data-access directories present',
  persistenceHeavy: () => 'substantial persistence layer',
  jobs: () => 'jobs/workers/schedules directories present',
  jobsOnly: () => 'background jobs without UI or API entrypoints',
  workflows: () => 'workflows or sagas directories present',
  integration: () => 'integration/webhook/sync directories present',
  cli: () => 'package.json declares a bin entry',
  library: () => 'publishable package shape (exports/main, no CLI bin)',
  libraryOnly: () => 'library package without a CLI entry',
  featureSlicedLayout: () => 'feature-sliced directory layout under src/',
  verticalSliceLayout: () =>
    'vertical-slice layout (src/features + shared/lib, without FSD entities/widgets)',
  dddBoundedContextsLayout: () =>
    'DDD bounded contexts under src/contexts or src/bounded-contexts',
  monorepoTooling: (signals) =>
    signals.monorepoTooling?.length
      ? `monorepo tooling detected (${signals.monorepoTooling.join(', ')})`
      : 'monorepo tooling markers present',
  domain: () => 'domain directory present',
  application: () => 'application or services directory present',
  domainHeavy: () => 'both domain and application directories present',
  uiOnly: () => 'UI without persistence, API, or jobs',
  fullStackProduct: () => 'UI, API handlers, and persistence dependencies together',
  persistenceFromDeps: () => 'database client library in package.json dependencies',
  nestFramework: () => 'NestJS modules/controllers/services (or @nestjs/* deps)',
  nextFramework: () => 'Next.js app/pages router or next dependency',
  expressLike: () => 'HTTP framework dependency (express/fastify/hono/…)',
};

const NEGATIVE_SIGNAL_WHY = {
  workspaces: () => 'not a workspace monorepo (penalized for this shape)',
  cli: () => 'CLI bin entry present (penalized for this shape)',
  ui: () => 'UI directories present (penalized for this shape)',
  uiHeavy: () => 'heavy UI surface (penalized for this shape)',
  persistence: () => 'persistence directories present (penalized for this shape)',
  apiSurfaceOnly: () => 'API-only surface (penalized for this shape)',
  tinyTree: () => 'very small source tree (penalized for this shape)',
  jobs: () => 'background jobs present (penalized for this shape)',
  jobsOnly: () => 'jobs without UI/API (penalized for this shape)',
  workflows: () => 'workflows present (penalized for this shape)',
  domainHeavy: () => 'rich domain layer (penalized for this shape)',
  libraryOnly: () => 'library-only package (penalized for this shape)',
  persistenceHeavy: () => 'heavy persistence usage (penalized for this shape)',
};

/** Plain-language reasons for signals that scored the winning archetype. */
export function whyFromMatchedSignals(signals, matched) {
  const why = [];
  for (const token of matched ?? []) {
    if (token.startsWith('!')) {
      const neg = token.slice(1);
      const label = NEGATIVE_SIGNAL_WHY[neg];
      if (label && signals[neg]) why.push(label(signals));
      continue;
    }
    const label = SIGNAL_WHY[token];
    if (label && signals[token]) why.push(label(signals));
  }
  return why;
}

function evidenceFromMatchedSignals(signals, matched) {
  return (matched ?? []).flatMap((token) => {
    const negative = token.startsWith('!');
    const signal = negative ? token.slice(1) : token;
    const label = negative ? NEGATIVE_SIGNAL_WHY[signal] : SIGNAL_WHY[signal];
    if (!label || !signals[signal]) return [];
    return [{ signal, effect: negative ? 'negative' : 'positive', explanation: label(signals) }];
  });
}

export function defaultPlaybookPath() {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'templates',
    'architecture-playbook.json'
  );
}

export function loadArchitecturePlaybook(playbookPath = defaultPlaybookPath()) {
  const raw = fs.readFileSync(playbookPath, 'utf8');
  const playbook = JSON.parse(raw);
  const ids = Object.keys(playbook.archetypes ?? {});
  if (ids.length !== ARCHETYPE_IDS.length) {
    throw new Error(
      `architecture-playbook.json must define exactly ${ARCHETYPE_IDS.length} archetypes (found ${ids.length})`
    );
  }
  for (const id of ARCHETYPE_IDS) {
    if (!playbook.archetypes[id]) {
      throw new Error(`architecture-playbook.json missing archetype: ${id}`);
    }
  }
  return playbook;
}

function resolvePreset(archetypeDef, signals) {
  const alt = archetypeDef.presetAlternatives?.['feature-sliced'];
  if (alt?.whenSignal && signals[alt.whenSignal]) return 'feature-sliced';
  return archetypeDef.preset;
}

/**
 * Score playbook archetypes against collected repo shape signals.
 * Returns sorted matches (highest score first) with confidence in [0, 1].
 */
export function scoreArchetypes(signals, playbook) {
  const scored = [];
  for (const [id, def] of Object.entries(playbook.archetypes)) {
    let score = 0;
    const matched = [];
    for (const [signal, weight] of Object.entries(def.detectionSignals ?? {})) {
      if (signals[signal]) {
        score += Number(weight);
        matched.push(signal);
      }
    }
    for (const [signal, weight] of Object.entries(def.negativeSignals ?? {})) {
      if (signals[signal]) {
        score -= Number(weight);
        matched.push(`!${signal}`);
      }
    }
    const maxPositive = Object.values(def.detectionSignals ?? {}).reduce(
      (sum, w) => sum + Number(w),
      0
    );
    scored.push({
      id,
      label: def.label,
      preset: resolvePreset(def, signals),
      score,
      maxPositive: maxPositive || 1,
      matched,
      phases: def.phases,
      analogy: def.analogy,
      antiPatterns: def.antiPatterns ?? [],
      books: def.books ?? [],
    });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const top = scored[0];
  const second = scored[1];
  if (!top || top.score <= 0) {
    const spike = scored.find((entry) => entry.id === 'prototype-spike');
    const fallback = spike ?? top;
    const confidence = signals.tinyTree ? 0.55 : 0.35;
    return {
      ranked: scored,
      archetype: fallback.id,
      label: fallback.label,
      preset: fallback.preset,
      confidence,
      requiresConfirmation: true,
      confirmationReasons: [
        `projected governed coverage is ${signals.projectedGovernedCoverage ?? 0}% (below 90%)`,
        'no archetype received a positive score',
      ],
      phases: fallback.phases,
      analogy: fallback.analogy,
      antiPatterns: fallback.antiPatterns,
      books: fallback.books,
      matched: fallback.matched,
      runnerUp: second && second.id !== fallback.id ? { id: second.id, score: second.score } : { id: 'crud-product', score: 0 },
    };
  }

  const rawConfidence = top.score / top.maxPositive;
  const margin =
    second && second.score > 0 ? (top.score - second.score) / Math.max(top.score, 1) : 0.25;
  let confidence = Math.min(1, Math.max(0.1, rawConfidence * 0.7 + margin * 0.3));
  // Thin / zero TS surface: never present a high-confidence archetype as the sole answer.
  const thinTs =
    !signals.sourceFileCount ||
    signals.sourceFileCount < 8 ||
    signals.tinyTree;
  if (thinTs) {
    confidence = Math.min(confidence, 0.28);
  }
  const closeRecommendations = Boolean(second && top.score - second.score <= 2);
  const lowProjectedCoverage = (signals.projectedGovernedCoverage ?? 0) < 90;
  if (closeRecommendations) confidence = Math.min(confidence, 0.49);
  if (lowProjectedCoverage) confidence = Math.min(confidence, 0.49);

  return {
    ranked: scored,
    archetype: top.id,
    label: top.label,
    preset: top.preset,
    confidence: Math.round(confidence * 1000) / 1000,
    ...(thinTs
      ? {
          thinTsSurface: true,
          caution:
            'TypeScript/JS surface is thin or missing — treat the archetype as a weak hint. Prefer ark-check --suggest-include / --adopt-contract on the real package roots before scaffolding.',
        }
      : {}),
    requiresConfirmation: closeRecommendations || thinTs || lowProjectedCoverage,
    confirmationReasons: [
      ...(closeRecommendations ? ['top recommendations are within 2 score points'] : []),
      ...(lowProjectedCoverage ? [`projected governed coverage is ${signals.projectedGovernedCoverage}% (below 90%)`] : []),
      ...(thinTs ? ['the discovered source surface is thin'] : []),
    ],
    phases: top.phases,
    analogy: top.analogy,
    antiPatterns: top.antiPatterns,
    books: top.books,
    matched: top.matched,
    runnerUp: second
      ? { id: second.id, label: second.label, score: second.score, preset: second.preset }
      : { id: 'prototype-spike', score: 0 },
  };
}

// Source-file count above which a repo is treated as an established codebase rather than a
// fresh project — the boundary between the `ark init` starter flow and the /ark-adopt flow.
export const MATURE_REPO_FILE_THRESHOLD = 150;

export function buildArchitectureRecommendation(root, options = {}) {
  const playbookPath = options.playbookPath ?? defaultPlaybookPath();
  const playbook = loadArchitecturePlaybook(playbookPath);
  const signals = collectRepoShapeSignals(root);
  const result = scoreArchetypes(signals, playbook);

  const adoptInOrder = {
    phase1: result.phases?.['1'] ?? [],
    phase2: result.phases?.['2'] ?? [],
    phase3: result.phases?.['3'] ?? [],
  };

  const galleryStarter = GALLERY_STARTER_BY_ARCHETYPE[result.archetype] ?? null;
  const policyPackId = policyPackIdForPreset(result.preset);

  return {
    ok: true,
    playbookVersion: playbook.version,
    archetype: result.archetype,
    label: result.label,
    preset: result.preset,
    confidence: result.confidence,
    requiresConfirmation: result.requiresConfirmation ?? false,
    confirmationReasons: result.confirmationReasons ?? [],
    ...(result.thinTsSurface ? { thinTsSurface: true, caution: result.caution } : {}),
    phases: result.phases,
    adoptInOrder,
    analogy: result.analogy,
    antiPatterns: result.antiPatterns,
    books: result.books,
    why: whyFromMatchedSignals(signals, result.matched),
    evidence: evidenceFromMatchedSignals(signals, result.matched),
    matchedSignals: result.matched,
    runnerUp: result.runnerUp,
    toolHints: signals.toolHints,
    galleryStarter,
    policyPack: policyPackId,
    signals: {
      sourceFileCount: signals.sourceFileCount,
      projectedGovernedCoverage: signals.projectedGovernedCoverage,
      discoveredRoots: signals.discoveredRoots,
      packageUnits: signals.repoUnits.map((unit) => ({
        root: unit.root,
        role: unit.role,
        sourceRoots: unit.sourceRoots,
        productionDependencies: Object.keys(unit.productionDeps).sort(),
        devOnlyDependencies: Object.keys(unit.devDependencies).sort(),
      })),
      workspaces: signals.workspaces,
      ui: signals.ui,
      apiSurface: signals.apiSurface,
      persistence: signals.persistence,
      jobs: signals.jobs,
      workflows: signals.workflows,
      integration: signals.integration,
      cli: signals.cli,
      library: signals.library,
      tinyTree: signals.tinyTree,
      fullStackProduct: signals.fullStackProduct,
      persistenceFromDeps: signals.persistenceFromDeps,
      nestFramework: signals.nestFramework,
      nextFramework: signals.nextFramework,
      expressLike: signals.expressLike,
      verticalSliceLayout: signals.verticalSliceLayout,
      dddBoundedContextsLayout: signals.dddBoundedContextsLayout,
      monorepoTooling: signals.monorepoTooling,
    },
    // A repo past this size is not greenfield: `ark init` would scaffold a starter that governs
    // a thin slice and can mis-flag framework internals, so steer these to the adoption flow.
    mature: signals.sourceFileCount >= MATURE_REPO_FILE_THRESHOLD,
    initCommand: `${arkCommand(root, 'ark', `init --archetype ${result.archetype} --yes`)}`,
    firstCommand: `${arkCommand(root, 'ark', `init --archetype ${result.archetype} --yes`)}`,
    adoptCommand: arkCommand(root, 'ark-check', '--recommend --write-plan'),
    recommendCommand: arkCommand(root, 'ark-check', '--recommend'),
    checkCommand: arkCommand(root, 'ark-check', '--root . --config ark.config.json --strict-config'),
  };
}

/** English wizard choices (application shape, not vendor stack). */
export const INIT_WIZARD_CHOICES = [
  { key: '1', archetype: 'crud-product', label: 'A product with UI and stored data' },
  { key: '2', archetype: 'api-backend', label: 'An API server without UI in this repo' },
  { key: '3', archetype: 'frontend-surface', label: 'A UI-focused app (backend elsewhere)' },
  { key: '4', archetype: 'cli-utility', label: 'A command-line tool' },
  { key: '5', archetype: 'worker-pipeline', label: 'Background jobs or workers' },
  { key: '6', archetype: 'multi-app-workspace', label: 'Several apps in one repository' },
  { key: '7', archetype: 'prototype-spike', label: 'A quick experiment or learning project' },
  { key: '8', archetype: 'vertical-slice-product', label: 'Feature-first slices (vertical slice)' },
  { key: '9', archetype: 'ddd-bounded-contexts', label: 'Multiple business domains (bounded contexts)' },
  { key: 'a', archetype: 'auto', label: 'Analyze my repo and suggest (recommended if unsure)' },
];

export function isValidArchetypeId(id) {
  return ARCHETYPE_IDS.includes(id);
}

export function resolveArchetypePreset(archetypeId, playbookPath = defaultPlaybookPath()) {
  if (!isValidArchetypeId(archetypeId)) {
    throw new Error(
      `Unknown archetype "${archetypeId}". Valid ids: ${ARCHETYPE_IDS.join(', ')}`
    );
  }
  const playbook = loadArchitecturePlaybook(playbookPath);
  const def = playbook.archetypes[archetypeId];
  return {
    archetype: archetypeId,
    preset: def.preset,
    label: def.label,
    phases: def.phases,
  };
}

export function mapWizardChoiceToArchetype(choiceKey) {
  const entry = INIT_WIZARD_CHOICES.find((c) => c.key === String(choiceKey).trim());
  if (!entry) return null;
  return entry.archetype;
}

const NEW_HERE_GOVERNED_THRESHOLD = 50;

/** Show onboarding nudge when coverage is low or config is missing. */
export function shouldShowNewHereNudge(root, configPath, governedPercent, configMissing) {
  if (configMissing) return true;
  if (typeof governedPercent === 'number' && governedPercent < NEW_HERE_GOVERNED_THRESHOLD) {
    return true;
  }
  if (fs.existsSync(configPath)) {
    try {
      const stat = fs.statSync(configPath);
      const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays < 7 && governedPercent < 80) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function formatArchitectureRecommendationHuman(recommendation) {
  const lines = [];
  lines.push('Ark architecture recommendation (application shape, not vendor stack)');
  lines.push('');
  lines.push(`Archetype: ${recommendation.archetype} — ${recommendation.label}`);
  lines.push(`Preset: ${recommendation.preset} (confidence ${recommendation.confidence})`);
  if (recommendation.requiresConfirmation) {
    lines.push('⚠ Confirmation required before applying this recommendation.');
    for (const reason of recommendation.confirmationReasons ?? []) lines.push(`  - ${reason}`);
  }
  if (recommendation.galleryStarter) {
    lines.push(`Gallery starter: ${recommendation.galleryStarter}`);
  }
  if (recommendation.policyPack) {
    lines.push(`Policy pack: ark-check --apply-policy-pack ${recommendation.policyPack}`);
  }
  if (recommendation.thinTsSurface) {
    lines.push('');
    lines.push(
      `⚠ Thin TypeScript surface (${recommendation.signals?.sourceFileCount ?? 0} files) — confidence is capped. Do not treat this as a firm shape.`
    );
    if (recommendation.caution) lines.push(recommendation.caution);
  }
  if (recommendation.runnerUp?.id) {
    lines.push(
      `Runner-up: ${recommendation.runnerUp.id}${recommendation.runnerUp.label ? ` (${recommendation.runnerUp.label})` : ''}`
    );
  }
  lines.push('');
  lines.push('Phase 1 layers (start here):');
  for (const layer of recommendation.adoptInOrder.phase1) {
    lines.push(`  - ${layer}`);
  }
  if (recommendation.adoptInOrder.phase2?.length) {
    lines.push('Phase 2 (when you add integrations or similar):');
    for (const layer of recommendation.adoptInOrder.phase2) {
      lines.push(`  - ${layer}`);
    }
  }
  lines.push('');
  lines.push(`Analogy: ${recommendation.analogy}`);
  if (recommendation.why?.length) {
    lines.push('');
    lines.push('Why (repo shape signals):');
    for (const item of recommendation.why) {
      lines.push(`  - ${item}`);
    }
  }
  if (recommendation.antiPatterns?.length) {
    lines.push('');
    lines.push('Avoid:');
    for (const item of recommendation.antiPatterns) {
      lines.push(`  - ${item}`);
    }
  }
  lines.push('');
  if (recommendation.mature) {
    // Established codebase: `ark init` would scaffold a thin/mis-scoped starter. Route to the
    // adoption flow, which aligns the contract to the repo's real structure with judgment.
    lines.push(
      `This is an established codebase (${recommendation.signals?.sourceFileCount} source files) — use the adoption flow,`
    );
    lines.push('not the greenfield starter, so the contract matches your real structure:');
    lines.push(`Next: ${recommendation.adoptCommand}`);
    lines.push('Then: run /ark-adopt in your agent (re-scope layers to reality, freeze real debt only)');
  } else {
    lines.push(`Next: ${recommendation.firstCommand}`);
    lines.push(`Then: ${recommendation.checkCommand}`);
  }
  return lines.join('\n');
}

export const ADOPTION_PLAN_FILENAME = 'ark-adoption-plan.json';

function galleryStarter(archetype, directory = archetype, generatedPreset) {
  return Object.freeze({
    archetype,
    directory: `examples/${directory}-starter`,
    ...(generatedPreset ? { generatedPreset } : {}),
  });
}

export const GALLERY_STARTERS = Object.freeze([
  galleryStarter('crud-product'),
  galleryStarter('api-backend'),
  galleryStarter('worker-pipeline'),
  galleryStarter('multi-app-workspace'),
  galleryStarter('vertical-slice-product', 'vertical-slice', 'vertical-slice'),
  galleryStarter('ddd-bounded-contexts', 'ddd-context', 'ddd-bounded-contexts'),
]);

const GALLERY_STARTER_BY_ARCHETYPE = Object.fromEntries(
  GALLERY_STARTERS.map(({ archetype, directory }) => [archetype, `${directory}/`])
);

/** Enthusiast pack id for a named preset, or null when none ships. */
export function policyPackIdForPreset(preset) {
  if (
    preset === 'hexagonal' ||
    preset === 'layered' ||
    preset === 'feature-sliced' ||
    preset === 'monorepo' ||
    preset === 'vertical-slice' ||
    preset === 'ddd-bounded-contexts' ||
    preset === 'ui-surface' ||
    preset === 'clean-architecture' ||
    preset === 'onion-architecture'
  ) {
    // clean/onion alias packs → hexagonal enthusiast pack
    const packPreset =
      preset === 'clean-architecture' || preset === 'onion-architecture'
        ? 'hexagonal'
        : preset;
    return `enthusiast-${packPreset}`;
  }
  return null;
}

/** Machine-readable adoption record for optional commit (Phase E). */
export function buildAdoptionPlanDocument(recommendation) {
  const preset = recommendation.preset;
  const policyPackId = recommendation.policyPack ?? policyPackIdForPreset(preset);

  return {
    version: '1',
    generatedAt: new Date().toISOString(),
    playbookVersion: recommendation.playbookVersion,
    archetype: recommendation.archetype,
    label: recommendation.label,
    preset: recommendation.preset,
    confidence: recommendation.confidence,
    requiresConfirmation: recommendation.requiresConfirmation ?? false,
    confirmationReasons: recommendation.confirmationReasons ?? [],
    phases: recommendation.phases,
    adoptInOrder: recommendation.adoptInOrder,
    matchedSignals: recommendation.matchedSignals ?? [],
    analogy: recommendation.analogy,
    antiPatterns: recommendation.antiPatterns ?? [],
    books: recommendation.books ?? [],
    why: recommendation.why ?? [],
    runnerUp: recommendation.runnerUp,
    mature: recommendation.mature ?? false,
    initCommand: recommendation.initCommand,
    firstCommand: recommendation.firstCommand,
    adoptCommand: recommendation.adoptCommand,
    checkCommand: recommendation.checkCommand,
    recommendCommand: recommendation.recommendCommand,
    galleryStarter: GALLERY_STARTER_BY_ARCHETYPE[recommendation.archetype] ?? null,
    policyPack: policyPackId,
    writePlanCommand: 'ark-check --recommend --write-plan',
  };
}

/** Write ark-adoption-plan.json; never weakens the gate — JSON only. */
export function writeAdoptionPlan(root, recommendation, filename = ADOPTION_PLAN_FILENAME) {
  const document = buildAdoptionPlanDocument(recommendation);
  const outPath = path.join(root, filename);
  fs.writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
  return { path: outPath, document };
}

const __arkSharedDir = path.dirname(fileURLToPath(import.meta.url));

export function defaultPolicyPacksPath() {
  return path.resolve(__arkSharedDir, '../templates/policy-packs');
}

export function listPolicyPackIds(packsPath = defaultPolicyPacksPath()) {
  if (!fs.existsSync(packsPath)) return [];
  return fs
    .readdirSync(packsPath)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .sort();
}

export function loadPolicyPackMeta(packId, packsPath = defaultPolicyPacksPath()) {
  if (typeof packId !== 'string' || !packId.length) {
    throw new Error('Policy pack id is required');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(packId)) {
    throw new Error(
      `Invalid policy pack id "${packId}". Valid packs: ${listPolicyPackIds(packsPath).join(', ') || '(none)'}`
    );
  }
  const ids = listPolicyPackIds(packsPath);
  if (!ids.includes(packId)) {
    throw new Error(
      `Unknown policy pack "${packId}". Valid packs: ${ids.join(', ') || '(none)'}`
    );
  }
  const filePath = path.join(packsPath, `${packId}.json`);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(`${path.resolve(packsPath)}${path.sep}`)) {
    throw new Error(`Invalid policy pack id "${packId}"`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Unknown policy pack "${packId}". Valid packs: ${ids.join(', ') || '(none)'}`
    );
  }
  const pack = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!pack.id || !pack.preset) {
    throw new Error(`Policy pack ${filePath} must define "id" and "preset"`);
  }
  return pack;
}
