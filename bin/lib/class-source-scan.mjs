/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/classSourceScan.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/class-source-scan.mjs). Zero Node I/O.
 */

export const MEMBER_MODIFIERS = new Set([
    'public',
    'private',
    'protected',
    'static',
    'async',
    'readonly',
    'abstract',
    'override',
    'declare',
    'get',
    'set',
]);
/** Characters after which a `/` starts a regular-expression literal, not a division. */
const REGEX_PRECEDING_CHARS = new Set([
    '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^',
]);
/** Keywords after which a `/` starts a regular-expression literal. */
const REGEX_PRECEDING_KEYWORDS = new Set([
    'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw',
    'instanceof', 'yield', 'await',
]);
/**
 * True when the `/` at `index` sits where an expression starts (so it opens a
 * regex literal). Looks back to the previous significant character; identifiers,
 * numbers, `)` and `]` mean division.
 */
function slashStartsRegex(src, index) {
    let j = index - 1;
    while (j >= 0 && /\s/.test(src[j]))
        j -= 1;
    if (j < 0)
        return true;
    const prev = src[j];
    if (/[A-Za-z0-9_$]/.test(prev)) {
        let k = j;
        while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k]))
            k -= 1;
        return REGEX_PRECEDING_KEYWORDS.has(src.slice(k + 1, j + 1));
    }
    // `*/` ends a comment; what came before it is not examined (treated as division, rare).
    if (prev === '/' && src[j - 1] === '*')
        return false;
    return REGEX_PRECEDING_CHARS.has(prev);
}
/**
 * Index after the regex literal starting at `index` (`/…/flags`), or `index` when
 * none starts there. Character classes (`[/]`) and escapes are honoured; a line
 * break before the closing `/` means it was not a regex after all.
 */
function skipRegexLiteral(src, index) {
    if (!slashStartsRegex(src, index))
        return index;
    let j = index + 1;
    let inClass = false;
    while (j < src.length) {
        const ch = src[j];
        if (ch === '\n' || ch === '\r')
            return index;
        if (ch === '\\') {
            j += 2;
            continue;
        }
        if (inClass) {
            if (ch === ']')
                inClass = false;
        }
        else if (ch === '[') {
            inClass = true;
        }
        else if (ch === '/') {
            j += 1;
            while (j < src.length && /[A-Za-z]/.test(src[j]))
                j += 1;
            return j;
        }
        j += 1;
    }
    return index;
}
/**
 * Index after a string / comment / regex literal starting at `index`, or `index`
 * when none starts there.
 */
export function skipStringOrComment(src, index) {
    const ch = src[index];
    if (ch === '/' && src[index + 1] === '/') {
        const nl = src.indexOf('\n', index);
        return nl === -1 ? src.length : nl;
    }
    if (ch === '/' && src[index + 1] === '*') {
        const end = src.indexOf('*/', index + 2);
        return end === -1 ? src.length : end + 2;
    }
    if (ch === '/')
        return skipRegexLiteral(src, index);
    if (ch === "'" || ch === '"' || ch === '`') {
        let j = index + 1;
        while (j < src.length) {
            if (src[j] === '\\') {
                j += 2;
                continue;
            }
            if (src[j] === ch)
                return j + 1;
            j += 1;
        }
        return src.length;
    }
    return index;
}
export function skipWsAndComments(src, index) {
    let i = index;
    while (i < src.length) {
        if (/\s/.test(src[i])) {
            i += 1;
            continue;
        }
        if (src[i] === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
            i = skipStringOrComment(src, i);
            continue;
        }
        break;
    }
    return i;
}
export function readIdent(src, index) {
    const ch = src[index];
    if (!ch || !/[A-Za-z_$]/.test(ch))
        return null;
    let j = index + 1;
    while (j < src.length && /[A-Za-z0-9_$]/.test(src[j]))
        j += 1;
    return { ident: src.slice(index, j), end: j };
}
/**
 * Index just after the delimiter closing `openCh` at `openIndex`, or null when it
 * never closes. Strings and comments are skipped. For `<`/`>`, an arrow `=>` is not
 * a closing angle.
 */
