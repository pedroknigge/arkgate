/**
 * Persistence-write evidence shared by ArkRules (`persistenceWrite` file hint) and
 * ArkOrder (`ARKORDER_XI_FIELD_WRITE`). One definition — no lockstep copies.
 *
 * Receiver-bound on purpose (ADR 0013: prefer false negatives): a write token only
 * counts when its receiver chain starts at a persistence client —
 *   - a conventional client name (`db`, `tx`, `client`, `prisma`, `prismaClient`, `drizzle`);
 *   - a client constructed inline (`new PrismaClient().billing.update(`, `drizzle(pool).update(`);
 *   - an identifier bound in this file to a driver constructor
 *     (`const orm = new PrismaClient()`, `const sql = postgres(url)`).
 * `repo.update(` / `cache.set(` never count.
 */

/** IO / ORM import evidence. postgres and drizzle-orm include package subpaths. */
export const IO_IMPORT_HINT_RE =
  /\bfrom\s+['"](?:@?prisma\/client|@supabase\/|drizzle-orm(?:\/[^'"]+)?|postgres(?:\/[^'"]+)?|typeorm|knex|mongodb|pg|mysql2|mongoose|better-sqlite3|ioredis|redis|kysely|sequelize)['"]|require\(\s*['"](?:@?prisma\/client|pg|postgres(?:\/[^'"]+)?|drizzle-orm(?:\/[^'"]+)?|knex|typeorm|mongoose)/;

/** Path-alias / local db module (`@/lib/db`) without resolving tsconfig. */
export const IO_ALIAS_IMPORT_RE =
  /\bfrom\s+['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle)(?:\.[cm]?[jt]sx?)?['"]|require\(\s*['"](?:@\/|~\/)?(?:[\w.-]+\/)*(?:db|database|prisma|drizzle)/;

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

/** Receivers built inline: `new PrismaClient(...)` / `drizzle(...)`. */
const INLINE_CLIENT_SOURCE = '\\bnew\\s+PrismaClient\\s*\\([^)]*\\)|\\bdrizzle\\s*\\([^)]*\\)';

/** `const orm = new PrismaClient()` / `const sql = postgres(url)` / `const db = drizzle(pool)`. */
const DRIVER_BINDING_RE =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*(?:await\s+)?(?:new\s+(?:PrismaClient|Pool|Client|MongoClient|Sequelize|Kysely|Knex)\b|(?:drizzle|knex|Knex|postgres)\s*\()/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sourceImportsPersistenceDriverText(content: string): boolean {
  return IO_IMPORT_HINT_RE.test(content) || IO_ALIAS_IMPORT_RE.test(content);
}

/** Identifiers bound to a persistence driver constructor in this file (sorted, unique). */
export function persistenceClientBindings(content: string): string[] {
  const names = new Set<string>();
  const re = new RegExp(DRIVER_BINDING_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[1]) names.add(match[1]);
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
