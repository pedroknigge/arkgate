/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkRunFacts.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-run-facts.mjs). Zero Node I/O.
 */

import { DEFAULT_INTENT_PREFIXES, effectiveIntentPrefixes, looksLikeArkIntent } from './source-policy.mjs';
/** Closed factory names from ADR 0022 `arkrun-missing-root`. */
export const ARKRUN_KERNEL_FACTORY_CALLEES = [
    'createArkKernel',
    'createStrictArkKernel',
    'createLenientArkKernel',
    'createArkKernelFromConfig',
    'createStrictArkKernelFromConfig',
    'createLenientArkKernelFromConfig',
];
/**
 * NestJS adapter factory sites: `ArkModule.forRoot()` / `ArkModule.forRootAsync()`
 * count as a kernel factory only when `ArkModule` is imported from a kernel module
 * (`arkgate/nestjs`). A bare `.forRoot(` on any other receiver never counts.
 */
export const ARKRUN_NEST_KERNEL_MODULE = 'ArkModule';
export const ARKRUN_NEST_FACTORY_METHODS = ['forRoot', 'forRootAsync'];
/**
 * Kernel types whose annotated bindings (`ark: ArkKernel`, constructor-injected
 * `private readonly ark: ArkKernel`) are traced as kernel receivers when the type
 * is imported from a kernel module.
 */
export const ARKRUN_KERNEL_RECEIVER_TYPES = [
    'ArkKernel',
    'EventBus',
    'EventPublisher',
    'ArkRunPublisher',
];
/** Kernel members that still reach the kernel's interaction API (`ark.eventBus.publish`). */
const KERNEL_TRANSIT_MEMBERS = new Set(['eventBus']);
/** Members whose value is a kernel-bound interaction object (`const pub = ark.publisher(..)`). */
const KERNEL_DERIVED_MEMBERS = new Set(['publisher', 'eventBus']);
const NEST_FACTORY_METHODS = new Set(ARKRUN_NEST_FACTORY_METHODS);
const RECEIVER_TYPES = new Set(ARKRUN_KERNEL_RECEIVER_TYPES);
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
        specifier.startsWith('arkgate/runtime/') ||
        // NestJS adapter re-exports the kernel (ArkModule, InjectArk, ArkKernel).
        specifier === 'arkgate/nestjs' ||
        specifier.startsWith('arkgate/nestjs/'));
}
function stripScriptExtension(path) {
    return path.replace(/\.(?:[cm]?[jt]sx?)$/i, '');
}
function joinRelative(fromFile, specifier) {
    const parts = fromFile.replace(/\\/g, '/').split('/');
    parts.pop();
    for (const piece of specifier.split('/')) {
        if (piece === '' || piece === '.')
            continue;
        if (piece === '..')
            parts.pop();
        else
            parts.push(piece);
    }
    return parts.join('/');
}
/**
 * Pure predicate: does a relative `specifier` imported from `fromFile` point at
 * one of the ArkRun kernel/composition roots? Identifiers imported from such a
 * module are traced as kernel receivers (an `ark` binding imported from a relative `../main`).
 */
