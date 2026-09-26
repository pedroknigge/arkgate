/**
 * Pure invariant coverage evidence (ADR 0014 / AR09–AR10).
 *
 * Mines test titles and symbol declarations against the Effective ArkRules catalog.
 * `classifyCoverage` returns one verdict; `countsAsCoverage` is the policy;
 * `describeCoverage` is the sentence. A bare mention is never coverage.
 * No filesystem — Tooling supplies file contents and test globs.
 */

import type { EffectiveArkRules, EffectiveInvariantRule } from './arkRulesTypes';
// Type-only import erased for CLI generation.

/**
 * How a `coverage.symbol` identifier is declared. `type`, `interface`, and
 * `enum` are declarations — the same witness as function, class, const, and
 * method.
 */
export type DeclarationShape =
  | 'function'
  | 'class'
  | 'const'
  | 'method'
  | 'type'
  | 'interface'
  | 'enum';

/** Where a bare mention of an id or symbol sat. Never coverage. */
export type MentionContext = 'test-body' | 'comment' | 'string' | 'import';

/**
 * One coverage verdict. Best evidence wins: test-title, then declaration,
 * then mention-only, then none. Regexes, the test-file vs source split, and
 * `Aggregate.method` lookup stay behind this value.
 */
export type CoverageEvidence =
  | { kind: 'test-title'; file: string; title: string }
  | { kind: 'declaration'; file: string; shape: DeclarationShape }
  | { kind: 'mention-only'; file: string; context: MentionContext }
  | { kind: 'none' };

/** Invariant fields the classifier reads. A full catalog entry is assignable. */
export type CoverageInvariant = {
  id: string;
  coverage?: { test?: boolean; symbol?: string } | null;
};

/** File set the classifier reads. Tooling has already loaded the contents. */
export type CoverageFiles = {
  /** Project-relative path → file contents (tests and sources). */
  fileContents: Readonly<Record<string, string>>;
  /** Paths already classified as tests. */
  testFiles?: readonly string[];
  /**
   * Declared runner roots. A test title inside a root beats one outside it.
   * The outside-roots finding stays a separate verdict.
   */
  coverageRoots?: readonly string[];
};

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
   * Declaration shape when `evidence` includes `symbol`. Additive: readers that
   * only know `test-title` | `symbol` ignore it.
   */
  shape?: DeclarationShape;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Blank comments, and optionally strings, with spaces so a regex cannot treat
 * a comment or a quoted mention as code. Newlines stay so line structure holds.
 * `//` and `/*` inside a string are not comments.
 */
