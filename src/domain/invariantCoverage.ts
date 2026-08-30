/**
 * Pure invariant coverage evidence (ADR 0014 / AR09–AR10).
 *
 * Mines test titles and symbol presence against the Effective ArkRules catalog.
 * No filesystem — Tooling supplies file contents and test globs.
 */

import type { EffectiveArkRules, EffectiveInvariantRule } from './arkRulesTypes';
// Type-only import erased for CLI generation.

export type InvariantCoverageEvidence = {
  invariantId: string;
  layer: string;
  sourceFile: string;
  mode: 'advisory' | 'enforced';
  covered: boolean;
  evidence: Array<'test-title' | 'symbol'>;
  /** When no test globs were supplied, coverage cannot be proven. */
  partial: boolean;
  description: string;
  /** Test file that supplied the `test-title` evidence, when there was one. */
  testEvidenceFile?: string;
  /**
   * The only covering test found sits outside `coverage.coverageRoots` — the
   * places the project declares its runner executes. ArkGate never runs tests,
   * so a title match outside those roots is a test that exists, not a test that
   * runs. Absent (undefined) when no roots were declared: without a declaration
   * there is nothing to compare against, and silence is honest.
   */
  outsideDeclaredRoots?: boolean;
};

export type InvariantUncoveredKind = 'never-had-tests' | 'tests-disappeared';

export type InvariantCoverageRuleId =
  | 'INVARIANT_UNCOVERED'
  | 'INVARIANT_COVERAGE_OUTSIDE_ROOTS';

export type InvariantCoverageViolation = {
  ruleId: InvariantCoverageRuleId;
  message: string;
  file: string;
  line: number;
  arkruleId: string;
  arkruleSource: string;
  fromLayer: string;
  severity: 'error' | 'warning';
  failsStrict: boolean;
  /**
   * Adopt residual (no test suite) vs regression (suite exists, coverage gone).
   * Only INVARIANT_UNCOVERED carries it: an outside-roots finding is about
   * WHERE the covering test lives, not about whether one exists.
   */
  kind?: InvariantUncoveredKind;
};

export type EvaluateInvariantCoverageInput = {
  arkRules: EffectiveArkRules;
  /** Project-relative path → file contents (tests + domain sources). */
  fileContents: Readonly<Record<string, string>>;
  /** Paths considered tests (already filtered by Tooling via globs). */
  testFiles?: readonly string[];
  /** When true, missing test files make coverage partial (never green covered). */
  testGlobsMissing?: boolean;
  /**
   * Tooling hit MAX_COVERAGE_FILES. Partial must not claim the repo never had tests —
   * the suite may exist outside the scan budget.
   */
  coverageBudgetExhausted?: boolean;
  /** Numbers behind the scan: what was loaded, what was discarded and why. */
  coverageStats?: InvariantCoverageStats;
  /**
   * Declared (`coverage.coverageRoots`) path prefixes where the project says its
   * runner actually executes tests. ArkGate never executes anything: this is a
   * second DECLARATION to compare the first against. Absent or empty means no
   * declaration was made, so no outside-roots claim is possible.
   */
  coverageRoots?: readonly string[];
};

/**
 * What the Tooling scan actually saw. Every discard has a counted reason —
 * a silent drop would make an uncovered verdict unexplainable.
 */
export type InvariantCoverageStats = {
  /**
   * Files actually opened and read. Always >= filesLoaded: a test is read
   * before it can be judged for naming an invariant, so the file budget bounds
   * RETENTION, not I/O. Reporting only the retained count made
   * `coverage.maxFiles` read as a knob on how much the scan opens.
   */
  filesRead?: number;
  /** Files retained as coverage evidence (tests + production). */
  filesLoaded: number;
  /** Test files retained (subset of filesLoaded). */
  testFilesRetained: number;
  /** The file budget in force for this scan (config `coverage.maxFiles` or the default). */
  maxFiles: number;
  discarded: {
    /** Reached the file budget. */
    budget: number;
    /** Test file naming no catalogued invariant (scanned, then dropped). */
    noInvariantMention: number;
    /** Larger than the per-file byte cap. */
    oversize: number;
    /**
     * stat/read failed on a file or a directory: permissions, a broken symlink,
     * or something that moved mid-scan. Files and directories share one counter.
     */
    unreadable: number;
    /** Directory deeper than the walk depth limit — its files were never seen. */
    depthLimited: number;
    /**
     * Symlink inside the tree whose target resolves outside the project root.
     * Refused as evidence: a file that is not in this repo must not prove an
     * invariant covered.
     */
    outOfRoot: number;
  };
};

