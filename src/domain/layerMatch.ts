/**
 * Pure layer-glob matching for ark.config.json.
 *
 * **Canonical algorithm** for CLI, ESLint, and library consumers.
 * The CLI load path uses the generated `bin/ark-layer-match.mjs`
 * (`npm run generate:layer-match` / `npm run check:layer-match`).
 * Behavioral parity tests remain a safety net.
 */

export type LayerConfig = {
  name: string;
  patterns?: string[];
  exclude?: string[];
  forbiddenGlobals?: string[];
};

/**
 * How a starred `sliceFolders` prefix becomes a slice id.
 *
 * - `path` (default, also the absent value): every literal and every star
 *   binding. `lib/features` plus two stars → `lib/features/projects/rfi`.
 *   Byte-identical to the ids baselines and `allowedCrossSlice` already use.
 * - `stars`: last literal segment plus the star bindings.
 *   `lib/features` plus two stars, and `lib/repositories/features` plus two
 *   stars, both → `features/projects/rfi`.
 *   Prefix stripping stays inside `bindAnchoredSlice`. Bare names are unchanged.
 */
export type SliceIdentity = 'path' | 'stars';

/**
 * Layer-to-layer dependency rule from ark.config.json.
 *
 * - Classic: `{ from, to, allowed: false }` denies **cross-layer** edges only.
 *   Same-layer is always allowed without peerIsolation (historical short-circuit).
 * - `peerIsolation: true` + `allowed: false`: deny only when slice ids differ
 *   (same **or** cross layer). Same-slice → allow. File imports pass fromPath
 *   and toPath. Intent references pass fromPath only (intents are not files);
 *   a declared shared root is classified and does not deny. Missing fromPath,
 *   no slice folders, or unclassifiable slices → fail-closed.
 */
export type EdgeRule = {
  from: string;
  to: string;
  allowed?: boolean;
  /**
   * When true with `allowed: false`: deny only when importer and importee resolve
   * to different slice ids (parent/name, e.g. features/auth). Works same-layer
   * and cross-layer. See findDeniedEdgeRule.
   */
  peerIsolation?: boolean;
  /**
   * Slice parents. A bare name (`["features"]`) is an unanchored one-segment
   * match: `src/features/auth/api.ts` → `features/auth`. The next segment is
   * never a filename. A starred prefix (`lib` / `features` / `*` / `*`) is
   * anchored like `sharedRoots`. With `sliceIdentity` `"path"` (the default,
   * also when the key is absent) the slice id includes the literal prefix
   * plus the directories the stars bind (`lib/features/projects/rfi`), so
   * parallel trees get different ids. With `"stars"` it is the last literal
   * plus the star bindings, so the same feature has one id across parallel
   * trees.
   * When omitted, inferred from the layer's glob patterns (segment before a wildcard).
   */
  sliceFolders?: string[];
  /**
   * How a starred `sliceFolders` prefix is named. Absent and `"path"` keep
   * today's ids. `"stars"` is the last literal plus the star bindings, so the
   * same feature has one id across parallel trees.
   */
  sliceIdentity?: SliceIdentity;
  /**
   * Roots the repo declares **shared on purpose** (`["ui", "hooks", "lib/permissions"]`).
   *
   * A file under a declared shared root is *evidence*, not an unclassifiable path:
   * the repo has said this code belongs to no slice, so peerIsolation stops
   * reporting our inability to place it as a violation of their design.
   * Matched as a contiguous run of path segments anywhere in the repo-relative
   * path (so `ui` covers `src/ui/button.tsx`), case-insensitively; a root
   * containing `*` is matched as a glob. A path that still resolves to a slice
   * id keeps its slice — a shared root never shadows a real slice.
   *
   * Note: this only relaxes the *unclassifiable* branch. A genuine cross-slice
   * edge between two different slices still denies.
   */
  sharedRoots?: string[];
  /**
   * Directed cross-slice edges the repo declares on purpose — same shape as the
   * layer edges in `rules[]`, but between slice ids:
   * `[{ from: "features/checkout", to: "features/catalog" }]`.
   *
   * Each entry allows exactly one direction. Slice ids match either fully
   * (`features/auth`) or by bare slice name (`auth`), case-insensitively — a bare
   * name matches that name under *any* slice folder, so write the full id in a repo
   * with several slice parents. Everything not declared still denies.
   */
  allowedCrossSlice?: CrossSliceEdge[];
  /**
   * `"deny"`: a shared root may not import a slice. `"deny-cross-parent"` leaves
   * that hop allowed; a whole-graph pass then reports a slice that reaches
   * another universe only through shared. Absent keeps the hop allowed.
   * `allowedCrossSlice` does not excuse `"deny"`.
   */
  sharedImportsSlice?: 'deny' | 'deny-cross-parent';
  /**
   * Optional inner wall under this rule's universe wall. Absent: the universe
   * wall is the whole decision and check output stays byte-identical.
   * Present: a universe cross-slice deny is `CROSS_PARENT_SLICE`. An edge the
   * universe wall allows may still deny on the child wall.
   */
  childSlices?: ChildSlices;
  /** Optional override message for scanners / write-gate. */
  message?: string;
};

/**
 * Inner slice wall. `sliceFolders` names children under the universe.
 * A side with no child id (a flat file, or a `commonFolders` directory) is
 * universe common. `siblings` is `deny`, `advisory`, or `{ default, enforce }`.
 * Cross-parent has no knob. `parentMayImportChild` defaults to false.
 */
export type ChildSlices = {
  sliceFolders: string[];
  sliceIdentity?: SliceIdentity;
  commonFolders?: string[];
  siblings?: ChildSliceSiblings;
  parentMayImportChild?: boolean;
};

/** How the child wall treats a sibling crossing. Absent means `deny`. */
export type ChildSliceSiblingsMode = 'deny' | 'advisory';

/**
 * Per-subtree sibling enforcement. `default` is everyone not listed.
 * `enforce` names child slice ids or subtree paths. The list never loosens deny.
 */
export type ChildSliceSiblingsEnforce = {
  default: ChildSliceSiblingsMode;
  enforce?: string[];
};

