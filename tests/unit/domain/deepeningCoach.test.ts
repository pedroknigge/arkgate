/**
 * Deep-module coach pure projection: no evidence → no fake candidates.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDeepeningCandidates,
  hasNoDeepeningEvidence,
  DEEPENING_CANDIDATE_CAP,
  ARK_DEEPENING_COACH_SCHEMA_VERSION,
} from '../../../src/domain/deepeningCoach';

describe('deepeningCoach (Domain pure)', () => {
  it('returns empty candidates when no evidence is supplied', () => {
    const empty = buildDeepeningCandidates({});
    expect(empty.schemaVersion).toBe(ARK_DEEPENING_COACH_SCHEMA_VERSION);
    expect(empty.notAScore).toBe(true);
    expect(empty.candidates).toEqual([]);
    expect(hasNoDeepeningEvidence({})).toBe(true);
    expect(hasNoDeepeningEvidence(undefined)).toBe(true);
    expect(hasNoDeepeningEvidence({ designSmells: [], physicalCohesion: null })).toBe(true);
  });

  it('does not invent candidates from green compass residual-none', () => {
    const result = buildDeepeningCandidates({
      designSmells: [],
      improvementCompass: {
        notAScore: true,
        topResidual: [],
        lenses: [{ id: 'soc', status: 'ok', summary: 'clean' }],
      },
      pilotLoop: { active: false, nextPilot: null },
      physicalCohesion: { findings: [], reshapePilot: { nextPilot: null } },
    });
    expect(result.candidates).toEqual([]);
  });

  it('projects from design smells with evidence paths', () => {
    const result = buildDeepeningCandidates({
      designSmells: [
        {
          id: 'god-module',
          outcome: 'A huge file owns too many jobs',
          evidence: ['src/app/monster.ts'],
          fix: 'Split by concern',
        },
      ],
    });
    expect(result.notAScore).toBe(true);
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]?.target).toBe('src/app/monster.ts');
    expect(result.candidates[0]?.friction).toMatch(/huge file/i);
    expect(result.candidates[0]?.evidence.some((e) => e.source === 'designSmells')).toBe(true);
  });

  it('projects from pilotLoop nextPilot and residual lenses', () => {
    const result = buildDeepeningCandidates({
      pilotLoop: {
        active: true,
        nextPilot: {
          pilotTarget: 'src/features/orders',
          smellId: 'io-under-application',
          move: 'Extract port',
          successSignal: 'Routes no longer import ORM',
        },
      },
      improvementCompass: {
        notAScore: true,
        topResidual: ['dip', 'soc'],
        lenses: [
          { id: 'dip', status: 'residual', summary: 'ports missing' },
          { id: 'soc', status: 'residual', summary: 'mixed concerns' },
        ],
      },
    });
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.candidates.some((c) => c.target === 'src/features/orders')).toBe(true);
    expect(result.candidates.some((c) => c.target.startsWith('lens:'))).toBe(true);
    expect(result.candidates.length).toBeLessThanOrEqual(DEEPENING_CANDIDATE_CAP);
  });

  it('caps candidates and never claims a score field', () => {
    const smells = Array.from({ length: 12 }, (_, i) => ({
      id: `smell-${i}`,
      outcome: `Friction ${i}`,
      evidence: [`src/f${i}.ts`],
    }));
    const result = buildDeepeningCandidates({ designSmells: smells });
    expect(result.candidates.length).toBe(DEEPENING_CANDIDATE_CAP);
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('rank');
  });

  it('projects physical cohesion findings and reshape pilot without inventing paths', () => {
    const result = buildDeepeningCandidates({
      physicalCohesion: {
        findings: [
          {
            concept: 'order',
            anchors: ['src/features/orders', 'src/lib/orders'],
            message: 'order concept split',
          },
          null,
          { concept: '', anchors: [] },
        ],
        reshapePilot: {
          nextPilot: {
            pilotTarget: 'src/features/orders',
            move: 'Colocate order concept',
            successSignal: 'Cluster count drops',
          },
        },
      },
    });
    expect(result.candidates.some((c) => c.target === 'src/features/orders')).toBe(true);
    expect(result.candidates.some((c) => c.evidence.some((e) => e.source === 'physicalCohesion'))).toBe(
      true
    );
    // Invalid rows skipped; still notAScore.
    expect(result.notAScore).toBe(true);
  });

  it('reads evidence path objects and ignores empty smell rows', () => {
    const result = buildDeepeningCandidates({
      designSmells: [
        null as unknown as { id: string },
        { id: '', message: '', evidence: [{ path: 'src/a.ts' }] },
        { id: 'soft-contract', message: 'soft walls', evidence: [{ file: 'src/b.ts' }] },
      ],
    });
    expect(result.candidates.some((c) => c.target === 'src/a.ts' || c.target === 'src/b.ts')).toBe(
      true
    );
  });

  it('rejects near-empty smell / pilot shells (not synthetic design-smell or pilot targets)', () => {
    const result = buildDeepeningCandidates({
      designSmells: [
        { id: '   ', message: '  ', evidence: [] },
        { id: '', outcome: '', evidence: [{ path: '' }] },
      ],
      pilotLoop: { active: true, nextPilot: { pilotTarget: '', pilot: '', smellId: '  ' } },
      physicalCohesion: {
        reshapePilot: { nextPilot: { pilotTarget: '', pilot: '', move: 'x' } },
      },
    });
    expect(result.candidates).toEqual([]);
    expect(result.candidates.some((c) => c.target === 'design-smell' || c.target === 'pilot')).toBe(
      false
    );
  });
});
