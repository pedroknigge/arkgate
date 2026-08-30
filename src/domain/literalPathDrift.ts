/**
 * Literal path drift (LPD) — pure detector for repo paths that live inside
 * strings, comments and docstrings.
 *
 * A path written in a string or a comment is invisible to every tool in the
 * gate: `tsc` resolves imports, not strings, and ESLint does not either. A
 * rename therefore compiles green and lies afterwards — the reference still
 * reads as documentation while pointing at a directory that no longer exists.
 *
 * Field data (783 renames, 49 vanished source directories) shows the drift in
 * FOUR forms, and every hand sweep covered one and let the others through:
 *
 *  - `alias`    — the tsconfig alias, `"@/components/x"` (the only form a
 *                 `sed`/`rg` sweep usually covers);
 *  - `relative` — `"./catalogue-edit-button"` (caught by `tsc` only when it is
 *                 a real import; invisible in a string);
 *  - `rootless` — `"components/x/y.tsx"`, a path concatenated from the repo
 *                 root without the `src/` prefix;
 *  - `prose`    — an unprefixed path written in a comment or a docstring. The
 *                 largest class (24 references in 21 files in the field sample)
 *                 and the one with no detector anywhere; it turned up in `.ts`,
 *                 `.tsx` and a `.css`. An alias or relative literal written in
 *                 a comment keeps its own form label — the label names the
 *                 syntax, and only this one needs the comment to be recognised
 *                 at all.
 *
 * Two modes, because they make different claims:
 *
 *  - **anchored** on a rename set — the source path is gone and one rename
 *    explains where it went, so a replacement can be proposed and the fix is
 *    mechanical and one-directional (`LITERAL_PATH_DRIFT`).
 *  - **unanchored** — the literal looks like a repo path and does not resolve,
 *    but nothing says where it should point. Advisory only
 *    (`LITERAL_PATH_UNRESOLVED`); there is no destination to propose.
 *
 * Four traps the field already paid for, all handled here:
 *
 *  1. A substring match produces false positives: `lib/quick-contract` matches
 *     inside `src/test/lib/quick-contract-validate.test.ts`, which exists. Only
 *     the FULL extracted token counts, and only when it does not resolve.
 *  2. Most references carry no extension. Resolution therefore tries the bare
 *     path, the usual source extensions and `index.*` — without this roughly a
 *     third of live references read as dead.
 *  3. Prose punctuation rides along (`payapp-readiness-stepper.tsx.`).
 *  4. Generated files are noise: they hold hundreds of legitimate matches and
 *     are regenerated, not corrected.
 *
 * Zero Node I/O — existence is an injected predicate over repo-relative paths,
 * and it must answer for directories as well as files: a surviving directory is
 * what stops one file moving into a subfolder from reading as its whole
 * directory having moved. The CLI side (walk, git
 * rename set, writes) is `bin/lib/literal-path-drift-io.mjs`.
 *
 * @see docs/diagnostics.md#LITERAL_PATH_DRIFT
 */

/** Anchored drift: a rename explains the dead reference, so a fix is proposable. */
export const LITERAL_PATH_DRIFT_RULE_ID = 'LITERAL_PATH_DRIFT' as const;

/** Unanchored drift: the literal does not resolve and nothing says where it went. */
export const LITERAL_PATH_UNRESOLVED_RULE_ID = 'LITERAL_PATH_UNRESOLVED' as const;

/** Which of the four field forms a literal was written in. */
export type LiteralPathForm = 'alias' | 'relative' | 'rootless' | 'prose';

/** One rename, both sides repo-relative and POSIX-separated. */
export type PathRename = {
  from: string;
  to: string;
};

/** A path-shaped literal found in a string or a comment. */
export type LiteralPathCandidate = {
  /** Repo-relative file the literal lives in. */
  file: string;
  /** 1-based line. */
  line: number;
  /** 1-based column of the first character of `token`. */
  column: number;
  /** The token exactly as written, after punctuation trimming (trap 3). */
  token: string;
  form: LiteralPathForm;
  /**
   * Repo-relative interpretation of `token`: alias expanded, `./` resolved
   * against the containing directory. For `rootless` this is the token itself;
   * the prefixes it may also be read under are `rootlessPrefixes`.
   */
  target: string;
  /** Alias form only: the prefix as written (`@/`), so a rewrite can restore it. */
  aliasPrefix?: string;
  /** Alias form only: the repo-relative root the prefix expands to (`src/`). */
  aliasRoot?: string;
};

