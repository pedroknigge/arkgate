/**
 * Invariant mutation probe — pure core (ADR 0039).
 *
 * The probe answers one question per invariant: when the declared symbol is
 * broken on purpose, does a covering test fail? Tooling locates the symbol,
 * copies the project, runs the project's own runner and hashes files; this
 * module owns everything that is a decision: which edits to make, what the
 * wiring canaries look like, how the run outcomes fold into one verdict, when
 * a recorded row is still fresh, and what the evidence means for promotion.
 *
 * Not a mutation score. At most three mutants per invariant, from a closed,
 * versioned operator set. No clock, no hashing, no filesystem: Tooling supplies
 * dates, durations and content hashes.
 */

/** Versioned, closed operator set. Changing an operator changes this id. */
export const INVARIANT_PROBE_OPERATOR_SET = 'ip-ops@1' as const;
const INVARIANT_PROBE_SCHEMA_VERSION = '1.0' as const;
const INVARIANT_PROBE_KIND = 'arkgate-invariant-probe' as const;
/**
 * Project-relative path of the persisted artifact (`--write`).
 * @cliMirror bin/lib/invariant-probe-cli.mjs
 */
export const INVARIANT_PROBE_ARTIFACT_PATH = '.ark/invariant-probe.json' as const;
const INVARIANT_PROBE_MAX_MUTANTS = 3;
/**
 * Targets per run; truncation is stated.
 * @cliMirror bin/lib/invariant-probe-cli.mjs
 */
export const INVARIANT_PROBE_MAX_TARGETS = 25;
/**
 * Covering tests per target.
 * @cliMirror bin/lib/invariant-probe-cli.mjs
 */
export const INVARIANT_PROBE_MAX_TESTS = 8;
/** Reader bounds for the committed artifact. */
const INVARIANT_PROBE_MAX_ROWS = 500;
/**
 * Largest artifact the reader opens.
 * @cliMirror bin/lib/invariant-probe-io.mjs
 */
export const INVARIANT_PROBE_MAX_BYTES = 1024 * 1024;
const INVARIANT_PROBE_LOAD_MARKER = 'ARK_PROBE_LOAD';
const INVARIANT_PROBE_REACH_MARKER = 'ARK_PROBE_REACH';

/** Priority order: guard-family operators first, constants last. */
export const INVARIANT_PROBE_OPERATORS = [
  'negate-guard',
  'drop-throw',
  'flip-comparison',
  'boundary-shift',
  'const-shift',
] as const;
type ProbeOperator = (typeof INVARIANT_PROBE_OPERATORS)[number];

export const INVARIANT_PROBE_VERDICTS = [
  'killed',
  'survived',
  'not-reached',
  'inconclusive',
  'unprobeable',
] as const;
export type ProbeVerdict = (typeof INVARIANT_PROBE_VERDICTS)[number];

export const INVARIANT_PROBE_REASONS = [
  'all-killed',
  'mutant-survived',
  'reach-canary-survived',
  'baseline-red',
  'baseline-timeout',
  'runner-error',
  'file-not-loaded',
  'mutant-runtime-error',
  'no-symbol',
  'declaration-only',
  'symbol-not-found',
  'no-covering-test',
  'no-site',
] as const;
export type ProbeReason = (typeof INVARIANT_PROBE_REASONS)[number];

/** What a single run of the covering tests showed. */
export const INVARIANT_PROBE_RUN_STATUSES = [
  'killed',
  'survived',
  'timeout',
  'runtime-error',
  'invalid',
] as const;
export type ProbeRunStatus = (typeof INVARIANT_PROBE_RUN_STATUSES)[number];

export const INVARIANT_PROBE_BASELINE_STATUSES = ['green', 'red', 'timeout', 'runtime-error'] as const;
type ProbeBaselineStatus = (typeof INVARIANT_PROBE_BASELINE_STATUSES)[number];

/** Where Tooling found something to change, inside the declared symbol only. */
type ProbeSiteKind = 'guard' | 'throw' | 'comparison' | 'numeric' | 'boolean';