function maskNonCode(content: string, blankStrings: boolean): string {
  const out: string[] = [];
  let i = 0;
  const n = content.length;
  while (i < n) {
    const c = content[i]!;
    const next = content[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && content[i] !== '\n') {
        out.push(' ');
        i += 1;
      }
      continue;
    }
    if (c === '/' && next === '*') {
      out.push(' ', ' ');
      i += 2;
      while (i < n && !(content[i] === '*' && content[i + 1] === '/')) {
        out.push(content[i] === '\n' ? '\n' : ' ');
        i += 1;
      }
      if (i < n) {
        out.push(' ', ' ');
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out.push(blankStrings ? ' ' : c);
      i += 1;
      while (i < n) {
        const ch = content[i]!;
        if (ch === '\\') {
          const escaped = content[i + 1];
          if (blankStrings) {
            out.push(' ', escaped === undefined ? '' : ' ');
          } else {
            out.push('\\');
            if (escaped !== undefined) out.push(escaped);
          }
          i += escaped === undefined ? 1 : 2;
          continue;
        }
        if (ch === quote) {
          out.push(blankStrings ? ' ' : ch);
          i += 1;
          break;
        }
        out.push(blankStrings && ch !== '\n' ? ' ' : ch);
        i += 1;
      }
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out.join('');
}

/** Title string when `id` sits inside a describe/it/test/context title. Comments do not count. */
function matchTestTitle(content: string, id: string): string | undefined {
  if (!id) return undefined;
  const escaped = escapeRegExp(id);
  const re = new RegExp(
    `(?:describe|it|test|context)\\s*\\(\\s*(['"\`])([^'"\`]*${escaped}[^'"\`]*)\\1`,
    'i'
  );
  const match = re.exec(maskNonCode(content, false));
  const title = match?.[2];
  return title === undefined ? undefined : title;
}

/**
 * Declaration shape of `name`, or undefined. Imports and calls do not count.
 * `export const name =` is the binding shape sensors already treat as a
 * declaration (arrow or function). Comments and strings are masked first so
 * `// type Name` is not a declaration.
 */
function declarationShape(content: string, name: string): DeclarationShape | undefined {
  if (!name) return undefined;
  const n = escapeRegExp(name);
  const code = maskNonCode(content, true);
  const shapes: ReadonlyArray<{ shape: DeclarationShape; source: string }> = [
    {
      shape: 'function',
      source: `(?:^|[\\s;{}])(?:export\\s+(?:default\\s+)?)?(?:declare\\s+)?(?:async\\s+)?function\\s*\\*?\\s*${n}\\s*[(<]`,
    },
    {
      shape: 'class',
      source: `(?:^|[\\s;{}])(?:export\\s+(?:default\\s+)?)?(?:abstract\\s+)?class\\s+${n}\\b`,
    },
    {
      shape: 'const',
      source: `(?:^|[\\s;{}])export\\s+(?:const|let|var)\\s+${n}\\s*=`,
    },
    {
      shape: 'type',
      source: `(?:^|[\\s;{}])(?:export\\s+)?(?:declare\\s+)?type\\s+${n}\\b`,
    },
    {
      shape: 'interface',
      source: `(?:^|[\\s;{}])(?:export\\s+)?(?:declare\\s+)?interface\\s+${n}\\b`,
    },
    {
      shape: 'enum',
      source: `(?:^|[\\s;{}])(?:export\\s+)?(?:declare\\s+)?(?:const\\s+)?enum\\s+${n}\\b`,
    },
    {
      shape: 'method',
      source: `(?:^|[\\n;{}])\\s*(?:(?:public|private|protected|static|async|readonly|override|abstract|get|set|declare)\\s+)*${n}\\s*(?:<[^>\\n]*>)?\\s*\\([^;{}]*\\)\\s*(?::\\s*[^;{]+)?\\s*\\{`,
    },
  ];
  for (const entry of shapes) {
    if (new RegExp(entry.source).test(code)) return entry.shape;
  }
  return undefined;
}

function lineAt(content: string, index: number): string {
  const start = content.lastIndexOf('\n', index - 1) + 1;
  const end = content.indexOf('\n', index);
  return content.slice(start, end === -1 ? content.length : end);
}

function isImportLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^import\b/.test(trimmed)) return true;
  if (/^export\s+/.test(trimmed) && /\bfrom\b/.test(trimmed)) return true;
  return /\brequire\s*\(/.test(trimmed);
}

/**
 * Context of a bare mention. Heuristic: comment, string, import line, or
 * other text in a test file. A call in a source file is not labeled — the
 * verdict stays `none` ("no declared symbol") rather than a guessed context.
 * When several contexts appear, comment wins, then string, then test body,
 * then import.
 */
function mentionContext(
  content: string,
  needle: string,
  isTest: boolean
): MentionContext | undefined {
  if (!needle || !content.includes(needle)) return undefined;
  const found = new Set<MentionContext>();
  let i = 0;
  const n = content.length;
  const note = (index: number, zone: 'comment' | 'string' | 'code') => {
    if (!content.startsWith(needle, index)) return;
    if (zone === 'comment') {
      found.add('comment');
      return;
    }
    if (zone === 'string') {
      found.add('string');
      return;
    }
    if (isImportLine(lineAt(content, index))) {
      found.add('import');
      return;
    }
    if (isTest) found.add('test-body');
  };
  while (i < n) {
    const c = content[i]!;
    const next = content[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && content[i] !== '\n') {
        note(i, 'comment');
        i += 1;
      }
      continue;
    }
    if (c === '/' && next === '*') {
      note(i, 'comment');
      note(i + 1, 'comment');
      i += 2;
      while (i < n && !(content[i] === '*' && content[i + 1] === '/')) {
        note(i, 'comment');
        i += 1;
      }
      if (i < n) {
        note(i, 'comment');
        note(i + 1, 'comment');
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      note(i, 'string');
      i += 1;
      while (i < n) {
        const ch = content[i]!;
        if (ch === '\\') {
          note(i, 'string');
          if (content[i + 1] !== undefined) note(i + 1, 'string');
          i += content[i + 1] === undefined ? 1 : 2;
          continue;
        }
        if (ch === quote) {
          note(i, 'string');
          i += 1;
          break;
        }
        note(i, 'string');
        i += 1;
      }
      continue;
    }
    note(i, 'code');
    i += 1;
  }
  if (found.has('comment')) return 'comment';
  if (found.has('string')) return 'string';
  if (found.has('test-body')) return 'test-body';
  if (found.has('import')) return 'import';
  return undefined;
}

type SymbolNeedle = { className: string | null; name: string };

/** Last segment of `Aggregate.method` is the name that must be declared. */
function symbolNeedle(symbol: string | undefined): SymbolNeedle | undefined {
  if (!symbol) return undefined;
  const parts = symbol.split('.');
  const name = parts[parts.length - 1] ?? '';
  if (!name) return undefined;
  const className = parts.length > 1 ? (parts[0] ?? null) : null;
  return { className, name };
}

function declaredLabel(invariant: CoverageInvariant): string {
  return symbolNeedle(invariant.coverage?.symbol)?.name ?? invariant.id;
}

type RankedCoverage = {
  best: CoverageEvidence;
  testTitle?: { file: string; title: string };
  declaration?: { file: string; shape: DeclarationShape };
};

function sortedContentFiles(fileContents: Readonly<Record<string, string>>): string[] {
  return Object.keys(fileContents).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * One scan. `scanTests` is false when test globs are missing: a title in the
 * loaded map must not prove a walk the scan did not claim. Test paths are
 * still excluded from declaration search.
 */
function rankCoverage(
  invariant: CoverageInvariant,
  files: CoverageFiles,
  scanTests = true
): RankedCoverage {
  const testFiles = files.testFiles ?? [];
  const tests = new Set(testFiles.map((file) => normalizePath(file)));
  const roots = (files.coverageRoots ?? []).filter(
    (root) => typeof root === 'string' && root.length > 0
  );
  const wantsTest = invariant.coverage?.test !== false && scanTests;
  const needle = symbolNeedle(invariant.coverage?.symbol ?? undefined);

  let testTitle: { file: string; title: string } | undefined;
  let outsideTitle: { file: string; title: string } | undefined;
  if (wantsTest) {
    for (const file of testFiles) {
      const content = files.fileContents[file];
      if (!content) continue;
      const title = matchTestTitle(content, invariant.id);
      if (title === undefined) continue;
      if (roots.length === 0 || isUnderCoverageRoot(file, roots)) {
        testTitle = { file, title };
        break;
      }
      outsideTitle ??= { file, title };
    }
    testTitle ??= outsideTitle;
  }

  let declaration: { file: string; shape: DeclarationShape } | undefined;
  if (needle) {
    for (const file of sortedContentFiles(files.fileContents)) {
      if (tests.has(normalizePath(file))) continue;
      const content = files.fileContents[file];
      if (!content) continue;
      if (needle.className && !content.includes(needle.className)) continue;
      const shape = declarationShape(content, needle.name);
      if (!shape) continue;
      declaration = { file, shape };
      break;
    }
  }

  let mention: { file: string; context: MentionContext } | undefined;
  if (!testTitle && !declaration) {
    if (wantsTest) {
      for (const file of testFiles) {
        const content = files.fileContents[file];
        if (!content) continue;
        const context = mentionContext(content, invariant.id, true);
        if (!context) continue;
        mention = { file, context };
        break;
      }
    }
    if (!mention && needle) {
      for (const file of sortedContentFiles(files.fileContents)) {
        if (tests.has(normalizePath(file))) continue;
        const content = files.fileContents[file];
        if (!content) continue;
        const context = mentionContext(content, needle.name, false);
        if (!context) continue;
        mention = { file, context };
        break;
      }
    }
  }

  const best: CoverageEvidence = testTitle
    ? { kind: 'test-title', file: testTitle.file, title: testTitle.title }
    : declaration
      ? { kind: 'declaration', file: declaration.file, shape: declaration.shape }
      : mention
        ? { kind: 'mention-only', file: mention.file, context: mention.context }
        : { kind: 'none' };
  return { best, ...(testTitle ? { testTitle } : {}), ...(declaration ? { declaration } : {}) };
}

/**
 * Best coverage evidence for `invariant` in `files`.
 * test-title beats a declaration; a declaration beats a bare mention; a bare
 * mention beats silence. Callers do not re-scan to explain the verdict.
 */
export function classifyCoverage(
  invariant: CoverageInvariant,
  files: CoverageFiles
): CoverageEvidence {
  return rankCoverage(invariant, files).best;
}

/**
 * Policy: a test title or any declaration counts, including type, interface,
 * and enum. A mention-only verdict never counts. `none` does not count.
 */
export function countsAsCoverage(ev: CoverageEvidence): boolean {
  switch (ev.kind) {
    case 'test-title':
    case 'declaration':
      return true;
    case 'mention-only':
    case 'none':
      return false;
  }
}

function mentionWhere(context: MentionContext): string {
  switch (context) {
    case 'test-body':
      return 'a test body';
    case 'comment':
      return 'a comment';
    case 'string':
      return 'a string';
    case 'import':
      return 'an import';
  }
}

/** Sentence for the verdict. `INVARIANT_UNCOVERED` prints this; it does not re-derive it. */
export function describeCoverage(invariant: CoverageInvariant, ev: CoverageEvidence): string {
  switch (ev.kind) {
    case 'test-title':
      return `found \`${ev.title}\` in a describe/it title in ${ev.file}`;
    case 'declaration':
      return `found \`${ev.shape} ${declaredLabel(invariant)}\` in ${ev.file}`;
    case 'mention-only':
      return `${invariant.id} appears only in ${mentionWhere(ev.context)} in ${ev.file}; put it in a describe/it title`;
    case 'none':
      return 'no scanned test names it in a describe/it title and no declared symbol was found';
  }
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
    const wantsTest = inv.coverage?.test !== false; // default: prefer test evidence when catalogued
    const symbol = inv.coverage?.symbol;
    // Missing globs: do not let a loaded title prove a walk we did not claim.
    const scanTests = !testGlobsMissing && wantsTest;
    const ranked = rankCoverage(
      inv,
      { fileContents: input.fileContents, testFiles, coverageRoots },
      scanTests
    );
    const ev = ranked.best;
    // Legacy `evidence` is derivable from the same scan: counting kinds only.
    // A test title and a declaration can both be present; mention-only is absent.
    const evidence: Array<'test-title' | 'symbol'> = [];
    if (scanTests && ranked.testTitle) evidence.push('test-title');
    if (ranked.declaration) evidence.push('symbol');
    const counts = countsAsCoverage(ev);

    let testEvidenceFile: string | undefined;
    let outsideDeclaredRoots: boolean | undefined;
    if (scanTests && ranked.testTitle) {
      testEvidenceFile = ranked.testTitle.file;
      if (rootsDeclared) {
        outsideDeclaredRoots = !isUnderCoverageRoot(testEvidenceFile, coverageRoots);
      }
    }
    const symbolEvidenceFile = ranked.declaration?.file;
    const shape = ranked.declaration?.shape;

    // Covered if the policy says this verdict counts.
    // When coverage declares neither test nor symbol, require at least description-only advisory presence = not covered.
    const requiresEvidence = inv.coverage?.test === true || Boolean(symbol) || inv.coverage === undefined;
    const covered =
      requiresEvidence && counts
        ? true
        : inv.coverage?.test === false && !symbol
          ? true // explicitly no coverage requirements
          : counts;

    // Partial only when tests are missing *and* no other evidence (e.g. symbol) completed coverage.
    const partial = testGlobsMissing && wantsTest && !counts;

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
      ...(shape !== undefined ? { shape } : {}),
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
                    : // The sentence is the verdict. It names a title, a declaration
                      // shape, a bare mention, or silence — it does not re-scan.
                      `Invariant ${inv.id}: ${describeCoverage(inv, ev)} (${
                        kind === 'tests-disappeared'
                          ? 'tests-disappeared — a suite exists'
                          : 'never-had-tests — the scan found no tests at all'
                      }). ArkGate matches declared text; it never executes tests.`) +
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
