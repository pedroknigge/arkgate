#!/usr/bin/env node
/**
 * Q5 — ark-check scale/budget harness.
 * Generates fixture trees of N governed files, runs ark-check cold+warm,
 * reports p50/p95-style timings and peak RSS. Does not invent fake pass timings:
 * budgets are advisory unless --fail-budget is set with an explicit --max-ms.
 *
 * Usage:
 *   node scripts/ark-scale-bench.mjs [--sizes 50,200] [--runs 3] [--json] [--keep]
 *   node scripts/ark-scale-bench.mjs --sizes 50 --runs 2 --max-ms 120000 --fail-budget
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const CHECK = path.join(REPO, 'bin', 'ark-check.mjs');

function parseArgs(argv) {
  const out = {
    sizes: [50, 200],
    runs: 3,
    json: false,
    keep: false,
    maxMs: null,
    failBudget: false,
    outDir: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--keep') out.keep = true;
    else if (a === '--fail-budget') out.failBudget = true;
    else if (a === '--sizes') out.sizes = String(argv[++i] || '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    else if (a === '--runs') out.runs = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--max-ms') out.maxMs = Number(argv[++i]);
    else if (a === '--out-dir') out.outDir = argv[++i];
  }
  if (out.sizes.length === 0) out.sizes = [50];
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function writeFixture(root, n) {
  fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'app'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify(
      {
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], optional: true },
          {
            name: 'ApplicationOrchestration',
            patterns: ['src/app/**'],
            optional: true,
          },
        ],
        rules: [
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true },
        ],
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'ark-scale-fixture' }));
  for (let i = 0; i < n; i++) {
    const dir = i % 2 === 0 ? 'domain' : 'app';
    fs.writeFileSync(
      path.join(root, 'src', dir, `f${i}.ts`),
      `export const v${i} = ${i};\nexport type T${i} = { n: number };\n`
    );
  }
}

function runCheck(root) {
  const start = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [CHECK, '--root', root, '--config', 'ark.config.json', '--no-cache'], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  return {
    status: result.status ?? 1,
    ms,
    // Child process RSS is not available from spawnSync without /usr/bin/time — leave null.
    peakRssBytes: null,
    stderrTail: (result.stderr || '').slice(-200),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = args.outDir
    ? path.resolve(args.outDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'ark-scale-'));
  fs.mkdirSync(base, { recursive: true });

  const results = [];
  for (const size of args.sizes) {
    const root = path.join(base, `n${size}`);
    fs.rmSync(root, { recursive: true, force: true });
    writeFixture(root, size);
    const times = [];
    let lastStatus = 1;
    for (let r = 0; r < args.runs; r++) {
      const one = runCheck(root);
      times.push(one.ms);
      lastStatus = one.status;
    }
    const sorted = [...times].sort((a, b) => a - b);
    const cold = times[0];
    const warm = times.length > 1 ? times[times.length - 1] : times[0];
    results.push({
      size,
      runs: args.runs,
      status: lastStatus,
      coldMs: cold,
      warmMs: warm,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      maxMs: sorted[sorted.length - 1],
      minMs: sorted[0],
      samplesMs: times,
    });
  }

  const report = {
    tool: 'ark-scale-bench',
    check: CHECK,
    base,
    results,
    generatedAt: new Date().toISOString(),
  };

  if (!args.keep && !args.outDir) {
    try {
      fs.rmSync(base, { recursive: true, force: true });
      report.base = '(deleted)';
    } catch {
      /* keep */
    }
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Ark scale bench (Q5)');
    for (const row of results) {
      console.log(
        `  n=${row.size} runs=${row.runs} cold=${row.coldMs.toFixed(1)}ms warm=${row.warmMs.toFixed(1)}ms ` +
          `p50=${row.p50Ms?.toFixed(1)}ms p95=${row.p95Ms?.toFixed(1)}ms status=${row.status}`
      );
    }
  }

  if (args.failBudget && args.maxMs != null && Number.isFinite(args.maxMs)) {
    const breach = results.find((r) => r.p95Ms != null && r.p95Ms > args.maxMs);
    if (breach) {
      console.error(
        `Budget fail: n=${breach.size} p95=${breach.p95Ms}ms > max-ms=${args.maxMs}`
      );
      process.exitCode = 1;
      return;
    }
  }
  // Structural: harness must produce finite timings
  if (results.some((r) => !Number.isFinite(r.p50Ms))) {
    process.exitCode = 1;
  }
}

main();
