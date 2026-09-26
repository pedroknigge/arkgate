import { describe, expect, it } from 'vitest';
import {
  buildEffectiveArkRules,
  loadArkRulesContract,
} from '../../../src/domain/arkRulesContract';
import { ARK_CONFIG_SCHEMA } from '../../../src/domain/configContract';
import {
  canPromoteInvariant,
  catalogHasEnforcedInvariant,
  classifyCoverage,
  collectMissingCoverageRootsFindings,
  collectMissingInvariantTestsPathFindings,
  configuredCoverageRoots,
  configuredInvariantTestsPaths,
  countsAsCoverage,
  describeCoverage,
  evaluateInvariantCoverage,
  hasConfiguredCoverageRoots,
  hasConfiguredInvariantTestsPath,
  INVARIANT_COVERAGE_ROOTS_MESSAGE,
  INVARIANT_COVERAGE_ROOTS_RULE_ID,
  INVARIANT_TESTS_PATH_MESSAGE,
  INVARIANT_TESTS_PATH_RULE_ID,
  type CoverageEvidence,
  type CoverageInvariant,
  type DeclarationShape,
  type MentionContext,
} from '../../../src/domain/invariantCoverage';

function catalog() {
  return catalogForSymbol('INV-ORDER-001', 'Order total never negative', 'Order.ensureInvariants');
}

