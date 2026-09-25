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
   * Non-test file that declares `coverage.symbol`. Absent when the name only
   * appears in an import or a call. ArkGate never runs tests; this path is the
   * declaration text, not a passing suite.
   */
  symbolEvidenceFile?: string;
  /**
   * The only covering test found sits outside `coverage.coverageRoots` — the
   * places the project declares its runner executes. ArkGate never runs tests,
   * so a title match outside those roots is a test that exists, not a test that
   * runs. Absent (undefined) when no roots were declared: without a declaration
   * there is nothing to compare against, and silence is honest.
   */
  outsideDeclaredRoots?: boolean;
  /**
   * True when `coverage.coverageRoots` was non-empty for this evaluation.
   * `false` when the project declared nothing. Omitted on hand-built evidence
   * so existing promote fixtures stay valid; the evaluator always sets it.
   */
  coverageRootsDeclared?: boolean;
};

export type InvariantUncoveredKind = 'never-had-tests' | 'tests-disappeared';

export type InvariantCoverageRuleId =
  | 'INVARIANT_UNCOVERED'
  | 'INVARIANT_COVERAGE_OUTSIDE_ROOTS';

/** Adopted + catalogued invariants, but no declared tests path (P2 §10). */
export const INVARIANT_TESTS_PATH_RULE_ID = 'INVARIANT_TESTS_PATH_MISSING' as const;

export const INVARIANT_TESTS_PATH_MESSAGE =
  'This project is adopted and has domain invariants, but ark.config.json does not name a real tests path. Add coverage.testGlobs or coverage.coverageRoots pointing at the folder where those tests live, then re-run. Without that path, coverage is an empty checkbox.';

export type InvariantTestsPathFinding = {
  ruleId: typeof INVARIANT_TESTS_PATH_RULE_ID;
  message: string;
  file: string;
  line: number;
  severity: 'error';
  failsStrict: true;
  freezable: false;
};

/** Enforced invariant, but no declared runner roots (P2 §10 residual). */
export const INVARIANT_COVERAGE_ROOTS_RULE_ID = 'INVARIANT_COVERAGE_ROOTS_MISSING' as const;

export const INVARIANT_COVERAGE_ROOTS_MESSAGE =
  'A domain invariant is enforced, but ark.config.json does not name coverage.coverageRoots — the folders where this project\'s test runner actually goes. Add coverage.coverageRoots pointing at that folder, then re-run. Without it, coverage can certify a test no runner runs.';

