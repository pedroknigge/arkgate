/**
 * Copies across a wall (ADR 0038) — pure clone detection (Domain).
 *
 * Tooling hands in AST-kind token streams (numbers only), the identifier text of
 * two matched regions, and the gate's own wall decisions for a file pair. This
 * module hashes, winnows, pairs, extends, groups and words. Typed arrays and
 * plain data in; no fs, no TypeScript, no clock, no globs.
 *
 * Advisory only: fingerprints never enter resolved facts, `factsHash` or the
 * verdict. Always `notAScore`. Copy never says "duplication %" or scores.
 */

const ARK_CLONE_DETECTION_SCHEMA_VERSION = '1.0' as const;

/** Token alphabet: identifiers and literals collapse; every other node is `2 + kind`. */
export const TOKEN_IDENT = 0;
/**
 * Literals and JSX text.
 * @cliMirror bin/lib/duplication-io.mjs
 */
export const TOKEN_LITERAL = 1;
/**
 * Every other node kind is emitted as `TOKEN_KIND_OFFSET + kind`.
 * @cliMirror bin/lib/duplication-io.mjs
 */
export const TOKEN_KIND_OFFSET = 2;

/*
 * Fixed constants (ADR 0038 D3). Calibrated on a corpus, not user tunables;
 * they change only through an ADR amendment plus a corpus rerun.
 */
/** Tokens per hashed gram (k). */
export const CLONE_GRAM = 20;
/** Winnowing window (w). Any shared run of `w + k - 1` tokens shares a fingerprint. */
export const CLONE_WINDOW = 31;
/** Minimum extended run, in tokens (`>= CLONE_WINDOW + CLONE_GRAM - 1` keeps the guarantee). */
export const CLONE_MIN_TOKENS = 50;
/**
 * Minimum span on each side, in lines.
 * @cliMirror bin/lib/duplication-io.mjs
 */
export const CLONE_MIN_LINES = 5;
/** Share of identifiers that must match position by position. */
const CLONE_NAME_AGREEMENT = 0.6;
/** A fingerprint shared by more places than this is boilerplate: skipped and counted. */
export const CLONE_BUCKET_CAP = 16;
/** Seed pairs kept before the candidate list is `partial`. */
const CLONE_MAX_SEED_PAIRS = 50_000;
/** Families listed. The totals always carry the full count. */
export const CLONE_FAMILY_LIST_CAP = 8;
/** Seeds kept per file pair; more seeds are the same copy seen again. */
const SEEDS_PER_FILE_PAIR = 64;

export const DUPLICATION_COMMAND = 'arkgate-check --doctor --all';

const HASH_BASE = 0x01000193;

type CloneStatus = 'complete' | 'partial' | 'not-run' | 'unavailable';

/** A crossing that is listed. Order is the listing priority. */
export type CloneCrossing =
  | 'cross-slice'
  | 'cross-parent'
  | 'cross-sibling'
  | 'cross-layer-walled'
  | 'cross-layer';

type CrossingOutcome = CloneCrossing | 'same-slice' | 'fail-closed' | 'unplaced';

const CROSSING_ORDER: Record<CloneCrossing, number> = {
  'cross-slice': 0,
  'cross-parent': 1,
  'cross-sibling': 2,
  'cross-layer-walled': 3,
  'cross-layer': 4,
};

/** One direction of the gate's decision. `undefined` means the import is allowed. */
export type WallDecision = {
  /** `SliceVerdict.crossing`; absent for a classic layer deny. */
  crossing?: string;
  /** The denying rule declares `childSlices`. */
  childSlices?: boolean;
};

export type FingerprintTable = {
  hashes: Uint32Array;
  files: Uint32Array;
  offsets: Uint32Array;
  count: number;
};

export type FilePairCandidate = {
  a: number;
  b: number;
  /** Fingerprints the two files share. */
  shared: number;
  /** Flat `[offsetInA, offsetInB, …]` seed list, capped. */
  seeds: number[];
};

export type CloneMatch = { aStart: number; aEnd: number; bStart: number; bEnd: number; tokens: number };

