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
    expect(result.violations[0]?.message).toMatch(/never-had-tests/);
  });

  it('does not claim never-had-tests when the coverage file budget was exhausted', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {},
      testFiles: [],
      testGlobsMissing: true,
      coverageBudgetExhausted: true,
    });
    expect(result.partial).toBe(true);
    expect(result.violations[0]?.message).toMatch(/coverage file budget exhausted/);
    expect(result.violations[0]?.message).not.toMatch(/never-had-tests/);
  });

  it('budget-exhausted diagnostic carries the numbers and the knob that raises it', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {},
      testFiles: [],
      testGlobsMissing: true,
      coverageBudgetExhausted: true,
      coverageStats: {
        filesLoaded: 400,
        testFilesRetained: 12,
        maxFiles: 400,
        discarded: {
          budget: 307,
          noInvariantMention: 42,
          oversize: 0,
          unreadable: 0,
          depthLimited: 0,
          outOfRoot: 0,
        },
      },
    });
    const message = result.violations[0]?.message ?? '';
    expect(message).toMatch(/400 files loaded at the 400-file cap/);
    expect(message).toMatch(/12 tests retained/);
    expect(message).toMatch(/307 files discarded at the cap/);
    expect(message).toMatch(/coverage\.maxFiles/);
    // Nothing is discarded silently: the no-mention drops are counted too.
    expect(message).toMatch(/42 naming no catalogued invariant/);
    // The cap discards are stated once, by the sentence that owns the cap.
    // Repeating "307" in the tail would read as two separate discard counts.
    expect(message).not.toMatch(/307 past the 400-file budget/);
    expect(message.match(/307/g)).toHaveLength(1);
    // The tail that follows the budget sentence carries the OTHER reasons and
    // no totals — asserted whole, so a clause cannot quietly stop being written.
    expect(message).toBe(
      'Invariant INV-ORDER-001 coverage cannot be proven (coverage file budget exhausted: ' +
        '400 files loaded at the 400-file cap, 12 tests retained, 307 files discarded at ' +
        'the cap; raise "coverage.maxFiles" in ark.config.json (the cap bounds files ' +
        'RETAINED as evidence)); reporting partial, not covered.' +
        ' Scan discarded 42 naming no catalogued invariant.'
    );
  });

  it('states the budget clause and the load totals when nothing else already did', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: { 'tests/a.test.ts': "it('unrelated', () => {})" },
      testFiles: ['tests/a.test.ts'],
      // Budget hit, but the verdict is plain uncovered, not partial: no
      // budget-exhausted sentence runs, so the tail must carry the numbers.
      coverageBudgetExhausted: true,
      coverageStats: {
        filesLoaded: 400,
        testFilesRetained: 12,
        maxFiles: 400,
        discarded: {
          budget: 307,
          noInvariantMention: 0,
          oversize: 0,
          unreadable: 0,
          depthLimited: 0,
          outOfRoot: 0,
        },
      },
    });
    const message = result.violations[0]?.message ?? '';
    expect(message).toMatch(/307 past the 400-file budget/);
    expect(message).toMatch(/loaded 400 files, kept 12 tests/);
  });

  it('reports discards even when the verdict is plain uncovered (not partial)', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: { 'tests/a.test.ts': "it('unrelated', () => {})" },
      testFiles: ['tests/a.test.ts'],
      coverageStats: {
        filesLoaded: 1,
        testFilesRetained: 1,
        maxFiles: 400,
        discarded: {
          budget: 0,
          noInvariantMention: 3,
          oversize: 0,
          unreadable: 0,
          depthLimited: 0,
          outOfRoot: 0,
        },
      },
    });
    expect(result.violations[0]?.message).toMatch(/Scan discarded 3 naming no catalogued invariant/);
  });

  it('says nothing about discards when the scan discarded nothing', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {},
      testFiles: [],
      testGlobsMissing: true,
      coverageStats: {
        filesLoaded: 0,
        testFilesRetained: 0,
        maxFiles: 400,
        discarded: {
          budget: 0,
          noInvariantMention: 0,
          oversize: 0,
          unreadable: 0,
          depthLimited: 0,
          outOfRoot: 0,
        },
      },
    });
    expect(result.violations[0]?.message).not.toMatch(/Scan discarded/);
  });

  it('names every discard reason: oversize, unreadable, depth-limited, out-of-root', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {},
      testFiles: [],
      testGlobsMissing: true,
      coverageStats: {
        filesLoaded: 8,
        testFilesRetained: 0,
        maxFiles: 400,
        discarded: {
          budget: 0,
          noInvariantMention: 0,
          oversize: 2,
          unreadable: 1,
          depthLimited: 3,
          outOfRoot: 4,
        },
      },
    });
    const message = result.violations[0]?.message ?? '';
    expect(message).toMatch(/2 over the per-file byte cap/);
    // One counter covers both units, so the message says which units it mixes.
    expect(message).toMatch(/1 unreadable \(files or directories\)/);
    expect(message).toMatch(/3 directories past the walk depth limit/);
    expect(message).toMatch(/4 symlinked outside the project root/);
  });

  it('renders the whole uncovered sentence, with no tail when nothing was discarded', () => {
    // Exact text, not a fragment: every clause of a coverage verdict is a claim
    // about the user's repo, and a fragment match cannot notice a clause that
    // quietly stopped being written.
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: { 'tests/a.test.ts': "it('unrelated', () => {})" },
      testFiles: ['tests/a.test.ts'],
    });
    expect(result.violations[0]?.message).toBe(
      'Invariant INV-ORDER-001: no scanned test names it in a describe/it title and ' +
        'no declared symbol was found (tests-disappeared — a suite exists). ' +
        'ArkGate matches declared text; it never executes tests.'
    );
  });

  it('renders the whole discard tail, reason by reason', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: { 'tests/a.test.ts': "it('unrelated', () => {})" },
      testFiles: ['tests/a.test.ts'],
      coverageStats: {
        filesRead: 19,
        filesLoaded: 8,
        testFilesRetained: 3,
        maxFiles: 400,
        discarded: {
          budget: 5,
          noInvariantMention: 6,
          oversize: 2,
          unreadable: 1,
          depthLimited: 3,
          outOfRoot: 4,
        },
      },
    });
    expect(result.violations[0]?.message).toBe(
      'Invariant INV-ORDER-001: no scanned test names it in a describe/it title and ' +
        'no declared symbol was found (tests-disappeared — a suite exists). ' +
        'ArkGate matches declared text; it never executes tests.' +
        ' Scan discarded 5 past the 400-file budget, 6 naming no catalogued invariant, ' +
        '2 over the per-file byte cap, 1 unreadable (files or directories), ' +
        '3 directories past the walk depth limit, 4 symlinked outside the project root ' +
        '(loaded 8 files, kept 3 tests).'
    );
  });

  it('says how many files were read, and that the cap bounds what is kept', () => {
    // The cap bounds RETENTION. Naming coverage.maxFiles without that clause
    // read as a knob on how much the scan opens, which it is not.
    const stats = {
      filesRead: 812,
      filesLoaded: 400,
      testFilesRetained: 12,
      maxFiles: 400,
      discarded: {
        budget: 307,
        noInvariantMention: 0,
        oversize: 0,
        unreadable: 0,
        depthLimited: 0,
        outOfRoot: 0,
      },
    };
    const withReads = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {},
      testFiles: [],
      testGlobsMissing: true,
      coverageBudgetExhausted: true,
      coverageStats: stats,
    });
    expect(withReads.violations[0]?.message).toBe(
      'Invariant INV-ORDER-001 coverage cannot be proven (coverage file budget exhausted: ' +
        '400 files loaded at the 400-file cap, 12 tests retained, 307 files discarded at ' +
        'the cap; raise "coverage.maxFiles" in ark.config.json (the cap bounds files ' +
        'RETAINED as evidence; 812 were read)); reporting partial, not covered.'
    );

    // A scan that reported no read count says nothing about reads.
    const { filesRead: _dropped, ...withoutReads } = stats;
    const silent = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {},
      testFiles: [],
      testGlobsMissing: true,
      coverageBudgetExhausted: true,
      coverageStats: withoutReads,
    });
    expect(silent.violations[0]?.message).toBe(
      'Invariant INV-ORDER-001 coverage cannot be proven (coverage file budget exhausted: ' +
        '400 files loaded at the 400-file cap, 12 tests retained, 307 files discarded at ' +
        'the cap; raise "coverage.maxFiles" in ark.config.json (the cap bounds files ' +
        'RETAINED as evidence)); reporting partial, not covered.'
    );
  });

  it('says what it actually verified, not that no test exists', () => {
    // "not covered by a test title" reads as "there is no test", and its
    // inverse reads as "there is a test and it runs". A text match knows
    // neither. The message must name the check it performed.
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: { 'tests/a.test.ts': "it('unrelated', () => {})" },
      testFiles: ['tests/a.test.ts'],
    });
    const message = result.violations[0]?.message ?? '';
    expect(message).toMatch(/no scanned test names it in a describe\/it title/);
    expect(message).toMatch(/never executes tests/);
  });

  it('warns when the only covering test lives outside the declared coverage roots', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {
        'scratch/order.test.ts': "describe('INV-ORDER-001', () => {})",
      },
      testFiles: ['scratch/order.test.ts'],
      coverageRoots: ['tests', 'src'],
    });
    const outside = result.violations.find(
      (v) => v.ruleId === 'INVARIANT_COVERAGE_OUTSIDE_ROOTS'
    );
    expect(outside?.file).toBe('scratch/order.test.ts');
    expect(outside?.failsStrict).toBe(false);
    expect(outside?.severity).toBe('warning');
    expect(outside?.message).toMatch(/tests, src/);
    expect(outside?.message).toMatch(/never executes tests/);
    expect(result.coverage[0]?.outsideDeclaredRoots).toBe(true);
    expect(result.coverage[0]?.testEvidenceFile).toBe('scratch/order.test.ts');
  });

  it('prefers a covering test inside a declared root over one outside it', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {
        'scratch/order.test.ts': "describe('INV-ORDER-001', () => {})",
        'tests/order.test.ts': "describe('INV-ORDER-001', () => {})",
      },
      testFiles: ['scratch/order.test.ts', 'tests/order.test.ts'],
      coverageRoots: ['tests'],
    });
    expect(result.coverage[0]?.testEvidenceFile).toBe('tests/order.test.ts');
    expect(result.coverage[0]?.outsideDeclaredRoots).toBe(false);
    expect(
      result.violations.some((v) => v.ruleId === 'INVARIANT_COVERAGE_OUTSIDE_ROOTS')
    ).toBe(false);
  });

  it('makes no outside-roots claim when the project declared no roots', () => {
    // Silence is the honest answer without a declaration to compare against.
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: { 'scratch/order.test.ts': "describe('INV-ORDER-001', () => {})" },
      testFiles: ['scratch/order.test.ts'],
    });
    expect(result.violations).toHaveLength(0);
    expect(result.coverage[0]?.outsideDeclaredRoots).toBeUndefined();
    expect(result.coverage[0]?.covered).toBe(true);
  });

  it('canPromoteInvariant refuses evidence that sits outside the declared roots', () => {
    const gate = canPromoteInvariant({
      invariantId: 'INV-ORDER-001',
      layer: 'DomainModel',
      sourceFile: 'arkrules/DomainModel.json',
      mode: 'advisory',
      covered: true,
      evidence: ['test-title'],
      partial: false,
      description: 'Order total never negative',
      testEvidenceFile: 'scratch/order.test.ts',
      outsideDeclaredRoots: true,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/scratch\/order\.test\.ts/);
    expect(gate.reason).toMatch(/outside the declared coverage roots/);
  });

  it('canPromoteInvariant still refuses outside-roots evidence with no file named', () => {
    // The row carries the flag without the file (older evidence, hand-built
    // input): refuse anyway — the missing filename is not a reason to promote.
    const gate = canPromoteInvariant({
      invariantId: 'INV-ORDER-001',
      layer: 'DomainModel',
      sourceFile: 'arkrules/DomainModel.json',
      mode: 'advisory',
      covered: true,
      evidence: ['test-title'],
      partial: false,
      description: 'Order total never negative',
      outsideDeclaredRoots: true,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/covered only by a test, outside the declared coverage roots/);
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

  it('does not stick top-level partial when symbol evidence covers without tests', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {
        'src/domain/order.ts':
          'export class Order { ensureInvariants() { if (this.total < 0) throw new Error(); } }',
      },
      testFiles: [],
      testGlobsMissing: true,
    });
    expect(result.coverage[0]?.covered).toBe(true);
    expect(result.coverage[0]?.partial).toBe(false);
    expect(result.partial).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it('canPromoteInvariant missing-evidence message is about coverage not catalog', () => {
    const gate = canPromoteInvariant(undefined);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/No coverage evidence supplied/i);
    expect(gate.reason).not.toMatch(/not present in the Effective Contract catalog/i);
  });

  it('canPromoteInvariant refuses partial even when covered flag is true (DF04 honesty)', () => {
    const gate = canPromoteInvariant({
      invariantId: 'INV-ORDER-001',
      layer: 'DomainModel',
      sourceFile: 'arkrules/DomainModel.json',
      mode: 'advisory',
      covered: true,
      evidence: ['symbol'],
      partial: true,
      description: 'Order total never negative',
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/partial/i);
  });

  it('canPromoteInvariant refuses uncovered non-partial evidence', () => {
    const gate = canPromoteInvariant({
      invariantId: 'INV-ORDER-001',
      layer: 'DomainModel',
      sourceFile: 'arkrules/DomainModel.json',
      mode: 'advisory',
      covered: false,
      evidence: [],
      partial: false,
      description: 'Order total never negative',
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/INV-ORDER-001/);
    expect(gate.reason).toMatch(/uncovered/i);
  });
});