export function skipBalanced(src, openIndex, openCh, closeCh) {
    if (src[openIndex] !== openCh)
        return null;
    let depth = 1;
    let i = openIndex + 1;
    while (i < src.length && depth > 0) {
        const skipped = skipStringOrComment(src, i);
        if (skipped !== i) {
            i = skipped;
            continue;
        }
        const ch = src[i];
        if (ch === openCh)
            depth += 1;
        else if (ch === closeCh && !(closeCh === '>' && src[i - 1] === '='))
            depth -= 1;
        i += 1;
    }
    return depth === 0 ? i : null;
}
export function scanClassMembers(body) {
    const members = [];
    let i = 0;
    let truncatedAt;
    while (i < body.length) {
        i = skipWsAndComments(body, i);
        if (i >= body.length)
            break;
        if (body[i] === ';') {
            i += 1;
            continue;
        }
        const modifiers = [];
        let cursor = i;
        while (true) {
            const tok = readIdent(body, cursor);
            if (!tok || !MEMBER_MODIFIERS.has(tok.ident))
                break;
            modifiers.push(tok.ident);
            cursor = skipWsAndComments(body, tok.end);
        }
        const nameTok = readIdent(body, cursor);
        if (!nameTok) {
            i += 1;
            continue;
        }
        cursor = skipWsAndComments(body, nameTok.end);
        if (body[cursor] === '<') {
            const afterGeneric = skipBalanced(body, cursor, '<', '>');
            if (afterGeneric == null) {
                truncatedAt = body.length;
                break;
            }
            cursor = skipWsAndComments(body, afterGeneric);
        }
        if (body[cursor] === '(') {
            const afterParen = skipBalanced(body, cursor, '(', ')');
            if (afterParen == null) {
                truncatedAt = body.length;
                break;
            }
            cursor = skipWsAndComments(body, afterParen);
            if (body[cursor] === ':') {
                cursor += 1;
                while (cursor < body.length && body[cursor] !== '{' && body[cursor] !== ';') {
                    const skipped = skipStringOrComment(body, cursor);
                    if (skipped !== cursor) {
                        cursor = skipped;
                        continue;
                    }
                    cursor += 1;
                }
            }
            if (body[cursor] === '{') {
                const afterBrace = skipBalanced(body, cursor, '{', '}');
                if (afterBrace == null) {
                    truncatedAt = body.length;
                    break;
                }
                members.push({
                    name: nameTok.ident,
                    modifiers,
                    kind: 'method',
                    body: body.slice(cursor + 1, afterBrace - 1),
                });
                i = afterBrace;
                continue;
            }
            if (body[cursor] === ';') {
                i = cursor + 1;
                continue;
            }
            i = cursor + 1;
            continue;
        }
        let depthBrace = 0;
        let depthParen = 0;
        let depthBracket = 0;
        while (cursor < body.length) {
            const skipped = skipStringOrComment(body, cursor);
            if (skipped !== cursor) {
                cursor = skipped;
                continue;
            }
            const ch = body[cursor];
            if (ch === '{')
                depthBrace += 1;
            else if (ch === '}') {
                if (depthBrace === 0)
                    break;
                depthBrace -= 1;
            }
            else if (ch === '(')
                depthParen += 1;
            else if (ch === ')')
                depthParen -= 1;
            else if (ch === '[')
                depthBracket += 1;
            else if (ch === ']')
                depthBracket -= 1;
            else if (ch === ';' && depthBrace === 0 && depthParen === 0 && depthBracket === 0) {
                cursor += 1;
                break;
            }
            cursor += 1;
        }
        if (cursor >= body.length && (depthBrace > 0 || depthParen > 0 || depthBracket > 0)) {
            // An initializer that never balances: later members are not visible.
            truncatedAt = body.length;
        }
        members.push({
            name: nameTok.ident,
            modifiers,
            kind: 'field',
            body: '',
        });
        i = cursor;
    }
    return { members, truncatedAt };
}
/**
 * Walk a class header from just after its name to the opening body brace.
 * Type parameters, `extends Base<{ a: 1 }>`, `implements A, B<C>` and call
 * expressions in `extends mixin(Base)` are skipped with balanced delimiters.
 * Returns the index of `{`, or null when the header cannot be walked.
 */
function findClassBodyBrace(content, from) {
    let i = from;
    while (i < content.length) {
        const skipped = skipWsAndComments(content, i);
        if (skipped !== i) {
            i = skipped;
            continue;
        }
        const ch = content[i];
        if (ch === '{')
            return i;
        if (ch === ';')
            return null;
        if (ch === '<' || ch === '(' || ch === '[') {
            const close = ch === '<' ? '>' : ch === '(' ? ')' : ']';
            const after = skipBalanced(content, i, ch, close);
            if (after == null)
                return null;
            i = after;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            i = skipStringOrComment(content, i);
            continue;
        }
        i += 1;
    }
    return null;
}
/**
 * Locate class declarations. `exportedOnly` keeps the historic sensor scope:
 * `export class` / `export abstract class` (not `export default class`).
 * Otherwise any `class Name` in code (exported, default-exported, or local).
 * Declarations inside comments and strings are ignored.
 */
