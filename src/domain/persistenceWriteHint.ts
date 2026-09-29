/**
 * Persistence-write evidence shared by ArkRules (`persistenceWrite` file hint) and
 * ArkOrder (`ARKORDER_XI_FIELD_WRITE`). One definition — no lockstep copies.
 *
 * Receiver-bound on purpose (ADR 0013: prefer false negatives): a write token only
 * counts when its receiver chain starts at a persistence client —
 *   - a conventional client name (`db`, `tx`, `client`, `prisma`, `prismaClient`, `drizzle`);
 *   - a client constructed inline (`new PrismaClient().billing.update(`, `drizzle(pool).update(`);
 *   - an identifier bound in this file to a driver constructor
 *     (`const orm = new PrismaClient()`, `private orm = new PrismaClient()`,
 *     `this.orm = new PrismaClient()`, `const sql = postgres(url)`);
 *   - an identifier annotated with a driver client type
 *     (`constructor(private readonly orm: PrismaClient)`, `db: Kysely<DB>`);
 *   - a named import from a local persistence module (`import { orm } from '../infra/orm'`).
 * `repo.update(` / `cache.set(` never count. Other shapes (a client passed through an
 * untyped parameter, an import from an unrecognized module name) stay silent.
 */

/** IO / ORM import evidence. postgres and drizzle-orm include package subpaths. */
export const IO_IMPORT_HINT_RE =
  /\bfrom\s+['"](?:@?prisma\/client|@supabase\/|drizzle-orm(?:\/[^'"]+)?|postgres(?:\/[^'"]+)?|typeorm|knex|mongodb|pg|mysql2|mongoose|better-sqlite3|ioredis|redis|kysely|sequelize)['"]|require\(\s*['"](?:@?prisma\/client|pg|postgres(?:\/[^'"]+)?|drizzle-orm(?:\/[^'"]+)?|knex|typeorm|mongoose)/;

/** Path-alias / local db module (`@/lib/db`) without resolving tsconfig. */
export const IO_ALIAS_IMPORT_RE =
  /\bfrom\s+['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle|orm)(?:\.[cm]?[jt]sx?)?['"]|require\(\s*['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle|orm)/;

/** Named imports from a local persistence module (same module names as IO_ALIAS_IMPORT_RE). */
const LOCAL_CLIENT_IMPORT_RE =
  /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle|orm)(?:\.[cm]?[jt]sx?)?['"]/g;

/** Conventional client identifiers (PrismaClient included via the /i flag). */
export const PERSISTENCE_CLIENT_NAMES = [
  'db',
  'tx',
  'client',
  'prisma',
  'prismaClient',
  'drizzle',
] as const;

const WRITE_VERB_SOURCE =
  '(?:insert(?:One|Many)?|update(?:One|Many)?|upsert|delete(?:One|Many)?|createMany|create|replaceOne|findOneAnd(?:Update|Delete|Replace))';

const SQL_WRITE_SOURCE = '\\bINSERT\\s+INTO\\b|\\bUPDATE\\s+[A-Za-z_][\\w.]*\\s+SET\\b|\\bDELETE\\s+FROM\\b';

/** Call arguments with one level of nested parentheses: `({ log: fn() })`. */
const CALL_ARGS_SOURCE = '\\((?:[^()]|\\([^()]*\\))*\\)';

/** Receivers built inline: `new PrismaClient(...)` / `drizzle(...)`. */
const INLINE_CLIENT_SOURCE = `\\bnew\\s+PrismaClient\\s*${CALL_ARGS_SOURCE}|\\bdrizzle\\s*${CALL_ARGS_SOURCE}`;

/**
 * `const orm = new PrismaClient()` / `private orm = new PrismaClient()` /
 * `this.orm = new PrismaClient()` / `const sql = postgres(url)` / `db = drizzle(pool)`.
 */
const DRIVER_BINDING_RE =
  /(?<![\w$])([A-Za-z_$][\w$]*)\s*[?!]?\s*(?::[^=;\n]+)?=(?![=>])\s*(?:await\s+)?(?:new\s+(?:PrismaClient|Pool|Client|MongoClient|Sequelize|Kysely|Knex)\b|(?:drizzle|knex|Knex|postgres)\s*\()/g;

/** `orm: PrismaClient` / `db: Kysely<DB>` / `tx: Prisma.TransactionClient` — params and fields. */
const DRIVER_ANNOTATION_RE =
  /(?<![\w$])([A-Za-z_$][\w$]*)\s*[?!]?\s*:\s*(?:Readonly\s*<\s*)?(?:Prisma\s*\.\s*TransactionClient|PrismaClient|Pool|PoolClient|MongoClient|Sequelize|Kysely|Knex|DataSource|EntityManager|NodePgDatabase|PostgresJsDatabase|BetterSQLite3Database|MySql2Database|LibSQLDatabase)\b/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sourceImportsPersistenceDriverText(content: string): boolean {
  return IO_IMPORT_HINT_RE.test(content) || IO_ALIAS_IMPORT_RE.test(content);
}

function collectFirstGroup(re: RegExp, content: string, names: Set<string>): void {
  const global = new RegExp(re.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = global.exec(content)) !== null) {
    if (match[1]) names.add(match[1]);
  }
}

/**
 * Identifiers that hold a persistence client in this file (sorted, unique): bound to a
 * driver constructor, annotated with a driver client type, or imported by name from a
 * local persistence module.
 */
export function persistenceClientBindings(content: string): string[] {
  const names = new Set<string>();
  collectFirstGroup(DRIVER_BINDING_RE, content, names);
  collectFirstGroup(DRIVER_ANNOTATION_RE, content, names);
  const imports = new RegExp(LOCAL_CLIENT_IMPORT_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = imports.exec(content)) !== null) {
    for (const element of (match[1] ?? '').split(',')) {
      const parts = element.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
      const local = (parts[1] ?? parts[0] ?? '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(local)) names.add(local);
    }
  }
  return [...names].sort();
}

/** Receiver-bound write evidence (ORM verb on a persistence client, or raw SQL write). */
export function sourceHasPersistenceWrite(content: string): boolean {
  const receivers = [...PERSISTENCE_CLIENT_NAMES, ...persistenceClientBindings(content)]
    .map(escapeRegExp)
    .join('|');
  const re = new RegExp(
    `(?:\\b(?:${receivers})(?![\\w$])|${INLINE_CLIENT_SOURCE})(?:\\s*\\.\\s*[A-Za-z_]\\w*)*\\s*\\.\\s*${WRITE_VERB_SOURCE}\\s*\\(|${SQL_WRITE_SOURCE}`,
    'i'
  );
  return re.test(content);
}
