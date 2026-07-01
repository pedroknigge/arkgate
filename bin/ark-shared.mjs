import path from 'node:path';

/**
 * Default layer rule matrix + intent-prefix map, shared by both CLIs and by the ark-mcp
 * write-path gate so they enforce identically. These mirror the elevenLayerProfile in
 * src/kernel/layers/ArchitectureProfile.ts; kept here (not imported from dist) because the
 * CLIs run standalone with only `typescript` present, no build step.
 */
export const DEFAULT_RULES = [
  { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
  { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
  { from: 'DomainModel', to: 'IntegrationAdapters', allowed: false },
  { from: 'DomainModel', to: 'WorkflowSagaEngine', allowed: false },
  { from: 'DomainModel', to: 'BackgroundJobsScheduling', allowed: false },
  { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
  { from: 'DomainModel', to: 'ReportingReadModels', allowed: false },
  { from: 'DomainModel', to: 'SecurityAuditObservability', allowed: false },
  { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
  { from: 'PersistenceAdapters', to: 'DomainModel', allowed: false },
  { from: 'IntegrationAdapters', to: 'ApplicationOrchestration', allowed: false },
  { from: 'IntegrationAdapters', to: 'DomainModel', allowed: false },
  { from: 'PresentationAdapters', to: 'PersistenceAdapters', allowed: false },
  { from: 'ReportingReadModels', to: 'PersistenceAdapters', allowed: false },
];

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