function catalogForSymbol(id: string, description: string, symbol: string) {
  const file = loadArkRulesContract({
    schemaVersion: '1.0',
    layer: 'DomainModel',
    invariants: [
      {
        id,
        description,
        aggregate: 'Order',
        coverage: { test: true, symbol },
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
    expect(result.coverage[0]?.symbolEvidenceFile).toBe('src/domain/order.ts');
    expect(result.violations).toHaveLength(0);
  });

  it('coverage.symbol is a non-test declaration, not an import or a test call (#291)', () => {
    const arkRules = catalogForSymbol(
      'api-via-define-route',
      'API routes go through defineRoute',
      'defineRoute'
    );
    const renamed = evaluateInvariantCoverage({
      arkRules,
      fileContents: {
        'src/kernel/app/define-route.ts': 'export function defineRouteRENAMED() {}\n',
        'src/app/api/health/route.ts':
          "import { defineRoute } from '../../kernel/app/define-route';\n",
        'src/test/health.test.ts': "it('route', () => { defineRoute( });\n",
      },
      testFiles: ['src/test/health.test.ts'],
    });
    expect(renamed.coverage[0]?.covered).toBe(false);
    expect(renamed.coverage[0]?.symbolEvidenceFile).toBeUndefined();
    expect(renamed.violations.some((v) => v.ruleId === 'INVARIANT_UNCOVERED')).toBe(true);

    const declared = evaluateInvariantCoverage({
      arkRules,
      fileContents: {
        'src/kernel/app/define-route.ts': 'export function defineRoute() {}\n',
        'src/app/api/health/route.ts':
          "import { defineRoute } from '../../kernel/app/define-route';\n",
        'src/test/health.test.ts': "it('route', () => { defineRoute( });\n",
      },
      testFiles: ['src/test/health.test.ts'],
    });
    expect(declared.coverage[0]?.covered).toBe(true);
    expect(declared.coverage[0]?.evidence).toContain('symbol');
    expect(declared.coverage[0]?.symbolEvidenceFile).toBe('src/kernel/app/define-route.ts');
    expect(declared.violations).toHaveLength(0);

    const called = evaluateInvariantCoverage({
      arkRules,
      fileContents: {
        'src/app/api/health/route.ts': 'export function GET() { return defineRoute(); }\n',
      },
      testFiles: ['src/test/health.test.ts'],
    });
    expect(called.coverage[0]?.covered).toBe(false);
    expect(called.coverage[0]?.symbolEvidenceFile).toBeUndefined();

    const onlyInTest = evaluateInvariantCoverage({
      arkRules,
      fileContents: {
        'src/test/health.test.ts': 'export function defineRoute() {}\n',
      },
      testFiles: ['src/test/health.test.ts'],
    });
    expect(onlyInTest.coverage[0]?.covered).toBe(false);

    const arrow = evaluateInvariantCoverage({
      arkRules,
      fileContents: {
        'src/kernel/app/define-route.ts': 'export const defineRoute = () => {};\n',
      },
      testFiles: ['src/test/health.test.ts'],
    });
    expect(arrow.coverage[0]?.covered).toBe(true);
    expect(arrow.coverage[0]?.symbolEvidenceFile).toBe('src/kernel/app/define-route.ts');
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

  it('names each discard reason alone so a silenced clause cannot hide among others', () => {
    const zero = {
      budget: 0,
      noInvariantMention: 0,
      oversize: 0,
      unreadable: 0,
      depthLimited: 0,
      outOfRoot: 0,
    };
    const rows: Array<{ discarded: typeof zero; match: RegExp; absent: RegExp[] }> = [
      {
        discarded: { ...zero, budget: 7 },
        match: /7 past the 400-file budget/,
        absent: [/naming no catalogued invariant/, /byte cap/, /unreadable/, /walk depth/, /symlinked/],
      },
      {
        discarded: { ...zero, noInvariantMention: 9 },
        match: /9 naming no catalogued invariant/,
        absent: [/past the 400-file budget/, /byte cap/, /unreadable/, /walk depth/, /symlinked/],
      },
      {
        discarded: { ...zero, oversize: 2 },
        match: /2 over the per-file byte cap/,
        absent: [/past the 400-file budget/, /naming no catalogued invariant/, /unreadable/, /walk depth/, /symlinked/],
      },
      {
        discarded: { ...zero, unreadable: 1 },
        match: /1 unreadable \(files or directories\)/,
        absent: [/past the 400-file budget/, /naming no catalogued invariant/, /byte cap/, /walk depth/, /symlinked/],
      },
      {
        discarded: { ...zero, depthLimited: 3 },
        match: /3 directories past the walk depth limit/,
        absent: [/past the 400-file budget/, /naming no catalogued invariant/, /byte cap/, /unreadable/, /symlinked/],
      },
      {
        discarded: { ...zero, outOfRoot: 4 },
        match: /4 symlinked outside the project root/,
        absent: [/past the 400-file budget/, /naming no catalogued invariant/, /byte cap/, /unreadable/, /walk depth/],
      },
    ];
    for (const row of rows) {
      const result = evaluateInvariantCoverage({
        arkRules: catalog(),
        fileContents: { 'tests/a.test.ts': "it('unrelated', () => {})" },
        testFiles: ['tests/a.test.ts'],
        coverageStats: {
          filesLoaded: 1,
          testFilesRetained: 1,
          maxFiles: 400,
          discarded: row.discarded,
        },
      });
      const message = result.violations[0]?.message ?? '';
      expect(message).toMatch(row.match);
      for (const absent of row.absent) {
        expect(message).not.toMatch(absent);
      }
    }
  });

  it('treats filesRead 0 as a reported read count, not silence', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {},
      testFiles: [],
      testGlobsMissing: true,
      coverageBudgetExhausted: true,
      coverageStats: {
        filesRead: 0,
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
    expect(result.violations[0]?.message).toMatch(/; 0 were read/);
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
    expect(result.coverage[0]?.coverageRootsDeclared).toBe(true);
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
    expect(result.coverage[0]?.coverageRootsDeclared).toBe(true);
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
    expect(result.coverage[0]?.coverageRootsDeclared).toBe(false);
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
      coverageRoots: ['tests'],
    });
    expect(canPromoteInvariant(covered.coverage[0]).ok).toBe(true);
    expect(canPromoteInvariant(covered.coverage[0]).reason).toMatch(/INV-ORDER-001/);

    const noRoots = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {
        'src/domain/order.ts': 'class Order { ensureInvariants() {} }',
        'tests/order.test.ts': "describe('INV-ORDER-001', () => {})",
      },
      testFiles: ['tests/order.test.ts'],
    });
    const refused = canPromoteInvariant(noRoots.coverage[0]);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toMatch(/coverage\.coverageRoots/);
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

  it('coverage.maxFiles schema names the structural-hint preload coupling (HINTDOC-001)', () => {
    const coverage = ARK_CONFIG_SCHEMA.$defs.coverage as {
      description?: string;
      properties?: { maxFiles?: { description?: string } };
    };
    const text = `${coverage.description ?? ''} ${coverage.properties?.maxFiles?.description ?? ''}`;
    expect(text).toMatch(/structural-hint preload/);
    expect(text).toMatch(/maxFiles/);
    expect(text).toMatch(/orchestration-only/);
    expect(text).toMatch(/thin-adapter/);
    expect(text).toMatch(/writes-via-aggregate/);
    expect(coverage.properties).not.toHaveProperty('hintBudget');
    expect(
      (ARK_CONFIG_SCHEMA.properties as { arkRules?: unknown }).arkRules
    ).not.toHaveProperty('hintBudget');
  });
});

describe('classifyCoverage evidence (#307, #310)', () => {
  const id = 'INV-ORDER-001';
  const invariant: CoverageInvariant = {
    id,
    coverage: { test: true, symbol: 'Order.ensureInvariants' },
  };

  function files(content: string, path = 'tests/order.test.ts') {
    return { fileContents: { [path]: content }, testFiles: [path] };
  }

  it('names a describe/it title and counts it', () => {
    const ev = classifyCoverage(invariant, files("it('INV-ORDER-001 keeps total non-negative', () => {})"));
    expect(ev).toEqual({
      kind: 'test-title',
      file: 'tests/order.test.ts',
      title: 'INV-ORDER-001 keeps total non-negative',
    });
    expect(countsAsCoverage(ev)).toBe(true);
    expect(describeCoverage(invariant, ev)).toBe(
      'found `INV-ORDER-001 keeps total non-negative` in a describe/it title in tests/order.test.ts'
    );
  });

  it('accepts each declaration shape, including type, interface, and enum', () => {
    const rows: Array<{ shape: DeclarationShape; symbol: string; source: string; label: string }> = [
      {
        shape: 'function',
        symbol: 'defineRoute',
        label: 'defineRoute',
        source: 'export function defineRoute() {}\n',
      },
      {
        shape: 'class',
        symbol: 'Order',
        label: 'Order',
        source: 'export class Order {}\n',
      },
      {
        shape: 'const',
        symbol: 'defineRoute',
        label: 'defineRoute',
        source: 'export const defineRoute = () => {};\n',
      },
      {
        shape: 'method',
        symbol: 'Order.ensureInvariants',
        label: 'ensureInvariants',
        source: 'export class Order { ensureInvariants() { if (this.total < 0) throw new Error(); } }\n',
      },
      {
        shape: 'type',
        symbol: 'DomainEventPayload',
        label: 'DomainEventPayload',
        source: 'export type DomainEventPayload = Record<string, unknown>\n',
      },
      {
        shape: 'interface',
        symbol: 'ProjectStatus',
        label: 'ProjectStatus',
        source: 'export interface ProjectStatus { id: string }\n',
      },
      {
        shape: 'enum',
        symbol: 'ProjectStatus',
        label: 'ProjectStatus',
        source: 'export enum ProjectStatus { Open, Closed }\n',
      },
    ];
    for (const row of rows) {
      const inv: CoverageInvariant = { id, coverage: { test: true, symbol: row.symbol } };
      const source = 'src/domain/project.ts';
      const ev = classifyCoverage(inv, {
        fileContents: { [source]: row.source },
        testFiles: ['tests/order.test.ts'],
      });
      expect(ev, row.shape).toEqual({ kind: 'declaration', file: source, shape: row.shape });
      expect(countsAsCoverage(ev), row.shape).toBe(true);
      expect(describeCoverage(inv, ev)).toBe(`found \`${row.shape} ${row.label}\` in ${source}`);

      const result = evaluateInvariantCoverage({
        arkRules: catalogForSymbol(id, 'declared symbol', row.symbol),
        fileContents: { [source]: row.source },
        testFiles: ['tests/order.test.ts'],
      });
      expect(result.coverage[0]?.covered, row.shape).toBe(true);
      expect(result.coverage[0]?.evidence, row.shape).toContain('symbol');
      expect(result.coverage[0]?.shape, row.shape).toBe(row.shape);
      expect(result.coverage[0]?.symbolEvidenceFile, row.shape).toBe(source);
      expect(result.violations, row.shape).toHaveLength(0);
    }
  });

  it('accepts a non-exported type, interface, and enum', () => {
    const rows: Array<{ shape: DeclarationShape; source: string }> = [
      { shape: 'type', source: 'type DomainEventPayload = { id: string }\n' },
      { shape: 'interface', source: 'interface ProjectStatus { id: string }\n' },
      { shape: 'enum', source: 'enum ProjectStatus { Open }\n' },
    ];
    for (const row of rows) {
      const symbol = row.shape === 'type' ? 'DomainEventPayload' : 'ProjectStatus';
      const ev = classifyCoverage(
        { id, coverage: { symbol } },
        {
          fileContents: { 'src/domain/project.ts': row.source },
          testFiles: [],
        }
      );
      expect(ev, row.shape).toEqual({
        kind: 'declaration',
        file: 'src/domain/project.ts',
        shape: row.shape,
      });
    }
  });

  it('does not treat a commented-out type as a declaration', () => {
    const ev = classifyCoverage(
      { id, coverage: { symbol: 'DomainEventPayload' } },
      {
        fileContents: {
          'src/domain/project.ts': '// export type DomainEventPayload = { id: string }\n',
        },
        testFiles: [],
      }
    );
    expect(ev.kind).toBe('mention-only');
    if (ev.kind === 'mention-only') expect(ev.context).toBe('comment');
    expect(countsAsCoverage(ev)).toBe(false);
  });

  it('keeps test-title and symbol together, and records shape, when both count', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {
        'src/domain/order.ts':
          'export class Order { ensureInvariants() { if (this.total < 0) throw new Error(); } }',
        'tests/order.test.ts': "it('INV-ORDER-001 keeps total non-negative', () => {})",
      },
      testFiles: ['tests/order.test.ts'],
    });
    expect(result.coverage[0]?.evidence).toEqual(['test-title', 'symbol']);
    expect(result.coverage[0]?.shape).toBe('method');
    const ev = classifyCoverage(invariant, {
      fileContents: {
        'src/domain/order.ts':
          'export class Order { ensureInvariants() { if (this.total < 0) throw new Error(); } }',
        'tests/order.test.ts': "it('INV-ORDER-001 keeps total non-negative', () => {})",
      },
      testFiles: ['tests/order.test.ts'],
    });
    expect(ev.kind).toBe('test-title');
  });

  it('reports each mention context and never counts it', () => {
    const rows: Array<{ context: MentionContext; content: string; message: string }> = [
      {
        context: 'comment',
        content: "// INV-ORDER-001\nit('unrelated', () => expect(1).toBe(1))\n",
        message:
          'INV-ORDER-001 appears only in a comment in tests/order.test.ts; put it in a describe/it title',
      },
      {
        context: 'string',
        content: "it('unrelated', () => { const name = 'INV-ORDER-001'; })\n",
        message:
          'INV-ORDER-001 appears only in a string in tests/order.test.ts; put it in a describe/it title',
      },
      {
        context: 'test-body',
        content: "it('unrelated', () => { lock(INV-ORDER-001); })\n",
        message:
          'INV-ORDER-001 appears only in a test body in tests/order.test.ts; put it in a describe/it title',
      },
    ];
    for (const row of rows) {
      const ev = classifyCoverage({ id, coverage: { test: true } }, files(row.content));
      expect(ev, row.context).toEqual({
        kind: 'mention-only',
        file: 'tests/order.test.ts',
        context: row.context,
      });
      expect(countsAsCoverage(ev), row.context).toBe(false);
      expect(describeCoverage({ id }, ev)).toBe(row.message);
      const result = evaluateInvariantCoverage({
        arkRules: catalogForSymbol(id, 'phrase', 'Missing.symbol'),
        fileContents: { 'tests/order.test.ts': row.content },
        testFiles: ['tests/order.test.ts'],
      });
      expect(result.coverage[0]?.covered, row.context).toBe(false);
      expect(result.coverage[0]?.evidence, row.context).toEqual([]);
      expect(result.violations[0]?.message, row.context).toContain(row.message);
    }
  });

  it('leaves a comment-only mention uncovered and says where the id sat', () => {
    const result = evaluateInvariantCoverage({
      arkRules: catalog(),
      fileContents: {
        'tests/order.test.ts': "// INV-ORDER-001\nit('does something unrelated', () => {})\n",
      },
      testFiles: ['tests/order.test.ts'],
    });
    expect(result.coverage[0]?.covered).toBe(false);
    expect(result.coverage[0]?.evidence).toEqual([]);
    expect(result.coverage[0]?.shape).toBeUndefined();
    expect(result.violations[0]?.ruleId).toBe('INVARIANT_UNCOVERED');
    expect(result.violations[0]?.message).toBe(
      'Invariant INV-ORDER-001: INV-ORDER-001 appears only in a comment in tests/order.test.ts; ' +
        'put it in a describe/it title (tests-disappeared — a suite exists). ' +
        'ArkGate matches declared text; it never executes tests.'
    );
  });

  it('does not count a commented-out it() title', () => {
    const ev = classifyCoverage(
      { id, coverage: { test: true } },
      files("// it('INV-ORDER-001', () => {})\nit('unrelated', () => {})\n")
    );
    expect(ev).toEqual({
      kind: 'mention-only',
      file: 'tests/order.test.ts',
      context: 'comment',
    });
    expect(countsAsCoverage(ev)).toBe(false);
  });

  it('prefers a real title over a comment in the same file', () => {
    const ev = classifyCoverage(
      { id, coverage: { test: true } },
      files("// INV-ORDER-001\nit('INV-ORDER-001 holds', () => {})\n")
    );
    expect(ev.kind).toBe('test-title');
    expect(countsAsCoverage(ev)).toBe(true);
  });

  it('prefers a declaration over a test-file comment', () => {
    const ev = classifyCoverage(invariant, {
      fileContents: {
        'src/domain/order.ts': 'export class Order { ensureInvariants() {} }\n',
        'tests/order.test.ts': '// INV-ORDER-001\n',
      },
      testFiles: ['tests/order.test.ts'],
    });
    expect(ev).toEqual({
      kind: 'declaration',
      file: 'src/domain/order.ts',
      shape: 'method',
    });
    expect(countsAsCoverage(ev)).toBe(true);
  });

  it('says an imported symbol is only an import', () => {
    const inv: CoverageInvariant = { id: 'api-via-define-route', coverage: { symbol: 'defineRoute' } };
    const ev = classifyCoverage(inv, {
      fileContents: {
        'src/app/api/health/route.ts': "import { defineRoute } from '../../kernel/app/define-route';\n",
      },
      testFiles: ['src/test/health.test.ts'],
    });
    expect(ev).toEqual({
      kind: 'mention-only',
      file: 'src/app/api/health/route.ts',
      context: 'import',
    });
    expect(countsAsCoverage(ev)).toBe(false);
    expect(describeCoverage(inv, ev)).toBe(
      'api-via-define-route appears only in an import in src/app/api/health/route.ts; put it in a describe/it title'
    );
  });

  it('describes silence without claiming a mention', () => {
    const ev: CoverageEvidence = classifyCoverage(
      { id, coverage: { test: true, symbol: 'Missing.symbol' } },
      files("it('unrelated', () => {})\n")
    );
    expect(ev).toEqual({ kind: 'none' });
    expect(countsAsCoverage(ev)).toBe(false);
    expect(describeCoverage({ id }, ev)).toBe(
      'no scanned test names it in a describe/it title and no declared symbol was found'
    );
  });

  it('countsAsCoverage is false for every mention context and for none', () => {
    const mentions: MentionContext[] = ['test-body', 'comment', 'string', 'import'];
    for (const context of mentions) {
      expect(countsAsCoverage({ kind: 'mention-only', file: 'x.test.ts', context })).toBe(false);
    }
    expect(countsAsCoverage({ kind: 'none' })).toBe(false);
    expect(
      countsAsCoverage({ kind: 'test-title', file: 'x.test.ts', title: id })
    ).toBe(true);
    expect(
      countsAsCoverage({ kind: 'declaration', file: 'src/a.ts', shape: 'type' })
    ).toBe(true);
  });
});

