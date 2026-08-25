/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkRunFacts.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-run-facts.mjs). Zero Node I/O.
 */

export const ARKRUN_KERNEL_FACTORY_CALLEES = [
    'createArkKernel',
    'createStrictArkKernel',
    'createArkKernelFromConfig',
    'createStrictArkKernelFromConfig',
];
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
];
const FACTORY_CALLEES = new Set(ARKRUN_KERNEL_FACTORY_CALLEES);
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
export function isArkRunKernelModuleSpecifier(specifier) {
    return (specifier === '@arkgate/runtime' ||
        specifier.startsWith('@arkgate/runtime/') ||
        specifier === 'arkgate/runtime' ||
        specifier.startsWith('arkgate/runtime/'));
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
];
const TRANSPORT_BYPASS = new Set(ARKRUN_TRANSPORT_BYPASS_SPECIFIERS);
export function isArkRunTransportBypassSpecifier(specifier) {
    if (!specifier || specifier.startsWith('.') || specifier.startsWith('/'))
        return false;
    if (TRANSPORT_BYPASS.has(specifier))
        return true;
    const first = specifier.indexOf('/');
    if (first < 0)
        return false;
    const root = specifier.slice(0, first);
    if (TRANSPORT_BYPASS.has(root))
        return true;
    const second = specifier.indexOf('/', first + 1);
    if (second < 0)
        return false;
    return TRANSPORT_BYPASS.has(specifier.slice(0, second));
}
export function arkRunKernelCallKind(callee) {
    if (FACTORY_CALLEES.has(callee))
        return 'factory';
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
function lineAt(content, index) {
    let line = 1;
    for (let i = 0; i < index; i += 1) {
        if (content.charCodeAt(i) === 10)
            line += 1;
    }
    return line;
}
/** Replace comments with spaces so line numbers stay aligned. */
function stripCommentsPreservingLines(content) {
    return content
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:\\])\/\/.*$/gm, (line) => line.replace(/\/\/.*$/, (tail) => ' '.repeat(tail.length)));
}
function firstStringLiteralArg(content, openParenEnd) {
    const slice = content.slice(openParenEnd);
    const match = /^\s*(['"])((?:\\.|[^\\])*?)\1/.exec(slice);
    if (!match)
        return undefined;
    const value = match[2] ?? '';
    return value.length > 0 ? value : undefined;
}
function keywordBefore(content, index, keyword) {
    const start = Math.max(0, index - keyword.length - 8);
    const before = content.slice(start, index);
    return new RegExp(`\\b${keyword}\\s+$`).test(before);
}
function parseValueImportClause(content, onClause) {
    const importRe = /\b(?:import|export)(\s+type)?\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRe.exec(content)) !== null) {
        if (match[1])
            continue;
        onClause(match[2] ?? '', match[3] ?? '');
    }
}
/** Value `import`/`export … from` clauses. Strips comments so callers may pass raw source. */
export function forEachArkRunValueImportClause(content, onClause) {
    parseValueImportClause(stripCommentsPreservingLines(content), onClause);
}
function collectKernelImportBindings(content) {
    const named = new Map();
    const namespaces = new Set();
    parseValueImportClause(content, (clause, specifier) => {
        if (!isArkRunKernelModuleSpecifier(specifier))
            return;
        const namespace = /\*\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(clause);
        if (namespace?.[1])
            namespaces.add(namespace[1]);
        const defaultIdent = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:,|$)/.exec(clause.trim());
        if (defaultIdent?.[1])
            named.set(defaultIdent[1], defaultIdent[1]);
        const braced = /\{([^}]*)\}/.exec(clause);
        if (!braced?.[1])
            return;
        for (const part of braced[1].split(',')) {
            const piece = part.trim();
            if (!piece || piece.startsWith('type '))
                continue;
            const alias = /^([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(piece);
            if (alias) {
                named.set(alias[2], alias[1]);
                continue;
            }
            const ident = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(piece);
            if (ident?.[1])
                named.set(ident[1], ident[1]);
        }
    });
    return { named, namespaces };
}
function collectImportedConstructors(content, admitted) {
    const out = new Set(admitted);
    parseValueImportClause(content, (clause, specifier) => {
        const braced = /\{([^}]*)\}/.exec(clause);
        if (!braced?.[1])
            return;
        for (const part of braced[1].split(',')) {
            const piece = part.trim();
            if (!piece || piece.startsWith('type '))
                continue;
            const alias = /^([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(piece);
            const local = alias?.[2] ?? /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(piece)?.[1];
            const original = alias?.[1] ?? local;
            if (!local || !original || !/^[A-Z]/.test(original))
                continue;
            if (isArkRunKernelModuleSpecifier(specifier) || admitted.has(original) || admitted.has(local)) {
                out.add(local);
                out.add(original);
            }
        }
    });
    return out;
}
function importedFromForName(content, localName) {
    let found;
    parseValueImportClause(content, (clause, specifier) => {
        if (!found && new RegExp(`\\b${localName}\\b`).test(clause))
            found = specifier;
    });
    return found;
}
export function extractArkRunKernelCallsFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const bindings = collectKernelImportBindings(source);
    const facts = [];
    const callRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/g;
    let match;
    while ((match = callRe.exec(source)) !== null) {
        const callee = match[1];
        const index = match.index;
        if (keywordBefore(source, index, 'function') || keywordBefore(source, index, 'class'))
            continue;
        const dotted = source.slice(0, index).match(/([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/);
        const receiver = dotted?.[1];
        const original = bindings.named.get(callee) ?? callee;
        const kind = arkRunKernelCallKind(original) ?? arkRunKernelCallKind(callee);
        if (!kind)
            continue;
        const viaImport = bindings.named.has(callee) || (receiver !== undefined && bindings.namespaces.has(receiver));
        if (kind !== 'factory') {
            if (!viaImport && receiver === undefined)
                continue;
            if (receiver && SKIP_INTERACTION_RECEIVERS.has(receiver) && !viaImport)
                continue;
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
export function extractArkRunManagedNewsFromSource(file, content, admittedTypeNames) {
    const source = stripCommentsPreservingLines(content);
    const admitted = collectImportedConstructors(source, admittedTypeNames);
    const facts = [];
    const newRe = /\bnew\s+(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)*([A-Z][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/g;
    let match;
    while ((match = newRe.exec(source)) !== null) {
        const typeName = match[1];
        if (BUILTIN_CTORS.has(typeName) || !admitted.has(typeName))
            continue;
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
function matchingBracketEnd(source, openIndex) {
    let depth = 0;
    let quote;
    for (let i = openIndex; i < source.length; i += 1) {
        const ch = source[i];
        if (quote) {
            if (ch === '\\') {
                i += 1;
                continue;
            }
            if (ch === quote)
                quote = undefined;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') {
            quote = ch;
            continue;
        }
        if (ch === '[')
            depth += 1;
        else if (ch === ']') {
            depth -= 1;
            if (depth === 0)
                return i;
        }
    }
    return -1;
}
function stringLiteralsInList(source, openIndex, closeIndex) {
    const slice = source.slice(openIndex + 1, closeIndex);
    const out = [];
    const re = /(['"])((?:\\.|[^\\])*?)\1/g;
    let match;
    while ((match = re.exec(slice)) !== null) {
        const value = match[2] ?? '';
        if (value.length > 0)
            out.push(value);
    }
    return out;
}
function uniqueSorted(values) {
    return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
/** File-scoped `uses` / `reactsTo` / `raises` / `sends` string-literal lists (ADR 0023). */
export function extractArkRunDeclarationsFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const fieldRe = /\b(uses|reactsTo|raises|sends)\s*:/g;
    const uses = [];
    const reactsTo = [];
    const raises = [];
    const sends = [];
    let firstIndex;
    let match;
    while ((match = fieldRe.exec(source)) !== null) {
        const after = source.slice(match.index + match[0].length);
        const bracket = /^\s*\[/.exec(after);
        if (!bracket)
            continue;
        const openIndex = match.index + match[0].length + (bracket[0].length - 1);
        const closeIndex = matchingBracketEnd(source, openIndex);
        if (closeIndex < 0)
            continue;
        const names = stringLiteralsInList(source, openIndex, closeIndex);
        if (names.length === 0)
            continue;
        if (firstIndex === undefined)
            firstIndex = match.index;
        const field = match[1];
        if (field === 'uses')
            uses.push(...names);
        else if (field === 'reactsTo')
            reactsTo.push(...names);
        else if (field === 'raises')
            raises.push(...names);
        else
            sends.push(...names);
    }
    if (firstIndex === undefined)
        return [];
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