export function createArkRunKernelRootSpecifierMatcher(fromFile, roots) {
    return (specifier) => {
        if (!specifier.startsWith('.'))
            return false;
        const target = stripScriptExtension(joinRelative(fromFile, specifier));
        return roots.some((root) => {
            const pattern = root.replace(/\\/g, '/');
            const star = pattern.indexOf('*');
            if (star >= 0) {
                const prefix = pattern.slice(0, star).replace(/\/$/, '');
                return prefix.length > 0 && (target === prefix || target.startsWith(`${prefix}/`));
            }
            const exact = stripScriptExtension(pattern);
            return exact === target || exact === `${target}/index`;
        });
    };
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
/**
 * Lexical import/export-from and require/import() specifier edges for the
 * editor / snippet envelope. Resolution stays unresolved-external — sensors
 * only need the specifier and from-file.
 */
export function extractArkRunValueImportDependenciesFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const out = [];
    const fromRe = /\b(?:import|export)(\s+type)?\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = fromRe.exec(source)) !== null) {
        const specifier = match[3] ?? '';
        if (!specifier)
            continue;
        const statement = match[0] ?? '';
        out.push({
            from: file,
            specifier,
            kind: /^\s*export/.test(statement) ? 'export' : 'import',
            typeOnly: Boolean(match[1]),
            line: lineAt(content, match.index),
            resolution: 'resolved-external',
        });
    }
    const callRe = /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = callRe.exec(source)) !== null) {
        const specifier = match[1] ?? '';
        if (!specifier)
            continue;
        const kind = match[0]?.startsWith('import') ? 'dynamic-import' : 'require';
        out.push({
            from: file,
            specifier,
            kind,
            typeOnly: false,
            line: lineAt(content, match.index),
            resolution: 'resolved-external',
        });
    }
    return out;
}
/** PascalCase named bindings from value import clauses (snippet admitted constructors). */
export function extractArkRunImportedConstructorNamesFromSource(content) {
    const names = [];
    forEachArkRunValueImportClause(content, (clause) => {
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
            if (local && original && /^[A-Z]/.test(original))
                names.push(local, original);
        }
    });
    return uniqueSorted(names);
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
/** Locals of kernel receiver types imported (value or type-only) from a kernel module. */
function collectKernelTypeNames(source) {
    const out = new Set();
    const importRe = /\bimport\s+(?:type\s+)?([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRe.exec(source)) !== null) {
        if (!isArkRunKernelModuleSpecifier(match[2] ?? ''))
            continue;
        const braced = /\{([^}]*)\}/.exec(match[1] ?? '');
        if (!braced?.[1])
            continue;
        for (const part of braced[1].split(',')) {
            const piece = part.trim().replace(/^type\s+/, '');
            const alias = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(piece);
            const original = alias?.[1] ?? piece;
            const local = alias?.[2] ?? piece;
            if (RECEIVER_TYPES.has(original))
                out.add(local);
        }
    }
    return out;
}
function isFactoryCalleeExpression(expression, bindings) {
    const parts = expression.split('.');
    if (parts.length === 2) {
        return bindings.namespaces.has(parts[0]) && FACTORY_CALLEES.has(parts[1]);
    }
    if (parts.length !== 1)
        return false;
    const original = bindings.named.get(parts[0]);
    return original !== undefined && FACTORY_CALLEES.has(original);
}
function addRootModuleImports(source, isKernelRootSpecifier, receivers, rootNamespaces) {
    parseValueImportClause(source, (clause, specifier) => {
        if (!isKernelRootSpecifier(specifier))
            return;
        const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
        if (namespace?.[1]) {
            receivers.add(namespace[1]);
            rootNamespaces?.add(namespace[1]);
        }
        const defaultIdent = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause.trim());
        if (defaultIdent?.[1])
            receivers.add(defaultIdent[1]);
        const braced = /\{([^}]*)\}/.exec(clause);
        for (const part of braced?.[1]?.split(',') ?? []) {
            const piece = part.trim();
            if (!piece || piece.startsWith('type '))
                continue;
            const local = /([A-Za-z_$][\w$]*)$/.exec(piece)?.[1];
            if (local)
                receivers.add(local);
        }
    });
}
/** Derived bindings to a fixpoint: `const pub = ark.publisher(..)`, `{ eventBus, send } = ark`. */
function addDerivedReceivers(source, trace) {
    const { receivers, calleeBindings } = trace;
    const derived = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:await\s+)?(?:this\s*\.\s*)?([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\b/g;
    const destructured = /\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:this\s*\.\s*)?([A-Za-z_$][\w$]*)\s*[;\n)]/g;
    // Plain aliasing: `const kernel = ark;`, `this.kernel = ark;`, `kernel = this.ark;`.
    const aliased = /(?:\b(?:const|let|var)\s+|\bthis\s*\.\s*|(?:^|[;{}\n])\s*)([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?(?<![=!<>])=(?![=>])\s*(?:this\s*\.\s*)?([A-Za-z_$][\w$]*)\s*(?:as\s+[A-Za-z_$][\w$.<>]*\s*)?(?=[;\n,)])/g;
    // `kernel: typeof ark` (parameters, fields) — the binding has the kernel's type.
    const typeofBound = /([A-Za-z_$][\w$]*)\s*\??\s*:\s*typeof\s+([A-Za-z_$][\w$]*)\b/g;
    let match;
    for (let changed = true; changed;) {
        changed = false;
        for (const re of [aliased, typeofBound]) {
            re.lastIndex = 0;
            while ((match = re.exec(source)) !== null) {
                if (!receivers.has(match[2]) || receivers.has(match[1]))
                    continue;
                receivers.add(match[1]);
                changed = true;
            }
        }
        derived.lastIndex = 0;
        while ((match = derived.exec(source)) !== null) {
            if (!receivers.has(match[2]))
                continue;
            // `const k = main.ark` on a root namespace is a named-import equivalent.
            if (!KERNEL_DERIVED_MEMBERS.has(match[3]) && !trace.rootNamespaces.has(match[2])) {
                continue;
            }
            if (receivers.has(match[1]))
                continue;
            receivers.add(match[1]);
            changed = true;
        }
        destructured.lastIndex = 0;
        while ((match = destructured.exec(source)) !== null) {
            if (!receivers.has(match[2]))
                continue;
            for (const part of match[1].split(',')) {
                const pair = /^\s*([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(part);
                if (!pair)
                    continue;
                const member = pair[1];
                const local = pair[2] ?? member;
                if (KERNEL_TRANSIT_MEMBERS.has(member)) {
                    if (receivers.has(local))
                        continue;
                    receivers.add(local);
                    changed = true;
                }
                else if (arkRunKernelCallKind(member) && !FACTORY_CALLEES.has(member)) {
                    calleeBindings.add(local);
                }
            }
        }
    }
}
/**
 * Deterministic kernel-receiver trace (ADR 0022 D1): a non-factory interaction is
 * a kernel call only when its receiver provably reaches the kernel. Matching on a
 * method name alone (`res.send`, `require.resolve`, `subject.subscribe`) is not
 * evidence.
 */
function traceKernelReceivers(source, bindings, isKernelRootSpecifier) {
    const trace = {
        receivers: new Set(),
        calleeBindings: new Set(),
        rootNamespaces: new Set(),
    };
    if (isKernelRootSpecifier) {
        addRootModuleImports(source, isKernelRootSpecifier, trace.receivers, trace.rootNamespaces);
    }
    const factoryBound = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:await\s+)?((?:[A-Za-z_$][\w$]*\s*\.\s*)?[A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/g;
    let match;
    while ((match = factoryBound.exec(source)) !== null) {
        if (isFactoryCalleeExpression(match[2].replace(/\s+/g, ''), bindings)) {
            trace.receivers.add(match[1]);
        }
    }
    const typeNames = collectKernelTypeNames(source);
    if (typeNames.size > 0) {
        const annotated = /([A-Za-z_$][\w$]*)\s*\??\s*:\s*(?:Readonly\s*<\s*)?([A-Za-z_$][\w$]*)\b/g;
        while ((match = annotated.exec(source)) !== null) {
            if (typeNames.has(match[2]))
                trace.receivers.add(match[1]);
        }
    }
    addDerivedReceivers(source, trace);
    return trace;
}
/** Index of the `(` matching the `)` at `closeIndex`, or -1. */
function matchingOpenParen(source, closeIndex) {
    let depth = 0;
    for (let i = closeIndex; i >= 0; i -= 1) {
        const ch = source[i];
        if (ch === ')')
            depth += 1;
        else if (ch === '(') {
            depth -= 1;
            if (depth === 0)
                return i;
        }
    }
    return -1;
}
function chainParts(text) {
    const parts = text
        .split('.')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    return parts[0] === 'this' ? parts.slice(1) : parts;
}
/**
 * Member chain before a call (`this.ark.eventBus.publish(` → [ark, eventBus]).
 * A chained `ark.publisher('S').send(..)` yields the `publisher` call's chain.
 */
function receiverChainBefore(source, index) {
    const head = source.slice(Math.max(0, index - 400), index);
    const dotted = /((?:[A-Za-z_$][\w$]*\s*\??\.\s*)+)$/.exec(head);
    if (dotted?.[1]) {
        const before = head.slice(0, head.length - dotted[1].length);
        // `a[0].send(` / `fn().send(`: the chain root is not a plain identifier.
        if (/[)\]]\s*$/.test(before) || /\.\s*$/.test(before)) {
            return { parts: ['<expr>'], viaPublisherCall: false };
        }
        return { parts: chainParts(dotted[1].replace(/\?/g, '')), viaPublisherCall: false };
    }
    const chained = /\)\s*\??\.\s*$/.exec(head);
    if (!chained)
        return undefined;
    const closeIndex = index - head.length + chained.index;
    const openIndex = matchingOpenParen(source, closeIndex);
    if (openIndex < 0)
        return { parts: ['<expr>'], viaPublisherCall: false };
    const calleeHead = source.slice(Math.max(0, openIndex - 400), openIndex);
    const callee = /((?:[A-Za-z_$][\w$]*\s*\??\.\s*)+)publisher\s*(?:<[^>]*>)?\s*$/.exec(calleeHead);
    if (!callee?.[1])
        return { parts: ['<expr>'], viaPublisherCall: false };
    return { parts: chainParts(callee[1].replace(/\?/g, '')), viaPublisherCall: true };
}
function chainReachesKernel(chain, bindings, trace) {
    const [root, ...rest] = chain.parts;
    if (!root)
        return false;
    if (rest.length === 0 && bindings.namespaces.has(root))
        return true;
    // Backstop: ambient receivers are never the kernel, even if shadowed by a trace.
    if (SKIP_INTERACTION_RECEIVERS.has(root) || !trace.receivers.has(root))
        return false;
    // `main.ark.publisher(..)`: the first hop off a root namespace is an exported
    // binding of the composition root — the same receiver `import { ark }` traces.
    const transit = trace.rootNamespaces.has(root) ? rest.slice(1) : rest;
    return transit.every((member) => KERNEL_TRANSIT_MEMBERS.has(member));
}
/**
 * Same-file intent names: `const X = ark.registry.define('N')` / `defineIntent('N')`,
 * `define(N_CONST)`, and `const N = 'Name'` constants (ADR 0023 D2: define names
 * count as call-site names). Imported creators stay unresolved (honest partial).
 */
