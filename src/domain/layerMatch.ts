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
   * anchored like `sharedRoots`. The slice id includes the literal prefix
   * plus the directories the stars bind (`lib/features/projects/rfi`), so
   * parallel trees get different ids (tracked in #308).
   * When omitted, inferred from the layer's glob patterns (segment before a wildcard).
   */
  sliceFolders?: string[];
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
   * When `"deny"`, a declared shared root may not import a slice. Default
   * (absent) keeps that hop allowed. Slice → shared stays allowed either way.
   * `allowedCrossSlice` does not excuse this hop.
   */
  sharedImportsSlice?: 'deny';
  /** Optional override message for scanners / write-gate. */
  message?: string;
};

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
 * The slice id includes the literal prefix plus the star bindings
 * (`lib/features/projects/rfi`), so parallel trees get different ids
 * (tracked in #308). A star never binds the filename; a file directly under
 * the last bound directory keeps that directory as its slice.
 */
export function sliceIdForPath(
  relPath: string,
  sliceFolders: string[] | undefined
): string | undefined {
  if (!sliceFolders?.length) return undefined;
  const parts = String(relPath)
    .split(/[/\\]/)
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const bare = new Set<string>();
  for (const raw of sliceFolders) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    if (isAnchoredSliceEntry(raw)) {
      const anchored = anchoredSliceId(parts, raw);
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

function anchoredSliceId(parts: string[], raw: string): string | undefined {
  const pattern = raw
    .split(/[/\\]/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
  const offsets = anchorOffsets(parts, pattern[0] ?? '');
  for (const offset of offsets) {
    const id = bindAnchoredSlice(parts, pattern, offset);
    if (id) return id;
  }
  return undefined;
}

/**
 * Walk an anchored pattern from `offset`. Each matching literal is part of
 * the slice id, and each `*` binds one directory that is also part of the
 * id. A star stops before the filename; leftover stars then end the id at
 * the last directory that did bind. Segments `lib` / `features` / `*` / `*`
 * (the pattern `lib/features` plus two stars) therefore yield
 * `lib/features/projects/rfi` (literal prefix plus star bindings), so a
 * parallel tree (`components` / `features` / `*` / `*`) gets a different id
 * (tracked in #308).
 */
function bindAnchoredSlice(
  parts: string[],
  pattern: string[],
  offset: number
): string | undefined {
  const bound: string[] = [];
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
    index += 1;
  }
  return bound.length > 0 ? bound.join('/') : undefined;
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
  /** Rule opted in: a shared root may not import a slice. */
  sharedImportsSlice?: 'deny';
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

/** The denying rule plus, for peerIsolation, which reason fired and the slice evidence. */
export type DeniedEdgeDecision = {
  rule: EdgeRule;
  /** Only for a peerIsolation denial. */
  peerIsolationReason?: PeerIsolationDenyReason;
  /** Resolved slice id of the importer, when classifiable. */
  fromSlice?: string;
  /** Resolved slice id of the importee, when classifiable. */
  toSlice?: string;
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
      const fromSlice = fromPath ? sliceIdForPath(fromPath, folders) : undefined;
      const toSlice = toPath ? sliceIdForPath(toPath, folders) : undefined;
      const decision = peerIsolationDecision({
        fromPath,
        toPath,
        folderCount: folders.length,
        fromSlice,
        toSlice,
        fromShared: !fromSlice && pathUnderSharedRoot(fromPath, rule.sharedRoots),
        toShared: !toSlice && pathUnderSharedRoot(toPath, rule.sharedRoots),
        crossSliceAllowed: crossSliceEdgeAllowed(rule.allowedCrossSlice, fromSlice, toSlice),
        sharedImportsSlice: rule.sharedImportsSlice,
      });
      if (decision.denied) {
        return { rule, peerIsolationReason: decision.reason, fromSlice, toSlice };
      }
      continue; // same slice, declared shared, or declared cross edge: no denial
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
    const fromSlice = sliceIdForPath(fromPath, folders);
    const toSlice = sliceIdForPath(toPath, folders);
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
