/**
 * ArkOrder resolver-fact extraction (ADR 0029). Syntax only — no verdicts.
 */
import type { ResolvedDependencyFact } from './resolvedCandidateFactsTypes';
import { XI_TTL_KEY_RE } from './arkOrderTypes';
import { globToRegExp } from './layerMatch';
import { sourceHasPersistenceWrite, sourceImportsPersistenceDriverText } from './persistenceWriteHint';
import {
  tsAstNodeLine,
  tsAstPropertyKeyName,
  unwrapTsAstExpression,
  type TsAstArrayLiteralExpression,
  type TsAstLike,
  type TsAstNode,
  type TsAstObjectLiteralExpression,
  type TsAstSourceFile,
} from './sourcePolicy';

const ARKORDER_PLANE_FACTORY = 'createOrderPlane';

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
  incomplete?: boolean;
};

/** Optional TypeScript compiler API host for AST-backed fact extraction. */
export type ArkOrderAstOptions = {
  ts?: TsAstLike | null;
  sourceFile?: TsAstSourceFile | null;
};

/** A freshness key (ttl/freshUntil/maxAge) inside the ξ literal of plane.release / proposeRelease. */
export type ResolvedArkOrderXiTtlFact = {
  file: string;
  line: number;
  key: string;
};

/** A literal `allowedKinds` entry that a literal `informationBudget.cannotObserve` denies. */
export type ResolvedArkOrderBudgetLeakFact = {
  file: string;
  line: number;
  kind: string;
};

/** XIWRITE-001 `appliesTo` globs use the layer-glob engine (`globToRegExp`). */
export function arkOrderGlobToRegExp(pattern: string): RegExp {
  return globToRegExp(pattern);
}

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

/**
 * Specifiers naming `arkgate/order` in one source text (static import / export-from,
 * `require()`, `import()`). Editor-path twin of the resolved dependency facts the
 * kernel-in-domain sensor reads in CI — syntax only, no layer verdict here.
 */
export function extractArkOrderModuleImportsFromSource(
  file: string,
  content: string
): ResolvedDependencyFact[] {
  const source = stripCommentsPreservingLines(content);
  const out: ResolvedDependencyFact[] = [];
  const fromRe = /\b(import|export)(\s+type)?\s+(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = fromRe.exec(source)) !== null) {
    const specifier = match[3] ?? '';
    if (!isArkOrderModuleSpecifier(specifier)) continue;
    out.push({
      from: file,
      specifier,
      kind: match[1] === 'export' ? 'export' : 'import',
      typeOnly: Boolean(match[2]),
      line: lineAt(content, match.index),
      resolution: 'resolved-external',
    });
  }
  const callRe = /\b(require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = callRe.exec(source)) !== null) {
    const specifier = match[2] ?? '';
    if (!isArkOrderModuleSpecifier(specifier)) continue;
    out.push({
      from: file,
      specifier,
      kind: match[1] === 'import' ? 'dynamic-import' : 'require',
      typeOnly: false,
      line: lineAt(content, match.index),
      resolution: 'resolved-external',
    });
  }
  return out;
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

