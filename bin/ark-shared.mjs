import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Default layer rule matrix + intent-prefix map, shared by both CLIs and by the ark-mcp
 * write-path gate so they enforce identically. These mirror the elevenLayerProfile in
 * src/kernel/layers/ArchitectureProfile.ts; kept here (not imported from dist) because the
 * CLIs run standalone with only `typescript` present, no build step.
 */
export const DEFAULT_INTENT_PREFIXES = [
  { layer: 'DomainModel', prefixes: ['Domain.'] },
  { layer: 'ApplicationOrchestration', prefixes: ['Application.'] },
  { layer: 'PersistenceAdapters', prefixes: ['Adapter.Persistence.', 'Adapter.Repository.'] },
  { layer: 'IntegrationAdapters', prefixes: ['Adapter.Integration.', 'Adapter.External.'] },
  { layer: 'WorkflowSagaEngine', prefixes: ['Workflow.'] },
  { layer: 'BackgroundJobsScheduling', prefixes: ['Job.'] },
  { layer: 'PresentationAdapters', prefixes: ['Presentation.', 'Adapter.Presentation.', 'Adapter.Api.'] },
  { layer: 'ReportingReadModels', prefixes: ['Reporting.'] },
  { layer: 'ExtensibilityMetadata', prefixes: ['Metadata.'] },
  { layer: 'SecurityAuditObservability', prefixes: ['Security.', 'Audit.', 'Observability.'] },
  { layer: 'Kernel', prefixes: ['Kernel.'] },
];

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

const DEFAULT_ALLOWED_FLOWS = [
  { from: 'PresentationAdapters', to: 'ApplicationOrchestration' },
  { from: 'ApplicationOrchestration', to: 'DomainModel' },
  { from: 'WorkflowSagaEngine', to: 'ApplicationOrchestration' },
  { from: 'WorkflowSagaEngine', to: 'DomainModel' },
  { from: 'BackgroundJobsScheduling', to: 'ApplicationOrchestration' },
];

function flowKey(from, to) {
  return `${from}->${to}`;
}

function createStrictDenyRules(layers, allowedFlows) {
  const allowed = new Set(allowedFlows.map((flow) => flowKey(flow.from, flow.to)));
  const rules = [];
  for (const from of layers) {
    for (const to of layers) {
      if (from.layer === to.layer) continue;
      if (allowed.has(flowKey(from.layer, to.layer))) continue;
      rules.push({ from: from.layer, to: to.layer, allowed: false });
    }
  }
  return rules;
}

export const DEFAULT_RULES = createStrictDenyRules(
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_ALLOWED_FLOWS
);

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
  const config = {
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
  };
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
    return config;
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
    ]);
    mergeLayerPatterns(next, 'ApplicationOrchestration', [
      'src/features/**',
      'src/server/**',
      'src/services/**',
      'src/use-cases/**',
      'src/lib/**',
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
    ]);
    next.frameworkOverlay = next.frameworkOverlay
      ? `${next.frameworkOverlay}+next`
      : 'next';
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
    mergeLayerPatterns(next, 'DomainModel', ['src/**/*.ts', 'src/**/*.tsx', 'lib/**/*.ts']);
    // Prefer domain over application for a single-folder lib: only domain if no split.
    next.frameworkOverlay = next.frameworkOverlay
      ? `${next.frameworkOverlay}+library`
      : 'library';
  }

  return next;
}

/**
 * Operating mode for the co-pilot surfaces (not "who the user is"):
 *   suggest | adapt | enforce
 */
export function resolveOperatingMode({
  governedPercent = null,
  planMet = null,
  mature = false,
  totalFiles = null,
} = {}) {
  // Zero files in scope is never ENFORCE — the contract is not looking at any code.
  if (totalFiles === 0) return 'adapt';
  if (planMet === true && (governedPercent == null || governedPercent >= 50)) return 'enforce';
  if (governedPercent != null && governedPercent < 50) return 'adapt';
  if (mature) return 'adapt';
  if (governedPercent != null && governedPercent >= 50 && planMet === false) return 'adapt';
  return 'suggest';
}

