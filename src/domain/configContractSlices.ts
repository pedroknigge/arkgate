/**
 * Slice-wall part of the ark.config.json contract: the `childSlices` and
 * `sharedImportsSlice` schema nodes and the validators the generic schema walk
 * cannot express (string-or-object forms, segment rules, overlap checks).
 *
 * Pure. Split out of configContract.ts so the generated CLI copy stays within
 * its module budget. Generated into bin/lib/config-contract-slices.mjs.
 */
import type { ArkConfigIssue } from './configTypes';

const stringArraySchema = {
  type: 'array',
  items: { type: 'string', minLength: 1 },
  uniqueItems: true,
} as const;

/**
 * `"deny"`, `"deny-cross-parent"`, or `{ mode: "deny-cross-parent", stopAt }`.
 * The generic walk has no `oneOf`, so {@link validateSharedImportsSlice} owns it.
 */
export const SHARED_IMPORTS_SLICE_SCHEMA_DEF = {
  description:
    'deny blocks every shared-root import of a slice. deny-cross-parent leaves that hop as a warning and, in ark-check and CI only, reports a slice that reaches another universe through a shared root. The write hook and ESLint see one edge and do not block it. The object form { mode: "deny-cross-parent", stopAt } names composition roots (bootstrap, DI registrations) the whole-graph walk never starts at or passes through; a stop file must still sit under sharedRoots, and stopAt does not silence the direct SHARED_IMPORTS_SLICE warning. arkgate 4.8.22 and older reject deny-cross-parent. arkgate 4.8.23 and older reject the object form (must be one of deny, deny-cross-parent).',
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
} as const;

