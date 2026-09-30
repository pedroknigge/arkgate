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
/**
 * Write head. The table is `[schema.]name` (optionally quoted), or a `${…}`
 * interpolation. What follows (alias, SET, `(`) is not part of the head.
 * `FOR UPDATE` / `DO UPDATE` and a target of `OF` or `SET` are filtered after
 * the match — they are not writes.
 */
const SQL_WRITE_HEAD_SOURCE = '\\b(?:INSERT\\s+INTO|UPDATE(?:\\s+ONLY)?|DELETE\\s+FROM(?:\\s+ONLY)?|MERGE\\s+INTO|TRUNCATE(?:\\s+TABLE)?(?:\\s+ONLY)?)\\s+' +
    '(?:(?:(?:"[^"]*"|[A-Za-z_][\\w$]*)\\s*\\.\\s*)?(?:"[^"]*"|[A-Za-z_][\\w$]*)|\\$\\{[^}]+\\})';
const SQL_HEAD_KEYWORDS = new Set([
    'insert',
    'into',
    'update',
    'only',
    'delete',
    'from',
    'merge',
    'truncate',
    'table',
]);
const SQL_TARGET_NOT_A_TABLE = new Set(['of', 'set']);
/** A tag identifier, not a keyword that happens to sit before an untagged template. */
const TEMPLATE_TAG_KEYWORDS = new Set([
    'await',
    'return',
    'throw',
    'yield',
    'new',
    'typeof',
    'void',
    'delete',
    'if',
    'else',
    'case',
    'of',
    'in',
    'instanceof',
    'async',
    'function',
    'class',
    'const',
    'let',
    'var',
    'import',
    'export',
    'from',
    'as',
    'default',
    'type',
]);
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
/**
 * Blank JS comments, and SQL `--` comments inside template literals, so a
 * docblock that quotes a write is not evidence. Strings and template text stay.
 * Newlines stay, so two lines do not join into one statement.
 */
export function stripPersistenceComments(content) {
    const out = [];
    /** `braces: null` is file-level code. A number is the `{` depth of a `${…}` expression. */
    const stack = [
        { kind: 'code', braces: null },
    ];
    let i = 0;
    while (i < content.length) {
        const frame = stack[stack.length - 1];
        const ch = content[i];
        const next = content[i + 1];
        if (frame.kind === 'tpl') {
            if (ch === '\\') {
                out.push(ch);
                i += 1;
                if (i < content.length) {
                    out.push(content[i]);
                    i += 1;
                }
                continue;
            }
            if (ch === '`') {
                out.push(ch);
                i += 1;
                stack.pop();
                continue;
            }
            if (ch === '$' && next === '{') {
                out.push(ch, next);
                i += 2;
                stack.push({ kind: 'code', braces: 1 });
                continue;
            }
            if (ch === '-' && next === '-') {
                out.push(' ', ' ');
                i += 2;
                while (i < content.length) {
                    const c = content[i];
                    if (c === '\n' || c === '`' || (c === '$' && content[i + 1] === '{'))
                        break;
                    out.push(' ');
                    i += 1;
                }
                continue;
            }
            out.push(ch);
            i += 1;
            continue;
        }
        if (ch === '/' && next === '/') {
            out.push(' ', ' ');
            i += 2;
            while (i < content.length && content[i] !== '\n') {
                out.push(' ');
                i += 1;
            }
            continue;
        }
        if (ch === '/' && next === '*') {
            out.push(' ', ' ');
            i += 2;
            while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) {
                out.push(content[i] === '\n' ? '\n' : ' ');
                i += 1;
            }
            if (i < content.length) {
                out.push(' ', ' ');
                i += 2;
            }
            continue;
        }
        if (ch === "'" || ch === '"') {
            const quote = ch;
            out.push(ch);
            i += 1;
            while (i < content.length) {
                const c = content[i];
                out.push(c);
                i += 1;
                if (c === '\\' && i < content.length) {
                    out.push(content[i]);
                    i += 1;
                    continue;
                }
                if (c === quote)
                    break;
            }
            continue;
        }
        if (frame.braces !== null && ch === '{') {
            frame.braces += 1;
            out.push(ch);
            i += 1;
            continue;
        }
        if (frame.braces !== null && ch === '}') {
            frame.braces -= 1;
            out.push(ch);
            i += 1;
            if (frame.braces === 0)
                stack.pop();
            continue;
        }
        if (ch === '`') {
            out.push(ch);
            i += 1;
            stack.push({ kind: 'tpl' });
            continue;
        }
        out.push(ch);
        i += 1;
    }
    return out.join('');
}
function sqlWriteTarget(matchText) {
    if (/\$\{[^}]+\}\s*$/.test(matchText))
        return null;
    const quoted = [...matchText.matchAll(/"([^"]*)"/g)];
    if (quoted.length > 0)
        return quoted[quoted.length - 1][1] ?? null;
    const idents = matchText.match(/[A-Za-z_][\w$]*/g) ?? [];
    const names = idents.filter((ident) => !SQL_HEAD_KEYWORDS.has(ident.toLowerCase()));
    return names.length > 0 ? names[names.length - 1] : null;
}
/** True when this head is a table write, not `FOR UPDATE`, `DO UPDATE`, or a target of `OF`/`SET`. */
function sqlWriteHeadCounts(text, index, matchText) {
    const before = text.slice(Math.max(0, index - 32), index);
    if (/^UPDATE\b/i.test(matchText) && /\bFOR(?:\s+NO\s+KEY)?\s+$/i.test(before))
        return false;
    if (/^UPDATE\b/i.test(matchText) && /\bDO\s+$/i.test(before))
        return false;
    const target = sqlWriteTarget(matchText);
    if (target && SQL_TARGET_NOT_A_TABLE.has(target.toLowerCase()))
        return false;
    return true;
}
function sqlWriteHeadMatches(text) {
    const re = new RegExp(SQL_WRITE_HEAD_SOURCE, 'gi');
    const hits = [];
    let match;
    while ((match = re.exec(text)) !== null) {
        if (match[0].length === 0) {
            re.lastIndex += 1;
            continue;
        }
        if (sqlWriteHeadCounts(text, match.index, match[0]))
            hits.push(match[0]);
    }
    return hits;
}
/**
 * Drop an `INSERT … ON CONFLICT … DO UPDATE` statement. That conflict clause is
 * not an `UPDATE` write, and the tagged-template path does not treat the upsert
 * itself as evidence. A later write head in the same text still counts.
 */