type CloneSpan = {
  path: string;
  /** Token offsets, end exclusive. */
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  layer?: string;
};

export type NameAgreement = { same: number; total: number };

export type VerifiedClonePair = {
  a: CloneSpan;
  b: CloneSpan;
  crossing: CloneCrossing;
  names: NameAgreement;
};

type CloneMember = { path: string; layer?: string; startLine: number; endLine: number; tokens: number };

type FamilyPair = { a: number; b: number; crossing: CloneCrossing; names: NameAgreement };

export type CloneFamilyDraft = { members: CloneMember[]; pairs: FamilyPair[] };

/** Where the shared code could live. Plain text; never applied. */
export type CloneDestination = {
  kind: 'shared-root' | 'universe-common' | 'lower-layer' | 'shared-layer' | 'either-layer' | 'ask-place';
  path?: string;
  layer?: string;
  layers?: string[];
};

type CloneFamily = CloneFamilyDraft & {
  ruleId: 'CROSS_WALL_DUPLICATE' | 'CROSS_LAYER_DUPLICATE';
  crossing: CloneCrossing;
  names: NameAgreement;
  destination: CloneDestination;
  line: string;
};

export type DuplicationTotals = {
  filesEligible: number;
  filesFingerprinted: number;
  filesSkipped: Record<string, number>;
  fingerprints: number;
  seedPairs: number;
  bucketsSkipped: number;
  candidateFilePairs: number;
  pairsCrossBoundary: number;
  pairsVerified: number;
  pairsSameSliceUnexamined: number;
  pairsUnclassifiable: number;
  pairsUnplaced: number;
  clonePairs: number;
  families: number;
};

export type CrossWallDuplicationResult = {
  schemaVersion: typeof ARK_CLONE_DETECTION_SCHEMA_VERSION;
  advisory: true;
  notAScore: true;
  status: CloneStatus;
  headline: string;
  families: CloneFamily[];
  truncated: number;
  totals: DuplicationTotals;
  method: {
    gram: number;
    window: number;
    minTokens: number;
    minLines: number;
    nameAgreement: number;
    bucketCap: number;
  };
  honesty: string[];
  next?: string;
  reason?: string;
};

function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Rolling polynomial hash over `k`-token grams (32-bit, `Math.imul`), then
 * robust winnowing: the rightmost minimum of every `w`-gram window, recorded
 * once. Any shared run of `w + k - 1` tokens shares at least one fingerprint.
 * `offsets` are gram start offsets into `kinds`.
 */
export function fingerprint(
  kinds: ArrayLike<number>,
  k: number = CLONE_GRAM,
  w: number = CLONE_WINDOW
): { hashes: Uint32Array; offsets: Uint32Array } {
  const grams = kinds.length - k + 1;
  if (grams < w || k < 1 || w < 1) return { hashes: new Uint32Array(0), offsets: new Uint32Array(0) };
  let top = 1;
  for (let i = 1; i < k; i += 1) top = Math.imul(top, HASH_BASE);
  const gram = new Uint32Array(grams);
  let h = 0;
  for (let i = 0; i < k; i += 1) h = (Math.imul(h, HASH_BASE) + (Number(kinds[i]) + 1)) >>> 0;
  gram[0] = mix32(h);
  for (let i = 1; i < grams; i += 1) {
    const out = Math.imul(Number(kinds[i - 1]) + 1, top);
    h = (Math.imul(h - out, HASH_BASE) + (Number(kinds[i + k - 1]) + 1)) >>> 0;
    gram[i] = mix32(h);
  }
  const pickedHash: number[] = [];
  const pickedAt: number[] = [];
  let min = -1;
  let last = -1;
  for (let right = 0; right < grams; right += 1) {
    const left = right - w + 1;
    if (min < left || min === -1) {
      min = right;
      for (let j = right - 1; j >= Math.max(0, left); j -= 1) {
        if ((gram[j] as number) < (gram[min] as number)) min = j;
      }
    } else if ((gram[right] as number) <= (gram[min] as number)) {
      min = right;
    }
    if (left >= 0 && min !== last) {
      pickedHash.push(gram[min] as number);
      pickedAt.push(min);
      last = min;
    }
  }
  return { hashes: Uint32Array.from(pickedHash), offsets: Uint32Array.from(pickedAt) };
}