/** A candidate that does not resolve, with a replacement when one is proposable. */
export type LiteralPathDriftFinding = LiteralPathCandidate & {
  ruleId: typeof LITERAL_PATH_DRIFT_RULE_ID | typeof LITERAL_PATH_UNRESOLVED_RULE_ID;
  /** Repo-relative destination, anchored findings only. */
  suggestedTarget: string | null;
  /** `token` rewritten in the author's own form, anchored findings only. */
  suggestedToken: string | null;
  /** The rename that anchored the finding, when one did. */
  anchor: PathRename | null;
  message: string;
};

export type LiteralPathDriftReport = {
  scannedFiles: number;
  /** Path-shaped literals examined (the denominator behind the findings). */
  candidates: number;
  /** Renames whose source is really gone — the only ones that may anchor. */
  anchorsConsidered: number;
  /** Rename sources dropped because they map to more than one destination. */
  ambiguousAnchors: string[];
  /** `LITERAL_PATH_DRIFT` — has a suggested replacement, fixable by `--write`. */
  anchored: LiteralPathDriftFinding[];
  /** `LITERAL_PATH_UNRESOLVED` — advisory, never written. */
  unanchored: LiteralPathDriftFinding[];
  /** Total anchored findings, including any past the cap. */
  anchoredCount: number;
  /** Total unanchored findings, including any past the cap. */
  unanchoredCount: number;
  /** Per-list ceiling on retained findings. */
  findingCap: number;
  /** Whether either list was cut at the cap — the counts above stay exact. */
  truncated: { anchored: boolean; unanchored: boolean };
};

/**
 * File types the drift scan reads.
 *
 * Deliberately wider than the TS/TSX gate used by the resolved-candidate
 * extractors: form D appeared in a `.css` file in the field sample
 * (`src/app/globals.css` citing a component), and a stale path in a `.md`
 * runbook misleads exactly the same way. These are all text formats where a
 * repo path is written by hand.
 */
export const LITERAL_PATH_SCAN_EXTENSIONS: readonly string[] = Object.freeze([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.json',
  '.md',
]);

/** Extensions tried when a reference carries none (trap 2). */
const RESOLUTION_EXTENSIONS: readonly string[] = Object.freeze([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.d.ts',
  '.css',
  '.scss',
  '.json',
  '.md',
]);

/** Index files tried when a reference names a directory (trap 2). */
const RESOLUTION_INDEX_FILES: readonly string[] = Object.freeze([
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
  '/index.mjs',
]);

/** Trailing characters that prose glues onto a path (trap 3). */
const TRAILING_PUNCTUATION = new Set([
  '.',
  ',',
  ';',
  ':',
  ')',
  ']',
  '}',
  '>',
  '"',
  "'",
  '`',
  '!',
  '?',
  '/',
]);
// NOTE: '-' is deliberately absent. It is a legal path character, and trimming
// it turns `src/old-` into a match on `src/old` — the write would then leave a
// dangling `-` behind and report the replacement as applied.

/** Longest token the scanner will consider a path. */
const MAX_TOKEN_LENGTH = 200;

/**
 * Alias map used when the caller declares none: the `@/` convention over `src/`.
 * The CLI side derives the real map from the project's tsconfig `paths`.
 */
export const DEFAULT_ALIASES: Readonly<Record<string, string>> = Object.freeze({ '@/': 'src/' });

/** Include roots assumed when the contract declares none. */
export const DEFAULT_INCLUDE_ROOTS: readonly string[] = Object.freeze(['src']);

/**
 * A replacement must look like a path before it may be written into a file.
 *
 * The destination comes from git's rename output, which is raw bytes: a path
 * may legally contain a quote, a backslash, a newline. Splicing one of those
 * into a source line would not fix a reference, it would edit the program. A
 * replacement that fails this test is not proposed at all — the candidate falls
 * back to the advisory list, which proposes nothing.
 */