/**
 * Find uses of forbidden ambient globals in a TypeScript source file.
 *
 * Detection is deliberately positional, not scope-aware (kept in sync with
 * `collectForbiddenGlobalUses` in src/kernel/ai-gate/AICodeGate.ts — the CLIs must not
 * import from dist):
 *   - a dotted entry ("Date.now") flags `Date.now` property accesses
 *   - a bare entry ("console", "fetch") flags property accesses on it (`console.log`),
 *     direct calls (`fetch(...)`), and constructions (`new WebSocket(...)`)
 * Bare identifier mentions in other positions (types, shadowed locals, import names) are
 * NOT flagged, trading a little recall for near-zero false positives without a type checker.
 *
 * Returns [{ name, node }] where `name` is the matched forbidden entry.
 */
export function collectForbiddenGlobalUses(ts, sourceFile, forbidden) {
  const entries = new Set(forbidden ?? []);
  if (entries.size === 0) return [];
  const uses = [];

  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const dotted = `${node.expression.text}.${node.name.text}`;
      if (entries.has(dotted)) {
        uses.push({ name: dotted, node });
      } else if (entries.has(node.expression.text)) {
        uses.push({ name: node.expression.text, node });
      }
    } else if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      node.expression &&
      ts.isIdentifier(node.expression) &&
      entries.has(node.expression.text)
    ) {
      uses.push({ name: node.expression.text, node });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return uses;
}

const _regexpCache = new Map();

function escapeLiteral(ch) {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/** True only when every `{` has a matching `}` (ignoring backslash-escaped braces). */
function bracesBalanced(glob) {
  let depth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '\\') {
      i += 1; // skip the escaped character
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * Convert an ark.config.json layer glob pattern to an anchored RegExp (compiled once per
 * pattern, then cached).
 *
 * IMPORTANT: the double-star is expanded in a SINGLE pass. A chained two-step replace
 * (double-star to dot-star, then single-star to a no-slash class) corrupts the double-star,
 * because the second step re-matches the star inside the substitution the first step just
 * inserted. That made "src/kernel/**" stop matching nested paths, silently unclassifying
 * every file in a subdirectory. Scanning one character at a time also lets us support
 * brace alternation ("*.{ts,tsx}") and backslash escapes ("\\{" → literal brace).
 *
 * Brace alternation is only enabled when braces are balanced; an unbalanced brace (a config
 * typo) is treated as a literal so the gate never crashes on `new RegExp`.
 */
export function globToRegExp(pattern) {
  const cached = _regexpCache.get(pattern);
  if (cached) return cached;

  const glob = pattern.split(path.sep).join('/');
  const useBraces = bracesBalanced(glob);
  let out = '';
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '\\' && i + 1 < glob.length) {
      out += escapeLiteral(glob[i + 1]); // backslash escapes the next char to a literal
      i += 1;
    } else if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?'; // `**/` matches zero or more path segments
          i += 2;
        } else {
          out += '.*'; // `**` matches across `/`
          i += 1;
        }
      } else {
        out += '[^/]*'; // `*` matches within a single segment
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '{' && useBraces) {
      out += '(?:';
      braceDepth += 1;
    } else if (c === '}' && useBraces && braceDepth > 0) {
      out += ')';
      braceDepth -= 1;
    } else if (c === ',' && useBraces && braceDepth > 0) {
      out += '|';
    } else {
      out += escapeLiteral(c);
    }
  }
  const re = new RegExp(`^${out}$`);
  _regexpCache.set(pattern, re);
  return re;
}

// Specificity score for a layer glob: more literal path segments before the first wildcard
// wins, then longer literal text. So `src/kernel/app/**` (3 literal segments) beats
// `src/kernel/**` (2), and an exact file like `src/kernel/events.ts` beats both. This is what
// makes a facade split (a KernelApi surface layer overlapping a KernelInternal catch-all)
// resolve to the surface REGARDLESS of layer declaration order — the intuitive result.
export function patternSpecificity(pattern) {
  const glob = String(pattern).split(path.sep).join('/');
  const beforeWildcard = glob.split('*')[0];
  const literalSegments = beforeWildcard.split('/').filter(Boolean).length;
  const literalLength = glob.replace(/\*/g, '').length;
  return literalSegments * 10000 + literalLength;
}