/**
 * Sort every `(hash, file, offset)` by hash and pair files that share one.
 * A run longer than `bucketCap` is boilerplate: skipped and counted. Output is
 * grouped per file pair (`a < b`) and sorted, so it is deterministic.
 */
export function candidatePairs(
  table: FingerprintTable,
  options: { bucketCap?: number; maxSeedPairs?: number } = {}
): { pairs: FilePairCandidate[]; bucketsSkipped: number; seedPairs: number; truncated: boolean } {
  const bucketCap = options.bucketCap ?? CLONE_BUCKET_CAP;
  const maxSeedPairs = options.maxSeedPairs ?? CLONE_MAX_SEED_PAIRS;
  const { hashes, files, offsets } = table;
  const order = new Uint32Array(table.count);
  let maxFile = 0;
  for (let i = 0; i < table.count; i += 1) {
    order[i] = i;
    if ((files[i] as number) > maxFile) maxFile = files[i] as number;
  }
  order.sort(
    (x, y) =>
      (hashes[x] as number) - (hashes[y] as number) ||
      (files[x] as number) - (files[y] as number) ||
      (offsets[x] as number) - (offsets[y] as number)
  );
  const byPair = new Map<number, FilePairCandidate>();
  let bucketsSkipped = 0;
  let seedPairs = 0;
  let truncated = false;
  let start = 0;
  while (start < order.length && !truncated) {
    let end = start + 1;
    const hash = hashes[order[start] as number];
    while (end < order.length && hashes[order[end] as number] === hash) end += 1;
    if (end - start > bucketCap) {
      bucketsSkipped += 1;
    } else {
      for (let i = start; i < end && !truncated; i += 1) {
        for (let j = i + 1; j < end; j += 1) {
          const x = order[i] as number;
          const y = order[j] as number;
          const fx = files[x] as number;
          const fy = files[y] as number;
          if (fx === fy) continue;
          const [a, oa, b, ob] = fx < fy ? [fx, offsets[x], fy, offsets[y]] : [fy, offsets[y], fx, offsets[x]];
          const key = a * (maxFile + 1) + b;
          let row = byPair.get(key);
          if (!row) {
            row = { a, b, shared: 0, seeds: [] };
            byPair.set(key, row);
          }
          row.shared += 1;
          if (row.seeds.length < SEEDS_PER_FILE_PAIR * 2) row.seeds.push(oa as number, ob as number);
          seedPairs += 1;
          if (seedPairs >= maxSeedPairs) {
            truncated = true;
            break;
          }
        }
      }
    }
    start = end;
  }
  const pairs = [...byPair.values()].sort((left, right) => left.a - right.a || left.b - right.b);
  return { pairs, bucketsSkipped, seedPairs, truncated };
}

/** Grow a seed left and right over equal tokens. `null` when shorter than `minTokens`. */
export function extendMatch(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  seedA: number,
  seedB: number,
  minTokens: number = CLONE_MIN_TOKENS
): CloneMatch | null {
  if (seedA < 0 || seedB < 0 || seedA >= a.length || seedB >= b.length) return null;
  let back = 0;
  while (seedA - back - 1 >= 0 && seedB - back - 1 >= 0 && a[seedA - back - 1] === b[seedB - back - 1]) back += 1;
  let ahead = 0;
  while (seedA + ahead < a.length && seedB + ahead < b.length && a[seedA + ahead] === b[seedB + ahead]) ahead += 1;
  const tokens = back + ahead;
  if (tokens < minTokens) return null;
  return { aStart: seedA - back, aEnd: seedA + ahead, bStart: seedB - back, bEnd: seedB + ahead, tokens };
}

/** Identifiers that match position by position. Counts, not a ratio. */
export function sameNames(identsA: readonly string[], identsB: readonly string[]): NameAgreement {
  const total = Math.max(identsA.length, identsB.length);
  let same = 0;
  for (let i = 0; i < Math.min(identsA.length, identsB.length); i += 1) {
    if (identsA[i] === identsB[i]) same += 1;
  }
  return { same, total };
}