/**
 * Human-readable discard tail. Empty when the scan discarded nothing.
 * `omitBudget` drops the budget clause and the load totals for messages whose
 * own text already carries them — the same number twice reads as two facts.
 */
function formatCoverageDiscards(
  stats: InvariantCoverageStats | undefined,
  omitBudget = false
): string {
  if (!stats) return '';
  const d = stats.discarded;
  const parts: string[] = [];
  if (d.budget > 0 && !omitBudget)
    parts.push(`${d.budget} past the ${stats.maxFiles}-file budget`);
  if (d.noInvariantMention > 0) parts.push(`${d.noInvariantMention} naming no catalogued invariant`);
  if (d.oversize > 0) parts.push(`${d.oversize} over the per-file byte cap`);
  if (d.unreadable > 0) parts.push(`${d.unreadable} unreadable (files or directories)`);
  if (d.depthLimited > 0) parts.push(`${d.depthLimited} directories past the walk depth limit`);
  if (d.outOfRoot > 0) parts.push(`${d.outOfRoot} symlinked outside the project root`);
  if (parts.length === 0) return '';
  const totals = omitBudget
    ? ''
    : ` (loaded ${stats.filesLoaded} files, kept ${stats.testFilesRetained} tests)`;
  return ` Scan discarded ${parts.join(', ')}${totals}.`;
}

/**
 * True when `file` sits inside one of the declared coverage roots.
 * A root is a path prefix, `.` (or `''`) meaning the whole project.
 */
