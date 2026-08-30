/**
 * Tooling I/O for literal path drift (LPD).
 *
 * Pure detection lives in Domain (`src/domain/literalPathDrift.ts`, generated
 * to `./literal-path-drift.mjs`). This module is the side of it that touches
 * the world: the bounded text walk, the git rename set, the existence probe,
 * and the `--write` pass. Hand-written — it is NOT generated.
 *
 * Two things it deliberately does differently from the other content passes:
 *
 *  - **File types.** `resolved-candidate-facts.mjs` gates its extractors to
 *    TS/TSX because they parse TypeScript. A path in a comment is not code, and
 *    the field sample found one in `src/app/globals.css`, so this walk reads
 *    every text format where a repo path is written by hand (see
 *    `LITERAL_PATH_SCAN_EXTENSIONS`). Markdown included: a stale path in a
 *    runbook misleads exactly the same way.
 *  - **No silent discards.** Every file the walk refuses is counted by reason
 *    and reported, the same doctrine as the coverage scan.
 *
 * @see docs/diagnostics.md#LITERAL_PATH_DRIFT
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_INCLUDE_ROOTS,
  applyLiteralPathDrift,
  findLiteralPathDrift,
  isGeneratedLiteralPathFile,
  isLiteralPathScannable,
} from './literal-path-drift.mjs';

/** Max files read into the drift scan. */
export const DEFAULT_MAX_DRIFT_FILES = 4000;
/** Max bytes per file. A larger file is counted, not read. */
const MAX_FILE_BYTES = 512 * 1024;
/**
 * Max total bytes held from the walk.
 *
 * A per-file cap and a file count do not bound their product: 4000 x 512KB is
 * two gigabytes retained before detection starts. This is the bound that
 * actually holds, and like every other refusal it is counted and reported.
 */
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
/** Max directory depth. Deeper directories are counted, not silent. */
const MAX_WALK_DEPTH = 12;
/** Max bytes of a tsconfig read for alias discovery. */
const MAX_TSCONFIG_BYTES = 1024 * 1024;
const SPAWN_TIMEOUT_MS = 10_000;
/** git rename output is ~100 bytes per rename; Node's 1MB default caps at ~10k. */
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

/** Directories the walk never enters. */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
  'vendor',
  'tmp',
]);

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

/**
 * Run git with the repository's own config unable to name a program for git to
 * execute. This tool is pointed at repositories the operator did not write, and
 * `core.fsmonitor` / `diff.external` / a hooks path are program paths git will
 * run during a plain `git diff`. The user's global config is left alone on
 * purpose: `safe.directory` lives there and dropping it breaks real workflows.
 */
function runGit(cwd, args) {
  return spawnSync(
    'git',
    ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'diff.external=', ...args],
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: SPAWN_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      env: { ...process.env, GIT_EXTERNAL_DIFF: '' },
    }
  );
}

function safeRef(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._/^~-]{0,200}$/.test(value) &&
    !value.includes('..')
  );
}

/**
 * Renames between `baseRef` and the working tree.
 *
 * `git diff <ref>` (no second ref) compares the ref against the tree on disk, so
 * a rename that is staged but not yet committed is in the set too — the moment
 * the drift is cheapest to fix. (A bare `mv` without `git add` cannot be seen as
 * a rename by anyone: the destination is untracked.) Returns `[]` when git is
 * unavailable or the ref is unknown;
 * an empty rename set is not an error, it just means anchored mode has nothing
 * to anchor on.
 *
 * @param {string} root
 * @param {string | null | undefined} baseRef
 * @returns {{ renames: Array<{ from: string, to: string }>, available: boolean, reason: string | null }}
 */
