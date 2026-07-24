/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/invariantCoverage.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/invariant-coverage.mjs). Zero Node I/O.
 */

function titleMatchesInvariant(content, id) {
    // Match describe/it/test string titles containing the invariant id.
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:describe|it|test|context)\\s*\\(\\s*['"\`][^'"\`]*${escaped}[^'"\`]*['"\`]`, 'i');
    return re.test(content) || content.includes(id);
}
function symbolPresent(fileContents, symbol) {
    if (!symbol)
        return false;
    // Support Aggregate.method or bare method name.
    const parts = symbol.split('.');
    const needle = parts[parts.length - 1];
    const className = parts.length > 1 ? parts[0] : null;
    for (const content of Object.values(fileContents)) {
        if (className && !content.includes(className))
            continue;
        if (new RegExp(`(?:function\\s+|\\b)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[(<]`).test(content) ||
            content.includes(symbol)) {
            return true;
        }
    }
    return false;
}
export function evaluateInvariantCoverage(input) {
    const invariants = input.arkRules.invariants ?? [];
    if (invariants.length === 0) {
        return { coverage: [], violations: [], partial: false };
    }
    const testFiles = input.testFiles ?? [];
    const testGlobsMissing = input.testGlobsMissing === true || testFiles.length === 0;
    const coverage = [];
    const violations = [];
    for (const inv of invariants) {
        const evidence = [];
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
        const covered = requiresEvidence && evidence.length > 0
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
export function canPromoteInvariant(coverage) {
    if (!coverage) {
        return {
            ok: false,
            reason: 'No coverage evidence supplied for this invariant; evaluate coverage before promoting to enforced.',
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
