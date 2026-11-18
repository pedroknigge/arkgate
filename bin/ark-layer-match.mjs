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

export function sharedImportsSliceMode(setting) {
    if (setting === 'deny' || setting === 'deny-cross-parent')
        return setting;
    if (setting !== null && typeof setting === 'object') {
        const mode = setting.mode;
        if (mode === 'deny-cross-parent')
            return mode;
    }
    return undefined;
}
export function sharedImportsSliceStopAt(setting) {
    if (setting === null || typeof setting !== 'object')
        return [];
    const stopAt = setting.stopAt;
    if (!Array.isArray(stopAt))
        return [];
    return stopAt.filter((entry) => typeof entry === 'string' && entry.length > 0);
}
const regexpCache = new Map();
function escapeLiteral(ch) {
    return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}
function normalizeGlobSeparators(pattern) {
    let out = '';
    for (let i = 0; i < pattern.length; i += 1) {
        const c = pattern[i];
        if (c === '\\' && i + 1 < pattern.length) {
            const next = pattern[i + 1];
            if ('*?{}[],'.includes(next) || next === '\\') {
                out += '\\' + next;
                i += 1;
                continue;
            }
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
function concreteGlobSegments(pattern) {
    const glob = normalizeGlobSeparators(String(pattern));
    return glob
        .split('/')
        .filter(Boolean)
        .filter((seg) => seg !== '**' &&
        seg !== '*' &&
        !seg.includes('*') &&
        !seg.includes('?') &&
        !seg.includes('{') &&
        !seg.includes('['));
}
export function patternSpecificity(pattern, relPath) {
    const glob = normalizeGlobSeparators(String(pattern));
    const concrete = concreteGlobSegments(glob);
    const literalLength = glob.replace(/\*/g, '').length;
    const base = concrete.length * 10000 + literalLength;
    if (relPath === undefined || relPath === null || relPath === '')
        return base;
    const pathParts = String(relPath)
        .split(/[/\\]/)
        .filter(Boolean);
    if (concrete.length === 0) {
        return literalLength;
    }
    let searchFrom = 0;
    let lastIdx = -1;
    for (const seg of concrete) {
        let found = -1;
        for (let i = searchFrom; i < pathParts.length; i += 1) {
            if (pathParts[i] === seg) {
                found = i;
                break;
            }
        }
        if (found < 0) {
            return base;
        }
        lastIdx = found;
        searchFrom = found + 1;
    }
    return (lastIdx + 1) * 1_000_000 + concrete.length * 10000 + literalLength;
}
export function matchingLayersForRelativePath(relPath, layers) {
    const rel = String(relPath).split(/[/\\]/).join('/');
    const byLayer = new Map();
    for (const layer of layers ?? []) {
        if ((layer.exclude ?? []).some((pattern) => globToRegExp(pattern).test(rel))) {
            continue;
        }
        for (const pattern of layer.patterns ?? []) {
            if (!globToRegExp(pattern).test(rel))
                continue;
            const score = patternSpecificity(pattern, rel);
            const prev = byLayer.get(layer.name);
            if (!prev || score > prev.score) {
                byLayer.set(layer.name, { layer: layer.name, pattern, score });
            }
        }
    }
    return [...byLayer.values()].sort((a, b) => b.score - a.score || a.layer.localeCompare(b.layer));
}
const NO_LAYERS = [];
const LAYER_CLASSIFICATION_TOKEN = Symbol('LayerClassification');
const TOOLING_CONFIG_BASENAME = /^[\w.-]+\.config\.[cm]?[jt]sx?$/i;
export function isToolingConfigPath(relPath) {
    const rel = normalizeRelPath(relPath);
    const base = rel.slice(rel.lastIndexOf('/') + 1);
    return TOOLING_CONFIG_BASENAME.test(base);
}
function normalizeRelPath(value) {
    return String(value).split(/[/\\]/).join('/').replace(/^\.\//, '').replace(/\/$/, '');
}
export function includeCoversWorkspace(include, workspace) {
    const root = normalizeRelPath(workspace);
    if (!root)
        return false;
    return (include ?? []).some((entry) => {
        const inc = normalizeRelPath(entry);
        return inc === '.' || inc === root || root.startsWith(`${inc}/`);
    });
}
export function dedupeIncludeEntries(include) {
    const norm = [
        ...new Set((include ?? []).map((entry) => normalizeRelPath(entry)).filter(Boolean)),
    ];
    return norm.filter((entry) => !norm.some((other) => other !== entry && entry.startsWith(`${other}/`)));
}
function directoryCatchAllPrefix(pattern) {
    const glob = normalizeGlobSeparators(pattern);
    if (glob === '**' || glob === '**/*')
        return '';
    if (glob.endsWith('/**/*'))
        return glob.slice(0, -5);
    if (glob.endsWith('/**'))
        return glob.slice(0, -3);
    return null;
}
function patternSubsumes(broader, narrower) {
    const prefix = directoryCatchAllPrefix(broader);
    if (prefix === null)
        return false;
    if (prefix === '')
        return true;
    const narrow = normalizeGlobSeparators(narrower);
    return narrow === prefix || narrow.startsWith(`${prefix}/`);
}
function isDeeperConcrete(broader, narrower) {
    const left = concreteGlobSegments(broader);
    const right = concreteGlobSegments(narrower);
    if (right.length <= left.length)
        return false;
    for (let i = 0; i < left.length; i += 1) {
        if (left[i] !== right[i])
            return false;
    }
    return true;
}
const catchAllOverlapCache = new WeakMap();
function catchAllOverlaps(layers) {
    const cached = catchAllOverlapCache.get(layers);
    if (cached)
        return cached;
    const found = [];
    const seen = new Set();
    for (const left of layers) {
        for (const right of layers) {
            if (left === right || left.name === right.name)
                continue;
            for (const broader of left.patterns ?? []) {
                if (directoryCatchAllPrefix(broader) === null)
                    continue;
                for (const narrower of right.patterns ?? []) {
                    if (!patternSubsumes(broader, narrower) || isDeeperConcrete(broader, narrower))
                        continue;
                    const leftKey = `${left.name}\0${broader}`;
                    const rightKey = `${right.name}\0${narrower}`;
                    const key = leftKey < rightKey ? `${leftKey}\0${rightKey}` : `${rightKey}\0${leftKey}`;
                    if (seen.has(key))
                        continue;
                    seen.add(key);
                    found.push({
                        catchAll: { layer: left.name, pattern: broader },
                        overlapped: { layer: right.name, pattern: narrower },
                    });
                }
            }
        }
    }
    catchAllOverlapCache.set(layers, found);
    return found;
}
function layerNamed(layers, name) {
    return layers.find((layer) => layer.name === name);
}
function layerPatternMatches(rel, layer, pattern) {
    if (!layer)
        return false;
    if ((layer.exclude ?? []).some((item) => globToRegExp(item).test(rel)))
        return false;
    return globToRegExp(pattern).test(rel);
}
function bestLayerName(rel, layers) {
    let bestName;
    let bestPattern = '';
    let bestScore = -1;
    for (const layer of layers) {
        if ((layer.exclude ?? []).some((pattern) => globToRegExp(pattern).test(rel)))
            continue;
        for (const pattern of layer.patterns ?? []) {
            if (!globToRegExp(pattern).test(rel))
                continue;
            const score = patternSpecificity(pattern, rel);
            if (score > bestScore) {
                bestScore = score;
                bestName = layer.name;
                bestPattern = pattern;
            }
        }
    }
    return bestName ? { layer: bestName, pattern: bestPattern } : undefined;
}
function classifyRelativePath(relPath, layers) {
    const rel = normalizeRelPath(relPath);
    if (isToolingConfigPath(rel))
        return { kind: 'tooling', path: rel };
    for (const pair of catchAllOverlaps(layers)) {
        const left = layerNamed(layers, pair.catchAll.layer);
        const right = layerNamed(layers, pair.overlapped.layer);
        if (layerPatternMatches(rel, left, pair.catchAll.pattern) &&
            layerPatternMatches(rel, right, pair.overlapped.pattern)) {
            return {
                kind: 'catch-all-overlap',
                path: rel,
                catchAll: pair.catchAll,
                overlapped: pair.overlapped,
            };
        }
    }
    const best = bestLayerName(rel, layers);
    if (!best)
        return { kind: 'unclassified', path: rel };
    const alsoMatched = matchingLayersForRelativePath(rel, layers)
        .map((hit) => hit.layer)
        .filter((name) => name !== best.layer);
    return { kind: 'source', path: rel, layer: best.layer, pattern: best.pattern, alsoMatched };
}
function exclusionFor(workspace, exclusions) {
    const root = normalizeRelPath(workspace);
    for (const entry of exclusions ?? []) {
        if (!entry || typeof entry.root !== 'string' || typeof entry.reason !== 'string')
            continue;
        if (normalizeRelPath(entry.root) !== root)
            continue;
        const reason = entry.reason.trim();
        if (reason.length > 0)
            return reason;
    }
    return undefined;
}
function catchAllMessage(pair) {
    const catchAll = pair.catchAll;
    const overlapped = pair.overlapped;
    return (`Catch-all ${catchAll.pattern} on ${catchAll.layer} overlaps ${overlapped.pattern} on ${overlapped.layer}. ` +
        `A catch-all may not overlap another layer. Remove ${catchAll.pattern} from ${catchAll.layer}, ` +
        `or give ${overlapped.layer} a deeper directory than ${catchAll.pattern}.`);
}
function workspaceOutMessage(root) {
    return (`${root} is a declared workspace and is not in include. Add "${root}" to include, ` +
        `or set workspaceExclusions to [{ "root": "${root}", "reason": "why it stays out" }].`);
}
export class LayerClassification {
    paths;
    workspaces;
    findings;
    constructor(token, paths, workspaces, findings) {
        if (token !== LAYER_CLASSIFICATION_TOKEN) {
            throw new Error('LayerClassification is only constructed by LayerClassification.resolve()');
        }
        this.paths = paths;
        this.workspaces = workspaces;
        this.findings = findings;
    }
    static resolve(input) {
        const layers = input.layers ?? NO_LAYERS;
        const include = input.include ?? [];
        const paths = input.files.map((file) => classifyRelativePath(file, layers));
        const findings = [];
        for (const pair of catchAllOverlaps(layers)) {
            const samples = paths
                .filter((row) => row.kind === 'catch-all-overlap' &&
                row.catchAll.pattern === pair.catchAll.pattern &&
                row.catchAll.layer === pair.catchAll.layer &&
                row.overlapped.pattern === pair.overlapped.pattern)
                .map((row) => row.path)
                .slice(0, 5);
            findings.push({
                ruleId: 'CONFIG_CATCH_ALL_OVERLAP',
                message: catchAllMessage(pair),
                extra: {
                    catchAll: pair.catchAll,
                    overlapped: pair.overlapped,
                    samples,
                },
            });
        }
        const workspaces = [];
        if (input.declaredWorkspaces) {
            const seen = new Set();
            for (const raw of input.declaredWorkspaces) {
                const root = normalizeRelPath(String(raw ?? ''));
                if (!root || seen.has(root))
                    continue;
                seen.add(root);
                const reason = exclusionFor(root, input.workspaceExclusions);
                if (reason) {
                    workspaces.push({ kind: 'excluded', root, reason });
                    continue;
                }
                if (includeCoversWorkspace(include, root)) {
                    workspaces.push({ kind: 'included', root });
                    continue;
                }
                workspaces.push({ kind: 'missing', root });
                findings.push({
                    ruleId: 'CONFIG_WORKSPACE_OUT_OF_INCLUDE',
                    message: workspaceOutMessage(root),
                    extra: { root },
                });
            }
        }
        const unclassified = paths.filter((row) => row.kind === 'unclassified').map((row) => row.path);
        if (unclassified.length > 0) {
            findings.push({
                ruleId: 'CONFIG_UNCLASSIFIED_FILES',
                message: `${unclassified.length} included source file(s) are not matched by any configured layer; ` +
                    'ark-check will not enforce import rules for those source files.',
                extra: { count: unclassified.length, samples: unclassified.slice(0, 5) },
            });
        }
        return new LayerClassification(LAYER_CLASSIFICATION_TOKEN, paths, workspaces, findings);
    }
}
export function layerForRelativePath(relPath, layers) {
    const row = classifyRelativePath(relPath, layers ?? NO_LAYERS);
    return row.kind === 'source' ? row.layer : undefined;
}
export function classificationAccountsForPath(relPath, layers) {
    return classifyRelativePath(relPath, layers ?? NO_LAYERS).kind !== 'unclassified';
}
export function sliceIdForPath(relPath, sliceFolders, sliceIdentity) {
    return sliceIdWithBinding(relPath, sliceFolders, sliceIdentity === 'stars' ? 'stars' : 'path');
}
export function legacyStarsSliceIdForPath(relPath, sliceFolders) {
    return sliceIdWithBinding(relPath, sliceFolders ? [...sliceFolders] : undefined, LEGACY_STARS);
}
const LEGACY_STARS = 'stars-4.8.23';
function sliceIdWithBinding(relPath, sliceFolders, identity) {
    if (!sliceFolders?.length)
        return undefined;
    const parts = String(relPath)
        .split(/[/\\]/)
        .filter(Boolean);
    if (parts.length === 0)
        return undefined;
    const bare = new Set();
    for (const raw of sliceFolders) {
        if (typeof raw !== 'string' || raw.length === 0)
            continue;
        const entry = parsedSliceFolder(raw);
        if (entry.anchored) {
            const anchored = anchoredSliceIdFromPattern(parts, entry.anchored, identity);
            if (anchored)
                return anchored;
            continue;
        }
        if (entry.bare !== undefined)
            bare.add(entry.bare);
    }
    return bareSliceId(parts, bare);
}
const parsedSliceFolders = new Map();
function parsedSliceFolder(raw) {
    const cached = parsedSliceFolders.get(raw);
    if (cached)
        return cached;
    let parsed = {};
    if (isAnchoredSliceEntry(raw)) {
        parsed = { anchored: anchoredSlicePattern(raw) };
    }
    else if (!raw.includes('/') && !raw.includes('\\') && !raw.includes('*')) {
        parsed = { bare: raw.toLowerCase() };
    }
    if (parsedSliceFolders.size >= 1024)
        parsedSliceFolders.clear();
    parsedSliceFolders.set(raw, parsed);
    return parsed;
}
function isAnchoredSliceEntry(entry) {
    const segments = entry.split(/[/\\]/).filter((part) => part.length > 0);
    if (segments.length < 2)
        return false;
    if (segments[0] === '*' || segments[0] === '**')
        return false;
    return segments.some((part) => part === '*');
}
function anchoredSlicePattern(raw) {
    return raw
        .split(/[/\\]/)
        .filter((part) => part.length > 0)
        .map((part) => part.toLowerCase());
}
function anchoredSliceIdFromPattern(parts, pattern, identity) {
    const offsets = anchorOffsets(parts, pattern[0] ?? '');
    for (const offset of offsets) {
        const id = bindAnchoredSlice(parts, pattern, offset, identity);
        if (id)
            return id;
    }
    return undefined;
}
function bindAnchoredSlice(parts, pattern, offset, identity = 'path') {
    const bound = [];
    const fromStar = [];
    let lastLiteralAt = -1;
    let index = offset;
    for (let pi = 0; pi < pattern.length; pi += 1) {
        const segment = pattern[pi];
        if (segment === '*') {
            if (index >= parts.length - 1) {
                for (let rest = pi; rest < pattern.length; rest += 1) {
                    if (pattern[rest] !== '*')
                        return undefined;
                }
                break;
            }
            bound.push(parts[index].toLowerCase());
            fromStar.push(true);
            index += 1;
            continue;
        }
        if (segment === '**' || index >= parts.length)
            return undefined;
        if (parts[index].toLowerCase() !== segment)
            return undefined;
        bound.push(parts[index].toLowerCase());
        fromStar.push(false);
        lastLiteralAt = bound.length - 1;
        index += 1;
    }
    if (bound.length === 0)
        return undefined;
    if (identity === LEGACY_STARS) {
        if (lastLiteralAt < 0)
            return undefined;
        return bound.slice(lastLiteralAt).join('/');
    }
    if (identity === 'stars') {
        if (lastLiteralAt < 0)
            return undefined;
        return bound.filter((_, at) => at >= lastLiteralAt || fromStar[at]).join('/');
    }
    return bound.join('/');
}
function starsKeptSegmentIndexes(segments) {
    let lastLiteral = -1;
    for (let at = 0; at < segments.length; at += 1) {
        if (segments[at] !== '*')
            lastLiteral = at;
    }
    if (lastLiteral < 0)
        return null;
    const kept = [];
    for (let at = 0; at < segments.length; at += 1) {
        if (at >= lastLiteral || segments[at] === '*')
            kept.push(at);
    }
    return kept;
}
export function sliceIdentityCollisions(rules) {
    const out = [];
    for (const rule of rules ?? []) {
        if (!rule || rule.sliceIdentity !== 'stars')
            continue;
        const groups = new Map();
        const seen = new Map();
        for (const raw of rule.sliceFolders ?? []) {
            if (typeof raw !== 'string' || raw.length === 0)
                continue;
            const stem = starsIdentityStem(raw);
            if (!stem)
                continue;
            const key = raw.split(/[/\\]/).filter((part) => part.length > 0).join('/').toLowerCase();
            const groupSeen = seen.get(stem) ?? new Set();
            if (groupSeen.has(key))
                continue;
            groupSeen.add(key);
            seen.set(stem, groupSeen);
            const paths = groups.get(stem) ?? [];
            paths.push(raw);
            groups.set(stem, paths);
        }
        for (const [stem, paths] of groups) {
            if (paths.length < 2)
                continue;
            out.push({
                from: rule.from,
                to: rule.to,
                stem,
                paths,
                message: formatSliceIdentityCollision(rule.from, rule.to, paths, stem),
            });
        }
    }
    return out;
}
function starsIdentityStem(raw) {
    if (!isAnchoredSliceEntry(raw))
        return undefined;
    const segments = raw
        .split(/[/\\]/)
        .filter((part) => part.length > 0)
        .map((part) => part.toLowerCase());
    if (segments.some((part) => part === '**'))
        return undefined;
    const kept = starsKeptSegmentIndexes(segments);
    if (!kept)
        return undefined;
    return kept.map((at) => segments[at]).join('/');
}
function formatSliceIdentityCollision(from, to, paths, stem) {
    const named = paths.length === 2
        ? `${paths[0]} and ${paths[1]}`
        : `${paths.slice(0, -1).join(', ')}, and ${paths[paths.length - 1]}`;
    return `${from} → ${to}: sliceIdentity "stars" gives one slice id to ${named}. They bind as ${stem}.`;
}
function bareSliceId(parts, names) {
    if (names.size === 0)
        return undefined;
    for (let i = 0; i < parts.length - 1; i += 1) {
        if (!names.has(parts[i].toLowerCase()))
            continue;
        if (i + 1 >= parts.length - 1)
            continue;
        return `${parts[i].toLowerCase()}/${parts[i + 1].toLowerCase()}`;
    }
    return undefined;
}
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
function normalizeSegments(value) {
    return String(value)
        .split(/[/\\]/)
        .filter((part) => Boolean(part) && part !== '.')
        .map((part) => part.toLowerCase());
}
function trimTrailingSlashes(value) {
    let end = value.length;
    while (end > 0 && value[end - 1] === '/')
        end -= 1;
    return value.slice(0, end);
}
const SHARED_ROOT_SOURCE_PREFIXES = ['src', 'app'];
function anchorOffsets(parts, rootHead) {
    const head = (parts[0] ?? '').toLowerCase();
    const root = rootHead.toLowerCase();
    return SHARED_ROOT_SOURCE_PREFIXES.includes(head) && root !== head ? [0, 1] : [0];
}
function isBlanketRoot(raw) {
    const trimmed = trimTrailingSlashes(raw.replace(/^[./]+/, ''));
    return trimmed === '*' || trimmed === '**';
}
export function pathUnderSharedRoot(relPath, sharedRoots) {
    if (!relPath || !sharedRoots?.length)
        return false;
    const rel = String(relPath).split(/[/\\]/).join('/');
    const lowerRel = rel.toLowerCase();
    const parts = normalizeSegments(rel);
    for (const raw of sharedRoots) {
        if (typeof raw !== 'string' || raw.length === 0)
            continue;
        if (isBlanketRoot(raw))
            continue;
        if (raw.includes('*')) {
            const glob = trimTrailingSlashes(raw.toLowerCase());
            if (globToRegExp(glob).test(lowerRel) || globToRegExp(`${glob}/**`).test(lowerRel)) {
                return true;
            }
            continue;
        }
        const root = normalizeSegments(raw);
        if (root.length === 0)
            continue;
        const offsets = anchorOffsets(parts, root[0] ?? '');
        for (const offset of offsets) {
            if (offset + root.length > parts.length)
                continue;
            let hit = true;
            for (let j = 0; j < root.length; j += 1) {
                if (parts[offset + j] !== root[j]) {
                    hit = false;
                    break;
                }
            }
            if (hit)
                return true;
        }
    }
    return false;
}
function sliceMatchesDeclaration(declared, sliceId) {
    const want = String(declared).split(/[/\\]/).filter(Boolean).join('/').toLowerCase();
    if (!want)
        return false;
    const have = sliceId.toLowerCase();
    if (want === have)
        return true;
    return !want.includes('/') && have.endsWith(`/${want}`);
}
export function crossSliceEdgeAllowed(allowedCrossSlice, fromSlice, toSlice) {
    if (!allowedCrossSlice?.length || !fromSlice || !toSlice)
        return false;
    return allowedCrossSlice.some((edge) => edge &&
        typeof edge.from === 'string' &&
        typeof edge.to === 'string' &&
        sliceMatchesDeclaration(edge.from, fromSlice) &&
        sliceMatchesDeclaration(edge.to, toSlice));
}
export function peerIsolationDecision(input) {
    if (!input.fromPath)
        return { denied: true, reason: 'missing-path' };
    if (input.folderCount <= 0)
        return { denied: true, reason: 'no-slice-folders' };
    const fromClassified = Boolean(input.fromSlice) || input.fromShared === true;
    if (!input.toPath) {
        if (!fromClassified)
            return { denied: true, reason: 'unclassifiable-path' };
        if (!input.fromSlice)
            return { denied: false };
        return { denied: true, reason: 'missing-path' };
    }
    const toClassified = Boolean(input.toSlice) || input.toShared === true;
    if (!fromClassified || !toClassified)
        return { denied: true, reason: 'unclassifiable-path' };
    if (input.sharedImportsSlice === 'deny' &&
        input.fromShared === true &&
        Boolean(input.toSlice) &&
        !input.fromSlice) {
        return { denied: true, reason: 'shared-imports-slice' };
    }
    if (!input.fromSlice || !input.toSlice)
        return { denied: false };
    if (input.fromSlice === input.toSlice)
        return { denied: false };
    if (input.crossSliceAllowed)
        return { denied: false };
    return { denied: true, reason: 'cross-slice' };
}
export function peerIsolationMustDeny(input) {
    return peerIsolationDecision(input).denied;
}
export const SLICE_ALIAS_DEBT = 'Aliases are an owed move, not a destination. These files are not finished.';
const PINNED_ALIAS_NOTE = 'Pinned aliases stay where they are. They are not an owed move.';
function aliasGlobPattern(glob) {
    return trimTrailingSlashes(glob.trim().replace(/\\/g, '/')).toLowerCase();
}
function aliasGlobMatches(glob, relPath) {
    const pattern = aliasGlobPattern(glob);
    if (!pattern || pattern === '*' || pattern === '**')
        return false;
    const file = String(relPath).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    const rooted = stripSrcOrApp(file);
    const re = globToRegExp(pattern);
    const last = pattern.split('/').pop() ?? '';
    const under = last.includes('*') ? null : globToRegExp(`${pattern}/**`);
    const hit = (candidate) => re.test(candidate) || (under !== null && under.test(candidate));
    return hit(file) || (rooted !== file && hit(rooted));
}
export function pathMatchesSharedWalkStop(relPath, stopAt) {
    if (!relPath || !stopAt?.length)
        return false;
    if (pathUnderSharedRoot(relPath, [...stopAt]))
        return true;
    return stopAt.some((glob) => typeof glob === 'string' && aliasGlobMatches(glob, relPath));
}
function splitAliasTarget(to) {
    const parts = aliasGlobPattern(to).split('/').filter(Boolean);
    if (parts.length < 2 || parts.some((part) => part.includes('*') || part === '.' || part === '..')) {
        return null;
    }
    return { universeId: parts.slice(0, -1).join('/'), childId: parts.join('/') };
}
function firstSliceAliasEntry(relPath, rule) {
    for (const alias of rule.childSlices?.sliceAliases ?? []) {
        if (!alias || typeof alias.from !== 'string' || typeof alias.to !== 'string')
            continue;
        if (aliasGlobMatches(alias.from, relPath))
            return alias;
    }
    return null;
}
function firstSliceAlias(relPath, rule) {
    const alias = firstSliceAliasEntry(relPath, rule);
    return alias ? splitAliasTarget(alias.to) : null;
}
export function resolveGovernedSlice(relPath, rule, sliceFolders) {
    if (!relPath)
        return {};
    const folders = sliceFolders ?? rule.sliceFolders;
    const universeId = sliceIdForPath(relPath, folders ? [...folders] : undefined, rule.sliceIdentity);
    const resolved = resolveChildSliceId(relPath, universeId, rule.childSlices);
    if (universeId || resolved.childId || resolved.mismatched) {
        return resolved.childId ? { universeId, childId: resolved.childId } : { universeId };
    }
    const alias = firstSliceAlias(relPath, rule);
    return alias ? { universeId: alias.universeId, childId: alias.childId } : {};
}
function starsUniverseShapes(folders) {
    const shapes = [];
    for (const raw of folders ?? []) {
        if (typeof raw !== 'string' || raw.length === 0)
            continue;
        const segments = raw.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
        if (segments.length === 1 && segments[0] && !segments[0].includes('*')) {
            shapes.push({ literals: [segments[0], null], legacy: [segments[0], null] });
            continue;
        }
        if (segments.some((part) => part === '**' || (part.includes('*') && part !== '*')))
            continue;
        const kept = starsKeptSegmentIndexes(segments);
        if (!kept || !segments.includes('*'))
            continue;
        const star = (part) => (part === '*' ? null : part);
        const lastLiteral = kept.find((at) => segments[at] !== '*') ?? 0;
        shapes.push({
            literals: kept.map((at) => star(segments[at] ?? '')),
            legacy: segments.slice(lastLiteral).map(star),
        });
    }
    return shapes;
}
function literalsMatch(shape, parts) {
    return (shape.length === parts.length &&
        shape.every((literal, at) => literal === null || parts[at] === '*' || literal === parts[at]));
}
function legacyStarsIdTargets(folders, id) {
    const parts = id.split('/').filter(Boolean).map((part) => part.toLowerCase());
    const shapes = starsUniverseShapes(folders);
    if (parts.length === 0 || shapes.some((shape) => literalsMatch(shape.literals, parts)))
        return [];
    const targets = new Set();
    for (const shape of shapes) {
        if (shape.legacy.length === shape.literals.length)
            continue;
        if (literalsMatch(shape.legacy, parts)) {
            const tail = [...parts];
            const lead = shape.literals.length - shape.legacy.length;
            targets.add([...shape.literals.slice(0, lead).map(() => '*'), ...tail].join('/'));
        }
    }
    return [...targets].sort();
}
function legacyAliasUniverse(rule, to) {
    if (rule.sliceIdentity !== 'stars')
        return undefined;
    const target = splitAliasTarget(to);
    if (!target)
        return undefined;
    return legacyStarsIdTargets(rule.sliceFolders, target.universeId).length === 1
        ? target.universeId
        : undefined;
}
function placeForPair(relPath, rule, folders) {
    const place = resolveGovernedSlice(relPath, rule, folders);
    if (!relPath || rule.sliceIdentity !== 'stars')
        return place;
    if (place.universeId) {
        const alias = firstSliceAliasEntry(relPath, rule);
        const fromFolders = sliceIdForPath(relPath, [...folders], rule.sliceIdentity);
        if (!fromFolders && alias && legacyAliasUniverse(rule, alias.to) !== undefined) {
            return { ...place, legacyAlias: true, legacyUniverse: place.universeId, legacyChild: place.childId };
        }
        const legacyUniverse = legacyStarsSliceIdForPath(relPath, folders);
        const child = rule.childSlices;
        const legacyChild = child?.sliceIdentity === 'stars' ? legacyStarsSliceIdForPath(relPath, child.sliceFolders) : undefined;
        return {
            ...place,
            ...(legacyUniverse ? { legacyUniverse } : {}),
            ...(legacyChild && place.childId ? { legacyChild } : {}),
        };
    }
    return place;
}
export function resolveGovernedSlicePair(rule, folders, fromPath, toPath) {
    const from = placeForPair(fromPath, rule, folders);
    const to = placeForPair(toPath, rule, folders);
    const legacyFrom = from.legacyUniverse;
    const legacyTo = to.legacyUniverse;
    const adopt = (alias, other) => {
        if (!alias.legacyAlias || other.legacyAlias || !other.universeId)
            return alias;
        if (other.legacyUniverse?.toLowerCase() !== alias.universeId?.toLowerCase())
            return alias;
        const childSegment = alias.childId?.split('/').pop();
        return {
            ...alias,
            universeId: other.universeId,
            ...(childSegment ? { childId: `${other.universeId}/${childSegment}` } : {}),
        };
    };
    const fromPlace = adopt(from, to);
    const toPlace = adopt(to, from);
    const crossSliceAllowed = crossSliceEdgeAllowed(rule.allowedCrossSlice, fromPlace.universeId, toPlace.universeId) ||
        (rule.sliceIdentity === 'stars' &&
            (legacyFrom !== fromPlace.universeId || legacyTo !== toPlace.universeId) &&
            crossSliceEdgeAllowed(rule.allowedCrossSlice, legacyFrom, legacyTo));
    const legacyChildAllowed = rule.childSlices?.sliceIdentity === 'stars' &&
        from.legacyChild !== undefined &&
        to.legacyChild !== undefined &&
        from.legacyChild !== to.legacyChild &&
        childCrossSliceAllowed(rule.childSlices.allowedCrossSlice, from.legacyChild, to.legacyChild);
    const strip = (place) => ({
        ...(place.universeId ? { universeId: place.universeId } : {}),
        ...(place.childId ? { childId: place.childId } : {}),
    });
    return { from: strip(fromPlace), to: strip(toPlace), crossSliceAllowed, legacyChildAllowed };
}
function childPatternDirectory(pattern, childId, identity) {
    const segments = pattern.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
    const idParts = childId.split('/').filter(Boolean).map((part) => part.toLowerCase());
    if (segments.length === 0 || idParts.length === 0)
        return null;
    if (segments.some((part) => part === '**' || (part.includes('*') && part !== '*')))
        return null;
    if (identity === 'stars') {
        const kept = starsKeptSegmentIndexes(segments);
        if (!kept || kept.length !== idParts.length)
            return null;
        const dir = [...segments];
        for (let index = 0; index < kept.length; index += 1) {
            const at = kept[index] ?? 0;
            if (segments[at] !== '*' && segments[at] !== idParts[index])
                return null;
            dir[at] = idParts[index] ?? '';
        }
        return dir.join('/');
    }
    if (segments.length !== idParts.length)
        return null;
    for (let index = 0; index < segments.length; index += 1) {
        if (segments[index] === '*')
            continue;
        if (segments[index] !== idParts[index])
            return null;
    }
    return idParts.join('/');
}
function sharedDirectoryPrefix(file, dir) {
    const left = stripSrcOrApp(file.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()).split('/');
    const right = dir.split('/');
    let count = 0;
    while (count < left.length && count < right.length && left[count] === right[count])
        count += 1;
    return count;
}
function withSourcePrefix(file, dir) {
    const norm = file.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    if (norm.startsWith('src/') && !dir.startsWith('src/'))
        return `src/${dir}`;
    if (norm.startsWith('app/') && !dir.startsWith('app/'))
        return `app/${dir}`;
    return dir;
}
export function sliceAliasDestination(file, childId, child) {
    let best = null;
    for (const pattern of child.sliceFolders) {
        if (typeof pattern !== 'string')
            continue;
        const dir = childPatternDirectory(pattern, childId, child.sliceIdentity);
        if (!dir)
            continue;
        const score = sharedDirectoryPrefix(file, dir);
        if (!best || score > best.score || (score === best.score && dir.length < best.dir.length)) {
            best = { dir, score };
        }
    }
    return best ? withSourcePrefix(file, best.dir) : '';
}
export function anySliceAlias(rules) {
    return (rules ?? []).some((rule) => (rule?.childSlices?.sliceAliases?.length ?? 0) > 0);
}
export function sliceAliasOwesMove(rules) {
    return (rules ?? []).some((rule) => (rule?.childSlices?.sliceAliases ?? []).some((alias) => alias?.pinned !== true));
}
const SLICE_RULE_LAYER_TOKEN = '<Layer>';
function sliceRuleFileName(pattern, layer) {
    const token = SLICE_RULE_LAYER_TOKEN;
    if (!pattern.includes(token) || pattern.split(token).length !== 2)
        return null;
    if (/[*\\/]/.test(pattern))
        return null;
    const name = pattern.replace(token, layer);
    if (!name || name.includes('..'))
        return null;
    return name;
}
export function resolveSliceRulePlan(input) {
    const layers = [...new Set(input.layers.filter((name) => typeof name === 'string' && name.length > 0))].sort();
    const entries = [];
    const seen = new Set();
    for (const rule of input.rules ?? []) {
        const child = rule?.childSlices;
        const pattern = child?.arkRulesFile;
        if (!child || typeof pattern !== 'string')
            continue;
        const roots = new Map();
        for (const file of input.files) {
            if (typeof file !== 'string' || file.length === 0)
                continue;
            const universeId = rule.sliceFolders?.length
                ? sliceIdForPath(file, rule.sliceFolders, rule.sliceIdentity)
                : undefined;
            const resolved = resolveChildSliceId(file, universeId, child);
            if (!resolved.childId || roots.has(resolved.childId))
                continue;
            const root = sliceAliasDestination(file, resolved.childId, child);
            if (root)
                roots.set(resolved.childId, root);
        }
        for (const [childId, sliceRoot] of [...roots.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
            for (const layer of layers) {
                const name = sliceRuleFileName(pattern, layer);
                if (!name)
                    continue;
                const rel = `${sliceRoot}/${name}`.replace(/\\/g, '/');
                if (seen.has(`${layer}\0${rel}`))
                    continue;
                seen.add(`${layer}\0${rel}`);
                entries.push({
                    path: rel,
                    childId,
                    layer,
                    defaultAppliesTo: [`${sliceRoot}/**`],
                });
            }
        }
    }
    return entries;
}
export function sliceRuleIdsForFile(filePath, rules, catalog) {
    const childIds = new Set();
    for (const rule of rules ?? []) {
        if (!rule?.childSlices)
            continue;
        const universeId = rule.sliceFolders?.length
            ? sliceIdForPath(filePath, rule.sliceFolders, rule.sliceIdentity)
            : undefined;
        const resolved = resolveChildSliceId(filePath, universeId, rule.childSlices);
        if (resolved.childId)
            childIds.add(resolved.childId);
    }
    return catalog
        .filter((row) => typeof row.childId === 'string' && childIds.has(row.childId))
        .map((row) => row.id)
        .sort();
}
export function sliceAliasReport(rules, files) {
    if (!anySliceAlias(rules))
        return null;
    const moves = new Map();
    const pinned = new Map();
    for (const rule of rules ?? []) {
        const child = rule?.childSlices;
        if (!child?.sliceAliases)
            continue;
        for (const alias of child.sliceAliases) {
            if (!alias || typeof alias.from !== 'string' || typeof alias.to !== 'string')
                continue;
            const key = `${aliasGlobPattern(alias.from)}\0${aliasGlobPattern(alias.to)}`;
            const bucket = alias.pinned === true ? pinned : moves;
            let move = bucket.get(key);
            if (!move) {
                move = {
                    from: alias.from,
                    to: alias.to,
                    destination: '',
                    files: [],
                    ...(alias.pinned === true && typeof alias.reason === 'string' && alias.reason.length > 0
                        ? { reason: alias.reason }
                        : {}),
                };
                bucket.set(key, move);
            }
            const seen = new Set(move.files);
            for (const file of files) {
                if (typeof file !== 'string' || !aliasGlobMatches(alias.from, file) || seen.has(file))
                    continue;
                seen.add(file);
                move.files.push(file);
                if (!move.destination)
                    move.destination = sliceAliasDestination(file, alias.to, child);
            }
        }
    }
    const universes = knownUniverseIds(rules, files);
    const decorate = (move) => {
        const target = splitAliasTarget(move.to);
        const unknown = universes !== null && target !== null && !universes.has(target.universeId);
        return {
            ...move,
            files: [...move.files].sort(),
            ...(unknown
                ? {
                    unknownUniverse: true,
                    advisory: `alias target ${move.to} names universe ${target.universeId}, which no file belongs to. Check for a typo.`,
                }
                : {}),
        };
    };
    const listed = [...moves.values()].map((move) => decorate(move));
    const pinnedListed = [...pinned.values()].map((move) => decorate(move));
    const byAlias = (left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to);
    listed.sort(byAlias);
    pinnedListed.sort(byAlias);
    return {
        notAScore: true,
        finished: false,
        debt: listed.length > 0 ? SLICE_ALIAS_DEBT : PINNED_ALIAS_NOTE,
        moves: listed,
        ...(pinnedListed.length > 0 ? { pinned: pinnedListed } : {}),
    };
}
function knownUniverseIds(rules, files) {
    const ids = new Set();
    for (const rule of rules ?? []) {
        if (!rule?.childSlices?.sliceAliases?.length)
            continue;
        if (!rule.sliceFolders?.length)
            return null;
        for (const file of files) {
            if (typeof file !== 'string')
                continue;
            const id = sliceIdForPath(file, rule.sliceFolders, rule.sliceIdentity);
            if (id)
                ids.add(id.toLowerCase());
        }
    }
    return ids;
}
export function peerIsolationDenyExplanation(reason, context) {
    switch (reason) {
        case 'cross-slice':
            return `cross-slice edge ${context.fromSlice ?? '?'} → ${context.toSlice ?? '?'}. Extract the shared code, use events/ports across slices, or declare the edge in the rule's allowedCrossSlice.`;
        case 'shared-imports-slice':
            return `shared root imports slice ${context.toSlice ?? '?'} (${context.fromPath ?? '?'} → ${context.toPath ?? '?'}). The wall is direct-only.`;
        case 'unclassifiable-path': {
            const unplaced = [
                context.fromSlice ? undefined : context.fromPath,
                context.toSlice ? undefined : context.toPath,
            ].filter((path) => Boolean(path));
            const which = unplaced.length > 0 ? ` (${unplaced.join(', ')})` : '';
            return `unclassifiable path${which} — ArkGate cannot place it in a slice, so it cannot prove this is not a cross-slice edge. Move it into a slice, or declare its root in the rule's sharedRoots.`;
        }
        case 'no-slice-folders':
            return 'no slice folders — peerIsolation is on but no slice folder resolves from the rule or the layer patterns. Set sliceFolders on the rule.';
        case 'missing-path':
        default:
            return 'no path evidence for this edge — peerIsolation needs the importer and importee paths.';
    }
}
function crossParentExplanation(fromSlice, toSlice) {
    return `cross-parent slice ${fromSlice ?? '?'} → ${toSlice ?? '?'}. The child wall cannot allow another universe.`;
}
function crossSiblingExplanation(fromChild, toChild, universe) {
    return `cross-sibling slice ${fromChild} → ${toChild} inside ${universe}.`;
}
function parentImportsChildExplanation(toChild) {
    return `universe common imports child ${toChild}. parentMayImportChild is off.`;
}
export function universePairLabel(sliceId) {
    if (!sliceId)
        return undefined;
    const parts = sliceId.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : undefined;
}
function isCommonFolderName(segment, commonFolders) {
    if (!segment || !commonFolders?.length)
        return false;
    const want = segment.toLowerCase();
    return commonFolders.some((raw) => typeof raw === 'string' && raw.length > 0 && raw.toLowerCase() === want);
}
function resolveChildSliceId(relPath, universeId, child) {
    if (!relPath || !child?.sliceFolders?.length)
        return {};
    const raw = sliceIdForPath(relPath, child.sliceFolders, child.sliceIdentity);
    if (!raw || !universeId)
        return {};
    const childKey = raw.toLowerCase();
    const universeKey = universeId.toLowerCase();
    if (childKey === universeKey)
        return {};
    if (!childKey.startsWith(`${universeKey}/`))
        return { mismatched: { childId: raw, universeId } };
    const firstChildSegment = childKey.slice(universeKey.length + 1).split('/')[0];
    if (isCommonFolderName(firstChildSegment, child.commonFolders))
        return {};
    return { childId: raw };
}
function siblingEntryKey(entry) {
    return trimTrailingSlashes(entry.trim().replace(/\\/g, '/')).toLowerCase();
}
function stripSrcOrApp(value) {
    return value.replace(/^(?:src|app)\//, '');
}
function pathUnderSubtree(filePath, entry) {
    const file = filePath.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    const prefix = stripSrcOrApp(entry);
    if (!prefix)
        return false;
    const rooted = stripSrcOrApp(file);
    return (file === prefix ||
        file.startsWith(`${prefix}/`) ||
        rooted === prefix ||
        rooted.startsWith(`${prefix}/`));
}
export function importerInEnforcedSubtree(fromPath, fromChild, entries) {
    if (!fromChild || !entries?.length)
        return false;
    const child = fromChild.toLowerCase();
    for (const raw of entries) {
        if (typeof raw !== 'string')
            continue;
        const entry = siblingEntryKey(raw);
        if (!entry || entry.includes('*'))
            continue;
        if (child === entry)
            return true;
        if (fromPath && pathUnderSubtree(fromPath, entry))
            return true;
    }
    return false;
}
function siblingCrossingAdvisory(siblings, fromPath, fromChild) {
    if (siblings == null || siblings === 'deny')
        return false;
    if (siblings === 'advisory')
        return true;
    if (siblings.default === 'deny')
        return false;
    return !importerInEnforcedSubtree(fromPath, fromChild, siblings.enforce);
}
function childSlicePatternSegments(raw) {
    if (typeof raw !== 'string')
        return null;
    const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/')).toLowerCase();
    if (!trimmed.includes('/'))
        return null;
    const parts = trimmed.split('/');
    for (const part of parts) {
        if (part.length === 0 || part === '.' || part === '..')
            return null;
        if (part.includes('*') && part !== '*')
            return null;
    }
    return parts;
}
export function childSlicePatternMatches(pattern, sliceId) {
    const want = childSlicePatternSegments(pattern);
    const have = childSlicePatternSegments(sliceId);
    if (!want || !have || want.length !== have.length)
        return false;
    for (let index = 0; index < want.length; index += 1) {
        const segment = want[index];
        if (segment === '*')
            continue;
        if (segment !== have[index])
            return false;
    }
    return true;
}
function childCrossSliceAllowed(edges, fromChild, toChild) {
    if (!edges?.length)
        return false;
    for (const edge of edges) {
        if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string')
            continue;
        if (childSlicePatternMatches(edge.from, fromChild) && childSlicePatternMatches(edge.to, toChild)) {
            return true;
        }
    }
    return false;
}
function childAllowanceSpansUniverses(from, to) {
    const fromParts = childSlicePatternSegments(from);
    const toParts = childSlicePatternSegments(to);
    if (!fromParts || !toParts)
        return false;
    const fromPrefix = fromParts.slice(0, -1);
    const toPrefix = toParts.slice(0, -1);
    if (fromPrefix.length !== toPrefix.length)
        return true;
    for (let index = 0; index < fromPrefix.length; index += 1) {
        const left = fromPrefix[index];
        const right = toPrefix[index];
        if (left === '*' || right === '*')
            return true;
        if (left !== right)
            return true;
    }
    return false;
}
function evaluateNestedSliceWall(input) {
    const universe = peerIsolationDecision({
        fromPath: input.fromPath,
        toPath: input.toPath,
        folderCount: input.folderCount,
        fromSlice: input.fromSlice,
        toSlice: input.toSlice,
        fromShared: input.fromShared,
        toShared: input.toShared,
        crossSliceAllowed: input.crossSliceAllowed,
        sharedImportsSlice: sharedImportsSliceMode(input.rule.sharedImportsSlice),
    });
    if (universe.denied) {
        const crossParent = Boolean(input.rule.childSlices) && universe.reason === 'cross-slice';
        return {
            crossing: universe.reason === 'cross-slice' ? 'cross-parent' : 'fail-closed',
            decision: 'deny',
            ...(crossParent ? { reasonId: 'CROSS_PARENT_SLICE' } : {}),
            explanation: crossParent
                ? crossParentExplanation(input.fromSlice, input.toSlice)
                : peerIsolationDenyExplanation(universe.reason ?? 'missing-path', {
                    fromPath: input.fromPath,
                    toPath: input.toPath,
                    fromSlice: input.fromSlice,
                    toSlice: input.toSlice,
                }),
            peerIsolationReason: universe.reason,
            fromUniverse: input.fromSlice,
            toUniverse: input.toSlice,
        };
    }
    const child = input.rule.childSlices;
    if (!child || !input.fromSlice || !input.toSlice || input.fromSlice !== input.toSlice || !input.toPath) {
        return {
            crossing: 'none',
            decision: 'allow',
            fromUniverse: input.fromSlice,
            toUniverse: input.toSlice,
        };
    }
    const fromChild = input.fromChild ?? resolveChildSliceId(input.fromPath, input.fromSlice, child).childId;
    const toChild = input.toChild ?? resolveChildSliceId(input.toPath, input.toSlice, child).childId;
    const allowSameUniverse = {
        crossing: 'none',
        decision: 'allow',
        fromUniverse: input.fromSlice,
        toUniverse: input.toSlice,
    };
    if (fromChild && toChild && fromChild !== toChild) {
        if (input.legacyChildAllowed || childCrossSliceAllowed(child.allowedCrossSlice, fromChild, toChild)) {
            return allowSameUniverse;
        }
        const advisory = siblingCrossingAdvisory(child.siblings, input.fromPath, fromChild);
        return {
            crossing: 'cross-sibling',
            decision: advisory ? 'advisory' : 'deny',
            reasonId: 'CROSS_SIBLING_SLICE',
            explanation: crossSiblingExplanation(fromChild, toChild, input.fromSlice),
            fromUniverse: input.fromSlice,
            toUniverse: input.toSlice,
        };
    }
    if (!fromChild && toChild && child.parentMayImportChild !== true) {
        return {
            crossing: 'parent-imports-child',
            decision: 'deny',
            explanation: parentImportsChildExplanation(toChild),
            fromUniverse: input.fromSlice,
            toUniverse: input.toSlice,
        };
    }
    return allowSameUniverse;
}
export function isChildWallCrossing(verdict) {
    return verdict?.crossing === 'cross-sibling' || verdict?.crossing === 'parent-imports-child';
}
export function sliceConsumerMessage(rule, verdict) {
    return isChildWallCrossing(verdict) ? rule?.childSlices?.message : rule?.message;
}
export function composeSliceDenialMessage(input) {
    const explanation = input.verdict.explanation;
    const inner = isChildWallCrossing(input.verdict);
    const consumer = inner ? input.childMessage : input.ruleMessage;
    if (input.surface === 'intent') {
        const defaultMessage = input.defaultMessage ?? `${input.fromLayer} must not reference ${input.toLayer} intent.`;
        if (inner && explanation)
            return `${input.childMessage ?? defaultMessage} ${explanation}`;
        if (input.verdict.reasonId && explanation)
            return `${defaultMessage} ${explanation}`;
        if (explanation && input.verdict.peerIsolationReason !== 'cross-slice') {
            return `${defaultMessage} ${explanation}`;
        }
        if (consumer) {
            return explanation ? `${consumer} (${explanation})` : consumer;
        }
        return defaultMessage;
    }
    if (consumer) {
        return explanation ? `${consumer} (${explanation})` : consumer;
    }
    if (explanation) {
        const kind = input.kind ?? 'import';
        return `${input.fromLayer} must not ${kind} another slice of ${input.toLayer} (${input.fromPath} → ${input.toPath}): ${explanation}`;
    }
    return `${input.fromLayer} must not ${input.kind ?? 'import'} ${input.toLayer}.`;
}
export function sliceFindingExtras(verdict) {
    if (!verdict || verdict.decision === 'allow')
        return {};
    const from = universePairLabel(verdict.fromUniverse);
    const to = universePairLabel(verdict.toUniverse);
    return {
        ...(verdict.reasonId ? { reasonId: verdict.reasonId } : {}),
        ...(verdict.reasonId && from && to ? { universeFrom: from, universeTo: to } : {}),
        ...(verdict.decision === 'advisory'
            ? { failsStrict: false, severity: 'warning' }
            : {}),
    };
}
export function childWallSiblingsAdvisory(siblings) {
    if (siblings === 'advisory')
        return true;
    if (siblings !== null && typeof siblings === 'object') {
        return siblings.default !== 'deny';
    }
    return false;
}
export function anyChildWallAdvisory(rules) {
    return (rules ?? []).some((rule) => rule?.childSlices != null && childWallSiblingsAdvisory(rule.childSlices.siblings));
}
export function sliceCountReport(violations) {
    let crossParent = 0;
    let crossSibling = 0;
    const pairs = new Map();
    for (const row of violations ?? []) {
        if (row.reasonId === 'CROSS_PARENT_SLICE') {
            crossParent += 1;
            if (typeof row.universeFrom === 'string' && typeof row.universeTo === 'string') {
                const key = `${row.universeFrom}\0${row.universeTo}`;
                const prev = pairs.get(key);
                if (prev)
                    prev.count += 1;
                else
                    pairs.set(key, { from: row.universeFrom, to: row.universeTo, count: 1 });
            }
        }
        else if (row.reasonId === 'CROSS_SIBLING_SLICE') {
            crossSibling += 1;
        }
    }
    if (crossParent === 0 && crossSibling === 0)
        return null;
    return {
        crossParent,
        crossSibling,
        pairs: [...pairs.values()].sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)),
    };
}
export function crossParentViaSharedHubs(violations, options) {
    const minFindings = options?.minFindings ?? 10;
    const minShare = options?.minShare ?? 0.5;
    let total = 0;
    const counts = new Map();
    for (const row of violations ?? []) {
        if (row?.reasonId !== 'CROSS_PARENT_VIA_SHARED')
            continue;
        total += 1;
        if (!Array.isArray(row.via))
            continue;
        const once = new Set(row.via.filter((file) => typeof file === 'string'));
        for (const file of once)
            counts.set(file, (counts.get(file) ?? 0) + 1);
    }
    if (total < minFindings)
        return null;
    const hubs = [...counts.entries()]
        .map(([file, count]) => ({ file, count, share: Math.round((count / total) * 100) / 100 }))
        .filter((hub) => hub.count / total >= minShare)
        .sort((left, right) => right.count - left.count || left.file.localeCompare(right.file));
    if (hubs.length === 0)
        return null;
    const first = hubs[0]?.file ?? '';
    return {
        notAScore: true,
        total,
        hubs,
        nextAction: `If ${first} is a composition root, add it to sharedImportsSlice.stopAt. Otherwise these findings are real.`,
    };
}
export function childSliceConfigFindings(rules, files) {
    const out = [];
    const seenMismatch = new Set();
    const seenSpan = new Set();
    for (const rule of rules ?? []) {
        if (rule?.peerIsolation && rule.allowed === false)
            out.push(...legacyStarsIdFindings(rule, files));
        if (!rule?.childSlices)
            continue;
        if (!rule.peerIsolation || rule.allowed !== false) {
            out.push({
                ruleId: 'CONFIG_CHILD_SLICES_INERT',
                failsStrict: false,
                fromLayer: rule.from,
                toLayer: rule.to,
                message: `${rule.from} → ${rule.to}: childSlices is inert on this rule and enforces nothing. The child wall runs only inside a universe wall. Add "peerIsolation": true and "allowed": false to the same rule, or remove childSlices.`,
            });
            continue;
        }
        for (const file of files) {
            const universeId = sliceIdForPath(file, rule.sliceFolders, rule.sliceIdentity);
            const resolved = resolveChildSliceId(file, universeId, rule.childSlices);
            if (!resolved.mismatched)
                continue;
            const key = `${rule.from}\0${rule.to}\0${resolved.mismatched.universeId}\0${resolved.mismatched.childId}`;
            if (seenMismatch.has(key))
                continue;
            seenMismatch.add(key);
            out.push({
                ruleId: 'CONFIG_CHILD_SLICE_EXTENDS',
                failsStrict: false,
                fromLayer: rule.from,
                toLayer: rule.to,
                path: file,
                message: `${rule.from} → ${rule.to}: child id ${resolved.mismatched.childId} does not extend universe id ${resolved.mismatched.universeId} (${file}).`,
            });
        }
        for (const edge of rule.childSlices.allowedCrossSlice ?? []) {
            if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string')
                continue;
            if (!childAllowanceSpansUniverses(edge.from, edge.to))
                continue;
            const key = `${edge.from.trim().toLowerCase()}\0${edge.to.trim().toLowerCase()}`;
            if (seenSpan.has(key))
                continue;
            seenSpan.add(key);
            out.push({
                ruleId: 'CONFIG_CHILD_SLICE_CROSS_UNIVERSE',
                failsStrict: false,
                fromLayer: rule.from,
                toLayer: rule.to,
                message: `childSlices.allowedCrossSlice ${edge.from} → ${edge.to} cannot cross the universe wall. The universe wall still denies that edge.`,
            });
        }
    }
    return out;
}
function observedIdsByLegacy(folders, files) {
    const byLegacy = new Map();
    if (!folders?.length)
        return byLegacy;
    for (const file of files) {
        if (typeof file !== 'string')
            continue;
        const id = sliceIdForPath(file, [...folders], 'stars');
        const legacy = legacyStarsSliceIdForPath(file, folders);
        if (!id || !legacy || id === legacy)
            continue;
        const set = byLegacy.get(legacy) ?? new Set();
        set.add(id);
        byLegacy.set(legacy, set);
    }
    return byLegacy;
}
function newIdHint(legacyId, shapes, observed, childSegment) {
    const suffix = childSegment ? `/${childSegment}` : '';
    const shape = `${shapes[0] ?? legacyId}${suffix}`;
    const seen = [...(observed.get(legacyId.toLowerCase()) ?? [])].sort().map((id) => `${id}${suffix}`);
    if (seen.length === 1)
        return `${seen[0]}`;
    if (seen.length > 1)
        return `${shape} (one entry per module: ${seen.join(', ')})`;
    return shape;
}
function legacyStarsIdFindings(rule, files) {
    const out = [];
    const push = (message) => out.push({
        ruleId: 'CONFIG_SLICE_LEGACY_STARS_ID',
        failsStrict: false,
        fromLayer: rule.from,
        toLayer: rule.to,
        message: `${rule.from} → ${rule.to}: ${message} It keeps its 4.8.23 meaning for this release only.`,
    });
    const child = rule.childSlices;
    if (rule.sliceIdentity === 'stars') {
        const observed = observedIdsByLegacy(rule.sliceFolders, files);
        for (const alias of child?.sliceAliases ?? []) {
            if (!alias || typeof alias.to !== 'string')
                continue;
            const target = splitAliasTarget(alias.to);
            if (!target || legacyAliasUniverse(rule, alias.to) === undefined)
                continue;
            const shapes = legacyStarsIdTargets(rule.sliceFolders, target.universeId);
            const segment = target.childId.split('/').pop();
            push(`sliceAliases to "${alias.to}" is a 4.8.23 stars id (the star before the last literal was dropped). The id is now ${newIdHint(target.universeId, shapes, observed, segment)}; write that instead.`);
        }
        for (const edge of rule.allowedCrossSlice ?? []) {
            if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string')
                continue;
            const legacySides = [edge.from, edge.to].filter((id) => id.includes('/') && legacyStarsIdTargets(rule.sliceFolders, id).length > 0);
            if (legacySides.length === 0)
                continue;
            const rename = (id) => legacySides.includes(id)
                ? newIdHint(id, legacyStarsIdTargets(rule.sliceFolders, id), observed)
                : id;
            push(`allowedCrossSlice ${edge.from} → ${edge.to} names a 4.8.23 stars id. The ids are now ${rename(edge.from)} → ${rename(edge.to)}; write those instead.`);
        }
    }
    if (child?.sliceIdentity === 'stars') {
        const observed = observedIdsByLegacy(child.sliceFolders, files);
        for (const edge of child.allowedCrossSlice ?? []) {
            if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string')
                continue;
            const legacySides = [edge.from, edge.to].filter((id) => legacyStarsIdTargets(child.sliceFolders, id).length > 0);
            if (legacySides.length === 0)
                continue;
            const rename = (id) => legacySides.includes(id)
                ? newIdHint(id, legacyStarsIdTargets(child.sliceFolders, id), observed)
                : id;
            push(`childSlices.allowedCrossSlice ${edge.from} → ${edge.to} names a 4.8.23 stars id. The ids are now ${rename(edge.from)} → ${rename(edge.to)}; write those instead.`);
        }
    }
    return out;
}
export function siblingRatchetMode(siblings) {
    if (siblings !== null && typeof siblings === 'object') {
        const ratchet = siblings.ratchet;
        if (ratchet === true)
            return 'always';
        if (ratchet === false)
            return 'never';
    }
    return 'auto';
}
function recordedAdvisorySiblingCount(input) {
    const { rule } = input;
    let recorded = 0;
    for (const key of input.recordedKeys) {
        if (input.groupKeys.has(key)) {
            recorded += 1;
            continue;
        }
        if (!rule || input.currentKeys.has(key))
            continue;
        const parts = key.split('|');
        if (parts.length !== 5)
            continue;
        const [ruleId = '', file = '', fromLayer = '', toLayer = '', rawTarget = ''] = parts;
        if (!input.ruleIds.has(ruleId) || fromLayer !== rule.from || toLayer !== rule.to)
            continue;
        const target = rawTarget.replace(/#\d+$/, '');
        if (!file || !target)
            continue;
        const verdict = findDeniedEdgeDecision([rule], fromLayer, toLayer, {
            fromPath: file,
            toPath: target,
            layers: input.layers,
        })?.sliceVerdict;
        if (verdict?.reasonId === 'CROSS_SIBLING_SLICE' && verdict.decision === 'advisory')
            recorded += 1;
    }
    return recorded;
}
export function applyAdvisorySiblingRatchet(violations, occurrenceKeys, recordedKeys, options) {
    const groups = new Map();
    for (let index = 0; index < violations.length; index += 1) {
        const row = violations[index];
        if (row?.reasonId !== 'CROSS_SIBLING_SLICE' || row.failsStrict !== false)
            continue;
        const key = `${row.fromLayer ?? ''}\0${row.toLayer ?? ''}`;
        const list = groups.get(key);
        if (list)
            list.push(index);
        else
            groups.set(key, [index]);
    }
    if (groups.size === 0)
        return [...violations];
    const currentKeys = new Set(occurrenceKeys);
    const promote = new Set();
    for (const indexes of groups.values()) {
        const first = violations[indexes[0] ?? 0];
        const rule = (options?.rules ?? []).find((candidate) => candidate &&
            candidate.from === first?.fromLayer &&
            candidate.to === first?.toLayer &&
            candidate.allowed === false &&
            candidate.peerIsolation === true &&
            candidate.childSlices != null);
        const mode = siblingRatchetMode(rule?.childSlices?.siblings);
        if (mode === 'never')
            continue;
        if (mode === 'auto') {
            const recorded = recordedAdvisorySiblingCount({
                rule: rule,
                ruleIds: new Set(indexes.map((index) => String(violations[index]?.ruleId ?? ''))),
                groupKeys: new Set(indexes.map((index) => occurrenceKeys[index] ?? '')),
                currentKeys,
                recordedKeys,
                layers: options?.layers,
            });
            if (recorded === 0 || indexes.length <= recorded)
                continue;
        }
        for (const index of indexes) {
            if (!recordedKeys.has(occurrenceKeys[index] ?? ''))
                promote.add(index);
        }
    }
    if (promote.size === 0)
        return [...violations];
    return violations.map((violation, index) => {
        if (!promote.has(index))
            return violation;
        const from = violation.fromLayer ?? '?';
        const to = violation.toLayer ?? '?';
        const why = `New advisory sibling crossing past the recorded baseline for ${from} → ${to}. Set childSlices.siblings.ratchet: false to measure only.`;
        return {
            ...violation,
            failsStrict: true,
            severity: 'error',
            ...(typeof violation.message === 'string' ? { message: `${violation.message} ${why}` } : {}),
        };
    });
}
export function findDeniedEdgeRule(rules, from, to, options) {
    return findDeniedEdgeDecision(rules, from, to, options)?.rule;
}
export function findDeniedEdgeDecision(rules, from, to, options) {
    for (const rule of rules ?? []) {
        if (rule.from !== from || rule.to !== to)
            continue;
        if (rule.allowed !== false)
            continue;
        if (rule.peerIsolation) {
            const fromPath = options?.fromPath;
            const toPath = options?.toPath;
            const folders = resolveSliceFolders(rule, from, options?.layers);
            const pair = resolveGovernedSlicePair(rule, folders, fromPath, toPath);
            const fromPlace = pair.from;
            const toPlace = pair.to;
            const fromSlice = fromPlace.universeId;
            const toSlice = toPlace.universeId;
            const verdict = evaluateNestedSliceWall({
                rule,
                fromPath,
                toPath,
                folderCount: folders.length,
                fromSlice,
                toSlice,
                fromChild: fromPlace.childId,
                toChild: toPlace.childId,
                fromShared: !fromSlice && pathUnderSharedRoot(fromPath, rule.sharedRoots),
                toShared: !toSlice && pathUnderSharedRoot(toPath, rule.sharedRoots),
                crossSliceAllowed: pair.crossSliceAllowed,
                legacyChildAllowed: pair.legacyChildAllowed,
            });
            if (verdict.decision !== 'allow') {
                return {
                    rule,
                    peerIsolationReason: verdict.peerIsolationReason,
                    fromSlice,
                    toSlice,
                    sliceVerdict: verdict,
                };
            }
            continue;
        }
        if (from === to)
            continue;
        return { rule };
    }
    if (from !== to &&
        typeof options?.toPath === 'string' &&
        options.toPath.length > 0 &&
        Array.isArray(options?.layers)) {
        const targetLayer = options.layers.find((layer) => layer.name === to);
        const entrypoints = Array.isArray(targetLayer?.entrypoints)
            ? targetLayer.entrypoints.filter((entry) => typeof entry === 'string' && entry.length > 0)
            : [];
        if (entrypoints.length > 0) {
            const normTo = String(options.toPath).split(/[/\\]/).join('/');
            const matchesEntrypoint = entrypoints.some((pattern) => globToRegExp(pattern).test(normTo));
            if (!matchesEntrypoint) {
                return {
                    rule: {
                        from,
                        to,
                        allowed: false,
                        message: `${from} may only import ${to} via its declared entrypoints (${entrypoints.join(', ')}); deep import "${normTo}" bypasses the public surface.`,
                    },
                };
            }
        }
    }
    return undefined;
}
export function findSharedImportsSliceBridge(rules, from, to, options) {
    const fromPath = options?.fromPath;
    const toPath = options?.toPath;
    if (!fromPath || !toPath)
        return undefined;
    for (const rule of rules ?? []) {
        if (rule.from !== from || rule.to !== to)
            continue;
        if (rule.allowed !== false || !rule.peerIsolation)
            continue;
        if (sharedImportsSliceMode(rule.sharedImportsSlice) === 'deny')
            continue;
        const folders = resolveSliceFolders(rule, from, options?.layers);
        const fromSlice = resolveGovernedSlice(fromPath, rule, folders).universeId;
        const toSlice = resolveGovernedSlice(toPath, rule, folders).universeId;
        if (fromSlice || !toSlice)
            continue;
        if (!pathUnderSharedRoot(fromPath, rule.sharedRoots))
            continue;
        return { fromPath, toPath, toSlice };
    }
    return undefined;
}
export function isEdgeDenied(rules, from, to, options) {
    return findDeniedEdgeRule(rules, from, to, options) !== undefined;
}
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
export function peerSliceFolders(rule, layerName, layers) {
    return resolveSliceFolders(rule, layerName, layers);
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