/**
 * Resolve a file's architecture layer from ark.config.json layer glob patterns. When more
 * than one layer matches (overlapping globs, e.g. a facade split), the MOST SPECIFIC pattern
 * wins; ties break by declaration order (first wins). Order-independent for non-ambiguous
 * overlaps, so a config author can't silently break a facade by listing the catch-all first.
 *
 * A layer may also declare `exclude` globs. A file matching ANY exclude glob is NOT a
 * candidate for that layer even if a `patterns` glob matches — this lets a broad pattern
 * (e.g. `src/**​/domain/**`) carve out subtrees it should not govern (framework internals
 * like `**​/kernel/**`) without enumerating every include. Excluding a file from its layer
 * also removes it from that layer's rule and `forbiddenGlobals` enforcement, since both key
 * off this classification — which is exactly how a broad domain glob stops mis-flagging
 * `src/kernel/domain` as impure domain code. This is the single file→layer matcher shared by
 * the ark-check CI gate and the ark-mcp write gate, so `exclude` behaves identically in both.
 */
export function layerForFile(root, file, layers) {
  const abs = path.isAbsolute(file) ? file : path.resolve(root, file);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  let bestName;
  let bestScore = -1;
  for (const layer of layers ?? []) {
    if ((layer.exclude ?? []).some((pattern) => globToRegExp(pattern).test(rel))) {
      continue;
    }
    for (const pattern of layer.patterns ?? []) {
      if (globToRegExp(pattern).test(rel)) {
        const score = patternSpecificity(pattern);
        if (score > bestScore) {
          bestScore = score;
          bestName = layer.name;
        }
      }
    }
  }
  return bestName;
}

function normalizePrefix(prefix) {
  return prefix.endsWith('.') ? prefix : `${prefix}.`;
}

/**
 * Resolve an intent name to its layer using the SAME semantics as
 * ArchitectureProfile.resolveLayer in src/kernel/layers/ArchitectureProfile.ts (which the
 * ark-mcp write-gate uses via createArchitectureProfile): every prefix is normalized to a
 * trailing '.', and the layer whose matching prefix is longest wins — regardless of config
 * declaration order. Keeping ark-check on these exact rules is what makes the CI gate and
 * the write-path gate classify identically. `layers` is an array of { name, prefixes }.
 */
export function resolveIntentLayer(intent, layers) {
  const normalized = layers.map((layer) => ({
    name: layer.name,
    prefixes: (layer.prefixes ?? []).map(normalizePrefix),
  }));
  const sorted = [...normalized].sort((a, b) => {
    const maxA = Math.max(0, ...a.prefixes.map((p) => p.length));
    const maxB = Math.max(0, ...b.prefixes.map((p) => p.length));
    return maxB - maxA;
  });
  return sorted.find((layer) => layer.prefixes.some((prefix) => intent.startsWith(prefix)))?.name;
}

/**
 * Intent-name recognizer. Kept deliberately in sync with `looksLikeIntentName` in
 * src/kernel/ai-gate/AICodeGate.ts: the two live in separate layers on purpose — the
 * CLIs run standalone (with only `typescript` present, no build), so they must not
 * import from the compiled library. Update both if the layer prefixes change.
 */
const INTENT_NAME =
  /^(Domain|Application|Adapter|Workflow|Job|Presentation|Reporting|Metadata|Security|Audit|Observability|Kernel)\.[A-Za-z0-9_.]+$/;

export function looksLikeIntent(value) {
  return INTENT_NAME.test(value);
}

/**
 * Co-pilot Phase F — the work classifier. Every architecture violation is remediated in one of
 * three ways, and this is the TRUST BOUNDARY that decides what an agent may auto-apply:
 *
 *   - 'mechanical-safe' : behavior-preserving AND gate-verifiable → an agent may auto-apply it.
 *   - 'judgment'        : real coupling or a design choice → Ark PROPOSES it, a human decides.
 *   - 'deferred'        : not enough signal to place it → a human should look first.
 *
 * Deliberately biased toward 'judgment': a false 'mechanical-safe' that auto-lands a bad edit
 * is the failure mode that sinks trust, so only the provably-safe type-only move earns 'auto'.
 * Pure function of one violation object ({ ruleId, typeOnly, ... }) so the CLI, the MCP gate,
 * and (later) the apply-loop all classify identically. Returns { class, confidence, rationale }.
 */
export const REMEDIATION_CLASSES = ['mechanical-safe', 'judgment', 'deferred'];

