#!/usr/bin/env node
/**
 * U06 — end-to-end pre-tool (hook) and doctor path benchmark (ADR 0009 D5).
 *
 * Measures the COMPLETE paths a user feels, as fresh child processes:
 *   hook-warm  — `ark-mcp --hook` validating one Write payload against a tree
 *                with a warm scan cache (the per-keystroke interactive path)
 *   hook-cold  — same invocation with no cache on disk
 *   doctor-cold — `ark-check --doctor --json --no-cache` over the tree
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

function runHookOnce(root, payload) {
  const started = process.hrtime.bigint();
  const result = spawnSync(
    'node',
    [path.join(REPO, 'bin/ark-mcp.mjs'), '--hook', '--root', root, '--config', 'ark.config.json'],
    { input: JSON.stringify(payload), encoding: 'utf8' }
  );
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  return elapsedMs;
}

function runDoctorOnce(root) {
  const started = process.hrtime.bigint();
  const result = spawnSync(
    'node',
    [
      path.join(REPO, 'bin/ark-check.mjs'),
      '--root',
      root,
      '--config',
      'ark.config.json',
      '--doctor',
      '--json',
      '--no-cache',
    ],
    { encoding: 'utf8' }
  );
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  return elapsedMs;
}

function clearCaches(root) {
  fs.rmSync(path.join(root, '.ark-cache'), { recursive: true, force: true });
  fs.rmSync(path.join(root, 'node_modules', '.cache'), { recursive: true, force: true });
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
      const hookCold = [];
      const hookWarm = [];
      const doctorCold = [];
      for (let i = 0; i < args.runs; i += 1) {
        clearCaches(root);
        hookCold.push(runHookOnce(root, payload));
        // Cache is now warm from the cold run; measure the interactive path.
        hookWarm.push(runHookOnce(root, payload));
      }
      for (let i = 0; i < Math.max(3, Math.floor(args.runs / 2)); i += 1) {
        doctorCold.push(runDoctorOnce(root));
      }
      results.push({
        size,
        hookCold: stats(hookCold),
        hookWarm: stats(hookWarm),
        doctorCold: stats(doctorCold),
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const failures = [];
  if (args.failBudget && budgets?.scenarios) {
    for (const result of results) {
      for (const [scenario, spec] of Object.entries(budgets.scenarios)) {
        if (spec.size !== result.size || typeof spec.maxP95Ms !== 'number') continue;
        const measured = result[spec.metric ?? scenario]?.p95Ms;
        if (typeof measured === 'number' && measured > spec.maxP95Ms) {
          failures.push(
            `Budget fail: ${scenario}@${result.size} p95 ${measured}ms is not below ${spec.maxP95Ms}ms`
          );
        }
      }
    }
  }

  const report = {
    schemaVersion: 1,
    tool: 'hook-path-bench',
    runner: { platform: process.platform, arch: process.arch, node: process.version },
    budgets: budgets ? 'eval/performance/hook-budgets.v1.json' : 'none (recording baseline)',
    results,
    failures,
    ok: failures.length === 0,
  };
  const serialized = JSON.stringify(report, null, 2);
  if (args.out) fs.writeFileSync(path.join(REPO, args.out), `${serialized}\n`);
  if (args.json) console.log(serialized);
  else {
    for (const r of results) {
      console.log(
        `size ${r.size}: hook cold p95 ${r.hookCold.p95Ms}ms · hook warm p95 ${r.hookWarm.p95Ms}ms · doctor cold p95 ${r.doctorCold.p95Ms}ms`
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
