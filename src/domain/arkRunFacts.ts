/**
 * ArkRun resolver-fact extraction (ADR 0022 / RN03).
 *
 * Syntax evidence only — no verdicts, scores, or sensors. Tooling may replace
 * this lexical pass with TypeScript-API facts of the same shape.
 */
import type {
  ResolvedArkRunDeclarationFact,
  ResolvedArkRunKernelCallFact,
  ResolvedArkRunKernelCallKind,
  ResolvedArkRunManagedNewFact,
} from './resolvedCandidateFactsTypes';

/** Closed factory names from ADR 0022 `arkrun-missing-root`. */
export const ARKRUN_KERNEL_FACTORY_CALLEES = [
  'createArkKernel',
  'createStrictArkKernel',
  'createArkKernelFromConfig',
  'createStrictArkKernelFromConfig',
] as const;

/** Closed interaction callees from ADR 0022 undeclared-emit/handle/depend. */
export const ARKRUN_KERNEL_INTERACTION_CALLEES = [
  'publisher',
  'publish',
  'raise',
  'raiseAsync',
  'send',
  'sendTo',
  'subscribe',
  'registerHandler',
  'resolve',
  'resolveSingleton',
] as const;

const FACTORY_CALLEES = new Set<string>(ARKRUN_KERNEL_FACTORY_CALLEES);

const BUILTIN_CTORS = new Set([
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'DataView',
  'Date',
  'Error',
  'EvalError',
  'FinalizationRegistry',
  'Float32Array',
  'Float64Array',
  'Function',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'Map',
  'Number',
  'Object',
  'Promise',
  'Proxy',
  'RangeError',
  'ReferenceError',
  'RegExp',
  'Set',
  'SharedArrayBuffer',
  'String',
  'Symbol',
  'SyntaxError',
  'TypeError',
  'URIError',
  'Uint8Array',
  'Uint8ClampedArray',
  'Uint16Array',
  'Uint32Array',
  'WeakMap',
  'WeakRef',
  'WeakSet',
]);

/** Receivers whose `.resolve`/`.publish` are ambient, not kernel APIs. */
const SKIP_INTERACTION_RECEIVERS = new Set([
  'Array',
  'Atomics',
  'Buffer',
  'JSON',
  'Math',
  'Number',
  'Object',
  'Promise',
  'Reflect',
  'String',
  'console',
  'fs',
  'path',
  'url',
  'util',
]);

export function isArkRunKernelModuleSpecifier(specifier: string): boolean {
  return (
    specifier === '@arkgate/runtime' ||
    specifier.startsWith('@arkgate/runtime/') ||
    specifier === 'arkgate/runtime' ||
    specifier.startsWith('arkgate/runtime/')
  );
}

/**
 * Closed broker / queue / emitter specifiers for `arkrun-transport-bypass`
 * (ADR 0022 D4). Exact entry or package-root subpath only — never substring.
 */
export const ARKRUN_TRANSPORT_BYPASS_SPECIFIERS = [
  'events',
  'node:events',
  'eventemitter2',
  'eventemitter3',
  'emittery',
  'kafkajs',
  'kafka-node',
  'amqplib',
  'amqp',
  'bull',
  'bullmq',
  'mqtt',
  'nats',
  '@aws-sdk/client-sqs',
  '@aws-sdk/client-sns',
  '@aws-sdk/client-eventbridge',
  '@google-cloud/pubsub',
  '@azure/service-bus',
] as const;

const TRANSPORT_BYPASS = new Set<string>(ARKRUN_TRANSPORT_BYPASS_SPECIFIERS);

export function isArkRunTransportBypassSpecifier(specifier: string): boolean {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) return false;
  if (TRANSPORT_BYPASS.has(specifier)) return true;
  const first = specifier.indexOf('/');
  if (first < 0) return false;
  const root = specifier.slice(0, first);
  if (TRANSPORT_BYPASS.has(root)) return true;
  const second = specifier.indexOf('/', first + 1);
  if (second < 0) return false;
  return TRANSPORT_BYPASS.has(specifier.slice(0, second));
}