describe('§10 adopted invariant tests path', () => {
  it('treats missing and empty coverage as no path', () => {
    expect(hasConfiguredInvariantTestsPath(undefined)).toBe(false);
    expect(hasConfiguredInvariantTestsPath({})).toBe(false);
    expect(hasConfiguredInvariantTestsPath({ testGlobs: [], coverageRoots: [] })).toBe(false);
    expect(hasConfiguredInvariantTestsPath({ testGlobs: ['  '], coverageRoots: [''] })).toBe(false);
    expect(configuredInvariantTestsPaths({ testGlobs: ['tests/**'] })).toEqual(['tests/**']);
    expect(configuredInvariantTestsPaths({ coverageRoots: ['tests'] })).toEqual(['tests']);
  });

  it('fails closed when adopted + invariants + missing/empty path', () => {
    const missing = collectMissingInvariantTestsPathFindings({
      adopted: true,
      hasDomainInvariants: true,
    });
    expect(missing).toHaveLength(1);
    expect(missing[0]?.ruleId).toBe(INVARIANT_TESTS_PATH_RULE_ID);
    expect(missing[0]?.failsStrict).toBe(true);
    expect(missing[0]?.freezable).toBe(false);
    expect(missing[0]?.message).toBe(INVARIANT_TESTS_PATH_MESSAGE);

    const empty = collectMissingInvariantTestsPathFindings({
      adopted: true,
      hasDomainInvariants: true,
      coverage: { testGlobs: [''] },
      declaredPathPresent: false,
    });
    expect(empty[0]?.ruleId).toBe(INVARIANT_TESTS_PATH_RULE_ID);
  });

  it('stays silent when not adopted, catalog is empty, or a real path is configured', () => {
    expect(
      collectMissingInvariantTestsPathFindings({
        hasDomainInvariants: true,
        coverage: {},
      })
    ).toEqual([]);
    expect(
      collectMissingInvariantTestsPathFindings({
        adopted: true,
        hasDomainInvariants: false,
      })
    ).toEqual([]);
    expect(
      collectMissingInvariantTestsPathFindings({
        adopted: true,
        hasDomainInvariants: true,
        coverage: { testGlobs: ['tests/**'] },
      })
    ).toEqual([]);
    expect(
      collectMissingInvariantTestsPathFindings({
        adopted: true,
        hasDomainInvariants: true,
        coverage: { coverageRoots: ['tests'] },
      })
    ).toEqual([]);
    expect(
      collectMissingInvariantTestsPathFindings({
        adopted: true,
        invariants: [{ coverage: { test: false } }, { coverage: { test: false } }],
      })
    ).toEqual([]);
  });

  it('fails closed when the declared path is empty on disk', () => {
    const hit = collectMissingInvariantTestsPathFindings({
      adopted: true,
      hasDomainInvariants: true,
      coverage: { testGlobs: ['ghost/**'] },
      declaredPathPresent: false,
    });
    expect(hit[0]?.ruleId).toBe(INVARIANT_TESTS_PATH_RULE_ID);
  });
});