const SAFE_REPLACEMENT = /^[A-Za-z0-9_@./-]+$/;

/**
 * Hard ceiling on findings kept in memory, per list.
 *
 * A byte budget on the input text does not bound what is derived from it: 64MB
 * of four-character path-shaped tokens is millions of finding objects. Past the
 * cap the finding is counted and dropped, never silently lost — the totals stay
 * exact.
 */
const MAX_FINDINGS = 5000;

/**
 * A replacement is proposable only if it is a path that still means a path.
 *
 * The charset test alone is not enough: a rename whose destination is the
 * literal's own directory renders as the bare `./`, which is well-formed
 * charset-wise and turns `require("./c")` into `require("./")` — a different
 * module, not a repaired reference. The same shape produces `../` and, in the
 * root-relative form, a bare prefix with no path left in it.
 */
function isProposableReplacement(token: string): boolean {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return false;
  if (!SAFE_REPLACEMENT.test(token)) return false;
  if (token.endsWith('/')) return false;
  // Every literal the scanner accepts contains a separator; a replacement that
  // does not is a different kind of thing.
  if (!token.includes('/')) return false;
  const segments = token.split('/');
  let index = 0;
  while (index < segments.length && (segments[index] === '.' || segments[index] === '..')) {
    index += 1;
  }
  const rest = segments.slice(index);
  if (rest.length === 0) return false;
  return !rest.some((segment) => segment.length === 0 || segment === '.' || segment === '..');
}

/** Directory names that are never product source. */
const NEVER_PRODUCT_SEGMENTS = new Set(['node_modules', '.git', 'dist', 'coverage', 'build']);

/**
 * Generated files are regenerated, not corrected (trap 4).
 *
 * Matches the repo-relative path only — a content sniff would need the file
 * body and this stays a pure path predicate. The CLI side may skip more.
 */
export function isGeneratedLiteralPathFile(relPath: string): boolean {
  const normalized = normalizeRelative(relPath);
  if (normalized.length === 0) return false;
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === 'generated' || segment === '__generated__')) {
    return true;
  }
  const base = segments[segments.length - 1] ?? '';
  return /\.(generated|gen)\.[cm]?[jt]sx?$/i.test(base) || /\.d\.ts$/i.test(base);
}

