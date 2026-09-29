import { describe, expect, it } from 'vitest';
import {
  ArkRulesValidationError,
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
  it('the loader refuses enforced + coverage {test:false} with no symbol', () => {
    let caught: unknown;
    try {
      loadArkRulesContract(
        rules([{ id: 'INV-A', description: 'a', coverage: { test: false }, mode: 'enforced' }]),
        'arkrules/DomainModel.json',
        'DomainModel'
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ArkRulesValidationError);
    const issues = (caught as ArkRulesValidationError).issues;
    expect(issues.some((i) => i.path === '$.invariants[0].coverage')).toBe(true);
    expect(issues.map((i) => i.message).join(' ')).toContain('declares no evidence');
  });

  it('accepts advisory + {test:false} and enforced + {test:false, symbol}', () => {
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
        ])
      )
    ).not.toThrow();
  });

  it('evaluation reports an enforced opt-out without symbol as uncovered (defense in depth)', () => {
    // Hand-built catalog that bypasses the loader's semantic check.
    const file = {
      schemaVersion: '1.0',
      layer: 'DomainModel',
      invariants: [{ id: 'INV-A', description: 'a', coverage: { test: false }, mode: 'enforced' }],
    } as unknown as ArkRulesFile;
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
    expect(
      result.violations.some(
        (v) => v.ruleId === 'INVARIANT_UNCOVERED' && v.arkruleId === 'INV-A'
      )
    ).toBe(true);
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