export function classifyRemediation(violation) {
  const ruleId = violation?.ruleId;
  if (ruleId === 'LAYER_IMPORT_VIOLATION') {
    if (violation.typeOnly) {
      return {
        class: 'mechanical-safe',
        confidence: 0.9,
        rationale:
          'Type-only import (erased at runtime): move the type to the layer that owns it and re-export for back-compat. Behavior-preserving, and the gate verifies it.',
      };
    }
    return {
      class: 'judgment',
      confidence: 0.7,
      rationale:
        'Value import — real runtime coupling. Relocating it (e.g. a route reaching the DB → a repository) is a refactor whose organization is a human choice.',
    };
  }
  if (ruleId === 'FORBIDDEN_GLOBAL') {
    return {
      class: 'judgment',
      confidence: 0.8,
      rationale:
        'Ambient global in a pure layer: inject the capability through a port (Clock, Config, Http). Introducing the port is a design decision.',
    };
  }
  if (ruleId === 'CIRCULAR_DEPENDENCY') {
    return {
      class: 'judgment',
      confidence: 0.7,
      rationale: 'Dependency cycle: breaking it means deciding which side owns the shared abstraction.',
    };
  }
  if (typeof ruleId === 'string' && ruleId.length > 0) {
    return {
      class: 'judgment',
      confidence: 0.6,
      rationale: 'Needs a human decision on how to satisfy the contract without weakening the gate.',
    };
  }
  return {
    class: 'deferred',
    confidence: 0.3,
    rationale: 'Unrecognized violation shape — a human should look before anything is changed.',
  };
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

/** Workspace roots from package.json workspaces and pnpm-workspace.yaml (no YAML dependency). */
export function detectWorkspaces(root) {
  const dirs = new Set();
  const addGlob = (glob) => {
    if (typeof glob !== 'string') return;
    const beforeStar = glob.split('*')[0].replace(/\/+$/, '');
    if (beforeStar && beforeStar !== '.') dirs.add(normalizeRel(beforeStar));
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
  return [...dirs];
}

function isSourceFile(name) {
  return /\.(tsx?|jsx?|mjsx?|cjsx?|mts|cts)$/i.test(name);
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
 * Collect deterministic repo shape signals for architecture archetype scoring.
 * Vendor packages may appear in toolHints only — never as the primary label.
 */
export function collectRepoShapeSignals(root) {
  const pkg = readPackageJson(root);
  const workspaceDirs = detectWorkspaces(root);
  const workspaces = workspaceDirs.length > 0;
  const srcDirs = ['src', 'lib', 'api', 'packages', 'apps'].filter((d) =>
    fs.existsSync(path.join(root, d))
  );
  const scanRoots = srcDirs.length > 0 ? srcDirs.map((d) => path.join(root, d)) : [root];
  const sourceFiles = scanRoots.flatMap((dir) => walkSourceFiles(dir));
  const sourceFileCount = sourceFiles.length;
  const tinyTree = sourceFileCount < 3;

  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const hasUiFramework = Object.keys(deps).some((name) =>
    /^(react|react-dom|vue|svelte|preact|solid-js)$/i.test(name.split('/')[0])
  );
  const srcUiFiles = sourceFiles.filter((file) => {
    const rel = path.relative(root, file).split(path.sep).join('/');
    return rel.startsWith('src/') && /\.(tsx|jsx)$/i.test(file);
  });

  const topNames = new Set(srcDirs.flatMap((d) => listTopLevelDirNames(root, d)));
  // Framework / filename signals — strong enough that a tiny Nest starter is not a "prototype".
  const nestFramework =
    Object.keys(deps).some((name) => name.startsWith('@nestjs/')) ||
    sourceFiles.some((file) =>
      /\.(controller|module|service|guard|interceptor|pipe)\.ts$/i.test(file)
    );
  const nextFramework =
    Boolean(deps.next) ||
    sourceFiles.some((file) => {
      const rel = path.relative(root, file).split(path.sep).join('/');
      return (
        /(^|\/)next\.config\./.test(rel) ||
        /(^|\/)app\/.*\/page\.(t|j)sx?$/.test(rel) ||
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

  return {
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
    domain,
    application,
    domainHeavy,
    uiOnly,
    featureSlicedLayout,
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
  const confidence = Math.min(1, Math.max(0.1, rawConfidence * 0.7 + margin * 0.3));

  return {
    ranked: scored,
    archetype: top.id,
    label: top.label,
    preset: top.preset,
    confidence: Math.round(confidence * 1000) / 1000,
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

  return {
    ok: true,
    playbookVersion: playbook.version,
    archetype: result.archetype,
    label: result.label,
    preset: result.preset,
    confidence: result.confidence,
    phases: result.phases,
    adoptInOrder,
    analogy: result.analogy,
    antiPatterns: result.antiPatterns,
    books: result.books,
    why: whyFromMatchedSignals(signals, result.matched),
    matchedSignals: result.matched,
    runnerUp: result.runnerUp,
    toolHints: signals.toolHints,
    signals: {
      sourceFileCount: signals.sourceFileCount,
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
  { key: '8', archetype: 'auto', label: 'Analyze my repo and suggest (recommended if unsure)' },
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

/**
 * Deterministic fix-class labels for JSON output (English, shared with future skills).
 */
export function enrichViolationWithFixClass(violation) {
  const enriched = { ...violation };
  switch (violation.ruleId) {
    case 'LAYER_IMPORT_VIOLATION':
      if (violation.typeOnly) {
        enriched.fixClass = 'file-move';
        enriched.effort = 'small';
        enriched.enthusiastHint =
          'This is a type-only import — move the type to a layer both sides may share, or relocate the file to match its role.';
      } else {
        enriched.fixClass = 'port-inversion';
        enriched.effort = 'medium';
        enriched.enthusiastHint = `${violation.fromLayer ?? 'This layer'} must not import ${violation.toLayer ?? 'that layer'} directly. Define an interface (port) where you need the capability and inject the implementation from the outer layer.`;
      }
      break;
    case 'FORBIDDEN_GLOBAL':
      enriched.fixClass = 'inject-port';
      enriched.effort = 'small';
      enriched.enthusiastHint = `Do not call "${violation.target ?? 'that global'}" here. Pass the capability in through a small interface (for example a Clock, HttpPort, or Config provider).`;
      break;
    case 'RAW_EVENT_PUBLISH':
      enriched.fixClass = 'registered-intent';
      enriched.effort = 'small';
      enriched.enthusiastHint =
        'Register the event intent first, then publish through the creator returned by the registry — not a raw string or object.';
      break;
    case 'PUBLISH_MISSING_SOURCE':
      enriched.fixClass = 'add-source-metadata';
      enriched.effort = 'small';
      enriched.enthusiastHint =
        'Add metadata.source to the publish call so Ark knows which layer is publishing the event.';
      break;
    case 'PUBLISH_SOURCE_LAYER_MISMATCH':
      enriched.fixClass = 'fix-source-layer';
      enriched.effort = 'small';
      enriched.enthusiastHint =
        'Use a source intent that belongs to the same layer as this file, or move the publish call to the layer that owns the source.';
      break;
    case 'LAYER_INTENT_REFERENCE_VIOLATION':
      enriched.fixClass = 'intent-relocation';
      enriched.effort = 'small';
      enriched.enthusiastHint =
        'Reference that intent from a layer allowed to know about it — usually an adapter or application layer, not the domain core.';
      break;
    case 'CIRCULAR_DEPENDENCY':
      enriched.fixClass = 'break-cycle';
      enriched.effort = 'medium';
      enriched.enthusiastHint =
        'Two modules import each other in a loop. Extract shared code, invert one dependency behind a port, or merge them if they are really one unit.';
      break;
    default:
      enriched.fixClass = 'review-contract';
      enriched.effort = 'small';
      enriched.enthusiastHint =
        'Read the violation message and the layer rules in ark.config.json, then adjust imports or move code to the correct layer.';
  }
  return enriched;
}

export function formatArchitectureRecommendationHuman(recommendation) {
  const lines = [];
  lines.push('Ark architecture recommendation (application shape, not vendor stack)');
  lines.push('');
  lines.push(`Archetype: ${recommendation.archetype} — ${recommendation.label}`);
  lines.push(`Preset: ${recommendation.preset} (confidence ${recommendation.confidence})`);
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

const GALLERY_STARTER_BY_ARCHETYPE = {
  'crud-product': 'examples/crud-product-starter/',
  'api-backend': 'examples/api-backend-starter/',
  'worker-pipeline': 'examples/worker-pipeline-starter/',
  'multi-app-workspace': 'examples/multi-app-workspace-starter/',
};

/** Machine-readable adoption record for optional commit (Phase E). */
export function buildAdoptionPlanDocument(recommendation) {
  const preset = recommendation.preset;
  const policyPackId =
    preset === 'hexagonal' ||
    preset === 'layered' ||
    preset === 'feature-sliced' ||
    preset === 'monorepo'
      ? `enthusiast-${preset}`
      : null;

  return {
    version: '1',
    generatedAt: new Date().toISOString(),
    playbookVersion: recommendation.playbookVersion,
    archetype: recommendation.archetype,
    label: recommendation.label,
    preset: recommendation.preset,
    confidence: recommendation.confidence,
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
