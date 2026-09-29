/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/configContractSlices.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/config-contract-slices.mjs). Zero Node I/O.
 */

const stringArraySchema = {
    type: 'array',
    items: { type: 'string', minLength: 1 },
    uniqueItems: true,
};
/**
 * `"deny"`, `"deny-cross-parent"`, or `{ mode: "deny-cross-parent", stopAt }`.
 * The generic walk has no `oneOf`, so {@link validateSharedImportsSlice} owns it.
 */
export const SHARED_IMPORTS_SLICE_SCHEMA_DEF = {
    description: 'deny blocks every shared-root import of a slice. deny-cross-parent leaves that hop as a warning and, in ark-check and CI only, reports a slice that reaches another universe through a shared root. The write hook and ESLint see one edge and do not block it. The object form { mode: "deny-cross-parent", stopAt } names composition roots (bootstrap, DI registrations) the whole-graph walk never starts at or passes through; a stop file must still sit under sharedRoots, and stopAt does not silence the direct SHARED_IMPORTS_SLICE warning. arkgate 4.8.22 and older reject deny-cross-parent. arkgate 4.8.23 and older reject the object form (must be one of deny, deny-cross-parent).',
    oneOf: [
        { type: 'string', enum: ['deny', 'deny-cross-parent'] },
        {
            type: 'object',
            additionalProperties: false,
            required: ['mode', 'stopAt'],
            properties: {
                mode: { type: 'string', enum: ['deny-cross-parent'] },
                stopAt: { ...stringArraySchema, minItems: 1 },
            },
        },
    ],
};
export const CHILD_SLICES_SCHEMA_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['sliceFolders'],
    description: 'Optional inner wall under this rule. Runs only on a rule with peerIsolation: true and allowed: false; elsewhere it is inert and ark-check warns CONFIG_CHILD_SLICES_INERT (config load still accepts it, as 4.8.23 did). Absent keeps today\'s universe wall. sliceFolders names children. Flat files are universe common, and so is a commonFolders directory directly under the universe (a folder of that name inside a child belongs to that child). siblings is "deny" (default), "advisory", or { default, enforce, ratchet }. parentMayImportChild defaults to false. message is the text for inner-wall findings. allowedCrossSlice may use a whole-segment *. It clears only a sibling crossing. Cross-parent has no advisory knob. arkgate 4.8.22 and older reject this key. A build that still rejects unknown childSlices fields rejects allowedCrossSlice at config load. A build that still types siblings as a string enum rejects the object at config load.',
    properties: {
        sliceFolders: { ...stringArraySchema, minItems: 1 },
        sliceIdentity: {
            type: 'string',
            enum: ['path', 'stars'],
        },
        commonFolders: { ...stringArraySchema, minItems: 1 },
        siblings: {
            description: '"deny" or "advisory", or { default, enforce, ratchet } so listed subtrees are errors while the default stays advisory. ratchet absent: a new advisory crossing fails only when the baseline in use already records an advisory crossing of this rule. ratchet true: any unrecorded advisory crossing fails when a baseline is in use. ratchet false: measure only, never fails. A string-enum build rejects the object at config load (must be one of deny, advisory). arkgate 4.8.23 and older reject ratchet (unknown field).',
            oneOf: [
                { type: 'string', enum: ['deny', 'advisory'] },
                {
                    type: 'object',
                    additionalProperties: false,
                    required: ['default'],
                    properties: {
                        default: { type: 'string', enum: ['deny', 'advisory'] },
                        enforce: { ...stringArraySchema },
                        ratchet: { type: 'boolean' },
                    },
                },
            ],
        },
        parentMayImportChild: { type: 'boolean' },
        message: {
            type: 'string',
            minLength: 1,
            description: 'Text for inner-wall findings (CROSS_SIBLING_SLICE and universe common importing a child). The rule message stays the universe-wall text (CROSS_PARENT_SLICE and fail-closed denies). Absent: ArkGate default text, never the rule message. arkgate 4.8.23 and older reject this field (unknown field).',
        },
        arkRulesFile: {
            type: 'string',
            minLength: 1,
            description: 'Filename read at each child slice root this wall already resolved. The only token is <Layer>, replaced with a declared layer name (arkrules.<Layer>.json). No slash and no wildcard. A discovered file that omits appliesTo is scoped to that slice directory. Explicit appliesTo outside the slice fails config load (ARKRULE_SCOPE_ESCAPES_SLICE). The effective id is <childId>#<localId>. A build that rejects unknown childSlices fields fails at config load (unknown field).',
        },
        sliceAliases: {
            type: 'array',
            minItems: 1,
            description: 'Maps a source path glob onto a child slice id (universe id plus one child segment) so files outside the slice trees take that universe and child for both walls. A path without a wildcard also covers everything under it, as sharedRoots does. A bare name, a universe id alone, a target outside every universe shape, and a wildcard in to are rejected. Under stars identity a target written against the 4.8.23 stars id (star bindings before the last literal dropped, e.g. api/v1/x for modules/*/api/*) still loads when it maps to one universe shape, and ark-check warns CONFIG_SLICE_LEGACY_STARS_ID with the new id; it is rejected only when it maps to more than one shape. Config load checks only the shape; doctor reports a target universe no file belongs to. The glob may not overlap a slice folder, and two aliases may not match the same file. Doctor lists each unpinned alias as an owed move. pinned true lists the alias separately and does not count it as debt. reason is a doctor label and does not pin by itself. A build that rejects unknown childSlices fields fails at config load (unknown field). arkgate 4.8.22 and older reject childSlices.',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['from', 'to'],
                properties: {
                    from: { type: 'string', minLength: 1 },
                    to: { type: 'string', minLength: 1 },
                    pinned: {
                        type: 'boolean',
                        description: 'True when a framework forces the path to stay. The alias is not an owed move and does not clear other honesty debt.',
                    },
                    reason: {
                        type: 'string',
                        minLength: 1,
                        description: 'Doctor label, such as framework-route. A label alone does not pin.',
                    },
                },
            },
        },
        allowedCrossSlice: {
            type: 'array',
            minItems: 1,
            description: 'Directed child-slice allowances. * matches one whole path segment (features/projects/*). ** and a partial segment are rejected. A bare name is rejected. This list clears only CROSS_SIBLING_SLICE. It cannot clear CROSS_PARENT_SLICE or CROSS_PARENT_VIA_SHARED. The universe allowedCrossSlice still treats * as a literal. A build that rejects unknown childSlices fields fails at config load (unknown field).',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['from', 'to'],
                properties: {
                    from: { type: 'string', minLength: 1 },
                    to: { type: 'string', minLength: 1 },
                },
            },
        },
    },
};
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function propertyPath(parent, key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
        ? `${parent}.${key}`
        : `${parent}[${JSON.stringify(key)}]`;
}
/** Trim trailing slashes with a linear scan (no polynomial regex). */
function trimTrailingSlashes(value) {
    let end = value.length;
    while (end > 0 && value[end - 1] === '/')
        end -= 1;
    return value.slice(0, end);
}
/** Every slice-wall check the generic schema walk cannot express. */
export function validateSliceContract(candidate, issues) {
    validateSharedImportsSlice(candidate, issues);
    validateChildSliceSiblings(candidate, issues);
    validateChildSliceAllowedCrossSlice(candidate, issues);
    validateChildSliceAliases(candidate, issues);
    validateChildSliceArkRulesFile(candidate, issues);
}
// childSlices on a rule without peerIsolation: true + allowed: false is inert. 4.8.23
// loaded it, so config load keeps accepting it; ark-check warns CONFIG_CHILD_SLICES_INERT
// (layerMatch childSliceConfigFindings) instead of failing a patch-release upgrade.
const SHARED_IMPORTS_SLICE_FORM_MESSAGE = 'must be "deny", "deny-cross-parent", or { "mode": "deny-cross-parent", "stopAt": ["<composition root path or glob>"] }';
const STOP_AT_WHOLE_TREE = 'must not cover the whole tree. Name the composition root itself (bootstrap file, DI registrations folder).';
function isWildcardSegment(part) {
    return part === '*' || part === '**';
}
/**
 * Literal folder a path or glob covers: leading src/ or app/ dropped (the walk
 * matches with or without them), trailing whole-segment wildcards dropped (a
 * folder, `folder/*` and `folder/**` all stop the whole subtree). Null when a
 * wildcard sits before a literal, so the entry is partial by construction.
 */
