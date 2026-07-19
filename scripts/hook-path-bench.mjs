#!/usr/bin/env node
/**
 * U06 — end-to-end pre-tool (hook) and doctor path benchmark (ADR 0009 D5).
 *
 * Measures the COMPLETE paths a user feels, as fresh child processes:
 *   hook        — `ark-mcp --hook` validating one Write payload (the
 *                 per-keystroke interactive path; the hook validates the single
 *                 proposed file and does not consume the scan cache, so there
 *                 is exactly ONE distribution — no fictional cold/warm split)
 *   doctor.cold — `ark-check --doctor --json --no-cache` over the tree
 *   doctor.oneShotWarm — the exact same command in fresh processes after one
 *                 discarded prime over the same immutable tree/cache state
 *   doctor.residentWarm — unavailable until Z07 supplies a resident pilot
 *
 * D5 method: record a Linux CI baseline FIRST; ceilings are baseline plus a
 * fixed headroom and live in eval/performance/hook-budgets.v1.json. Until a
 * ceiling exists for a scenario, --fail-budget records and reports instead of
 * failing — no number is invented before the measured baseline.
 *
 * Usage:
 *   node scripts/hook-path-bench.mjs [--sizes 1000,10000] [--runs 9] [--json]
 *                                    [--fail-budget] [--out report.json]
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGETS = path.join(REPO, 'eval', 'performance', 'hook-budgets.v1.json');

function parseArgs(argv) {
  const out = { sizes: [1000, 10000], runs: 9, json: false, failBudget: false, out: undefined };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sizes') out.sizes = argv[++i].split(',').map((s) => Number(s.trim()));
    else if (a === '--runs') out.runs = Number(argv[++i]);
    else if (a === '--json') out.json = true;
    else if (a === '--fail-budget') out.failBudget = true;
    else if (a === '--out') out.out = argv[++i];
  }
  return out;
}

function writeFixture(root, n) {
  for (const dir of ['src/domain', 'src/services', 'src/adapters', 'src/components']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify(
      {
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], pure: true },
          { name: 'ApplicationOrchestration', patterns: ['src/services/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/adapters/**'] },
          { name: 'PresentationAdapters', patterns: ['src/components/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
      },
      null,
      2
    )
  );
  const dirs = ['src/domain', 'src/services', 'src/adapters', 'src/components'];
  for (let i = 0; i < n; i += 1) {
    const dir = dirs[i % dirs.length];
    const sibling = `./m${Math.max(0, i - dirs.length)}`;
    const body =
      i >= dirs.length
        ? `import { v${Math.max(0, i - dirs.length)} } from '${sibling}';\nexport const v${i} = ${i};\n`
        : `export const v${i} = ${i};\n`;
    fs.writeFileSync(path.join(root, dir, `m${i}.ts`), body);
  }
}

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    runs: sorted.length,
    p50Ms: Number(percentile(sorted, 0.5).toFixed(3)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(3)),
    maxMs: Number(sorted[sorted.length - 1]?.toFixed(3) ?? 0),
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function treeIdentity(root) {
  const entries = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isSymbolicLink()) {
        entries.push({ relative, kind: 'link', value: fs.readlinkSync(absolute) });
      } else if (entry.isFile()) {
        entries.push({ relative, kind: 'file', value: fs.readFileSync(absolute) });
      }
    }
  };
  visit(root);
  entries.sort((a, b) => a.relative.localeCompare(b.relative));
  const hash = createHash('sha256');
  for (const entry of entries) {
    hash.update(entry.kind);
    hash.update('\0');
    hash.update(entry.relative);
    hash.update('\0');
    hash.update(entry.value);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function runHookOnce(root, payload) {
  const started = process.hrtime.bigint();
  const result = spawnSync(
    'node',
    [path.join(REPO, 'bin/ark-mcp.mjs'), '--hook', '--root', root, '--config', 'ark.config.json'],
    { input: JSON.stringify(payload), encoding: 'utf8' }
  );
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  // The payload is clean by construction: a non-zero exit means a broken
  // environment, and its (fast) timing must never become a baseline.
  if (result.status !== 0) {
    throw new Error(`hook exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  return elapsedMs;
}

function doctorCommand(root) {
  return [
    path.join(REPO, 'bin/ark-check.mjs'),
    '--root',
    root,
    '--config',
    'ark.config.json',
    '--doctor',
    '--json',
    '--no-cache',
  ];
}

function runDoctorSample(root) {
  const argv = doctorCommand(root);
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, argv, { encoding: 'utf8' });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`doctor exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  return {
    elapsedMs,
    status: result.status,
    stdout: result.stdout || '',
  };
}

function metricAt(result, metric) {
  return metric.split('.').reduce((value, key) => value?.[key], result);
}

async function main() {
  const args = parseArgs(process.argv);
  const budgets = fs.existsSync(BUDGETS) ? JSON.parse(fs.readFileSync(BUDGETS, 'utf8')) : undefined;
  const results = [];
  for (const size of args.sizes) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-bench-'));
    try {
      writeFixture(root, size);
      const payload = {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(root, 'src/domain/edited.ts'),
          content: 'export const edited = 1;\n',
        },
      };
      const fixtureTreeHashBefore = treeIdentity(root);
      const legacyCachePath = path.join(root, 'node_modules', '.cache', 'ark-check.json');
      const legacyCacheAbsentBefore = !fs.existsSync(legacyCachePath);
      const hook = [];
      const doctorCold = [];
      const doctorOneShotWarm = [];
      for (let i = 0; i < args.runs; i += 1) {
        hook.push(runHookOnce(root, payload));
      }
      const doctorRuns = Math.max(3, Math.floor(args.runs / 2));
      for (let i = 0; i < doctorRuns; i += 1) {
        doctorCold.push(runDoctorSample(root));
      }
      const doctorPrime = runDoctorSample(root);
      for (let i = 0; i < doctorRuns; i += 1) {
        doctorOneShotWarm.push(runDoctorSample(root));
      }
      const reference = doctorCold[0];
      const comparableSamples = [...doctorCold, doctorPrime, ...doctorOneShotWarm];
      const exactOutputParity = comparableSamples.every(
        (sample) => sample.status === reference.status && sample.stdout === reference.stdout
      );
      const fixtureTreeHashAfter = treeIdentity(root);
      const legacyCacheAbsentAfter = !fs.existsSync(legacyCachePath);
      results.push({
        size,
        fixture: {
          treeHashBefore: fixtureTreeHashBefore,
          treeHashAfter: fixtureTreeHashAfter,
          unchanged: fixtureTreeHashBefore === fixtureTreeHashAfter,
        },
        hook: stats(hook),
        doctor: {
          executable: process.execPath,
          argv: doctorCommand(root),
          processMode: 'fresh-child-per-sample',
          cache: {
            mode: 'none',
            argvFlag: '--no-cache',
            legacyFlagOnly: true,
            legacyCacheAbsentBefore,
            legacyCacheAbsentAfter,
          },
          cold: stats(doctorCold.map((sample) => sample.elapsedMs)),
          oneShotWarm: {
            ...stats(doctorOneShotWarm.map((sample) => sample.elapsedMs)),
            primeMs: Number(doctorPrime.elapsedMs.toFixed(3)),
          },
          residentWarm: null,
          exactOutputParity,
          outputSha256: `sha256:${sha256(reference.stdout)}`,
        },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const failures = [];
  if (args.failBudget && budgets?.scenarios) {
    for (const [scenario, spec] of Object.entries(budgets.scenarios)) {
      if (typeof spec.maxP95Ms !== 'number') continue; // recording mode
      const result = results.find((r) => r.size === spec.size);
      const measured = result ? metricAt(result, spec.metric ?? scenario)?.p95Ms : undefined;
      // An armed ceiling that resolves no measurement is a broken harness, not a pass.
      if (typeof measured !== 'number') {
        failures.push(
          `Budget fail: armed scenario ${scenario}@${spec.size} resolved no measurement (metric ${spec.metric ?? scenario}; sizes run: ${results.map((r) => r.size).join(',')})`
        );
        continue;
      }
      if (measured > spec.maxP95Ms) {
        failures.push(
          `Budget fail: ${scenario}@${spec.size} p95 ${measured}ms is not below ${spec.maxP95Ms}ms`
        );
      }
    }
  }

  const report = {
    schemaVersion: 2,
    tool: 'hook-path-bench',
    runner: { platform: process.platform, arch: process.arch, node: process.version },
    budgets: budgets ? 'eval/performance/hook-budgets.v1.json' : 'none (recording baseline)',
    results,
    failures,
    ok: failures.length === 0,
  };
  const serialized = JSON.stringify(report, null, 2);
  if (args.out) {
    const target = path.isAbsolute(args.out) ? args.out : path.join(REPO, args.out);
    fs.writeFileSync(target, `${serialized}\n`);
  }
  if (args.json) console.log(serialized);
  else {
    for (const r of results) {
      console.log(
        `size ${r.size}: hook p95 ${r.hook.p95Ms}ms · doctor cold p95 ${r.doctor.cold.p95Ms}ms · ` +
          `doctor one-shot warm p95 ${r.doctor.oneShotWarm.p95Ms}ms`
      );
    }
  }
  for (const failure of failures) console.error(failure);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 2;
});
