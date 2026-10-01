/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/invariantProbe.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/invariant-probe.mjs). Zero Node I/O.
 */

/** Versioned, closed operator set. Changing an operator changes this id. */
export const INVARIANT_PROBE_OPERATOR_SET = 'ip-ops@1';
const INVARIANT_PROBE_SCHEMA_VERSION = '1.0';
const INVARIANT_PROBE_KIND = 'arkgate-invariant-probe';
/**
 * Project-relative path of the persisted artifact (`--write`).
 */
export const INVARIANT_PROBE_ARTIFACT_PATH = '.ark/invariant-probe.json';
const INVARIANT_PROBE_MAX_MUTANTS = 3;
/**
 * Targets per run; truncation is stated.
 */
export const INVARIANT_PROBE_MAX_TARGETS = 25;
/**
 * Covering tests per target.
 */
export const INVARIANT_PROBE_MAX_TESTS = 8;
/** Reader bounds for the committed artifact. */
const INVARIANT_PROBE_MAX_ROWS = 500;
/**
 * Largest artifact the reader opens.
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
];
export const INVARIANT_PROBE_VERDICTS = [
    'killed',
    'survived',
    'not-reached',
    'inconclusive',
    'unprobeable',
];
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
];
/** What a single run of the covering tests showed. */
export const INVARIANT_PROBE_RUN_STATUSES = [
    'killed',
    'survived',
    'timeout',
    'runtime-error',
    'invalid',
];
export const INVARIANT_PROBE_BASELINE_STATUSES = ['green', 'red', 'timeout', 'runtime-error'];
const FLIP = {
    '<': '>=',
    '>=': '<',
    '>': '<=',
    '<=': '>',
    '===': '!==',
    '!==': '===',
    '==': '!=',
    '!=': '==',
};
const BOUNDARY = {
    '<': '<=',
    '<=': '<',
    '>': '>=',
    '>=': '>',
};
const PLAIN_NUMBER = /^[0-9][0-9_]*(?:\.[0-9_]+)?$/;
function shiftedNumber(text) {
    if (!PLAIN_NUMBER.test(text))
        return null;
    const value = Number(text.replace(/_/g, ''));
    if (!Number.isFinite(value))
        return null;
    return String(value + 1);
}
/** Every operator that applies to one site, in priority order. */
export function mutantsForSite(site) {
    const make = (operator, replacement) => ({
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
            const out = [];
            const flip = FLIP[site.text];
            if (flip)
                out.push(make('flip-comparison', flip));
            const boundary = BOUNDARY[site.text];
            if (boundary)
                out.push(make('boundary-shift', boundary));
            return out;
        }
        case 'numeric': {
            const shifted = shiftedNumber(site.text);
            return shifted === null ? [] : [make('const-shift', shifted)];
        }
        case 'boolean':
            if (site.text === 'true')
                return [make('const-shift', 'false')];
            if (site.text === 'false')
                return [make('const-shift', 'true')];
            return [];
    }
}
/**
 * Deterministic selection: for each operator in priority order, the first site
 * (by source position) that yields it, up to `max` mutants. Input order does
 * not matter.
 */
export function planMutants(sites, max = INVARIANT_PROBE_MAX_MUTANTS) {
    const ordered = [...sites].sort((a, b) => a.start - b.start || a.end - b.end);
    const candidates = ordered.flatMap((site) => mutantsForSite(site));
    const planned = [];
    for (const operator of INVARIANT_PROBE_OPERATORS) {
        if (planned.length >= max)
            break;
        const first = candidates.find((mutant) => mutant.operator === operator);
        if (first)
            planned.push(first);
    }
    return planned;
}
/** Pure text splice. */
export function applyEdit(text, edit) {
    return `${text.slice(0, edit.start)}${edit.replacement}${text.slice(edit.end)}`;
}
/**
 * The two wiring canaries (ADR 0039 D4). The load canary throws at the top of
 * the file (after a shebang). The reach canary throws as the first statement of
 * the symbol; for a `const`, the initializer becomes a throwing call, so for a
 * constant "reached" and "loaded" are the same event.
 */