const PLANE_BINDING_RE =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*createOrderPlane\s*(?:<[^>]*>)?\s*\(/g;

/**
 * Conventional plane names: `plane`, `orderPlane`, `billingPlane`, … (not the factory).
 * A name alone is never evidence (`clipPlane.set`, `controlPlane.update` are not ArkOrder):
 * it counts only in a file that imports `arkgate/order`, or on a named import from a
 * declared `planeRoots` module.
 */
const CONVENTIONAL_PLANE_NAME_RE = /^(?:plane|[A-Za-z_$][\w$]*Plane)$/;

/** `plane: OrderPlane` — parameters, fields, and variables annotated with the plane type. */
const ORDER_PLANE_ANNOTATION_RE =
  /\b([A-Za-z_$][\w$]*)\s*[?!]?\s*:\s*(?:Readonly\s*<\s*)?OrderPlane\b/g;

const ARKORDER_IMPORT_RE =
  /\bfrom\s+['"]arkgate\/order(?:\/[^'"]*)?['"]|\brequire\s*\(\s*['"]arkgate\/order(?:\/[^'"]*)?['"]|\bimport\s*\(\s*['"]arkgate\/order(?:\/[^'"]*)?['"]/;

const NAMED_IMPORT_RE = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

const RELATIVE_EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/** Receiver-resolution context for the plane-bound extractors. */
export type ArkOrderPlaneReceiverOptions = ArkOrderAstOptions & {
  /** Declared `arkOrder.planeRoots` globs; a named import from one resolves to a plane. */
  planeRoots?: readonly string[];
};

/** Trailing identifier, allowing a non-null `!` and optional-chain `?` before the dot. */
const TRAILING_IDENTIFIER_RE = /([A-Za-z_$][\w$]*)\s*!?\s*\??\s*$/;

/** Leading identifier inside a parenthesized receiver: `x as T`, `<T>x`, `x!`, `x`. */
const WRAPPED_IDENTIFIER_RE =
  /^\s*(?:<[^<>]*>\s*)?([A-Za-z_$][\w$]*)\s*!?\s*(?:\b(?:as|satisfies)\b[\s\S]*)?$/;

/** Identifiers bound to `createOrderPlane(...)` in this file. */
function arkOrderPlaneBindings(content: string): string[] {
  const source = stripCommentsPreservingLines(content);
  const names = new Set<string>();
  const re = new RegExp(PLANE_BINDING_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    if (match[1]) names.add(match[1]);
  }
  return [...names].sort();
}

function normalizeRelativePath(parts: readonly string[]): string {
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return '';
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

/** Project-relative candidates for a relative specifier (lexical; no tsconfig paths). */
function relativeModuleCandidates(file: string, specifier: string): string[] {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return [];
  const dir = file.replace(/\\/g, '/').split('/').slice(0, -1);
  const base = normalizeRelativePath([...dir, ...specifier.split('/')]);
  if (!base) return [];
  const stem = base.replace(/\.(?:[cm]?js|jsx)$/, '');
  const out = new Set<string>();
  for (const root of [base, stem]) {
    for (const ext of RELATIVE_EXTENSIONS) out.add(`${root}${ext}`);
    for (const ext of RELATIVE_EXTENSIONS.slice(1)) out.add(`${root}/index${ext}`);
  }
  return [...out];
}

function specifierResolvesToPlaneRoot(
  file: string,
  specifier: string,
  planeRoots: readonly string[]
): boolean {
  const candidates = relativeModuleCandidates(file, specifier);
  if (candidates.length === 0) return false;
  return planeRoots.some((pattern) => {
    let re: RegExp;
    try {
      re = arkOrderGlobToRegExp(pattern);
    } catch {
      return false;
    }
    return candidates.some((candidate) => re.test(candidate));
  });
}

/**
 * Identifiers that name an order plane in this file, from direct evidence only:
 * bound to `createOrderPlane(...)`, annotated `: OrderPlane`, or a `plane` / `*Plane`
 * named import from a declared plane root. `isArkOrderFile` reports an `arkgate/order`
 * import, which admits the conventional names file-wide.
 */
function arkOrderPlaneReceivers(
  file: string,
  content: string,
  options: ArkOrderPlaneReceiverOptions = {}
): { names: string[]; isArkOrderFile: boolean } {
  const source = stripCommentsPreservingLines(content);
  const names = new Set(arkOrderPlaneBindings(content));
  const annotated = new RegExp(ORDER_PLANE_ANNOTATION_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = annotated.exec(source)) !== null) {
    if (match[1]) names.add(match[1]);
  }
  const planeRoots = options.planeRoots ?? [];
  if (planeRoots.length > 0) {
    const imports = new RegExp(NAMED_IMPORT_RE.source, 'g');
    while ((match = imports.exec(source)) !== null) {
      if (!specifierResolvesToPlaneRoot(file, match[2] ?? '', planeRoots)) continue;
      for (const element of (match[1] ?? '').split(',')) {
        const parts = element
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/);
        const imported = parts[0]?.trim() ?? '';
        const local = (parts[1] ?? parts[0] ?? '').trim();
        if (!local || !/^[A-Za-z_$][\w$]*$/.test(local)) continue;
        if (CONVENTIONAL_PLANE_NAME_RE.test(imported) || CONVENTIONAL_PLANE_NAME_RE.test(local)) {
          names.add(local);
        }
      }
    }
  }
  names.delete(ARKORDER_PLANE_FACTORY);
  return { names: [...names].sort(), isArkOrderFile: ARKORDER_IMPORT_RE.test(source) };
}

const KEYWORDS_BEFORE_PAREN = new Set([
  'return', 'await', 'void', 'typeof', 'yield', 'in', 'of', 'case', 'else', 'do', 'throw', 'delete',
]);

/** True when `(` at this point opens call arguments (`f(x).update(`), not a wrapper. */
function isCallBefore(prefix: string): boolean {
  const tail = prefix.replace(/\s+$/, '');
  if (/[)\]]$/.test(tail)) return true;
  const word = /([A-Za-z_$][\w$]*)$/.exec(tail);
  return word !== null && !KEYWORDS_BEFORE_PAREN.has(word[1]!);
}

