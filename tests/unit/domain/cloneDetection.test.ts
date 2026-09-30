/**
 * ADR 0038 — copies across a wall (pure core).
 */
import { describe, expect, it } from 'vitest';
import {
  CLONE_BUCKET_CAP,
  CLONE_FAMILY_LIST_CAP,
  DUPLICATION_COMMAND,
  buildDuplicationAdvisory,
  candidatePairs,
  classifyCrossing,
  cloneFamilyLine,
  emptyDuplicationTotals,
  extendMatch,
  fingerprint,
  groupFamilies,
  isGeneratedHeader,
  isListedCrossing,
  namesAgree,
  notRunDuplication,
  sameNames,
  unavailableDuplication,
  type CloneDestination,
  type VerifiedClonePair,
} from '../../../src/domain/cloneDetection';

function table(rows: Array<[hash: number, file: number, offset: number]>) {
  return {
    hashes: Uint32Array.from(rows.map((row) => row[0])),
    files: Uint32Array.from(rows.map((row) => row[1])),
    offsets: Uint32Array.from(rows.map((row) => row[2])),
    count: rows.length,
  };
}

function span(path: string, start: number, end: number) {
  return { path, start, end, startLine: start + 1, endLine: end };
}

function pair(a: ReturnType<typeof span>, b: ReturnType<typeof span>, crossing: VerifiedClonePair['crossing'] = 'cross-slice'): VerifiedClonePair {
  return { a, b, crossing, names: { same: 9, total: 10 } };
}

const SHARED: CloneDestination = { kind: 'shared-root', path: 'src/shared/' };

describe('fingerprint', () => {
  it('returns nothing below one full window of grams', () => {
    expect(fingerprint(new Array(49).fill(5)).hashes.length).toBe(0);
    expect(fingerprint(new Array(50).fill(5)).hashes.length).toBe(1);
  });

  it('is deterministic and keeps offsets inside the stream', () => {
    const stream = Array.from({ length: 300 }, (_, index) => (index * 7919) % 97);
    const first = fingerprint(stream);
    const second = fingerprint(Uint16Array.from(stream));
    expect([...first.hashes]).toEqual([...second.hashes]);
    expect([...first.offsets]).toEqual([...second.offsets]);
    for (const offset of first.offsets) expect(offset).toBeLessThanOrEqual(300 - 20);
    // Density is about 2 / (w + 1): far fewer fingerprints than grams.
    expect(first.hashes.length).toBeLessThan(60);
  });
});

