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
 * Declared invariant ids from an Effective catalog. Empty when the extra is off.
 * @param {{ invariants?: Array<{ id?: unknown }> } | null | undefined} arkRules
 * @returns {string[]}
 */
export function invariantIdsFromCatalog(arkRules) {
  return (arkRules?.invariants ?? [])
    .map((inv) => inv?.id)
    .filter((id) => typeof id === 'string' && id.length > 0);
}

/**
 * @param {string} root
 * @param {{ files?: Array<{ path: string }> }} facts
 * @param {{ testGlobs?: string[], invariantIds?: string[] }} [opts]
 * @returns {{
 *   fileContents: Record<string, string>,
 *   testFiles: string[],
 *   testGlobsMissing: boolean,
 *   coverageBudgetExhausted: boolean,
 * }}
 */
export function loadInvariantCoverageInputs(root, facts, opts = {}) {
  const fileContents = {};
  const testFiles = [];
  const seen = new Set();
  // Declared invariant ids. When present, a test file is RETAINED only if it
  // mentions one: scanning is cheap (hundreds of small files), retaining is
  // what costs memory. Without this the budget goes to whichever N tests the
  // walk reaches first — an arbitrary order — so coverage is wrong on any repo
  // with more test files than budget. Measured: 707 tests against a cap of 400.
  const invariantIds = Array.isArray(opts.invariantIds)
    ? opts.invariantIds.filter((id) => typeof id === 'string' && id.length > 0)
    : [];
  const mentionsInvariant = (content) =>
    invariantIds.length === 0 || invariantIds.some((id) => content.includes(id));
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
      const asTest = forceAsTest || isTestPath(rel);
      // A test that names no invariant is evidence of nothing: scan it, drop
      // it, and let it cost no budget.
      if (asTest && !mentionsInvariant(content)) return;
      seen.add(rel);
      fileContents[rel] = content;
      if (asTest) testFiles.push(rel);
    } catch {
      // skip unreadable
    }
  };

  // Tests FIRST, then production files.
  //
  // The order is load-bearing, not stylistic. `pushFile` stops at
  // MAX_COVERAGE_FILES, and a real repo has far more production files than the
  // budget — so walking facts first consumed the whole budget and the test walk
  // pushed nothing. Coverage then reported `testGlobsMissing: true`, which the
  // caller renders as "never-had-tests": a claim about the USER's repo that was
  // actually about our own budget. Measured on a 4511-file project: every
  // invariant reported uncovered while its test sat on disk with the invariant
  // id in the describe title. Tests are tens of files, not thousands, so giving
  // them the head of the budget costs the production scan nothing in practice.
  const testWalkRoots = useCustomGlobs
    ? ['.', 'tests', 'test', 'src', '__tests__', 'spec']
    : ['tests', 'test', 'src', '__tests__'];
  for (const dir of testWalkRoots) {
    const absDir = path.join(root, dir === '.' ? '' : dir);
    if (!fs.existsSync(absDir)) continue;
    walkTestFiles(absDir, root, (rel) => {
      if (isTestPath(rel)) pushFile(rel, true);
    });
  }

  for (const file of facts?.files ?? []) {
    if (file?.path) pushFile(file.path);
  }

  const testGlobsMissing = testFiles.length === 0;
  return {
    fileContents,
    testFiles,
    testGlobsMissing,
    coverageBudgetExhausted: seen.size >= MAX_COVERAGE_FILES,
  };
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