export type ChildSliceSiblings = ChildSliceSiblingsMode | ChildSliceSiblingsEnforce;

/**
 * Last published arkgate that rejects `childSlices`. The rule schema sets
 * `additionalProperties: false`, so 4.8.22 and older refuse the whole config.
 */
export const CHILD_SLICES_REJECTED_THROUGH = '4.8.22';

/** A directed slice-to-slice edge the repo declares on purpose (peerIsolation). */
export type CrossSliceEdge = {
  /** Importing slice id (`features/checkout`) or bare slice name (`checkout`). */
  from: string;
  /** Imported slice id or bare slice name. */
  to: string;
};

/** Options for path-aware edge checks (peer isolation). */
export type EdgeCheckOptions = {
  /** Repo-relative path of the importing file. */
  fromPath?: string;
  /** Repo-relative path of the imported module. Omit for intent names (not files). */
  toPath?: string;
  /** Layer configs — used to infer sliceFolders when the rule omits them. */
  layers?: LayerConfig[];
};

const regexpCache = new Map<string, RegExp>();

function escapeLiteral(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Normalize path separators to `/` without destroying glob escape sequences.
 * `src\domain\x` → `src/domain/x` (Windows paths); `src/\{legacy\}/**` keeps `\{` / `\}`.
 * A plain `pattern.split('\\').join('/')` would eat those escapes.
 */
function normalizeGlobSeparators(pattern: string): string {
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

  const glob = normalizeGlobSeparators(pattern);
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

/**
 * Concrete (non-wildcard) path segments in a glob, left-to-right.
 * Used for path-anchored ranking so a domain folder glob can beat a broad
 * Application bag like src/lib when the file actually sits under domain/.
 */
export function concreteGlobSegments(pattern: string): string[] {
  const glob = normalizeGlobSeparators(String(pattern));
  return glob
    .split('/')
    .filter(Boolean)
    .filter(
      (seg) =>
        seg !== '**' &&
        seg !== '*' &&
        !seg.includes('*') &&
        !seg.includes('?') &&
        !seg.includes('{') &&
        !seg.includes('[')
    );
}

/**
 * Rank competing layer globs.
 *
 * Without a path: concrete-segment count + literal length (historical shape).
 * With a path: last matched concrete segment depth dominates so interior
 * domain/persistence folders beat Application/Presentation scatter bags
 * (DL-DOMAIN-SPECIFICITY / NEW-APP-VACUUM-LIB).
 */
export function patternSpecificity(pattern: string, relPath?: string): number {
  const glob = normalizeGlobSeparators(String(pattern));
  const concrete = concreteGlobSegments(glob);
  const literalLength = glob.replace(/\*/g, '').length;
  const base = concrete.length * 10000 + literalLength;
  if (relPath === undefined || relPath === null || relPath === '') return base;

  const pathParts = String(relPath)
    .split(/[/\\]/)
    .filter(Boolean);
  if (concrete.length === 0) {
    // Pure wildcards (`**`, `*`) — weakest possible match.
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
      // Glob matched but segments could not be placed (braces / exotic globs) — base only.
      return base;
    }
    lastIdx = found;
    searchFrom = found + 1;
  }
  // Depth of last concrete segment dominates; then segment count; then length.
  return (lastIdx + 1) * 1_000_000 + concrete.length * 10000 + literalLength;
}

export type LayerMatchHit = {
  layer: string;
  pattern: string;
  score: number;
};

/**
 * All layers whose patterns match the path (excludes applied), with best score per layer.
 * Used for dual-membership coverage signals (P0A-DUAL-MATCH).
 */
export function matchingLayersForRelativePath(
  relPath: string,
  layers: LayerConfig[] | undefined
): LayerMatchHit[] {
  const rel = String(relPath).split(/[/\\]/).join('/');
  const byLayer = new Map<string, LayerMatchHit>();
  for (const layer of layers ?? []) {
    if ((layer.exclude ?? []).some((pattern) => globToRegExp(pattern).test(rel))) {
      continue;
    }
    for (const pattern of layer.patterns ?? []) {
      if (!globToRegExp(pattern).test(rel)) continue;
      const score = patternSpecificity(pattern, rel);
      const prev = byLayer.get(layer.name);
      if (!prev || score > prev.score) {
        byLayer.set(layer.name, { layer: layer.name, pattern, score });
      }
    }
  }
  return [...byLayer.values()].sort(
    (a, b) => b.score - a.score || a.layer.localeCompare(b.layer)
  );
}

export function layerForRelativePath(
  relPath: string,
  layers: LayerConfig[] | undefined
): string | undefined {
  // File paths (not globs): any OS separator → posix relative.
  const rel = String(relPath).split(/[/\\]/).join('/');
  let bestName: string | undefined;
  let bestScore = -1;
  for (const layer of layers ?? []) {
    if ((layer.exclude ?? []).some((pattern) => globToRegExp(pattern).test(rel))) {
      continue;
    }
    for (const pattern of layer.patterns ?? []) {
      if (globToRegExp(pattern).test(rel)) {
        const score = patternSpecificity(pattern, rel);
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
 * Includes the parent folder so `features/auth` ≠ `modules/auth`.
 * Identity is case-normalized for portable results across filesystems.
 * `src/features/auth/api.ts` + folders `["features"]` → `"features/auth"`.
 *
 * A bare name stays that unanchored one-segment match. The child segment is
 * never the filename, so a flat file under the parent is not its own slice.
 * A starred prefix (`lib` / `features` / `*` / `*`) reuses the shared-root
 * anchor: it must sit at offset 0, or at offset 1 after `src/` or `app/`.
 * With `sliceIdentity` `"path"` (the default) the slice id includes the
 * literal prefix plus the star bindings (`lib/features/projects/rfi`), so
 * parallel trees get different ids. With `"stars"` it is the last literal
 * plus those star bindings. A star never binds the filename; a file directly
 * under the last bound directory keeps that directory as its slice.
 */
export function sliceIdForPath(
  relPath: string,
  sliceFolders: string[] | undefined,
  sliceIdentity?: SliceIdentity
): string | undefined {
  if (!sliceFolders?.length) return undefined;
  const identity: SliceIdentity = sliceIdentity === 'stars' ? 'stars' : 'path';
  const parts = String(relPath)
    .split(/[/\\]/)
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const bare = new Set<string>();
  for (const raw of sliceFolders) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    if (isAnchoredSliceEntry(raw)) {
      const anchored = anchoredSliceId(parts, raw, identity);
      if (anchored) return anchored;
      continue;
    }
    if (!raw.includes('/') && !raw.includes('\\') && !raw.includes('*')) {
      bare.add(raw.toLowerCase());
    }
  }
  return bareSliceId(parts, bare);
}

/** A starred prefix with a real leading directory, not a bare name and not `*`. */
function isAnchoredSliceEntry(entry: string): boolean {
  const segments = entry.split(/[/\\]/).filter((part) => part.length > 0);
  if (segments.length < 2) return false;
  if (segments[0] === '*' || segments[0] === '**') return false;
  return segments.some((part) => part === '*');
}

function anchoredSliceId(
  parts: string[],
  raw: string,
  identity: SliceIdentity
): string | undefined {
  const pattern = raw
    .split(/[/\\]/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
  const offsets = anchorOffsets(parts, pattern[0] ?? '');
  for (const offset of offsets) {
    const id = bindAnchoredSlice(parts, pattern, offset, identity);
    if (id) return id;
  }
  return undefined;
}

/**
 * Walk an anchored pattern from `offset`. Literals must match. Each matching
 * literal is part of the bound segments, and each `*` binds one directory.
 * A star stops before the filename; leftover stars then end the id at the
 * last directory that did bind. Segments `lib` / `features` / `*` / `*`
 * (the pattern `lib/features` plus two stars) therefore yield
 * `lib/features/projects/rfi` under `path`.
 *
 * `path` returns every bound segment (literal prefix plus star bindings), so
 * a parallel tree (`components` / `features` / `*` / `*`) gets a different
 * id. `stars` drops the literal prefix before the last literal and keeps
 * that literal plus the star bindings.
 */
function bindAnchoredSlice(
  parts: string[],
  pattern: string[],
  offset: number,
  identity: SliceIdentity = 'path'
): string | undefined {
  const bound: string[] = [];
  let lastLiteralAt = -1;
  let index = offset;
  for (let pi = 0; pi < pattern.length; pi += 1) {
    const segment = pattern[pi];
    if (segment === '*') {
      if (index >= parts.length - 1) {
        for (let rest = pi; rest < pattern.length; rest += 1) {
          if (pattern[rest] !== '*') return undefined;
        }
        break;
      }
      bound.push(parts[index].toLowerCase());
      index += 1;
      continue;
    }
    if (segment === '**' || index >= parts.length) return undefined;
    if (parts[index].toLowerCase() !== segment) return undefined;
    bound.push(parts[index].toLowerCase());
    lastLiteralAt = bound.length - 1;
    index += 1;
  }
  if (bound.length === 0) return undefined;
  if (identity === 'stars') {
    if (lastLiteralAt < 0) return undefined;
    return bound.slice(lastLiteralAt).join('/');
  }
  return bound.join('/');
}

/** Two starred prefixes that bind as the same id under `sliceIdentity: "stars"`. */
export type SliceIdentityCollision = {
  from: string;
  to: string;
  /** Shared stars stem, e.g. `features` plus two stars. */
  stem: string;
  /** The sliceFolders patterns that collapse. The warning names every one. */
  paths: readonly string[];
  message: string;
};

/**
 * Doctor warning input. Silent unless `sliceIdentity` is `"stars"` and two
 * different anchored prefixes share a stem (last literal plus the stars after it).
 */
export function sliceIdentityCollisions(
  rules: readonly Pick<EdgeRule, 'from' | 'to' | 'sliceFolders' | 'sliceIdentity'>[] | undefined
): SliceIdentityCollision[] {
  const out: SliceIdentityCollision[] = [];
  for (const rule of rules ?? []) {
    if (!rule || rule.sliceIdentity !== 'stars') continue;
    const groups = new Map<string, string[]>();
    const seen = new Map<string, Set<string>>();
    for (const raw of rule.sliceFolders ?? []) {
      if (typeof raw !== 'string' || raw.length === 0) continue;
      const stem = starsIdentityStem(raw);
      if (!stem) continue;
      const key = raw.split(/[/\\]/).filter((part) => part.length > 0).join('/').toLowerCase();
      const groupSeen = seen.get(stem) ?? new Set<string>();
      if (groupSeen.has(key)) continue;
      groupSeen.add(key);
      seen.set(stem, groupSeen);
      const paths = groups.get(stem) ?? [];
      paths.push(raw);
      groups.set(stem, paths);
    }
    for (const [stem, paths] of groups) {
      if (paths.length < 2) continue;
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

/** Last literal plus the stars that follow it. `**` never forms a stem. */
function starsIdentityStem(raw: string): string | undefined {
  if (!isAnchoredSliceEntry(raw)) return undefined;
  const segments = raw
    .split(/[/\\]/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
  let lastLiteral = -1;
  for (let i = 0; i < segments.length; i += 1) {
    const part = segments[i] ?? '';
    if (part === '**') return undefined;
    if (part !== '*') lastLiteral = i;
  }
  if (lastLiteral < 0) return undefined;
  const tail = segments.slice(lastLiteral);
  if (tail.some((part, index) => index > 0 && part !== '*')) return undefined;
  return tail.join('/');
}

function formatSliceIdentityCollision(
  from: string,
  to: string,
  paths: readonly string[],
  stem: string
): string {
  const named =
    paths.length === 2
      ? `${paths[0]} and ${paths[1]}`
      : `${paths.slice(0, -1).join(', ')}, and ${paths[paths.length - 1]}`;
  return `${from} → ${to}: sliceIdentity "stars" gives one slice id to ${named}. They bind as ${stem}.`;
}

/** Bare names: leftmost folder, plus the next directory. Never the filename. */
function bareSliceId(parts: string[], names: Set<string>): string | undefined {
  if (names.size === 0) return undefined;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!names.has(parts[i].toLowerCase())) continue;
    if (i + 1 >= parts.length - 1) continue;
    return `${parts[i].toLowerCase()}/${parts[i + 1].toLowerCase()}`;
  }
  return undefined;
}

/**
 * Infer slice parent folders from layer globs: the path segment immediately
 * before a `*` or `**` wildcard (e.g. `src/features/**` → `features`).
 */
export function inferSliceFoldersFromPatterns(
  patterns: string[] | undefined
): string[] {
  const out = new Set<string>();
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

function resolveSliceFolders(
  rule: EdgeRule,
  layerName: string,
  layers: LayerConfig[] | undefined
): string[] {
  if (Array.isArray(rule.sliceFolders) && rule.sliceFolders.length > 0) {
    return rule.sliceFolders.filter((s) => typeof s === 'string' && s.length > 0);
  }
  const layer = (layers ?? []).find((l) => l.name === layerName);
  return inferSliceFoldersFromPatterns(layer?.patterns);
}

function normalizeSegments(value: string): string[] {
  return String(value)
    .split(/[/\\]/)
    .filter((part) => Boolean(part) && part !== '.')
    .map((part) => part.toLowerCase());
}

/**
 * Trim trailing slashes without a regex.
 *
 * `/\/+$/` is a polynomial ReDoS on a value that comes from the repo's own
 * contract but is still library input: a root of many slashes makes the engine
 * retry from every start position. A scan is linear and says the same thing.
 */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

/** Source folders a declared shared root may sit under without being named. */
const SHARED_ROOT_SOURCE_PREFIXES = ['src', 'app'];

/**
 * Anchor at segment 0, or also at segment 1 when the path opens with `src/` or
 * `app/` and the declaration does not itself start with that folder.
 * Shared roots and starred slice prefixes share this offset.
 */
function anchorOffsets(parts: readonly string[], rootHead: string): number[] {
  const head = (parts[0] ?? '').toLowerCase();
  const root = rootHead.toLowerCase();
  return SHARED_ROOT_SOURCE_PREFIXES.includes(head) && root !== head ? [0, 1] : [0];
}

/** A root that would disable the wall wholesale is not a root. */
function isBlanketRoot(raw: string): boolean {
  const trimmed = trimTrailingSlashes(raw.replace(/^[./]+/, ''));
  return trimmed === '*' || trimmed === '**';
}

/**
 * Is `relPath` under one of the roots the rule declares shared on purpose?
 *
 * **Anchored**: the root must start the repo-relative
 * path, optionally after a single conventional source folder, so `ui` covers
 * `ui/button.tsx` and `src/ui/button.tsx` but NOT `modules/a/ui/x.tsx` — an
 * unanchored root would exempt a whole tree the author never declared. Deeper
 * or monorepo roots are written out (`packages/web/src/ui`) or globbed
 * (`packages/*​/src/ui`). Matching is case-insensitive; a root containing `*`
 * is matched as a glob (also case-insensitively) against the whole path, and a
 * bare `*` / `**` is refused because it would disable fail-closed wholesale.
 */
export function pathUnderSharedRoot(
  relPath: string | undefined,
  sharedRoots: string[] | undefined
): boolean {
  if (!relPath || !sharedRoots?.length) return false;
  const rel = String(relPath).split(/[/\\]/).join('/');
  const lowerRel = rel.toLowerCase();
  const parts = normalizeSegments(rel);
  for (const raw of sharedRoots) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    if (isBlanketRoot(raw)) continue;
    if (raw.includes('*')) {
      const glob = trimTrailingSlashes(raw.toLowerCase());
      if (globToRegExp(glob).test(lowerRel) || globToRegExp(`${glob}/**`).test(lowerRel)) {
        return true;
      }
      continue;
    }
    const root = normalizeSegments(raw);
    if (root.length === 0) continue;
    const offsets = anchorOffsets(parts, root[0] ?? '');
    for (const offset of offsets) {
      if (offset + root.length > parts.length) continue;
      let hit = true;
      for (let j = 0; j < root.length; j += 1) {
        if (parts[offset + j] !== root[j]) {
          hit = false;
          break;
        }
      }
      if (hit) return true;
    }
  }
  return false;
}

function sliceMatchesDeclaration(declared: string, sliceId: string): boolean {
  const want = String(declared).split(/[/\\]/).filter(Boolean).join('/').toLowerCase();
  if (!want) return false;
  const have = sliceId.toLowerCase();
  if (want === have) return true;
  // Bare slice name: `auth` matches `features/auth`.
  return !want.includes('/') && have.endsWith(`/${want}`);
}

/** Has the rule declared this directed slice→slice edge? */
export function crossSliceEdgeAllowed(
  allowedCrossSlice: CrossSliceEdge[] | undefined,
  fromSlice: string | undefined,
  toSlice: string | undefined
): boolean {
  if (!allowedCrossSlice?.length || !fromSlice || !toSlice) return false;
  return allowedCrossSlice.some(
    (edge) =>
      edge &&
      typeof edge.from === 'string' &&
      typeof edge.to === 'string' &&
      sliceMatchesDeclaration(edge.from, fromSlice) &&
      sliceMatchesDeclaration(edge.to, toSlice)
  );
}

/**
 * Why a peerIsolation rule denied an edge. `cross-slice` is a fact about the
 * repo's code; the other three are facts about the *evidence* ArkGate had.
 */
export type PeerIsolationDenyReason =
  | 'missing-path'
  | 'no-slice-folders'
  | 'unclassifiable-path'
  | 'cross-slice'
  | 'shared-imports-slice';

export type PeerIsolationDecision = {
  denied: boolean;
  /** Present only when `denied` is true. */
  reason?: PeerIsolationDenyReason;
};

/** Public reason on a nested-wall finding. The ruleId stays LAYER_IMPORT_VIOLATION. */
export type SliceReasonId =
  | 'CROSS_PARENT_SLICE'
  | 'CROSS_SIBLING_SLICE'
  | 'CROSS_PARENT_VIA_SHARED';

/**
 * Which wall produced the finding. `none` is an allow. `fail-closed` is a
 * universe-wall evidence deny (missing path, no folders, unclassifiable).
 */
export type SliceCrossing =
  | 'none'
  | 'cross-parent'
  | 'cross-sibling'
  | 'parent-imports-child'
  | 'fail-closed';

/**
 * One slice finding. Reporting sites read this and stop branching on the
 * universe-wall reason. Evaluation order stays inside the domain: universe
 * wall first, child wall only when that wall allowed the edge.
 */
export type SliceVerdict = {
  crossing: SliceCrossing;
  decision: 'allow' | 'deny' | 'advisory';
  reasonId?: SliceReasonId;
  /** Sentence appended to the finding. Omitted on an allow. */
  explanation?: string;
  /**
   * Universe-wall reason when that wall denied. Absent when only the child
   * wall produced the finding. Intent copy still uses this so a plain
   * cross-slice deny keeps today's message.
   */
  peerIsolationReason?: PeerIsolationDenyReason;
  /** Universe slice id of the importer, when the universe wall classified it. */
  fromUniverse?: string;
  /** Universe slice id of the importee, when the universe wall classified it. */
  toUniverse?: string;
};

export type PeerIsolationInput = {
  fromPath?: string;
  toPath?: string;
  folderCount: number;
  fromSlice?: string;
  toSlice?: string;
  /** Importer sits under a root the rule declares shared. */
  fromShared?: boolean;
  /** Importee sits under a root the rule declares shared. */
  toShared?: boolean;
  /** The rule declares this directed slice→slice edge. */
  crossSliceAllowed?: boolean;
  /** `"deny"` blocks a shared root importing a slice. `"deny-cross-parent"` does not. */
  sharedImportsSlice?: 'deny' | 'deny-cross-parent';
};

/**
 * PeerIsolation deny decision with the reason that fired (DF04 pure core).
 *
 * Fail-closed stays fail-closed: absent evidence denies. What changed in 4.8.4
 * is what counts as evidence — a declared shared root, or a declared directed
 * cross-slice edge, is the repo telling us its design, so it is no longer
 * "unclassifiable". Order: no fromPath → no slice folders → intent (no toPath):
 * shared-root allow / slice fail-closed → a side that is neither in a slice nor
 * declared shared → shared root importing a slice (only when the rule denies
 * that hop) → same slice → declared cross edge → deny.
 *
 * Intent/event names are not files. Callers pass fromPath only and must not
 * invent a toPath (that would mis-slice). A declared shared root is classified
 * the same way as on import edges.
 */
export function peerIsolationDecision(input: PeerIsolationInput): PeerIsolationDecision {
  if (!input.fromPath) return { denied: true, reason: 'missing-path' };
  if (input.folderCount <= 0) return { denied: true, reason: 'no-slice-folders' };
  const fromClassified = Boolean(input.fromSlice) || input.fromShared === true;
  if (!input.toPath) {
    if (!fromClassified) return { denied: true, reason: 'unclassifiable-path' };
    if (!input.fromSlice) return { denied: false };
    return { denied: true, reason: 'missing-path' };
  }
  const toClassified = Boolean(input.toSlice) || input.toShared === true;
  if (!fromClassified || !toClassified) return { denied: true, reason: 'unclassifiable-path' };
  // Shared roots are a sink. The hop is allowed unless the rule opts in.
  // allowedCrossSlice does not excuse it: this is not a slice-to-slice edge.
  if (
    input.sharedImportsSlice === 'deny' &&
    input.fromShared === true &&
    Boolean(input.toSlice) &&
    !input.fromSlice
  ) {
    return { denied: true, reason: 'shared-imports-slice' };
  }
  // At least one side is declared shared (and carries no slice id): the repo
  // said this code belongs to no slice, so there is no cross-slice edge here.
  if (!input.fromSlice || !input.toSlice) return { denied: false };
  if (input.fromSlice === input.toSlice) return { denied: false };
  if (input.crossSliceAllowed) return { denied: false };
  return { denied: true, reason: 'cross-slice' };
}

/**
 * Boolean face of {@link peerIsolationDecision}, kept for parity consumers.
 *
 * Fail-closed: missing fromPath, no classifiable folders, or unclassifiable
 * either side → deny. Intent refs (no toPath) allow only a declared shared
 * root. Same-slice → allow (return false). Cross-slice → deny unless the
 * rule declared that directed edge.
 */
export function peerIsolationMustDeny(input: PeerIsolationInput): boolean {
  return peerIsolationDecision(input).denied;
}

/**
 * One human sentence naming which peerIsolation reason fired — so the denial
 * reports a fact about their code (`cross-slice`) or a fact about our evidence
 * (everything else), never one dressed as the other.
 */
export function peerIsolationDenyExplanation(
  reason: PeerIsolationDenyReason,
  context: {
    fromPath?: string;
    toPath?: string;
    fromSlice?: string;
    toSlice?: string;
  }
): string {
  switch (reason) {
    case 'cross-slice':
      return `cross-slice edge ${context.fromSlice ?? '?'} → ${context.toSlice ?? '?'}. Extract the shared code, use events/ports across slices, or declare the edge in the rule's allowedCrossSlice.`;
    case 'shared-imports-slice':
      return `shared root imports slice ${context.toSlice ?? '?'} (${context.fromPath ?? '?'} → ${context.toPath ?? '?'}). The wall is direct-only.`;
    case 'unclassifiable-path': {
      const unplaced = [
        context.fromSlice ? undefined : context.fromPath,
        context.toSlice ? undefined : context.toPath,
      ].filter((path): path is string => Boolean(path));
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

function crossParentExplanation(fromSlice?: string, toSlice?: string): string {
  return `cross-parent slice ${fromSlice ?? '?'} → ${toSlice ?? '?'}. The child wall cannot allow another universe.`;
}

function crossSiblingExplanation(fromChild: string, toChild: string, universe: string): string {
  return `cross-sibling slice ${fromChild} → ${toChild} inside ${universe}.`;
}

function parentImportsChildExplanation(toChild: string): string {
  return `universe common imports child ${toChild}. parentMayImportChild is off.`;
}

/** Last path segment of a universe slice id (`features/projects` → `projects`). */
export function universePairLabel(sliceId: string | undefined): string | undefined {
  if (!sliceId) return undefined;
  const parts = sliceId.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : undefined;
}

function directorySegments(relPath: string): string[] {
  const parts = String(relPath).split(/[/\\]/).filter(Boolean);
  return parts.slice(0, -1);
}

function pathHasCommonFolder(relPath: string, commonFolders: string[] | undefined): boolean {
  if (!commonFolders?.length) return false;
  const names = new Set<string>();
  for (const raw of commonFolders) {
    if (typeof raw === 'string' && raw.length > 0) names.add(raw.toLowerCase());
  }
  if (names.size === 0) return false;
  return directorySegments(relPath).some((part) => names.has(part.toLowerCase()));
}

/**
 * Child id for one path. A common folder and a flat file (the starred id does
 * not grow past the universe id) are universe common. A child id that does not
 * extend the universe id is not used; the caller warns.
 */
export function resolveChildSliceId(
  relPath: string | undefined,
  universeId: string | undefined,
  child: ChildSlices | undefined
): { childId?: string; mismatched?: { childId: string; universeId: string } } {
  if (!relPath || !child?.sliceFolders?.length) return {};
  if (pathHasCommonFolder(relPath, child.commonFolders)) return {};
  const raw = sliceIdForPath(relPath, child.sliceFolders, child.sliceIdentity);
  if (!raw || !universeId) return {};
  const childKey = raw.toLowerCase();
  const universeKey = universeId.toLowerCase();
  if (childKey === universeKey) return {};
  if (childKey.startsWith(`${universeKey}/`)) return { childId: raw };
  return { mismatched: { childId: raw, universeId } };
}

function siblingEntryKey(entry: string): string {
  return entry.trim().replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
}

function stripSrcOrApp(value: string): string {
  return value.replace(/^(?:src|app)\//, '');
}

/** True when the importer file sits in this directory, with or without src/ or app/. */
function pathUnderSubtree(filePath: string, entry: string): boolean {
  const file = filePath.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  const prefix = stripSrcOrApp(entry);
  if (!prefix) return false;
  const rooted = stripSrcOrApp(file);
  return (
    file === prefix ||
    file.startsWith(`${prefix}/`) ||
    rooted === prefix ||
    rooted.startsWith(`${prefix}/`)
  );
}

/**
 * Child slice id matches exactly. A path matches the importer file's directory.
 * Bare names do not match. `*` is not a wildcard.
 */
export function importerInEnforcedSubtree(
  fromPath: string | undefined,
  fromChild: string | undefined,
  entries: readonly string[] | undefined
): boolean {
  if (!fromChild || !entries?.length) return false;
  const child = fromChild.toLowerCase();
  for (const raw of entries) {
    if (typeof raw !== 'string') continue;
    const entry = siblingEntryKey(raw);
    if (!entry || entry.includes('*')) continue;
    if (child === entry) return true;
    if (fromPath && pathUnderSubtree(fromPath, entry)) return true;
  }
  return false;
}

/**
 * String `advisory` warns every sibling crossing. String `deny` and an absent
 * value deny every one. An object denies the importer only when it is listed,
 * unless `default` is already `deny`.
 */
export function siblingCrossingAdvisory(
  siblings: ChildSliceSiblings | undefined,
  fromPath: string | undefined,
  fromChild: string | undefined
): boolean {
  if (siblings == null || siblings === 'deny') return false;
  if (siblings === 'advisory') return true;
  if (siblings.default === 'deny') return false;
  return !importerInEnforcedSubtree(fromPath, fromChild, siblings.enforce);
}

/**
 * Universe wall, then the child wall. An allow from the child wall never
 * overturns a universe deny: that deny returns before the child wall runs.
 */
export function evaluateNestedSliceWall(input: {
  rule: EdgeRule;
  fromPath?: string;
  toPath?: string;
  fromSlice?: string;
  toSlice?: string;
  fromShared?: boolean;
  toShared?: boolean;
  crossSliceAllowed?: boolean;
  folderCount: number;
}): SliceVerdict {
  const universe = peerIsolationDecision({
    fromPath: input.fromPath,
    toPath: input.toPath,
    folderCount: input.folderCount,
    fromSlice: input.fromSlice,
    toSlice: input.toSlice,
    fromShared: input.fromShared,
    toShared: input.toShared,
    crossSliceAllowed: input.crossSliceAllowed,
    sharedImportsSlice: input.rule.sharedImportsSlice,
  });
  if (universe.denied) {
    const crossParent = Boolean(input.rule.childSlices) && universe.reason === 'cross-slice';
    return {
      crossing: universe.reason === 'cross-slice' ? 'cross-parent' : 'fail-closed',
      decision: 'deny',
      ...(crossParent ? { reasonId: 'CROSS_PARENT_SLICE' as const } : {}),
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
  const fromChild = resolveChildSliceId(input.fromPath, input.fromSlice, child).childId;
  const toChild = resolveChildSliceId(input.toPath, input.toSlice, child).childId;
  const allowSameUniverse = {
    crossing: 'none' as const,
    decision: 'allow' as const,
    fromUniverse: input.fromSlice,
    toUniverse: input.toSlice,
  };
  if (fromChild && toChild && fromChild !== toChild) {
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

/**
 * Finding message. Import sites always append the explanation. Intent sites
 * keep today's wording when there is no reasonId: a plain cross-slice deny
 * does not gain a clause, and any other universe-wall reason does.
 */
export function composeSliceDenialMessage(input: {
  surface: 'import' | 'intent';
  verdict: SliceVerdict;
  fromLayer: string;
  toLayer: string;
  kind?: string;
  fromPath?: string;
  toPath?: string;
  ruleMessage?: string;
  defaultMessage?: string;
}): string {
  const explanation = input.verdict.explanation;
  if (input.surface === 'intent') {
    const defaultMessage =
      input.defaultMessage ?? `${input.fromLayer} must not reference ${input.toLayer} intent.`;
    if (input.verdict.reasonId && explanation) return `${defaultMessage} ${explanation}`;
    if (explanation && input.verdict.peerIsolationReason !== 'cross-slice') {
      return `${defaultMessage} ${explanation}`;
    }
    if (input.ruleMessage) {
      return explanation ? `${input.ruleMessage} (${explanation})` : input.ruleMessage;
    }
    return defaultMessage;
  }
  if (input.ruleMessage) {
    return explanation ? `${input.ruleMessage} (${explanation})` : input.ruleMessage;
  }
  if (explanation) {
    const kind = input.kind ?? 'import';
    return `${input.fromLayer} must not ${kind} another slice of ${input.toLayer} (${input.fromPath} → ${input.toPath}): ${explanation}`;
  }
  return `${input.fromLayer} must not ${input.kind ?? 'import'} ${input.toLayer}.`;
}

/** Fields a reporting site copies onto a finding. Absent when the verdict allows. */
export function sliceFindingExtras(verdict: SliceVerdict | undefined): {
  reasonId?: SliceReasonId;
  universeFrom?: string;
  universeTo?: string;
  failsStrict?: false;
  severity?: 'warning';
} {
  if (!verdict || verdict.decision === 'allow') return {};
  const from = universePairLabel(verdict.fromUniverse);
  const to = universePairLabel(verdict.toUniverse);
  return {
    ...(verdict.reasonId ? { reasonId: verdict.reasonId } : {}),
    ...(verdict.reasonId && from && to ? { universeFrom: from, universeTo: to } : {}),
    ...(verdict.decision === 'advisory'
      ? { failsStrict: false as const, severity: 'warning' as const }
      : {}),
  };
}

/** True when this siblings value still leaves some crossings advisory. An enforce list does not finish the house. */
export function childWallSiblingsAdvisory(siblings: unknown): boolean {
  if (siblings === 'advisory') return true;
  if (siblings !== null && typeof siblings === 'object') {
    return (siblings as { default?: unknown }).default !== 'deny';
  }
  return false;
}

export function anyChildWallAdvisory(
  rules: readonly { childSlices?: { siblings?: unknown } }[] | undefined
): boolean {
  return (rules ?? []).some(
    (rule) => rule?.childSlices != null && childWallSiblingsAdvisory(rule.childSlices.siblings)
  );
}

export type SliceCountReport = {
  crossParent: number;
  crossSibling: number;
  pairs: { from: string; to: string; count: number }[];
};

/** Doctor counts. Null when this scan has no nested-wall reason, so the key stays absent. */
export function sliceCountReport(
  violations: readonly { reasonId?: unknown; universeFrom?: unknown; universeTo?: unknown }[] | undefined
): SliceCountReport | null {
  let crossParent = 0;
  let crossSibling = 0;
  const pairs = new Map<string, { from: string; to: string; count: number }>();
  for (const row of violations ?? []) {
    if (row.reasonId === 'CROSS_PARENT_SLICE') {
      crossParent += 1;
      if (typeof row.universeFrom === 'string' && typeof row.universeTo === 'string') {
        const key = `${row.universeFrom}\0${row.universeTo}`;
        const prev = pairs.get(key);
        if (prev) prev.count += 1;
        else pairs.set(key, { from: row.universeFrom, to: row.universeTo, count: 1 });
      }
    } else if (row.reasonId === 'CROSS_SIBLING_SLICE') {
      crossSibling += 1;
    }
  }
  if (crossParent === 0 && crossSibling === 0) return null;
  return {
    crossParent,
    crossSibling,
    pairs: [...pairs.values()].sort(
      (left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)
    ),
  };
}

export type ChildSliceConfigFinding = {
  ruleId: 'CONFIG_CHILD_SLICES_VERSION' | 'CONFIG_CHILD_SLICE_EXTENDS';
  message: string;
  failsStrict: false;
  path?: string;
  fromLayer?: string;
  toLayer?: string;
};

/**
 * One version warning when any rule sets childSlices, plus one warning per
 * directed rule when a path's child id does not extend its universe id.
 */
export function childSliceConfigFindings(
  rules: readonly EdgeRule[] | undefined,
  files: readonly string[]
): ChildSliceConfigFinding[] {
  const out: ChildSliceConfigFinding[] = [];
  let versionWarned = false;
  const seenMismatch = new Set<string>();
  for (const rule of rules ?? []) {
    if (!rule?.childSlices) continue;
    if (!versionWarned) {
      versionWarned = true;
      out.push({
        ruleId: 'CONFIG_CHILD_SLICES_VERSION',
        failsStrict: false,
        message: `childSlices needs an arkgate newer than ${CHILD_SLICES_REJECTED_THROUGH}. Version ${CHILD_SLICES_REJECTED_THROUGH} and older reject the key because the rule schema sets additionalProperties: false.`,
      });
    }
    if (!rule.peerIsolation) continue;
    for (const file of files) {
      const universeId = sliceIdForPath(file, rule.sliceFolders, rule.sliceIdentity);
      const resolved = resolveChildSliceId(file, universeId, rule.childSlices);
      if (!resolved.mismatched) continue;
      const key = `${rule.from}\0${rule.to}\0${resolved.mismatched.universeId}\0${resolved.mismatched.childId}`;
      if (seenMismatch.has(key)) continue;
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
  }
  return out;
}

/**
 * Advisory sibling crossings above the recorded baseline count become blocking.
 * The key is the existing baseline identity (ruleId, file, layers, target) —
 * reasonId is not part of it. No baseline means there is no recorded count,
 * so advisory stays non-blocking. Recorded crossings stay advisory.
 */
export function applyAdvisorySiblingRatchet<
  T extends { reasonId?: string; failsStrict?: boolean; severity?: string },
>(violations: readonly T[], occurrenceKeys: readonly string[], recordedKeys: ReadonlySet<string>): T[] {
  const indexes: number[] = [];
  for (let index = 0; index < violations.length; index += 1) {
    if (violations[index]?.reasonId === 'CROSS_SIBLING_SLICE') indexes.push(index);
  }
  if (indexes.length === 0) return [...violations];
  let recorded = 0;
  for (const index of indexes) {
    if (recordedKeys.has(occurrenceKeys[index] ?? '')) recorded += 1;
  }
  if (indexes.length <= recorded) return [...violations];
  return violations.map((violation, index) => {
    if (violation.reasonId !== 'CROSS_SIBLING_SLICE') return violation;
    if (recordedKeys.has(occurrenceKeys[index] ?? '')) return violation;
    if (violation.failsStrict !== false) return violation;
    return { ...violation, failsStrict: true, severity: 'error' };
  });
}

/**
 * Find the first denying rule for a layer edge.
 *
 * Semantics (locked):
 * - Classic (`allowed: false`, no peerIsolation): deny cross-layer edges only.
 *   Same-layer is always allowed (historical short-circuit).
 * - `peerIsolation: true` + `allowed: false`: deny only when importer and importee
 *   resolve to **different** slice ids (same or cross layer). Same-slice → allow.
 *   File imports pass fromPath + toPath. Intent references pass fromPath only.
 *   A declared shared root is classified (no denial). Missing fromPath, no slice
 *   folders, or unclassifiable slices → **fail-closed** (deny): isolation is
 *   configured, so insufficient evidence must not silently allow a possible
 *   cross-slice edge.
 */
export function findDeniedEdgeRule(
  rules: EdgeRule[] | undefined,
  from: string,
  to: string,
  options?: EdgeCheckOptions
): EdgeRule | undefined {
  return findDeniedEdgeDecision(rules, from, to, options)?.rule;
}

/** The denying rule plus the one slice verdict reporting sites consume. */
export type DeniedEdgeDecision = {
  rule: EdgeRule;
  /** Only for a peerIsolation denial. Universe-wall reason; absent for a child-only finding. */
  peerIsolationReason?: PeerIsolationDenyReason;
  /** Resolved universe slice id of the importer, when classifiable. */
  fromSlice?: string;
  /** Resolved universe slice id of the importee, when classifiable. */
  toSlice?: string;
  /** Present for every peerIsolation finding, including advisory sibling crossings. */
  sliceVerdict?: SliceVerdict;
};

/**
 * {@link findDeniedEdgeRule} with the denial reason attached, so adapters can
 * say *why* a peerIsolation rule fired instead of emitting one opaque message
 * for a real cross-slice import and for a file we simply could not place.
 */
export function findDeniedEdgeDecision(
  rules: EdgeRule[] | undefined,
  from: string,
  to: string,
  options?: EdgeCheckOptions
): DeniedEdgeDecision | undefined {
  for (const rule of rules ?? []) {
    if (rule.from !== from || rule.to !== to) continue;
    if (rule.allowed !== false) continue;

    if (rule.peerIsolation) {
      const fromPath = options?.fromPath;
      const toPath = options?.toPath;
      const folders = resolveSliceFolders(rule, from, options?.layers);
      const fromSlice = fromPath
        ? sliceIdForPath(fromPath, folders, rule.sliceIdentity)
        : undefined;
      const toSlice = toPath ? sliceIdForPath(toPath, folders, rule.sliceIdentity) : undefined;
      const verdict = evaluateNestedSliceWall({
        rule,
        fromPath,
        toPath,
        folderCount: folders.length,
        fromSlice,
        toSlice,
        fromShared: !fromSlice && pathUnderSharedRoot(fromPath, rule.sharedRoots),
        toShared: !toSlice && pathUnderSharedRoot(toPath, rule.sharedRoots),
        crossSliceAllowed: crossSliceEdgeAllowed(rule.allowedCrossSlice, fromSlice, toSlice),
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
      continue; // same slice, declared shared, declared cross edge, or child wall allow
    }

    // Classic deny — same-layer always allowed without peerIsolation
    if (from === to) continue;
    return { rule };
  }
  return undefined;
}

/** A shared root importing a slice while the deny flag is off. Doctor lists these. */
export type SharedImportsSliceBridge = {
  fromPath: string;
  toPath: string;
  toSlice: string;
};

/**
 * Shared-root → slice edges the check still allows. Listed so a green run
 * says the wall is direct-only. When the rule sets `sharedImportsSlice: "deny"`
 * the same hop is a violation instead, so it is not listed twice.
 */
export function findSharedImportsSliceBridge(
  rules: EdgeRule[] | undefined,
  from: string,
  to: string,
  options?: EdgeCheckOptions
): SharedImportsSliceBridge | undefined {
  const fromPath = options?.fromPath;
  const toPath = options?.toPath;
  if (!fromPath || !toPath) return undefined;
  for (const rule of rules ?? []) {
    if (rule.from !== from || rule.to !== to) continue;
    if (rule.allowed !== false || !rule.peerIsolation) continue;
    if (rule.sharedImportsSlice === 'deny') continue;
    const folders = resolveSliceFolders(rule, from, options?.layers);
    const fromSlice = sliceIdForPath(fromPath, folders, rule.sliceIdentity);
    const toSlice = sliceIdForPath(toPath, folders, rule.sliceIdentity);
    if (fromSlice || !toSlice) continue;
    if (!pathUnderSharedRoot(fromPath, rule.sharedRoots)) continue;
    return { fromPath, toPath, toSlice };
  }
  return undefined;
}

export function isEdgeDenied(
  rules: EdgeRule[] | undefined,
  from: string,
  to: string,
  options?: EdgeCheckOptions
): boolean {
  return findDeniedEdgeRule(rules, from, to, options) !== undefined;
}

/** Codegen globs skipped by default scan (emitted into the CLI derived matcher). */
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

/** Slice folders the universe wall uses: the rule's list, or the from-layer patterns. */
export function peerSliceFolders(
  rule: EdgeRule,
  layerName: string,
  layers: LayerConfig[] | undefined
): string[] {
  return resolveSliceFolders(rule, layerName, layers);
}