function coveredFolder(value) {
    let parts = value.toLowerCase().split('/').filter((part) => part.length > 0 && part !== '.');
    if (parts[0] === 'src' || parts[0] === 'app')
        parts = parts.slice(1);
    let end = parts.length;
    while (end > 0 && isWildcardSegment(parts[end - 1] ?? ''))
        end -= 1;
    const base = parts.slice(0, end);
    return base.some((part) => part.includes('*')) ? null : base;
}
function isPrefixOf(prefix, full) {
    return prefix.length <= full.length && prefix.every((part, index) => full[index] === part);
}
/** Layer roots the rule walks. A stop that covers one silences the walk for that whole layer. */
function ruleLayerFolders(candidate, rule) {
    const layers = candidate.layers;
    if (!Array.isArray(layers))
        return [];
    const names = new Set([rule.from, rule.to].filter((name) => typeof name === 'string'));
    const folders = [];
    for (const layer of layers) {
        if (!isObject(layer) || typeof layer.name !== 'string' || !names.has(layer.name))
            continue;
        const patterns = Array.isArray(layer.patterns) ? layer.patterns : [];
        for (const pattern of patterns) {
            if (typeof pattern !== 'string')
                continue;
            const parts = pattern.replace(/\\/g, '/').split('/');
            const firstWildcard = parts.findIndex((part) => part.includes('*'));
            const literal = firstWildcard === -1 ? parts : parts.slice(0, firstWildcard);
            const folder = coveredFolder(literal.join('/'));
            if (folder)
                folders.push(folder);
        }
    }
    return folders;
}
function stopAtEntryIssue(raw, layerFolders) {
    const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
    if (trimmed.length === 0)
        return 'must be a non-empty path or glob';
    const bare = trimmed.replace(/^[./]+/, '');
    if (bare === '' || bare === '*' || bare === '**')
        return STOP_AT_WHOLE_TREE;
    for (const part of trimmed.split('/')) {
        if (part.length === 0 || part === '.' || part === '..') {
            return 'must be a path or glob without empty, . or .. segments';
        }
    }
    const folder = coveredFolder(trimmed);
    if (folder === null)
        return null;
    if (folder.length === 0)
        return STOP_AT_WHOLE_TREE;
    if (layerFolders.some((layer) => isPrefixOf(folder, layer))) {
        return 'must not cover a whole layer root of this rule. Name the composition root itself (bootstrap file, DI registrations folder).';
    }
    return null;
}
/** String form unchanged. Object form carries composition roots the walk stops at. */
export function validateSharedImportsSlice(candidate, issues) {
    const rules = candidate.rules;
    if (!Array.isArray(rules))
        return;
    rules.forEach((rule, index) => {
        if (!isObject(rule) || rule.sharedImportsSlice === undefined)
            return;
        const value = rule.sharedImportsSlice;
        const path = `$.rules[${index}].sharedImportsSlice`;
        if (typeof value === 'string') {
            if (value !== 'deny' && value !== 'deny-cross-parent') {
                issues.push({ path, message: SHARED_IMPORTS_SLICE_FORM_MESSAGE });
            }
            return;
        }
        if (!isObject(value)) {
            issues.push({ path, message: SHARED_IMPORTS_SLICE_FORM_MESSAGE });
            return;
        }
        for (const key of Object.keys(value)) {
            if (key !== 'mode' && key !== 'stopAt') {
                issues.push({ path: propertyPath(path, key), message: 'unknown field' });
            }
        }
        if (value.mode === undefined) {
            issues.push({ path: `${path}.mode`, message: 'is required' });
        }
        else if (value.mode !== 'deny-cross-parent') {
            issues.push({
                path: `${path}.mode`,
                message: 'must be deny-cross-parent. stopAt has no meaning for deny; use the string "deny".',
            });
        }
        const stopAt = value.stopAt;
        if (stopAt === undefined) {
            issues.push({ path: `${path}.stopAt`, message: 'is required' });
            return;
        }
        if (!Array.isArray(stopAt) || stopAt.length === 0) {
            issues.push({ path: `${path}.stopAt`, message: 'must be a non-empty array of paths or globs' });
            return;
        }
        const seen = new Set();
        const layerFolders = ruleLayerFolders(candidate, rule);
        stopAt.forEach((entry, entryIndex) => {
            const entryPath = `${path}.stopAt[${entryIndex}]`;
            if (typeof entry !== 'string') {
                issues.push({ path: entryPath, message: 'must be a non-empty path or glob' });
                return;
            }
            const issue = stopAtEntryIssue(entry, layerFolders);
            if (issue) {
                issues.push({ path: entryPath, message: issue });
                return;
            }
            const key = trimTrailingSlashes(entry.trim().replace(/\\/g, '/')).toLowerCase();
            if (seen.has(key)) {
                issues.push({ path: entryPath, message: 'duplicate stopAt entry' });
                return;
            }
            seen.add(key);
        });
    });
}
const SIBLING_MODES = ['deny', 'advisory'];
/**
 * String enum builds reject this object before they reach a decision.
 * The message names both forms so a bad value is obvious at config load.
 */
