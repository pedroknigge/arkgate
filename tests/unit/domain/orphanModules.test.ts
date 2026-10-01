/**
 * ADR 0037 — files nothing imports (pure projection).
 */
import { describe, expect, it } from 'vitest';
import {
  ORPHAN_LIST_CAP,
  ORPHAN_MODULE_NEXT,
  ORPHAN_UNRECOGNISED_LIST_CAP,
  UNUSED_EXPORTS_COMMAND,
  deferredUnusedExports,
  findOrphanModules,
  findUnusedExports,
  moduleStem,
  orphanModuleLine,
  unavailableOrphanModules,
  unusedExportLine,
} from '../../../src/domain/orphanModules';

type Input = Parameters<typeof findOrphanModules>[0];

function input(files: string[], counts: number[], extra: Partial<Input> = {}): Input {
  return {
    files,
    importerCount: counts,
    entries: new Map(),
    testImporters: new Map(),
    outsideImporters: new Map(),
    dynamicReach: new Map(),
    unresolvedStems: new Set(),
    frameworks: ['next'],
    entryEvidence: { bySource: {}, unmapped: 0 },
    partialReasons: [],
    ...extra,
  };
}

describe('findOrphanModules', () => {
  it('lists zero-importer files that no entry covers, and counts the rest', () => {
    const result = findOrphanModules(
      input(['src/a.ts', 'src/b.ts', 'src/page.tsx', 'src/c.ts'], [1, 0, 0, 2], {
        entries: new Map([['src/page.tsx', 'framework']]),
        entryEvidence: { bySource: { framework: 1 }, unmapped: 0 },
      })
    );
    expect(result.status).toBe('complete');
    expect(result.notAScore).toBe(true);
    expect(result.orphans).toEqual([
      {
        ruleId: 'ORPHAN_MODULE',
        path: 'src/b.ts',
        certainty: 'no-importer',
        evidence: ['no governed file, test or project script imports it'],
      },
    ]);
    expect(result.totals).toMatchObject({ governed: 4, entries: 1, imported: 2, listed: 1 });
    expect(result.headline).toBe('1 governed file nothing imports.');
    expect(result.next).toBe(ORPHAN_MODULE_NEXT);
  });

  it('any resolved edge counts: a type-only import or a re-export keeps a file off the list', () => {
    // The index counts every resolved-project edge, so the Domain sees a non-zero count.
    const result = findOrphanModules(input(['src/types.ts', 'src/barrel.ts'], [1, 1]));
    expect(result.orphans).toEqual([]);
    expect(result.headline).toBe('Every governed file has an importer or an entry point.');
    expect(result.next).toBeUndefined();
  });

  it('files only tests import go to the test-only tier, not the list', () => {
    const result = findOrphanModules(
      input(['src/only-tested.ts', 'src/script-used.ts'], [0, 0], {
        testImporters: new Map([['src/only-tested.ts', 2]]),
        outsideImporters: new Map([['src/script-used.ts', 1]]),
      })
    );
    expect(result.orphans).toEqual([]);
    expect(result.testOnly).toEqual({ count: 1, sample: ['src/only-tested.ts'] });
    expect(result.totals.outsideOnly).toBe(1);
  });

  it('labels dynamic and unresolved candidates and reports partial', () => {
    const result = findOrphanModules(
      input(['src/handlers/a.ts', 'src/utils/index.ts', 'src/z.ts'], [0, 0, 0], {
        dynamicReach: new Map([['src/handlers/a.ts', 'a dynamic import in src/x.ts can load files under src/handlers/']]),
        unresolvedStems: new Set(['utils']),
        annotations: new Map([['src/z.ts', ['its .ark/entry-points.json entry (src/z.ts) passed reviewBy 2020-01-01']]]),
      })
    );
    expect(result.status).toBe('partial');
    expect(result.orphans.map((item) => [item.path, item.certainty])).toEqual([
      ['src/z.ts', 'no-importer'],
      ['src/utils/index.ts', 'maybe-unresolved'],
      ['src/handlers/a.ts', 'maybe-dynamic'],
    ]);
    expect(result.orphans[0].evidence[1]).toContain('passed reviewBy');
    expect(result.totals).toMatchObject({ maybeDynamic: 1, maybeUnresolved: 1 });
    expect(orphanModuleLine(result.orphans[2])).toBe(
      'No static import reaches src/handlers/a.ts, but a dynamic import in src/x.ts can load files under src/handlers/. It may still be loaded.'
    );
    expect(orphanModuleLine(result.orphans[1])).toContain('could not be followed');
    expect(orphanModuleLine(result.orphans[0])).toBe('Nothing imports src/z.ts, and no entry point covers it.');
  });

  it('never prints partial as complete, even with nothing listed', () => {
    const result = findOrphanModules(
      input(['src/a.ts'], [1], { partialReasons: ['Some imports could not be followed (1 dynamic).'] })
    );
    expect(result.status).toBe('partial');
    expect(result.headline).toContain('could not be followed');
    expect(result.honesty).toEqual(['Some imports could not be followed (1 dynamic).']);
  });

  it('caps the list and keeps the total honest', () => {
    const files = Array.from({ length: 30 }, (_, i) => `src/f${String(i).padStart(2, '0')}.ts`);
    const counts = files.map(() => 0);
    const result = findOrphanModules(input(files, counts));
    expect(result.orphans).toHaveLength(ORPHAN_LIST_CAP);
    expect(result.truncated).toBe(30 - ORPHAN_LIST_CAP);
    expect(result.totals.listed).toBe(30);
  });

  it('unrecognised entry points: partial, headline says so, list cut to five', () => {
    const files = Array.from({ length: 10 }, (_, i) => `src/f${i}.ts`);
    const result = findOrphanModules(input(files, files.map(() => 0), { frameworks: [] }));
    expect(result.status).toBe('partial');
    expect(result.headline).toBe('Entry points not recognised. The list of files nothing imports may be wrong.');
    expect(result.orphans).toHaveLength(ORPHAN_UNRECOGNISED_LIST_CAP);
    expect(result.honesty[0]).toContain('no framework was recognised');
  });

  it('is deterministic when the input order changes', () => {
    const a = findOrphanModules(input(['src/b.ts', 'src/a.ts', 'src/c.ts'], [0, 0, 1]));
    const b = findOrphanModules(input(['src/c.ts', 'src/a.ts', 'src/b.ts'], [1, 0, 0]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps notes out of the status', () => {
    const result = findOrphanModules(input(['src/a.ts'], [1], { notes: ['sidecar note'] }));
    expect(result.status).toBe('complete');
    expect(result.honesty).toEqual(['sidecar note']);
  });

  it('moduleStem strips every extension and keeps index', () => {
    expect(moduleStem('src/a/foo.test.ts')).toBe('foo');
    expect(moduleStem('./utils')).toBe('utils');
    expect(moduleStem('src/index.ts')).toBe('index');
  });
});

describe('unavailable and deferred shapes', () => {
  it('unavailable carries the reason and lists nothing', () => {
    const result = unavailableOrphanModules('no facts');
    expect(result).toMatchObject({ status: 'unavailable', notAScore: true, orphans: [], honesty: ['no facts'] });
  });

  it('deferred unused exports names the command that runs them', () => {
    expect(deferredUnusedExports()).toMatchObject({ status: 'deferred', next: UNUSED_EXPORTS_COMMAND, files: [] });
  });
});

describe('findUnusedExports', () => {
  it('lists exports nothing imports by name; entries, star use and unknown exports are skipped', () => {
    const result = findUnusedExports({
      exportsByFile: new Map([
        ['src/a.ts', ['used', 'unused', 'Type']],
        ['src/star.ts', ['x']],
        ['src/entry.ts', ['y']],
        ['src/opaque.ts', null],
        ['src/b.ts', ['z']],
      ]),
      namedUse: new Map<string, Set<string> | '*'>([
        ['src/a.ts', new Set(['used'])],
        ['src/star.ts', '*'],
        ['src/entry.ts', new Set()],
        ['src/opaque.ts', new Set(['q'])],
        ['src/b.ts', new Set(['z'])],
      ]),
      entries: new Set(['src/entry.ts']),
      partialReasons: [],
    });
    expect(result.status).toBe('complete');
    expect(result.files).toEqual([{ ruleId: 'UNUSED_EXPORT', path: 'src/a.ts', exports: ['Type', 'unused'] }]);
    expect(result.totals).toEqual({ filesChecked: 2, filesSkipped: 3, unusedExports: 2 });
    expect(unusedExportLine(result.files[0])).toBe(
      'src/a.ts exports Type, unused, and nothing imports them by name.'
    );
  });

  it('is partial when a reason exists and caps rows', () => {
    const exportsByFile = new Map<string, string[]>();
    const namedUse = new Map<string, Set<string>>();
    for (let i = 0; i < 25; i += 1) {
      exportsByFile.set(`src/f${String(i).padStart(2, '0')}.ts`, ['gone']);
      namedUse.set(`src/f${String(i).padStart(2, '0')}.ts`, new Set(['other']));
    }
    const result = findUnusedExports({ exportsByFile, namedUse, entries: new Set(), partialReasons: ['cap'] });
    expect(result.status).toBe('partial');
    expect(result.files).toHaveLength(ORPHAN_LIST_CAP);
    expect(result.truncated).toBe(5);
    expect(unusedExportLine(result.files[0])).toBe('src/f00.ts exports gone, and nothing imports it by name.');
  });
});
