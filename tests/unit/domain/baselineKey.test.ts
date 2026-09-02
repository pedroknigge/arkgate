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
  isFreezableBaselineViolation,
  structureFreezeTarget,
  NON_FREEZABLE_BASELINE_RULE_IDS,
} from '../../../src/domain/baselineKey';
import {
  baselineKey as fromCli,
  baselineOccurrenceKeys as occurrencesFromCli,
  findingRefFromTargetKey as findingRefFromCli,
  findingTargetKey as findingTargetKeyFromCli,
  findingRefForViolation as findingRefForViolationFromCli,
  isFreezableBaselineViolation as isFreezableFromCli,
  structureFreezeTarget as structureTargetFromCli,
  NON_FREEZABLE_BASELINE_RULE_IDS as nonFreezableFromCli,
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

  it('covers STRUCTURE freeze target + non-freezable SCOPE_EMPTY on Domain and CLI', () => {
    expect(NON_FREEZABLE_BASELINE_RULE_IDS).toContain('ARKRULE_SCOPE_EMPTY');
    expect(nonFreezableFromCli).toContain('ARKRULE_SCOPE_EMPTY');
    expect(structureFreezeTarget({ target: 'orchestration-only' })).toBe('orchestration-only');
    expect(structureTargetFromCli({ target: 'orchestration-only' })).toBe('orchestration-only');
    expect(structureFreezeTarget({ sensor: 'thin-adapter' })).toBe('thin-adapter');
    expect(structureTargetFromCli({ sensor: 'thin-adapter' })).toBe('thin-adapter');
    expect(structureFreezeTarget({ code: 'writes-via-aggregate' })).toBe('writes-via-aggregate');
    expect(structureTargetFromCli({ code: 'writes-via-aggregate' })).toBe('writes-via-aggregate');
    expect(structureFreezeTarget({ sensor: 'thin-adapter', symbol: 'save' })).toBe(
      'thin-adapter:save'
    );
    expect(structureTargetFromCli({ sensor: 'thin-adapter', symbol: 'save' })).toBe(
      'thin-adapter:save'
    );
    expect(structureFreezeTarget({ message: 'x (sensor orchestration-only) y' })).toBe(
      'orchestration-only'
    );
    expect(structureTargetFromCli({ message: 'x (sensor orchestration-only) y' })).toBe(
      'orchestration-only'
    );
    expect(structureFreezeTarget({ symbol: 'onlySymbol' })).toBe('onlySymbol');
    expect(structureTargetFromCli({ symbol: 'onlySymbol' })).toBe('onlySymbol');
    expect(structureFreezeTarget({})).toBe('');
    expect(structureTargetFromCli({})).toBe('');
    const structureHit = {
      ruleId: 'ARKRULE_STRUCTURE',
      file: 'src/a.ts',
      fromLayer: 'Application',
      sensor: 'orchestration-only',
    };
    expect(baselineKey(structureHit)).toBe(
      'ARKRULE_STRUCTURE|src/a.ts|Application||orchestration-only'
    );
    expect(fromCli(structureHit)).toBe(
      'ARKRULE_STRUCTURE|src/a.ts|Application||orchestration-only'
    );
    expect(
      fromCli({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'src/a.ts',
        target: 'src/b.ts',
      })
    ).toBe('LAYER_IMPORT_VIOLATION|src/a.ts|||src/b.ts');
    expect(isFreezableBaselineViolation({ freezable: false })).toBe(false);
    expect(isFreezableFromCli({ freezable: false })).toBe(false);
    expect(isFreezableBaselineViolation({ ruleId: 'ARKRULE_SCOPE_EMPTY' })).toBe(false);
    expect(isFreezableFromCli({ ruleId: 'ARKRULE_SCOPE_EMPTY' })).toBe(false);
    expect(isFreezableBaselineViolation({ ruleId: 'ARKRULE_STRUCTURE' })).toBe(true);
    expect(isFreezableFromCli({ ruleId: 'ARKRULE_STRUCTURE' })).toBe(true);
    expect(isFreezableBaselineViolation({})).toBe(true);
    expect(isFreezableFromCli({})).toBe(true);
    expect(
      baselineOccurrenceKeys([{ ruleId: 'ARKRULE_SCOPE_EMPTY', file: 'arkrules/X.json' }])
    ).toEqual(['']);
    expect(
      occurrencesFromCli([{ ruleId: 'ARKRULE_SCOPE_EMPTY', file: 'arkrules/X.json' }])
    ).toEqual(['']);
  });

  it('does not treat empty or whitespace STRUCTURE fields as freeze identity', () => {
    expect(structureFreezeTarget({ target: '', sensor: 'thin-adapter' })).toBe('thin-adapter');
    expect(structureFreezeTarget({ sensor: '  ', symbol: 'save' })).toBe('save');
    expect(structureFreezeTarget({ message: 'no named sensor', symbol: 'only' })).toBe('only');
    expect(structureFreezeTarget({ message: 'no named sensor' })).toBe('');
    expect(structureFreezeTarget({ sensor: 'thin-adapter', symbol: '  save  ' })).toBe(
      'thin-adapter:save'
    );
    expect(
      baselineKey({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'a.ts',
        sensor: 'thin-adapter',
      })
    ).toBe('LAYER_IMPORT_VIOLATION|a.ts|||');
  });
});
