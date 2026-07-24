/**
 * Tooling-side ArkRules wiring: invariant coverage I/O, fileHints loader,
 * rules-under-contract (doctor) with real test fixtures.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadInvariantCoverageInputs } from '../../../bin/lib/invariant-coverage-io.mjs';
import {
  loadArkRuleFileHints,
  needsArkRuleFileHints,
} from '../../../bin/lib/arkrule-file-hints.mjs';
import { summarizeRulesUnderContract } from '../../../bin/lib/rules-under-contract.mjs';

const tempDirs: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-rules-tooling-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('ArkRules tooling wiring', () => {
  it('loadInvariantCoverageInputs finds tests and content for coverage', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'domain', 'order.ts'),
      'export class Order { ensureInvariants() {} }\n'
    );
    fs.writeFileSync(
      path.join(root, 'tests', 'order.test.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );

    const inputs = loadInvariantCoverageInputs(root, {
      files: [{ path: 'src/domain/order.ts' }],
    });
    expect(inputs.testFiles.some((t: string) => t.includes('order.test.ts'))).toBe(true);
    expect(inputs.testGlobsMissing).toBe(false);
    expect(inputs.fileContents['tests/order.test.ts'] ?? inputs.fileContents['tests\\order.test.ts']).toMatch(
      /INV-ORDER-001/
    );
  });

  it('loadArkRuleFileHints derives orchestrationHeavy / adapterThick from disk', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'src', 'application'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'adapters'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'application', 'heavy.ts'),
      `
export function canPlaceOrder(order: Order) { return order.total > 0; }
export function calculateDiscount(order: Order) { return order.total * 0.1; }
export function shouldNotify(order: Order) { return order.status === 'paid'; }
`
    );
    fs.writeFileSync(
      path.join(root, 'src', 'adapters', 'thick.ts'),
      `
import { PrismaClient } from '@prisma/client';
export function canShip(order: Order) { return order.status === 'paid'; }
export async function save(order: Order) {
  if (order.total < 0) throw new Error('bad');
  if (order.status === 'cancelled') return;
  await new PrismaClient().order.create({ data: order });
}
`
    );

    const arkRules = {
      structure: [
        { sensor: 'orchestration-only' },
        { sensor: 'thin-adapter' },
      ],
    };
    expect(needsArkRuleFileHints(arkRules)).toBe(true);
    expect(needsArkRuleFileHints({ structure: [{ sensor: 'aggregate-private-state' }] })).toBe(
      false
    );

    const hints = loadArkRuleFileHints(
      root,
      {
        files: [
          { path: 'src/application/heavy.ts' },
          { path: 'src/adapters/thick.ts' },
        ],
      },
      arkRules
    );
    expect(hints?.['src/application/heavy.ts']?.orchestrationHeavy).toBe(true);
    expect(hints?.['src/adapters/thick.ts']?.adapterThick).toBe(true);
  });

  it('loadInvariantCoverageInputs honors custom testGlobs', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'qa', 'specs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'qa', 'specs', 'order.checks.ts'),
      "it('INV-ORDER-001 custom layout', () => {})\n"
    );
    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { testGlobs: ['qa/specs/**/*.checks.ts'] }
    );
    expect(inputs.testGlobsMissing).toBe(false);
    expect(inputs.testFiles.some((t: string) => t.includes('order.checks.ts'))).toBe(true);
  });

  it('rules-under-contract is not always uncovered when tests exist', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'arkrules', 'DomainModel.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        layer: 'DomainModel',
        structure: [],
        invariants: [
          {
            id: 'INV-ORDER-001',
            description: 'Order total never negative',
            coverage: { test: true, symbol: 'Order.ensureInvariants' },
            mode: 'advisory',
          },
        ],
      })
    );
    fs.writeFileSync(
      path.join(root, 'src', 'domain', 'order.ts'),
      'export class Order { ensureInvariants() { if (this.total < 0) throw new Error(); } }\n'
    );
    fs.writeFileSync(
      path.join(root, 'tests', 'order.test.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );

    const config = {
      schemaVersion: '1.1',
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    };
    const summary = summarizeRulesUnderContract(root, config, {
      files: [{ path: 'src/domain/order.ts' }],
    });
    expect(summary.active).toBe(true);
    expect(summary.coveredInvariants).toBe(1);
    expect(summary.uncoveredInvariants).toBe(0);
    expect(summary.testFilesScanned).toBeGreaterThan(0);
    expect(summary.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'DomainModel',
          invariants: 1,
          coveredInvariants: 1,
          uncoveredInvariants: 0,
        }),
      ])
    );
    expect(summary.coveredSample?.some((c: { id: string }) => c.id === 'INV-ORDER-001')).toBe(true);
  });

  it('rules-under-contract HTML lists layers, structure sensors, and invariants (not counts-only)', () => {
    // eslint-disable-next-line -- runtime .mjs under test
    const { formatRulesUnderContractHtml } = require('../../../bin/lib/rules-under-contract.mjs');
    const esc = (v: unknown) => String(v);
    const html = formatRulesUnderContractHtml(
      {
        active: true,
        structureRules: 2,
        invariants: 3,
        coveredInvariants: 2,
        uncoveredInvariants: 1,
        testFilesScanned: 4,
        layers: [
          {
            name: 'DomainModel',
            sourceFile: 'arkrules/DomainModel.json',
            structureRules: 2,
            invariants: 3,
            coveredInvariants: 2,
            uncoveredInvariants: 1,
          },
        ],
        structure: [
          {
            id: 'domain-no-anemic-model',
            sensor: 'no-anemic-model',
            mode: 'advisory',
            layer: 'DomainModel',
            description: 'Prefer rich Domain behavior',
          },
        ],
        uncovered: [
          {
            id: 'INV-MISSING',
            layer: 'DomainModel',
            description: 'Still needs a test',
          },
        ],
        coveredSample: [
          {
            id: 'INV-ORDER-001',
            layer: 'DomainModel',
            description: 'Order total never negative',
          },
        ],
        coveredTruncated: 0,
        notAScore: true,
        note: 'ArkRules plane',
      },
      esc
    );
    expect(html).toContain('data-advisory="rulesUnderContract"');
    expect(html).toMatch(/\[ArkRules\]/);
    expect(html).toContain('DomainModel');
    expect(html).toContain('domain-no-anemic-model');
    expect(html).toContain('no-anemic-model');
    expect(html).toContain('INV-MISSING');
    expect(html).toContain('INV-ORDER-001');
    expect(html).toContain('Structure sensors');
    expect(html).not.toMatch(/counts — not a score/i);
  });
});