/** A region with no identifiers carries no name evidence and is not kept. */
export function namesAgree(names: NameAgreement): boolean {
  return names.total > 0 && names.same / names.total >= CLONE_NAME_AGREEMENT;
}

/**
 * Map the gate's two-way decision for a file pair to a crossing. A universe
 * wall that could not classify a path (`fail-closed`) is never a wall crossing.
 * A parent ↔ child copy counts as same slice: the child may import the parent.
 */
export function classifyCrossing(input: {
  layerA?: string;
  layerB?: string;
  forward?: WallDecision;
  backward?: WallDecision;
}): CrossingOutcome {
  if (!input.layerA || !input.layerB) return 'unplaced';
  const decisions = [input.forward, input.backward].filter((row): row is WallDecision => Boolean(row));
  const real = decisions.filter((row) => row.crossing !== 'fail-closed');
  if (input.layerA !== input.layerB) {
    const forward = input.forward && input.forward.crossing !== 'fail-closed';
    const backward = input.backward && input.backward.crossing !== 'fail-closed';
    return forward && backward ? 'cross-layer-walled' : 'cross-layer';
  }
  if (real.some((row) => row.crossing === 'cross-sibling')) return 'cross-sibling';
  const parent = real.find((row) => row.crossing === 'cross-parent');
  if (parent) return parent.childSlices ? 'cross-parent' : 'cross-slice';
  if (decisions.length > real.length) return 'fail-closed';
  return 'same-slice';
}

/** Is this crossing one the section lists? */
export function isListedCrossing(outcome: CrossingOutcome): outcome is CloneCrossing {
  return Object.prototype.hasOwnProperty.call(CROSSING_ORDER, outcome);
}

const GENERATED_HEADER = /GENERATED FILE|@generated|DO NOT EDIT|\bgenerated (?:from|by)\b/i;

/** First five lines carry a generated marker. */
export function isGeneratedHeader(text: string): boolean {
  const head = String(text).split('\n', 5).join('\n');
  return GENERATED_HEADER.test(head);
}

function byText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Union-find over verified pairs. Overlapping spans in one file are one member.
 * Members and pairs come out sorted, so pair order never changes a family.
 */
export function groupFamilies(pairs: readonly VerifiedClonePair[]): CloneFamilyDraft[] {
  const spans: CloneSpan[] = [];
  for (const pair of pairs) spans.push(pair.a, pair.b);
  const order = spans.map((_, index) => index);
  order.sort((x, y) => {
    const left = spans[x] as CloneSpan;
    const right = spans[y] as CloneSpan;
    return byText(left.path, right.path) || left.start - right.start || left.end - right.end;
  });
  const memberOf = new Array<number>(spans.length).fill(-1);
  const members: Array<CloneSpan & { tokens: number }> = [];
  for (const index of order) {
    const span = spans[index] as CloneSpan;
    const current = members[members.length - 1];
    if (current && current.path === span.path && span.start < current.end) {
      current.end = Math.max(current.end, span.end);
      current.startLine = Math.min(current.startLine, span.startLine);
      current.endLine = Math.max(current.endLine, span.endLine);
      current.tokens = current.end - current.start;
    } else {
      members.push({ ...span, tokens: span.end - span.start });
    }
    memberOf[index] = members.length - 1;
  }
  const parent = members.map((_, index) => index);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root] as number;
    while (parent[x] !== root) {
      const next = parent[x] as number;
      parent[x] = root;
      x = next;
    }
    return root;
  };
  pairs.forEach((_, index) => {
    const left = find(memberOf[index * 2] as number);
    const right = find(memberOf[index * 2 + 1] as number);
    if (left !== right) parent[Math.max(left, right)] = Math.min(left, right);
  });
  const groups = new Map<number, number[]>();
  members.forEach((_, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });
  const families: CloneFamilyDraft[] = [];
  for (const indexes of groups.values()) {
    const local = new Map(indexes.map((memberIndex, position) => [memberIndex, position]));
    const familyPairs: FamilyPair[] = [];
    const seen = new Set<string>();
    pairs.forEach((pair, index) => {
      const a = local.get(memberOf[index * 2] as number);
      const b = local.get(memberOf[index * 2 + 1] as number);
      if (a === undefined || b === undefined || a === b) return;
      const [low, high] = a < b ? [a, b] : [b, a];
      const key = `${low}:${high}`;
      if (seen.has(key)) return;
      seen.add(key);
      familyPairs.push({ a: low, b: high, crossing: pair.crossing, names: { ...pair.names } });
    });
    familyPairs.sort(
      (left, right) =>
        left.a - right.a || left.b - right.b || CROSSING_ORDER[left.crossing] - CROSSING_ORDER[right.crossing]
    );
    families.push({
      members: indexes.map((memberIndex) => {
        const member = members[memberIndex] as CloneSpan & { tokens: number };
        return {
          path: member.path,
          ...(member.layer ? { layer: member.layer } : {}),
          startLine: member.startLine,
          endLine: member.endLine,
          tokens: member.tokens,
        };
      }),
      pairs: familyPairs,
    });
  }
  return families.sort((left, right) => byText(left.members[0]?.path ?? '', right.members[0]?.path ?? ''));
}