describe('candidatePairs', () => {
  it('pairs files that share a fingerprint, grouped and sorted per file pair', () => {
    const result = candidatePairs(table([[7, 2, 40], [7, 0, 10], [9, 1, 3], [9, 0, 5], [7, 2, 90]]));
    expect(result.pairs.map((row) => [row.a, row.b, row.shared])).toEqual([
      [0, 1, 1],
      [0, 2, 2],
    ]);
    expect(result.pairs[1]?.seeds).toEqual([10, 40, 10, 90]);
    expect(result.bucketsSkipped).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('skips and counts a fingerprint shared by more places than the bucket cap', () => {
    const rows: Array<[number, number, number]> = [];
    for (let file = 0; file <= CLONE_BUCKET_CAP; file += 1) rows.push([42, file, 0]);
    rows.push([5, 0, 1], [5, 1, 1]);
    const result = candidatePairs(table(rows));
    expect(result.bucketsSkipped).toBe(1);
    expect(result.pairs.map((row) => [row.a, row.b])).toEqual([[0, 1]]);
  });

  it('stops at the seed-pair cap and says so', () => {
    const rows: Array<[number, number, number]> = [];
    for (let hash = 0; hash < 20; hash += 1) rows.push([hash, 0, hash], [hash, 1, hash]);
    const result = candidatePairs(table(rows), { maxSeedPairs: 5 });
    expect(result.truncated).toBe(true);
    expect(result.seedPairs).toBe(5);
  });
});

describe('extendMatch and names', () => {
  it('grows both ways over equal tokens and drops short runs', () => {
    const body = Array.from({ length: 60 }, (_, index) => 2 + (index % 40));
    const a = [900, ...body, 901];
    const b = [800, 801, ...body, 802];
    expect(extendMatch(a, b, 30, 31)).toEqual({ aStart: 1, aEnd: 61, bStart: 2, bEnd: 62, tokens: 60 });
    expect(extendMatch(a, b, 30, 31, 61)).toBeNull();
    expect(extendMatch(a, b, -1, 0)).toBeNull();
  });

  it('counts matching names position by position', () => {
    expect(sameNames(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual({ same: 2, total: 3 });
    expect(namesAgree({ same: 6, total: 10 })).toBe(true);
    expect(namesAgree({ same: 5, total: 10 })).toBe(false);
    expect(namesAgree({ same: 0, total: 0 })).toBe(false);
  });
});

describe('classifyCrossing', () => {
  it('uses the gate decision in both directions', () => {
    expect(classifyCrossing({ layerA: 'F', layerB: 'F' })).toBe('same-slice');
    expect(classifyCrossing({ layerA: 'F', layerB: 'F', forward: { crossing: 'cross-parent' } })).toBe('cross-slice');
    expect(
      classifyCrossing({ layerA: 'F', layerB: 'F', backward: { crossing: 'cross-parent', childSlices: true } })
    ).toBe('cross-parent');
    expect(
      classifyCrossing({ layerA: 'F', layerB: 'F', forward: { crossing: 'cross-sibling' }, backward: { crossing: 'cross-sibling' } })
    ).toBe('cross-sibling');
    expect(classifyCrossing({ layerA: 'F', layerB: 'F', forward: { crossing: 'parent-imports-child' } })).toBe('same-slice');
    expect(classifyCrossing({ layerA: 'F', layerB: 'F', forward: { crossing: 'fail-closed' } })).toBe('fail-closed');
    expect(classifyCrossing({ layerA: 'Domain', layerB: 'App', forward: {} })).toBe('cross-layer');
    expect(classifyCrossing({ layerA: 'Domain', layerB: 'App' })).toBe('cross-layer');
    expect(classifyCrossing({ layerA: 'Ui', layerB: 'Db', forward: {}, backward: {} })).toBe('cross-layer-walled');
    expect(
      classifyCrossing({ layerA: 'Ui', layerB: 'Db', forward: {}, backward: { crossing: 'fail-closed' } })
    ).toBe('cross-layer');
    expect(classifyCrossing({ layerA: 'Ui' })).toBe('unplaced');
  });

  it('lists only wall and layer crossings', () => {
    expect(isListedCrossing('cross-sibling')).toBe(true);
    expect(isListedCrossing('same-slice')).toBe(false);
    expect(isListedCrossing('fail-closed')).toBe(false);
    expect(isListedCrossing('unplaced')).toBe(false);
  });
});

describe('isGeneratedHeader', () => {
  it('reads only the first five lines', () => {
    expect(isGeneratedHeader('/**\n * GENERATED FILE — do not edit by hand.\n */')).toBe(true);
    expect(isGeneratedHeader('// @generated by openapi\nexport {}')).toBe(true);
    expect(isGeneratedHeader('// Generated from design-delta.source.mjs\n')).toBe(true);
    expect(isGeneratedHeader('a\nb\nc\nd\ne\n// DO NOT EDIT')).toBe(false);
    expect(isGeneratedHeader('export const generatedAt = 1;')).toBe(false);
  });
});

describe('groupFamilies', () => {
  it('joins pairs that share a member into one family', () => {
    const families = groupFamilies([
      pair(span('src/b.ts', 0, 60), span('src/c.ts', 10, 70)),
      pair(span('src/a.ts', 5, 65), span('src/b.ts', 2, 62)),
    ]);
    expect(families).toHaveLength(1);
    expect(families[0]?.members.map((member) => member.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    // Overlapping spans in src/b.ts merge into one member.
    expect(families[0]?.members[1]).toMatchObject({ startLine: 1, endLine: 62, tokens: 62 });
    expect(families[0]?.pairs.map((row) => [row.a, row.b])).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('keeps separate copies apart and ignores pair order', () => {
    const pairs = [
      pair(span('src/x.ts', 0, 60), span('src/y.ts', 0, 60)),
      pair(span('src/p.ts', 0, 60), span('src/q.ts', 0, 60)),
      pair(span('src/x.ts', 100, 160), span('src/z.ts', 0, 60)),
    ];
    const forward = groupFamilies(pairs);
    expect(forward).toHaveLength(3);
    expect(groupFamilies([...pairs].reverse())).toEqual(forward);
  });
});

describe('buildDuplicationAdvisory', () => {
  const totals = { ...emptyDuplicationTotals(), filesEligible: 10, filesFingerprinted: 10 };

  it('lists walled copies first with a line, a rule id and a destination', () => {
    const layer = groupFamilies([
      pair({ ...span('src/domain/email.ts', 0, 80), layer: 'Domain' }, { ...span('src/app/check.ts', 0, 80), layer: 'App' }, 'cross-layer'),
    ])[0]!;
    const wall = groupFamilies([pair(span('src/features/billing/total.ts', 0, 60), span('src/features/invoices/total.ts', 0, 60))])[0]!;
    const result = buildDuplicationAdvisory({
      families: [
        { ...layer, destination: { kind: 'lower-layer', layer: 'Domain' } },
        { ...wall, destination: SHARED },
      ],
      totals,
      partialReasons: [],
    });
    expect(result).toMatchObject({ status: 'complete', notAScore: true, advisory: true, truncated: 0 });
    expect(result.totals.families).toBe(2);
    expect(result.families.map((family) => [family.ruleId, family.crossing])).toEqual([
      ['CROSS_WALL_DUPLICATE', 'cross-slice'],
      ['CROSS_LAYER_DUPLICATE', 'cross-layer'],
    ]);
    expect(result.families[0]?.line).toBe(
      'This code is copied between src/features/billing and src/features/invoices (9 of 10 names match). The wall stops the import, not the copy. Next: move it to src/shared/ with /ark-place.'
    );
    expect(result.families[1]?.line).toBe(
      'This code is copied between the App and Domain layers (9 of 10 names match). Next: keep it in Domain, the layer both sides may import, with /ark-place.'
    );
    expect(result.headline).toBe('2 copies cross a wall or a layer.');
    for (const text of [result.headline, ...result.families.map((family) => family.line)]) {
      expect(text).not.toMatch(/score|%|duplication/i);
    }
  });

  it('caps the list honestly and marks partial', () => {
    const drafts = Array.from({ length: CLONE_FAMILY_LIST_CAP + 3 }, (_, index) => ({
      ...groupFamilies([pair(span(`src/features/a${index}/x.ts`, 0, 60), span(`src/features/b${index}/x.ts`, 0, 60))])[0]!,
      destination: { kind: 'ask-place' } as CloneDestination,
    }));
    const result = buildDuplicationAdvisory({ families: drafts, totals, partialReasons: ['File cap reached.'] });
    expect(result.status).toBe('partial');
    expect(result.families).toHaveLength(CLONE_FAMILY_LIST_CAP);
    expect(result.truncated).toBe(3);
    expect(result.honesty).toEqual(['File cap reached.']);
    expect(result.families[0]?.line).toMatch(/find a shared home your config lets both sides import with \/ark-place\.$/);
  });

  it('words every destination kind and a family of three', () => {
    const base = {
      members: [
        { path: 'src/features/catalog/search/rank.ts', startLine: 1, endLine: 9, tokens: 60 },
        { path: 'src/features/catalog/browse/rank.ts', startLine: 1, endLine: 9, tokens: 60 },
        { path: 'src/features/catalog/list/rank.ts', startLine: 1, endLine: 9, tokens: 60 },
      ],
      pairs: [{ a: 0, b: 1, crossing: 'cross-sibling' as const, names: { same: 4, total: 5 } }],
      crossing: 'cross-sibling' as const,
      names: { same: 4, total: 5 },
    };
    expect(cloneFamilyLine({ ...base, destination: { kind: 'universe-common', path: 'src/features/catalog/common/' } })).toBe(
      'This code is copied between src/features/catalog/search and src/features/catalog/browse (+1 more) (4 of 5 names match). The wall stops the import, not the copy. Next: move it to src/features/catalog/common/ with /ark-place.'
    );
    const layers = {
      ...base,
      members: base.members.slice(0, 2).map((member, index) => ({ ...member, layer: index ? 'Db' : 'Ui' })),
      crossing: 'cross-layer-walled' as const,
    };
    expect(cloneFamilyLine({ ...layers, destination: { kind: 'shared-layer', layer: 'Shared' } })).toBe(
      'This code is copied between the Ui and Db layers (4 of 5 names match). Neither layer may import the other. Next: move it to Shared, a layer both sides may import, with /ark-place.'
    );
    expect(cloneFamilyLine({ ...layers, destination: { kind: 'either-layer', layers: ['Ui', 'Db'] } })).toMatch(
      /keep one copy in Ui or Db and import it from the other, with \/ark-place\.$/
    );
  });

  it('says not-run with the command, and unavailable with a note', () => {
    expect(notRunDuplication()).toMatchObject({ status: 'not-run', next: DUPLICATION_COMMAND, families: [], notAScore: true });
    expect(notRunDuplication('changed-files scope')).toMatchObject({ reason: 'changed-files scope' });
    expect(unavailableDuplication('No TypeScript parser.')).toMatchObject({
      status: 'unavailable',
      honesty: ['No TypeScript parser.'],
    });
    expect(buildDuplicationAdvisory({ families: [], totals, partialReasons: [] }).headline).toBe(
      'No copy crosses a wall or a layer.'
    );
  });
});