const SIBLINGS_FORM_MESSAGE = 'must be "deny", "advisory", or { "default": "deny" | "advisory", "enforce": ["<child id or subtree path>"], "ratchet": true | false }';
export function validateChildSliceSiblings(candidate, issues) {
    const rules = candidate.rules;
    if (!Array.isArray(rules))
        return;
    rules.forEach((rule, index) => {
        if (!isObject(rule))
            return;
        const child = rule.childSlices;
        if (!isObject(child) || child.siblings === undefined)
            return;
        const siblings = child.siblings;
        const path = `$.rules[${index}].childSlices.siblings`;
        if (typeof siblings === 'string') {
            if (!SIBLING_MODES.includes(siblings)) {
                issues.push({ path, message: SIBLINGS_FORM_MESSAGE });
            }
            return;
        }
        if (!isObject(siblings)) {
            issues.push({ path, message: SIBLINGS_FORM_MESSAGE });
            return;
        }
        for (const key of Object.keys(siblings)) {
            if (key !== 'default' && key !== 'enforce' && key !== 'ratchet') {
                issues.push({ path: propertyPath(path, key), message: 'unknown field' });
            }
        }
        if (siblings.ratchet !== undefined && typeof siblings.ratchet !== 'boolean') {
            issues.push({ path: `${path}.ratchet`, message: 'must be a boolean' });
        }
        if (siblings.default === undefined) {
            issues.push({ path: `${path}.default`, message: 'is required' });
        }
        else if (siblings.default !== 'deny' && siblings.default !== 'advisory') {
            issues.push({ path: `${path}.default`, message: 'must be deny or advisory' });
        }
        if (siblings.enforce === undefined)
            return;
        if (!Array.isArray(siblings.enforce)) {
            issues.push({
                path: `${path}.enforce`,
                message: 'must be an array of child slice ids or subtree paths',
            });
            return;
        }
        const seen = new Set();
        siblings.enforce.forEach((entry, entryIndex) => {
            const entryPath = `${path}.enforce[${entryIndex}]`;
            if (typeof entry !== 'string' || entry.trim().length === 0) {
                issues.push({ path: entryPath, message: 'must be a non-empty child slice id or subtree path' });
                return;
            }
            const normalized = trimTrailingSlashes(entry.trim().replace(/\\/g, '/'));
            if (normalized.split('/').some((part) => part.length === 0 || part === '.' || part === '..')) {
                issues.push({ path: entryPath, message: 'must be a child slice id or subtree path without . or ..' });
                return;
            }
            if (normalized.includes('*')) {
                issues.push({
                    path: entryPath,
                    message: 'must be a child slice id or subtree path. * is not a wildcard on siblings.enforce',
                });
                return;
            }
            if (seen.has(normalized)) {
                issues.push({ path: entryPath, message: 'duplicate enforce entry' });
                return;
            }
            seen.add(normalized);
        });
    });
}
const BARE_CHILD_CROSS_SLICE = 'must be a slice id with a slash. A bare name is ambiguous across universes.';
const WHOLE_SEGMENT_STAR = '* matches one whole path segment. ** and a partial segment are not wildcards.';
/**
 * Whole-segment `*` is legal only on this list. A bare name is rejected.
 * The universe allowedCrossSlice is not checked here and still treats `*` as a literal.
 */