export function arkRunKernelCallKind(callee: string): ResolvedArkRunKernelCallKind | undefined {
  if (FACTORY_CALLEES.has(callee)) return 'factory';
  switch (callee) {
    case 'publisher':
      return 'publisher';
    case 'publish':
      return 'publish';
    case 'raise':
    case 'raiseAsync':
      return 'raise';
    case 'send':
    case 'sendTo':
      return 'send';
    case 'subscribe':
      return 'subscribe';
    case 'registerHandler':
      return 'register-handler';
    case 'resolve':
      return 'resolve';
    case 'resolveSingleton':
      return 'resolve-singleton';
    default:
      return undefined;
  }
}

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/** Replace comments with spaces so line numbers stay aligned. */
function stripCommentsPreservingLines(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, (line) => line.replace(/\/\/.*$/, (tail) => ' '.repeat(tail.length)));
}

function firstStringLiteralArg(content: string, openParenEnd: number): string | undefined {
  const slice = content.slice(openParenEnd);
  const match = /^\s*(['"])((?:\\.|[^\\])*?)\1/.exec(slice);
  if (!match) return undefined;
  const value = match[2] ?? '';
  return value.length > 0 ? value : undefined;
}

function keywordBefore(content: string, index: number, keyword: string): boolean {
  const start = Math.max(0, index - keyword.length - 8);
  const before = content.slice(start, index);
  return new RegExp(`\\b${keyword}\\s+$`).test(before);
}

type KernelImportBindings = {
  named: Map<string, string>;
  namespaces: Set<string>;
};

function parseValueImportClause(
  content: string,
  onClause: (clause: string, specifier: string) => void
): void {
  const importRe =
    /\b(?:import|export)(\s+type)?\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(content)) !== null) {
    if (match[1]) continue;
    onClause(match[2] ?? '', match[3] ?? '');
  }
}

function collectKernelImportBindings(content: string): KernelImportBindings {
  const named = new Map<string, string>();
  const namespaces = new Set<string>();
  parseValueImportClause(content, (clause, specifier) => {
    if (!isArkRunKernelModuleSpecifier(specifier)) return;
    const namespace = /\*\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(clause);
    if (namespace?.[1]) namespaces.add(namespace[1]);
    const defaultIdent = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:,|$)/.exec(clause.trim());
    if (defaultIdent?.[1]) named.set(defaultIdent[1], defaultIdent[1]);
    const braced = /\{([^}]*)\}/.exec(clause);
    if (!braced?.[1]) return;
    for (const part of braced[1].split(',')) {
      const piece = part.trim();
      if (!piece || piece.startsWith('type ')) continue;
      const alias = /^([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(piece);
      if (alias) {
        named.set(alias[2]!, alias[1]!);
        continue;
      }
      const ident = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(piece);
      if (ident?.[1]) named.set(ident[1], ident[1]);
    }
  });
  return { named, namespaces };
}

