/**
 * Tooling I/O for ArkRules invariant coverage (AR10).
 * Pure evaluation lives in Domain (`evaluateInvariantCoverage`); this module
 * discovers test files and loads contents from disk (bounded).
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TEST_NAME_RE =
  /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$|\/__tests__\/|\/tests?\//i;

/** Default max files to load for coverage evidence (budget). Config: `coverage.maxFiles`. */
export const DEFAULT_MAX_COVERAGE_FILES = 400;
/** Max bytes per file when reading for title/symbol mining. */
const MAX_FILE_BYTES = 256 * 1024;
/** Max directory depth for the test walk. Deeper directories are counted, not silent. */
const MAX_WALK_DEPTH = 8;

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
 * Coverage scan options carried by ark.config.json (`coverage`).
 * Absent config → `{}`: the built-in heuristic and default budget stay in force.
 * @param {{ coverage?: { testGlobs?: unknown, maxFiles?: unknown, coverageRoots?: unknown } } | null | undefined} config
 * @returns {{ testGlobs?: string[], maxFiles?: number, coverageRoots?: string[] }}
 */
export function coverageOptionsFromConfig(config) {
  const coverage = config?.coverage;
  if (!coverage || typeof coverage !== 'object') return {};
  const options = {};
  if (Array.isArray(coverage.testGlobs)) {
    const globs = coverage.testGlobs.filter((g) => typeof g === 'string' && g.length > 0);
    if (globs.length > 0) options.testGlobs = globs;
  }
  if (Number.isInteger(coverage.maxFiles) && coverage.maxFiles > 0) {
    options.maxFiles = coverage.maxFiles;
  }
  if (Array.isArray(coverage.coverageRoots)) {
    const roots = coverage.coverageRoots.filter((r) => typeof r === 'string' && r.length > 0);
    if (roots.length > 0) options.coverageRoots = roots;
  }
  return options;
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
 * @param {{ testGlobs?: string[], invariantIds?: string[], maxFiles?: number, coverageRoots?: string[] }} [opts]
 * @returns {{
 *   fileContents: Record<string, string>,
 *   testFiles: string[],
 *   testGlobsMissing: boolean,
 *   coverageBudgetExhausted: boolean,
 *   coverageRoots?: string[],
 *   stats: {
 *     filesLoaded: number,
 *     testFilesRetained: number,
 *     maxFiles: number,
 *     discarded: {
 *       budget: number,
 *       noInvariantMention: number,
 *       oversize: number,
 *       unreadable: number,
 *       depthLimited: number,
 *       outOfRoot: number,
 *     },
 *   },
 * }}
 */
export function loadInvariantCoverageInputs(root, facts, opts = {}) {
  const fileContents = {};
  const testFiles = [];
  const seen = new Set();
  // Every path pushFile has already judged, retained or not. `seen` holds only
  // what was retained, so without this the walk roots overlap ('.' contains
  // 'tests' and 'src') and one discarded file is counted — and read — once per
  // overlapping root. The numbers we print must count files, not visits.
  const offered = new Set();
  const maxFiles =
    Number.isInteger(opts.maxFiles) && opts.maxFiles > 0
      ? opts.maxFiles
      : DEFAULT_MAX_COVERAGE_FILES;
  // Every discard is counted. A file dropped without a number is a coverage
  // verdict the user cannot explain.
  const discarded = {
    budget: 0,
    noInvariantMention: 0,
    oversize: 0,
    unreadable: 0,
    depthLimited: 0,
    outOfRoot: 0,
  };
  // Root with every symlink resolved, computed once: the containment test for
  // symlinked candidates compares resolved path to resolved root.
  let realRoot = root;
  try {
    realRoot = fs.realpathSync.native(root);
  } catch {
    // Unresolvable root: fall back to the literal path rather than failing the
    // whole scan. Containment is then as strict as it was before.
  }
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
    if (!rel || offered.has(rel)) return;
    offered.add(rel);
    const absolute = path.resolve(root, rel);
    if (!isPathInsideRoot(root, absolute)) return;
    try {
      const stat = fs.statSync(absolute);
      // Not a file (directory, socket, symlink to a directory): never a
      // coverage candidate, so it is not a discard either.
      if (!stat.isFile()) return;
      // statSync followed the link. A symlink that leaves the root must not
      // become evidence: an out-of-root file naming an invariant would forge
      // coverage for a test that is not in this repo. Compared against the
      // resolved root so a repo living under a symlinked prefix (macOS /tmp)
      // is not mistaken for an escape. Counted, never silent.
      if (!isPathInsideRoot(realRoot, fs.realpathSync.native(absolute))) {
        discarded.outOfRoot += 1;
        return;
      }
      if (stat.size > MAX_FILE_BYTES) {
        discarded.oversize += 1;
        return;
      }
      // The budget bounds candidates, not visits: a directory or an
      // out-of-root path was never going to be evidence, so counting it as a
      // budget casualty would send the user to raise a cap that was not the
      // reason. Checked here so a file past the cap is never read either.
      if (seen.size >= maxFiles) {
        discarded.budget += 1;
        return;
      }
      const content = fs.readFileSync(absolute, 'utf8');
      const asTest = forceAsTest || isTestPath(rel);
      // A test that names no invariant is evidence of nothing: scan it, drop
      // it, and let it cost no budget.
      if (asTest && !mentionsInvariant(content)) {
        discarded.noInvariantMention += 1;
        return;
      }
      seen.add(rel);
      fileContents[rel] = content;
      if (asTest) testFiles.push(rel);
    } catch {
      // Unreadable (permissions, broken symlink, file moved mid-scan): counted,
      // never dropped in silence.
      discarded.unreadable += 1;
    }
  };

  // Tests FIRST, then production files.
  //
  // The order is load-bearing, not stylistic. `pushFile` stops at the file
  // budget (`coverage.maxFiles`, default 400), and a real repo has far more
  // production files than the budget — so walking facts first consumed the
  // whole budget and the test walk pushed nothing. Coverage then reported `testGlobsMissing: true`, which the
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
    walkTestFiles(
      absDir,
      root,
      (rel) => {
        if (isTestPath(rel)) pushFile(rel, true);
      },
      0,
      discarded
    );
  }

  for (const file of facts?.files ?? []) {
    if (file?.path) pushFile(file.path);
  }

  // Echoed, not applied here: the roots are a declaration Domain compares the
  // scan against. Tooling filtering by them would hide the disagreement that is
  // the whole point of the declaration.
  const coverageRoots = Array.isArray(opts.coverageRoots)
    ? opts.coverageRoots.filter((r) => typeof r === 'string' && r.length > 0)
    : [];
  const testGlobsMissing = testFiles.length === 0;
  return {
    fileContents,
    testFiles,
    testGlobsMissing,
    ...(coverageRoots.length > 0 ? { coverageRoots } : {}),
    // Exhausted means the cap actually cost the user a file. Landing exactly
    // on the cap with nothing dropped is a full budget, not an exhausted one:
    // reporting it would tell the user to raise a cap that discarded nothing.
    coverageBudgetExhausted: discarded.budget > 0,
    stats: {
      filesLoaded: seen.size,
      testFilesRetained: testFiles.length,
      maxFiles,
      discarded,
    },
  };
}

/**
 * @param {string} dir
 * @param {string} root
 * @param {(rel: string) => void} onFile
 * @param {number} [depth]
 * @param {{ unreadable: number, depthLimited: number }} [discarded]
 */
function walkTestFiles(dir, root, onFile, depth = 0, discarded) {
  if (depth > MAX_WALK_DEPTH) {
    // The whole subtree is dropped here — say so with a number.
    if (discarded) discarded.depthLimited += 1;
    return;
  }
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    if (discarded) discarded.unreadable += 1;
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTestFiles(absolute, root, onFile, depth + 1, discarded);
      continue;
    }
    // Symlinks are candidates too: pushFile stats through them, so a broken one
    // is counted as unreadable instead of vanishing from the walk.
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    const rel = path.relative(root, absolute).replace(/\\/g, '/');
    onFile(rel);
  }
}
