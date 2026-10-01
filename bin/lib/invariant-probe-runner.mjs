/**
 * Runner adapters for the invariant probe — Tooling (ADR 0039).
 *
 * Detects the project's own runner (vitest, jest, node:test) from the nearest
 * package.json, resolves its binary from the project, and runs it with
 * `process.execPath`, an argv array and no shell. A timeout kills the whole
 * process group. The environment is an allowlist: no tokens, no cloud
 * credentials, proxies pointed at a dead port, HOME and TMPDIR inside the
 * probe workspace. Best effort — not a sandbox.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const PROBE_RUNNERS = ['vitest', 'jest', 'node'];
const TS_TEST = /\.[cm]?tsx?$/;
const MAX_CAPTURE = 4 * 1024 * 1024;
const PROBE_TIMEOUT_FLOOR_MS = 10_000;
export const PROBE_TIMEOUT_CEILING_MS = 120_000;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Nearest directory at or above `fromDir` (inside `root`) holding a package.json. */
function nearestPackageRoot(root, fromDir) {
  let dir = path.resolve(fromDir);
  const top = path.resolve(root);
  while (dir.startsWith(top)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    if (dir === top) break;
    dir = path.dirname(dir);
  }
  return top;
}

function hasConfig(pkgRoot, stem) {
  try {
    return fs.readdirSync(pkgRoot).some((name) => name.startsWith(`${stem}.config.`));
  } catch {
    return false;
  }
}

/** Runner ids the package declares, from `scripts.test` first, then dependency + config. */
function runnerEvidence(pkgRoot) {
  const pkg = readJson(path.join(pkgRoot, 'package.json')) ?? {};
  const script = typeof pkg.scripts?.test === 'string' ? pkg.scripts.test : '';
  const fromScript = [];
  if (/\bvitest\b/.test(script)) fromScript.push('vitest');
  if (/\bjest\b/.test(script)) fromScript.push('jest');
  if (/\bnode\b[^&|;]*\s--test\b/.test(script)) fromScript.push('node');
  if (fromScript.length > 0) return fromScript;
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const fromDeps = [];
  if (deps.vitest && hasConfig(pkgRoot, 'vitest')) fromDeps.push('vitest');
  if (deps.jest && hasConfig(pkgRoot, 'jest')) fromDeps.push('jest');
  return fromDeps;
}

function resolveBin(pkgRoot, id) {
  if (id === 'node') return { bin: null, version: process.versions.node };
  try {
    const require = createRequire(path.join(pkgRoot, 'package.json'));
    const manifestPath = require.resolve(`${id}/package.json`);
    const manifest = readJson(manifestPath) ?? {};
    const binField = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[id];
    if (typeof binField !== 'string') return null;
    return { bin: path.resolve(path.dirname(manifestPath), binField), version: manifest.version ?? null };
  } catch {
    return null;
  }
}

/**
 * Pick the runner for a set of covering tests.
 * @param {{ root: string, tests: string[], override?: string }} input tests are root-relative
 */
export function detectRunner({ root, tests, override }) {
  const first = tests[0];
  const pkgRoot = nearestPackageRoot(root, path.dirname(path.join(root, first ?? '.')));
  const evidence = runnerEvidence(pkgRoot);
  let id;
  if (evidence.length === 1) {
    id = evidence[0];
    if (override && override !== id) {
      return {
        ok: false,
        reasonCode: 'PROBE_RUNNER_UNKNOWN',
        reason: `--runner ${override} does not match the runner this package declares (${id}). --runner only settles an unclear detection.`,
      };
    }
  } else if (override && PROBE_RUNNERS.includes(override)) {
    id = override;
  } else {
    return {
      ok: false,
      reasonCode: 'PROBE_RUNNER_UNKNOWN',
      reason:
        evidence.length > 1
          ? `The package declares more than one test runner (${evidence.join(', ')}). Next: pass --runner ${evidence.join('|')}.`
          : 'No test runner was found in package.json (scripts.test, or a vitest / jest dependency with its config file). Next: pass --runner vitest|jest|node.',
    };
  }
  if (id === 'node' && tests.some((test) => TS_TEST.test(test))) {
    return {
      ok: false,
      reasonCode: 'PROBE_RUNNER_UNSUPPORTED',
      reason: 'node:test cannot run TypeScript test files without a loader, so the probe does not run them.',
    };
  }
  const resolved = resolveBin(pkgRoot, id);
  if (!resolved) {
    return {
      ok: false,
      reasonCode: 'PROBE_RUNNER_UNKNOWN',
      reason: `${id} is not installed in ${path.relative(root, pkgRoot) || '.'}, so the probe cannot run it.`,
    };
  }
  return { ok: true, id, bin: resolved.bin, version: resolved.version, pkgRoot };
}

