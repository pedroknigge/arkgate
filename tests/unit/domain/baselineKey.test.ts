/**
 * R4: pure baselineKey unit tests — no ark-check spawn.
 */
import { describe, it, expect } from 'vitest';
import {
  baselineKey,
  baselineOccurrenceKeys,
} from '../../../src/domain/baselineKey';

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

  it('matches the generated CLI module for the same input', async () => {
    const {
      baselineKey: fromCli,
      baselineOccurrenceKeys: occurrencesFromCli,
    } = await import('../../../bin/lib/baseline-key.mjs');
    const v = {
      ruleId: 'CIRCULAR_DEPENDENCY',
      file: 'a.ts',
      target: 'a.ts → b.ts',
    };
    expect(baselineKey(v)).toBe(fromCli(v));
    expect(baselineOccurrenceKeys([v, v])).toEqual(occurrencesFromCli([v, v]));
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
});