export type ProbeSite = {
  kind: ProbeSiteKind;
  /** Offsets into the file text (UTF-16, as `String.prototype.slice` counts). */
  start: number;
  end: number;
  /** 1-based. */
  line: number;
  column: number;
  /** `text.slice(start, end)` — the guard condition, the throw, the operator, the literal. */
  text: string;
};

export type ProbeEdit = { start: number; end: number; replacement: string };

export type PlannedMutant = ProbeEdit & {
  id: string;
  operator: ProbeOperator;
  line: number;
  column: number;
  original: string;
};

/**
 * The declared symbol's body, as Tooling found it: a block to insert into, an
 * arrow's expression body, or a `const` initializer.
 */
export type ProbeBody =
  | { kind: 'block'; insertAt: number }
  | { kind: 'expression'; start: number; end: number }
  | { kind: 'initializer'; start: number; end: number };

const FLIP: Readonly<Record<string, string>> = {
  '<': '>=',
  '>=': '<',
  '>': '<=',
  '<=': '>',
  '===': '!==',
  '!==': '===',
  '==': '!=',
  '!=': '==',
};

const BOUNDARY: Readonly<Record<string, string>> = {
  '<': '<=',
  '<=': '<',
  '>': '>=',
  '>=': '>',
};

const PLAIN_NUMBER = /^[0-9][0-9_]*(?:\.[0-9_]+)?$/;

function shiftedNumber(text: string): string | null {
  if (!PLAIN_NUMBER.test(text)) return null;
  const value = Number(text.replace(/_/g, ''));
  if (!Number.isFinite(value)) return null;
  return String(value + 1);
}

/** Every operator that applies to one site, in priority order. */
export function mutantsForSite(site: ProbeSite): PlannedMutant[] {
  const make = (operator: ProbeOperator, replacement: string): PlannedMutant => ({
    id: `${operator}@${site.line}:${site.column}`,
    operator,
    start: site.start,
    end: site.end,
    line: site.line,
    column: site.column,
    original: site.text,
    replacement,
  });
  switch (site.kind) {
    case 'guard':
      return [make('negate-guard', `!(${site.text})`)];
    case 'throw':
      return [make('drop-throw', ';')];
    case 'comparison': {
      const out: PlannedMutant[] = [];
      const flip = FLIP[site.text];
      if (flip) out.push(make('flip-comparison', flip));
      const boundary = BOUNDARY[site.text];
      if (boundary) out.push(make('boundary-shift', boundary));
      return out;
    }
    case 'numeric': {
      const shifted = shiftedNumber(site.text);
      return shifted === null ? [] : [make('const-shift', shifted)];
    }
    case 'boolean':
      if (site.text === 'true') return [make('const-shift', 'false')];
      if (site.text === 'false') return [make('const-shift', 'true')];
      return [];
  }
}

/**
 * Deterministic selection: for each operator in priority order, the first site
 * (by source position) that yields it, up to `max` mutants. Input order does
 * not matter.
 */
export function planMutants(
  sites: readonly ProbeSite[],
  max: number = INVARIANT_PROBE_MAX_MUTANTS
): PlannedMutant[] {
  const ordered = [...sites].sort((a, b) => a.start - b.start || a.end - b.end);
  const candidates = ordered.flatMap((site) => mutantsForSite(site));
  const planned: PlannedMutant[] = [];
  for (const operator of INVARIANT_PROBE_OPERATORS) {
    if (planned.length >= max) break;
    const first = candidates.find((mutant) => mutant.operator === operator);
    if (first) planned.push(first);
  }
  return planned;
}

/** Pure text splice. */
export function applyEdit(text: string, edit: ProbeEdit): string {
  return `${text.slice(0, edit.start)}${edit.replacement}${text.slice(edit.end)}`;
}

/**
 * The two wiring canaries (ADR 0039 D4). The load canary throws at the top of
 * the file (after a shebang). The reach canary throws as the first statement of
 * the symbol; for a `const`, the initializer becomes a throwing call, so for a
 * constant "reached" and "loaded" are the same event.
 */
