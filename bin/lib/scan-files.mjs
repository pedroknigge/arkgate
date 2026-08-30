/**
 * Governed source file walk / collection for ark-check.
 * Extracted from ark-check entry (R3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { isScanExcludedRelative } from '../ark-shared.mjs';

export const SOURCE_FILE_NAME = /\.[cm]?[tj]sx?$/;

/** Unit/e2e test files are not architecture surface — agents and Nest put them next
 *  to production code (*.spec.ts). Counting them as ungoverned forces false
 *  CONFIG_UNCLASSIFIED_FILES under --strict-config on every starter. */
export const TEST_FILE_NAME =
  /(^test(?:[-_.]).*|\.(spec|test)(?:-d)?\.)(tsx?|jsx?|mjsx?|cjsx?|mts|cts)$/i;

export function isGovernableSourceFile(name) {
  return SOURCE_FILE_NAME.test(name) && !name.endsWith('.d.ts') && !TEST_FILE_NAME.test(name);
}

export function isSkippedSourceDir(name) {
  return (
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'coverage' ||
    name === 'bench' ||
    name === 'benches' ||
    name === 'benchmark' ||
    name === 'benchmarks' ||
    name === 'docs' ||
    name === 'documentation' ||
    name === 'example' ||
    name === 'examples' ||
    name === 'fixture' ||
    name === 'fixtures' ||
    name === 'playground' ||
    name === '__tests__' ||
    name === '__mocks__' ||
    name === 'e2e' ||
    // Top-level style Nest/Jest folders (not "testing" helpers inside src)
    name === 'test' ||
    name === 'tests'
  );
}

function isInsideRoot(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

/**
 * Walk source files while treating symlinks explicitly.
 *
 * When `root` is provided, every resolved file/directory must stay inside it.
 * Internal symlink directories are followed once (TypeScript follows them too),
 * while escaping links fail closed instead of reading arbitrary filesystem paths.
 */
export function walk(dir, files = [], options = {}) {
  let state = options.state;
  if (!state) {
    if (options.root) options.observeInput?.(path.resolve(options.root), 'realpath');
    state = {
      root: options.root ? fs.realpathSync(options.root) : undefined,
      visitedDirectories: new Set(),
      visitedFiles: new Set(),
      observeInput: options.observeInput,
    };
  }
  state.observeInput?.(path.resolve(dir), 'lstat');
  const lstat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!lstat) return files;
  state.observeInput?.(path.resolve(dir), 'realpath');
  const resolved = fs.realpathSync(dir);
  if (state.root && !isInsideRoot(state.root, resolved)) {
    throw new Error(
      `Refusing to scan symlink outside project root: ${dir} -> ${resolved}`
    );
  }
  if (lstat.isSymbolicLink()) state.observeInput?.(path.resolve(dir), 'stat');
  const stat = lstat.isSymbolicLink()
    ? fs.statSync(dir, { throwIfNoEntry: false })
    : lstat;
  if (!stat) return files;
  // An `include` entry may be a single file (e.g. a root-level "middleware.ts"),
  // not just a directory — govern it directly instead of trying to scandir it
  // (which threw ENOTDIR). The extension filter still applies.
  if (stat.isFile()) {
    if (
      isGovernableSourceFile(path.basename(dir)) &&
      !state.visitedFiles.has(resolved)
    ) {
      state.visitedFiles.add(resolved);
      files.push(dir);
    }
    return files;
  }
  if (!stat.isDirectory()) return files;
  state.onDirectory?.(dir, resolved);
  if (state.visitedDirectories.has(resolved)) return files;
  state.visitedDirectories.add(resolved);
  state.observeInput?.(path.resolve(dir), 'directory');
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isSkippedSourceDir(entry.name)) continue;
      walk(full, files, { state });
    } else if (entry.isSymbolicLink()) {
      if (isSkippedSourceDir(entry.name)) continue;
      walk(full, files, { state });
    } else if (isGovernableSourceFile(entry.name)) {
      walk(full, files, { state });
    }
  }
  return files;
}

/** Walk include roots then drop codegen / config.exclude (universal scan filter). */
export function collectGovernedFiles(root, config, options = {}) {
  options.observeInput?.(path.resolve(root), 'realpath');
  const state = {
    root: fs.realpathSync(root),
    visitedDirectories: new Set(),
    visitedFiles: new Set(),
    onDirectory: options.onDirectory,
    observeInput: options.observeInput,
  };
  const raw = (config.include ?? []).flatMap((entry) =>
    walk(path.join(root, entry), [], { state })
  );
  return raw.filter((abs) => {
    const rel = normalize(path.relative(root, abs));
    return !isScanExcludedRelative(rel, config);
  });
}

export function normalize(value) {
  return value.split(path.sep).join('/');
}

/**
 * Default ceiling for `countUngovernedSourceFiles`. The caller needs "does this tree
 * hold source at all", not a census, so stopping early keeps the probe off the hot path.
 */
export const UNGOVERNED_PROBE_CAP = 200;

/** Tooling configs (vite.config.ts, eslint.config.js …) are not the product source a contract governs. */
export const TOOLING_CONFIG_FILE_NAME = /\.config\.[cm]?[jt]sx?$/i;

/**
 * Count governable source files under `root` that the contract's own scope cannot hide.
 *
 * Deliberately NOT `collectGovernedFiles(root, { ...config, include: ['.'] })`. That
 * variant keeps `config.exclude`, so `exclude: ["**"]` makes the tree look empty — the
 * contract under suspicion would get to answer the question about itself, and a green
 * over zero governed files comes back through the side door.
 *
 * Also deliberately narrow, so the count is evidence and not noise:
 * - dot-directories are skipped (`.git` fan-out is not source, and walking it is expensive);
 * - `isSkippedSourceDir` names are skipped, matching the governed walk;
 * - symlinks are never followed — a link is not proof this tree holds source, and following
 *   one can escape the root and turn a diagnostic into a crash;
 * - `*.config.*` files are skipped: a polyglot or TS-less repo whose only TS/JS is
 *   `vite.config.ts` has no product source here, and must not be told otherwise;
 * - unreadable directories are skipped rather than thrown: this is a probe, not a gate.
 *
 * @param {string} root
 * @param {number} [cap]
 * @returns {number} source files found, capped at `cap`
 */
export function countUngovernedSourceFiles(root, cap = UNGOVERNED_PROBE_CAP) {
  let count = 0;
  const stack = [root];
  while (stack.length > 0 && count < cap) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (count >= cap) break;
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (!isSkippedSourceDir(entry.name)) stack.push(path.join(dir, entry.name));
      } else if (entry.isFile() && isGovernableSourceFile(entry.name)) {
        if (!TOOLING_CONFIG_FILE_NAME.test(entry.name)) count += 1;
      }
    }
  }
  return count;
}
