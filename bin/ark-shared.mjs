import path from 'node:path';

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

export function createElevenLayerConfig(options = {}) {
  const rootDir = options.rootDir ?? 'src';
  const optional = options.optionalLayers ?? true;
  const prefix = rootDir === '.' ? '' : `${rootDir}/`;
  return {
    include: options.include ?? [rootDir],
    layers: DEFAULT_INTENT_PREFIXES.map((entry) => ({
      name: entry.layer,
      patterns: (DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? [entry.layer]).map(
        (directory) => `${prefix}${directory}/**`
      ),
      intentPrefixes: entry.prefixes,
      optional,
    })),
    rules: DEFAULT_RULES,
  };
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

/** Resolve a file's architecture layer from ark.config.json layer glob patterns. */
export function layerForFile(root, file, layers) {
  const abs = path.isAbsolute(file) ? file : path.resolve(root, file);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  for (const layer of layers ?? []) {
    for (const pattern of layer.patterns ?? []) {
      if (globToRegExp(pattern).test(rel)) return layer.name;
    }
  }
  return undefined;
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
