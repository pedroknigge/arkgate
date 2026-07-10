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
  /\.(spec|test)\.(tsx?|jsx?|mts|cts)$/i;

export function isGovernableSourceFile(name) {
  return SOURCE_FILE_NAME.test(name) && !name.endsWith('.d.ts') && !TEST_FILE_NAME.test(name);
}

export function isSkippedSourceDir(name) {
  return (
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'coverage' ||
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
  const state = options.state ?? {
    root: options.root ? fs.realpathSync(options.root) : undefined,
    visitedDirectories: new Set(),
    visitedFiles: new Set(),
  };
  const lstat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!lstat) return files;
  const resolved = fs.realpathSync(dir);
  if (state.root && !isInsideRoot(state.root, resolved)) {
    throw new Error(
      `Refusing to scan symlink outside project root: ${dir} -> ${resolved}`
    );
  }
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
  if (state.visitedDirectories.has(resolved)) return files;
  state.visitedDirectories.add(resolved);
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
export function collectGovernedFiles(root, config) {
  const state = {
    root: fs.realpathSync(root),
    visitedDirectories: new Set(),
    visitedFiles: new Set(),
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
