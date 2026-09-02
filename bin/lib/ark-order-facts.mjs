/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkOrderFacts.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-order-facts.mjs). Zero Node I/O.
 */

export const ARKORDER_PLANE_FACTORY = 'createOrderPlane';
export const ARKORDER_FORBIDDEN_METHODS = ['update', 'patch', 'set', 'mutate'];
/** Keep in lockstep with arkRuleSensors (WRITEAGG-001 / EOSF2-001). */
const IO_IMPORT_HINT_RE = /\bfrom\s+['"](?:@?prisma\/client|@supabase\/|drizzle-orm(?:\/[^'"]+)?|postgres(?:\/[^'"]+)?|typeorm|knex|mongodb|pg|mysql2|mongoose|better-sqlite3|ioredis|redis|kysely|sequelize)['"]|require\(\s*['"](?:@?prisma\/client|pg|postgres(?:\/[^'"]+)?|drizzle-orm(?:\/[^'"]+)?|knex|typeorm|mongoose)/;
const IO_ALIAS_IMPORT_RE = /\bfrom\s+['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle)(?:\.[cm]?[jt]sx?)?['"]|require\(\s*['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle)/;
const PERSISTENCE_WRITE_HINT_RE = /\b(?:db|tx|client|prisma(?:Client)?|drizzle)\b(?:\s*\.\s*[A-Za-z_]\w*)*\s*\.\s*(?:insert(?:One|Many)?|update(?:One|Many)?|upsert|delete(?:One|Many)?|createMany|create|replaceOne|findOneAnd(?:Update|Delete|Replace))\s*\(|\bINSERT\s+INTO\b|\bUPDATE\s+[A-Za-z_][\w.]*\s+SET\b|\bDELETE\s+FROM\b/i;
function sourceImportsPersistenceDriver(content) {
    return IO_IMPORT_HINT_RE.test(content) || IO_ALIAS_IMPORT_RE.test(content);
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function isArkOrderModuleSpecifier(specifier) {
    return specifier === 'arkgate/order' || specifier.startsWith('arkgate/order/');
}
function lineAt(content, index) {
    let line = 1;
    for (let i = 0; i < index && i < content.length; i += 1) {
        if (content[i] === '\n')
            line += 1;
    }
    return line;
}
function stripCommentsPreservingLines(content) {
    return content
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, (line) => line.replace(/\/\/.*$/, (c) => ' '.repeat(c.length)));
}
export function extractArkOrderPlaneCallsFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const facts = [];
    const re = /\bcreateOrderPlane\s*(?:<[^>]*>)?\s*\(/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        facts.push({ file, line: lineAt(content, match.index), callee: ARKORDER_PLANE_FACTORY });
    }
    return facts;
}
export function extractArkOrderGenericUpdatesFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const facts = [];
    const re = /\.((?:update|patch|set|mutate))\s*\(/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        const method = match[1];
        const before = source.slice(Math.max(0, match.index - 80), match.index);
        // EOSF5-001: Map/URLSearchParams/React order.set is not ξ mutation.
        const calleeIsOrderPlane = /\b(?:plane|orderPlane)\s*(?:\?|!)?$/.test(before);
        if (!calleeIsOrderPlane && !/\bcreateOrderPlane\b/.test(source)) {
            continue;
        }
        facts.push({ file, line: lineAt(content, match.index), method });
    }
    return facts;
}
/**
 * Direct evidence: persistence driver import + write token + a declared slow key
 * written as a property. Absence of xiKeys is the caller's problem (sensor stays silent).
 */
export function extractArkOrderXiFieldWritesFromSource(file, content, xiKeys) {
    if (xiKeys.length === 0)
        return [];
    const source = stripCommentsPreservingLines(content);
    if (!sourceImportsPersistenceDriver(source) || !PERSISTENCE_WRITE_HINT_RE.test(source))
        return [];
    const facts = [];
    const seen = new Set();
    for (const key of xiKeys) {
        if (!key)
            continue;
        const re = new RegExp(`(?:\\b${escapeRegExp(key)}\\s*:\\s*(?!string\\b|number\\b|boolean\\b|null\\b|[A-Z])|['"]${escapeRegExp(key)}['"]\\s*:|[{\\,]\\s*${escapeRegExp(key)}\\s*[\\,}]|\\.${escapeRegExp(key)}\\s*=)`, 'g');
        let match;
        while ((match = re.exec(source)) !== null) {
            const stamp = `${key}:${match.index}`;
            if (seen.has(stamp))
                continue;
            seen.add(stamp);
            facts.push({ file, line: lineAt(content, match.index), key });
            break;
        }
    }
    return facts;
}
/** ingest() assigned into a release / ξ / current / pattern store. */
export function extractArkOrderIngestWritesXiFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const facts = [];
    const re = /(?:\b(?:xi|release|current|pattern|house)\w*|\.xi)\s*=\s*[^\n;]{0,160}?\bingest\s*\(/gi;
    let match;
    while ((match = re.exec(source)) !== null) {
        facts.push({ file, line: lineAt(content, match.index) });
    }
    return facts;
}
/** Count primitive keys in `.release({ ... })` object literals (no nested ξ). */
export function extractArkOrderReleaseKeyCountsFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const facts = [];
    const re = /\.release\s*\(\s*\{([^}]*)\}/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        const body = match[1] ?? '';
        const keys = body.match(/\b[A-Za-z_][\w]*\s*:/g) ?? [];
        if (keys.length === 0)
            continue;
        facts.push({ file, line: lineAt(content, match.index), keyCount: keys.length });
    }
    return facts;
}
