/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/invariantCoverage.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/invariant-coverage.mjs). Zero Node I/O.
 */

/** Adopted + catalogued invariants, but no declared tests path (P2 §10). */
export const INVARIANT_TESTS_PATH_RULE_ID = 'INVARIANT_TESTS_PATH_MISSING';
export const INVARIANT_TESTS_PATH_MESSAGE = 'This project is adopted and has domain invariants, but ark.config.json does not name a real tests path. Add coverage.testGlobs or coverage.coverageRoots pointing at the folder where those tests live, then re-run. Without that path, coverage is an empty checkbox.';
/** Enforced invariant, but no declared runner roots (P2 §10 residual). */
export const INVARIANT_COVERAGE_ROOTS_RULE_ID = 'INVARIANT_COVERAGE_ROOTS_MISSING';
export const INVARIANT_COVERAGE_ROOTS_MESSAGE = 'A domain invariant is enforced, but ark.config.json does not name coverage.coverageRoots — the folders where this project\'s test runner actually goes. Add coverage.coverageRoots pointing at that folder, then re-run. Without it, coverage can certify a test no runner runs.';
/**
 * Human-readable discard tail. Empty when the scan discarded nothing.
 * `omitBudget` drops the budget clause and the load totals for messages whose
 * own text already carries them — the same number twice reads as two facts.
 */
export function formatCoverageDiscards(stats, omitBudget = false) {
    if (!stats)
        return '';
    const d = stats.discarded;
    const parts = [];
    if (d.budget > 0 && !omitBudget)
        parts.push(`${d.budget} past the ${stats.maxFiles}-file budget`);
    if (d.noInvariantMention > 0)
        parts.push(`${d.noInvariantMention} naming no catalogued invariant`);
    if (d.oversize > 0)
        parts.push(`${d.oversize} over the per-file byte cap`);
    if (d.unreadable > 0)
        parts.push(`${d.unreadable} unreadable (files or directories)`);
    if (d.depthLimited > 0)
        parts.push(`${d.depthLimited} directories past the walk depth limit`);
    if (d.outOfRoot > 0)
        parts.push(`${d.outOfRoot} symlinked outside the project root`);
    if (parts.length === 0)
        return '';
    const totals = omitBudget
        ? ''
        : ` (loaded ${stats.filesLoaded} files, kept ${stats.testFilesRetained} tests)`;
    return ` Scan discarded ${parts.join(', ')}${totals}.`;
}
/**
 * True when `file` sits inside one of the declared coverage roots.
 * A root is a path prefix, `.` (or `''`) meaning the whole project.
 */
