/**
 * ArkOrder resolver-fact extraction (ADR 0029). Syntax only — no verdicts.
 */
export const ARKORDER_PLANE_FACTORY = 'createOrderPlane';

export const ARKORDER_FORBIDDEN_METHODS = ['update', 'patch', 'set', 'mutate'] as const;

export type ResolvedArkOrderPlaneCallFact = {
  file: string;
  line: number;
  callee: string;
};

export type ResolvedArkOrderGenericUpdateFact = {
  file: string;
  line: number;
  method: string;
};

export type ResolvedArkOrderRootHitFact = {
  file: string;
  matchedRoot: string;
  hasPlaneFactory: boolean;
};

export type ResolvedArkOrderXiFieldWriteFact = {
  file: string;
  line: number;
  key: string;
};

export type ResolvedArkOrderIngestWriteFact = {
  file: string;
  line: number;
};

export type ResolvedArkOrderReleaseKeyCountFact = {
  file: string;
  line: number;
  keyCount: number;
};

const IO_IMPORT_HINT_RE =
  /\bfrom\s+['"](?:@?prisma\/client|@supabase\/|drizzle-orm|typeorm|knex|mongodb|pg|mysql2|mongoose|better-sqlite3|ioredis|redis|kysely|sequelize)['"]|require\(\s*['"](?:@?prisma\/client|pg|knex|typeorm|mongoose)/;

const PERSISTENCE_WRITE_HINT_RE =
  /\.(?:insert(?:One|Many)?|update(?:One|Many)?|upsert|delete(?:One|Many)?|createMany|create|replaceOne|findOneAnd(?:Update|Delete|Replace))\s*\(|\bINSERT\s+INTO\b|\bUPDATE\s+[A-Za-z_][\w.]*\s+SET\b|\bDELETE\s+FROM\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isArkOrderModuleSpecifier(specifier: string): boolean {
  return specifier === 'arkgate/order' || specifier.startsWith('arkgate/order/');
}

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) {
    if (content[i] === '\n') line += 1;
  }
  return line;
}

function stripCommentsPreservingLines(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (line) => line.replace(/\/\/.*$/, (c) => ' '.repeat(c.length)));
}

export function extractArkOrderPlaneCallsFromSource(
  file: string,
  content: string
): ResolvedArkOrderPlaneCallFact[] {
  const source = stripCommentsPreservingLines(content);
  const facts: ResolvedArkOrderPlaneCallFact[] = [];
  const re = /\bcreateOrderPlane\s*(?:<[^>]*>)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    facts.push({ file, line: lineAt(content, match.index), callee: ARKORDER_PLANE_FACTORY });
  }
  return facts;
}

export function extractArkOrderGenericUpdatesFromSource(
  file: string,
  content: string
): ResolvedArkOrderGenericUpdateFact[] {
  const source = stripCommentsPreservingLines(content);
  const facts: ResolvedArkOrderGenericUpdateFact[] = [];
  const re = /\.((?:update|patch|set|mutate))\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const method = match[1]!;
    const before = source.slice(Math.max(0, match.index - 80), match.index);
    if (!/\b(?:plane|orderPlane|order)\s*$/.test(before) && !/\bcreateOrderPlane\b/.test(source)) {
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
export function extractArkOrderXiFieldWritesFromSource(
  file: string,
  content: string,
  xiKeys: readonly string[]
): ResolvedArkOrderXiFieldWriteFact[] {
  if (xiKeys.length === 0) return [];
  const source = stripCommentsPreservingLines(content);
  if (!IO_IMPORT_HINT_RE.test(source) || !PERSISTENCE_WRITE_HINT_RE.test(source)) return [];
  const facts: ResolvedArkOrderXiFieldWriteFact[] = [];
  const seen = new Set<string>();
  for (const key of xiKeys) {
    if (!key) continue;
    const re = new RegExp(
      `(?:\\b${escapeRegExp(key)}\\s*:\\s*(?!string\\b|number\\b|boolean\\b|null\\b|[A-Z])|['"]${escapeRegExp(key)}['"]\\s*:|[{\\,]\\s*${escapeRegExp(key)}\\s*[\\,}]|\\.${escapeRegExp(key)}\\s*=)`,
      'g'
    );
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const stamp = `${key}:${match.index}`;
      if (seen.has(stamp)) continue;
      seen.add(stamp);
      facts.push({ file, line: lineAt(content, match.index), key });
      break;
    }
  }
  return facts;
}

/** ingest() assigned into a release / ξ / current / pattern store. */
export function extractArkOrderIngestWritesXiFromSource(
  file: string,
  content: string
): ResolvedArkOrderIngestWriteFact[] {
  const source = stripCommentsPreservingLines(content);
  const facts: ResolvedArkOrderIngestWriteFact[] = [];
  const re =
    /(?:\b(?:xi|release|current|pattern|house)\w*|\.xi)\s*=\s*[^\n;]{0,160}?\bingest\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    facts.push({ file, line: lineAt(content, match.index) });
  }
  return facts;
}

/** Count primitive keys in `.release({ ... })` object literals (no nested ξ). */
export function extractArkOrderReleaseKeyCountsFromSource(
  file: string,
  content: string
): ResolvedArkOrderReleaseKeyCountFact[] {
  const source = stripCommentsPreservingLines(content);
  const facts: ResolvedArkOrderReleaseKeyCountFact[] = [];
  const re = /\.release\s*\(\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const body = match[1] ?? '';
    const keys = body.match(/\b[A-Za-z_][\w]*\s*:/g) ?? [];
    if (keys.length === 0) continue;
    facts.push({ file, line: lineAt(content, match.index), keyCount: keys.length });
  }
  return facts;
}
