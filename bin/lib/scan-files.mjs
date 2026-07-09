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

export function walk(dir, files = []) {
  const stat = fs.statSync(dir, { throwIfNoEntry: false });
  if (!stat) return files;
  // An `include` entry may be a single file (e.g. a root-level "middleware.ts"),
  // not just a directory — govern it directly instead of trying to scandir it
  // (which threw ENOTDIR). The extension filter still applies.
  if (stat.isFile()) {
    if (isGovernableSourceFile(path.basename(dir))) files.push(dir);
    return files;
  }
  if (!stat.isDirectory()) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isSkippedSourceDir(entry.name)) continue;
      walk(full, files);
    } else if (isGovernableSourceFile(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Walk include roots then drop codegen / config.exclude (universal scan filter). */
export function collectGovernedFiles(root, config) {
  const raw = (config.include ?? []).flatMap((entry) => walk(path.join(root, entry)));
  return raw.filter((abs) => {
    const rel = normalize(path.relative(root, abs));
    return !isScanExcludedRelative(rel, config);
  });
}

export function normalize(value) {
  return value.split(path.sep).join('/');
}