function collectImportedConstructors(
  content: string,
  admitted: ReadonlySet<string>
): Set<string> {
  const out = new Set(admitted);
  parseValueImportClause(content, (clause, specifier) => {
    const braced = /\{([^}]*)\}/.exec(clause);
    if (!braced?.[1]) return;
    for (const part of braced[1].split(',')) {
      const piece = part.trim();
      if (!piece || piece.startsWith('type ')) continue;
      const alias = /^([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(piece);
      const local = alias?.[2] ?? /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(piece)?.[1];
      const original = alias?.[1] ?? local;
      if (!local || !original || !/^[A-Z]/.test(original)) continue;
      if (isArkRunKernelModuleSpecifier(specifier) || admitted.has(original) || admitted.has(local)) {
        out.add(local);
        out.add(original);
      }
    }
  });
  return out;
}

function importedFromForName(content: string, localName: string): string | undefined {
  let found: string | undefined;
  parseValueImportClause(content, (clause, specifier) => {
    if (!found && new RegExp(`\\b${localName}\\b`).test(clause)) found = specifier;
  });
  return found;
}

export function extractArkRunKernelCallsFromSource(
  file: string,
  content: string
): ResolvedArkRunKernelCallFact[] {
  const source = stripCommentsPreservingLines(content);
  const bindings = collectKernelImportBindings(source);
  const facts: ResolvedArkRunKernelCallFact[] = [];
  const callRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(source)) !== null) {
    const callee = match[1]!;
    const index = match.index;
    if (keywordBefore(source, index, 'function') || keywordBefore(source, index, 'class')) continue;
    const dotted = source.slice(0, index).match(/([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/);
    const receiver = dotted?.[1];
    const original = bindings.named.get(callee) ?? callee;
    const kind = arkRunKernelCallKind(original) ?? arkRunKernelCallKind(callee);
    if (!kind) continue;
    const viaImport =
      bindings.named.has(callee) || (receiver !== undefined && bindings.namespaces.has(receiver));
    if (kind !== 'factory') {
      if (!viaImport && receiver === undefined) continue;
      if (receiver && SKIP_INTERACTION_RECEIVERS.has(receiver) && !viaImport) continue;
    }
    const nameLiteral = firstStringLiteralArg(source, index + match[0].length);
    facts.push({
      file,
      line: lineAt(content, index),
      kind,
      callee,
      viaImport,
      ...(receiver ? { receiver } : {}),
      ...(nameLiteral ? { nameLiteral } : {}),
    });
  }
  return facts;
}

export function extractArkRunManagedNewsFromSource(
  file: string,
  content: string,
  admittedTypeNames: ReadonlySet<string>
): ResolvedArkRunManagedNewFact[] {
  const source = stripCommentsPreservingLines(content);
  const admitted = collectImportedConstructors(source, admittedTypeNames);
  const facts: ResolvedArkRunManagedNewFact[] = [];
  const newRe = /\bnew\s+(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)*([A-Z][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = newRe.exec(source)) !== null) {
    const typeName = match[1]!;
    if (BUILTIN_CTORS.has(typeName) || !admitted.has(typeName)) continue;
    const importedFrom = importedFromForName(source, typeName);
    facts.push({
      file,
      line: lineAt(content, match.index),
      typeName,
      ...(importedFrom ? { importedFrom } : {}),
    });
  }
  return facts;
}

function matchingBracketEnd(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | undefined;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function stringLiteralsInList(source: string, openIndex: number, closeIndex: number): string[] {
  const slice = source.slice(openIndex + 1, closeIndex);
  const out: string[] = [];
  const re = /(['"])((?:\\.|[^\\])*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(slice)) !== null) {
    const value = match[2] ?? '';
    if (value.length > 0) out.push(value);
  }
  return out;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/** File-scoped `uses` / `reactsTo` / `raises` / `sends` string-literal lists (ADR 0023). */
export function extractArkRunDeclarationsFromSource(
  file: string,
  content: string
): ResolvedArkRunDeclarationFact[] {
  const source = stripCommentsPreservingLines(content);
  const fieldRe = /\b(uses|reactsTo|raises|sends)\s*:/g;
  const uses: string[] = [];
  const reactsTo: string[] = [];
  const raises: string[] = [];
  const sends: string[] = [];
  let firstIndex: number | undefined;
  let match: RegExpExecArray | null;
  while ((match = fieldRe.exec(source)) !== null) {
    const after = source.slice(match.index + match[0].length);
    const bracket = /^\s*\[/.exec(after);
    if (!bracket) continue;
    const openIndex = match.index + match[0].length + (bracket[0]!.length - 1);
    const closeIndex = matchingBracketEnd(source, openIndex);
    if (closeIndex < 0) continue;
    const names = stringLiteralsInList(source, openIndex, closeIndex);
    if (names.length === 0) continue;
    if (firstIndex === undefined) firstIndex = match.index;
    const field = match[1];
    if (field === 'uses') uses.push(...names);
    else if (field === 'reactsTo') reactsTo.push(...names);
    else if (field === 'raises') raises.push(...names);
    else sends.push(...names);
  }
  if (firstIndex === undefined) return [];
  return [
    {
      file,
      line: lineAt(content, firstIndex),
      uses: uniqueSorted(uses),
      reactsTo: uniqueSorted(reactsTo),
      raises: uniqueSorted(raises),
      sends: uniqueSorted(sends),
    },
  ];
}
