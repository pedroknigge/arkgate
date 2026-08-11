/**
 * Deep-module coach Tooling: hot-path honesty + no-evidence deepening.
 */
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line -- runtime .mjs under test
import {
  buildDeepModuleCoachAdvisory,
  computeHotPathAdvisory,
  HOT_PATH_MIN_HITS,
} from '../../../bin/lib/deep-module-coach.mjs';

describe('deepModuleCoach advisory (Tooling)', () => {
  it('marks hot paths unavailable when git has no HEAD (never invents paths)', () => {
    const hot = computeHotPathAdvisory('/tmp/not-a-git-repo-ark-test', {
      runGit: () => ({ status: 128, stdout: '', stderr: 'fatal: not a git repository' }),
    });
    expect(hot.available).toBe(false);
    expect(hot.status).toBe('unavailable');
    expect(hot.paths).toEqual([]);
    expect(hot.notAScore).toBe(true);
  });

  it('lists only paths above churn threshold', () => {
    const stdout = [
      'src/a.ts',
      'src/a.ts',
      'src/a.ts',
      'src/b.ts',
      'src/b.ts',
      'src/c.ts',
      '',
    ].join('\n');
    const hot = computeHotPathAdvisory('/tmp/repo', {
      runGit: (args: string[]) => {
        if (args[0] === 'rev-parse') return { status: 0, stdout: 'abc\n', stderr: '' };
        if (args[0] === 'log') return { status: 0, stdout, stderr: '' };
        return { status: 1, stdout: '', stderr: 'unexpected' };
      },
      minHits: HOT_PATH_MIN_HITS,
    });
    expect(hot.available).toBe(true);
    expect(hot.status).toBe('ok');
    expect(hot.paths.map((p: { path: string }) => p.path)).toEqual(['src/a.ts']);
    expect(hot.paths[0].changeCount).toBe(3);
  });

  it('no evidence → empty deepening candidates; never flips notAScore', () => {
    const coach = buildDeepModuleCoachAdvisory('/tmp/repo', {
      designSmells: [],
      physicalCohesion: null,
      improvementCompass: { notAScore: true, topResidual: [], lenses: [] },
      pilotLoop: null,
      runGit: () => ({ status: 128, stdout: '', stderr: 'fatal' }),
    });
    expect(coach.notAScore).toBe(true);
    expect(coach.deepeningCandidates).toEqual([]);
    expect(coach.hotPaths.paths).toEqual([]);
    expect(coach.hotPaths.status).toBe('unavailable');
  });

  it('projects deepening only when smells exist (still advisory)', () => {
    const coach = buildDeepModuleCoachAdvisory('/tmp/repo', {
      designSmells: [
        {
          id: 'facade-sql-in-routes',
          outcome: 'Routes import ORM',
          evidence: ['src/app/api/route.ts'],
        },
      ],
      runGit: () => ({ status: 128, stdout: '', stderr: 'fatal' }),
    });
    expect(coach.deepeningCandidates.length).toBe(1);
    expect(coach.deepeningCandidates[0].target).toBe('src/app/api/route.ts');
    expect(coach.notAScore).toBe(true);
  });

  it('returns ok with empty paths when log is empty (not unavailable)', () => {
    const hot = computeHotPathAdvisory('/tmp/repo', {
      runGit: (args: string[]) => {
        if (args[0] === 'rev-parse') return { status: 0, stdout: 'abc\n', stderr: '' };
        if (args[0] === 'log') return { status: 0, stdout: '\n\n', stderr: '' };
        return { status: 1, stdout: '', stderr: 'x' };
      },
    });
    expect(hot.available).toBe(true);
    expect(hot.status).toBe('ok');
    expect(hot.paths).toEqual([]);
  });

  it('treats git log failure as unavailable', () => {
    const hot = computeHotPathAdvisory('/tmp/repo', {
      runGit: (args: string[]) => {
        if (args[0] === 'rev-parse') return { status: 0, stdout: 'abc\n', stderr: '' };
        return { status: 1, stdout: '', stderr: 'log failed' };
      },
    });
    expect(hot.available).toBe(false);
    expect(hot.status).toBe('unavailable');
    expect(hot.paths).toEqual([]);
  });

  it('swallows thrown git helpers as unavailable (never invents paths)', () => {
    const hot = computeHotPathAdvisory('/tmp/repo', {
      runGit: () => {
        throw new Error('spawn failed');
      },
    });
    expect(hot.available).toBe(false);
    expect(hot.paths).toEqual([]);
  });

  it('prints hot paths, unavailable honesty, and candidates without score language', async () => {
    const { printDeepModuleCoachSection } = await import('../../../bin/lib/deep-module-coach.mjs');
    const lines: string[] = [];
    const io = {
      line: (mark: string, text: string) => lines.push(`${mark}:${text}`),
      warn: '!',
      ok: 'ok',
      color: { bold: (s: string) => s, dim: (s: string) => s },
    };

    printDeepModuleCoachSection(null, io);
    expect(lines).toEqual([]);

    const emptyCoach = buildDeepModuleCoachAdvisory('/tmp/repo', {
      designSmells: [],
      runGit: () => ({ status: 128, stdout: '', stderr: 'fatal' }),
    });
    printDeepModuleCoachSection(emptyCoach, io);
    expect(lines.some((l) => /unavailable/i.test(l))).toBe(true);
    expect(lines.some((l) => /none from existing evidence/i.test(l))).toBe(true);
    expect(lines.join('\n')).not.toMatch(/Excellent|\d+\s*\/\s*10/i);

    lines.length = 0;
    const listed = buildDeepModuleCoachAdvisory('/tmp/repo', {
      designSmells: [
        { id: 'god-module', outcome: 'Too many jobs', evidence: ['src/g.ts'], fix: 'Split' },
      ],
      runGit: (args: string[]) => {
        if (args[0] === 'rev-parse') return { status: 0, stdout: 'abc\n', stderr: '' };
        return {
          status: 0,
          stdout: ['src/hot.ts', 'src/hot.ts', 'src/hot.ts', 'src/hot.ts'].join('\n'),
          stderr: '',
        };
      },
    });
    printDeepModuleCoachSection(listed, io);
    expect(lines.some((l) => /src\/hot\.ts/.test(l))).toBe(true);
    expect(lines.some((l) => /src\/g\.ts|Too many jobs/.test(l))).toBe(true);
  });
});