export function canaryEdits(text: string, body: ProbeBody): { load: ProbeEdit; reach: ProbeEdit } {
  const shebangEnd = text.startsWith('#!') ? text.indexOf('\n') + 1 || text.length : 0;
  const load: ProbeEdit = {
    start: shebangEnd,
    end: shebangEnd,
    replacement: `throw new Error('${INVARIANT_PROBE_LOAD_MARKER}');\n`,
  };
  const reachThrow = `throw new Error('${INVARIANT_PROBE_REACH_MARKER}');`;
  let reach: ProbeEdit;
  switch (body.kind) {
    case 'block':
      reach = { start: body.insertAt, end: body.insertAt, replacement: ` ${reachThrow}` };
      break;
    case 'expression':
      reach = { start: body.start, end: body.end, replacement: `{ ${reachThrow} }` };
      break;
    case 'initializer':
      reach = { start: body.start, end: body.end, replacement: `(() => { ${reachThrow} })()` };
      break;
  }
  return { load, reach };
}

export type ProbeWiring = {
  baseline: ProbeBaselineStatus;
  load?: ProbeRunStatus;
  reach?: ProbeRunStatus;
};

/**
 * One verdict from the wiring checks and the mutant runs (ADR 0039 D4/D5).
 * A timeout on a mutant counts as caught (the change was detected); a runner
 * crash with no reported failure is never counted as caught.
 */
export function foldVerdict(
  wiring: ProbeWiring,
  mutants: ReadonlyArray<{ status: ProbeRunStatus }>
): { verdict: ProbeVerdict; reason: ProbeReason } {
  if (wiring.baseline === 'timeout') return { verdict: 'inconclusive', reason: 'baseline-timeout' };
  if (wiring.baseline === 'runtime-error') return { verdict: 'inconclusive', reason: 'runner-error' };
  if (wiring.baseline !== 'green') return { verdict: 'inconclusive', reason: 'baseline-red' };
  if (wiring.load === 'survived') return { verdict: 'inconclusive', reason: 'file-not-loaded' };
  if (wiring.load !== 'killed' && wiring.load !== 'timeout') {
    return { verdict: 'inconclusive', reason: 'runner-error' };
  }
  if (wiring.reach === 'survived') return { verdict: 'not-reached', reason: 'reach-canary-survived' };
  if (wiring.reach !== 'killed' && wiring.reach !== 'timeout') {
    return { verdict: 'inconclusive', reason: 'runner-error' };
  }
  const valid = mutants.filter((mutant) => mutant.status !== 'invalid');
  if (valid.length === 0) return { verdict: 'unprobeable', reason: 'no-site' };
  if (valid.some((mutant) => mutant.status === 'survived')) {
    return { verdict: 'survived', reason: 'mutant-survived' };
  }
  if (valid.some((mutant) => mutant.status === 'runtime-error')) {
    return { verdict: 'inconclusive', reason: 'mutant-runtime-error' };
  }
  return { verdict: 'killed', reason: 'all-killed' };
}

/**
 * Canonical identity text for an invariant. `mode` is left out on purpose:
 * promoting the rule must not make its own evidence stale (ADR 0039 D3).
 * Tooling hashes this text.
 */
export function invariantProbeIdentity(invariant: {
  id: string;
  coverage?: { test?: boolean; symbol?: string } | null;
}): string {
  return JSON.stringify([
    invariant.id,
    invariant.coverage?.symbol ?? null,
    invariant.coverage?.test ?? null,
  ]);
}

type InvariantProbeMutantRecord = {
  id: string;
  operator: ProbeOperator;
  line: number;
  column: number;
  original: string;
  replacement: string;
  status: ProbeRunStatus;
  durationMs: number;
};

export type InvariantProbeRow = {
  invariantId: string;
  invariantHash: string;
  layer: string | null;
  sourceFile: string | null;
  mode: 'advisory' | 'enforced';
  symbol: string | null;
  symbolFile: string | null;
  symbolFileHash: string | null;
  tests: Array<{ path: string; contentHash: string }>;
  baseline: { status: ProbeBaselineStatus; durationMs: number } | null;
  wiring: { load: ProbeRunStatus | null; reach: ProbeRunStatus | null } | null;
  mutants: InvariantProbeMutantRecord[];
  verdict: ProbeVerdict;
  reason: ProbeReason;
};