export function gitRenameSet(root, baseRef) {
  if (!safeRef(baseRef)) return { renames: [], available: false, reason: 'no-base-ref' };
  const top = runGit(root, ['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return { renames: [], available: false, reason: 'not-a-git-repository' };
  const repoTop = top.stdout.trim();
  const verified = runGit(repoTop, ['rev-parse', '--verify', `${baseRef}^{commit}`, '--']);
  if (verified.status !== 0) return { renames: [], available: false, reason: 'unknown-base-ref' };
  const diff = runGit(repoTop, [
    'diff',
    '--find-renames',
    '--diff-filter=R',
    '--name-status',
    '-z',
    baseRef,
    '--',
  ]);
  if (diff.error?.code === 'ENOBUFS') {
    // Say which limit was hit. "diff-failed" would read as a git problem when
    // it is our buffer, and the caller must not take the resulting empty
    // rename set for "no renames".
    return { renames: [], available: false, reason: 'rename-set-too-large' };
  }
  if (diff.status !== 0) return { renames: [], available: false, reason: 'diff-failed' };

  // -z record layout for a rename: "R<score>\0<from>\0<to>\0"
  const fields = diff.stdout.split('\0');
  const renames = [];
  const prefix = repoRelativePrefix(repoTop, root);
  for (let i = 0; i < fields.length; i += 1) {
    if (!/^R\d*$/.test(fields[i] ?? '')) continue;
    const from = fields[i + 1];
    const to = fields[i + 2];
    i += 2;
    if (!from || !to) continue;
    const rebasedFrom = rebaseIntoRoot(from, prefix);
    const rebasedTo = rebaseIntoRoot(to, prefix);
    if (rebasedFrom === null || rebasedTo === null) continue;
    renames.push({ from: rebasedFrom, to: rebasedTo });
  }
  return { renames, available: true, reason: null };
}

/** Path of `root` relative to the repository top, POSIX, '' when they match. */
function repoRelativePrefix(repoTop, root) {
  const relative = toPosix(path.relative(path.resolve(repoTop), path.resolve(root)));
  return relative === '' || relative.startsWith('..') ? '' : relative;
}

/** Re-express a repo-top-relative path as root-relative; null when outside root. */
function rebaseIntoRoot(repoPath, prefix) {
  const normalized = toPosix(repoPath);
  if (prefix === '') return normalized;
  if (normalized === prefix) return '';
  return normalized.startsWith(`${prefix}/`) ? normalized.slice(prefix.length + 1) : null;
}

/**
 * Alias prefixes from the project's tsconfig `paths` (the `alias` form).
 *
 * Only single-target `X/*` → `Y/*` entries are used: a multi-target alias has
 * no one-directional rewrite, so it is left out rather than guessed at.
 *
 * @param {string} root
 * @param {string} [tsconfigPath]
 * @returns {Record<string, string>}
 */
export function aliasPrefixesFromTsconfig(root, tsconfigPath) {
  const rootResolved = path.resolve(root);
  const file = tsconfigPath
    ? path.resolve(rootResolved, tsconfigPath)
    : path.join(rootResolved, 'tsconfig.json');
  /** @type {Record<string, string>} */
  const out = {};
  try {
    // --tsconfig takes a path from the caller: keep it inside the tree.
    if (file !== rootResolved && !file.startsWith(rootResolved + path.sep)) {
      throw new Error('tsconfig outside root');
    }
    // Bounded: this file is the project's, and the project may be hostile.
    if (fs.statSync(file).size > MAX_TSCONFIG_BYTES) throw new Error('tsconfig too large');
    const raw = fs.readFileSync(file, 'utf8');
    // tsconfig allows comments and trailing commas; strip the common cases.
    // The block-comment pattern is anchored (no lazy rescan) so a file full of
    // unterminated `/*` cannot make this quadratic.
    const stripped = raw
      .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1');
    const parsed = JSON.parse(stripped);
    const baseUrl = toPosix(parsed?.compilerOptions?.baseUrl ?? '.').replace(/^\.\/?/, '');
    const paths = parsed?.compilerOptions?.paths ?? {};
    for (const [alias, targets] of Object.entries(paths)) {
      if (!Array.isArray(targets) || targets.length !== 1) continue;
      if (!alias.endsWith('/*')) continue;
      const target = toPosix(String(targets[0] ?? ''));
      if (!target.endsWith('/*')) continue;
      const root_ = joinPosix(baseUrl, target.slice(0, -1).replace(/^\.\//, ''));
      out[alias.slice(0, -1)] = root_;
    }
  } catch {
    /* no tsconfig, or not readable: fall through to the default below */
  }
  if (Object.keys(out).length === 0 && fs.existsSync(path.join(root, 'src'))) {
    out['@/'] = 'src/';
  }
  return out;
}

function joinPosix(left, right) {
  const l = toPosix(left).replace(/\/+$/, '');
  const r = toPosix(right).replace(/^\.\//, '');
  if (l === '' || l === '.') return r;
  if (r === '') return l;
  return `${l}/${r}`;
}

/**
 * First segments that make an unprefixed literal look like a repo path (the
 * `rootless` and `prose` forms).
 * Top-level directories of the root, plus the direct children of each include
 * root — `components/...` is drift-shaped precisely because `src/components`
 * exists.
 *
 * @param {string} root
 * @param {string[]} includeRoots
 */
export function deriveScanRoots(root, includeRoots) {
  const roots = new Set();
  const addChildren = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      roots.add(entry.name);
    }
  };
  addChildren(root);
  for (const include of includeRoots) addChildren(path.join(root, include));
  return [...roots].sort();
}

/**
 * Bounded text walk. Counts every refusal by reason — a file that is not read
 * is a file the scan cannot speak about, and that must be visible.
 *
 * @param {string} root
 * @param {{ maxFiles?: number }} [opts]
 */
export function collectDriftFiles(root, opts = {}) {
  const maxFiles = Number.isInteger(opts.maxFiles) && opts.maxFiles > 0 ? opts.maxFiles : DEFAULT_MAX_DRIFT_FILES;
  /** @type {Array<{ path: string, text: string }>} */
  const files = [];
  const discarded = {
    budget: 0,
    byteBudget: 0,
    oversize: 0,
    unreadable: 0,
    depthLimited: 0,
    generated: 0,
    symlink: 0,
    symlinkDir: 0,
  };
  let totalBytes = 0;
  const rootResolved = path.resolve(root);
  const seenDirs = new Set();

  const walk = (dir, depth) => {
    if (depth > MAX_WALK_DEPTH) {
      discarded.depthLimited += 1;
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      discarded.unreadable += 1;
      return;
    }
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        // A link is not proof this tree holds the file, and following one can
        // walk out of the root entirely. Counted, not silent — separately for a
        // linked file and a linked DIRECTORY, because the second one drops a
        // whole subtree and a monorepo is full of them.
        const rel = toPosix(path.relative(rootResolved, absolute));
        let linkedDirectory = false;
        try {
          linkedDirectory = fs.statSync(absolute).isDirectory();
        } catch {
          /* broken link: neither a file we could read nor a subtree */
        }
        if (linkedDirectory) discarded.symlinkDir += 1;
        else if (isLiteralPathScannable(rel)) discarded.symlink += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        let real;
        try {
          real = fs.realpathSync(absolute);
        } catch {
          discarded.unreadable += 1;
          continue;
        }
        if (seenDirs.has(real)) continue;
        seenDirs.add(real);
        walk(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = toPosix(path.relative(rootResolved, absolute));
      if (!isLiteralPathScannable(relative)) continue;
      if (isGeneratedLiteralPathFile(relative)) {
        discarded.generated += 1;
        continue;
      }
      if (files.length >= maxFiles) {
        discarded.budget += 1;
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(absolute);
      } catch {
        discarded.unreadable += 1;
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) {
        discarded.oversize += 1;
        continue;
      }
      if (totalBytes + stat.size > MAX_TOTAL_BYTES) {
        discarded.byteBudget += 1;
        continue;
      }
      try {
        files.push({ path: relative, text: fs.readFileSync(absolute, 'utf8') });
        totalBytes += stat.size;
      } catch {
        discarded.unreadable += 1;
      }
    }
  };

  walk(rootResolved, 0);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, discarded, maxFiles, totalBytes, maxTotalBytes: MAX_TOTAL_BYTES };
}

/**
 * The root as the filesystem sees it. Comparing a realpath against a lexical
 * root is a guaranteed mismatch wherever the root itself sits behind a link —
 * `/var` on macOS, a symlinked checkout, a container bind mount — and every
 * containment test would then answer "outside".
 */
function realRoot(root) {
  const resolved = path.resolve(root);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

/** True when `real` is the root or lives under it. */
function isInsideRoot(real, rootReal) {
  return real === rootReal || real.startsWith(rootReal + path.sep);
}

/** Existence probe over repo-relative paths, files and directories alike. */
export function makeExistsProbe(root) {
  const rootResolved = path.resolve(root);
  const rootReal = realRoot(root);
  const cache = new Map();
  return (relative) => {
    if (typeof relative !== 'string' || relative.length === 0) return false;
    const cached = cache.get(relative);
    if (cached !== undefined) return cached;
    const absolute = path.resolve(rootResolved, relative);
    // Never let a literal escape the root and answer about someone else's tree.
    // The lexical test is not enough on its own: existsSync follows symlinks,
    // so an in-root link to /etc would answer "yes" about /etc. Decide on the
    // REAL path — and a link that escapes the root answers no, which is the
    // conservative direction (a false "exists" would suppress a real finding).
    let answer = false;
    if (isInsideRoot(absolute, rootResolved)) {
      try {
        answer = isInsideRoot(fs.realpathSync.native(absolute), rootReal);
      } catch {
        answer = false;
      }
    }
    cache.set(relative, answer);
    return answer;
  };
}

/**
 * Full scan: walk, rename set, detect. Report only — nothing is written here.
 *
 * @param {string} root
 * @param {{ include?: string[] } | null | undefined} config
 * @param {{ baseRef?: string | null, tsconfig?: string, maxFiles?: number }} [opts]
 */
export function scanLiteralPathDrift(root, config, opts = {}) {
  const includeRoots = (config?.include ?? DEFAULT_INCLUDE_ROOTS).filter(
    (entry) => typeof entry === 'string' && entry.length > 0 && entry !== '.'
  );
  const scan = collectDriftFiles(root, { maxFiles: opts.maxFiles });
  const { files, discarded, maxFiles } = scan;
  const rename = gitRenameSet(root, opts.baseRef);
  const report = findLiteralPathDrift({
    files,
    exists: makeExistsProbe(root),
    renames: rename.renames,
    aliases: aliasPrefixesFromTsconfig(root, opts.tsconfig),
    roots: deriveScanRoots(root, includeRoots),
    rootlessPrefixes: includeRoots,
  });
  return {
    ...report,
    baseRef: opts.baseRef ?? null,
    renameSet: {
      available: rename.available,
      reason: rename.reason,
      renames: rename.renames.length,
    },
    scan: {
      maxFiles,
      discarded,
      totalBytes: scan.totalBytes,
      maxTotalBytes: scan.maxTotalBytes,
    },
  };
}

/**
 * Write the anchored fixes. Unanchored findings are never written — there is no
 * destination to write.
 *
 * Each file is re-read and re-verified at the token, so a file that changed
 * since the scan is skipped rather than corrupted.
 *
 * @param {string} root
 * @param {Array<object>} anchored
 */
export function writeLiteralPathDrift(root, anchored) {
  /** @type {Map<string, object[]>} */
  const byFile = new Map();
  for (const finding of anchored) {
    if (!finding || typeof finding.file !== 'string' || finding.suggestedToken == null) continue;
    const list = byFile.get(finding.file) ?? [];
    list.push(finding);
    byFile.set(finding.file, list);
  }
  const rootResolved = path.resolve(root);
  const rootReal = realRoot(root);
  const written = [];
  const skipped = [];
  for (const [relative, findings] of [...byFile].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const absolute = path.resolve(rootResolved, relative);
    if (!isInsideRoot(absolute, rootResolved)) {
      skipped.push({ file: relative, reason: 'outside-root', count: findings.length });
      continue;
    }
    // The parent must still be inside the root as the filesystem sees it: a
    // symlinked directory component would otherwise carry the write out of the
    // tree even though the leaf is a regular file.
    let realParent;
    try {
      realParent = fs.realpathSync.native(path.dirname(absolute));
    } catch {
      skipped.push({ file: relative, reason: 'unreadable', count: findings.length });
      continue;
    }
    if (!isInsideRoot(realParent, rootReal)) {
      skipped.push({ file: relative, reason: 'outside-root', count: findings.length });
      continue;
    }

    // One descriptor for the whole read-modify-write. Resolving the name twice
    // is the TOCTOU: between a check and a later `writeFileSync` the file can
    // become a link to somewhere else. O_NOFOLLOW refuses a symlinked leaf at
    // open time, and nlink refuses a hardlink planted to a file outside the
    // tree — lstat reports one as an ordinary file and the write would land on
    // the shared inode.
    let fd;
    try {
      fd = fs.openSync(absolute, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
    } catch (error) {
      const code = error?.code;
      skipped.push({
        file: relative,
        reason: code === 'ELOOP' || code === 'EMLINK' ? 'symlink' : 'unwritable',
        count: findings.length,
      });
      continue;
    }
    try {
      const stat = fs.fstatSync(fd);
      if (stat.nlink > 1) {
        skipped.push({ file: relative, reason: 'hard-link', count: findings.length });
        continue;
      }
      const buffer = Buffer.alloc(stat.size);
      fs.readSync(fd, buffer, 0, stat.size, 0);
      const text = buffer.toString('utf8');
      // Reading as utf8 turns an invalid byte into U+FFFD, and writing the whole
      // string back would destroy it — anywhere in the file, nowhere near the
      // finding. Round-tripping the buffer is the exact test.
      if (!Buffer.from(text, 'utf8').equals(buffer)) {
        skipped.push({ file: relative, reason: 'not-utf8', count: findings.length });
        continue;
      }
      const result = applyLiteralPathDrift(text, findings);
      if (result.applied.length === 0) {
        skipped.push({ file: relative, reason: 'token-moved', count: findings.length });
        continue;
      }
      const out = Buffer.from(result.text, 'utf8');
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, out, 0, out.length, 0);
      written.push({
        file: relative,
        applied: result.applied.length,
        // Identities, not just a count: the caller has to know WHICH findings
        // are gone from disk to report what is left.
        appliedFindings: result.applied.map((finding) => ({
          file: finding.file,
          line: finding.line,
          column: finding.column,
          token: finding.token,
        })),
      });
      if (result.skipped.length > 0) {
        skipped.push({ file: relative, reason: 'token-moved', count: result.skipped.length });
      }
    } catch {
      skipped.push({ file: relative, reason: 'unwritable', count: findings.length });
    } finally {
      try {
        fs.closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
  return { written, skipped };
}
