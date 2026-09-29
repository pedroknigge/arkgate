import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildEffectiveArkRules, loadArkRulesContract } from '../../../src/domain/arkRulesContract';
import { evaluateInvariantCoverage } from '../../../src/domain/invariantCoverage';
import { evaluateInvariantCoverage as evaluateCli } from '../../../bin/lib/invariant-coverage.mjs';
import { summarizeRulesUnderContract } from '../../../bin/lib/rules-under-contract.mjs';

function catalog(symbol: string) {
  const file = loadArkRulesContract({
    schemaVersion: '1.0',
    layer: 'Domain',
    invariants: [
      {
        id: 'INV-ORDER-TOTAL',
        description: 'Order total never negative',
        aggregate: 'Order',
        coverage: { test: false, symbol },
        mode: 'enforced',
      },
    ],
  }).config;
  return buildEffectiveArkRules([{ layer: 'Domain', sourceFile: 'arkrules/Domain.json', file }]);
}

function covered(fileContents: Record<string, string>, symbol = 'Order.ensureInvariants') {
  const input = {
    arkRules: catalog(symbol),
    fileContents,
    testFiles: ['tests/order.test.ts'],
    coverageRoots: ['tests'],
  };
  const domain = evaluateInvariantCoverage(input);
  const cli = evaluateCli(input);
  expect(cli.coverage[0]?.covered).toBe(domain.coverage[0]?.covered);
  return domain;
}

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('coverage.symbol Class.member requires class membership (arkrules cluster)', () => {
  it('A: a comment naming the class plus another class declaring the method is not coverage', () => {
    const result = covered({
      'src/domain/order.ts': 'export class Order { total = 0; }',
      'src/app/invoice.ts':
        '// unrelated to Order\nexport class Invoice { ensureInvariants(): void {} }',
    });
    expect(result.coverage[0]?.covered).toBe(false);
    expect(result.violations.some((v) => v.ruleId === 'INVARIANT_UNCOVERED')).toBe(true);
  });

  it('C: an OrderLine class plus a free function is not coverage', () => {
    const result = covered({
      'src/domain/order.ts': 'export class Order { total = 0; }',
      'src/app/line.ts': 'export class OrderLine {}\nexport function ensureInvariants(): void {}',
    });
    expect(result.coverage[0]?.covered).toBe(false);
  });

  it('a method on a different class in the same file as Order is not coverage', () => {
    const result = covered({
      'src/domain/order.ts':
        'export class Order { total = 0; }\nexport class Invoice { ensureInvariants() {} }',
    });
    expect(result.coverage[0]?.covered).toBe(false);
  });

  it('D: the genuine member of Order is coverage (generic, abstract and string braces too)', () => {
    expect(
      covered({
        'src/domain/order.ts':
          'export class Order { ensureInvariants() { if (this.total < 0) throw new Error(); } }',
      }).coverage[0]?.covered
    ).toBe(true);
    const generic = covered({
      'src/domain/order.ts':
        'export abstract class Order<T extends { id: string }> extends Base<T> {\n  private sep = "}";\n  protected ensureInvariants(): void {}\n}',
    });
    expect(generic.coverage[0]?.covered).toBe(true);
    expect(generic.coverage[0]?.shape).toBe('method');
    expect(generic.coverage[0]?.symbolEvidenceFile).toBe('src/domain/order.ts');
  });

  it('a bare symbol keeps the top-level declaration match', () => {
    expect(
      covered(
        { 'src/domain/rules.ts': 'export function ensureInvariants(): void {}' },
        'ensureInvariants'
      ).coverage[0]?.covered
    ).toBe(true);
  });

  it('doctor reports symbol evidence paths project-relative even for absolute fact paths', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-sym-member-')));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'arkrules', 'Domain.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        layer: 'Domain',
        invariants: [
          {
            id: 'INV-ORDER-TOTAL',
            description: 'Order total never negative',
            coverage: { test: false, symbol: 'Order.ensureInvariants' },
            mode: 'advisory',
          },
        ],
      })
    );
    const orderFile = path.join(root, 'src', 'domain', 'order.ts');
    fs.writeFileSync(orderFile, 'export class Order { ensureInvariants() {} }\n');
    fs.writeFileSync(path.join(root, 'tests', 'noop.test.ts'), "it('noop', () => {})\n");
    const summary = summarizeRulesUnderContract(
      root,
      {
        schemaVersion: '1.1',
        arkRules: { Domain: 'arkrules/Domain.json' },
        layers: [{ name: 'Domain', patterns: ['src/domain/**'] }],
        rules: [],
      },
      { files: [{ path: orderFile }] }
    );
    expect(summary.coveredInvariants).toBe(1);
    expect(summary.symbolEvidence).toEqual([
      { id: 'INV-ORDER-TOTAL', file: 'src/domain/order.ts' },
    ]);
    expect(summary.coveredSample?.[0]?.symbolEvidenceFile).toBe('src/domain/order.ts');
  });
});