/**
 * Receiver identifier right before a `.method(` — unwraps `?.`, `!`, and one balanced
 * `( x as T )` / `( x satisfies T )` / `(<T>x)` / `(x)` wrapper (T may itself contain
 * parentheses). `this.plane` yields `plane`.
 */
function receiverBefore(before: string): string | null {
  const trimmed = before.replace(/\s*!?\s*\??\s*$/, '');
  if (!trimmed.endsWith(')')) {
    const match = TRAILING_IDENTIFIER_RE.exec(trimmed);
    return match ? match[1] ?? null : null;
  }
  let depth = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const ch = trimmed[index];
    if (ch === ')') depth += 1;
    else if (ch === '(') {
      depth -= 1;
      if (depth === 0) {
        if (isCallBefore(trimmed.slice(0, index))) return null;
        const inner = trimmed.slice(index + 1, trimmed.length - 1);
        const match = WRAPPED_IDENTIFIER_RE.exec(inner);
        return match ? match[1] ?? null : null;
      }
    }
  }
  return null;
}

type PlaneReceiverContext = { names: ReadonlySet<string>; isArkOrderFile: boolean };

function planeReceiverContext(
  file: string,
  content: string,
  options: ArkOrderPlaneReceiverOptions
): PlaneReceiverContext {
  const resolved = arkOrderPlaneReceivers(file, content, options);
  return { names: new Set(resolved.names), isArkOrderFile: resolved.isArkOrderFile };
}

function isPlaneReceiver(name: string | null, context: PlaneReceiverContext): boolean {
  if (!name || name === ARKORDER_PLANE_FACTORY) return false;
  if (context.names.has(name)) return true;
  return context.isArkOrderFile && CONVENTIONAL_PLANE_NAME_RE.test(name);
}

/**
 * Direct evidence only: `.update|patch|set|mutate(` whose receiver is a plane (see
 * arkOrderPlaneReceivers). EOSF5-001: Map / URLSearchParams / React `order.set` /
 * `prisma.x.update` are not ξ mutation, even inside the plane-root file; nor is
 * `clipPlane.set` / `controlPlane.update` in a file with no ArkOrder evidence.
 */
export function extractArkOrderGenericUpdatesFromSource(
  file: string,
  content: string,
  options: ArkOrderPlaneReceiverOptions = {}
): ResolvedArkOrderGenericUpdateFact[] {
  const source = stripCommentsPreservingLines(content);
  const context = planeReceiverContext(file, content, options);
  const facts: ResolvedArkOrderGenericUpdateFact[] = [];
  const re = /\.((?:update|patch|set|mutate))\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const method = match[1]!;
    const before = source.slice(Math.max(0, match.index - 160), match.index);
    if (!isPlaneReceiver(receiverBefore(before), context)) continue;
    facts.push({ file, line: lineAt(content, match.index), method });
  }
  return facts;
}

/**
 * Mechanical snake_case / camelCase equivalents of a declared slow key (4.9.4 field
 * feedback): a Drizzle / Prisma client writes the SQL column `seat_holder_person_id`
 * as `seatHolderPersonId`, and the reverse for a camelCase declared key in raw SQL.
 */
