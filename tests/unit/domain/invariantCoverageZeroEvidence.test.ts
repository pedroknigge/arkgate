import { describe, expect, it } from 'vitest';
import {
  buildEffectiveArkRules,
  loadArkRulesContract,
  type ArkRulesFile,
} from '../../../src/domain/arkRulesContract';
import {
  canPromoteInvariant,
  evaluateInvariantCoverage,
} from '../../../src/domain/invariantCoverage';

function rules(invariants: unknown[]): unknown {
  return { schemaVersion: '1.0', layer: 'DomainModel', invariants };
}

describe('enforced invariant with zero declared evidence (arkrules cluster)', () => {
  it('the loader accepts every opt-out shape (the verdict lives in coverage, not load)', () => {
    expect(() =>
      loadArkRulesContract(
        rules([
          { id: 'INV-A', description: 'a', coverage: { test: false }, mode: 'advisory' },
          {
            id: 'INV-B',
            description: 'b',
            coverage: { test: false, symbol: 'Order.ensure' },
            mode: 'enforced',
          },
          { id: 'INV-C', description: 'c', coverage: { test: false } },
          { id: 'INV-D', description: 'd', coverage: { test: false }, mode: 'enforced' },
        ])
      )
    ).not.toThrow();
  });

  it('an enforced opt-out without symbol is a failing INVARIANT_UNCOVERED, not a load error', () => {
    const file = loadArkRulesContract(
      rules([{ id: 'INV-A', description: 'a', coverage: { test: false }, mode: 'enforced' }])
    ).config as ArkRulesFile;
    const arkRules = buildEffectiveArkRules([
      { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file },
    ]);
    const result = evaluateInvariantCoverage({
      arkRules,
      fileContents: { 'src/domain/order.ts': 'export class Order {}' },
      testFiles: ['tests/order.test.ts'],
      coverageRoots: ['tests'],
    });
    expect(result.coverage[0]?.covered).toBe(false);
    const violation = result.violations.find(
      (v) => v.ruleId === 'INVARIANT_UNCOVERED' && v.arkruleId === 'INV-A'
    );
    expect(violation?.failsStrict).toBe(true);
    expect(violation?.severity).toBe('error');
    expect(violation?.message).toContain('is enforced but declares no evidence');
  });

  it('advisory opt-out stays covered (documented behaviour) but cannot be promoted', () => {
    const file = loadArkRulesContract(
      rules([{ id: 'INV-A', description: 'a', coverage: { test: false }, mode: 'advisory' }])
    ).config;
    const arkRules = buildEffectiveArkRules([
      { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file },
    ]);
    const result = evaluateInvariantCoverage({
      arkRules,
      fileContents: { 'src/domain/order.ts': 'export class Order {}' },
      testFiles: ['tests/order.test.ts'],
      coverageRoots: ['tests'],
    });
    const entry = result.coverage[0]!;
    expect(entry.covered).toBe(true);
    expect(entry.evidence).toEqual([]);
    const verdict = canPromoteInvariant(entry);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('declares no evidence');
  });
});
