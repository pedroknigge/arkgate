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
 *   (same **or** cross layer). Same-slice → allow. Needs fromPath/toPath; missing
 *   paths/slices → fail-closed (cannot prove same-slice).
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
   * Path segment names that own the slice id as the *next* segment
   * (e.g. `["features"]` → `src/features/auth/...` has slice `auth`).
   * When omitted, inferred from the layer's glob patterns (segment before `**`/`*`).
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
   * (`features/auth`) or by bare slice name (`auth`), case-insensitively.
   * Everything not declared still denies.
   */
  allowedCrossSlice?: CrossSliceEdge[];
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
  /** Repo-relative path of the imported module. */
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
 */
export function sliceIdForPath(
  relPath: string,
  sliceFolders: string[] | undefined
): string | undefined {
  if (!sliceFolders?.length) return undefined;
  const parts = String(relPath)
    .split(/[/\\]/)
    .filter(Boolean);
  const folders = new Set(sliceFolders.map((s) => String(s).toLowerCase()));
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (folders.has(parts[i].toLowerCase())) {
      return `${parts[i].toLowerCase()}/${parts[i + 1].toLowerCase()}`;
    }
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
 * Is `relPath` under one of the roots the rule declares shared on purpose?
 *
 * Segment-run match anywhere in the path (`ui` covers `src/ui/button.tsx`),
 * mirroring how `sliceIdForPath` finds a slice folder at any depth. A root
 * containing `*` is matched as a glob against the whole path.
 */
export function pathUnderSharedRoot(
  relPath: string | undefined,
  sharedRoots: string[] | undefined
): boolean {
  if (!relPath || !sharedRoots?.length) return false;
  const rel = String(relPath).split(/[/\\]/).join('/');
  const parts = normalizeSegments(rel);
  for (const raw of sharedRoots) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    if (raw.includes('*')) {
      if (globToRegExp(raw).test(rel) || globToRegExp(`${raw.replace(/\/+$/, '')}/**`).test(rel)) {
        return true;
      }
      continue;
    }
    const root = normalizeSegments(raw);
    if (root.length === 0) continue;
    for (let i = 0; i + root.length <= parts.length; i += 1) {
      let hit = true;
      for (let j = 0; j < root.length; j += 1) {
        if (parts[i + j] !== root[j]) {
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
  | 'cross-slice';

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
};

/**
 * PeerIsolation deny decision with the reason that fired (DF04 pure core).
 *
 * Fail-closed stays fail-closed: absent evidence denies. What changed in 4.8.4
 * is what counts as evidence — a declared shared root, or a declared directed
 * cross-slice edge, is the repo telling us its design, so it is no longer
 * "unclassifiable". Order: no paths → no slice folders → a side that is neither
 * in a slice nor declared shared → same slice → declared cross edge → deny.
 */
export function peerIsolationDecision(input: PeerIsolationInput): PeerIsolationDecision {
  if (!input.fromPath || !input.toPath) return { denied: true, reason: 'missing-path' };
  if (input.folderCount <= 0) return { denied: true, reason: 'no-slice-folders' };
  const fromClassified = Boolean(input.fromSlice) || input.fromShared === true;
  const toClassified = Boolean(input.toSlice) || input.toShared === true;
  if (!fromClassified || !toClassified) return { denied: true, reason: 'unclassifiable-path' };
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
 * Fail-closed: missing path, no classifiable folders, or unclassifiable either
 * side → deny. Same-slice → allow (return false). Cross-slice → deny unless the
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
 *   Missing paths, no slice folders, or unclassifiable slices → **fail-closed**
 *   (deny): isolation is configured, so insufficient evidence must not silently
 *   allow a possible cross-slice edge.
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
      const fromSlice =
        fromPath && toPath ? sliceIdForPath(fromPath, folders) : undefined;
      const toSlice =
        fromPath && toPath ? sliceIdForPath(toPath, folders) : undefined;
      const decision = peerIsolationDecision({
        fromPath,
        toPath,
        folderCount: folders.length,
        fromSlice,
        toSlice,
        fromShared: !fromSlice && pathUnderSharedRoot(fromPath, rule.sharedRoots),
        toShared: !toSlice && pathUnderSharedRoot(toPath, rule.sharedRoots),
        crossSliceAllowed: crossSliceEdgeAllowed(rule.allowedCrossSlice, fromSlice, toSlice),
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