export function canaryEdits(text, body) {
    const shebangEnd = text.startsWith('#!') ? text.indexOf('\n') + 1 || text.length : 0;
    const load = {
        start: shebangEnd,
        end: shebangEnd,
        replacement: `throw new Error('${INVARIANT_PROBE_LOAD_MARKER}');\n`,
    };
    const reachThrow = `throw new Error('${INVARIANT_PROBE_REACH_MARKER}');`;
    let reach;
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
/**
 * One verdict from the wiring checks and the mutant runs (ADR 0039 D4/D5).
 * A timeout on a mutant counts as caught (the change was detected); a runner
 * crash with no reported failure is never counted as caught.
 */
export function foldVerdict(wiring, mutants) {
    if (wiring.baseline === 'timeout')
        return { verdict: 'inconclusive', reason: 'baseline-timeout' };
    if (wiring.baseline === 'runtime-error')
        return { verdict: 'inconclusive', reason: 'runner-error' };
    if (wiring.baseline !== 'green')
        return { verdict: 'inconclusive', reason: 'baseline-red' };
    if (wiring.load === 'survived')
        return { verdict: 'inconclusive', reason: 'file-not-loaded' };
    if (wiring.load !== 'killed' && wiring.load !== 'timeout') {
        return { verdict: 'inconclusive', reason: 'runner-error' };
    }
    if (wiring.reach === 'survived')
        return { verdict: 'not-reached', reason: 'reach-canary-survived' };
    if (wiring.reach !== 'killed' && wiring.reach !== 'timeout') {
        return { verdict: 'inconclusive', reason: 'runner-error' };
    }
    const valid = mutants.filter((mutant) => mutant.status !== 'invalid');
    if (valid.length === 0)
        return { verdict: 'unprobeable', reason: 'no-site' };
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
export function invariantProbeIdentity(invariant) {
    return JSON.stringify([
        invariant.id,
        invariant.coverage?.symbol ?? null,
        invariant.coverage?.test ?? null,
    ]);
}
function probeTotals(rows) {
    const count = (verdict) => rows.filter((row) => row.verdict === verdict).length;
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
export function verdictRefusesPromotion(verdict) {
    return verdict === 'survived' || verdict === 'not-reached';
}
/** Command exit code for a finished run: 1 when any row would refuse promotion. */
export function probeExitCode(rows) {
    return rows.some((row) => verdictRefusesPromotion(row.verdict)) ? 1 : 0;
}
export function buildInvariantProbeArtifact(input) {
    const invariants = [...input.rows].sort((a, b) => a.invariantId < b.invariantId ? -1 : a.invariantId > b.invariantId ? 1 : 0);
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
/** Why a recorded row no longer describes the tree. Empty: fresh. */
export function probeRowStaleness(row, current, operatorSet = INVARIANT_PROBE_OPERATOR_SET) {
    const reasons = [];
    if (operatorSet !== INVARIANT_PROBE_OPERATOR_SET)
        reasons.push('the operator set changed');
    if (current.invariantHash === null)
        reasons.push('the invariant is no longer declared');
    else if (current.invariantHash !== row.invariantHash)
        reasons.push('the invariant changed');
    if (row.symbolFile !== null && row.symbolFileHash !== null && current.symbolFileHash !== row.symbolFileHash) {
        reasons.push(`${row.symbolFile} changed`);
    }
    for (const test of row.tests) {
        if (current.testHashes[test.path] !== test.contentHash)
            reasons.push(`${test.path} changed`);
    }
    return reasons;
}
export function summarizeProbeForCoverage(row, staleBecause, probedOn) {
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
export function probeStatusLabel(summary) {
    if (!summary)
        return 'not run';
    if (!summary.fresh)
        return 'stale';
    return summary.verdict;
}
function changeText(mutant) {
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
export function probeRowLine(row) {
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
export function probeRefusalReason(invariantId, summary) {
    if (summary.verdict === 'not-reached') {
        return `Invariant ${invariantId}: the covering tests load the file but never call the declared symbol (mutation probe: not reached); add a test that calls it and re-run --probe-invariants --write before promoting.`;
    }
    const survivor = summary.survivors[0];
    const detail = survivor ? ` (${changeText(survivor)} at line ${survivor.line})` : '';
    return `Invariant ${invariantId}: the mutation probe shows the covering tests do not pin it${detail}; strengthen the test and re-run --probe-invariants --write before promoting.`;
}
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isText(value) {
    return typeof value === 'string' && value.length > 0;
}
function oneOf(values, value) {
    return typeof value === 'string' && values.includes(value);
}
function isNullableText(value) {
    return value === null || isText(value);
}
function isRunStatusOrNull(value) {
    return value === null || oneOf(INVARIANT_PROBE_RUN_STATUSES, value);
}
function isMutantRecord(value) {
    return (isRecord(value) &&
        isText(value.id) &&
        oneOf(INVARIANT_PROBE_OPERATORS, value.operator) &&
        Number.isInteger(value.line) &&
        Number.isInteger(value.column) &&
        typeof value.original === 'string' &&
        typeof value.replacement === 'string' &&
        oneOf(INVARIANT_PROBE_RUN_STATUSES, value.status) &&
        typeof value.durationMs === 'number');
}
function isProbeRow(value) {
    if (!isRecord(value))
        return false;
    const baselineOk = value.baseline === null ||
        (isRecord(value.baseline) &&
            oneOf(INVARIANT_PROBE_BASELINE_STATUSES, value.baseline.status) &&
            typeof value.baseline.durationMs === 'number');
    const wiringOk = value.wiring === null ||
        (isRecord(value.wiring) && isRunStatusOrNull(value.wiring.load) && isRunStatusOrNull(value.wiring.reach));
    return (isText(value.invariantId) &&
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
        oneOf(INVARIANT_PROBE_REASONS, value.reason));
}
/**
 * Read a parsed artifact. A malformed envelope is refused whole; a malformed
 * row is dropped and counted. Either way a malformed artifact can only change
 * nothing — it never grants anything (ADR 0039 D2).
 */
export function readInvariantProbeArtifact(value) {
    if (!isRecord(value))
        return { ok: false, reason: 'not a JSON object' };
    if (value.kind !== INVARIANT_PROBE_KIND)
        return { ok: false, reason: `kind is not ${INVARIANT_PROBE_KIND}` };
    if (value.schemaVersion !== INVARIANT_PROBE_SCHEMA_VERSION) {
        return { ok: false, reason: `schemaVersion is not ${INVARIANT_PROBE_SCHEMA_VERSION}` };
    }
    if (!Array.isArray(value.invariants))
        return { ok: false, reason: 'invariants is not a list' };
    if (!isText(value.operatorSet))
        return { ok: false, reason: 'operatorSet is missing' };
    const kept = value.invariants.slice(0, INVARIANT_PROBE_MAX_ROWS);
    const rows = kept.filter(isProbeRow);
    const runner = isRecord(value.runner) && isText(value.runner.id)
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