function childCrossSlicePatternIssue(raw) {
    const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
    if (trimmed.length === 0)
        return 'must be a non-empty slice id';
    if (!trimmed.includes('/'))
        return BARE_CHILD_CROSS_SLICE;
    const parts = trimmed.split('/');
    for (const part of parts) {
        if (part.length === 0 || part === '.' || part === '..') {
            return 'must be a slice id without empty, . or .. segments';
        }
        if (part.includes('*') && part !== '*')
            return WHOLE_SEGMENT_STAR;
    }
    return null;
}
function childCrossSlicePatternKey(raw) {
    return trimTrailingSlashes(raw.trim().replace(/\\/g, '/')).toLowerCase();
}
export function validateChildSliceAllowedCrossSlice(candidate, issues) {
    const rules = candidate.rules;
    if (!Array.isArray(rules))
        return;
    rules.forEach((rule, index) => {
        if (!isObject(rule))
            return;
        const child = rule.childSlices;
        if (!isObject(child) || child.allowedCrossSlice === undefined)
            return;
        const edges = child.allowedCrossSlice;
        const path = `$.rules[${index}].childSlices.allowedCrossSlice`;
        if (!Array.isArray(edges)) {
            issues.push({ path, message: 'must be an array of { from, to } child slice ids' });
            return;
        }
        const seen = new Set();
        edges.forEach((edge, edgeIndex) => {
            const edgePath = `${path}[${edgeIndex}]`;
            if (!isObject(edge)) {
                issues.push({ path: edgePath, message: 'must be an object with from and to' });
                return;
            }
            for (const key of Object.keys(edge)) {
                if (key !== 'from' && key !== 'to') {
                    issues.push({ path: propertyPath(edgePath, key), message: 'unknown field' });
                }
            }
            for (const side of ['from', 'to']) {
                const value = edge[side];
                const sidePath = `${edgePath}.${side}`;
                if (typeof value !== 'string' || value.trim().length === 0) {
                    issues.push({ path: sidePath, message: 'must be a non-empty slice id' });
                    continue;
                }
                const issue = childCrossSlicePatternIssue(value);
                if (issue)
                    issues.push({ path: sidePath, message: issue });
            }
            if (typeof edge.from !== 'string' || typeof edge.to !== 'string')
                return;
            const key = `${childCrossSlicePatternKey(edge.from)}\0${childCrossSlicePatternKey(edge.to)}`;
            if (!key.startsWith('\0') && !key.endsWith('\0')) {
                if (seen.has(key)) {
                    issues.push({ path: edgePath, message: 'duplicate child slice allowance' });
                    return;
                }
                seen.add(key);
            }
        });
    });
}
const ALIAS_TARGET_MESSAGE = 'must be a child of a universe shape this rule names (its universe sliceFolders shape plus one child segment). A bare name, a universe id alone, a target outside every universe shape, and a wildcard are rejected. Config load checks the shape only; doctor reports a target universe no file belongs to.';
const ALIAS_LEGACY_AMBIGUOUS_MESSAGE = 'is a 4.8.23 stars id (star bindings before the last literal dropped) that maps to more than one universe shape of this rule. Write the new stars id, which keeps every star binding (e.g. orders/api/v1/x for modules/*/api/*).';
const ALIAS_OVERLAP_MESSAGE = 'overlaps a slice folder. An alias covers only files outside the slice trees.';
const ALIAS_SAME_FILE_MESSAGE = 'two slice aliases match the same file';
function aliasPathSegments(raw) {
    return trimTrailingSlashes(raw.trim().replace(/\\/g, '/')).toLowerCase().split('/').filter((part) => part.length > 0);
}
/**
 * A `from` whose last segment has no wildcard is a folder form: it also covers
 * everything under it at match time (as sharedRoots does), so the overlap and
 * same-file checks see the subtree too.
 */
