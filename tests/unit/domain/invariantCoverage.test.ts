import { describe, expect, it } from 'vitest';
import {
  buildEffectiveArkRules,
  loadArkRulesContract,
} from '../../../src/domain/arkRulesContract';
import {
  canPromoteInvariant,
  evaluateInvariantCoverage,
} from '../../../src/domain/invariantCoverage';

function catalog() {
  const file = loadArkRulesContract({
    schemaVersion: '1.0',
    layer: 'DomainModel',
    invariants: [
      {
        id: 'INV-ORDER-001',
        description: 'Order total never negative',
        aggregate: 'Order',
        coverage: { test: true, symbol: 'Order.ensureInvariants' },
        mode: 'enforced',
      },
    ],
  }).config;
  return buildEffectiveArkRules([
    { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file },
  ]);
}

describe('AR09–AR11 invariant coverage + promotion', () => {
  it('reports uncovered when no test or symbol evidence', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: { 'src/domain/order.ts': 'export class Order {}' },
      testFiles: ['tests/order.test.ts'],
    });
    expect(result.coverage[0]?.covered).toBe(false);
    expect(result.violations.some((v) => v.ruleId === 'INVARIANT_UNCOVERED')).toBe(true);
  });

  it('accepts test-title and symbol evidence (AR10)', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {
        'src/domain/order.ts':
          'export class Order { ensureInvariants() { if (this.total < 0) throw new Error(); } }',
        'tests/order.test.ts': "it('INV-ORDER-001 keeps total non-negative', () => {})",
      },
      testFiles: ['tests/order.test.ts'],
    });
    expect(result.coverage[0]?.covered).toBe(true);
    expect(result.coverage[0]?.evidence).toEqual(
      expect.arrayContaining(['test-title', 'symbol'])
    );
    expect(result.violations).toHaveLength(0);
  });

  it('reports partial when test globs are missing (never false green)', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {},
      testFiles: [],
      testGlobsMissing: true,
    });
    expect(result.partial).toBe(true);
    expect(result.coverage[0]?.covered).toBe(false);
    expect(result.violations[0]?.failsStrict).toBe(false);
  });

  it('refuses promotion of uncovered invariants (AR11)', () => {
    const uncovered = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {},
      testFiles: [],
    });
    expect(canPromoteInvariant(uncovered.coverage[0]).ok).toBe(false);

    const covered = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {
        'src/domain/order.ts': 'class Order { ensureInvariants() {} }',
        'tests/order.test.ts': "describe('INV-ORDER-001', () => {})",
      },
      testFiles: ['tests/order.test.ts'],
    });
    expect(canPromoteInvariant(covered.coverage[0]).ok).toBe(true);
  });
});