/** True when the file extension is one the drift scan reads. */
export function isLiteralPathScannable(relPath: string): boolean {
  const lower = normalizeRelative(relPath).toLowerCase();
  return LITERAL_PATH_SCAN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Every repo-relative path a reference may legitimately resolve to (trap 2).
 *
 * The bare path comes first so a directory reference resolves as itself.
 */
export function resolutionCandidates(target: string): string[] {
  const normalized = normalizeRelative(target);
  if (normalized.length === 0) return [];
  const out = [normalized];
  const base = normalized.split('/').pop() ?? '';
  if (base.includes('.')) return out;
  // Only an extensionless reference can mean "a file with an extension" or "a
  // directory with an index". `src/foo.ts` naming a directory that holds an
  // index would be a live path, not this one.
  for (const ext of RESOLUTION_EXTENSIONS) out.push(`${normalized}${ext}`);
  for (const index of RESOLUTION_INDEX_FILES) out.push(`${normalized}${index}`);
  return out;
}

/**
 * Per-character context for one file: code, inside a string literal, or inside
 * a comment. A tiny state machine, not a parser — it only needs to be right
 * about where a path-shaped token was written, and being wrong costs at most a
 * form label (or, in code context, one skipped candidate).
 *
 * Markdown has no code/string/comment structure worth modelling: the whole file
 * is prose.
 */
const CTX_CODE = 0;
const CTX_STRING = 1;
const CTX_COMMENT = 2;

/**
 * Per-character context for one file: code, inside a string literal, or inside
 * a comment. A tiny state machine, not a parser — it only needs to be right
 * about where a path-shaped token was written, and being wrong costs at most a
 * form label (or, in code context, one skipped candidate).
 *
 * A `${...}` interpolation inside a template literal is CODE, not string: the
 * text between the braces is an expression, and rewriting a "path" found there
 * would change what the program computes.
 *
 * Markdown has no code/string/comment structure worth modelling: the whole file
 * is prose. It returns `null` rather than a filled array — an allocation the
 * size of the file, for a constant.
 *
 * One byte per character (Uint8Array), not one pointer: on this repo the walk
 * reads ~9.8M characters, and a boxed array is 8x that in transient garbage.
 */
function contextMap(relPath: string, text: string): Uint8Array | null {
  if (relPath.toLowerCase().endsWith('.md')) return null;
  const out = new Uint8Array(text.length);
  const blockCommentOnly = /\.(css|scss)$/i.test(relPath);
  /** Open template literals, innermost last; each tracks its `{` nesting. */
  const templates: number[] = [];
  let i = 0;
  let state = CTX_CODE;
  let quote = '';
  let lineComment = false;
  while (i < text.length) {
    const ch = text[i] as string;
    const next = text[i + 1];
    if (state === CTX_COMMENT) {
      out[i] = CTX_COMMENT;
      if (lineComment) {
        if (ch === '\n') {
          state = CTX_CODE;
          lineComment = false;
        }
        i += 1;
        continue;
      }
      if (ch === '*' && next === '/') {
        out[i + 1] = CTX_COMMENT;
        state = CTX_CODE;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (state === CTX_STRING) {
      out[i] = CTX_STRING;
      if (ch === '\\') {
        if (i + 1 < text.length) out[i + 1] = CTX_STRING;
        i += 2;
        continue;
      }
      if (quote === '`' && ch === '$' && next === '{') {
        // Enter the interpolation: expression text, not literal text.
        out[i + 1] = CTX_CODE;
        templates.push(0);
        state = CTX_CODE;
        i += 2;
        continue;
      }
      if (ch === quote) {
        state = CTX_CODE;
        quote = '';
      } else if (ch === '\n' && quote !== '`') {
        // An unterminated quote must not swallow the rest of the file.
        state = CTX_CODE;
        quote = '';
      }
      i += 1;
      continue;
    }
    if (templates.length > 0) {
      // Inside `${ ... }`: track braces so a nested object literal does not
      // close the interpolation early.
      if (ch === '{') {
        templates[templates.length - 1] = (templates[templates.length - 1] as number) + 1;
        i += 1;
        continue;
      }
      if (ch === '}') {
        const depth = templates[templates.length - 1] as number;
        if (depth === 0) {
          templates.pop();
          state = CTX_STRING;
          quote = '`';
          out[i] = CTX_STRING;
          i += 1;
          continue;
        }
        templates[templates.length - 1] = depth - 1;
        i += 1;
        continue;
      }
    }
    if (ch === '/' && next === '*') {
      state = CTX_COMMENT;
      lineComment = false;
      out[i] = CTX_COMMENT;
      out[i + 1] = CTX_COMMENT;
      i += 2;
      continue;
    }
    if (!blockCommentOnly && ch === '/' && next === '/') {
      state = CTX_COMMENT;
      lineComment = true;
      out[i] = CTX_COMMENT;
      out[i + 1] = CTX_COMMENT;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      state = CTX_STRING;
      quote = ch;
      out[i] = CTX_STRING;
      i += 1;
      continue;
    }
    i += 1;
  }
  return out;
}

const TOKEN_PATTERN = /[A-Za-z0-9_@./~-]+/g;

export type ExtractOptions = {
  /**
   * Alias prefix → repo-relative root, e.g. `{ '@/': 'src/' }`. Taken from the
   * project's tsconfig paths by the CLI side.
   */
  aliases?: Readonly<Record<string, string>>;
  /**
   * First segments that make an unprefixed token look like a repo path (the
   * `rootless` / `prose` forms). The CLI side derives them from the real tree.
   * A `Set` is accepted so the caller can build it once for the whole run.
   */
  roots?: readonly string[] | ReadonlySet<string>;
};

/**
 * Every path-shaped literal in one file, in source order.
 *
 * Tokens written in code context (not in a string, not in a comment) are not
 * literals and are skipped — that is what keeps identifiers and JSX out.
 */
export function extractPathLiterals(
  relPath: string,
  text: string,
  options: ExtractOptions = {}
): LiteralPathCandidate[] {
  const file = normalizeRelative(relPath);
  const aliasEntries = Object.entries(options.aliases ?? DEFAULT_ALIASES);
  const roots =
    options.roots instanceof Set
      ? (options.roots as ReadonlySet<string>)
      : new Set(options.roots as readonly string[] | undefined);
  const context = contextMap(file, text);
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
  const out: LiteralPathCandidate[] = [];

  let offset = 0;
  const lines = text.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] as string;
    TOKEN_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN_PATTERN.exec(line)) !== null) {
      const start = offset + match.index;
      // A null context map means the whole file is prose (markdown).
      const where = context === null ? CTX_COMMENT : (context[start] ?? CTX_CODE);
      if (where === CTX_CODE) continue;
      const token = trimTrailingPunctuation(match[0]);
      if (!isPathShaped(token, aliasEntries)) continue;
      const resolved = interpretToken(token, dir, aliasEntries, roots, where);
      if (resolved === null) continue;
      out.push({
        file,
        line: lineIndex + 1,
        column: match.index + 1,
        token,
        form: resolved.form,
        target: resolved.target,
        ...(resolved.aliasPrefix === undefined
          ? {}
          : { aliasPrefix: resolved.aliasPrefix, aliasRoot: resolved.aliasRoot }),
      });
    }
    offset += line.length + 1;
  }
  return out;
}

