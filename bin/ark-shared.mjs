import path from 'node:path';

/**
 * Convert an ark.config.json layer glob pattern to an anchored RegExp.
 *
 * IMPORTANT: the double-star is expanded in a SINGLE pass. A chained two-step replace
 * (double-star to dot-star, then single-star to a no-slash class) corrupts the double-star,
 * because the second step re-matches the star inside the substitution the first step just
 * inserted. That made "src/kernel/**" compile to a regex that stopped matching nested paths,
 * silently unclassifying every file in a subdirectory. Scan one character at a time instead.
 */
export function globToRegExp(pattern) {
  const glob = pattern.split(path.sep).join('/');
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?'; // `**/` matches zero or more path segments
          i += 2;
        } else {
          out += '.*'; // `**` matches across `/`
          i += 1;
        }
      } else {
        out += '[^/]*'; // `*` matches within a single segment
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

/** Resolve a file's architecture layer from ark.config.json layer glob patterns. */
export function layerForFile(root, file, layers) {
  const abs = path.isAbsolute(file) ? file : path.resolve(root, file);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  for (const layer of layers ?? []) {
    for (const pattern of layer.patterns ?? []) {
      if (globToRegExp(pattern).test(rel)) return layer.name;
    }
  }
  return undefined;
}

/**
 * Intent-name recognizer. Kept deliberately in sync with `looksLikeIntentName` in
 * src/kernel/ai-gate/AICodeGate.ts: the two live in separate layers on purpose — the
 * CLIs run standalone (with only `typescript` present, no build), so they must not
 * import from the compiled library. Update both if the layer prefixes change.
 */
const INTENT_NAME =
  /^(Domain|Application|Adapter|Workflow|Job|Presentation|Reporting|Metadata|Security|Audit|Observability|Kernel)\.[A-Za-z0-9_.]+$/;

export function looksLikeIntent(value) {
  return INTENT_NAME.test(value);
}
