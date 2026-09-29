/**
 * Pure class-source scanner shared by ArkRules structure sensors (ADR 0013) and
 * invariant symbol coverage (ADR 0014).
 *
 * A small tokenizer, not a regex: strings, comments, and template literals are
 * skipped, so a `"}"` literal never closes a class body, and type-parameter lists
 * (`class Box<T extends { a: 1 }>`) are walked with balanced delimiters.
 * No filesystem, no TypeScript compiler (Domain stays zero-dependency).
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

/** Index after a string / comment starting at `index`, or `index` when none starts there. */
export function skipStringOrComment(src: string, index: number): number {
  const ch = src[index];
  if (ch === '/' && src[index + 1] === '/') {
    const nl = src.indexOf('\n', index);
    return nl === -1 ? src.length : nl;
  }
  if (ch === '/' && src[index + 1] === '*') {
    const end = src.indexOf('*/', index + 2);
    return end === -1 ? src.length : end + 2;
  }
  if (ch === "'" || ch === '"' || ch === '`') {
    let j = index + 1;
    while (j < src.length) {
      if (src[j] === '\\') {
        j += 2;
        continue;
      }
      if (src[j] === ch) return j + 1;
      j += 1;
    }
    return src.length;
  }
  return index;
}

export function skipWsAndComments(src: string, index: number): number {
  let i = index;
  while (i < src.length) {
    if (/\s/.test(src[i]!)) {
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

export function readIdent(src: string, index: number): { ident: string; end: number } | null {
  const ch = src[index];
  if (!ch || !/[A-Za-z_$]/.test(ch)) return null;
  let j = index + 1;
  while (j < src.length && /[A-Za-z0-9_$]/.test(src[j]!)) j += 1;
  return { ident: src.slice(index, j), end: j };
}

/**
 * Index just after the delimiter closing `openCh` at `openIndex`, or null when it
 * never closes. Strings and comments are skipped. For `<`/`>`, an arrow `=>` is not
 * a closing angle.
 */
export function skipBalanced(
  src: string,
  openIndex: number,
  openCh: string,
  closeCh: string
): number | null {
  if (src[openIndex] !== openCh) return null;
  let depth = 1;
  let i = openIndex + 1;
  while (i < src.length && depth > 0) {
    const skipped = skipStringOrComment(src, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = src[i];
    if (ch === openCh) depth += 1;
    else if (ch === closeCh && !(closeCh === '>' && src[i - 1] === '=')) depth -= 1;
    i += 1;
  }
  return depth === 0 ? i : null;
}

export type ScannedClassMember = {
  name: string;
  modifiers: string[];
  kind: 'method' | 'field';
  body: string;
};

export function scanClassMembers(body: string): {
  members: ScannedClassMember[];
  truncatedAt: number | undefined;
} {
  const members: ScannedClassMember[] = [];
  let i = 0;
  let truncatedAt: number | undefined;
  while (i < body.length) {
    i = skipWsAndComments(body, i);
    if (i >= body.length) break;
    if (body[i] === ';') {
      i += 1;
      continue;
    }
    const modifiers: string[] = [];
    let cursor = i;
    while (true) {
      const tok = readIdent(body, cursor);
      if (!tok || !MEMBER_MODIFIERS.has(tok.ident)) break;
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
      if (ch === '{') depthBrace += 1;
      else if (ch === '}') {
        if (depthBrace === 0) break;
        depthBrace -= 1;
      } else if (ch === '(') depthParen += 1;
      else if (ch === ')') depthParen -= 1;
      else if (ch === '[') depthBracket += 1;
      else if (ch === ']') depthBracket -= 1;
      else if (ch === ';' && depthBrace === 0 && depthParen === 0 && depthBracket === 0) {
        cursor += 1;
        break;
      }
      cursor += 1;
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

/** One `class Name …` declaration located in source text. */
export type ScannedClassDeclaration = {
  name: string;
  /** Index of the `export` / `class` keyword that starts the declaration. */
  start: number;
  exported: boolean;
  /** Index just after the opening `{`, or null when no body could be located. */
  bodyStart: number | null;
  /** Index of the closing `}`; null when the body never closes (or was not found). */
  bodyEnd: number | null;
};

/**
 * Walk a class header from just after its name to the opening body brace.
 * Type parameters, `extends Base<{ a: 1 }>`, `implements A, B<C>` and call
 * expressions in `extends mixin(Base)` are skipped with balanced delimiters.
 * Returns the index of `{`, or null when the header cannot be walked.
 */
function findClassBodyBrace(content: string, from: number): number | null {
  let i = from;
  while (i < content.length) {
    const skipped = skipWsAndComments(content, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = content[i];
    if (ch === '{') return i;
    if (ch === ';') return null;
    if (ch === '<' || ch === '(' || ch === '[') {
      const close = ch === '<' ? '>' : ch === '(' ? ')' : ']';
      const after = skipBalanced(content, i, ch, close);
      if (after == null) return null;
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
export function findClassDeclarations(
  content: string,
  options: { exportedOnly?: boolean } = {}
): ScannedClassDeclaration[] {
  const out: ScannedClassDeclaration[] = [];
  const headerRe = options.exportedOnly
    ? /\bexport\s+(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
    : /(?:\b(export)\s+(?:default\s+)?)?(?:\babstract\s+)?\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  const code = maskStringsAndComments(content);
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(code)) !== null) {
    const name = (options.exportedOnly ? match[1] : match[2])!;
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
function maskStringsAndComments(content: string): string {
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