/** Allowlisted environment for the runner. Nothing else from the parent passes. */
export function buildProbeEnv({ home, tmp, parentEnv = process.env }) {
  const env = {
    PATH: parentEnv.PATH ?? parentEnv.Path ?? '',
    LANG: parentEnv.LANG ?? 'C.UTF-8',
    TZ: 'UTC',
    CI: '1',
    NODE_ENV: 'test',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    HOME: home,
    USERPROFILE: home,
    TMPDIR: tmp,
    TMP: tmp,
    TEMP: tmp,
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
    http_proxy: 'http://127.0.0.1:9',
    https_proxy: 'http://127.0.0.1:9',
    NO_PROXY: '',
    no_proxy: '',
    npm_config_offline: 'true',
  };
  if (process.platform === 'win32' && parentEnv.SystemRoot) env.SystemRoot = parentEnv.SystemRoot;
  return env;
}

/** argv for one run. `files` are relative to the package root in the copy. */
export function runnerArgv(runner, files, { outputFile, cacheDir }) {
  switch (runner.id) {
    case 'vitest':
      return [runner.bin, 'run', '--no-coverage', '--reporter=json', `--outputFile=${outputFile}`, ...files];
    case 'jest':
      return [
        runner.bin,
        '--ci',
        '--json',
        `--outputFile=${outputFile}`,
        '--coverage=false',
        '--watchman=false',
        `--cacheDirectory=${cacheDir}`,
        '--runTestsByPath',
        ...files,
      ];
    case 'node':
      return ['--test', '--test-reporter=tap', ...files];
    default:
      throw new Error(`unknown runner ${runner.id}`);
  }
}

/** clamp(3 × baseline + 5 s, 10 s, 120 s). */
export function probeTimeoutMs(baselineMs) {
  const wanted = 3 * Math.max(0, baselineMs) + 5000;
  return Math.min(PROBE_TIMEOUT_CEILING_MS, Math.max(PROBE_TIMEOUT_FLOOR_MS, wanted));
}

function killGroup(child) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/** Failure counts from the runner's own report. Null: no report to read. */
function readFailures(runner, outputFile, stdout) {
  if (runner.id === 'node') {
    const fail = /^# fail (\d+)/m.exec(stdout);
    const tests = /^# tests (\d+)/m.exec(stdout);
    if (!fail) return null;
    return { failed: Number(fail[1]), total: tests ? Number(tests[1]) : null };
  }
  const report = readJson(outputFile);
  if (!report || typeof report !== 'object') return null;
  const failed = (Number(report.numFailedTests) || 0) + (Number(report.numFailedTestSuites) || 0);
  return { failed, total: Number(report.numTotalTests) || 0 };
}

/**
 * Run the covering tests once.
 * @returns {Promise<{ outcome: 'passed' | 'failed' | 'timeout' | 'runtime-error', durationMs: number, detail?: string }>}
 */
export function runCoveringTests({ runner, cwd, files, timeoutMs, env, scratch }) {
  const outputFile = path.join(scratch, `runner-report-${process.hrtime.bigint()}.json`);
  const argv = runnerArgv(runner, files, { outputFile, cacheDir: path.join(scratch, 'jest-cache') });
  const started = process.hrtime.bigint();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(process.execPath, argv, {
      cwd,
      env,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.on('data', (chunk) => {
      stdout = stdout.length < MAX_CAPTURE ? stdout + chunk.toString('utf8') : stdout;
    });
    child.stderr.on('data', (chunk) => {
      stderr = stderr.length < MAX_CAPTURE ? stderr + chunk.toString('utf8') : stderr;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, timeoutMs);
    let done = false;
    const finish = (code, spawnError) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
      if (timedOut) return resolve({ outcome: 'timeout', durationMs });
      if (spawnError) return resolve({ outcome: 'runtime-error', durationMs, detail: spawnError.message });
      const failures = readFailures(runner, outputFile, stdout);
      try {
        fs.rmSync(outputFile, { force: true });
      } catch {
        /* scratch is removed with the workspace */
      }
      if (failures && failures.failed > 0) return resolve({ outcome: 'failed', durationMs });
      if (code === 0) return resolve({ outcome: 'passed', durationMs });
      // A non-zero exit with no reported failure is a crash, never a caught change.
      return resolve({ outcome: 'runtime-error', durationMs, detail: stderr.slice(-2000) });
    };
    child.on('error', (error) => finish(null, error));
    child.on('close', (code) => finish(code, null));
  });
}