function withoutUpsertStatements(text) {
    return text.replace(/\bINSERT\s+INTO\b[\s\S]*?\bON\s+CONFLICT\b[\s\S]*?\bDO\s+UPDATE\s+SET\b[^;`]*/gi, ' ');
}
/** Bodies of tagged templates (`tx\`…\``, `sql\`…\``), comments already blanked. */
function taggedTemplateBodies(source) {
    const bodies = [];
    const stack = [
        { kind: 'code', braces: null },
    ];
    let i = 0;
    while (i < source.length) {
        const frame = stack[stack.length - 1];
        const ch = source[i];
        const next = source[i + 1];
        if (frame.kind === 'tpl') {
            if (ch === '\\') {
                const escaped = source[i + 1] ?? '';
                if (frame.body)
                    frame.body.push(ch, escaped);
                i += escaped ? 2 : 1;
                continue;
            }
            if (ch === '`') {
                if (frame.body)
                    bodies.push(frame.body.join(''));
                stack.pop();
                i += 1;
                continue;
            }
            if (ch === '$' && next === '{') {
                if (frame.body)
                    frame.body.push(ch, next);
                i += 2;
                stack.push({ kind: 'code', braces: 1 });
                continue;
            }
            if (frame.body)
                frame.body.push(ch);
            i += 1;
            continue;
        }
        if (ch === "'" || ch === '"') {
            const quote = ch;
            i += 1;
            while (i < source.length) {
                const c = source[i];
                i += 1;
                if (c === '\\' && i < source.length) {
                    i += 1;
                    continue;
                }
                if (c === quote)
                    break;
            }
            continue;
        }
        if (frame.braces !== null && ch === '{') {
            frame.braces += 1;
            i += 1;
            continue;
        }
        if (frame.braces !== null && ch === '}') {
            frame.braces -= 1;
            i += 1;
            if (frame.braces === 0)
                stack.pop();
            continue;
        }
        if (/[A-Za-z_$]/.test(ch)) {
            const start = i;
            i += 1;
            while (i < source.length && /[A-Za-z0-9_$]/.test(source[i]))
                i += 1;
            const ident = source.slice(start, i);
            let j = i;
            while (j < source.length && /\s/.test(source[j]))
                j += 1;
            if (source[j] === '`' && !TEMPLATE_TAG_KEYWORDS.has(ident)) {
                stack.push({ kind: 'tpl', body: [] });
                i = j + 1;
                continue;
            }
            continue;
        }
        if (ch === '`') {
            // Untagged template. Walk it so a `${…}` inside does not confuse the scan.
            i += 1;
            stack.push({ kind: 'tpl', body: null });
            continue;
        }
        i += 1;
    }
    return bodies;
}
/**
 * A SQL write head inside a tagged template. Evidence on its own: the use case
 * composed the statement, whatever type the receiver has. An upsert-only
 * template (`INSERT … ON CONFLICT … DO UPDATE`) is not this signal.
 */
export function sourceHasTaggedSqlWrite(content) {
    const stripped = stripPersistenceComments(content);
    for (const body of taggedTemplateBodies(stripped)) {
        if (sqlWriteHeadMatches(withoutUpsertStatements(body)).length > 0)
            return true;
    }
    return false;
}
/** Receiver-bound write evidence (ORM verb on a persistence client, or raw SQL write). */
export function sourceHasPersistenceWrite(content) {
    const text = stripPersistenceComments(content);
    const receivers = [...PERSISTENCE_CLIENT_NAMES, ...persistenceClientBindings(text)]
        .map(escapeRegExp)
        .join('|');
    const re = new RegExp(`(?:\\b(?:${receivers})(?![\\w$])|${INLINE_CLIENT_SOURCE})(?:\\s*\\.\\s*[A-Za-z_]\\w*)*\\s*\\.\\s*${WRITE_VERB_SOURCE}\\s*\\(`, 'i');
    if (re.test(text))
        return true;
    return sqlWriteHeadMatches(text).length > 0;
}
