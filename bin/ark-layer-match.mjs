/**
 * Pure layer-glob matching for ark.config.json.
 * Single source of truth for CLI (ark-shared / ark-check) and ESLint (bundled via import).
 * No Node I/O beyond path.sep normalization — pure string/path math only.
 */
import path from 'node:path';

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


/** Classify a project-relative path (posix) without needing an absolute root. */
export function layerForRelativePath(relPath, layers) {
  const rel = String(relPath).split(path.sep).join('/');
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

/** True when rules[] explicitly deny from→to. Missing rule = allowed (implicit). */
export function isEdgeDenied(rules, from, to) {
  if (from === to) return false;
  const hit = (rules ?? []).find((r) => r.from === from && r.to === to);
  return hit?.allowed === false;
}

/**
 * Codegen / generated source globs skipped by the default scan.
 * Universal (TanStack Router routeTree.gen, many `*.generated.ts` tools, etc.).
 * Opt out with `excludeGenerated: false` in ark.config.json; add more via top-level `exclude`.
 */
export const DEFAULT_GENERATED_FILE_GLOBS = [
  '**/*.gen.ts',
  '**/*.gen.tsx',
  '**/*.generated.ts',
  '**/*.generated.tsx',
];

/**
 * Globs that remove files from ark-check scan (cycles, layers, coverage).
 * @param {{ exclude?: string[], excludeGenerated?: boolean } | null | undefined} config
 */
export function scanExcludePatterns(config) {
  const custom = Array.isArray(config?.exclude) ? config.exclude.filter((p) => typeof p === 'string') : [];
  const generated =
    config?.excludeGenerated === false ? [] : DEFAULT_GENERATED_FILE_GLOBS;
  return [...generated, ...custom];
}

/** Relative path (posix) matches any scan-exclude glob. */
export function isScanExcludedRelative(relPath, config) {
  const rel = String(relPath).split(path.sep).join('/');
  return scanExcludePatterns(config).some((pattern) => globToRegExp(pattern).test(rel));
}