type InvariantProbeTotals = {
  probed: number;
  killed: number;
  survived: number;
  notReached: number;
  inconclusive: number;
  unprobeable: number;
};

export type InvariantProbeArtifact = {
  schemaVersion: typeof INVARIANT_PROBE_SCHEMA_VERSION;
  kind: typeof INVARIANT_PROBE_KIND;
  notAScore: true;
  arkgateVersion: string;
  operatorSet: string;
  runner: { id: string; version: string | null } | null;
  probedOn: string;
  invariants: InvariantProbeRow[];
  totals: InvariantProbeTotals;
};

function probeTotals(rows: readonly InvariantProbeRow[]): InvariantProbeTotals {
  const count = (verdict: ProbeVerdict) => rows.filter((row) => row.verdict === verdict).length;
  return {
    probed: rows.filter((row) => row.verdict !== 'unprobeable').length,
    killed: count('killed'),
    survived: count('survived'),
    notReached: count('not-reached'),
    inconclusive: count('inconclusive'),
    unprobeable: count('unprobeable'),
  };
}

/** True when a fresh row of this verdict refuses promotion (ADR 0039 D2). */
export function verdictRefusesPromotion(verdict: string): boolean {
  return verdict === 'survived' || verdict === 'not-reached';
}

/** Command exit code for a finished run: 1 when any row would refuse promotion. */
export function probeExitCode(rows: readonly InvariantProbeRow[]): 0 | 1 {
  return rows.some((row) => verdictRefusesPromotion(row.verdict)) ? 1 : 0;
}

export function buildInvariantProbeArtifact(input: {
  arkgateVersion: string;
  runner: { id: string; version: string | null } | null;
  probedOn: string;
  rows: readonly InvariantProbeRow[];
}): InvariantProbeArtifact {
  const invariants = [...input.rows].sort((a, b) =>
    a.invariantId < b.invariantId ? -1 : a.invariantId > b.invariantId ? 1 : 0
  );
  return {
    schemaVersion: INVARIANT_PROBE_SCHEMA_VERSION,
    kind: INVARIANT_PROBE_KIND,
    notAScore: true,
    arkgateVersion: input.arkgateVersion,
    operatorSet: INVARIANT_PROBE_OPERATOR_SET,
    runner: input.runner,
    probedOn: input.probedOn,
    invariants,
    totals: probeTotals(invariants),
  };
}

/** Current content hashes for one row, as Tooling reads them now. Null: gone. */
export type ProbeCurrentHashes = {
  invariantHash: string | null;
  symbolFileHash: string | null;
  testHashes: Readonly<Record<string, string | null>>;
};

/** Why a recorded row no longer describes the tree. Empty: fresh. */
export function probeRowStaleness(
  row: InvariantProbeRow,
  current: ProbeCurrentHashes,
  operatorSet: string = INVARIANT_PROBE_OPERATOR_SET
): string[] {
  const reasons: string[] = [];
  if (operatorSet !== INVARIANT_PROBE_OPERATOR_SET) reasons.push('the operator set changed');
  if (current.invariantHash === null) reasons.push('the invariant is no longer declared');
  else if (current.invariantHash !== row.invariantHash) reasons.push('the invariant changed');
  if (row.symbolFile !== null && row.symbolFileHash !== null && current.symbolFileHash !== row.symbolFileHash) {
    reasons.push(`${row.symbolFile} changed`);
  }
  for (const test of row.tests) {
    if (current.testHashes[test.path] !== test.contentHash) reasons.push(`${test.path} changed`);
  }
  return reasons;
}

/** What promotion and status read from one row. */
export type InvariantProbeSummary = {
  verdict: ProbeVerdict;
  reason: ProbeReason;
  /** False when a hashed input changed since the run; a stale row changes nothing. */
  fresh: boolean;
  survivors: Array<{ operator: ProbeOperator; line: number; original: string; replacement: string }>;
  staleBecause?: string[];
  symbolFile?: string;
  probedOn?: string;
};

