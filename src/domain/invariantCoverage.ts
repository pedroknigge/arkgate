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
};

export type InvariantCoverageViolation = {
  ruleId: 'INVARIANT_UNCOVERED';
  message: string;
  file: string;
  line: number;
  arkruleId: string;
  arkruleSource: string;
  fromLayer: string;
  severity: 'error' | 'warning';
  failsStrict: boolean;
};

export type EvaluateInvariantCoverageInput = {
  arkRules: EffectiveArkRules;
  /** Project-relative path → file contents (tests + domain sources). */
  fileContents: Readonly<Record<string, string>>;
  /** Paths considered tests (already filtered by Tooling via globs). */
  testFiles?: readonly string[];
  /** When true, missing test files make coverage partial (never green covered). */
  testGlobsMissing?: boolean;
};

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
  const coverage: InvariantCoverageEvidence[] = [];
  const violations: InvariantCoverageViolation[] = [];

  for (const inv of invariants as EffectiveInvariantRule[]) {
    const evidence: Array<'test-title' | 'symbol'> = [];
    const wantsTest = inv.coverage?.test !== false; // default: prefer test evidence when catalogued
    const symbol = inv.coverage?.symbol;

    if (!testGlobsMissing && wantsTest) {
      for (const file of testFiles) {
        const content = input.fileContents[file];
        if (content && titleMatchesInvariant(content, inv.id)) {
          evidence.push('test-title');
          break;
        }
      }
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
    });

    if (!covered || partial) {
      // Enforced + proven uncovered → failsStrict; partial always advisory (never fake green).
      const failsStrict = inv.mode === 'enforced' && !partial;
      violations.push({
        ruleId: 'INVARIANT_UNCOVERED',
        message: partial
          ? `Invariant ${inv.id} coverage cannot be proven (test globs missing or empty); reporting partial, not covered.`
          : `Invariant ${inv.id} is not covered by a test title or declared symbol.`,
        file: inv.provenance.sourceFile,
        line: 1,
        arkruleId: inv.id,
        arkruleSource: inv.provenance.sourceFile,
        fromLayer: inv.provenance.layer,
        severity: failsStrict ? 'error' : 'warning',
        failsStrict,
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
  return { ok: true, reason: `Invariant ${coverage.invariantId} has coverage evidence.` };
}
