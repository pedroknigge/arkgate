#!/usr/bin/env node
/** Z07 bounded feedback lanes: pure facts in parallel, process adapters in one fork. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SCRIPT), '..');
const VITEST = path.join(REPO, 'node_modules', 'vitest', 'vitest.mjs');
const BUDGETS = path.join(REPO, 'eval', 'performance', 'test-feedback-budgets.v1.json');

const PR_PURE = [
  'tests/unit/analysis/analysisEngineBundle.test.ts',
  'tests/unit/analysis/z07ArchitectureSnapshot.test.ts',
  'tests/unit/scripts/z07FeedbackRun.test.ts',
];
const PR_CLI = [
  'tests/unit/mcp/residentHook.test.ts',
  'tests/unit/scripts/arkScaleBench.test.ts',
];
const FULL_PURE = [
  ...PR_PURE,
  'tests/unit/analysis/z04ResolvedFactsContract.test.ts',
  'tests/unit/analysis/z04ResolvedFactsResolver.test.ts',
  'tests/unit/analysis/z04ResolvedPreflight.test.ts',
];
const FULL_CLI = [
  ...PR_CLI,
  'tests/unit/scripts/hookPathBench.test.ts',
  'tests/unit/adapters/adapterParity.test.ts',
  'tests/unit/adapters/z04ResolvedAdapterParity.test.ts',
  'tests/unit/scripts/packageIsolationSafety.test.ts',
  'tests/unit/static-check/y03ParseHealth.test.ts',
];

function parseArgs(argv) {
  const out = { mode: 'pr', output: undefined, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--mode') out.mode = argv[++index];
    else if (argv[index] === '--out') out.output = argv[++index];
    else if (argv[index] === '--json') out.json = true;
  }
  if (!['pr', 'full'].includes(out.mode)) throw new Error('--mode must be pr or full');
  return out;
}

function runVitest(files, kind, timeoutMs) {
  const pool = kind === 'pure'
    ? ['--pool', 'threads', '--maxWorkers', '4']
    : ['--pool', 'forks', '--poolOptions.forks.singleFork=true'];
  const args = [VITEST, 'run', ...files, ...pool];
  const started = process.hrtime.bigint();
  const child = spawn(process.execPath, args, { cwd: REPO, env: process.env, stdio: 'inherit' });
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let escalation;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(escalation);
      resolve({
        kind,
        files,
        timeoutMs,
        timedOut,
        wallMs: Number(process.hrtime.bigint() - started) / 1e6,
        ...result,
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      escalation = setTimeout(() => child.kill('SIGKILL'), 1_000);
    }, timeoutMs);
    child.once('error', (error) => finish({ status: 1, error: error.message }));
    child.once('exit', (code, signal) => finish({ status: code ?? 1, signal: signal ?? null }));
  });
}

export function budgetFailures(report, budgets) {
  const failures = report.lanes.flatMap((lane) =>
    lane.timedOut
      ? [`${lane.kind} lane exceeded ${lane.timeoutMs}ms`]
      : lane.status !== 0
        ? [`${lane.kind} lane exited ${lane.status}`]
        : []
  );
  const maxWallMs = budgets.modes[report.mode]?.maxWallMs;
  if (!Number.isFinite(maxWallMs)) failures.push(`missing ${report.mode} wall-time budget`);
  else if (report.wallMs >= maxWallMs) {
    failures.push(`${report.mode} wall ${report.wallMs}ms is not below ${maxWallMs}ms`);
  }
  return failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const budgets = JSON.parse(fs.readFileSync(BUDGETS, 'utf8'));
  const pure = args.mode === 'full' ? FULL_PURE : PR_PURE;
  const cli = args.mode === 'full' ? FULL_CLI : PR_CLI;
  const configuredMax = budgets.modes[args.mode]?.maxWallMs;
  const timeoutMs = Number.isFinite(configuredMax) ? configuredMax : 30_000;
  const started = process.hrtime.bigint();
  const lanes = await Promise.all([
    runVitest(pure, 'pure', timeoutMs),
    runVitest(cli, 'serial-cli', timeoutMs),
  ]);
  const report = {
    schemaVersion: 1,
    mode: args.mode,
    runner: { platform: process.platform, arch: process.arch, node: process.version },
    wallMs: Number(process.hrtime.bigint() - started) / 1e6,
    lanes,
    generatedAt: new Date().toISOString(),
  };
  report.failures = budgetFailures(report, budgets);
  report.ok = report.failures.length === 0;
  if (args.output) {
    const target = path.resolve(args.output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(`Z07 ${args.mode} feedback: ${report.ok ? 'PASS' : 'FAIL'} (${report.wallMs.toFixed(1)} ms)`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) await main();
