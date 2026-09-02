/**
 * Tooling-side ArkRules wiring: invariant coverage I/O, fileHints loader,
 * rules-under-contract (doctor) with real test fixtures.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_COVERAGE_FILES_CAP,
  coverageOptionsFromConfig,
  loadInvariantCoverageInputs,
} from '../../../bin/lib/invariant-coverage-io.mjs';
import {
  DEFAULT_MAX_HINT_FILES,
  HINT_BUDGET_DOCTOR_LINE,
  formatHintBudgetDoctorLine,
  getArkRuleHintBudget,
  loadArkRuleFileHints,
  needsArkRuleFileHints,
} from '../../../bin/lib/arkrule-file-hints.mjs';
import {
  formatRulesUnderContractHtml,
  summarizeRulesUnderContract,
} from '../../../bin/lib/rules-under-contract.mjs';

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

  it('finds tests even when production files exceed the coverage budget', () => {
    // Regression: the file budget (MAX_COVERAGE_FILES) was consumed by the
    // facts loop BEFORE the test walk ran, so any repo with more production
    // files than the budget reported testGlobsMissing=true — i.e. "this repo
    // never had tests" — no matter how many tests it actually had.
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });

    const files: Array<{ path: string }> = [];
    for (let i = 0; i < 500; i += 1) {
      const rel = `src/domain/mod${i}.ts`;
      fs.writeFileSync(path.join(root, rel), `export const v${i} = ${i};\n`);
      files.push({ path: rel });
    }
    fs.writeFileSync(
      path.join(root, 'tests', 'order.test.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );

    const inputs = loadInvariantCoverageInputs(root, { files });
    expect(inputs.testGlobsMissing).toBe(false);
    expect(inputs.testFiles.some((t: string) => t.includes('order.test.ts'))).toBe(true);
  });

  it('spends the file budget on tests that mention an invariant, not on walk order', () => {
    // With more test files than MAX_COVERAGE_FILES, walk order decided which
    // ones got read — so the test that actually named the invariant could be
    // dropped while 400 unrelated ones filled the budget. Passing invariantIds
    // makes the budget selective: scan is cheap, retention is what costs.
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    for (let i = 0; i < 500; i += 1) {
      fs.writeFileSync(
        path.join(root, 'tests', `noise${i}.test.ts`),
        `it('unrelated ${i}', () => {})\n`
      );
    }
    // The one that matters is written LAST: by walk order it would be dropped.
    fs.writeFileSync(
      path.join(root, 'tests', 'zzz-relevant.test.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );

    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { invariantIds: ['INV-ORDER-001'] }
    );
    expect(inputs.testGlobsMissing).toBe(false);
    expect(inputs.testFiles).toEqual(['tests/zzz-relevant.test.ts']);
  });

  it('honors coverage.maxFiles from config and reports the budget numbers', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    for (let i = 0; i < 6; i += 1) {
      fs.writeFileSync(
        path.join(root, 'tests', `inv${i}.test.ts`),
        `it('INV-ORDER-001 case ${i}', () => {})\n`
      );
    }
    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { invariantIds: ['INV-ORDER-001'], maxFiles: 2 }
    );
    expect(inputs.testFiles).toHaveLength(2);
    expect(inputs.coverageBudgetExhausted).toBe(true);
    expect(inputs.stats.maxFiles).toBe(2);
    expect(inputs.stats.filesLoaded).toBe(2);
    expect(inputs.stats.testFilesRetained).toBe(2);
    // Four files hit the cap — counted, not dropped in silence.
    expect(inputs.stats.discarded.budget).toBe(4);
  });

  it('counts tests discarded for naming no catalogued invariant', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'tests', 'relevant.test.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );
    for (let i = 0; i < 3; i += 1) {
      fs.writeFileSync(path.join(root, 'tests', `noise${i}.test.ts`), `it('noise ${i}', () => {})\n`);
    }
    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { invariantIds: ['INV-ORDER-001'] }
    );
    expect(inputs.stats.discarded.noInvariantMention).toBe(3);
    expect(inputs.stats.discarded.budget).toBe(0);
    expect(inputs.stats.maxFiles).toBe(400);
  });

  it('counts a discarded file once even when the walk roots overlap', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tests', 'a.checks.ts'), "it('unrelated', () => {})\n");
    // Custom globs add '.' to the walk roots, so 'tests' is reached twice.
    // A file discarded twice would report two files where one exists.
    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { invariantIds: ['INV-ORDER-001'], testGlobs: ['tests/**/*.checks.ts'] }
    );
    expect(inputs.stats.discarded.noInvariantMention).toBe(1);
  });

  it('refuses a symlink whose target escapes the project root', () => {
    const root = makeRoot();
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-outside-')));
    tempDirs.push(outside);
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(outside, 'secret.test.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );
    // A test that is not in this repo must not prove an invariant covered.
    fs.symlinkSync(path.join(outside, 'secret.test.ts'), path.join(root, 'tests', 'leak.test.ts'));

    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { invariantIds: ['INV-ORDER-001'] }
    );
    expect(inputs.testFiles).toEqual([]);
    expect(Object.keys(inputs.fileContents)).toEqual([]);
    expect(inputs.stats.discarded.outOfRoot).toBe(1);
  });

  it('keeps in-root symlinked tests as evidence', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages', 'order.test.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );
    fs.symlinkSync(
      path.join(root, 'packages', 'order.test.ts'),
      path.join(root, 'tests', 'linked.test.ts')
    );
    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { invariantIds: ['INV-ORDER-001'] }
    );
    expect(inputs.testFiles).toEqual(['tests/linked.test.ts']);
    expect(inputs.stats.discarded.outOfRoot).toBe(0);
  });

  it('counts every silent discard: oversize, unreadable, and depth-limited', () => {
    const root = makeRoot();
    // One directory past the walk depth limit: the whole subtree is dropped.
    const deep = path.join(root, 'tests', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i');
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, 'deep.test.ts'), "it('INV-ORDER-001 deep', () => {})\n");

    // Oversize: past the 256KB per-file cap.
    fs.writeFileSync(
      path.join(root, 'tests', 'huge.test.ts'),
      `it('INV-ORDER-001 huge', () => {})\n${'/*'.repeat(1)}${'x'.repeat(300 * 1024)}\n`
    );

    // Unreadable: a broken symlink still stats as a coverage candidate.
    fs.symlinkSync(path.join(root, 'tests', 'gone.test.ts'), path.join(root, 'tests', 'dangling.test.ts'));

    fs.writeFileSync(
      path.join(root, 'tests', 'ok.test.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );

    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { invariantIds: ['INV-ORDER-001'] }
    );
    expect(inputs.testFiles).toEqual(['tests/ok.test.ts']);
    expect(inputs.stats.discarded.oversize).toBe(1);
    expect(inputs.stats.discarded.unreadable).toBe(1);
    expect(inputs.stats.discarded.depthLimited).toBeGreaterThan(0);
  });

  it('counts a depth-limited directory once across overlapping walk roots', () => {
    // '.' and 'tests' both reach the same deep subtree, and the same directory
    // dropped twice reports two subtrees where one exists. Only a directory no
    // walk ever entered is depth-limited.
    const root = makeRoot();
    const deep = path.join(root, 'tests', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i');
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, 'deep.checks.ts'), "it('INV-ORDER-001 deep', () => {})\n");
    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { invariantIds: ['INV-ORDER-001'], testGlobs: ['**/*.checks.ts'] }
    );
    expect(inputs.stats.discarded.depthLimited).toBe(1);
  });

  it('reports files read, not only files retained', () => {
    // The budget bounds RETENTION: a test scanned and dropped for naming no
    // invariant still cost a read. Reporting only the retained count made the
    // scan look cheaper than it was and made maxFiles look like an I/O knob.
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'tests', 'relevant.test.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );
    for (let i = 0; i < 3; i += 1) {
      fs.writeFileSync(path.join(root, 'tests', `noise${i}.test.ts`), `it('noise ${i}', () => {})\n`);
    }
    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { invariantIds: ['INV-ORDER-001'] }
    );
    expect(inputs.stats.filesRead).toBe(4);
    expect(inputs.stats.filesLoaded).toBe(1);
  });

  it('clamps coverage.maxFiles to the hard cap instead of trusting any integer', () => {
    // The config validator implements no `maximum` keyword for integers, so a
    // schema bound would be silently ignored. The clamp is the enforcement.
    expect(
      coverageOptionsFromConfig({ coverage: { maxFiles: 10_000_000 } })
    ).toEqual({ maxFiles: MAX_COVERAGE_FILES_CAP });
    expect(coverageOptionsFromConfig({ coverage: { maxFiles: 900 } })).toEqual({ maxFiles: 900 });
  });

  it('coverageOptionsFromConfig reads coverage.testGlobs / coverage.maxFiles (absence is silent)', () => {
    expect(coverageOptionsFromConfig(undefined)).toEqual({});
    expect(coverageOptionsFromConfig({ layers: [] })).toEqual({});
    expect(coverageOptionsFromConfig({ coverage: {} })).toEqual({});
    expect(
      coverageOptionsFromConfig({ coverage: { testGlobs: ['qa/**/*.checks.ts'], maxFiles: 900 } })
    ).toEqual({ testGlobs: ['qa/**/*.checks.ts'], maxFiles: 900 });
    // Junk is ignored rather than silently narrowing the scan.
    expect(coverageOptionsFromConfig({ coverage: { testGlobs: [''], maxFiles: 0 } })).toEqual({});
  });

  it('coverageOptionsFromConfig reads coverage.coverageRoots (absence is silent)', () => {
    expect(
      coverageOptionsFromConfig({ coverage: { coverageRoots: ['tests', 'src'] } })
    ).toEqual({ coverageRoots: ['tests', 'src'] });
    expect(coverageOptionsFromConfig({ coverage: { coverageRoots: [] } })).toEqual({});
    expect(coverageOptionsFromConfig({ coverage: { coverageRoots: ['', 3] } })).toEqual({});
  });

  it('loadInvariantCoverageInputs echoes coverageRoots without filtering the scan', () => {
    // The declaration is evidence for Domain to compare against. Filtering the
    // walk by it here would hide the very disagreement it exists to report.
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'tests', 'order.test.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );
    const inputs = loadInvariantCoverageInputs(
      root,
      { files: [] },
      { invariantIds: ['INV-ORDER-001'], coverageRoots: ['qa'] }
    );
    expect(inputs.coverageRoots).toEqual(['qa']);
    expect(inputs.testFiles).toEqual(['tests/order.test.ts']);

    const silent = loadInvariantCoverageInputs(root, { files: [] }, {});
    expect(silent.coverageRoots).toBeUndefined();
  });

  it('rules-under-contract passes config coverage.testGlobs through to the scan', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
    fs.mkdirSync(path.join(root, 'qa'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
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
            coverage: { test: true },
            mode: 'advisory',
          },
        ],
      })
    );
    // Only a non-standard test layout proves the globs were threaded through.
    fs.writeFileSync(
      path.join(root, 'qa', 'order.checks.ts'),
      "it('INV-ORDER-001 keeps total non-negative', () => {})\n"
    );
    const config = {
      schemaVersion: '1.3',
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
      coverage: { testGlobs: ['qa/**/*.checks.ts'] },
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    };
    const summary = summarizeRulesUnderContract(root, config, { files: [] });
    expect(summary.coveredInvariants).toBe(1);
    expect(summary.uncoveredInvariants).toBe(0);

    const withoutGlobs = summarizeRulesUnderContract(
      root,
      { ...config, coverage: undefined },
      { files: [] }
    );
    expect(withoutGlobs.coveredInvariants).toBe(0);
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
    expect(needsArkRuleFileHints({ structure: [{ sensor: 'writes-via-aggregate' }] })).toBe(true);
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

  it('rules-under-contract still finds covering tests when production files exceed the budget', () => {
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
            coverage: { test: true },
            mode: 'advisory',
          },
        ],
      })
    );
    const files: Array<{ path: string }> = [];
    for (let i = 0; i < 500; i += 1) {
      const rel = `src/domain/mod${i}.ts`;
      fs.writeFileSync(path.join(root, rel), `export const v${i} = ${i};\n`);
      files.push({ path: rel });
    }
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
    const summary = summarizeRulesUnderContract(root, config, { files });
    expect(summary.coveredInvariants).toBe(1);
    expect(summary.uncoveredInvariants).toBe(0);
  });

  it('rules-under-contract HTML lists layers, structure sensors, and invariants (not counts-only)', () => {
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
        structureTruncated: 0,
        uncoveredTruncated: 0,
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
    expect(html).toMatch(/Heuristics of module shape/i);
    expect(html).toMatch(/not a claim that business semantics/i);
    expect(html).not.toMatch(/counts — not a score/i);
  });

  it('formatRulesUnderContractHtml covers inactive, loadErrors, empty structure, and default esc', () => {
    expect(formatRulesUnderContractHtml(null, (v: unknown) => String(v))).toBe('');
    expect(formatRulesUnderContractHtml(undefined as never)).toBe('');

    const inactive = formatRulesUnderContractHtml(
      {
        active: false,
        structureRules: 0,
        invariants: 0,
        coveredInvariants: 0,
        uncoveredInvariants: 0,
        notAScore: true,
        note: 'No arkRules map — intra-layer ArkRules are opt-in.',
      },
      (v: unknown) => String(v)
    );
    expect(inactive).toMatch(/ArkRules opt-in/);
    expect(inactive).toMatch(/No arkRules map/);

    const loadErr = formatRulesUnderContractHtml(
      {
        active: true,
        loadErrors: [{ path: '$.arkRules["DomainModel"]', message: 'missing file' }],
        notAScore: true,
        note: 'load failed',
      },
      (v: unknown) => String(v)
    );
    expect(loadErr).toMatch(/load errors/i);
    expect(loadErr).toMatch(/missing file/);

    const noStructure = formatRulesUnderContractHtml(
      {
        active: true,
        structureRules: 0,
        invariants: 0,
        coveredInvariants: 0,
        uncoveredInvariants: 0,
        layers: [{ name: 'DomainModel', structureRules: 0, invariants: 0, coveredInvariants: 0, uncoveredInvariants: 0 }],
        structure: [],
        uncovered: [],
        coveredSample: [],
        structureTruncated: 0,
        uncoveredTruncated: 0,
        coveredTruncated: 0,
        testFilesScanned: 0,
        notAScore: true,
        note: 'ok',
      },
      (v: unknown) => String(v)
    );
    expect(noStructure).toMatch(/No structure sensors/);
    expect(noStructure).toMatch(/All catalogued invariants have coverage evidence/);

    // enforced structure mode tag + no-description rows + default esc
    const enforced = formatRulesUnderContractHtml({
      active: true,
      structureRules: 1,
      invariants: 1,
      coveredInvariants: 0,
      uncoveredInvariants: 1,
      layers: [
        {
          name: 'DomainModel',
          structureRules: 1,
          invariants: 0,
          coveredInvariants: 0,
          uncoveredInvariants: 0,
        },
      ],
      structure: [
        {
          id: 'thin',
          sensor: 'thin-adapter',
          mode: 'enforced',
          layer: 'PersistenceAdapters',
        },
      ],
      uncovered: [{ id: 'INV-X', layer: 'DomainModel' }],
      coveredSample: [],
      structureTruncated: 0,
      uncoveredTruncated: 0,
      coveredTruncated: 0,
      testFilesScanned: 1,
      notAScore: true,
    });
    expect(enforced).toMatch(/>enforced</);
    expect(enforced).toContain('INV-X');

    // summarize inactive without arkRules
    const empty = summarizeRulesUnderContract(path.join(os.tmpdir(), 'ark-no-rules'), {
      schemaVersion: '1.1',
      layers: [],
      rules: [],
    });
    expect(empty.active).toBe(false);
  });

  it('doctor catalog caps structure/uncovered with *Truncated counters (HTML announces overflow)', () => {
    const esc = (v: unknown) => String(v);
    const structure = Array.from({ length: 3 }, (_, i) => ({
      id: `struct-${i}`,
      sensor: 'thin-adapter',
      mode: 'advisory',
      layer: 'FrameworkAdapters',
      description: `Sensor ${i}`,
    }));
    const uncovered = Array.from({ length: 2 }, (_, i) => ({
      id: `INV-U-${i}`,
      layer: 'DomainModel',
      description: `Uncovered ${i}`,
    }));
    const html = formatRulesUnderContractHtml(
      {
        active: true,
        structureRules: 45,
        invariants: 40,
        coveredInvariants: 10,
        uncoveredInvariants: 30,
        testFilesScanned: 1,
        layers: [],
        structure,
        structureTruncated: 42,
        uncovered,
        uncoveredTruncated: 28,
        coveredSample: [],
        coveredTruncated: 0,
        notAScore: true,
      },
      esc
    );
    expect(html).toContain('struct-0');
    expect(html).toContain('INV-U-0');
    expect(html).toMatch(/\(\+42 more structure rule/);
    expect(html).toMatch(/\(\+28 more uncovered\)/);
  });

  it('emits exact hinted/governed counts and fails strict when enforced hint sensors miss their scope', () => {
    // HINT-001: incomplete analysis must not look green. Budget 3 of 5 eligible
    // files — writes-via-aggregate applies only under src/lib/**, which the
    // alphabetical cap never reaches.
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'src', 'app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
    const files: Array<{ path: string }> = [];
    for (let i = 0; i < 3; i += 1) {
      const rel = `src/app/a${i}.ts`;
      fs.writeFileSync(path.join(root, rel), `export const a${i} = ${i};\n`);
      files.push({ path: rel });
    }
    for (let i = 0; i < 2; i += 1) {
      const rel = `src/lib/b${i}.ts`;
      fs.writeFileSync(path.join(root, rel), `export const b${i} = ${i};\n`);
      files.push({ path: rel });
    }
    const arkRules = {
      structure: [
        { sensor: 'orchestration-only', mode: 'enforced' },
        { sensor: 'thin-adapter', mode: 'enforced' },
        {
          sensor: 'writes-via-aggregate',
          mode: 'enforced',
          appliesTo: ['src/lib/**'],
        },
      ],
    };
    const hints = loadArkRuleFileHints(root, { files }, arkRules, undefined, { maxFiles: 3 });
    const budget = getArkRuleHintBudget(hints);
    expect(budget?.hinted).toBe(3);
    expect(budget?.governed).toBe(5);
    expect(budget?.budget).toBe(3);
    expect(budget?.truncated).toBe(true);
    expect(budget?.finding?.ruleId).toBe('ARKRULE_HINT_BUDGET_EXHAUSTED');
    expect(budget?.finding?.failsStrict).toBe(true);
    expect(budget?.finding?.message).toMatch(/hinted 3 of 5/);
    expect(budget?.sensors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sensor: 'orchestration-only',
          reviewed: 3,
          scope: 5,
        }),
        expect.objectContaining({
          sensor: 'writes-via-aggregate',
          reviewed: 0,
          scope: 2,
        }),
      ])
    );
    expect(budget?.completenessReason?.code).toBe('ARKRULE_HINT_BUDGET_EXHAUSTED');
    expect(budget?.completenessReason?.message).toMatch(
      /writes-via-aggregate reviewed 0\/2 files of its scope/
    );
    expect(formatHintBudgetDoctorLine(budget)).toMatch(/coverage\.maxFiles/);
    expect(formatHintBudgetDoctorLine(budget)).toMatch(/structural-hint preload/);
    // architecture-scan still consumes this as a path→flags map.
    expect(hints && typeof hints === 'object').toBe(true);
    expect(Object.keys(hints ?? {}).every((key) => key.includes('/'))).toBe(true);
  });

  it('warns with exact counts but does not fail strict when hint sensors are advisory', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const files: Array<{ path: string }> = [];
    for (let i = 0; i < 4; i += 1) {
      const rel = `src/f${i}.ts`;
      fs.writeFileSync(path.join(root, rel), `export const f${i} = ${i};\n`);
      files.push({ path: rel });
    }
    const hints = loadArkRuleFileHints(
      root,
      { files },
      { structure: [{ sensor: 'orchestration-only', mode: 'advisory' }] },
      undefined,
      { maxFiles: 2 }
    );
    const budget = getArkRuleHintBudget(hints);
    expect(budget?.hinted).toBe(2);
    expect(budget?.governed).toBe(4);
    expect(budget?.finding?.failsStrict).toBe(false);
    expect(budget?.finding?.message).toMatch(/hinted 2 of 4/);
  });

  it('is complete when eligible governed files fit the hint budget', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'ok.ts'), 'export const ok = 1;\n');
    const hints = loadArkRuleFileHints(
      root,
      { files: [{ path: 'src/ok.ts' }] },
      { structure: [{ sensor: 'orchestration-only', mode: 'enforced' }] }
    );
    const budget = getArkRuleHintBudget(hints);
    expect(budget?.hinted).toBe(1);
    expect(budget?.governed).toBe(1);
    expect(budget?.budget).toBe(DEFAULT_MAX_HINT_FILES);
    expect(budget?.truncated).toBe(false);
    expect(budget?.finding).toBeNull();
    expect(budget?.completenessReason).toBeNull();
  });

  it('doctor line names that coverage.maxFiles also bounds structural-hint preload', () => {
    expect(HINT_BUDGET_DOCTOR_LINE).toMatch(/coverage\.maxFiles/);
    expect(HINT_BUDGET_DOCTOR_LINE).toMatch(/structural-hint preload/);
    expect(HINT_BUDGET_DOCTOR_LINE).toMatch(/orchestration-only/);
    expect(HINT_BUDGET_DOCTOR_LINE).toMatch(/thin-adapter/);
    expect(HINT_BUDGET_DOCTOR_LINE).toMatch(/writes-via-aggregate/);
    expect(HINT_BUDGET_DOCTOR_LINE).toMatch(/no separate arkrules\.hintBudget/);
    expect(HINT_BUDGET_DOCTOR_LINE).toMatch(/default 400/);
  });
});