function xiKeyAliases(key: string): string[] {
  const camel = key.replace(/[_-]+([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
  const snake = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
  return [...new Set([key, camel, snake].filter(Boolean))];
}

/**
 * Direct evidence, scoped to real write sites: an object literal passed to an ORM write
 * method (`.set|.values|.update|.create|.upsert|.insert` — including its `data:` payload
 * for Prisma), a mutating `entity.key =` / `this.key =` assignment, or a SQL write column
 * (`INSERT INTO … (<key>)`, `UPDATE … SET <key> =`). Type annotations, `SELECT`
 * projections, `Map.set(k, {key})` read-mappers, and repo `return { key: record.key }`
 * mappers are never evidence (4.9.4 field feedback: 3/3 false positives in a real repo).
 * The declared key matches its snake_case ↔ camelCase aliases.
 */
export function extractArkOrderXiFieldWritesFromSource(
  file: string,
  content: string,
  xiKeys: readonly string[],
  options: ArkOrderAstOptions = {}
): ResolvedArkOrderXiFieldWriteFact[] {
  if (xiKeys.length === 0) return [];
  const source = stripCommentsPreservingLines(content);
  if (!sourceImportsPersistenceDriverText(source) || !sourceHasPersistenceWrite(source)) return [];
  const aliasToDeclared = new Map<string, string>();
  for (const key of xiKeys) {
    if (!key) continue;
    for (const alias of xiKeyAliases(key)) aliasToDeclared.set(alias, key);
  }
  if (aliasToDeclared.size === 0) return [];
  const facts: ResolvedArkOrderXiFieldWriteFact[] = [];
  const seen = new Set<string>();
  const record = (declared: string, line: number): void => {
    const stamp = `${declared}:${line}`;
    if (seen.has(stamp)) return;
    seen.add(stamp);
    facts.push({ file, line, key: declared });
  };
  const ast = parseArkOrderAst(file, content, options);
  if (ast) {
    const { ts, sourceFile } = ast;
    walkAstWithScope(ts, sourceFile, new Map(), (node, scope) => {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        const callee = node.expression;
        const methodName = ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
        if (!methodName || !ORM_WRITE_METHOD_SET.has(methodName)) return;
        const line = tsAstNodeLine(sourceFile, node);
        const literal = resolveObjectLiteral(ts, node.arguments[0]!, scope);
        if (!literal) return;
        for (const key of collectObjectLiteralKeys(ts, literal, scope)) {
          const declared = aliasToDeclared.get(key);
          if (declared) record(declared, line);
        }
        // Prisma writes the payload under `data:`: `{ where, data: { <xiKey> } }`.
        const dataValue = objectPropertyValue(ts, literal, 'data');
        const dataLiteral = dataValue ? resolveObjectLiteral(ts, dataValue, scope) : null;
        if (dataLiteral && dataLiteral !== literal) {
          for (const key of collectObjectLiteralKeys(ts, dataLiteral, scope)) {
            const declared = aliasToDeclared.get(key);
            if (declared) record(declared, line);
          }
        }
        return;
      }
      if (ts.isBinaryExpression(node)) {
        const operator = node.operatorToken?.kind;
        if (operator !== ts.SyntaxKind.EqualsToken) return;
        const left = node.left;
        if (!ts.isPropertyAccessExpression(left)) return;
        const receiver = unwrapTsAstExpression(ts, left.expression);
        const entityish =
          ts.isIdentifier(receiver) ||
          receiver.kind === ts.SyntaxKind.ThisKeyword ||
          (ts.isPropertyAccessExpression(receiver) && ts.isIdentifier(receiver.expression));
        if (!entityish) return;
        const declared = aliasToDeclared.get(left.name.text);
        if (declared) record(declared, tsAstNodeLine(sourceFile, node));
      }
    });
  } else {
    // Lexical fallback (no TS host): the documented provisional path. The value head is
    // tested in code instead of a lookbehind, so `role: Role | null` no longer backtracks
    // the `\s*` into a false positive, while quoted / numeric values still count — one
    // fact per declared key, like before.
    const recordedDeclared = new Set<string>();
    for (const [alias, declared] of aliasToDeclared) {
      if (recordedDeclared.has(declared)) continue;
      const escaped = escapeRegExp(alias);
      const re = new RegExp(
        `(?:\\b${escaped}\\s*:\\s*([A-Za-z_$][\\w$]*|'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|\\d[\\w.]*)|['"]${escaped}['"]\\s*:|[{,]\\s*${escaped}\\s*[,}]|\\.${escaped}\\s*=)`,
        'g'
      );
      let match: RegExpExecArray | null;
      while ((match = re.exec(source)) !== null) {
        const valueHead = match[1];
        if (valueHead && !/^['"]/.test(valueHead) && !/^\d/.test(valueHead)) {
          // Identifier head: an annotation or a primitive keyword is not a value write.
          const head = valueHead.toLowerCase();
          if (
            head === 'string' ||
            head === 'number' ||
            head === 'boolean' ||
            head === 'null' ||
            head === 'undefined'
          ) {
            continue;
          }
          if (/^[A-Z]/.test(valueHead)) continue; // type reference — documented false-negative trade-off
        }
        recordedDeclared.add(declared);
        record(declared, lineAt(content, match.index));
        break;
      }
    }
  }
  collectSqlWriteColumnFacts(source, aliasToDeclared, record);
  return facts;
}

const ORM_WRITE_METHOD_SET = new Set(['set', 'values', 'update', 'create', 'upsert', 'insert']);

const SQL_INSERT_COLUMNS_RE = /\binsert\s+into\s+[\w."'\[\]]+\s*\(([^)]+)\)/gi;
const SQL_UPDATE_SET_RE =
  /\bupdate\s+[\w."'\[\]]+\s+set\s+([^;]{0,400}?)(?:;|\n\s*\n|\bwhere\b|\breturning\b|$)/gi;
const SQL_SET_COLUMN_RE = /(?:^|[(,\s])(["'`]?)([A-Za-z_][\w$]*)\1\s*=/g;

/**
 * SQL write evidence for the raw-SQL path: only INSERT column lists and UPDATE SET
 * left-hand sides — never SELECT, never a type annotation. Runs beside the AST facts;
 * the same declared key dedupes by line.
 */
function collectSqlWriteColumnFacts(
  source: string,
  aliasToDeclared: ReadonlyMap<string, string>,
  record: (declared: string, line: number) => void
): void {
  let match: RegExpExecArray | null;
  SQL_INSERT_COLUMNS_RE.lastIndex = 0;
  while ((match = SQL_INSERT_COLUMNS_RE.exec(source)) !== null) {
    const line = lineAt(source, match.index);
    for (const column of String(match[1] ?? '').split(',')) {
      const declared = aliasToDeclared.get(column.trim().replace(/["'`[\]]/g, ''));
      if (declared) record(declared, line);
    }
  }
  SQL_UPDATE_SET_RE.lastIndex = 0;
  while ((match = SQL_UPDATE_SET_RE.exec(source)) !== null) {
    const line = lineAt(source, match.index);
    const setClause = String(match[1] ?? '');
    let columnMatch: RegExpExecArray | null;
    SQL_SET_COLUMN_RE.lastIndex = 0;
    while ((columnMatch = SQL_SET_COLUMN_RE.exec(setClause)) !== null) {
      const declared = aliasToDeclared.get(columnMatch[2] ?? '');
      if (declared) record(declared, line);
    }
  }
}

/**
 * Holder names that read as a Release or ξ store: whole-word `xi` / `release` /
 * `pattern` / `house` / `current`; an `xi` camelCase head (`xiNext`, `xiState`); or a
 * `…Xi` / `…Release` / `…Pattern` camelCase tail (`nextXi`, `currentRelease`).
 * Trade-off (ADR 0013, prefer false negatives): names that only *start* with
 * release/current/pattern (`releaseState`, `currentResidual`, `patternResult`,
 * `releaseDate`) are not evidence, so `this.releaseState = plane.ingest(e)` stays silent.
 */
const INGEST_XI_HOLDER_SOURCE =
  '(?:xi(?:[A-Z][\\w$]*)?|release|pattern|house|current|[A-Za-z_$][\\w$]*?(?:Xi|Release|Pattern))(?![\\w$])';

/**
 * ingest() assigned into a Release / ξ holder (INGEST_XI_HOLDER_SOURCE), as a binding
 * or a property write such as `store.xi =` / `release.xi[k] =` / `this.nextXi =`.
 * Comparisons (`===`) and arrows (`=>`) are not evidence.
 */
export function extractArkOrderIngestWritesXiFromSource(
  file: string,
  content: string
): ResolvedArkOrderIngestWriteFact[] {
  const source = stripCommentsPreservingLines(content);
  const facts: ResolvedArkOrderIngestWriteFact[] = [];
  const re = new RegExp(
    `(?:(?<![\\w$])|\\.)${INGEST_XI_HOLDER_SOURCE}(?:\\s*:\\s*[A-Za-z_$][\\w$.<>, |[\\]]*?)?\\s*(?:\\[[^\\]\\n]*\\])?\\s*=(?![=>])\\s*[^\\n;]{0,160}?\\bingest\\s*\\(`,
    'g'
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    facts.push({ file, line: lineAt(content, match.index) });
  }
  return facts;
}

type AstScope = ReadonlyMap<string, TsAstNode>;

function parseArkOrderAst(
  file: string,
  content: string,
  options?: ArkOrderAstOptions
): { ts: TsAstLike; sourceFile: TsAstSourceFile } | null {
  const ts = options?.ts;
  if (!ts || typeof ts.createSourceFile !== 'function') return null;
  const sourceFile =
    options.sourceFile ?? ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  return { ts, sourceFile };
}

function collectBlockConstScope(
  ts: TsAstLike,
  container: TsAstNode,
  parentScope: AstScope
): AstScope {
  let next: Map<string, TsAstNode> | null = null;
  const bind = (name: string, target: TsAstNode) => {
    if (!next) next = new Map(parentScope);
    next.set(name, target);
  };
  ts.forEachChild(container, (child) => {
    if (ts.isVariableStatement(child)) {
      const isConst = (child.declarationList.flags & ts.NodeFlags.Const) !== 0;
      if (!isConst) return;
      for (const decl of child.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          bind(decl.name.text, decl.initializer);
        }
      }
      return;
    }
    if (ts.isFunctionDeclaration(child) && child.name && child.body) {
      bind(child.name.text, child);
    }
  });
  return next ?? parentScope;
}

function walkAstWithScope(
  ts: TsAstLike,
  node: TsAstNode,
  scope: AstScope,
  visitor: (current: TsAstNode, activeScope: AstScope) => void
): void {
  const activeScope = collectBlockConstScope(ts, node, scope);
  visitor(node, activeScope);
  ts.forEachChild(node, (child) => {
    walkAstWithScope(ts, child, activeScope, visitor);
  });
}

function resolveAstTarget(
  ts: TsAstLike,
  node: TsAstNode,
  scope: AstScope,
  visited = new Set<string>()
): TsAstNode {
  const expr = unwrapTsAstExpression(ts, node);
  if (ts.isIdentifier(expr)) {
    if (visited.has(expr.text)) return expr;
    const bound = scope.get(expr.text);
    if (!bound) return expr;
    const nextVisited = new Set(visited);
    nextVisited.add(expr.text);
    return resolveAstTarget(ts, bound, scope, nextVisited);
  }
  return expr;
}

function resolveObjectLiteral(
  ts: TsAstLike,
  node: TsAstNode,
  scope: AstScope
): TsAstObjectLiteralExpression | null {
  const resolved = resolveAstTarget(ts, node, scope);
  return ts.isObjectLiteralExpression(resolved) ? resolved : null;
}

function resolveArrayLiteral(
  ts: TsAstLike,
  node: TsAstNode,
  scope: AstScope
): TsAstArrayLiteralExpression | null {
  const resolved = resolveAstTarget(ts, node, scope);
  return ts.isArrayLiteralExpression(resolved) ? resolved : null;
}

function astReceiverIdentifier(ts: TsAstLike, expr: TsAstNode): string | null {
  const unwrapped = unwrapTsAstExpression(ts, expr);
  if (ts.isIdentifier(unwrapped)) return unwrapped.text;
  if (ts.isPropertyAccessExpression(unwrapped)) return unwrapped.name.text;
  return null;
}

function objectPropertyValue(
  ts: TsAstLike,
  obj: TsAstObjectLiteralExpression,
  targetKey: string
): TsAstNode | null {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      if (tsAstPropertyKeyName(ts, prop.name) === targetKey) return prop.initializer;
      continue;
    }
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === targetKey) {
      return prop.name;
    }
  }
  return null;
}

function collectObjectLiteralKeys(
  ts: TsAstLike,
  obj: TsAstObjectLiteralExpression,
  scope: AstScope,
  visited = new Set<TsAstNode>()
): string[] {
  if (visited.has(obj)) return [];
  visited.add(obj);
  const keys: string[] = [];
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const name = tsAstPropertyKeyName(ts, prop.name);
      if (name) keys.push(name);
      continue;
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      keys.push(prop.name.text);
      continue;
    }
    if (ts.isSpreadAssignment(prop)) {
      const spreadObj = resolveObjectLiteral(ts, prop.expression, scope);
      if (spreadObj) {
        keys.push(...collectObjectLiteralKeys(ts, spreadObj, scope, visited));
      }
    }
  }
  return keys;
}

function collectObjectLiteralKeysDetailed(
  ts: TsAstLike,
  obj: TsAstObjectLiteralExpression,
  scope: AstScope,
  visited = new Set<TsAstNode>()
): { keys: string[]; incomplete: boolean } {
  if (visited.has(obj)) return { keys: [], incomplete: false };
  visited.add(obj);
  const keys = new Set<string>();
  let incomplete = false;
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const name = tsAstPropertyKeyName(ts, prop.name);
      if (name) keys.add(name);
      else incomplete = true;
      continue;
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      keys.add(prop.name.text);
      continue;
    }
    if (ts.isSpreadAssignment(prop)) {
      const spreadObj = resolveObjectLiteral(ts, prop.expression, scope);
      if (!spreadObj) {
        incomplete = true;
        continue;
      }
      const nested = collectObjectLiteralKeysDetailed(ts, spreadObj, scope, visited);
      for (const key of nested.keys) keys.add(key);
      if (nested.incomplete) incomplete = true;
      continue;
    }
    incomplete = true;
  }
  return { keys: [...keys], incomplete };
}

function extractArrayStringLiterals(
  ts: TsAstLike,
  node: TsAstNode,
  scope: AstScope,
  visited = new Set<TsAstNode>()
): string[] {
  const arr = resolveArrayLiteral(ts, node, scope);
  if (!arr || visited.has(arr)) return [];
  visited.add(arr);
  const out: string[] = [];
  for (const element of arr.elements) {
    if (ts.isSpreadElement(element)) {
      out.push(...extractArrayStringLiterals(ts, element.expression, scope, visited));
      continue;
    }
    const resolved = resolveAstTarget(ts, element, scope);
    if (ts.isStringLiteral(resolved) || ts.isNoSubstitutionTemplateLiteral(resolved)) {
      if (resolved.text) out.push(resolved.text);
    }
  }
  return out;
}

function walkReleaseCallsAst(
  ts: TsAstLike,
  sourceFile: TsAstSourceFile,
  onRelease: (entry: {
    call: TsAstNode;
    receiverExpr: TsAstNode;
    xiObj: TsAstObjectLiteralExpression;
    scope: AstScope;
  }) => void
): void {
  walkAstWithScope(ts, sourceFile, new Map(), (node, scope) => {
    if (!ts.isCallExpression(node) || node.arguments.length === 0) return;
    if (!ts.isPropertyAccessExpression(node.expression)) return;
    const method = node.expression.name.text;
    if (method !== 'release' && method !== 'proposeRelease') return;
    const xiObj = resolveObjectLiteral(ts, node.arguments[0]!, scope);
    if (!xiObj) return;
    onRelease({ call: node, receiverExpr: node.expression.expression, xiObj, scope });
  });
}

/** Count primitive keys in `.release({ ... })` / `.proposeRelease({ ... })` object literals. */
export function extractArkOrderReleaseKeyCountsFromSource(
  file: string,
  content: string,
  options: ArkOrderPlaneReceiverOptions = {}
): ResolvedArkOrderReleaseKeyCountFact[] {
  const context = planeReceiverContext(file, content, options);
  const ast = parseArkOrderAst(file, content, options);
  if (ast) {
    const { ts, sourceFile } = ast;
    const facts: ResolvedArkOrderReleaseKeyCountFact[] = [];
    walkReleaseCallsAst(ts, sourceFile, ({ call, receiverExpr, xiObj, scope }) => {
      if (!isPlaneReceiver(astReceiverIdentifier(ts, receiverExpr), context)) return;
      const { keys, incomplete } = collectObjectLiteralKeysDetailed(ts, xiObj, scope);
      if (keys.length === 0 && !incomplete) return;
      facts.push({
        file,
        line: tsAstNodeLine(sourceFile, call),
        keyCount: keys.length,
        ...(incomplete ? { incomplete: true } : {}),
      });
    });
    return facts;
  }

  const source = stripCommentsPreservingLines(content);
  const facts: ResolvedArkOrderReleaseKeyCountFact[] = [];
  const re = /\.(?:release|proposeRelease)\s*\(\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const before = source.slice(Math.max(0, match.index - 160), match.index);
    if (!isPlaneReceiver(receiverBefore(before), context)) continue;
    const body = match[1] ?? '';
    const keys = new Set(literalKeys(body));
    if (keys.size === 0) continue;
    facts.push({
      file,
      line: lineAt(content, match.index),
      keyCount: keys.size,
      ...(/\b\.\.\./.test(body) ? { incomplete: true } : {}),
    });
  }
  return facts;
}

/** Keys of a flat object-literal body: `key: v`, `'key': v`, and shorthand `key`. */
function literalKeys(body: string): string[] {
  const keys: string[] = [];
  for (const entry of body.split(',')) {
    const match = /^\s*(['"]?)([A-Za-z_$][\w$]*)\1\s*(?::|$)/.exec(entry);
    if (match?.[2]) keys.push(match[2]);
  }
  return keys;
}

/**
 * Freshness keys in the ξ literal (first argument) of `plane.release({...})` /
 * `plane.proposeRelease({...})`. σ (the second argument) may carry freshUntil — that
 * is where freshness belongs. The receiver must be a plane (arkOrderPlaneReceivers), so
 * a lock/lease `release({ ttl })` is never evidence. Shorthand `{ plan, ttl }` counts.
 */
export function extractArkOrderXiTtlKeysFromSource(
  file: string,
  content: string,
  options: ArkOrderPlaneReceiverOptions = {}
): ResolvedArkOrderXiTtlFact[] {
  const context = planeReceiverContext(file, content, options);
  const ast = parseArkOrderAst(file, content, options);
  if (ast) {
    const { ts, sourceFile } = ast;
    const facts: ResolvedArkOrderXiTtlFact[] = [];
    walkReleaseCallsAst(ts, sourceFile, ({ call, receiverExpr, xiObj, scope }) => {
      if (!isPlaneReceiver(astReceiverIdentifier(ts, receiverExpr), context)) return;
      const line = tsAstNodeLine(sourceFile, call);
      const seen = new Set<string>();
      for (const key of collectObjectLiteralKeys(ts, xiObj, scope)) {
        if (!XI_TTL_KEY_RE.test(key) || seen.has(key)) continue;
        seen.add(key);
        facts.push({ file, line, key });
      }
    });
    return facts;
  }

  const source = stripCommentsPreservingLines(content);
  const facts: ResolvedArkOrderXiTtlFact[] = [];
  const re = /\.(?:release|proposeRelease)\s*\(\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const before = source.slice(Math.max(0, match.index - 160), match.index);
    if (!isPlaneReceiver(receiverBefore(before), context)) continue;
    for (const key of literalKeys(match[1] ?? '')) {
      if (!XI_TTL_KEY_RE.test(key)) continue;
      facts.push({ file, line: lineAt(content, match.index), key });
    }
  }
  return facts;
}

function stringLiterals(body: string): string[] {
  const out: string[] = [];
  const re = /(['"`])([^'"`\n\\]+)\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match[2]) out.push(match[2]);
  }
  return out;
}

function isCreateOrderPlaneCall(ts: TsAstLike, node: TsAstNode): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = unwrapTsAstExpression(ts, node.expression);
  if (ts.isIdentifier(callee)) return callee.text === ARKORDER_PLANE_FACTORY;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text === ARKORDER_PLANE_FACTORY;
  return false;
}

/**
 * Direct evidence only: in a file that calls createOrderPlane, a literal
 * `allowedKinds: [...]` entry that a literal `cannotObserve: [...]` denies. Computed
 * or imported arrays stay silent (inference never blocks) — the runtime plane still
 * throws ARKORDER_INFORMATION_BUDGET before such a Release is persisted.
 */
export function extractArkOrderBudgetLeaksFromSource(
  file: string,
  content: string,
  options: ArkOrderAstOptions = {}
): ResolvedArkOrderBudgetLeakFact[] {
  const ast = parseArkOrderAst(file, content, options);
  if (ast) {
    const { ts, sourceFile } = ast;
    const facts: ResolvedArkOrderBudgetLeakFact[] = [];
    const seen = new Set<string>();
    walkAstWithScope(ts, sourceFile, new Map(), (node, scope) => {
      if (!isCreateOrderPlaneCall(ts, node) || !ts.isCallExpression(node)) return;
      if (node.arguments.length === 0) return;
      const planeOpts = resolveObjectLiteral(ts, node.arguments[0]!, scope);
      if (!planeOpts) return;
      const budgetExpr = objectPropertyValue(ts, planeOpts, 'informationBudget');
      if (!budgetExpr) return;
      const budgetObj = resolveObjectLiteral(ts, budgetExpr, scope);
      if (!budgetObj) return;
      const cannotObserveExpr = objectPropertyValue(ts, budgetObj, 'cannotObserve');
      if (!cannotObserveExpr) return;
      const denied = new Set(extractArrayStringLiterals(ts, cannotObserveExpr, scope));
      if (denied.size === 0) return;
      const projectorExpr = objectPropertyValue(ts, planeOpts, 'projector');
      if (!projectorExpr) return;
      const projectorNode = resolveAstTarget(ts, projectorExpr, scope);
      walkAstWithScope(ts, projectorNode, scope, (inner, innerScope) => {
        let allowedExpr: TsAstNode | null = null;
        if (ts.isPropertyAssignment(inner) && tsAstPropertyKeyName(ts, inner.name) === 'allowedKinds') {
          allowedExpr = inner.initializer;
        } else if (ts.isShorthandPropertyAssignment(inner) && inner.name.text === 'allowedKinds') {
          allowedExpr = inner.name;
        }
        if (!allowedExpr) return;
        const line = tsAstNodeLine(sourceFile, inner);
        for (const kind of extractArrayStringLiterals(ts, allowedExpr, innerScope)) {
          if (!denied.has(kind)) continue;
          const stamp = `${line}:${kind}`;
          if (seen.has(stamp)) continue;
          seen.add(stamp);
          facts.push({ file, line, kind });
        }
      });
    });
    return facts;
  }

  const source = stripCommentsPreservingLines(content);
  if (!/\bcreateOrderPlane\b/.test(source)) return [];
  const denied = new Set<string>();
  const deniedRe = /\bcannotObserve\s*:\s*\[([^\]]*)\]/g;
  let match: RegExpExecArray | null;
  while ((match = deniedRe.exec(source)) !== null) {
    for (const kind of stringLiterals(match[1] ?? '')) denied.add(kind);
  }
  if (denied.size === 0) return [];
  const facts: ResolvedArkOrderBudgetLeakFact[] = [];
  const seen = new Set<string>();
  const allowedRe = /\ballowedKinds\s*:\s*\[([^\]]*)\]/g;
  while ((match = allowedRe.exec(source)) !== null) {
    const line = lineAt(content, match.index);
    for (const kind of stringLiterals(match[1] ?? '')) {
      if (!denied.has(kind)) continue;
      const stamp = `${line}:${kind}`;
      if (seen.has(stamp)) continue;
      seen.add(stamp);
      facts.push({ file, line, kind });
    }
  }
  return facts;
}
