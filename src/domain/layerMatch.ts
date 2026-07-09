/**
 * Pure layer-glob matching for ark.config.json.
 * Single TypeScript source of truth for the library (eslint / kernel consumers).
 * CLI re-exports the identical algorithm from `bin/ark-layer-match.mjs` — keep in
 * lockstep via tests/unit/static-check/layerMatchParity.test.ts.
 */

export type LayerConfig = {
  name: string;
  patterns?: string[];
  exclude?: string[];
  forbiddenGlobals?: string[];
};

export type EdgeRule = { from: string; to: string; allowed?: boolean };

const regexpCache = new Map<string, RegExp>();

function escapeLiteral(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

function bracesBalanced(glob: string): boolean {
  let depth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '\\') {
      i += 1;
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

export function globToRegExp(pattern: string): RegExp {
  const cached = regexpCache.get(pattern);
  if (cached) return cached;

  const glob = pattern.split('\\').join('/');
  const useBraces = bracesBalanced(glob);
  let out = '';
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '\\' && i + 1 < glob.length) {
      out += escapeLiteral(glob[i + 1]);
      i += 1;
    } else if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
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
  regexpCache.set(pattern, re);
  return re;
}

export function patternSpecificity(pattern: string): number {
  const glob = String(pattern).split('\\').join('/');
  const beforeWildcard = glob.split('*')[0];
  const literalSegments = beforeWildcard.split('/').filter(Boolean).length;
  const literalLength = glob.replace(/\*/g, '').length;
  return literalSegments * 10000 + literalLength;
}

export function layerForRelativePath(
  relPath: string,
  layers: LayerConfig[] | undefined
): string | undefined {
  const rel = String(relPath).split('\\').join('/');
  let bestName: string | undefined;
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

export function isEdgeDenied(
  rules: EdgeRule[] | undefined,
  from: string,
  to: string
): boolean {
  if (from === to) return false;
  const hit = (rules ?? []).find((r) => r.from === from && r.to === to);
  return hit?.allowed === false;
}

/** Codegen globs skipped by default scan — keep in lockstep with bin/ark-layer-match.mjs. */
export const DEFAULT_GENERATED_FILE_GLOBS = [
  '**/*.gen.ts',
  '**/*.gen.tsx',
  '**/*.generated.ts',
  '**/*.generated.tsx',
];

export type ScanExcludeConfig = {
  exclude?: string[];
  excludeGenerated?: boolean;
};

export function scanExcludePatterns(config?: ScanExcludeConfig | null): string[] {
  const custom = Array.isArray(config?.exclude)
    ? config!.exclude!.filter((p) => typeof p === 'string')
    : [];
  const generated =
    config?.excludeGenerated === false ? [] : DEFAULT_GENERATED_FILE_GLOBS;
  return [...generated, ...custom];
}

export function isScanExcludedRelative(
  relPath: string,
  config?: ScanExcludeConfig | null
): boolean {
  const rel = String(relPath).split(/[/\\]/).join('/');
  return scanExcludePatterns(config).some((pattern) => globToRegExp(pattern).test(rel));
}