function dirOf(rel: string): string {
  const at = rel.lastIndexOf('/');
  return at === -1 ? '.' : rel.slice(0, at);
}

/**
 * The pair that names a family: listing priority, then the best name agreement.
 * @cliMirror bin/lib/duplication-io.mjs
 */
export function primaryPair(family: { pairs: readonly FamilyPair[] }): FamilyPair | undefined {
  return [...family.pairs].sort(
    (left, right) =>
      CROSSING_ORDER[left.crossing] - CROSSING_ORDER[right.crossing] ||
      right.names.same * left.names.total - left.names.same * right.names.total ||
      left.a - right.a ||
      left.b - right.b
  )[0];
}

function destinationText(destination: CloneDestination): string {
  switch (destination.kind) {
    case 'shared-root':
    case 'universe-common':
      return `move it to ${destination.path} with /ark-place`;
    case 'lower-layer':
      return `keep it in ${destination.layer}, the layer both sides may import, with /ark-place`;
    case 'shared-layer':
      return `move it to ${destination.layer}, a layer both sides may import, with /ark-place`;
    case 'either-layer':
      return `keep one copy in ${(destination.layers ?? []).join(' or ')} and import it from the other, with /ark-place`;
    default:
      return 'find a shared home your config lets both sides import with /ark-place';
  }
}

/** One human line per family. Shared by the terminal and the report. */
export function cloneFamilyLine(family: {
  members: readonly CloneMember[];
  crossing: CloneCrossing;
  names: NameAgreement;
  pairs: readonly FamilyPair[];
  destination: CloneDestination;
}): string {
  const pair = primaryPair(family);
  const left = family.members[pair?.a ?? 0];
  const right = family.members[pair?.b ?? 1];
  const more = family.members.length > 2 ? ` (+${family.members.length - 2} more)` : '';
  const names = `${family.names.same} of ${family.names.total} names match`;
  const next = destinationText(family.destination);
  if (family.crossing === 'cross-layer' || family.crossing === 'cross-layer-walled') {
    const wall = family.crossing === 'cross-layer-walled' ? ' Neither layer may import the other.' : '';
    return `This code is copied between the ${left?.layer ?? '?'} and ${right?.layer ?? '?'} layers${more} (${names}).${wall} Next: ${next}.`;
  }
  return `This code is copied between ${dirOf(left?.path ?? '')} and ${dirOf(right?.path ?? '')}${more} (${names}). The wall stops the import, not the copy. Next: ${next}.`;
}

function method(): CrossWallDuplicationResult['method'] {
  return {
    gram: CLONE_GRAM,
    window: CLONE_WINDOW,
    minTokens: CLONE_MIN_TOKENS,
    minLines: CLONE_MIN_LINES,
    nameAgreement: CLONE_NAME_AGREEMENT,
    bucketCap: CLONE_BUCKET_CAP,
  };
}

