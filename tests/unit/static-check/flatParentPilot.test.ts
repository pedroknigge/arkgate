/**
 * #326 PR6 — flat-parent doctor suggestion and the stars destination check.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sliceIdForPath } from '../../../bin/ark-layer-match.mjs';
import { destinationKeepsLayerAndSlice } from '../../../bin/lib/physical-cohesion.mjs';
import {
  collectFlatParentPilot,
  flatParentCandidates,
  flatParentPilotHtml,
  printFlatParentPilot,
} from '../../../bin/lib/flat-parent-pilot.mjs';
import { collectPilotCandidates } from '../../../bin/lib/pilot-loop.mjs';

const temps: string[] = [];

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const layers = [
  { name: 'Application', patterns: ['src/lib/features/**'] },
  { name: 'Persistence', patterns: ['src/lib/repositories/**'] },
];

const rule = {
  from: 'Application',
  to: 'Persistence',
  allowed: false,
  peerIsolation: true,
  sliceFolders: ['features'],
  childSlices: {
    sliceFolders: ['lib/features/*/*', 'lib/repositories/features/*/*'],
    sliceIdentity: 'stars' as const,
    commonFolders: ['domain'],
    siblings: 'deny' as const,
  },
};

function write(root: string, rel: string, body: string) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  return rel;
}

describe('flat parent pilot', () => {
  it('suggests the single-importer file and stays quiet for two importers and zero', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-flat-parent-'));
    temps.push(root);
    const files = [
      write(root, 'src/lib/repositories/features/projects/rfi-repository.ts', 'export const rfi = 1;\n'),
      write(root, 'src/lib/repositories/features/projects/catalog-repository.ts', 'export const catalog = 1;\n'),
      write(root, 'src/lib/repositories/features/projects/orphan-repository.ts', 'export const orphan = 1;\n'),
      write(
        root,
        'src/lib/features/projects/rfi/load-rfi.ts',
        [
          "import { rfi } from '../../../repositories/features/projects/rfi-repository';",
          "import { catalog } from '../../../repositories/features/projects/catalog-repository';",
          "import { rfi as again } from '../../../repositories/features/projects/rfi-repository';",
          'export const load = rfi + catalog + again;\n',
        ].join('\n')
      ),
      write(
        root,
        'src/lib/features/projects/rfi/load-rfi-again.ts',
        "import { rfi } from '../../../repositories/features/projects/rfi-repository';\nexport const again = rfi;\n"
      ),
      write(
        root,
        'src/lib/features/projects/scm/scm-board.ts',
        [
          '// from \'../../../repositories/features/projects/rfi-repository\'',
          "import { catalog } from '../../../repositories/features/projects/catalog-repository';",
          'export const board = catalog;\n',
        ].join('\n')
      ),
      write(
        root,
        'src/lib/features/projects/domain/project-codes.ts',
        'export const codes = 1;\n'
      ),
    ];
    const pilot = collectFlatParentPilot({ root, files, rules: [rule, rule], layers });
    expect(pilot?.moves.map((move) => move.file)).toEqual([
      'src/lib/repositories/features/projects/rfi-repository.ts',
    ]);
    const move = pilot.moves[0];
    expect(move.importer).toBe('features/projects/rfi');
    expect(move.destination).toBe('src/lib/repositories/features/projects/rfi');
    expect(move.layer).toBe('Persistence');
    expect(move.keepsLayer).toBe(true);
    expect(move.keepsSlice).toBe(false);
    expect(move.destinationChild).toBe('features/projects/rfi');
    expect(move.agreesWithWall).toBe(true);
    expect(move.evidence).toContain('suggestion');
    expect(move.evidence).not.toMatch(/\bdone\b/i);
    expect(move.evidence).not.toMatch(/\bclean\b/i);
    expect(pilot.notAScore).toBe(true);
    expect(pilot.applied).toBe(false);
  });

  it('omits the advisory when no child wall is configured', () => {
    expect(collectFlatParentPilot({ root: '/tmp', files: ['src/a.ts'], rules: [], layers })).toBeNull();
    expect(collectFlatParentPilot({ root: '/tmp', files: [], rules: [{ sliceFolders: ['features'] }], layers })).toBeNull();
  });

  it('skips a flat file whose destination would leave its layer', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-flat-parent-layer-'));
    temps.push(root);
    const narrow = [{ name: 'Persistence', patterns: ['src/lib/repositories/features/projects/*'] }];
    const files = [
      write(root, 'src/lib/repositories/features/projects/only-repository.ts', 'export const only = 1;\n'),
      write(
        root,
        'src/lib/features/projects/rfi/load-only.ts',
        "import { only } from '../../../repositories/features/projects/only-repository';\nexport const load = only;\n"
      ),
    ];
    expect(collectFlatParentPilot({ root, files, rules: [rule], layers: narrow })).toBeNull();
  });

  it('counts require and dynamic import as importers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-flat-parent-require-'));
    temps.push(root);
    const files = [
      write(root, 'src/lib/repositories/features/projects/rfi-repository.ts', 'exports.rfi = 1;\n'),
      write(
        root,
        'src/lib/features/projects/rfi/load-rfi.ts',
        "const { rfi } = require('../../../repositories/features/projects/rfi-repository');\nexport const load = rfi;\n"
      ),
      write(
        root,
        'src/lib/features/projects/scm/scm-board.ts',
        "export const board = import('../../../repositories/features/projects/rfi-repository');\n"
      ),
    ];
    expect(collectFlatParentPilot({ root, files, rules: [rule], layers })).toBeNull();
  });

  it('ignores comments, package imports, a missing file, and a self-import', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-flat-parent-noise-'));
    temps.push(root);
    const files = [
      write(
        root,
        'src/lib/repositories/features/projects/rfi-repository.ts',
        "import { rfi } from './rfi-repository';\nexport const rfi = 1;\n"
      ),
      write(root, 'src/lib/repositories/features/projects/z-repository.ts', 'export const zed = 1;\n'),
      write(
        root,
        'src/lib/features/projects/rfi/load-rfi.ts',
        [
          'const early = require("./early");',
          '/* import { rfi } from "../../../repositories/features/projects/catalog-repository"; */',
          "import pkg from 'arkgate';",
          "import { rfi } from '../../../repositories/features/projects/rfi-repository';",
          "import { nested } from '../../../repositories/features/projects/./rfi-repository';",
          "import { doubled } from '../../../repositories/features/projects//rfi-repository';",
          "import { gone } from '../../../../../../../../outside';",
          "import broken from '",
        ].join('\n')
      ),
      write(
        root,
        'src/lib/features/projects/scm/load-z.ts',
        "import { zed } from '../../../repositories/features/projects/z-repository';\nexport const load = zed;\n"
      ),
      'src/lib/features/projects/scm/missing.ts',
    ];
    const twin = {
      ...rule,
      childSlices: { ...rule.childSlices, commonFolders: ['other'] },
    };
    const pilot = collectFlatParentPilot({
      root,
      files,
      rules: [{ childSlices: { sliceFolders: ['lib/features/*/*'] } }, rule, twin],
      layers,
    });
    expect(pilot?.moves.map((move) => move.file)).toEqual([
      'src/lib/repositories/features/projects/rfi-repository.ts',
      'src/lib/repositories/features/projects/z-repository.ts',
    ]);
    expect(collectFlatParentPilot({ root, rules: [rule], layers })).toBeNull();
    expect(collectFlatParentPilot({ root, files, rules: 'nope', layers })).toBeNull();
    expect(
      collectFlatParentPilot({
        root,
        files,
        rules: [rule],
        layers: [{ name: 'Other', patterns: ['nope/**'] }],
      })
    ).toBeNull();
  });

  it('prints and renders a suggestion, including the overflow line', () => {
    const moves = Array.from({ length: 6 }, (_, index) => ({
      file: `src/lib/repositories/flat-${index}.ts`,
      evidence: `One child imports flat-${index}. This is a suggestion.`,
    }));
    const lines: string[] = [];
    printFlatParentPilot(
      { moves },
      {
        color: { bold: (text: string) => text, dim: (text: string) => text },
        warn: 'warn',
        line: (_tone: string, text: string) => lines.push(text),
      }
    );
    expect(lines[0]).toContain('suggestion');
    expect(lines.some((line) => line.includes('+1 more'))).toBe(true);
    printFlatParentPilot(null, {
      color: { bold: (text: string) => text, dim: (text: string) => text },
      warn: 'warn',
      line: () => undefined,
    });
    const one: string[] = [];
    printFlatParentPilot(
      { moves: moves.slice(0, 1) },
      {
        color: { bold: (text: string) => text, dim: (text: string) => text },
        warn: 'warn',
        line: (_tone: string, text: string) => one.push(text),
      }
    );
    expect(one.some((line) => line.includes('more'))).toBe(false);
    const html = flatParentPilotHtml({ moves: [{}, ...moves.slice(0, 5)] }, (value: unknown) => `[${value}]`);
    expect(html).toContain('data-advisory="flatParentPilot"');
    expect(html).toContain('+1 more');
    expect(html).toContain('[One child');
    expect(flatParentCandidates({ moves: [{ file: '', evidence: 1 }, { destination: 'src/lib' }] })).toEqual([]);
    const [candidate] = flatParentCandidates({
      moves: [{ file: 'src/a.ts', destination: 'src/child' }],
    });
    expect(candidate?.move).toContain('suggestion');
  });

  it('ranks a flat-parent candidate after a reshape card', () => {
    const section = collectFlatParentPilot({
      root: '/tmp',
      files: [],
      rules: [rule],
      layers,
    });
    expect(section).toBeNull();
    const candidates = collectPilotCandidates(
      { designWeak: true, patternBets: [], designSmells: [] },
      {
        physicalCohesion: {
          reshapePilot: {
            proposed: true,
            nextPilot: {
              pilotTarget: 'timesheet @ src/lib/repositories',
              move: 'Consolidate one anchor',
              moveSample: [],
              successSignal: 'cluster drops',
              killSwitch: 'revert',
            },
          },
        },
        flatParentPilot: {
          moves: [
            {
              file: 'src/lib/repositories/features/projects/rfi-repository.ts',
              destination: 'src/lib/repositories/features/projects/rfi',
              evidence: 'One child imports the file. This is a suggestion.',
            },
          ],
        },
      }
    );
    expect(candidates.map((row) => row.source)).toEqual(['reshape', 'flat-parent']);
    expect(flatParentCandidates(null)).toEqual([]);
    const html = flatParentPilotHtml({
      moves: [{ evidence: 'One child imports the file. This is a suggestion.' }],
    });
    expect(html).toContain('data-advisory="flatParentPilot"');
    expect(html).toContain('suggestion');
    expect(html).not.toMatch(/\bdone\b/i);
    expect(html).not.toMatch(/\bclean\b/i);
    expect(flatParentPilotHtml(null)).toBe('');
  });
});

describe('destinationKeepsLayerAndSlice under stars', () => {
  it('disagrees with a slice id that ignores sliceIdentity, and agrees with the wall', () => {
    const from = 'src/lib/repositories/features/projects/rfi/rfi-store.ts';
    const to = 'src/lib/repositories/features/projects/scm/scm-repository.ts';
    expect(sliceIdForPath(from, ['features'])).toBe('features/projects');
    expect(sliceIdForPath(to, ['features'])).toBe('features/projects');
    expect(destinationKeepsLayerAndSlice(from, to, layers, [rule])).toBe(false);
    const same = 'src/lib/repositories/features/projects/rfi/store/rfi-store.ts';
    expect(destinationKeepsLayerAndSlice(from, same, layers, [rule])).toBe(true);
    expect(destinationKeepsLayerAndSlice(from, to, layers, [])).toBe(true);
    expect(destinationKeepsLayerAndSlice(from, same, layers, null)).toBe(true);
    expect(destinationKeepsLayerAndSlice(from, same, layers, [null, 'nope', rule])).toBe(true);
    expect(destinationKeepsLayerAndSlice(from, 'src/lib/features/projects/rfi/load-rfi.ts', layers, [rule])).toBe(false);
  });
});