export function findClassDeclarations(content, options = {}) {
    const out = [];
    const headerRe = options.exportedOnly
        ? /\bexport\s+(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
        : /(?:\b(export)\s+(?:default\s+)?)?(?:\babstract\s+)?\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    const code = maskStringsAndComments(content);
    let match;
    while ((match = headerRe.exec(code)) !== null) {
        const name = (options.exportedOnly ? match[1] : match[2]);
        const exported = options.exportedOnly === true || match[1] === 'export';
        const brace = findClassBodyBrace(content, match.index + match[0].length);
        if (brace == null) {
            out.push({ name, start: match.index, exported, bodyStart: null, bodyEnd: null });
            continue;
        }
        const after = skipBalanced(content, brace, '{', '}');
        out.push({
            name,
            start: match.index,
            exported,
            bodyStart: brace + 1,
            bodyEnd: after == null ? null : after - 1,
        });
    }
    return out;
}
/** Same length as `content`; string and comment characters become spaces (newlines kept). */
function maskStringsAndComments(content) {
    let out = '';
    let i = 0;
    while (i < content.length) {
        const next = skipStringOrComment(content, i);
        if (next !== i) {
            out += content.slice(i, next).replace(/[^\n]/g, ' ');
            i = next;
            continue;
        }
        out += content[i];
        i += 1;
    }
    return out;
}
/**
 * Locate `namespace Name {` / `module Name {`, `const Name = {` (object literal) and
 * `const Name = class … {` (class expression) declarations of `name`, so a
 * `Name.member` symbol can be checked for membership in them as well as in
 * `class Name`. Strings, comments, and regex literals are ignored.
 */
export function findMemberContainers(content, name) {
    const out = [];
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name))
        return out;
    const code = maskStringsAndComments(content);
    const escaped = name.replace(/\$/g, '\\$');
    const re = new RegExp(`\\b(?:(namespace|module)\\s+${escaped}\\s*\\{|(?:const|let|var)\\s+${escaped}\\s*(?::[^=;]+?)?=(?!=|>)\\s*(class\\b)?)`, 'g');
    let match;
    while ((match = re.exec(code)) !== null) {
        let brace;
        let kind;
        if (match[1]) {
            kind = 'namespace';
            brace = match.index + match[0].length - 1;
        }
        else if (match[2]) {
            kind = 'class-expression';
            brace = findClassBodyBrace(content, match.index + match[0].length);
        }
        else {
            kind = 'object';
            const at = skipWsAndComments(content, match.index + match[0].length);
            brace = content[at] === '{' ? at : null;
        }
        if (brace == null)
            continue;
        const after = skipBalanced(content, brace, '{', '}');
        out.push({ kind, bodyStart: brace + 1, bodyEnd: after == null ? content.length : after - 1 });
    }
    return out;
}
/**
 * Top-level member names of an object-literal body: `name() {}`, `async name()`,
 * `*name()`, `name: …`, and shorthand `name,`. Nested braces/parens/brackets are
 * skipped so a key of an inner object is not a member of the outer one.
 */
export function objectLiteralMemberNames(body) {
    const names = [];
    let i = 0;
    let expectKey = true;
    while (i < body.length) {
        const skipped = skipStringOrComment(body, i);
        if (skipped !== i) {
            i = skipped;
            expectKey = false;
            continue;
        }
        const ch = body[i];
        if (ch === '{' || ch === '(' || ch === '[') {
            const close = ch === '{' ? '}' : ch === '(' ? ')' : ']';
            i = skipBalanced(body, i, ch, close) ?? body.length;
            expectKey = false;
            continue;
        }
        if (ch === ',') {
            expectKey = true;
            i += 1;
            continue;
        }
        if (expectKey && /[A-Za-z_$]/.test(ch)) {
            let tok = readIdent(body, i);
            // `async name()`, `get name()`, `set name(v)`, `async *name()`: the modifier is not the key.
            while (tok && (tok.ident === 'async' || tok.ident === 'get' || tok.ident === 'set')) {
                let next = skipWsAndComments(body, tok.end);
                if (body[next] === '*')
                    next = skipWsAndComments(body, next + 1);
                const peek = readIdent(body, next);
                if (!peek)
                    break;
                tok = peek;
            }
            if (tok) {
                const after = skipWsAndComments(body, tok.end);
                if ('(:,<'.includes(body[after] ?? '') || after >= body.length)
                    names.push(tok.ident);
                i = tok.end;
                expectKey = false;
                continue;
            }
        }
        if (expectKey && ch === '*') {
            i += 1;
            continue;
        }
        if (!/\s/.test(ch))
            expectKey = false;
        i += 1;
    }
    return names;
}