export type InvariantCoverageRootsFinding = {
  ruleId: typeof INVARIANT_COVERAGE_ROOTS_RULE_ID;
  message: string;
  file: string;
  line: number;
  severity: 'error';
  failsStrict: true;
  freezable: false;
};

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
export function formatCoverageDiscards(
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `name` is declared here. Imports and calls do not count.
 * `export const name =` is the same binding shape sensors already treat as a
 * declaration (arrow or function). The last segment of `Aggregate.method` is
 * the name that must be declared.
 */
function declaresIdentifier(content: string, name: string): boolean {
  const n = escapeRegExp(name);
  const functionDecl = new RegExp(
    `(?:^|[\\s;{}])(?:export\\s+(?:default\\s+)?)?(?:declare\\s+)?(?:async\\s+)?function\\s*\\*?\\s*${n}\\s*[(<]`
  );
  const classDecl = new RegExp(
    `(?:^|[\\s;{}])(?:export\\s+(?:default\\s+)?)?(?:abstract\\s+)?class\\s+${n}\\b`
  );
  const constDecl = new RegExp(`(?:^|[\\s;{}])export\\s+(?:const|let|var)\\s+${n}\\s*=`);
  const methodDecl = new RegExp(
    `(?:^|[\\n;{}])\\s*(?:(?:public|private|protected|static|async|readonly|override|abstract|get|set|declare)\\s+)*${n}\\s*(?:<[^>\\n]*>)?\\s*\\([^;{}]*\\)\\s*(?::\\s*[^;{]+)?\\s*\\{`
  );
  return (
    functionDecl.test(content) ||
    classDecl.test(content) ||
    constDecl.test(content) ||
    methodDecl.test(content)
  );
}

/** Witness path, or undefined when no non-test file declares `symbol`. */
function symbolPresent(
  fileContents: Readonly<Record<string, string>>,
  testFiles: readonly string[],
  symbol: string
): string | undefined {
  if (!symbol) return undefined;
  const parts = symbol.split('.');
  const needle = parts[parts.length - 1] ?? '';
  if (!needle) return undefined;
  const className = parts.length > 1 ? parts[0]! : null;
  const tests = new Set(
    testFiles.map((file) => file.replace(/\\/g, '/').replace(/^\.\//, ''))
  );
  const files = Object.keys(fileContents).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const file of files) {
    const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
    if (tests.has(normalized)) continue;
    const content = fileContents[file];
    if (!content) continue;
    if (className && !content.includes(className)) continue;
    if (declaresIdentifier(content, needle)) return file;
  }
  return undefined;
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

    const symbolEvidenceFile = symbol
      ? symbolPresent(input.fileContents, testFiles, symbol)
      : undefined;
    if (symbolEvidenceFile) evidence.push('symbol');

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
      ...(symbolEvidenceFile !== undefined ? { symbolEvidenceFile } : {}),
      ...(outsideDeclaredRoots !== undefined ? { outsideDeclaredRoots } : {}),
      coverageRootsDeclared: rootsDeclared,
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
  // Explicit false only: hand-built evidence may omit the field. The evaluator
  // always sets it. Promoting without roots would make OUTSIDE_ROOTS silent.
  if (coverage.coverageRootsDeclared === false) {
    return {
      ok: false,
      reason: `Declare coverage.coverageRoots in ark.config.json before promoting ${coverage.invariantId} to enforced. Without that, ArkGate cannot tell whether a covering test is one the runner executes.`,
    };
  }
  return { ok: true, reason: `Invariant ${coverage.invariantId} has coverage evidence.` };
}

function nonEmptyPathStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return out;
}

/**
 * Declared tests homes: `coverage.testGlobs` and/or `coverage.coverageRoots`.
 * Either is a configured path. Empty strings do not count.
 */
export function configuredInvariantTestsPaths(
  coverage: { testGlobs?: unknown; coverageRoots?: unknown } | null | undefined
): string[] {
  if (!coverage || typeof coverage !== 'object') return [];
  return [...nonEmptyPathStrings(coverage.testGlobs), ...nonEmptyPathStrings(coverage.coverageRoots)];
}

export function hasConfiguredInvariantTestsPath(
  coverage: { testGlobs?: unknown; coverageRoots?: unknown } | null | undefined
): boolean {
  return configuredInvariantTestsPaths(coverage).length > 0;
}

/**
 * True when at least one catalogued invariant wants test evidence.
 * Same default as AR10: `coverage.test !== false`. `test: false` is an explicit
 * opt-out (starter Domain phrases use it) and does not demand a tests path.
 */
export function catalogDemandsInvariantTestsPath(
  invariants: readonly { coverage?: { test?: boolean } | null }[] | null | undefined
): boolean {
  if (!Array.isArray(invariants) || invariants.length === 0) return false;
  return invariants.some((inv) => inv != null && inv.coverage?.test !== false);
}

export type MissingInvariantTestsPathInput = {
  /** D0 adopted (required-merge / advisory-only-acked) or --require-gates / --strict-merge. */
  adopted?: boolean;
  /**
   * At least one invariant wants tests. Prefer `invariants` +
   * `catalogDemandsInvariantTestsPath` at the call site. `true` is an explicit override.
   */
  hasDomainInvariants?: boolean;
  /** Effective catalog entries; used when `hasDomainInvariants` is omitted. */
  invariants?: readonly { coverage?: { test?: boolean } | null }[] | null;
  coverage?: { testGlobs?: unknown; coverageRoots?: unknown } | null;
  /**
   * Tooling FS check. `false` means the declared path is empty on disk.
   * Omitted: a non-empty config declaration is enough (Domain has no I/O).
   */
  declaredPathPresent?: boolean;
};

/**
 * §10 — adopted + invariants that want tests require a real tests path.
 * Fail-closed. Not freezable. Silent when not adopted, the catalog is empty,
 * or every entry sets `coverage.test: false`.
 */
export function collectMissingInvariantTestsPathFindings(
  input: MissingInvariantTestsPathInput
): InvariantTestsPathFinding[] {
  const demanded =
    input.hasDomainInvariants === true ||
    (input.hasDomainInvariants !== false && catalogDemandsInvariantTestsPath(input.invariants));
  if (input.adopted !== true || !demanded) return [];
  const configured = hasConfiguredInvariantTestsPath(input.coverage);
  if (configured && input.declaredPathPresent !== false) return [];
  return [
    {
      ruleId: INVARIANT_TESTS_PATH_RULE_ID,
      message: INVARIANT_TESTS_PATH_MESSAGE,
      file: 'ark.config.json',
      line: 1,
      severity: 'error',
      failsStrict: true,
      freezable: false,
    },
  ];
}

/**
 * Declared runner homes: `coverage.coverageRoots` only.
 * Empty strings do not count. testGlobs is not a runner root.
 */
export function configuredCoverageRoots(
  coverage: { coverageRoots?: unknown } | null | undefined
): string[] {
  if (!coverage || typeof coverage !== 'object') return [];
  return nonEmptyPathStrings(coverage.coverageRoots);
}

export function hasConfiguredCoverageRoots(
  coverage: { coverageRoots?: unknown } | null | undefined
): boolean {
  return configuredCoverageRoots(coverage).length > 0;
}

/**
 * True when at least one catalogued invariant is `mode: "enforced"`.
 * Structure-sensor enforced is not this — only `invariants[]`.
 */
export function catalogHasEnforcedInvariant(
  invariants: readonly { mode?: string }[] | null | undefined
): boolean {
  if (!Array.isArray(invariants) || invariants.length === 0) return false;
  return invariants.some((inv) => inv != null && inv.mode === 'enforced');
}

export type MissingCoverageRootsInput = {
  /**
   * At least one invariant is enforced. Prefer `invariants` +
   * `catalogHasEnforcedInvariant` at the call site. `true` is an explicit override.
   */
  hasEnforcedInvariant?: boolean;
  /** Effective catalog entries; used when `hasEnforcedInvariant` is omitted. */
  invariants?: readonly { mode?: string }[] | null;
  coverage?: { coverageRoots?: unknown } | null;
  /**
   * Tooling FS check. `false` means the declared roots are empty on disk.
   * Omitted: a non-empty config declaration is enough (Domain has no I/O).
   */
  declaredPathPresent?: boolean;
};

/**
 * P2 §10 residual — any enforced invariant requires `coverage.coverageRoots`.
 * Fail-closed. Not freezable. Silent when no invariant is enforced.
 * testGlobs alone does not satisfy this: without roots, OUTSIDE_ROOTS cannot fire.
 */
export function collectMissingCoverageRootsFindings(
  input: MissingCoverageRootsInput
): InvariantCoverageRootsFinding[] {
  const enforced =
    input.hasEnforcedInvariant === true ||
    (input.hasEnforcedInvariant !== false && catalogHasEnforcedInvariant(input.invariants));
  if (!enforced) return [];
  const configured = hasConfiguredCoverageRoots(input.coverage);
  if (configured && input.declaredPathPresent !== false) return [];
  return [
    {
      ruleId: INVARIANT_COVERAGE_ROOTS_RULE_ID,
      message: INVARIANT_COVERAGE_ROOTS_MESSAGE,
      file: 'ark.config.json',
      line: 1,
      severity: 'error',
      failsStrict: true,
      freezable: false,
    },
  ];
}
