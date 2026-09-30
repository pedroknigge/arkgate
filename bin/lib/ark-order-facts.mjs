/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkOrderFacts.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-order-facts.mjs). Zero Node I/O.
 */

import { XI_TTL_KEY_RE } from './ark-order-types.mjs';
import { globToRegExp } from '../ark-layer-match.mjs';
import { sourceHasPersistenceWrite, sourceImportsPersistenceDriverText } from './persistence-write-hint.mjs';
const ARKORDER_PLANE_FACTORY = 'createOrderPlane';
/** XIWRITE-001 `appliesTo` globs use the layer-glob engine (`globToRegExp`). */
export function arkOrderGlobToRegExp(pattern) {
    return globToRegExp(pattern);
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
/**
 * Specifiers naming `arkgate/order` in one source text (static import / export-from,
 * `require()`, `import()`). Editor-path twin of the resolved dependency facts the
 * kernel-in-domain sensor reads in CI — syntax only, no layer verdict here.
 */
export function extractArkOrderModuleImportsFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const out = [];
    const fromRe = /\b(import|export)(\s+type)?\s+(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = fromRe.exec(source)) !== null) {
        const specifier = match[3] ?? '';
        if (!isArkOrderModuleSpecifier(specifier))
            continue;
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
        if (!isArkOrderModuleSpecifier(specifier))
            continue;
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
const PLANE_BINDING_RE = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*createOrderPlane\s*(?:<[^>]*>)?\s*\(/g;
/**
 * Conventional plane names: `plane`, `orderPlane`, `billingPlane`, … (not the factory).
 * A name alone is never evidence (`clipPlane.set`, `controlPlane.update` are not ArkOrder):
 * it counts only in a file that imports `arkgate/order`, or on a named import from a
 * declared `planeRoots` module.
 */
const CONVENTIONAL_PLANE_NAME_RE = /^(?:plane|[A-Za-z_$][\w$]*Plane)$/;
/** `plane: OrderPlane` — parameters, fields, and variables annotated with the plane type. */
const ORDER_PLANE_ANNOTATION_RE = /\b([A-Za-z_$][\w$]*)\s*[?!]?\s*:\s*(?:Readonly\s*<\s*)?OrderPlane\b/g;
const ARKORDER_IMPORT_RE = /\bfrom\s+['"]arkgate\/order(?:\/[^'"]*)?['"]|\brequire\s*\(\s*['"]arkgate\/order(?:\/[^'"]*)?['"]|\bimport\s*\(\s*['"]arkgate\/order(?:\/[^'"]*)?['"]/;
const NAMED_IMPORT_RE = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const RELATIVE_EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
/** Trailing identifier, allowing a non-null `!` and optional-chain `?` before the dot. */
const TRAILING_IDENTIFIER_RE = /([A-Za-z_$][\w$]*)\s*!?\s*\??\s*$/;
/** Leading identifier inside a parenthesized receiver: `x as T`, `<T>x`, `x!`, `x`. */
const WRAPPED_IDENTIFIER_RE = /^\s*(?:<[^<>]*>\s*)?([A-Za-z_$][\w$]*)\s*!?\s*(?:\b(?:as|satisfies)\b[\s\S]*)?$/;
/** Identifiers bound to `createOrderPlane(...)` in this file. */
function arkOrderPlaneBindings(content) {
    const source = stripCommentsPreservingLines(content);
    const names = new Set();
    const re = new RegExp(PLANE_BINDING_RE.source, 'g');
    let match;
    while ((match = re.exec(source)) !== null) {
        if (match[1])
            names.add(match[1]);
    }
    return [...names].sort();
}
function normalizeRelativePath(parts) {
    const out = [];
    for (const part of parts) {
        if (part === '' || part === '.')
            continue;
        if (part === '..') {
            if (out.length === 0)
                return '';
            out.pop();
            continue;
        }
        out.push(part);
    }
    return out.join('/');
}
/** Project-relative candidates for a relative specifier (lexical; no tsconfig paths). */
function relativeModuleCandidates(file, specifier) {
    if (!specifier.startsWith('./') && !specifier.startsWith('../'))
        return [];
    const dir = file.replace(/\\/g, '/').split('/').slice(0, -1);
    const base = normalizeRelativePath([...dir, ...specifier.split('/')]);
    if (!base)
        return [];
    const stem = base.replace(/\.(?:[cm]?js|jsx)$/, '');
    const out = new Set();
    for (const root of [base, stem]) {
        for (const ext of RELATIVE_EXTENSIONS)
            out.add(`${root}${ext}`);
        for (const ext of RELATIVE_EXTENSIONS.slice(1))
            out.add(`${root}/index${ext}`);
    }
    return [...out];
}
function specifierResolvesToPlaneRoot(file, specifier, planeRoots) {
    const candidates = relativeModuleCandidates(file, specifier);
    if (candidates.length === 0)
        return false;
    return planeRoots.some((pattern) => {
        let re;
        try {
            re = arkOrderGlobToRegExp(pattern);
        }
        catch {
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
function arkOrderPlaneReceivers(file, content, options = {}) {
    const source = stripCommentsPreservingLines(content);
    const names = new Set(arkOrderPlaneBindings(content));
    const annotated = new RegExp(ORDER_PLANE_ANNOTATION_RE.source, 'g');
    let match;
    while ((match = annotated.exec(source)) !== null) {
        if (match[1])
            names.add(match[1]);
    }
    const planeRoots = options.planeRoots ?? [];
    if (planeRoots.length > 0) {
        const imports = new RegExp(NAMED_IMPORT_RE.source, 'g');
        while ((match = imports.exec(source)) !== null) {
            if (!specifierResolvesToPlaneRoot(file, match[2] ?? '', planeRoots))
                continue;
            for (const element of (match[1] ?? '').split(',')) {
                const parts = element
                    .trim()
                    .replace(/^type\s+/, '')
                    .split(/\s+as\s+/);
                const imported = parts[0]?.trim() ?? '';
                const local = (parts[1] ?? parts[0] ?? '').trim();
                if (!local || !/^[A-Za-z_$][\w$]*$/.test(local))
                    continue;
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
function isCallBefore(prefix) {
    const tail = prefix.replace(/\s+$/, '');
    if (/[)\]]$/.test(tail))
        return true;
    const word = /([A-Za-z_$][\w$]*)$/.exec(tail);
    return word !== null && !KEYWORDS_BEFORE_PAREN.has(word[1]);
}
/**
 * Receiver identifier right before a `.method(` — unwraps `?.`, `!`, and one balanced
 * `( x as T )` / `( x satisfies T )` / `(<T>x)` / `(x)` wrapper (T may itself contain
 * parentheses). `this.plane` yields `plane`.
 */
function receiverBefore(before) {
    const trimmed = before.replace(/\s*!?\s*\??\s*$/, '');
    if (!trimmed.endsWith(')')) {
        const match = TRAILING_IDENTIFIER_RE.exec(trimmed);
        return match ? match[1] ?? null : null;
    }
    let depth = 0;
    for (let index = trimmed.length - 1; index >= 0; index -= 1) {
        const ch = trimmed[index];
        if (ch === ')')
            depth += 1;
        else if (ch === '(') {
            depth -= 1;
            if (depth === 0) {
                if (isCallBefore(trimmed.slice(0, index)))
                    return null;
                const inner = trimmed.slice(index + 1, trimmed.length - 1);
                const match = WRAPPED_IDENTIFIER_RE.exec(inner);
                return match ? match[1] ?? null : null;
            }
        }
    }
    return null;
}
function planeReceiverContext(file, content, options) {
    const resolved = arkOrderPlaneReceivers(file, content, options);
    return { names: new Set(resolved.names), isArkOrderFile: resolved.isArkOrderFile };
}
function isPlaneReceiver(name, context) {
    if (!name || name === ARKORDER_PLANE_FACTORY)
        return false;
    if (context.names.has(name))
        return true;
    return context.isArkOrderFile && CONVENTIONAL_PLANE_NAME_RE.test(name);
}
/**
 * Direct evidence only: `.update|patch|set|mutate(` whose receiver is a plane (see
 * arkOrderPlaneReceivers). EOSF5-001: Map / URLSearchParams / React `order.set` /
 * `prisma.x.update` are not ξ mutation, even inside the plane-root file; nor is
 * `clipPlane.set` / `controlPlane.update` in a file with no ArkOrder evidence.
 */
export function extractArkOrderGenericUpdatesFromSource(file, content, options = {}) {
    const source = stripCommentsPreservingLines(content);
    const context = planeReceiverContext(file, content, options);
    const facts = [];
    const re = /\.((?:update|patch|set|mutate))\s*\(/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        const method = match[1];
        const before = source.slice(Math.max(0, match.index - 160), match.index);
        if (!isPlaneReceiver(receiverBefore(before), context))
            continue;
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
    if (!sourceImportsPersistenceDriverText(source) || !sourceHasPersistenceWrite(source))
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
/**
 * Holder names that read as a Release or ξ store: whole-word `xi` / `release` /
 * `pattern` / `house` / `current`; an `xi` camelCase head (`xiNext`, `xiState`); or a
 * `…Xi` / `…Release` / `…Pattern` camelCase tail (`nextXi`, `currentRelease`).
 * Trade-off (ADR 0013, prefer false negatives): names that only *start* with
 * release/current/pattern (`releaseState`, `currentResidual`, `patternResult`,
 * `releaseDate`) are not evidence, so `this.releaseState = plane.ingest(e)` stays silent.
 */
const INGEST_XI_HOLDER_SOURCE = '(?:xi(?:[A-Z][\\w$]*)?|release|pattern|house|current|[A-Za-z_$][\\w$]*?(?:Xi|Release|Pattern))(?![\\w$])';
/**
 * ingest() assigned into a Release / ξ holder (INGEST_XI_HOLDER_SOURCE), as a binding
 * or a property write such as `store.xi =` / `release.xi[k] =` / `this.nextXi =`.
 * Comparisons (`===`) and arrows (`=>`) are not evidence.
 */
export function extractArkOrderIngestWritesXiFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const facts = [];
    const re = new RegExp(`(?:(?<![\\w$])|\\.)${INGEST_XI_HOLDER_SOURCE}(?:\\s*:\\s*[A-Za-z_$][\\w$.<>, |[\\]]*?)?\\s*(?:\\[[^\\]\\n]*\\])?\\s*=(?![=>])\\s*[^\\n;]{0,160}?\\bingest\\s*\\(`, 'g');
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
/** Keys of a flat object-literal body: `key: v`, `'key': v`, and shorthand `key`. */
function literalKeys(body) {
    const keys = [];
    for (const entry of body.split(',')) {
        const match = /^\s*(['"]?)([A-Za-z_$][\w$]*)\1\s*(?::|$)/.exec(entry);
        if (match?.[2])
            keys.push(match[2]);
    }
    return keys;
}
/**
 * Freshness keys in the ξ literal (first argument) of `plane.release({...})` /
 * `plane.proposeRelease({...})`. σ (the second argument) may carry freshUntil — that
 * is where freshness belongs. The receiver must be a plane (arkOrderPlaneReceivers), so
 * a lock/lease `release({ ttl })` is never evidence. Shorthand `{ plan, ttl }` counts.
 */
export function extractArkOrderXiTtlKeysFromSource(file, content, options = {}) {
    const source = stripCommentsPreservingLines(content);
    const context = planeReceiverContext(file, content, options);
    const facts = [];
    const re = /\.(?:release|proposeRelease)\s*\(\s*\{([^}]*)\}/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        const before = source.slice(Math.max(0, match.index - 160), match.index);
        if (!isPlaneReceiver(receiverBefore(before), context))
            continue;
        for (const key of literalKeys(match[1] ?? '')) {
            if (!XI_TTL_KEY_RE.test(key))
                continue;
            facts.push({ file, line: lineAt(content, match.index), key });
        }
    }
    return facts;
}
function stringLiterals(body) {
    const out = [];
    const re = /(['"`])([^'"`\n\\]+)\1/g;
    let match;
    while ((match = re.exec(body)) !== null) {
        if (match[2])
            out.push(match[2]);
    }
    return out;
}
/**
 * Direct evidence only: in a file that calls createOrderPlane, a literal
 * `allowedKinds: [...]` entry that a literal `cannotObserve: [...]` denies. Computed
 * or imported arrays stay silent (inference never blocks) — the runtime plane still
 * throws ARKORDER_INFORMATION_BUDGET before such a Release is persisted.
 */
export function extractArkOrderBudgetLeaksFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    if (!/\bcreateOrderPlane\b/.test(source))
        return [];
    const denied = new Set();
    const deniedRe = /\bcannotObserve\s*:\s*\[([^\]]*)\]/g;
    let match;
    while ((match = deniedRe.exec(source)) !== null) {
        for (const kind of stringLiterals(match[1] ?? ''))
            denied.add(kind);
    }
    if (denied.size === 0)
        return [];
    const facts = [];
    const seen = new Set();
    const allowedRe = /\ballowedKinds\s*:\s*\[([^\]]*)\]/g;
    while ((match = allowedRe.exec(source)) !== null) {
        const line = lineAt(content, match.index);
        for (const kind of stringLiterals(match[1] ?? '')) {
            if (!denied.has(kind))
                continue;
            const stamp = `${line}:${kind}`;
            if (seen.has(stamp))
                continue;
            seen.add(stamp);
            facts.push({ file, line, kind });
        }
    }
    return facts;
}