function aliasSegmentsWithSubtree(segments) {
    const last = segments[segments.length - 1];
    if (last === undefined || last.includes('*'))
        return [...segments];
    return [...segments, '**'];
}
function concreteGlobPrefix(segments) {
    const prefix = [];
    for (const segment of segments) {
        if (segment.includes('*'))
            break;
        prefix.push(segment);
    }
    return prefix;
}
function segmentsArePrefix(prefix, full) {
    if (prefix.length > full.length)
        return false;
    for (let index = 0; index < prefix.length; index += 1) {
        if (prefix[index] !== full[index])
            return false;
    }
    return true;
}
function anchoredSlicePrefix(entry) {
    const segments = entry.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
    if (segments.length < 2 || segments[0] === '*' || segments[0] === '**')
        return null;
    if (!segments.some((part) => part === '*'))
        return null;
    const prefix = [];
    for (const segment of segments) {
        if (segment === '*' || segment === '**')
            break;
        if (segment.includes('*'))
            return null;
        prefix.push(segment);
    }
    return prefix.length > 0 ? prefix : null;
}
/** Trailing ** does not invent a slice-folder name the glob does not already reach. */
function globOverlapsAnchored(glob, patternPrefix) {
    const prefix = concreteGlobPrefix(glob);
    const wild = prefix.length < glob.length;
    const rooted = prefix[0] === 'src' || prefix[0] === 'app' ? prefix.slice(1) : prefix;
    if (segmentsArePrefix(patternPrefix, prefix) || segmentsArePrefix(patternPrefix, rooted))
        return true;
    if (!wild)
        return false;
    return ((segmentsArePrefix(prefix, patternPrefix) && prefix.length < patternPrefix.length) ||
        (segmentsArePrefix(prefix, ['src', ...patternPrefix]) && prefix.length < patternPrefix.length + 1) ||
        (segmentsArePrefix(prefix, ['app', ...patternPrefix]) && prefix.length < patternPrefix.length + 1));
}
function globOverlapsBare(glob, name) {
    for (let index = 0; index < glob.length; index += 1) {
        if (glob[index] !== name && glob[index] !== '*')
            continue;
        const rest = glob.slice(index + 1);
        if (rest.length >= 2)
            return true;
        if (rest.some((segment) => segment === '*' || segment === '**'))
            return true;
    }
    const prefix = concreteGlobPrefix(glob);
    return (prefix.length < glob.length &&
        (prefix.length === 0 || (prefix.length === 1 && (prefix[0] === 'src' || prefix[0] === 'app'))));
}
function globOverlapsSliceEntry(glob, entry) {
    const segments = entry.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
    if (segments.length === 1 && segments[0] && !segments[0].includes('*')) {
        return globOverlapsBare(glob, segments[0]);
    }
    const prefix = anchoredSlicePrefix(entry);
    return prefix ? globOverlapsAnchored(glob, prefix) : false;
}
function aliasGlobIssue(raw) {
    const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
    if (trimmed.length === 0)
        return 'must be a non-empty path glob';
    if (trimmed === '*' || trimmed === '**')
        return 'must not cover the whole tree';
    for (const part of trimmed.split('/')) {
        if (part.length === 0 || part === '.' || part === '..') {
            return 'must be a path glob without empty, . or .. segments';
        }
        if (part === '*' || part === '**')
            continue;
        if (part.includes('*') || part.includes('?') || part.includes('{') || part.includes('[')) {
            return '* matches one whole path segment. ** is a whole segment. A partial segment is not a wildcard.';
        }
    }
    return null;
}
function universeShapes(folders, identity) {
    const shapes = [];
    if (!Array.isArray(folders))
        return shapes;
    const stars = identity === 'stars';
    for (const raw of folders) {
        if (typeof raw !== 'string' || raw.length === 0)
            continue;
        const segments = raw.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
        if (segments.length === 1 && segments[0] && !segments[0].includes('*')) {
            shapes.push({ literals: [segments[0], null] });
            continue;
        }
        if (segments.some((part) => part === '**' || (part.includes('*') && part !== '*')))
            continue;
        if (!segments.includes('*'))
            continue;
        if (stars) {
            // Same rule as the slice id: drop only literals before the last literal.
            let lastLiteral = -1;
            for (let index = 0; index < segments.length; index += 1) {
                if (segments[index] !== '*')
                    lastLiteral = index;
            }
            if (lastLiteral < 0)
                continue;
            const literals = segments
                .filter((part, index) => index >= lastLiteral || part === '*')
                .map((part) => (part === '*' ? null : part));
            const legacy = segments.slice(lastLiteral).map((part) => (part === '*' ? null : part));
            shapes.push(legacy.length === literals.length ? { literals } : { literals, legacy });
            continue;
        }
        shapes.push({ literals: segments.map((part) => (part === '*' ? null : part)) });
    }
    return shapes;
}
function shapeMatches(shape, segments) {
    if (shape.literals.length !== segments.length)
        return false;
    return shape.literals.every((literal, index) => literal === null || literal === segments[index]);
}
function aliasTargetIssue(raw, shapes) {
    const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
    if (trimmed.length === 0 || trimmed.split('/').some((part) => part.length === 0 || part === '.' || part === '..')) {
        return ALIAS_TARGET_MESSAGE;
    }
    if (trimmed.includes('*') || !trimmed.includes('/'))
        return ALIAS_TARGET_MESSAGE;
    const parts = trimmed.split('/').map((part) => part.toLowerCase());
    if (shapes.length === 0)
        return ALIAS_TARGET_MESSAGE;
    if (shapes.some((shape) => shapeMatches(shape, parts)))
        return ALIAS_TARGET_MESSAGE;
    if (shapes.some((shape) => shapeMatches(shape, parts.slice(0, -1))))
        return null;
    // 4.8.23 stars id: accepted (with a CONFIG_SLICE_LEGACY_STARS_ID warning) when it maps
    // to exactly one new universe shape; rejected only when that mapping is ambiguous.
    const legacyTargets = new Set(shapes
        .filter((shape) => shape.legacy !== undefined &&
        !shapeMatches({ literals: shape.legacy }, parts) &&
        shapeMatches({ literals: shape.legacy }, parts.slice(0, -1)))
        .map((shape) => shape.literals.map((part) => part ?? '*').join('/')));
    if (legacyTargets.size === 1)
        return null;
    if (legacyTargets.size > 1)
        return ALIAS_LEGACY_AMBIGUOUS_MESSAGE;
    return ALIAS_TARGET_MESSAGE;
}
/** A leading src/ or app/ is optional at match time, so both spellings are one glob. */
function aliasGlobVariants(segments) {
    const head = segments[0];
    if ((head === 'src' || head === 'app') && segments.length > 1)
        return [segments, segments.slice(1)];
    return [segments];
}
function aliasesCanMatchSameFile(left, right) {
    const leftVariants = aliasGlobVariants(left);
    const rightVariants = aliasGlobVariants(right);
    for (const a of leftVariants) {
        if (globsCanMatchSame(a, right, 0, 0, new Map()))
            return true;
    }
    for (const b of rightVariants) {
        if (globsCanMatchSame(left, b, 0, 0, new Map()))
            return true;
    }
    return false;
}
function globsCanMatchSame(left, right, i, j, memo) {
    const key = `${i}:${j}`;
    const cached = memo.get(key);
    if (cached !== undefined)
        return cached;
    let matched = false;
    if (i === left.length && j === right.length)
        matched = true;
    else if (i < left.length && left[i] === '**') {
        matched =
            globsCanMatchSame(left, right, i + 1, j, memo) ||
                (j < right.length && globsCanMatchSame(left, right, i, j + 1, memo));
    }
    else if (j < right.length && right[j] === '**') {
        matched =
            globsCanMatchSame(left, right, i, j + 1, memo) ||
                (i < left.length && globsCanMatchSame(left, right, i + 1, j, memo));
    }
    else if (i < left.length && j < right.length) {
        const a = left[i];
        const b = right[j];
        if (a === b || a === '*' || b === '*')
            matched = globsCanMatchSame(left, right, i + 1, j + 1, memo);
    }
    memo.set(key, matched);
    return matched;
}
const ARK_RULES_FILE_MESSAGE = 'must be a filename with exactly one <Layer> token and no slash or wildcard (arkrules.<Layer>.json)';
export function validateChildSliceArkRulesFile(candidate, issues) {
    const rules = candidate.rules;
    if (!Array.isArray(rules))
        return;
    rules.forEach((rule, index) => {
        if (!isObject(rule))
            return;
        const child = rule.childSlices;
        if (!isObject(child) || child.arkRulesFile === undefined)
            return;
        const path = `$.rules[${index}].childSlices.arkRulesFile`;
        const pattern = child.arkRulesFile;
        if (typeof pattern !== 'string' || pattern.length === 0) {
            issues.push({ path, message: ARK_RULES_FILE_MESSAGE });
            return;
        }
        const parts = pattern.split('<Layer>');
        if (parts.length !== 2 || /[*\\/]/.test(pattern) || pattern.includes('..')) {
            issues.push({ path, message: ARK_RULES_FILE_MESSAGE });
        }
    });
}
export function validateChildSliceAliases(candidate, issues) {
    const rules = candidate.rules;
    if (!Array.isArray(rules))
        return;
    rules.forEach((rule, index) => {
        if (!isObject(rule))
            return;
        const child = rule.childSlices;
        if (!isObject(child) || child.sliceAliases === undefined)
            return;
        const aliases = child.sliceAliases;
        const path = `$.rules[${index}].childSlices.sliceAliases`;
        if (!Array.isArray(aliases)) {
            issues.push({ path, message: 'must be an array of { from, to } slice aliases' });
            return;
        }
        const shapes = universeShapes(rule.sliceFolders, rule.sliceIdentity);
        const sliceEntries = [
            ...(Array.isArray(rule.sliceFolders) ? rule.sliceFolders : []),
            ...(Array.isArray(child.sliceFolders) ? child.sliceFolders : []),
        ].filter((entry) => typeof entry === 'string' && entry.length > 0);
        const globs = [];
        aliases.forEach((alias, aliasIndex) => {
            const aliasPath = `${path}[${aliasIndex}]`;
            if (!isObject(alias)) {
                issues.push({ path: aliasPath, message: 'must be an object with from and to' });
                return;
            }
            for (const key of Object.keys(alias)) {
                if (key !== 'from' && key !== 'to' && key !== 'pinned' && key !== 'reason') {
                    issues.push({ path: propertyPath(aliasPath, key), message: 'unknown field' });
                }
            }
            const from = alias.from;
            const to = alias.to;
            if (typeof from !== 'string' || from.trim().length === 0) {
                issues.push({ path: `${aliasPath}.from`, message: 'must be a non-empty path glob' });
            }
            else {
                const issue = aliasGlobIssue(from);
                if (issue)
                    issues.push({ path: `${aliasPath}.from`, message: issue });
                else {
                    const segments = aliasSegmentsWithSubtree(aliasPathSegments(from));
                    if (sliceEntries.some((entry) => globOverlapsSliceEntry(segments, entry))) {
                        issues.push({ path: `${aliasPath}.from`, message: ALIAS_OVERLAP_MESSAGE });
                    }
                    for (const previous of globs) {
                        if (aliasesCanMatchSameFile(previous, segments)) {
                            issues.push({ path: aliasPath, message: ALIAS_SAME_FILE_MESSAGE });
                            break;
                        }
                    }
                    globs.push(segments);
                }
            }
            if (typeof to !== 'string' || to.trim().length === 0) {
                issues.push({ path: `${aliasPath}.to`, message: ALIAS_TARGET_MESSAGE });
            }
            else {
                const issue = aliasTargetIssue(to, shapes);
                if (issue)
                    issues.push({ path: `${aliasPath}.to`, message: issue });
            }
        });
    });
}
