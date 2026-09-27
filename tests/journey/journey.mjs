#!/usr/bin/env node
/**
 * Packed journey. `journey(fixture, steps)` installs the packed tarball into a
 * throwaway copy of a vendored repo, runs the steps, and returns one observation.
 * The golden is `canonicalJson` of that value. Callers do not pack, copy, install,
 * spawn, normalize, or diff.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveCandidate } from '../../scripts/ts-compat-matrix.mjs';
import { JOURNEYS } from './journeys.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const FIXTURE_ROOT = 'tests/fixtures/journey';
const GOLDEN_DIR = path.join(REPO_ROOT, 'tests/journey/goldens');
const BINS = new Set(['ark-check', 'arkgate-check']);
const STEP_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 180_000;
const MAX_BUFFER = 16 * 1024 * 1024;

export class JourneyError extends Error {
  /**
   * @param {string} kind
   * @param {string} message
   */
  constructor(kind, message) {
    super(message);
    this.name = 'JourneyError';
    this.kind = kind;
  }
}

/** @type {string | undefined} */
let packedTarball;

/**
 * @param {string} fixture
 * @param {readonly (readonly string[])[]} steps
 * @param {{ candidate?: { tarball?: string, artifactDir?: string }, keep?: boolean }} [options]
 */
export async function journey(fixture, steps, options = {}) {
  assertFixtureName(fixture);
  assertSteps(steps);
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ark-journey-${fixture}-`));
  const project = path.join(runRoot, 'project');
  const home = path.join(runRoot, 'home');
  const tmp = path.join(runRoot, 'tmp');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  fs.mkdirSync(tmp);
  try {
    const candidate = resolveJourneyCandidate(options.candidate ?? {}, runRoot);
    copyFixtureFromIndex(fixture, project);
    commitFixture(project);
    const version = installCandidate(project, candidate.copied);
    const binFor = installedBins(project, version);
    let before = snapshotTree(project);
    const observedSteps = [];
    for (const step of steps) {
      const [bin, ...args] = step;
      const result = spawnSync(process.execPath, [binFor.get(bin), ...args], {
        cwd: project,
        encoding: 'utf8',
        timeout: STEP_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: stepEnv(home, tmp),
      });
      if (result.error || result.status === null) {
        throw new JourneyError(
          'spawn',
          `${bin} ${args.join(' ')} did not exit: ${result.error?.message ?? result.stderr ?? 'no status'}`
        );
      }
      const after = snapshotTree(project);
      const output = projectStep(step, result.stdout, { project, runRoot, version });
      observedSteps.push({
        command: commandText(step),
        exitCode: result.status,
        filesDiff: diffSnapshots(before, after),
        output,
      });
      before = after;
    }
    return canonicalize({
      fixture,
      schemaVersion: 1,
      steps: observedSteps,
    });
  } finally {
    if (options.keep) {
      process.stderr.write(`journey keep ${project}\n`);
    } else {
      fs.rmSync(runRoot, { recursive: true, force: true });
    }
  }
}

/**
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function listJourneys(repoRoot = REPO_ROOT) {
  const names = Object.keys(JOURNEYS).sort();
  const fixtureDir = path.join(repoRoot, FIXTURE_ROOT);
  const dirs = fs.existsSync(fixtureDir)
    ? fs.readdirSync(fixtureDir).filter((name) => fs.statSync(path.join(fixtureDir, name)).isDirectory()).sort()
    : [];
  const goldens = fs.existsSync(GOLDEN_DIR)
    ? fs.readdirSync(GOLDEN_DIR).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)).sort()
    : [];
  const same = JSON.stringify(names) === JSON.stringify(dirs) && JSON.stringify(names) === JSON.stringify(goldens);
  if (!same) {
    throw new JourneyError(
      'registry',
      `journey registry, fixture dirs, and goldens disagree\n  registry: ${names.join(', ') || '(none)'}\n  dirs: ${dirs.join(', ') || '(none)'}\n  goldens: ${goldens.join(', ') || '(none)'}`
    );
  }
  return names;
}

function assertFixtureName(fixture) {
  if (!Object.hasOwn(JOURNEYS, fixture)) {
    throw new JourneyError('fixture', `unknown journey fixture: ${fixture}`);
  }
  const dir = path.join(REPO_ROOT, FIXTURE_ROOT, fixture);
  if (!fs.existsSync(path.join(dir, 'ark.config.json'))) {
    throw new JourneyError('fixture', `missing ark.config.json in ${FIXTURE_ROOT}/${fixture}`);
  }
}

/** @param {readonly (readonly string[])[]} steps */
function assertSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new JourneyError('step', 'steps must be a non-empty list');
  }
  for (const step of steps) {
    if (!Array.isArray(step) || step.length < 2) {
      throw new JourneyError('step', 'a step is [bin, ...args] and must include --json');
    }
    const [bin, ...args] = step;
    if (!BINS.has(bin)) {
      throw new JourneyError('step', `step bin must be ark-check or arkgate-check, got ${bin}`);
    }
    if (!args.includes('--json')) {
      throw new JourneyError('step', `${commandText(step)} must pass --json`);
    }
    for (const arg of args) {
      if (arg === '--root' || arg === '--watch' || arg === '--open' || arg === '--resident') {
        throw new JourneyError('step', `${commandText(step)} must stay inside the installed copy`);
      }
      if (path.isAbsolute(arg) || arg.includes('..')) {
        throw new JourneyError('step', `${commandText(step)} must not escape the copy (${arg})`);
      }
    }
  }
}

function commandText(step) {
  return step
    .map((part) => (/[\s"]/.test(part) ? JSON.stringify(part) : part))
    .join(' ');
}

/**
 * @param {{ tarball?: string, artifactDir?: string }} candidate
 * @param {string} runRoot
 */
function resolveJourneyCandidate(candidate, runRoot) {
  const work = path.join(runRoot, 'candidate-work');
  fs.mkdirSync(work, { recursive: true });
  if (candidate.artifactDir) return resolveCandidate({ artifactDir: candidate.artifactDir }, work);
  if (candidate.tarball) return resolveCandidate({ tarball: candidate.tarball }, work);
  if (process.env.CI) {
    throw new JourneyError('candidate', 'self-pack is refused when CI is set; pass --artifact-dir');
  }
  if (!packedTarball) {
    const stageWork = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-journey-pack-')), 'work');
    fs.mkdirSync(stageWork);
    packedTarball = resolveCandidate({}, stageWork).copied;
  }
  return resolveCandidate({ tarball: packedTarball }, work);
}

function copyFixtureFromIndex(fixture, dest) {
  const relRoot = `${FIXTURE_ROOT}/${fixture}`;
  const untracked = git(REPO_ROOT, ['ls-files', '--others', '--exclude-standard', '-z', '--', relRoot]);
  const extras = untracked.split('\0').filter(Boolean);
  if (extras.length > 0) {
    throw new JourneyError(
      'fixture',
      `untracked files in ${relRoot}: ${extras.join(', ')}. git add them, or delete them, before the journey copies the index.`
    );
  }
  const listed = git(REPO_ROOT, ['ls-files', '--cached', '-z', '--', relRoot]);
  const files = listed.split('\0').filter(Boolean);
  if (files.length === 0) {
    throw new JourneyError('fixture', `no tracked files under ${relRoot}`);
  }
  for (const rel of files) {
    const target = path.join(dest, path.relative(relRoot, rel));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, rel), target);
  }
}

function commitFixture(project) {
  git(project, ['init', '-b', 'main']);
  fs.mkdirSync(path.join(project, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(project, '.git', 'info', 'exclude'), 'node_modules/\n');
  git(project, ['add', '-A']);
  git(
    project,
    ['-c', 'user.email=journey@example.invalid', '-c', 'user.name=journey', 'commit', '-m', 'fixture'],
    {
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    }
  );
}

function installCandidate(project, tarball) {
  const pkgPath = path.join(project, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.devDependencies = {
    ...(pkg.devDependencies ?? {}),
    arkgate: pathToFileURL(tarball).href,
  };
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const installed = spawnSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'],
    {
      cwd: project,
      encoding: 'utf8',
      timeout: INSTALL_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    }
  );
  if (installed.status !== 0) {
    throw new JourneyError('install', `npm install failed\n${installed.stderr || installed.stdout}`);
  }
  const manifestPath = path.join(project, 'node_modules', 'arkgate', 'package.json');
  if (!fs.existsSync(manifestPath)) {
    throw new JourneyError('install', 'installed package is missing node_modules/arkgate/package.json');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new JourneyError('install', 'installed arkgate has no version');
  }
  return manifest.version;
}

function installedBins(project, version) {
  const root = path.join(project, 'node_modules', 'arkgate');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const map = new Map();
  for (const bin of BINS) {
    const rel = manifest.bin?.[bin];
    if (typeof rel !== 'string') {
      throw new JourneyError('install', `installed arkgate@${version} has no bin ${bin}`);
    }
    const absolute = path.resolve(root, rel);
    const insideProject = absolute.startsWith(`${project}${path.sep}`);
    const insideCheckout = absolute.startsWith(`${REPO_ROOT}${path.sep}`);
    if (!insideProject || insideCheckout) {
      throw new JourneyError('install', `${bin} resolved outside the installed copy: ${absolute}`);
    }
    map.set(bin, absolute);
  }
  return map;
}

function stepEnv(home, tmp) {
  return {
    PATH: process.env.PATH ?? '',
    HOME: home,
    USERPROFILE: home,
    TMPDIR: tmp,
    TMP: tmp,
    TEMP: tmp,
    TZ: 'UTC',
    LANG: 'C.UTF-8',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    ARK_NO_OPEN_REPORT: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
}

/**
 * Copy tracked fixture files only. A doctor run inside the source tree leaves
 * `.ark/` behind; that directory is gitignored, so an index copy cannot pick it up.
 * @param {string} cwd
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [extraEnv]
 */
function git(cwd, args, extraEnv) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', ...extraEnv },
  });
  if (result.status !== 0) {
    throw new JourneyError('fixture', `git ${args.join(' ')} failed\n${result.stderr || result.stdout}`);
  }
  return result.stdout ?? '';
}

function snapshotTree(root) {
  /** @type {Map<string, string>} */
  const files = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const absolute = path.join(dir, entry.name);
      const rel = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        files.set(rel, fs.readFileSync(absolute));
      }
    }
  };
  walk(root);
  return files;
}

function diffSnapshots(before, after) {
  /** @type {Record<string, 'added' | 'modified' | 'deleted'>} */
  const diff = {};
  for (const [rel, content] of after) {
    if (!before.has(rel)) diff[rel] = 'added';
    else if (!before.get(rel).equals(content)) diff[rel] = 'modified';
  }
  for (const rel of before.keys()) {
    if (!after.has(rel)) diff[rel] = 'deleted';
  }
  return diff;
}

function projectStep(step, stdout, ctx) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new JourneyError('view', `${commandText(step)} did not print JSON\n${stdout.slice(0, 500)}`);
  }
  const args = step.slice(1);
  const projected = args.includes('--doctor') ? doctorView(parsed) : checkView(parsed);
  const normalized = applyPlaceholders(projected, ctx);
  const residual = JSON.stringify(normalized);
  if (residual.includes(ctx.project) || residual.includes(ctx.runRoot) || residual.includes(os.homedir())) {
    throw new JourneyError('view', `${commandText(step)} observation still contains a machine path`);
  }
  return normalized;
}

function checkView(parsed) {
  requireFields(parsed, ['valid', 'ok', 'completeness', 'violations'], 'check');
  if (!Array.isArray(parsed.violations)) {
    throw new JourneyError('view', 'check JSON violations must be an array');
  }
  const diagnostics = parsed.violations.map((row) => {
    if (!row || typeof row !== 'object') {
      throw new JourneyError('view', 'check violation is not an object');
    }
    requireFields(row, ['ruleId', 'message'], 'check violation');
    const severity =
      typeof row.severity === 'string'
        ? row.severity
        : row.failsStrict === false
          ? 'warning'
          : 'error';
    return {
      ruleId: String(row.ruleId),
      severity,
      file: row.file == null ? null : String(row.file),
      ...(row.arkruleId == null ? {} : { arkruleId: String(row.arkruleId) }),
      message: String(row.message),
    };
  });
  diagnostics.sort(compareRows(['ruleId', 'arkruleId', 'file', 'message']));
  return {
    valid: parsed.valid === true,
    ok: parsed.ok === true,
    completeness: String(parsed.completeness),
    diagnostics,
  };
}

function doctorView(parsed) {
  const section = parsed?.doctor?.rulesUnderContract;
  if (!section || section.active !== true) {
    throw new JourneyError('view', 'doctor JSON has no active doctor.rulesUnderContract');
  }
  requireFields(
    section,
    ['coveredSample', 'uncovered', 'symbolEvidence', 'coveredTruncated', 'uncoveredTruncated'],
    'doctor.rulesUnderContract'
  );
  if (section.coveredTruncated > 0 || section.uncoveredTruncated > 0) {
    throw new JourneyError(
      'view',
      `doctor coverage list is truncated (covered ${section.coveredTruncated}, uncovered ${section.uncoveredTruncated})`
    );
  }
  if (!Array.isArray(section.coveredSample) || !Array.isArray(section.uncovered) || !Array.isArray(section.symbolEvidence)) {
    throw new JourneyError('view', 'doctor coverage lists must be arrays');
  }
  const covered = section.coveredSample.map((row) => idOf(row, 'coveredSample'));
  const uncovered = section.uncovered.map((row) => idOf(row, 'uncovered'));
  const overlap = covered.filter((id) => uncovered.includes(id));
  if (overlap.length > 0) {
    throw new JourneyError('view', `invariant listed covered and uncovered: ${overlap.join(', ')}`);
  }
  const symbolEvidence = section.symbolEvidence.map((row) => {
    if (!row || typeof row.id !== 'string' || typeof row.file !== 'string') {
      throw new JourneyError('view', 'symbolEvidence row needs id and file');
    }
    return { id: row.id, file: row.file };
  });
  symbolEvidence.sort(compareRows(['id', 'file']));
  covered.sort();
  uncovered.sort();
  return {
    rulesUnderContract: {
      covered,
      uncovered,
      symbolEvidence,
    },
  };
}

function idOf(row, label) {
  if (!row || typeof row.id !== 'string' || row.id.length === 0) {
    throw new JourneyError('view', `${label} row needs an id`);
  }
  return row.id;
}

function requireFields(value, fields, label) {
  if (!value || typeof value !== 'object') {
    throw new JourneyError('view', `${label} JSON is missing`);
  }
  for (const field of fields) {
    if (value[field] === undefined) {
      throw new JourneyError('view', `${label} JSON is missing ${field}`);
    }
  }
}

function compareRows(keys) {
  return (left, right) => {
    for (const key of keys) {
      const a = left[key] ?? '';
      const b = right[key] ?? '';
      if (a < b) return -1;
      if (a > b) return 1;
    }
    return 0;
  };
}

function applyPlaceholders(value, ctx) {
  const project = path.resolve(ctx.project);
  const runRoot = path.resolve(ctx.runRoot);
  const version = ctx.version;
  const walk = (item) => {
    if (typeof item === 'string') return placeholderString(item, project, runRoot, version);
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const [key, child] of Object.entries(item)) out[key] = walk(child);
      return out;
    }
    return item;
  };
  return walk(value);
}

function placeholderString(value, project, runRoot, version) {
  let next = value.split(project).join('<project>').split(runRoot).join('<run>');
  if (project !== ctxSlash(project)) next = next.split(ctxSlash(project)).join('<project>');
  const versionRe = new RegExp(`(?<![0-9.])${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9])`, 'g');
  next = next.replace(versionRe, '<version>');
  next = next.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<time>');
  if (next.startsWith('<project>/')) next = next.slice('<project>/'.length);
  return next;
}

function ctxSlash(file) {
  return file.replace(/\\/g, '/');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function goldenPath(fixture) {
  return path.join(GOLDEN_DIR, `${fixture}.json`);
}

async function observeTwice(fixture, steps, options) {
  const first = await journey(fixture, steps, options);
  const second = await journey(fixture, steps, options);
  const left = canonicalJson(first);
  const right = canonicalJson(second);
  if (left !== right) {
    throw new JourneyError('nondeterministic', `two runs of ${fixture} disagreed\n${unified(left, right)}`);
  }
  return first;
}

function unified(goldenText, observedText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-journey-diff-'));
  const goldenFile = path.join(dir, 'golden.json');
  const observedFile = path.join(dir, 'observed.json');
  fs.writeFileSync(goldenFile, goldenText);
  fs.writeFileSync(observedFile, observedText);
  const diff = spawnSync('git', ['diff', '--no-index', '--', goldenFile, observedFile], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return diff.stdout || diff.stderr || '(no diff text)';
}

function writeGolden(fixture, observed) {
  const target = goldenPath(fixture);
  const next = canonicalJson(observed);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === next) return false;
  const tmp = path.join(path.dirname(target), `.${fixture}.${process.pid}.json`);
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, target);
  return true;
}

async function main(argv) {
  const args = parseArgv(argv);
  if (args.list) {
    process.stdout.write(`${JSON.stringify(listJourneys())}\n`);
    return 0;
  }
  if (args.update && process.env.CI) {
    throw new JourneyError('golden', '--update is refused when CI is set');
  }
  const names = args.fixtures.length > 0 ? args.fixtures : Object.keys(JOURNEYS);
  let failed = 0;
  for (const fixture of names) {
    assertFixtureName(fixture);
    const steps = JOURNEYS[fixture];
    const options = {
      keep: args.keep,
      candidate: {
        ...(args.tarball ? { tarball: args.tarball } : {}),
        ...(args.artifactDir ? { artifactDir: args.artifactDir } : {}),
      },
    };
    const observed = args.update
      ? await observeTwice(fixture, steps, options)
      : await journey(fixture, steps, options);
    const text = canonicalJson(observed);
    if (args.out) {
      const outDir = path.join(args.out, fixture);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'observed.json'), text);
    }
    if (args.update) {
      const previous = fs.existsSync(goldenPath(fixture)) ? fs.readFileSync(goldenPath(fixture), 'utf8') : '';
      const changed = writeGolden(fixture, observed);
      if (changed && previous) process.stdout.write(unified(previous, text));
      else if (changed) process.stdout.write(`wrote ${path.relative(REPO_ROOT, goldenPath(fixture))}\n`);
      continue;
    }
    const goldenFile = goldenPath(fixture);
    if (!fs.existsSync(goldenFile)) {
      throw new JourneyError('golden', `missing golden ${path.relative(REPO_ROOT, goldenFile)}`);
    }
    const goldenText = fs.readFileSync(goldenFile, 'utf8').replace(/\r\n/g, '\n');
    if (goldenText !== text) {
      failed += 1;
      const diff = unified(goldenText, text);
      process.stderr.write(diff);
      if (args.out) fs.writeFileSync(path.join(args.out, fixture, 'golden.diff'), diff);
    }
  }
  return failed === 0 ? 0 : 1;
}

function parseArgv(argv) {
  /** @type {{ list: boolean, update: boolean, keep: boolean, fixtures: string[], artifactDir?: string, tarball?: string, out?: string }} */
  const args = { list: false, update: false, keep: false, fixtures: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--list') args.list = true;
    else if (token === '--update') args.update = true;
    else if (token === '--keep') args.keep = true;
    else if (token === '--fixture') args.fixtures.push(requiredValue(argv, ++i, token));
    else if (token === '--artifact-dir') args.artifactDir = requiredValue(argv, ++i, token);
    else if (token === '--tarball') args.tarball = requiredValue(argv, ++i, token);
    else if (token === '--out') args.out = requiredValue(argv, ++i, token);
    else throw new JourneyError('argv', `unknown argument ${token}`);
  }
  return args;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new JourneyError('argv', `${flag} needs a value`);
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`journey: ${message}\n`);
      process.exitCode = 2;
    });
}