export function summarizeProbeForCoverage(
  row: InvariantProbeRow,
  staleBecause: readonly string[],
  probedOn?: string
): InvariantProbeSummary {
  return {
    verdict: row.verdict,
    reason: row.reason,
    fresh: staleBecause.length === 0,
    survivors: row.mutants
      .filter((mutant) => mutant.status === 'survived')
      .map((mutant) => ({
        operator: mutant.operator,
        line: mutant.line,
        original: mutant.original,
        replacement: mutant.replacement,
      })),
    ...(staleBecause.length > 0 ? { staleBecause: [...staleBecause] } : {}),
    ...(row.symbolFile ? { symbolFile: row.symbolFile } : {}),
    ...(probedOn ? { probedOn } : {}),
  };
}

/** Short state for status and inventory lines. */
export function probeStatusLabel(summary: InvariantProbeSummary | undefined): string {
  if (!summary) return 'not run';
  if (!summary.fresh) return 'stale';
  return summary.verdict;
}

function changeText(mutant: { operator: ProbeOperator; original: string; replacement: string }): string {
  switch (mutant.operator) {
    case 'negate-guard':
      return 'the guard is negated';
    case 'drop-throw':
      return 'the throw is removed';
    case 'flip-comparison':
      return `\`${mutant.original}\` becomes \`${mutant.replacement}\``;
    case 'boundary-shift':
      return `the boundary moves (\`${mutant.original}\` becomes \`${mutant.replacement}\`)`;
    case 'const-shift':
      return `\`${mutant.original}\` becomes \`${mutant.replacement}\``;
  }
}

/** One plain sentence per row (product voice; no score). */
export function probeRowLine(row: InvariantProbeRow): string {
  const id = row.invariantId;
  const symbol = row.symbol ?? 'the symbol';
  const file = row.symbolFile ?? row.sourceFile ?? 'its file';
  switch (row.reason) {
    case 'all-killed':
      return `${id}: a covering test fails for every change made to ${symbol} (${file}).`;
    case 'mutant-survived': {
      const survivor = row.mutants.find((mutant) => mutant.status === 'survived');
      const where = survivor ? `${file}:${survivor.line}` : file;
      return `${id}: the tests still pass when ${survivor ? changeText(survivor) : `${symbol} is changed`} (${where}). The test names the rule but does not pin it. Next: add a case that fails when the rule is broken, then re-run with --write.`;
    }
    case 'reach-canary-survived':
      return `${id}: the tests load ${file} but never call ${symbol}. Next: add a test that calls it, then re-run with --write.`;
    case 'baseline-red':
      return `${id}: the covering tests fail before any change, so nothing was probed. Next: make them pass first.`;
    case 'baseline-timeout':
      return `${id}: the covering tests did not finish in time, so nothing was probed.`;
    case 'runner-error':
      return `${id}: the test runner crashed instead of reporting results, so nothing is claimed.`;
    case 'file-not-loaded':
      return `${id}: the tests never load this copy of ${file} (it may come from node_modules), so nothing was probed.`;
    case 'mutant-runtime-error':
      return `${id}: the runner crashed on a change instead of reporting a failure, so nothing is claimed.`;
    case 'no-symbol':
      return `${id}: declares no coverage.symbol, so there is nothing to change.`;
    case 'declaration-only':
      return `${id}: ${symbol} is a declaration with no behavior to change.`;
    case 'symbol-not-found':
      return `${id}: ${symbol} was not found as a function, const or method in ${file}.`;
    case 'no-covering-test':
      return `${id}: no test names it or imports ${file}. A declaration is not a test.`;
    case 'no-site':
      return `${id}: ${symbol} has no guard, throw, comparison or constant to change.`;
  }
}