/**
 * Anchored + unanchored drift over a set of already-read files.
 *
 * `exists` answers for repo-relative paths and is the only thing standing
 * between a candidate and a false positive (trap 1).
 */
export function findLiteralPathDrift(input: {
  files: readonly { path: string; text: string }[];
  exists: (relPath: string) => boolean;
  renames?: readonly PathRename[];
  aliases?: Readonly<Record<string, string>>;
  roots?: readonly string[];
  rootlessPrefixes?: readonly string[];
}): LiteralPathDriftReport {
  const rootlessPrefixes = normalizePrefixes(input.rootlessPrefixes);
  // One memo for the whole run: the same target is probed many times (measured
  // 16k calls over 3.7k distinct targets on this repo), and each miss builds
  // ~19 candidate strings before touching the filesystem.
  const resolvedMemo = new Map<string, boolean>();
  const resolvesOnce = (target: string): boolean => {
    const cached = resolvedMemo.get(target);
    if (cached !== undefined) return cached;
    const answer = resolves(target, input.exists);
    resolvedMemo.set(target, answer);
    return answer;
  };
  const anchors = buildAnchors(input.renames ?? [], resolvesOnce);
  const roots = new Set(input.roots ?? []);
  const anchored: LiteralPathDriftFinding[] = [];
  const unanchored: LiteralPathDriftFinding[] = [];
  let candidates = 0;
  let scannedFiles = 0;
  let anchoredCount = 0;
  let unanchoredCount = 0;

  for (const file of input.files) {
    if (!isLiteralPathScannable(file.path)) continue;
    if (isGeneratedLiteralPathFile(file.path)) continue;
    scannedFiles += 1;
    for (const candidate of extractPathLiterals(file.path, file.text, {
      aliases: input.aliases,
      roots,
    })) {
      candidates += 1;
      const reads = readings(candidate, rootlessPrefixes);
      if (reads.some((read) => resolvesOnce(read))) continue;

      const hit = firstAnchor(reads, anchors.map);
      // Three things must hold before a replacement is proposed:
      //  - a rename explains the reference;
      //  - the destination itself resolves, or the "fix" just moves the drift;
      //  - the destination is path-shaped, or writing it would edit the program
      //    rather than repair a reference (git paths are raw bytes).
      const suggestedToken =
        hit === null ? null : renderToken(candidate, hit.readingIndex, hit.target, rootlessPrefixes);
      if (
        hit === null ||
        !resolvesOnce(hit.target) ||
        !isProposableReplacement(hit.target) ||
        suggestedToken === null ||
        !isProposableReplacement(suggestedToken)
      ) {
        unanchoredCount += 1;
        if (unanchored.length < MAX_FINDINGS) {
          unanchored.push({
            ...candidate,
            ruleId: LITERAL_PATH_UNRESOLVED_RULE_ID,
            suggestedTarget: null,
            suggestedToken: null,
            anchor: null,
            message: unanchoredMessage(candidate),
          });
        }
        continue;
      }
      anchoredCount += 1;
      if (anchored.length >= MAX_FINDINGS) continue;
      anchored.push({
        ...candidate,
        ruleId: LITERAL_PATH_DRIFT_RULE_ID,
        suggestedTarget: hit.target,
        suggestedToken,
        anchor: hit.rename,
        message: anchoredMessage(candidate, hit.rename, suggestedToken),
      });
    }
  }

  return {
    scannedFiles,
    candidates,
    anchorsConsidered: anchors.map.size,
    ambiguousAnchors: anchors.ambiguous,
    anchored,
    unanchored,
    anchoredCount,
    unanchoredCount,
    findingCap: MAX_FINDINGS,
    truncated: {
      anchored: anchoredCount > anchored.length,
      unanchored: unanchoredCount > unanchored.length,
    },
  };
}

