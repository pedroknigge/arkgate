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
import { sourceHasPersistenceWrite, sourceImportsPersistenceDriverText } from './persistence-write-hint.mjs';
export const ARKORDER_PLANE_FACTORY = 'createOrderPlane';
export const ARKORDER_FORBIDDEN_METHODS = ['update', 'patch', 'set', 'mutate'];
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
/** Conventional plane names: `plane`, `orderPlane`, `billingPlane`, … (not the factory). */
const CONVENTIONAL_PLANE_NAME_RE = /^(?:plane|[A-Za-z_$][\w$]*Plane)$/;
/** Trailing identifier, allowing a non-null `!` and optional-chain `?` before the dot. */
const TRAILING_IDENTIFIER_RE = /([A-Za-z_$][\w$]*)\s*!?\s*\??\s*$/;
/** Leading identifier inside a parenthesized receiver: `x as T`, `<T>x`, `x!`, `x`. */
const WRAPPED_IDENTIFIER_RE = /^\s*(?:<[^<>]*>\s*)?([A-Za-z_$][\w$]*)\s*!?\s*(?:\b(?:as|satisfies)\b[\s\S]*)?$/;
/** Identifiers bound to `createOrderPlane(...)` in this file. */
export function arkOrderPlaneBindings(content) {
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
function isPlaneReceiver(name, bound) {
    if (!name || name === ARKORDER_PLANE_FACTORY)
        return false;
    return bound.has(name) || CONVENTIONAL_PLANE_NAME_RE.test(name);
}
/**
 * Direct evidence only: `.update|patch|set|mutate(` whose receiver is a plane —
 * bound to createOrderPlane(...) in this file, or named `plane` / `*Plane`.
 * EOSF5-001: Map / URLSearchParams / React `order.set` / `prisma.x.update` are not ξ
 * mutation, even inside the plane-root file.
 */
export function extractArkOrderGenericUpdatesFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const bound = new Set(arkOrderPlaneBindings(content));
    const facts = [];
    const re = /\.((?:update|patch|set|mutate))\s*\(/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        const method = match[1];
        const before = source.slice(Math.max(0, match.index - 160), match.index);
        if (!isPlaneReceiver(receiverBefore(before), bound))
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
 * ingest() assigned into a Release / ξ holder: a whole-word `xi` / `release` / `pattern` /
 * `house` / `current` / `currentRelease|Xi|Pattern` binding, or a property write such as
 * `store.xi =` / `release.xi[k] =` / `store.current =`. Names that merely start with those
 * words (`currentResidual`, `patternResult`) and comparisons (`===`) are not evidence.
 */
export function extractArkOrderIngestWritesXiFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const facts = [];
    const re = /(?:\b(?:xi|release|pattern|house|current(?:Release|Xi|Pattern)?)\b|\.(?:xi|release|pattern|current)\b)(?:\s*:\s*[A-Za-z_$][\w$.<>, |[\]]*?)?\s*(?:\[[^\]\n]*\])?\s*=(?![=>])\s*[^\n;]{0,160}?\bingest\s*\(/gi;
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
function literalKeys(body) {
    const keys = [];
    const re = /(?:^|[{,\s])['"]?([A-Za-z_$][\w$]*)['"]?\s*:/g;
    let match;
    while ((match = re.exec(body)) !== null) {
        if (match[1])
            keys.push(match[1]);
    }
    return keys;
}
/**
 * Freshness keys in the ξ literal (first argument) of `plane.release({...})` /
 * `plane.proposeRelease({...})`. σ (the second argument) may carry freshUntil — that
 * is where freshness belongs. The receiver must be a plane (bound or `*Plane`), so a
 * lock/lease `release({ ttl })` is never evidence.
 */
export function extractArkOrderXiTtlKeysFromSource(file, content) {
    const source = stripCommentsPreservingLines(content);
    const bound = new Set(arkOrderPlaneBindings(content));
    const facts = [];
    const re = /\.(?:release|proposeRelease)\s*\(\s*\{([^}]*)\}/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        const before = source.slice(Math.max(0, match.index - 160), match.index);
        if (!isPlaneReceiver(receiverBefore(before), bound))
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