describe('§10 enforced invariant requires coverageRoots', () => {
  it('treats missing and empty coverageRoots as no runner root', () => {
    expect(hasConfiguredCoverageRoots(undefined)).toBe(false);
    expect(hasConfiguredCoverageRoots({})).toBe(false);
    expect(hasConfiguredCoverageRoots({ coverageRoots: [] })).toBe(false);
    expect(hasConfiguredCoverageRoots({ coverageRoots: ['  '] })).toBe(false);
    expect(configuredCoverageRoots({ coverageRoots: ['tests'] })).toEqual(['tests']);
    expect(catalogHasEnforcedInvariant([{ mode: 'advisory' }])).toBe(false);
    expect(catalogHasEnforcedInvariant([{ mode: 'enforced' }])).toBe(true);
  });

  it('fails closed when any invariant is enforced and coverageRoots is missing/empty', () => {
    const missing = collectMissingCoverageRootsFindings({
      hasEnforcedInvariant: true,
    });
    expect(missing).toHaveLength(1);
    expect(missing[0]?.ruleId).toBe(INVARIANT_COVERAGE_ROOTS_RULE_ID);
    expect(missing[0]?.failsStrict).toBe(true);
    expect(missing[0]?.freezable).toBe(false);
    expect(missing[0]?.message).toBe(INVARIANT_COVERAGE_ROOTS_MESSAGE);

    const empty = collectMissingCoverageRootsFindings({
      hasEnforcedInvariant: true,
      coverage: { coverageRoots: [''] },
      declaredPathPresent: false,
    });
    expect(empty[0]?.ruleId).toBe(INVARIANT_COVERAGE_ROOTS_RULE_ID);

    const testGlobsOnly = collectMissingCoverageRootsFindings({
      invariants: [{ mode: 'enforced' }],
      coverage: { testGlobs: ['tests/**'] } as { coverageRoots?: unknown },
    });
    expect(testGlobsOnly[0]?.ruleId).toBe(INVARIANT_COVERAGE_ROOTS_RULE_ID);
  });

  it('stays silent when no invariant is enforced, or roots are declared', () => {
    expect(
      collectMissingCoverageRootsFindings({
        hasEnforcedInvariant: false,
        coverage: {},
      })
    ).toEqual([]);
    expect(
      collectMissingCoverageRootsFindings({
        invariants: [{ mode: 'advisory' }],
        coverage: {},
      })
    ).toEqual([]);
    expect(
      collectMissingCoverageRootsFindings({
        invariants: [],
        coverage: {},
      })
    ).toEqual([]);
    expect(
      collectMissingCoverageRootsFindings({
        hasEnforcedInvariant: true,
        coverage: { coverageRoots: ['tests'] },
      })
    ).toEqual([]);
  });

  it('fails closed when the declared roots are empty on disk', () => {
    const hit = collectMissingCoverageRootsFindings({
      hasEnforcedInvariant: true,
      coverage: { coverageRoots: ['ghost'] },
      declaredPathPresent: false,
    });
    expect(hit[0]?.ruleId).toBe(INVARIANT_COVERAGE_ROOTS_RULE_ID);
  });
});
