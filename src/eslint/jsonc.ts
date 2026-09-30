/**
 * String-aware JSONC reader for tsconfig files (editor adapter only).
 *
 * TypeScript accepts `//` and `/* *\/` comments plus trailing commas in tsconfig.json.
 * A regex strip is not safe: `"@/*"` in `paths` and `"**\/*.ts"` in `include` look like
 * a block comment to a string-blind regex. This scanner copies string literals verbatim,
 * drops comments outside strings, and drops a comma that only precedes `}` or `]`.
 */

function skipTrivia(text: string, start: number): number {
  let index = start;
  const length = text.length;
  for (;;) {
    while (index < length && /\s/.test(text[index]!)) index += 1;
    if (text[index] === '/' && text[index + 1] === '/') {
      while (index < length && text[index] !== '\n') index += 1;
      continue;
    }
    if (text[index] === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end < 0 ? length : end + 2;
      continue;
    }
    return index;
  }
}

/** Remove comments and trailing commas outside string literals. */
function stripJsonc(input: string): string {
  const text = input.replace(/^﻿/, '');
  let out = '';
  let index = 0;
  const length = text.length;
  while (index < length) {
    const char = text[index]!;
    if (char === '"') {
      let end = index + 1;
      while (end < length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      out += text.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (char === '/' && (text[index + 1] === '/' || text[index + 1] === '*')) {
      // Keep token separation: a comment between two tokens behaves like whitespace.
      out += ' ';
      index = skipTrivia(text, index);
      continue;
    }
    if (char === ',') {
      const next = skipTrivia(text, index + 1);
      if (text[next] === '}' || text[next] === ']') {
        index += 1;
        continue;
      }
    }
    out += char;
    index += 1;
  }
  return out;
}

/** Parse JSONC text. Throws a SyntaxError when the remainder is not valid JSON. */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(text));
}