/** All-zero totals, for `not-run` / `unavailable`. */
export function emptyDuplicationTotals(): DuplicationTotals {
  return {
    filesEligible: 0,
    filesFingerprinted: 0,
    filesSkipped: {},
    fingerprints: 0,
    seedPairs: 0,
    bucketsSkipped: 0,
    candidateFilePairs: 0,
    pairsCrossBoundary: 0,
    pairsVerified: 0,
    pairsSameSliceUnexamined: 0,
    pairsUnclassifiable: 0,
    pairsUnplaced: 0,
    clonePairs: 0,
    families: 0,
  };
}

function shell(status: CloneStatus, headline: string, honesty: string[]): CrossWallDuplicationResult {
  return {
    schemaVersion: ARK_CLONE_DETECTION_SCHEMA_VERSION,
    advisory: true,
    notAScore: true,
    status,
    headline,
    families: [],
    truncated: 0,
    totals: emptyDuplicationTotals(),
    method: method(),
    honesty,
  };
}

/** Compact status and scoped runs: the JSON names the command that runs it. */
export function notRunDuplication(reason?: string): CrossWallDuplicationResult {
  return {
    ...shell('not-run', 'Copies across a wall are checked in status details.', []),
    next: DUPLICATION_COMMAND,
    ...(reason ? { reason } : {}),
  };
}

export function unavailableDuplication(note: string): CrossWallDuplicationResult {
  return shell('unavailable', 'Copies across a wall could not be checked.', [note]);
}

/**
 * Final section. Families are listed walled first, then by size, then by path,
 * capped with an honest `truncated`. Any partial reason makes the status `partial`.
 */
export function buildDuplicationAdvisory(input: {
  families: ReadonlyArray<CloneFamilyDraft & { destination: CloneDestination }>;
  totals: DuplicationTotals;
  partialReasons: readonly string[];
  notes?: readonly string[];
}): CrossWallDuplicationResult {
  const families: CloneFamily[] = [];
  for (const draft of input.families) {
    const pair = primaryPair(draft);
    if (!pair) continue;
    const walled = pair.crossing !== 'cross-layer';
    const family = {
      ruleId: walled ? ('CROSS_WALL_DUPLICATE' as const) : ('CROSS_LAYER_DUPLICATE' as const),
      crossing: pair.crossing,
      names: { ...pair.names },
      members: draft.members.map((member) => ({ ...member })),
      pairs: draft.pairs.map((row) => ({ ...row, names: { ...row.names } })),
      destination: {
        ...draft.destination,
        ...(draft.destination.layers ? { layers: [...draft.destination.layers] } : {}),
      },
      line: '',
    };
    family.line = cloneFamilyLine(family);
    families.push(family);
  }
  const size = (family: CloneFamily): number => Math.max(0, ...family.members.map((member) => member.tokens));
  families.sort(
    (left, right) =>
      CROSSING_ORDER[left.crossing] - CROSSING_ORDER[right.crossing] ||
      size(right) - size(left) ||
      byText(left.members[0]?.path ?? '', right.members[0]?.path ?? '')
  );
  const listed = families.slice(0, CLONE_FAMILY_LIST_CAP);
  const partial = input.partialReasons.length > 0;
  const count = families.length;
  const headline =
    count === 0
      ? partial
        ? 'No copy across a wall or a layer was found in the files checked.'
        : 'No copy crosses a wall or a layer.'
      : `${count} cop${count === 1 ? 'y crosses' : 'ies cross'} a wall or a layer.`;
  return {
    schemaVersion: ARK_CLONE_DETECTION_SCHEMA_VERSION,
    advisory: true,
    notAScore: true,
    status: partial ? 'partial' : 'complete',
    headline,
    families: listed,
    truncated: count - listed.length,
    totals: { ...input.totals, filesSkipped: { ...input.totals.filesSkipped }, families: count },
    method: method(),
    honesty: [...input.partialReasons, ...(input.notes ?? [])],
  };
}