/** Promotion refusal sentence for a fresh survived / not-reached summary. */
export function probeRefusalReason(invariantId: string, summary: InvariantProbeSummary): string {
  if (summary.verdict === 'not-reached') {
    return `Invariant ${invariantId}: the covering tests load the file but never call the declared symbol (mutation probe: not reached); add a test that calls it and re-run --probe-invariants --write before promoting.`;
  }
  const survivor = summary.survivors[0];
  const detail = survivor ? ` (${changeText(survivor)} at line ${survivor.line})` : '';
  return `Invariant ${invariantId}: the mutation probe shows the covering tests do not pin it${detail}; strengthen the test and re-run --probe-invariants --write before promoting.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isNullableText(value: unknown): value is string | null {
  return value === null || isText(value);
}

function isRunStatusOrNull(value: unknown): boolean {
  return value === null || oneOf(INVARIANT_PROBE_RUN_STATUSES, value);
}

function isMutantRecord(value: unknown): value is InvariantProbeMutantRecord {
  return (
    isRecord(value) &&
    isText(value.id) &&
    oneOf(INVARIANT_PROBE_OPERATORS, value.operator) &&
    Number.isInteger(value.line) &&
    Number.isInteger(value.column) &&
    typeof value.original === 'string' &&
    typeof value.replacement === 'string' &&
    oneOf(INVARIANT_PROBE_RUN_STATUSES, value.status) &&
    typeof value.durationMs === 'number'
  );
}

function isProbeRow(value: unknown): value is InvariantProbeRow {
  if (!isRecord(value)) return false;
  const baselineOk =
    value.baseline === null ||
    (isRecord(value.baseline) &&
      oneOf(INVARIANT_PROBE_BASELINE_STATUSES, value.baseline.status) &&
      typeof value.baseline.durationMs === 'number');
  const wiringOk =
    value.wiring === null ||
    (isRecord(value.wiring) && isRunStatusOrNull(value.wiring.load) && isRunStatusOrNull(value.wiring.reach));
  return (
    isText(value.invariantId) &&
    isText(value.invariantHash) &&
    isNullableText(value.layer) &&
    isNullableText(value.sourceFile) &&
    (value.mode === 'advisory' || value.mode === 'enforced') &&
    isNullableText(value.symbol) &&
    isNullableText(value.symbolFile) &&
    isNullableText(value.symbolFileHash) &&
    Array.isArray(value.tests) &&
    value.tests.every((test) => isRecord(test) && isText(test.path) && isText(test.contentHash)) &&
    baselineOk &&
    wiringOk &&
    Array.isArray(value.mutants) &&
    value.mutants.every(isMutantRecord) &&
    oneOf(INVARIANT_PROBE_VERDICTS, value.verdict) &&
    oneOf(INVARIANT_PROBE_REASONS, value.reason)
  );
}

/**
 * Read a parsed artifact. A malformed envelope is refused whole; a malformed
 * row is dropped and counted. Either way a malformed artifact can only change
 * nothing — it never grants anything (ADR 0039 D2).
 */
export function readInvariantProbeArtifact(
  value: unknown
):
  | { ok: true; artifact: InvariantProbeArtifact; droppedRows: number; truncatedRows: number }
  | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: 'not a JSON object' };
  if (value.kind !== INVARIANT_PROBE_KIND) return { ok: false, reason: `kind is not ${INVARIANT_PROBE_KIND}` };
  if (value.schemaVersion !== INVARIANT_PROBE_SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion is not ${INVARIANT_PROBE_SCHEMA_VERSION}` };
  }
  if (!Array.isArray(value.invariants)) return { ok: false, reason: 'invariants is not a list' };
  if (!isText(value.operatorSet)) return { ok: false, reason: 'operatorSet is missing' };
  const kept = value.invariants.slice(0, INVARIANT_PROBE_MAX_ROWS);
  const rows = kept.filter(isProbeRow);
  const runner =
    isRecord(value.runner) && isText(value.runner.id)
      ? { id: value.runner.id, version: isText(value.runner.version) ? value.runner.version : null }
      : null;
  return {
    ok: true,
    artifact: {
      schemaVersion: INVARIANT_PROBE_SCHEMA_VERSION,
      kind: INVARIANT_PROBE_KIND,
      notAScore: true,
      arkgateVersion: isText(value.arkgateVersion) ? value.arkgateVersion : 'unknown',
      operatorSet: value.operatorSet,
      runner,
      probedOn: isText(value.probedOn) ? value.probedOn : 'unknown',
      invariants: rows,
      totals: probeTotals(rows),
    },
    droppedRows: kept.length - rows.length,
    truncatedRows: value.invariants.length - kept.length,
  };
}