/**
 * Rewrite one file's text from its own anchored findings.
 *
 * Only the exact token on its own line is replaced, and only when that line
 * still holds it — so a stale finding is skipped rather than corrupting a file,
 * and re-running after a write is a no-op.
 */
export function applyLiteralPathDrift(
  text: string,
  findings: readonly LiteralPathDriftFinding[]
): { text: string; applied: LiteralPathDriftFinding[]; skipped: LiteralPathDriftFinding[] } {
  const lines = text.split('\n');
  const applied: LiteralPathDriftFinding[] = [];
  const skipped: LiteralPathDriftFinding[] = [];
  // Later columns first, so an earlier replacement cannot move a later one.
  const ordered = [...findings].sort((a, b) => b.line - a.line || b.column - a.column);
  for (const finding of ordered) {
    const suggestion = finding.suggestedToken;
    const index = finding.line - 1;
    const line = lines[index];
    if (suggestion === null || line === undefined) {
      skipped.push(finding);
      continue;
    }
    const at = finding.column - 1;
    if (line.slice(at, at + finding.token.length) !== finding.token) {
      skipped.push(finding);
      continue;
    }
    lines[index] = line.slice(0, at) + suggestion + line.slice(at + finding.token.length);
    applied.push(finding);
  }
  return { text: lines.join('\n'), applied, skipped };
}

