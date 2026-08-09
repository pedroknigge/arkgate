/**
 * R4: pure baselineKey unit tests — no ark-check spawn.
 */
import { describe, it, expect } from 'vitest';
import {
  baselineKey,
  baselineOccurrenceKeys,
  findingRefForViolation,
  findingRefFromTargetKey,
  findingTargetKey,
} from '../../../src/domain/baselineKey';
import {
  baselineKey as fromCli,
  baselineOccurrenceKeys as occurrencesFromCli,
  findingRefFromTargetKey as findingRefFromCli,
  findingTargetKey as findingTargetKeyFromCli,
  findingRefForViolation as findingRefForViolationFromCli,
} from '../../../bin/lib/baseline-key.mjs';

describe('baselineKey (src/domain — pure, no CLI spawn)', () => {
  it('joins ruleId|file|from|to|target with empty-string fallbacks', () => {
    expect(
      baselineKey({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'src/a.ts',
        fromLayer: 'DomainModel',
        toLayer: 'Kernel',
        target: 'src/b.ts',
      })
    ).toBe('LAYER_IMPORT_VIOLATION|src/a.ts|DomainModel|Kernel|src/b.ts');
  });

  it('uses empty strings when layers/target are missing', () => {
    expect(baselineKey({ ruleId: 'FORBIDDEN_GLOBAL', file: 'x.ts' })).toBe(
      'FORBIDDEN_GLOBAL|x.ts|||'
    );
  });

  it('matches the generated CLI module for the same input', () => {
    const v = {
      ruleId: 'CIRCULAR_DEPENDENCY',
      file: 'a.ts',
      target: 'a.ts → b.ts',
    };
    expect(baselineKey(v)).toBe(fromCli(v));
    expect(baselineOccurrenceKeys([v, v])).toEqual(occurrencesFromCli([v, v]));
    expect(findingRefFromTargetKey(baselineKey(v))).toBe(findingRefFromCli(fromCli(v)));
  });

  it('keeps independent occurrence counts and suffixes every duplicate', () => {
    const first = { ruleId: 'FORBIDDEN_GLOBAL', file: 'a.ts', target: 'fetch' };
    const second = { ruleId: 'FORBIDDEN_GLOBAL', file: 'b.ts', target: 'fetch' };

    expect(baselineOccurrenceKeys([first, first, second, first])).toEqual([
      baselineKey(first),
      `${baselineKey(first)}#2`,
      baselineKey(second),
      `${baselineKey(first)}#3`,
    ]);
  });

  it('exposes ACS06 findingTargetKey / findingRef as baseline-compatible ids', () => {
    const v = {
      ruleId: 'LAYER_IMPORT_VIOLATION',
      file: 'src/a.ts',
      fromLayer: 'DomainModel',
      toLayer: 'Kernel',
      target: 'src/b.ts',
    };
    expect(findingTargetKey(v)).toBe(baselineKey(v));
    expect(findingRefForViolation(v)).toBe(findingRefFromTargetKey(baselineKey(v)));
    expect(findingRefForViolation(v)).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    // Cover generated CLI pure exports (coverage threshold is 100% on baseline-key.mjs).
    expect(findingTargetKeyFromCli(v)).toBe(fromCli(v));
    expect(findingRefForViolationFromCli(v)).toBe(findingRefFromCli(fromCli(v)));
    expect(findingRefFromCli(fromCli(v))).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    // Empty-string hash path + empty occurrence list (branch coverage on CLI pure).
    expect(findingRefFromCli('')).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    expect(occurrencesFromCli([])).toEqual([]);
    expect(findingRefForViolationFromCli({})).toBe(findingRefFromCli(fromCli({})));
  });
});