function collectDefinedIntentNames(source) {
    // Not scope-aware: an identifier bound to two different names anywhere in the
    // file is ambiguous (a function-local shadow could differ), so it resolves to
    // nothing and the call stays an honest partial instead of a false green.
    const ambiguous = new Set();
    const bind = (map, id, name) => {
        const prior = map.get(id);
        if (prior !== undefined && prior !== name)
            ambiguous.add(id);
        else
            map.set(id, name);
    };
    const constants = new Map();
    const constRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(['"])((?:\\.|[^\\])*?)\2\s*(?:as\s+const\s*)?[;\n,)]/g;
    let match;
    while ((match = constRe.exec(source)) !== null) {
        if (match[3])
            bind(constants, match[1], match[3]);
    }
    for (const id of ambiguous)
        constants.delete(id);
    const defined = new Map(constants);
    const defineRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:[A-Za-z_$][\w$]*\s*\.\s*)*(?:define|defineIntent)\s*(?:<[^>]*>)?\s*\(\s*(?:(['"])((?:\\.|[^\\])*?)\2|([A-Za-z_$][\w$]*)\s*[,)])/g;
    while ((match = defineRe.exec(source)) !== null) {
        const name = match[3] ?? (match[4] ? constants.get(match[4]) : undefined);
        if (name)
            bind(defined, match[1], name);
        else if (ambiguous.has(match[4] ?? '') || defined.has(match[1]))
            ambiguous.add(match[1]);
    }
    for (const id of ambiguous)
        defined.delete(id);
    return defined;
}
function firstIdentifierArg(content, openParenEnd) {
    return /^\s*([A-Za-z_$][\w$]*)\s*[,)]/.exec(content.slice(openParenEnd))?.[1];
}
/**
 * Effective intent prefixes of a config: each layer's declared `intentPrefixes`
 * (or its canonical defaults) plus every canonical prefix. The kernel maps intents
 * by these, so a name carrying one is kernel-valid evidence.
 */
export function arkRunEffectiveIntentPrefixes(config) {
    const prefixes = new Set();
    for (const entry of DEFAULT_INTENT_PREFIXES) {
        for (const prefix of entry.prefixes)
            prefixes.add(prefix);
    }
    for (const layer of config.layers) {
        for (const prefix of effectiveIntentPrefixes(layer))
            prefixes.add(prefix);
    }
    return [...prefixes].sort();
}
function carriesIntentPrefix(value, prefixes) {
    if (looksLikeArkIntent(value))
        return true;
    return (prefixes ?? []).some((raw) => {
        const prefix = raw.trim();
        if (!prefix)
            return false;
        const normalized = prefix.endsWith('.') ? prefix : `${prefix}.`;
        return value.startsWith(normalized) && /^[A-Za-z0-9_.]+$/.test(value.slice(normalized.length));
    });
}
function receiverName(chain) {
    if (!chain)
        return undefined;
    if (chain.viaPublisherCall)
        return 'publisher';
    const last = chain.parts[chain.parts.length - 1];
    return last === '<expr>' ? undefined : last;
}
/**
 * A receiver the trace cannot follow (untyped parameter, cross-file hop the
 * resolver did not see) still counts when the call names a kernel-valid intent
 * (`Domain.…`, or a configured `intentPrefixes` prefix such as `Billing.…` — the only
 * names a kernel maps). `res.send('ok')`
 * or `require.resolve('pkg')` never carry such a name; ambient receivers never count.
 */
function untracedKernelNameEvidence(chain, stringArg, intentPrefixes) {
    if (!chain || stringArg === undefined || !carriesIntentPrefix(stringArg, intentPrefixes)) {
        return false;
    }
    const root = chain.parts[0];
    return root !== undefined && root !== '<expr>' && !SKIP_INTERACTION_RECEIVERS.has(root);
}
/**
 * Does this module re-export a kernel root (a named or star re-export of a relative
 * `main` module, or an `ark` binding imported from it and re-exported /
 * `export const kernel = ark` / `export default ark`)? The resolver uses it to
 * treat barrels as kernel roots, to a fixpoint.
 */
export function reexportsArkRunKernelRoot(content, isKernelRootSpecifier) {
    const source = stripCommentsPreservingLines(content);
    const reexport = /\bexport\s+(?!type\b)(?:\*|\{[^}]*\}|\*\s+as\s+[A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"]/g;
    let found;
    while ((found = reexport.exec(source)) !== null) {
        if (isKernelRootSpecifier(found[1] ?? ''))
            return true;
    }
    const imported = new Set();
    addRootModuleImports(source, isKernelRootSpecifier, imported);
    if (imported.size === 0)
        return false;
    const exportedLocal = [
        /\bexport\s*\{([^}]*)\}\s*(?!\s*from)/g,
        /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*[;\n]/g,
        /\bexport\s+(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=;]+)?=\s*([A-Za-z_$][\w$]*)\s*[;\n]/g,
    ];
    for (const re of exportedLocal) {
        let match;
        while ((match = re.exec(source)) !== null) {
            const names = (match[1] ?? '')
                .split(',')
                .map((part) => part.trim().split(/\s+as\s+/)[0]?.trim() ?? '');
            if (names.some((name) => imported.has(name)))
                return true;
        }
    }
    return false;
}
export function extractArkRunKernelCallsFromSource(file, content, options = {}) {
    const source = stripCommentsPreservingLines(content);
    const bindings = collectKernelImportBindings(source);
    const trace = traceKernelReceivers(source, bindings, options.isKernelRootSpecifier);
    const definedNames = collectDefinedIntentNames(source);
    const facts = [];
    const callRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/g;
    let match;
    while ((match = callRe.exec(source)) !== null) {
        const callee = match[1];
        const index = match.index;
        if (keywordBefore(source, index, 'function') || keywordBefore(source, index, 'class'))
            continue;
        const chain = receiverChainBefore(source, index);
        const receiver = receiverName(chain);
        const original = bindings.named.get(callee) ?? callee;
        let kind = arkRunKernelCallKind(original) ?? arkRunKernelCallKind(callee);
        let viaImport = bindings.named.has(callee) ||
            trace.calleeBindings.has(callee) ||
            (chain?.parts.length === 1 && bindings.namespaces.has(chain.parts[0]));
        if (!kind &&
            NEST_FACTORY_METHODS.has(callee) &&
            chain?.parts.length === 1 &&
            bindings.named.get(chain.parts[0]) === ARKRUN_NEST_KERNEL_MODULE) {
            kind = 'factory';
            viaImport = true;
        }
        if (!kind)
            continue;
        if (kind === 'factory') {
            // `obj.createArkKernel()` on an arbitrary receiver is not the kernel factory.
            if (chain !== undefined && !viaImport)
                continue;
        }
        const argStart = index + match[0].length;
        const stringArg = firstStringLiteralArg(source, argStart);
        if (kind !== 'factory' &&
            (chain === undefined ? !viaImport : !chainReachesKernel(chain, bindings, trace)) &&
            !untracedKernelNameEvidence(chain, stringArg, options.intentPrefixes)) {
            continue;
        }
        const identifierArg = firstIdentifierArg(source, argStart);
        const nameLiteral = stringArg ?? (identifierArg ? definedNames.get(identifierArg) : undefined);
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