// ── internals ──────────────────────────────────────────────────────────────

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function normalizePrefixes(prefixes: readonly string[] | undefined): string[] {
  const out = [''];
  for (const prefix of prefixes ?? []) {
    const normalized = normalizeRelative(prefix);
    if (normalized.length > 0 && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function trimTrailingPunctuation(token: string): string {
  let end = token.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(token[end - 1] as string)) end -= 1;
  return token.slice(0, end);
}

function isPathShaped(token: string, aliasEntries: readonly [string, string][] = []): boolean {
  if (token.length < 3 || token.length > MAX_TOKEN_LENGTH) return false;
  if (!token.includes('/')) return false;
  if (token.startsWith('/') || token.startsWith('~')) return false;
  if (token.includes('//')) return false;
  // A leading `@` is a scoped npm package unless it is a DECLARED alias prefix:
  // `@radix-ui/react-dialog` is not a repo path, `@app/thing` is when the
  // project's tsconfig says `@app/*` maps into the tree.
  if (
    token.startsWith('@') &&
    !aliasEntries.some(([prefix]) => token.startsWith(prefix))
  ) {
    return false;
  }
  const segments = token.split('/');
  if (segments.length < 2) return false;
  if (segments.some((segment) => segment.length === 0)) return false;
  if (segments.some((segment) => NEVER_PRODUCT_SEGMENTS.has(segment))) return false;
  return true;
}

type Interpretation = {
  form: LiteralPathForm;
  target: string;
  /** Alias form only: the prefix as written, and the root it expands to. */
  aliasPrefix?: string;
  aliasRoot?: string;
};

function interpretToken(
  token: string,
  dir: string,
  aliasEntries: readonly [string, string][],
  roots: ReadonlySet<string>,
  where: number
): Interpretation | null {
  // Longest alias prefix first: `@app/ui/*` must beat `@app/*`.
  let bestPrefix = '';
  let bestReplacement = '';
  for (const [prefix, replacement] of aliasEntries) {
    if (!token.startsWith(prefix) || prefix.length <= bestPrefix.length) continue;
    bestPrefix = prefix;
    bestReplacement = replacement;
  }
  if (bestPrefix.length > 0) {
    return {
      form: 'alias',
      target: joinPosix(bestReplacement, token.slice(bestPrefix.length)),
      aliasPrefix: bestPrefix,
      aliasRoot: normalizeRelative(bestReplacement),
    };
  }
  if (token.startsWith('./') || token.startsWith('../')) {
    const target = resolveRelative(dir, token);
    return target === null ? null : { form: 'relative', target };
  }
  const first = token.split('/')[0] as string;
  if (!roots.has(first)) return null;
  return {
    form: where === CTX_COMMENT ? 'prose' : 'rootless',
    target: normalizeRelative(token),
  };
}

function resolveRelative(dir: string, token: string): string | null {
  const segments = dir.length > 0 ? dir.split('/') : [];
  for (const segment of token.split('/')) {
    if (segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length === 0 ? null : segments.join('/');
}

function joinPosix(left: string, right: string): string {
  const l = normalizeRelative(left);
  const r = normalizeRelative(right);
  if (l.length === 0) return r;
  if (r.length === 0) return l;
  return `${l}/${r}`;
}

/**
 * Every repo-relative reading of one candidate. Index 0 is the plain target;
 * a `rootless` candidate is also read under each declared prefix, because
 * `components/x` in a test that concatenates from the repo root means
 * `src/components/x`.
 */
function readings(candidate: LiteralPathCandidate, rootlessPrefixes: readonly string[]): string[] {
  if (candidate.form === 'alias' || candidate.form === 'relative') return [candidate.target];
  const out: string[] = [];
  for (const prefix of rootlessPrefixes) {
    const joined = joinPosix(prefix, candidate.target);
    if (!out.includes(joined)) out.push(joined);
  }
  return out;
}

function resolves(target: string, exists: (relPath: string) => boolean): boolean {
  return resolutionCandidates(target).some((path) => exists(path));
}

type AnchorSet = { map: Map<string, PathRename>; ambiguous: string[] };

/**
 * The rename sources that may anchor a finding: file renames plus the directory
 * renames they imply, keeping only sources that really are gone and that map to
 * exactly one destination. A source with two destinations is not a mechanical
 * one-directional fix, so it anchors nothing and its references fall through to
 * the advisory list.
 */
function buildAnchors(
  renames: readonly PathRename[],
  resolvesOnce: (relPath: string) => boolean
): AnchorSet {
  const collected = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    const key = normalizeRelative(from);
    const value = normalizeRelative(to);
    if (key.length === 0 || value.length === 0 || key === value) return;
    // Git paths are raw bytes. A destination that is not path-shaped can never
    // become a replacement, and a SOURCE that is not path-shaped is printed in
    // the ambiguous-anchor line — neither may carry a control character.
    if (!SAFE_REPLACEMENT.test(value) || value.length > MAX_TOKEN_LENGTH) return;
    if (!SAFE_REPLACEMENT.test(key) || key.length > MAX_TOKEN_LENGTH) return;
    const set = collected.get(key) ?? new Set<string>();
    set.add(value);
    collected.set(key, set);
  };
  for (const rename of renames) {
    add(rename.from, rename.to);
    add(stripExtension(rename.from), stripExtension(rename.to));
    const fromDir = dirnamePosix(rename.from);
    const toDir = dirnamePosix(rename.to);
    if (fromDir.length > 0 && toDir.length > 0 && basename(rename.from) === basename(rename.to)) {
      add(fromDir, toDir);
    }
  }
  const map = new Map<string, PathRename>();
  const ambiguous: string[] = [];
  for (const [from, destinations] of collected) {
    if (destinations.size !== 1) {
      ambiguous.push(from);
      continue;
    }
    // A source that still exists is not drift — the reference is live.
    if (resolvesOnce(from)) continue;
    map.set(from, { from, to: [...destinations][0] as string });
  }
  ambiguous.sort();
  return { map, ambiguous };
}

type AnchorHit = { rename: PathRename; target: string; readingIndex: number };

function firstAnchor(reads: readonly string[], anchors: ReadonlyMap<string, PathRename>): AnchorHit | null {
  for (let index = 0; index < reads.length; index += 1) {
    const read = reads[index] as string;
    // Walk the reading's own ancestors, longest first: the nearest rename is
    // the most specific one, and this is O(depth) rather than O(anchors) —
    // the field set was 783 renames against ~10k literals.
    const segments = read.split('/');
    for (let cut = segments.length; cut > 0; cut -= 1) {
      const prefix = segments.slice(0, cut).join('/');
      const rename = anchors.get(prefix);
      if (!rename) continue;
      const rest = segments.slice(cut).join('/');
      return { rename, target: joinPosix(rename.to, rest), readingIndex: index };
    }
  }
  return null;
}

/** Rewrite the destination back into the form the author wrote. */
function renderToken(
  candidate: LiteralPathCandidate,
  readingIndex: number,
  target: string,
  rootlessPrefixes: readonly string[]
): string | null {
  if (candidate.form === 'alias') {
    // The prefix and its root were recorded when the token was interpreted, so
    // a multi-segment alias (`@app/ui/*`) rewrites correctly.
    const aliasPrefix = candidate.aliasPrefix;
    const aliasRoot = candidate.aliasRoot ?? '';
    if (aliasPrefix === undefined) return null;
    if (aliasRoot.length > 0 && !target.startsWith(`${aliasRoot}/`)) return null;
    const rest = aliasRoot.length > 0 ? target.slice(aliasRoot.length + 1) : target;
    return `${aliasPrefix}${rest}`;
  }
  if (candidate.form === 'relative') {
    const dir = candidate.file.includes('/')
      ? candidate.file.slice(0, candidate.file.lastIndexOf('/'))
      : '';
    return relativeFrom(dir, target);
  }
  const prefix = rootlessPrefixes[readingIndex] ?? '';
  if (prefix.length === 0) return target;
  return target.startsWith(`${prefix}/`) ? target.slice(prefix.length + 1) : target;
}

function relativeFrom(dir: string, target: string): string {
  const fromParts = dir.length > 0 ? dir.split('/') : [];
  const toParts = target.split('/');
  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared += 1;
  }
  const up = fromParts.length - shared;
  const rest = toParts.slice(shared).join('/');
  if (up === 0) return `./${rest}`;
  return `${'../'.repeat(up)}${rest}`;
}

function stripExtension(value: string): string {
  const normalized = normalizeRelative(value);
  const base = basename(normalized);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return normalized;
  return normalized.slice(0, normalized.length - (base.length - dot));
}

function dirnamePosix(value: string): string {
  const normalized = normalizeRelative(value);
  const slash = normalized.lastIndexOf('/');
  return slash <= 0 ? '' : normalized.slice(0, slash);
}

function basename(value: string): string {
  const normalized = normalizeRelative(value);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function formLabel(form: LiteralPathForm): string {
  switch (form) {
    case 'alias':
      return 'alias literal';
    case 'relative':
      return 'relative literal';
    case 'rootless':
      return 'root-relative literal';
    case 'prose':
      return 'comment / docstring';
  }
}

function anchoredMessage(
  candidate: LiteralPathCandidate,
  rename: PathRename,
  suggestedToken: string | null
): string {
  const replacement =
    suggestedToken === null ? rename.to : `${suggestedToken} (${rename.from} → ${rename.to})`;
  return `Literal path "${candidate.token}" (${formLabel(candidate.form)}) does not resolve; the rename set says it moved. Replace with ${replacement}.`;
}

function unanchoredMessage(candidate: LiteralPathCandidate): string {
  return `Literal path "${candidate.token}" (${formLabel(candidate.form)}) does not resolve under this root, and no rename explains where it went. Advisory: ArkGate has no destination to propose.`;
}
