/**
 * Tooling I/O for ArkRules invariant coverage (AR10).
 * Pure evaluation lives in Domain (`evaluateInvariantCoverage`); this module
 * discovers test files and loads contents from disk (bounded).
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TEST_NAME_RE =
  /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$|\/__tests__\/|\/tests?\//i;

/** Max files to load for coverage evidence (budget). */
const MAX_COVERAGE_FILES = 400;
/** Max bytes per file when reading for title/symbol mining. */
const MAX_FILE_BYTES = 256 * 1024;

/**
 * True when absolute is root or a file under root (separator-safe).
 * @param {string} root
 * @param {string} absolute
 */
function isPathInsideRoot(root, absolute) {
  const rootResolved = path.resolve(root);
  const absResolved = path.resolve(absolute);
  if (absResolved === rootResolved) return true;
  const relative = path.relative(rootResolved, absResolved);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Minimal glob match for testGlobs (double-star slash = zero path segments).
 * @param {string} glob
 * @param {string} file
 */
function matchSimpleGlob(glob, file) {
  const pattern = String(glob || '').replace(/\\/g, '/');
  const target = String(file || '').replace(/\\/g, '/');
  if (!pattern) return false;
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`).test(target);
}

/**
 * @param {string} root
 * @param {{ files?: Array<{ path: string }> }} facts
 * @param {{ testGlobs?: string[] }} [opts]
 * @returns {{ fileContents: Record<string, string>, testFiles: string[], testGlobsMissing: boolean }}
 */
export function loadInvariantCoverageInputs(root, facts, opts = {}) {
  const fileContents = {};
  const testFiles = [];
  const seen = new Set();
  const testGlobs = Array.isArray(opts.testGlobs)
    ? opts.testGlobs.filter((g) => typeof g === 'string' && g.length > 0)
    : [];
  const useCustomGlobs = testGlobs.length > 0;

  const isTestPath = (rel) => {
    if (useCustomGlobs) return testGlobs.some((g) => matchSimpleGlob(g, rel));
    return DEFAULT_TEST_NAME_RE.test(rel);
  };

  const pushFile = (relPath, forceAsTest = false) => {
    const rel = String(relPath || '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '');
    if (!rel || seen.has(rel) || seen.size >= MAX_COVERAGE_FILES) return;
    const absolute = path.resolve(root, rel);
    if (!isPathInsideRoot(root, absolute)) return;
    try {
      const stat = fs.statSync(absolute);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return;
      const content = fs.readFileSync(absolute, 'utf8');
      seen.add(rel);
      fileContents[rel] = content;
      if (forceAsTest || isTestPath(rel)) testFiles.push(rel);
    } catch {
      // skip unreadable
    }
  };

  for (const file of facts?.files ?? []) {
    if (file?.path) pushFile(file.path);
  }

  if (useCustomGlobs) {
    // Walk project roots and keep files matching custom globs.
    for (const dir of ['.', 'tests', 'test', 'src', '__tests__', 'spec']) {
      const absDir = path.join(root, dir === '.' ? '' : dir);
      if (!fs.existsSync(absDir)) continue;
      walkTestFiles(absDir, root, (rel) => {
        if (isTestPath(rel)) pushFile(rel, true);
      });
    }
  } else {
    // Walk common test roots when facts only cover production include globs.
    for (const dir of ['tests', 'test', 'src', '__tests__']) {
      const absDir = path.join(root, dir);
      if (!fs.existsSync(absDir)) continue;
      walkTestFiles(absDir, root, (rel) => {
        if (isTestPath(rel)) pushFile(rel, true);
      });
    }
  }

  const testGlobsMissing = testFiles.length === 0;
  return { fileContents, testFiles, testGlobsMissing };
}

/**
 * @param {string} dir
 * @param {string} root
 * @param {(rel: string) => void} onFile
 * @param {number} [depth]
 */
function walkTestFiles(dir, root, onFile, depth = 0) {
  if (depth > 8) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTestFiles(absolute, root, onFile, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = path.relative(root, absolute).replace(/\\/g, '/');
    onFile(rel);
  }
}
