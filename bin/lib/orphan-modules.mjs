/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/orphanModules.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/orphan-modules.mjs). Zero Node I/O.
 */

const ARK_ORPHAN_MODULES_SCHEMA_VERSION = '1.0';
/** Listed files per tier (agent-legible). The totals always carry the full count. */
export const ORPHAN_LIST_CAP = 20;
/** List cut when entry points were not recognised (ADR 0037 risk). */
export const ORPHAN_UNRECOGNISED_LIST_CAP = 5;
/** Share of governed files listed above which unrecognised entry points are assumed. */
const UNRECOGNISED_SHARE = 0.25;
/** A tiny tree with a few listed files is readable as is. */
const UNRECOGNISED_MIN_FILES = 5;
const TEST_ONLY_SAMPLE = 5;
export const ORPHAN_MODULE_NEXT = 'Delete it through the write gate, or add it to .ark/entry-points.json if a framework loads it.';
export const UNUSED_EXPORTS_COMMAND = 'arkgate-check --doctor --all';
const CERTAINTY_ORDER = {
    'no-importer': 0,
    'maybe-unresolved': 1,
    'maybe-dynamic': 2,
};
function byPath(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
/** Last path segment without its extensions (`a/b/foo.test.ts` → `foo`). */
export function moduleStem(rel) {
    const segments = String(rel).replace(/\\/g, '/').split('/');
    const last = segments[segments.length - 1] ?? '';
    const dot = last.indexOf('.');
    return dot > 0 ? last.slice(0, dot) : last;
}
function stemsFor(rel) {
    const stem = moduleStem(rel);
    if (stem !== 'index')
        return [stem];
    const segments = rel.split('/');
    return segments.length > 1 ? [stem, segments[segments.length - 2] ?? stem] : [stem];
}
/** One human line per listed file. Shared by the terminal and the report. */
export function orphanModuleLine(item) {
    if (item.certainty === 'maybe-dynamic') {
        const why = item.evidence[0] ?? 'a dynamic import may load it';
        return `No static import reaches ${item.path}, but ${why}. It may still be loaded.`;
    }
    if (item.certainty === 'maybe-unresolved') {
        return `Nothing imports ${item.path}, but an import that could not be followed has the same name. It may still be used.`;
    }
    return `Nothing imports ${item.path}, and no entry point covers it.`;
}
function unrecognisedFlood(listed, governed, frameworks) {
    return (frameworks.length === 0 &&
        listed >= UNRECOGNISED_MIN_FILES &&
        governed > 0 &&
        listed / governed > UNRECOGNISED_SHARE);
}
/**
 * Tier 1: governed files with zero importers that no entry covers.
 * Test-only and outside-only files are counted, never listed.
 */
export function findOrphanModules(input) {
    const files = [...input.files];
    const count = (index) => Number(input.importerCount[index] ?? 0) || 0;
    let imported = 0;
    let entries = 0;
    const testOnly = [];
    let outsideOnly = 0;
    const listed = [];
    for (let index = 0; index < files.length; index += 1) {
        const path = files[index];
        if (count(index) > 0) {
            imported += 1;
            continue;
        }
        if (input.entries.has(path)) {
            entries += 1;
            continue;
        }
        if ((input.testImporters.get(path) ?? 0) > 0) {
            testOnly.push(path);
            continue;
        }
        if ((input.outsideImporters.get(path) ?? 0) > 0) {
            outsideOnly += 1;
            continue;
        }
        const annotations = [...(input.annotations?.get(path) ?? [])];
        const reach = input.dynamicReach.get(path);
        if (reach) {
            listed.push({
                ruleId: 'ORPHAN_MODULE',
                path,
                certainty: 'maybe-dynamic',
                evidence: [reach, ...annotations],
            });
            continue;
        }
        if (stemsFor(path).some((stem) => input.unresolvedStems.has(stem))) {
            listed.push({
                ruleId: 'ORPHAN_MODULE',
                path,
                certainty: 'maybe-unresolved',
                evidence: ['an import that could not be followed has the same name', ...annotations],
            });
            continue;
        }
        listed.push({
            ruleId: 'ORPHAN_MODULE',
            path,
            certainty: 'no-importer',
            evidence: ['no governed file, test or project script imports it', ...annotations],
        });
    }
    listed.sort((left, right) => CERTAINTY_ORDER[left.certainty] - CERTAINTY_ORDER[right.certainty] || byPath(left.path, right.path));
    testOnly.sort(byPath);
    const maybeDynamic = listed.filter((item) => item.certainty === 'maybe-dynamic').length;
    const maybeUnresolved = listed.filter((item) => item.certainty === 'maybe-unresolved').length;
    const honesty = [...input.partialReasons];
    const flood = unrecognisedFlood(listed.length, files.length, input.frameworks);
    if (flood) {
        honesty.unshift(`${listed.length} of ${files.length} governed files have no importer and no framework was recognised. Entry points were probably not recognised, so the list may be wrong.`);
    }
    const partial = honesty.length > 0 || maybeDynamic > 0 || maybeUnresolved > 0;
    const cap = flood ? ORPHAN_UNRECOGNISED_LIST_CAP : ORPHAN_LIST_CAP;
    const shown = listed.slice(0, cap);
    const headline = listed.length === 0
        ? partial
            ? 'No file without an importer was found, but some imports could not be followed.'
            : 'Every governed file has an importer or an entry point.'
        : flood
            ? 'Entry points not recognised. The list of files nothing imports may be wrong.'
            : `${listed.length} governed file${listed.length === 1 ? '' : 's'} nothing imports.`;
    return {
        schemaVersion: ARK_ORPHAN_MODULES_SCHEMA_VERSION,
        advisory: true,
        notAScore: true,
        status: partial ? 'partial' : 'complete',
        headline,
        orphans: shown,
        truncated: listed.length - shown.length,
        testOnly: { count: testOnly.length, sample: testOnly.slice(0, TEST_ONLY_SAMPLE) },
        totals: {
            governed: files.length,
            entries,
            imported,
            testOnly: testOnly.length,
            outsideOnly,
            listed: listed.length,
            maybeDynamic,
            maybeUnresolved,
        },
        entryEvidence: {
            bySource: sortedRecord(input.entryEvidence.bySource),
            unmapped: input.entryEvidence.unmapped,
        },
        frameworks: [...input.frameworks].sort(byPath),
        honesty: [...honesty, ...(input.notes ?? [])],
        ...(listed.length > 0 ? { next: ORPHAN_MODULE_NEXT } : {}),
    };
}
function sortedRecord(record) {
    const out = {};
    for (const key of Object.keys(record).sort(byPath))
        out[key] = record[key];
    return out;
}
/** Doctor without an importer index (no TypeScript, or a caller without facts). */
export function unavailableOrphanModules(reason) {
    return {
        schemaVersion: ARK_ORPHAN_MODULES_SCHEMA_VERSION,
        advisory: true,
        notAScore: true,
        status: 'unavailable',
        headline: 'Files nothing imports were not checked.',
        orphans: [],
        truncated: 0,
        testOnly: { count: 0, sample: [] },
        totals: {
            governed: 0,
            entries: 0,
            imported: 0,
            testOnly: 0,
            outsideOnly: 0,
            listed: 0,
            maybeDynamic: 0,
            maybeUnresolved: 0,
        },
        entryEvidence: { bySource: {}, unmapped: 0 },
        frameworks: [],
        honesty: [reason],
    };
}
/** Tier 2 in the compact view: named, not run. */
export function deferredUnusedExports() {
    return {
        schemaVersion: ARK_ORPHAN_MODULES_SCHEMA_VERSION,
        notAScore: true,
        status: 'deferred',
        files: [],
        truncated: 0,
        totals: { filesChecked: 0, filesSkipped: 0, unusedExports: 0 },
        honesty: ['Unused exports are listed in the details view only.'],
        next: UNUSED_EXPORTS_COMMAND,
    };
}
/**
 * Tier 2: exports no governed file or test imports by name.
 * Entry files are exempt. A file with no named use at all is tier 1, not here.
 */
export function findUnusedExports(input) {
    const rows = [];
    let filesChecked = 0;
    let filesSkipped = 0;
    const paths = [...input.exportsByFile.keys()].sort(byPath);
    for (const path of paths) {
        const exported = input.exportsByFile.get(path);
        const used = input.namedUse.get(path);
        if (input.entries.has(path) || used === undefined || used === '*' || exported == null) {
            filesSkipped += 1;
            continue;
        }
        filesChecked += 1;
        const unused = [...new Set(exported)].filter((name) => !used.has(name)).sort(byPath);
        if (unused.length > 0)
            rows.push({ ruleId: 'UNUSED_EXPORT', path, exports: unused });
    }
    const shown = rows.slice(0, ORPHAN_LIST_CAP);
    return {
        schemaVersion: ARK_ORPHAN_MODULES_SCHEMA_VERSION,
        notAScore: true,
        status: input.partialReasons.length > 0 ? 'partial' : 'complete',
        files: shown,
        truncated: rows.length - shown.length,
        totals: {
            filesChecked,
            filesSkipped,
            unusedExports: rows.reduce((sum, row) => sum + row.exports.length, 0),
        },
        honesty: [...input.partialReasons],
    };
}
/** One human line per file with unused exports. */
export function unusedExportLine(row) {
    const names = row.exports.join(', ');
    return `${row.path} exports ${names}, and nothing imports ${row.exports.length === 1 ? 'it' : 'them'} by name.`;
}