function isUnderCoverageRoot(file, roots) {
    const target = file.replace(/\\/g, '/').replace(/^\.\//, '');
    return roots.some((rawRoot) => {
        const root = rawRoot.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
        if (root === '' || root === '.')
            return true;
        return target === root || target.startsWith(`${root}/`);
    });
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function normalizePath(file) {
    return file.replace(/\\/g, '/').replace(/^\.\//, '');
}
/**
 * Blank comments, and optionally strings, with spaces so a regex cannot treat
 * a comment or a quoted mention as code. Newlines stay so line structure holds.
 * `//` and `/*` inside a string are not comments.
 */
function maskNonCode(content, blankStrings) {
    const out = [];
    let i = 0;
    const n = content.length;
    while (i < n) {
        const c = content[i];
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
                const ch = content[i];
                if (ch === '\\') {
                    const escaped = content[i + 1];
                    if (blankStrings) {
                        out.push(' ', escaped === undefined ? '' : ' ');
                    }
                    else {
                        out.push('\\');
                        if (escaped !== undefined)
                            out.push(escaped);
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
function matchTestTitle(content, id) {
    if (!id)
        return undefined;
    const escaped = escapeRegExp(id);
    const re = new RegExp(`(?:describe|it|test|context)\\s*\\(\\s*(['"\`])([^'"\`]*${escaped}[^'"\`]*)\\1`, 'i');
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
function declarationShape(content, name) {
    if (!name)
        return undefined;
    const n = escapeRegExp(name);
    const code = maskNonCode(content, true);
    const shapes = [
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
        if (new RegExp(entry.source).test(code))
            return entry.shape;
    }
    return undefined;
}
function lineAt(content, index) {
    const start = content.lastIndexOf('\n', index - 1) + 1;
    const end = content.indexOf('\n', index);
    return content.slice(start, end === -1 ? content.length : end);
}
function isImportLine(line) {
    const trimmed = line.trim();
    if (/^import\b/.test(trimmed))
        return true;
    if (/^export\s+/.test(trimmed) && /\bfrom\b/.test(trimmed))
        return true;
    return /\brequire\s*\(/.test(trimmed);
}
/**
 * Context of a bare mention. Heuristic: comment, string, import line, or
 * other text in a test file. A call in a source file is not labeled — the
 * verdict stays `none` ("no declared symbol") rather than a guessed context.
 * When several contexts appear, comment wins, then string, then test body,
 * then import.
 */
function mentionContext(content, needle, isTest) {
    if (!needle || !content.includes(needle))
        return undefined;
    const found = new Set();
    let i = 0;
    const n = content.length;
    const note = (index, zone) => {
        if (!content.startsWith(needle, index))
            return;
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
        if (isTest)
            found.add('test-body');
    };
    while (i < n) {
        const c = content[i];
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
                const ch = content[i];
                if (ch === '\\') {
                    note(i, 'string');
                    if (content[i + 1] !== undefined)
                        note(i + 1, 'string');
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
    if (found.has('comment'))
        return 'comment';
    if (found.has('string'))
        return 'string';
    if (found.has('test-body'))
        return 'test-body';
    if (found.has('import'))
        return 'import';
    return undefined;
}
/** Last segment of `Aggregate.method` is the name that must be declared. */
function symbolNeedle(symbol) {
    if (!symbol)
        return undefined;
    const parts = symbol.split('.');
    const name = parts[parts.length - 1] ?? '';
    if (!name)
        return undefined;
    const className = parts.length > 1 ? (parts[0] ?? null) : null;
    return { className, name };
}
function declaredLabel(invariant) {
    return symbolNeedle(invariant.coverage?.symbol)?.name ?? invariant.id;
}
function sortedContentFiles(fileContents) {
    return Object.keys(fileContents).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
/**
 * One scan. `scanTests` is false when test globs are missing: a title in the
 * loaded map must not prove a walk the scan did not claim. Test paths are
 * still excluded from declaration search.
 */
function rankCoverage(invariant, files, scanTests = true) {
    const testFiles = files.testFiles ?? [];
    const tests = new Set(testFiles.map((file) => normalizePath(file)));
    const roots = (files.coverageRoots ?? []).filter((root) => typeof root === 'string' && root.length > 0);
    const wantsTest = invariant.coverage?.test !== false && scanTests;
    const needle = symbolNeedle(invariant.coverage?.symbol ?? undefined);
    let testTitle;
    let outsideTitle;
    if (wantsTest) {
        for (const file of testFiles) {
            const content = files.fileContents[file];
            if (!content)
                continue;
            const title = matchTestTitle(content, invariant.id);
            if (title === undefined)
                continue;
            if (roots.length === 0 || isUnderCoverageRoot(file, roots)) {
                testTitle = { file, title };
                break;
            }
            outsideTitle ??= { file, title };
        }
        testTitle ??= outsideTitle;
    }
    let declaration;
    if (needle) {
        for (const file of sortedContentFiles(files.fileContents)) {
            if (tests.has(normalizePath(file)))
                continue;
            const content = files.fileContents[file];
            if (!content)
                continue;
            if (needle.className && !content.includes(needle.className))
                continue;
            const shape = declarationShape(content, needle.name);
            if (!shape)
                continue;
            declaration = { file, shape };
            break;
        }
    }
    let mention;
    if (!testTitle && !declaration) {
        if (wantsTest) {
            for (const file of testFiles) {
                const content = files.fileContents[file];
                if (!content)
                    continue;
                const context = mentionContext(content, invariant.id, true);
                if (!context)
                    continue;
                mention = { file, context };
                break;
            }
        }
        if (!mention && needle) {
            for (const file of sortedContentFiles(files.fileContents)) {
                if (tests.has(normalizePath(file)))
                    continue;
                const content = files.fileContents[file];
                if (!content)
                    continue;
                const context = mentionContext(content, needle.name, false);
                if (!context)
                    continue;
                mention = { file, context };
                break;
            }
        }
    }
    const best = testTitle
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
export function classifyCoverage(invariant, files) {
    return rankCoverage(invariant, files).best;
}
/**
 * Policy: a test title or any declaration counts, including type, interface,
 * and enum. A mention-only verdict never counts. `none` does not count.
 */
export function countsAsCoverage(ev) {
    switch (ev.kind) {
        case 'test-title':
        case 'declaration':
            return true;
        case 'mention-only':
        case 'none':
            return false;
    }
}
function mentionWhere(context) {
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
export function describeCoverage(invariant, ev) {
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
export function evaluateInvariantCoverage(input) {
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
        ? `coverage file budget exhausted: ${stats.filesLoaded} files loaded at the ${stats.maxFiles}-file cap, ${stats.testFilesRetained} tests retained, ${stats.discarded.budget} files discarded at the cap; raise "coverage.maxFiles" in ark.config.json (the cap bounds files RETAINED as evidence${typeof stats.filesRead === 'number' ? `; ${stats.filesRead} were read` : ''})`
        : 'coverage file budget exhausted';
    const coverageRoots = (input.coverageRoots ?? []).filter((root) => typeof root === 'string' && root.length > 0);
    const rootsDeclared = coverageRoots.length > 0;
    const declaredRootsList = coverageRoots.join(', ');
    const coverage = [];
    const violations = [];
    for (const inv of invariants) {
        const wantsTest = inv.coverage?.test !== false; // default: prefer test evidence when catalogued
        const symbol = inv.coverage?.symbol;
        // Missing globs: do not let a loaded title prove a walk we did not claim.
        const scanTests = !testGlobsMissing && wantsTest;
        const ranked = rankCoverage(inv, { fileContents: input.fileContents, testFiles, coverageRoots }, scanTests);
        const ev = ranked.best;
        // Legacy `evidence` is derivable from the same scan: counting kinds only.
        // A test title and a declaration can both be present; mention-only is absent.
        const evidence = [];
        if (scanTests && ranked.testTitle)
            evidence.push('test-title');
        if (ranked.declaration)
            evidence.push('symbol');
        const counts = countsAsCoverage(ev);
        let testEvidenceFile;
        let outsideDeclaredRoots;
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
        const covered = requiresEvidence && counts
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
                message: `Invariant ${inv.id} is covered only by ${testEvidenceFile}, which is outside the declared coverage roots (${declaredRootsList}). ` +
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
            const kind = testGlobsMissing || testFiles.length === 0 ? 'never-had-tests' : 'tests-disappeared';
            violations.push({
                ruleId: 'INVARIANT_UNCOVERED',
                message: (partial
                    ? coverageBudgetExhausted
                        ? `Invariant ${inv.id} coverage cannot be proven (${budgetDetail}); reporting partial, not covered.`
                        : `Invariant ${inv.id} coverage cannot be proven (test globs missing or empty); reporting partial, not covered (never-had-tests).`
                    : // The sentence is the verdict. It names a title, a declaration
                        // shape, a bare mention, or silence — it does not re-scan.
                        `Invariant ${inv.id}: ${describeCoverage(inv, ev)} (${kind === 'tests-disappeared'
                            ? 'tests-disappeared — a suite exists'
                            : 'never-had-tests — the scan found no tests at all'}). ArkGate matches declared text; it never executes tests.`) +
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
    // Promotion is the moment coverage stops being advice, so an evidence file
    // the project itself says its runner does not walk cannot carry it.
    if (coverage.outsideDeclaredRoots === true) {
        return {
            ok: false,
            reason: `Invariant ${coverage.invariantId} is covered only by ${coverage.testEvidenceFile ?? 'a test'}, outside the declared coverage roots; ArkGate cannot tell whether that test runs, so it will not promote on it.`,
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
function nonEmptyPathStrings(value) {
    if (!Array.isArray(value))
        return [];
    const out = [];
    for (const item of value) {
        if (typeof item !== 'string')
            continue;
        const trimmed = item.trim();
        if (trimmed.length > 0)
            out.push(trimmed);
    }
    return out;
}
/**
 * Declared tests homes: `coverage.testGlobs` and/or `coverage.coverageRoots`.
 * Either is a configured path. Empty strings do not count.
 */
export function configuredInvariantTestsPaths(coverage) {
    if (!coverage || typeof coverage !== 'object')
        return [];
    return [...nonEmptyPathStrings(coverage.testGlobs), ...nonEmptyPathStrings(coverage.coverageRoots)];
}
export function hasConfiguredInvariantTestsPath(coverage) {
    return configuredInvariantTestsPaths(coverage).length > 0;
}
/**
 * True when at least one catalogued invariant wants test evidence.
 * Same default as AR10: `coverage.test !== false`. `test: false` is an explicit
 * opt-out (starter Domain phrases use it) and does not demand a tests path.
 */
export function catalogDemandsInvariantTestsPath(invariants) {
    if (!Array.isArray(invariants) || invariants.length === 0)
        return false;
    return invariants.some((inv) => inv != null && inv.coverage?.test !== false);
}
/**
 * §10 — adopted + invariants that want tests require a real tests path.
 * Fail-closed. Not freezable. Silent when not adopted, the catalog is empty,
 * or every entry sets `coverage.test: false`.
 */
export function collectMissingInvariantTestsPathFindings(input) {
    const demanded = input.hasDomainInvariants === true ||
        (input.hasDomainInvariants !== false && catalogDemandsInvariantTestsPath(input.invariants));
    if (input.adopted !== true || !demanded)
        return [];
    const configured = hasConfiguredInvariantTestsPath(input.coverage);
    if (configured && input.declaredPathPresent !== false)
        return [];
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
export function configuredCoverageRoots(coverage) {
    if (!coverage || typeof coverage !== 'object')
        return [];
    return nonEmptyPathStrings(coverage.coverageRoots);
}
export function hasConfiguredCoverageRoots(coverage) {
    return configuredCoverageRoots(coverage).length > 0;
}
/**
 * True when at least one catalogued invariant is `mode: "enforced"`.
 * Structure-sensor enforced is not this — only `invariants[]`.
 */
export function catalogHasEnforcedInvariant(invariants) {
    if (!Array.isArray(invariants) || invariants.length === 0)
        return false;
    return invariants.some((inv) => inv != null && inv.mode === 'enforced');
}
/**
 * P2 §10 residual — any enforced invariant requires `coverage.coverageRoots`.
 * Fail-closed. Not freezable. Silent when no invariant is enforced.
 * testGlobs alone does not satisfy this: without roots, OUTSIDE_ROOTS cannot fire.
 */
export function collectMissingCoverageRootsFindings(input) {
    const enforced = input.hasEnforcedInvariant === true ||
        (input.hasEnforcedInvariant !== false && catalogHasEnforcedInvariant(input.invariants));
    if (!enforced)
        return [];
    const configured = hasConfiguredCoverageRoots(input.coverage);
    if (configured && input.declaredPathPresent !== false)
        return [];
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