export const CHILD_SLICES_SCHEMA_DEF = {
  type: 'object',
  additionalProperties: false,
  required: ['sliceFolders'],
  description:
    'Optional inner wall under this rule. Needs peerIsolation: true and allowed: false on the same rule; config load rejects it otherwise. Absent keeps today\'s universe wall. sliceFolders names children. Flat files are universe common, and so is a commonFolders directory directly under the universe (a folder of that name inside a child belongs to that child). siblings is "deny" (default), "advisory", or { default, enforce, ratchet }. parentMayImportChild defaults to false. message is the text for inner-wall findings. allowedCrossSlice may use a whole-segment *. It clears only a sibling crossing. Cross-parent has no advisory knob. arkgate 4.8.22 and older reject this key. A build that still rejects unknown childSlices fields rejects allowedCrossSlice at config load. A build that still types siblings as a string enum rejects the object at config load.',
  properties: {
    sliceFolders: { ...stringArraySchema, minItems: 1 },
    sliceIdentity: {
      type: 'string',
      enum: ['path', 'stars'],
    },
    commonFolders: { ...stringArraySchema, minItems: 1 },
    siblings: {
      description:
        '"deny" or "advisory", or { default, enforce, ratchet } so listed subtrees are errors while the default stays advisory. ratchet absent: a new advisory crossing fails only when the baseline in use already records an advisory crossing of this rule. ratchet true: any unrecorded advisory crossing fails when a baseline is in use. ratchet false: measure only, never fails. A string-enum build rejects the object at config load (must be one of deny, advisory). arkgate 4.8.23 and older reject ratchet (unknown field).',
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
      description:
        'Text for inner-wall findings (CROSS_SIBLING_SLICE and universe common importing a child). The rule message stays the universe-wall text (CROSS_PARENT_SLICE and fail-closed denies). Absent: ArkGate default text, never the rule message. arkgate 4.8.23 and older reject this field (unknown field).',
    },
    sliceAliases: {
      type: 'array',
      minItems: 1,
      description:
        'Maps a source path glob onto a child slice id (universe id plus one child segment) so files outside the slice trees take that universe and child for both walls. A path without a wildcard also covers everything under it, as sharedRoots does. A bare name, a universe id alone, a target outside every universe shape, and a wildcard in to are rejected. Config load checks only the shape; doctor reports a target universe no file belongs to. The glob may not overlap a slice folder, and two aliases may not match the same file. Doctor lists each alias as an owed move. A build that rejects unknown childSlices fields fails at config load (unknown field). arkgate 4.8.22 and older reject childSlices.',
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
    allowedCrossSlice: {
      type: 'array',
      minItems: 1,
      description:
        'Directed child-slice allowances. * matches one whole path segment (features/projects/*). ** and a partial segment are rejected. A bare name is rejected. This list clears only CROSS_SIBLING_SLICE. It cannot clear CROSS_PARENT_SLICE or CROSS_PARENT_VIA_SHARED. The universe allowedCrossSlice still treats * as a literal. A build that rejects unknown childSlices fields fails at config load (unknown field).',
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
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function propertyPath(parent: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

/** Trim trailing slashes with a linear scan (no polynomial regex). */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

/** Every slice-wall check the generic schema walk cannot express. */
export function validateSliceContract(candidate: Record<string, unknown>, issues: ArkConfigIssue[]): void {
  validateChildSlicesHost(candidate, issues);
  validateSharedImportsSlice(candidate, issues);
  validateChildSliceSiblings(candidate, issues);
  validateChildSliceAllowedCrossSlice(candidate, issues);
  validateChildSliceAliases(candidate, issues);
}

const CHILD_SLICES_HOST_MESSAGE =
  'requires peerIsolation: true and allowed: false on the same rule. The child wall runs inside the universe wall; without it childSlices would enforce nothing.';

/** childSlices on a classic rule is inert. Reject it instead of loading a wall that never runs. */
export function validateChildSlicesHost(candidate: Record<string, unknown>, issues: ArkConfigIssue[]): void {
  const rules = candidate.rules;
  if (!Array.isArray(rules)) return;
  rules.forEach((rule, index) => {
    if (!isObject(rule) || rule.childSlices === undefined) return;
    if (rule.peerIsolation === true && rule.allowed === false) return;
    issues.push({ path: `$.rules[${index}].childSlices`, message: CHILD_SLICES_HOST_MESSAGE });
  });
}

const SHARED_IMPORTS_SLICE_FORM_MESSAGE =
  'must be "deny", "deny-cross-parent", or { "mode": "deny-cross-parent", "stopAt": ["<composition root path or glob>"] }';

function stopAtEntryIssue(raw: string): string | null {
  const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
  if (trimmed.length === 0) return 'must be a non-empty path or glob';
  const bare = trimmed.replace(/^[./]+/, '');
  if (bare === '' || bare === '*' || bare === '**') return 'must not cover the whole tree';
  for (const part of trimmed.split('/')) {
    if (part.length === 0 || part === '.' || part === '..') {
      return 'must be a path or glob without empty, . or .. segments';
    }
  }
  return null;
}

/** String form unchanged. Object form carries composition roots the walk stops at. */
export function validateSharedImportsSlice(candidate: Record<string, unknown>, issues: ArkConfigIssue[]): void {
  const rules = candidate.rules;
  if (!Array.isArray(rules)) return;
  rules.forEach((rule, index) => {
    if (!isObject(rule) || rule.sharedImportsSlice === undefined) return;
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
    } else if (value.mode !== 'deny-cross-parent') {
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
    const seen = new Set<string>();
    stopAt.forEach((entry, entryIndex) => {
      const entryPath = `${path}.stopAt[${entryIndex}]`;
      if (typeof entry !== 'string') {
        issues.push({ path: entryPath, message: 'must be a non-empty path or glob' });
        return;
      }
      const issue = stopAtEntryIssue(entry);
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

const SIBLING_MODES = ['deny', 'advisory'] as const;

/**
 * String enum builds reject this object before they reach a decision.
 * The message names both forms so a bad value is obvious at config load.
 */
const SIBLINGS_FORM_MESSAGE =
  'must be "deny", "advisory", or { "default": "deny" | "advisory", "enforce": ["<child id or subtree path>"], "ratchet": true | false }';

export function validateChildSliceSiblings(candidate: Record<string, unknown>, issues: ArkConfigIssue[]): void {
  const rules = candidate.rules;
  if (!Array.isArray(rules)) return;
  rules.forEach((rule, index) => {
    if (!isObject(rule)) return;
    const child = rule.childSlices;
    if (!isObject(child) || child.siblings === undefined) return;
    const siblings = child.siblings;
    const path = `$.rules[${index}].childSlices.siblings`;
    if (typeof siblings === 'string') {
      if (!SIBLING_MODES.includes(siblings as (typeof SIBLING_MODES)[number])) {
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
    } else if (siblings.default !== 'deny' && siblings.default !== 'advisory') {
      issues.push({ path: `${path}.default`, message: 'must be deny or advisory' });
    }
    if (siblings.enforce === undefined) return;
    if (!Array.isArray(siblings.enforce)) {
      issues.push({
        path: `${path}.enforce`,
        message: 'must be an array of child slice ids or subtree paths',
      });
      return;
    }
    const seen = new Set<string>();
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

const BARE_CHILD_CROSS_SLICE =
  'must be a slice id with a slash. A bare name is ambiguous across universes.';

const WHOLE_SEGMENT_STAR =
  '* matches one whole path segment. ** and a partial segment are not wildcards.';

/**
 * Whole-segment `*` is legal only on this list. A bare name is rejected.
 * The universe allowedCrossSlice is not checked here and still treats `*` as a literal.
 */
function childCrossSlicePatternIssue(raw: string): string | null {
  const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
  if (trimmed.length === 0) return 'must be a non-empty slice id';
  if (!trimmed.includes('/')) return BARE_CHILD_CROSS_SLICE;
  const parts = trimmed.split('/');
  for (const part of parts) {
    if (part.length === 0 || part === '.' || part === '..') {
      return 'must be a slice id without empty, . or .. segments';
    }
    if (part.includes('*') && part !== '*') return WHOLE_SEGMENT_STAR;
  }
  return null;
}

function childCrossSlicePatternKey(raw: string): string {
  return trimTrailingSlashes(raw.trim().replace(/\\/g, '/')).toLowerCase();
}

export function validateChildSliceAllowedCrossSlice(
  candidate: Record<string, unknown>,
  issues: ArkConfigIssue[]
): void {
  const rules = candidate.rules;
  if (!Array.isArray(rules)) return;
  rules.forEach((rule, index) => {
    if (!isObject(rule)) return;
    const child = rule.childSlices;
    if (!isObject(child) || child.allowedCrossSlice === undefined) return;
    const edges = child.allowedCrossSlice;
    const path = `$.rules[${index}].childSlices.allowedCrossSlice`;
    if (!Array.isArray(edges)) {
      issues.push({ path, message: 'must be an array of { from, to } child slice ids' });
      return;
    }
    const seen = new Set<string>();
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
      for (const side of ['from', 'to'] as const) {
        const value = edge[side];
        const sidePath = `${edgePath}.${side}`;
        if (typeof value !== 'string' || value.trim().length === 0) {
          issues.push({ path: sidePath, message: 'must be a non-empty slice id' });
          continue;
        }
        const issue = childCrossSlicePatternIssue(value);
        if (issue) issues.push({ path: sidePath, message: issue });
      }
      if (typeof edge.from !== 'string' || typeof edge.to !== 'string') return;
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

const ALIAS_TARGET_MESSAGE =
  'must be a child of a universe shape this rule names (its universe sliceFolders shape plus one child segment). A bare name, a universe id alone, a target outside every universe shape, and a wildcard are rejected. Config load checks the shape only; doctor reports a target universe no file belongs to.';

const ALIAS_OVERLAP_MESSAGE =
  'overlaps a slice folder. An alias covers only files outside the slice trees.';

const ALIAS_SAME_FILE_MESSAGE = 'two slice aliases match the same file';

function aliasPathSegments(raw: string): string[] {
  return trimTrailingSlashes(raw.trim().replace(/\\/g, '/')).toLowerCase().split('/').filter((part) => part.length > 0);
}

/**
 * A `from` whose last segment has no wildcard is a folder form: it also covers
 * everything under it at match time (as sharedRoots does), so the overlap and
 * same-file checks see the subtree too.
 */
function aliasSegmentsWithSubtree(segments: readonly string[]): string[] {
  const last = segments[segments.length - 1];
  if (last === undefined || last.includes('*')) return [...segments];
  return [...segments, '**'];
}

function concreteGlobPrefix(segments: readonly string[]): string[] {
  const prefix: string[] = [];
  for (const segment of segments) {
    if (segment.includes('*')) break;
    prefix.push(segment);
  }
  return prefix;
}

function segmentsArePrefix(prefix: readonly string[], full: readonly string[]): boolean {
  if (prefix.length > full.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== full[index]) return false;
  }
  return true;
}

function anchoredSlicePrefix(entry: string): string[] | null {
  const segments = entry.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
  if (segments.length < 2 || segments[0] === '*' || segments[0] === '**') return null;
  if (!segments.some((part) => part === '*')) return null;
  const prefix: string[] = [];
  for (const segment of segments) {
    if (segment === '*' || segment === '**') break;
    if (segment.includes('*')) return null;
    prefix.push(segment);
  }
  return prefix.length > 0 ? prefix : null;
}

/** Trailing ** does not invent a slice-folder name the glob does not already reach. */
function globOverlapsAnchored(glob: readonly string[], patternPrefix: readonly string[]): boolean {
  const prefix = concreteGlobPrefix(glob);
  const wild = prefix.length < glob.length;
  const rooted = prefix[0] === 'src' || prefix[0] === 'app' ? prefix.slice(1) : prefix;
  if (segmentsArePrefix(patternPrefix, prefix) || segmentsArePrefix(patternPrefix, rooted)) return true;
  if (!wild) return false;
  return (
    (segmentsArePrefix(prefix, patternPrefix) && prefix.length < patternPrefix.length) ||
    (segmentsArePrefix(prefix, ['src', ...patternPrefix]) && prefix.length < patternPrefix.length + 1) ||
    (segmentsArePrefix(prefix, ['app', ...patternPrefix]) && prefix.length < patternPrefix.length + 1)
  );
}

function globOverlapsBare(glob: readonly string[], name: string): boolean {
  for (let index = 0; index < glob.length; index += 1) {
    if (glob[index] !== name && glob[index] !== '*') continue;
    const rest = glob.slice(index + 1);
    if (rest.length >= 2) return true;
    if (rest.some((segment) => segment === '*' || segment === '**')) return true;
  }
  const prefix = concreteGlobPrefix(glob);
  return (
    prefix.length < glob.length &&
    (prefix.length === 0 || (prefix.length === 1 && (prefix[0] === 'src' || prefix[0] === 'app')))
  );
}

function globOverlapsSliceEntry(glob: readonly string[], entry: string): boolean {
  const segments = entry.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
  if (segments.length === 1 && segments[0] && !segments[0].includes('*')) {
    return globOverlapsBare(glob, segments[0]);
  }
  const prefix = anchoredSlicePrefix(entry);
  return prefix ? globOverlapsAnchored(glob, prefix) : false;
}

function aliasGlobIssue(raw: string): string | null {
  const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
  if (trimmed.length === 0) return 'must be a non-empty path glob';
  if (trimmed === '*' || trimmed === '**') return 'must not cover the whole tree';
  for (const part of trimmed.split('/')) {
    if (part.length === 0 || part === '.' || part === '..') {
      return 'must be a path glob without empty, . or .. segments';
    }
    if (part === '*' || part === '**') continue;
    if (part.includes('*') || part.includes('?') || part.includes('{') || part.includes('[')) {
      return '* matches one whole path segment. ** is a whole segment. A partial segment is not a wildcard.';
    }
  }
  return null;
}

type UniverseShape = { literals: (string | null)[] };

function universeShapes(folders: unknown, identity: unknown): UniverseShape[] {
  const shapes: UniverseShape[] = [];
  if (!Array.isArray(folders)) return shapes;
  const stars = identity === 'stars';
  for (const raw of folders) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const segments = raw.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
    if (segments.length === 1 && segments[0] && !segments[0].includes('*')) {
      shapes.push({ literals: [segments[0], null] });
      continue;
    }
    if (segments.some((part) => part === '**' || (part.includes('*') && part !== '*'))) continue;
    if (!segments.includes('*')) continue;
    if (stars) {
      // Same rule as the slice id: drop only literals before the last literal.
      let lastLiteral = -1;
      for (let index = 0; index < segments.length; index += 1) {
        if (segments[index] !== '*') lastLiteral = index;
      }
      if (lastLiteral < 0) continue;
      shapes.push({
        literals: segments
          .filter((part, index) => index >= lastLiteral || part === '*')
          .map((part) => (part === '*' ? null : part)),
      });
      continue;
    }
    shapes.push({ literals: segments.map((part) => (part === '*' ? null : part)) });
  }
  return shapes;
}

function shapeMatches(shape: UniverseShape, segments: readonly string[]): boolean {
  if (shape.literals.length !== segments.length) return false;
  return shape.literals.every((literal, index) => literal === null || literal === segments[index]);
}

function aliasTargetIssue(raw: string, shapes: readonly UniverseShape[]): string | null {
  const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
  if (trimmed.length === 0 || trimmed.split('/').some((part) => part.length === 0 || part === '.' || part === '..')) {
    return ALIAS_TARGET_MESSAGE;
  }
  if (trimmed.includes('*') || !trimmed.includes('/')) return ALIAS_TARGET_MESSAGE;
  const parts = trimmed.split('/').map((part) => part.toLowerCase());
  if (shapes.length === 0) return ALIAS_TARGET_MESSAGE;
  if (shapes.some((shape) => shapeMatches(shape, parts))) return ALIAS_TARGET_MESSAGE;
  if (shapes.some((shape) => shapeMatches(shape, parts.slice(0, -1)))) return null;
  return ALIAS_TARGET_MESSAGE;
}

/** A leading src/ or app/ is optional at match time, so both spellings are one glob. */
function aliasGlobVariants(segments: readonly string[]): readonly (readonly string[])[] {
  const head = segments[0];
  if ((head === 'src' || head === 'app') && segments.length > 1) return [segments, segments.slice(1)];
  return [segments];
}

function aliasesCanMatchSameFile(left: readonly string[], right: readonly string[]): boolean {
  const leftVariants = aliasGlobVariants(left);
  const rightVariants = aliasGlobVariants(right);
  for (const a of leftVariants) {
    if (globsCanMatchSame(a, right, 0, 0, new Map())) return true;
  }
  for (const b of rightVariants) {
    if (globsCanMatchSame(left, b, 0, 0, new Map())) return true;
  }
  return false;
}

function globsCanMatchSame(
  left: readonly string[],
  right: readonly string[],
  i: number,
  j: number,
  memo: Map<string, boolean>
): boolean {
  const key = `${i}:${j}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  let matched = false;
  if (i === left.length && j === right.length) matched = true;
  else if (i < left.length && left[i] === '**') {
    matched =
      globsCanMatchSame(left, right, i + 1, j, memo) ||
      (j < right.length && globsCanMatchSame(left, right, i, j + 1, memo));
  } else if (j < right.length && right[j] === '**') {
    matched =
      globsCanMatchSame(left, right, i, j + 1, memo) ||
      (i < left.length && globsCanMatchSame(left, right, i + 1, j, memo));
  } else if (i < left.length && j < right.length) {
    const a = left[i];
    const b = right[j];
    if (a === b || a === '*' || b === '*') matched = globsCanMatchSame(left, right, i + 1, j + 1, memo);
  }
  memo.set(key, matched);
  return matched;
}

export function validateChildSliceAliases(candidate: Record<string, unknown>, issues: ArkConfigIssue[]): void {
  const rules = candidate.rules;
  if (!Array.isArray(rules)) return;
  rules.forEach((rule, index) => {
    if (!isObject(rule)) return;
    const child = rule.childSlices;
    if (!isObject(child) || child.sliceAliases === undefined) return;
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
    ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    const globs: string[][] = [];
    aliases.forEach((alias, aliasIndex) => {
      const aliasPath = `${path}[${aliasIndex}]`;
      if (!isObject(alias)) {
        issues.push({ path: aliasPath, message: 'must be an object with from and to' });
        return;
      }
      for (const key of Object.keys(alias)) {
        if (key !== 'from' && key !== 'to') {
          issues.push({ path: propertyPath(aliasPath, key), message: 'unknown field' });
        }
      }
      const from = alias.from;
      const to = alias.to;
      if (typeof from !== 'string' || from.trim().length === 0) {
        issues.push({ path: `${aliasPath}.from`, message: 'must be a non-empty path glob' });
      } else {
        const issue = aliasGlobIssue(from);
        if (issue) issues.push({ path: `${aliasPath}.from`, message: issue });
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
      } else {
        const issue = aliasTargetIssue(to, shapes);
        if (issue) issues.push({ path: `${aliasPath}.to`, message: issue });
      }
    });
  });
}
