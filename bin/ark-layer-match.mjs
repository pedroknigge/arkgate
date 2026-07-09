/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/layerMatch.ts
 * Regenerate: node scripts/generate-layer-match.mjs
 * Drift check: node scripts/generate-layer-match.mjs --check
 *
 * Pure layer-glob matching for ark.config.json (CLI load path).
 * CLI-only layerForFile (Node path resolution) is appended below the pure core.
 */

const regexpCache = new Map();
function escapeLiteral(ch) {
    return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}
/**
 * Normalize path separators to `/` without destroying glob escape sequences.
 * `src\domain\x` → `src/domain/x` (Windows paths); `src/\{legacy\}/**` keeps `\{` / `\}`.
 * A plain `pattern.split('\\').join('/')` would eat those escapes.
 */
function normalizeGlobSeparators(pattern) {
    let out = '';
    for (let i = 0; i < pattern.length; i += 1) {
        const c = pattern[i];
        if (c === '\\' && i + 1 < pattern.length) {
            const next = pattern[i + 1];
            // Keep escapes for glob metacharacters (and escaped backslash).
            if ('*?{}[],'.includes(next) || next === '\\') {
                out += '\\' + next;
                i += 1;
                continue;
            }
            // Otherwise treat `\` as a path separator (Windows).
            out += '/';
            continue;
        }
        out += c;
    }
    return out;
}
function bracesBalanced(glob) {
    let depth = 0;
    for (let i = 0; i < glob.length; i += 1) {
        const c = glob[i];
        if (c === '\\') {
            i += 1;
            continue;
        }
        if (c === '{')
            depth += 1;
        else if (c === '}') {
            depth -= 1;
            if (depth < 0)
                return false;
        }
    }
    return depth === 0;
}
export function globToRegExp(pattern) {
    const cached = regexpCache.get(pattern);
    if (cached)
        return cached;
    const glob = normalizeGlobSeparators(pattern);
    const useBraces = bracesBalanced(glob);
    let out = '';
    let braceDepth = 0;
    for (let i = 0; i < glob.length; i += 1) {
        const c = glob[i];
        if (c === '\\' && i + 1 < glob.length) {
            out += escapeLiteral(glob[i + 1]);
            i += 1;
        }
        else if (c === '*') {
            if (glob[i + 1] === '*') {
                if (glob[i + 2] === '/') {
                    out += '(?:.*/)?';
                    i += 2;
                }
                else {
                    out += '.*';
                    i += 1;
                }
            }
            else {
                out += '[^/]*';
            }
        }
        else if (c === '?') {
            out += '[^/]';
        }
        else if (c === '{' && useBraces) {
            out += '(?:';
            braceDepth += 1;
        }
        else if (c === '}' && useBraces && braceDepth > 0) {
            out += ')';
            braceDepth -= 1;
        }
        else if (c === ',' && useBraces && braceDepth > 0) {
            out += '|';
        }
        else {
            out += escapeLiteral(c);
        }
    }
    const re = new RegExp(`^${out}$`);
    regexpCache.set(pattern, re);
    return re;
}
export function patternSpecificity(pattern) {
    const glob = normalizeGlobSeparators(String(pattern));
    const beforeWildcard = glob.split('*')[0];
    const literalSegments = beforeWildcard.split('/').filter(Boolean).length;
    const literalLength = glob.replace(/\*/g, '').length;
    return literalSegments * 10000 + literalLength;
}
export function layerForRelativePath(relPath, layers) {
    // File paths (not globs): any OS separator → posix relative.
    const rel = String(relPath).split(/[/\\]/).join('/');
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
/**
 * Extract the slice id under a known folder name.
 * `src/features/auth/api.ts` + folders `["features"]` → `"auth"`.
 */
export function sliceIdForPath(relPath, sliceFolders) {
    if (!sliceFolders?.length)
        return undefined;
    const parts = String(relPath)
        .split(/[/\\]/)
        .filter(Boolean);
    const folders = new Set(sliceFolders.map((s) => String(s).toLowerCase()));
    for (let i = 0; i < parts.length - 1; i += 1) {
        if (folders.has(parts[i].toLowerCase())) {
            return parts[i + 1];
        }
    }
    return undefined;
}
/**
 * Infer slice parent folders from layer globs: the path segment immediately
 * before a `*` or `**` wildcard (e.g. `src/features/**` → `features`).
 */
export function inferSliceFoldersFromPatterns(patterns) {
    const out = new Set();
    for (const pattern of patterns ?? []) {
        const glob = normalizeGlobSeparators(String(pattern));
        const parts = glob.split('/').filter(Boolean);
        for (let i = 0; i < parts.length; i += 1) {
            const part = parts[i];
            if ((part === '**' || part === '*') && i > 0) {
                const prev = parts[i - 1];
                if (prev && !prev.includes('*') && !prev.includes('{') && !prev.includes('}')) {
                    out.add(prev);
                }
            }
        }
    }
    return [...out];
}
function resolveSliceFolders(rule, layerName, layers) {
    if (Array.isArray(rule.sliceFolders) && rule.sliceFolders.length > 0) {
        return rule.sliceFolders.filter((s) => typeof s === 'string' && s.length > 0);
    }
    const layer = (layers ?? []).find((l) => l.name === layerName);
    return inferSliceFoldersFromPatterns(layer?.patterns);
}
/**
 * Find the first denying rule for a layer edge.
 *
 * Semantics (locked):
 * - Classic (`allowed: false`, no peerIsolation): deny cross-layer edges only.
 *   Same-layer is always allowed (historical short-circuit).
 * - `peerIsolation: true` + `allowed: false`: deny only when importer and importee
 *   resolve to **different** slice ids (same or cross layer). Same-slice → allow.
 *   Missing paths or unclassifiable slices → fail-open (do not deny).
 */
export function findDeniedEdgeRule(rules, from, to, options) {
    for (const rule of rules ?? []) {
        if (rule.from !== from || rule.to !== to)
            continue;
        if (rule.allowed !== false)
            continue;
        if (rule.peerIsolation) {
            const fromPath = options?.fromPath;
            const toPath = options?.toPath;
            if (!fromPath || !toPath)
                continue;
            const folders = resolveSliceFolders(rule, from, options?.layers);
            if (folders.length === 0)
                continue;
            const fromSlice = sliceIdForPath(fromPath, folders);
            const toSlice = sliceIdForPath(toPath, folders);
            if (!fromSlice || !toSlice)
                continue;
            if (fromSlice !== toSlice)
                return rule;
            continue; // same slice: this peerIsolation rule does not deny
        }
        // Classic deny — same-layer always allowed without peerIsolation
        if (from === to)
            continue;
        return rule;
    }
    return undefined;
}
export function isEdgeDenied(rules, from, to, options) {
    return findDeniedEdgeRule(rules, from, to, options) !== undefined;
}
/** Codegen globs skipped by default scan (emitted into the CLI derived matcher). */
export const DEFAULT_GENERATED_FILE_GLOBS = [
    '**/*.gen.ts',
    '**/*.gen.tsx',
    '**/*.generated.ts',
    '**/*.generated.tsx',
];
export function scanExcludePatterns(config) {
    const custom = Array.isArray(config?.exclude)
        ? config.exclude.filter((p) => typeof p === 'string')
        : [];
    const generated = config?.excludeGenerated === false ? [] : DEFAULT_GENERATED_FILE_GLOBS;
    return [...generated, ...custom];
}
export function isScanExcludedRelative(relPath, config) {
    const rel = String(relPath).split(/[/\\]/).join('/');
    return scanExcludePatterns(config).some((pattern) => globToRegExp(pattern).test(rel));
}


import path from 'node:path';

/**
 * Resolve a file's architecture layer from ark.config.json layer glob patterns.
 * Uses Node path resolution, then the pure layerForRelativePath classifier.
 */
export function layerForFile(root, file, layers) {
  const abs = path.isAbsolute(file) ? file : path.resolve(root, file);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  return layerForRelativePath(rel, layers);
}