function isUnderCoverageRoot(file: string, roots: readonly string[]): boolean {
  const target = file.replace(/\\/g, '/').replace(/^\.\//, '');
  return roots.some((rawRoot) => {
    const root = rawRoot.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    if (root === '' || root === '.') return true;
    return target === root || target.startsWith(`${root}/`);
  });
}

function titleMatchesInvariant(content: string, id: string): boolean {
  // Match describe/it/test string titles containing the invariant id.
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(?:describe|it|test|context)\\s*\\(\\s*['"\`][^'"\`]*${escaped}[^'"\`]*['"\`]`,
    'i'
  );
  return re.test(content) || content.includes(id);
}

function symbolPresent(fileContents: Readonly<Record<string, string>>, symbol: string): boolean {
  if (!symbol) return false;
  // Support Aggregate.method or bare method name.
  const parts = symbol.split('.');
  const needle = parts[parts.length - 1]!;
  const className = parts.length > 1 ? parts[0] : null;
  for (const content of Object.values(fileContents)) {
    if (className && !content.includes(className)) continue;
    if (
      new RegExp(
        `(?:function\\s+|\\b)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[(<]`
      ).test(content) ||
      content.includes(symbol)
    ) {
      return true;
    }
  }
  return false;
}

export function evaluateInvariantCoverage(
  input: EvaluateInvariantCoverageInput
): {
  coverage: InvariantCoverageEvidence[];
  violations: InvariantCoverageViolation[];
  partial: boolean;
} {
  const invariants = input.arkRules.invariants ?? [];
  if (invariants.length === 0) {
    return { coverage: [], violations: [], partial: false };
  }

  const testFiles = input.testFiles ?? [];
  const testGlobsMissing = input.testGlobsMissing === true || testFiles.length === 0;
  const coverageBudgetExhausted = input.coverageBudgetExhausted === true;
  const stats = input.coverageStats;
  const discardTail = formatCoverageDiscards(stats);
  // The budget-exhausted sentence already carries the cap, the load and the
  // discards at the cap, so its tail reports only the other discard reasons.
  const budgetExhaustedTail = formatCoverageDiscards(stats, true);
  // Numbers, not adjectives: a budget-exhausted verdict must say how big the
  // budget was, what it bought, and which knob raises it.
  const budgetDetail = stats
    ? `coverage file budget exhausted: ${stats.filesLoaded} files loaded at the ${stats.maxFiles}-file cap, ${stats.testFilesRetained} tests retained, ${stats.discarded.budget} files discarded at the cap; raise "coverage.maxFiles" in ark.config.json (the cap bounds files RETAINED as evidence${
        typeof stats.filesRead === 'number' ? `; ${stats.filesRead} were read` : ''
      })`
    : 'coverage file budget exhausted';
  const coverageRoots = (input.coverageRoots ?? []).filter(
    (root) => typeof root === 'string' && root.length > 0
  );
  const rootsDeclared = coverageRoots.length > 0;
  const declaredRootsList = coverageRoots.join(', ');
  const coverage: InvariantCoverageEvidence[] = [];
  const violations: InvariantCoverageViolation[] = [];

  for (const inv of invariants as EffectiveInvariantRule[]) {
    const evidence: Array<'test-title' | 'symbol'> = [];
    const wantsTest = inv.coverage?.test !== false; // default: prefer test evidence when catalogued
    const symbol = inv.coverage?.symbol;
    let testEvidenceFile: string | undefined;
    let outsideDeclaredRoots: boolean | undefined;

    if (!testGlobsMissing && wantsTest) {
      // A covering test INSIDE a declared root wins over one outside it: the
      // finding is "the only proof lives where the runner does not go", not
      // "some proof lives there".
      let fallbackOutside: string | undefined;
      for (const file of testFiles) {
        const content = input.fileContents[file];
        if (!content || !titleMatchesInvariant(content, inv.id)) continue;
        if (!rootsDeclared || isUnderCoverageRoot(file, coverageRoots)) {
          testEvidenceFile = file;
          outsideDeclaredRoots = rootsDeclared ? false : undefined;
          break;
        }
        fallbackOutside ??= file;
      }
      if (testEvidenceFile === undefined && fallbackOutside !== undefined) {
        testEvidenceFile = fallbackOutside;
        outsideDeclaredRoots = true;
      }
      if (testEvidenceFile !== undefined) evidence.push('test-title');
    }

    if (symbol && symbolPresent(input.fileContents, symbol)) {
      evidence.push('symbol');
    }

    // Covered if any requested evidence is present.
    // When coverage declares neither test nor symbol, require at least description-only advisory presence = not covered.
    const requiresEvidence = inv.coverage?.test === true || Boolean(symbol) || inv.coverage === undefined;
    const covered =
      requiresEvidence && evidence.length > 0
        ? true
        : inv.coverage?.test === false && !symbol
          ? true // explicitly no coverage requirements
          : evidence.length > 0;

    // Partial only when tests are missing *and* no other evidence (e.g. symbol) completed coverage.
    const partial = testGlobsMissing && wantsTest && evidence.length === 0;

    coverage.push({
      invariantId: inv.id,
      layer: inv.provenance.layer,
      sourceFile: inv.provenance.sourceFile,
      mode: inv.mode,
      covered: covered && !partial,
      evidence,
      partial,
      description: inv.description,
      ...(testEvidenceFile !== undefined ? { testEvidenceFile } : {}),
      ...(outsideDeclaredRoots !== undefined ? { outsideDeclaredRoots } : {}),
    });

    // The covering test exists but sits outside the roots the project declared
    // its runner walks. ArkGate does not execute tests, so it cannot tell the
    // difference — it can only report that the two declarations disagree.
    if (outsideDeclaredRoots === true && testEvidenceFile !== undefined) {
      violations.push({
        ruleId: 'INVARIANT_COVERAGE_OUTSIDE_ROOTS',
        message:
          `Invariant ${inv.id} is covered only by ${testEvidenceFile}, which is outside the declared coverage roots (${declaredRootsList}). ` +
          'ArkGate matches declared text and never executes tests, so it cannot tell whether that file is run: move the test under a declared root, or add its root to "coverage.coverageRoots" in ark.config.json.',
        file: testEvidenceFile,
        line: 1,
        arkruleId: inv.id,
        arkruleSource: inv.provenance.sourceFile,
        fromLayer: inv.provenance.layer,
        severity: 'warning',
        failsStrict: false,
      });
    }

        if (!covered || partial) {
            // Enforced + proven uncovered → failsStrict; partial always advisory (never fake green).
            const failsStrict = inv.mode === 'enforced' && !partial;
            const kind: InvariantUncoveredKind =
              testGlobsMissing || testFiles.length === 0 ? 'never-had-tests' : 'tests-disappeared';
            violations.push({
                ruleId: 'INVARIANT_UNCOVERED',
                message:
                  (partial
                    ? coverageBudgetExhausted
                      ? `Invariant ${inv.id} coverage cannot be proven (${budgetDetail}); reporting partial, not covered.`
                      : `Invariant ${inv.id} coverage cannot be proven (test globs missing or empty); reporting partial, not covered (never-had-tests).`
                    : // Say what was actually checked. "Not covered by a test
                      // title" reads as "there is no test", and its inverse
                      // reads as "there is a test and it runs" — neither is
                      // something a text match can know.
                      kind === 'tests-disappeared'
                      ? `Invariant ${inv.id}: no scanned test names it in a describe/it title and no declared symbol was found (tests-disappeared — a suite exists). ArkGate matches declared text; it never executes tests.`
                      : `Invariant ${inv.id}: no scanned test names it in a describe/it title and no declared symbol was found (never-had-tests — the scan found no tests at all). ArkGate matches declared text; it never executes tests.`) +
                  (partial && coverageBudgetExhausted ? budgetExhaustedTail : discardTail),
                file: inv.provenance.sourceFile,
                line: 1,
                arkruleId: inv.id,
                arkruleSource: inv.provenance.sourceFile,
                fromLayer: inv.provenance.layer,
                severity: failsStrict ? 'error' : 'warning',
                failsStrict,
                kind,
            });
        }
  }

  // Top-level partial only from entry flags (symbol-only coverage must not stick partial).
  return {
    coverage,
    violations,
    partial: coverage.some((entry) => entry.partial),
  };
}

/**
 * Deterministic promotion gate: refuse advisory→enforced when invariant is uncovered.
 */
export function canPromoteInvariant(
  coverage: InvariantCoverageEvidence | undefined
): { ok: boolean; reason: string } {
  if (!coverage) {
    return {
      ok: false,
      reason:
        'No coverage evidence supplied for this invariant; evaluate coverage before promoting to enforced.',
    };
  }
  if (coverage.partial) {
    return {
      ok: false,
      reason: 'Coverage is partial (missing test globs); cannot promote until evidence is complete.',
    };
  }
  if (!coverage.covered) {
    return {
      ok: false,
      reason: `Invariant ${coverage.invariantId} is uncovered; add a test title or symbol before promoting to enforced.`,
    };
  }
  // Promotion is the moment coverage stops being advice, so an evidence file
  // the project itself says its runner does not walk cannot carry it.
  if (coverage.outsideDeclaredRoots === true) {
    return {
      ok: false,
      reason: `Invariant ${coverage.invariantId} is covered only by ${
        coverage.testEvidenceFile ?? 'a test'
      }, outside the declared coverage roots; ArkGate cannot tell whether that test runs, so it will not promote on it.`,
    };
  }
  return { ok: true, reason: `Invariant ${coverage.invariantId} has coverage evidence.` };
}
