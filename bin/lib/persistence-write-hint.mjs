/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/persistenceWriteHint.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/persistence-write-hint.mjs). Zero Node I/O.
 */

/** IO / ORM import evidence. postgres and drizzle-orm include package subpaths. */
export const IO_IMPORT_HINT_RE = /\bfrom\s+['"](?:@?prisma\/client|@supabase\/|drizzle-orm(?:\/[^'"]+)?|postgres(?:\/[^'"]+)?|typeorm|knex|mongodb|pg|mysql2|mongoose|better-sqlite3|ioredis|redis|kysely|sequelize)['"]|require\(\s*['"](?:@?prisma\/client|pg|postgres(?:\/[^'"]+)?|drizzle-orm(?:\/[^'"]+)?|knex|typeorm|mongoose)/;
/** Path-alias / local db module (`@/lib/db`) without resolving tsconfig. */
export const IO_ALIAS_IMPORT_RE = /\bfrom\s+['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle|orm)(?:\.[cm]?[jt]sx?)?['"]|require\(\s*['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle|orm)/;
/** Named imports from a local persistence module (same module names as IO_ALIAS_IMPORT_RE). */
const LOCAL_CLIENT_IMPORT_RE = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle|orm)(?:\.[cm]?[jt]sx?)?['"]/g;
/** Conventional client identifiers (PrismaClient included via the /i flag). */
export const PERSISTENCE_CLIENT_NAMES = [
    'db',
    'tx',
    'client',
    'prisma',
    'prismaClient',
    'drizzle',
];
const WRITE_VERB_SOURCE = '(?:insert(?:One|Many)?|update(?:One|Many)?|upsert|delete(?:One|Many)?|createMany|create|replaceOne|findOneAnd(?:Update|Delete|Replace))';
const SQL_WRITE_RE = /\b(?:INSERT\s+INTO|(?<!\b(?:FOR(?:\s+NO\s+KEY)?|DO)\s)UPDATE(?:\s+ONLY)?(?!\s+(?:OF|SET)\b)|DELETE\s+FROM(?:\s+ONLY)?|MERGE\s+INTO|TRUNCATE(?:\s+TABLE)?(?:\s+ONLY)?)\s+(?:(?:(?:"[^"]*"|[A-Za-z_][\w$]*)\s*\.\s*)?(?:"[^"]*"|[A-Za-z_][\w$]*)|\$\{[^}]+\})/i;
const NOT_A_SQL_TAG = /^(?:await|return|throw|yield|new|typeof|void|delete|if|else|case|of|in|instanceof|async|function|class|const|let|var|import|export|from|as|default|type)$/;
const TAGGED_SQL_RE = /(^|[^\w$])([A-Za-z_$][\w$]*)\s*`((?:[^`\\]|\\[\s\S])*)`/g;
const UPSERT_RE = /\bINSERT\s+INTO\b[\s\S]*?\bON\s+CONFLICT\b[\s\S]*?\bDO\s+UPDATE\s+SET\b[^;`]*/gi;
/** Call arguments with one level of nested parentheses: `({ log: fn() })`. */
const CALL_ARGS_SOURCE = '\\((?:[^()]|\\([^()]*\\))*\\)';
/** Receivers built inline: `new PrismaClient(...)` / `drizzle(...)`. */
const INLINE_CLIENT_SOURCE = `\\bnew\\s+PrismaClient\\s*${CALL_ARGS_SOURCE}|\\bdrizzle\\s*${CALL_ARGS_SOURCE}`;
/**
 * `const orm = new PrismaClient()` / `private orm = new PrismaClient()` /
 * `this.orm = new PrismaClient()` / `const sql = postgres(url)` / `db = drizzle(pool)`.
 */
const DRIVER_BINDING_RE = /(?<![\w$])([A-Za-z_$][\w$]*)\s*[?!]?\s*(?::[^=;\n]+)?=(?![=>])\s*(?:await\s+)?(?:new\s+(?:PrismaClient|Pool|Client|MongoClient|Sequelize|Kysely|Knex)\b|(?:drizzle|knex|Knex|postgres)\s*\()/g;
/** `orm: PrismaClient` / `db: Kysely<DB>` / `tx: Prisma.TransactionClient` — params and fields. */
const DRIVER_ANNOTATION_RE = /(?<![\w$])([A-Za-z_$][\w$]*)\s*[?!]?\s*:\s*(?:Readonly\s*<\s*)?(?:Prisma\s*\.\s*TransactionClient|PrismaClient|Pool|PoolClient|MongoClient|Sequelize|Kysely|Knex|DataSource|EntityManager|NodePgDatabase|PostgresJsDatabase|BetterSQLite3Database|MySql2Database|LibSQLDatabase)\b/g;
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function sourceImportsPersistenceDriverText(content) {
    return IO_IMPORT_HINT_RE.test(content) || IO_ALIAS_IMPORT_RE.test(content);
}
function collectFirstGroup(re, content, names) {
    const global = new RegExp(re.source, 'g');
    let match;
    while ((match = global.exec(content)) !== null) {
        if (match[1])
            names.add(match[1]);
    }
}
/**
 * Identifiers that hold a persistence client in this file (sorted, unique): bound to a
 * driver constructor, annotated with a driver client type, or imported by name from a
 * local persistence module.
 */
export function persistenceClientBindings(content) {
    const names = new Set();
    collectFirstGroup(DRIVER_BINDING_RE, content, names);
    collectFirstGroup(DRIVER_ANNOTATION_RE, content, names);
    const imports = new RegExp(LOCAL_CLIENT_IMPORT_RE.source, 'g');
    let match;
    while ((match = imports.exec(content)) !== null) {
        for (const element of (match[1] ?? '').split(',')) {
            const parts = element.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
            const local = (parts[1] ?? parts[0] ?? '').trim();
            if (/^[A-Za-z_$][\w$]*$/.test(local))
                names.add(local);
        }
    }
    return [...names].sort();
}
function blankPersistenceComments(content) {
    return content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:[^`\\]|\\[\s\S])*`|'(?:[^'\\]|\\[\s\S])*'|"(?:[^"\\]|\\[\s\S])*"/g, (token) => token.charCodeAt(0) === 47
        ? token.replace(/[^\n]/g, ' ')
        : token.charCodeAt(0) === 96
            ? token.replace(/--[^\n`]*/g, (comment) => ' '.repeat(comment.length))
            : token);
}
export function sourceHasTaggedSqlWrite(content) {
    const text = blankPersistenceComments(content);
    TAGGED_SQL_RE.lastIndex = 0;
    let match;
    while ((match = TAGGED_SQL_RE.exec(text)) !== null) {
        if (NOT_A_SQL_TAG.test(match[2] ?? ''))
            continue;
        if (SQL_WRITE_RE.test((match[3] ?? '').replace(UPSERT_RE, ' ')))
            return true;
    }
    return false;
}
/** Receiver-bound write evidence (ORM verb on a persistence client, or raw SQL write). */
export function sourceHasPersistenceWrite(content) {
    const text = blankPersistenceComments(content);
    const receivers = [...PERSISTENCE_CLIENT_NAMES, ...persistenceClientBindings(text)]
        .map(escapeRegExp)
        .join('|');
    const re = new RegExp(`(?:\\b(?:${receivers})(?![\\w$])|${INLINE_CLIENT_SOURCE})(?:\\s*\\.\\s*[A-Za-z_]\\w*)*\\s*\\.\\s*${WRITE_VERB_SOURCE}\\s*\\(`, 'i');
    if (re.test(text))
        return true;
    return SQL_WRITE_RE.test(text);
}
