#!/usr/bin/env node
/**
 * Memory regression guard for the paths a user runs on every validation.
 *
 * Builds a synthetic TS/TSX consumer (path aliases, a peerIsolation wall with
 * childSlices, ArkRules) and records, per fresh child process, its peak RSS:
 *
 *   check        — `ark-check --json --no-cache` over the whole tree
 *   doctor       — `ark-check --doctor --json --no-cache`: the scan plus the
 *                  compact importer index doctor keeps for files nothing
 *                  imports (ADR 0037) and every advisory section
 *   doctorAll    — `ark-check --doctor --all --json --no-cache`: status
 *                  details, including the token-fingerprint pass for copies
 *                  across a wall (ADR 0038) and unused exports
 *   hookWrite    — `ark-mcp --hook` for a one-line Write (must stay near the
 *                  process floor: it may not walk or parse the repo)
 *   hookPatch    — `ark-mcp --hook` for a complete ApplyPatch (atomic
 *                  base/candidate preflight over the whole tree)
 *   mcp          — one long-lived MCP server over repeated validate_code /
 *                  ark_prepare_write / ark_prepare_change / ark_check calls:
 *                  post-GC heap after warm-up vs after the last call (a leak
 *                  or an unbounded cache shows up as growth), plus peak RSS
 *
 * Budgets live in eval/performance/memory-budgets.v1.json. They are generous
 * ceilings (a regression guard, not a benchmark claim); `--fail-budget` fails
 * the run when one is exceeded. Verdict parity is not this script's job: the
 * hook and check outputs are recorded as hashes so a caller can compare runs.
 *
 * Usage:
 *   node scripts/memory-bench.mjs [--size 2000] [--calls 50] [--json]
 *                                 [--fail-budget] [--out report.json] [--keep]
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SCRIPT), '..');
const CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const MCP = path.join(REPO, 'bin', 'ark-mcp.mjs');
const BUDGETS = path.join(REPO, 'eval', 'performance', 'memory-budgets.v1.json');
const MB = 1024 * 1024;

function parseArgs(argv) {
  const out = { size: 2000, calls: 50, json: false, failBudget: false, out: undefined, keep: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--size') out.size = Math.max(50, Number(argv[++i]) || out.size);
    else if (a === '--calls') out.calls = Math.max(20, Number(argv[++i]) || out.calls);
    else if (a === '--json') out.json = true;
    else if (a === '--fail-budget') out.failBudget = true;
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--keep') out.keep = true;
  }
  return out;
}

const UNIVERSES = ['projects', 'billing', 'catalog', 'orders'];
const CHILDREN = ['alpha', 'beta', 'gamma'];

/** Synthetic consumer: aliases, TSX, a child-slice wall, ArkRules, one real violation. */
export function writeMemoryFixture(root, size) {
  const write = (rel, text) => {
    const absolute = path.join(root, rel);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, text);
  };
  const childSlices = {
    sliceFolders: ['lib/features/*/*', 'components/features/*/*', 'lib/repositories/features/*/*'],
    sliceIdentity: 'stars',
    commonFolders: ['domain'],
    siblings: 'deny',
    parentMayImportChild: false,
  };
  const wall = (from, to) => ({
    from,
    to,
    allowed: false,
    peerIsolation: true,
    sliceFolders: ['features'],
    sharedRoots: ['components/ui', 'lib/shared'],
    childSlices,
    allowedCrossSlice: [{ from: 'features/*', to: 'features/*' }],
  });
  write(
    'ark.config.json',
    JSON.stringify(
      {
        schemaVersion: '1.3',
        name: 'memory-bench',
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], pure: true, forbiddenGlobals: ['process', 'Date.now'] },
          { name: 'Presentation', patterns: ['src/components/**'] },
          { name: 'Application', patterns: ['src/lib/features/**', 'src/lib/shared/**'] },
          { name: 'Persistence', patterns: ['src/lib/repositories/**'] },
        ],
        rules: [
          { from: 'DomainModel', to: 'Application', allowed: false },
          { from: 'DomainModel', to: 'Persistence', allowed: false },
          { from: 'Persistence', to: 'Presentation', allowed: false },
          wall('Application', 'Application'),
          wall('Presentation', 'Application'),
          wall('Presentation', 'Presentation'),
        ],
        arkRules: { DomainModel: 'arkrules/DomainModel.json' },
      },
      null,
      2
    )
  );
  write(
    'arkrules/DomainModel.json',
    JSON.stringify({
      schemaVersion: '1.0',
      layer: 'DomainModel',
      structure: [
        { id: 'always-valid-aggregates', sensor: 'aggregate-private-state', mode: 'advisory', description: 'Aggregates keep state private.' },
      ],
      invariants: [{ id: 'INV-ALWAYS-VALID', description: 'Never invalid', mode: 'advisory', coverage: { test: false } }],
    })
  );
  write('package.json', JSON.stringify({ name: 'memory-bench', private: true, type: 'module' }));
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        baseUrl: '.',
        paths: { '@/*': ['src/*'], '@domain/*': ['src/domain/*'] },
      },
      include: ['src'],
    })
  );
  const slices = UNIVERSES.flatMap((u) => CHILDREN.map((c) => [u, c]));
  for (const u of UNIVERSES) {
    write(
      `src/domain/${u}/entity.ts`,
      `export class Entity {\n  private constructor(private readonly id: string) {}\n  static create(id: string): Entity {\n    return new Entity(id);\n  }\n}\n`
    );
  }
  write('src/lib/shared/format.ts', 'export const format = (value: number): string => value.toFixed(2);\n');
  write('src/components/ui/Button.tsx', 'export function Button({ label }: { label: string }) {\n  return <button>{label}</button>;\n}\n');
  const perKind = Math.max(1, Math.floor((size - UNIVERSES.length - 2) / 3));
  for (let i = 0; i < perKind; i += 1) {
    const [u, c] = slices[i % slices.length];
    const j = Math.floor(i / slices.length);
    const prev = (name) => (j > 0 ? `import { ${name}${j - 1} } from './${name === 'find' ? 'repo' : 'service'}${j - 1}';\n` : '');
    write(
      `src/lib/repositories/features/${u}/${c}/repo${j}.ts`,
      `${prev('find')}import { Entity } from '@domain/${u}/entity';\nexport async function find${j}(id: string) {\n  return Entity.create(id);\n}\n`
    );
    // One cross-sibling import every 97 services: a real, stable violation.
    const [cu, cc] = slices[(i + 1) % slices.length];
    const cross = i % 97 === 5 ? `import { run0 as crossRun } from '../../${cu}/${cc}/service0';\nvoid crossRun;\n` : '';
    write(
      `src/lib/features/${u}/${c}/service${j}.ts`,
      `import { find${j} } from '@/lib/repositories/features/${u}/${c}/repo${j}';\nimport { format } from '@/lib/shared/format';\n${prev('run')}${cross}export async function run${j}(id: string): Promise<string> {\n  await find${j}(id);\n  return format(${j});\n}\n`
    );
    write(
      `src/components/features/${u}/${c}/View${j}.tsx`,
      `import { run${j} } from '@/lib/features/${u}/${c}/service${j}';\nimport { Button } from '@/components/ui/Button';\nexport function View${j}({ id }: { id: string }) {\n  void run${j}(id);\n  return <Button label={id} />;\n}\n`
    );
  }
  return { target: `src/lib/features/${slices[1][0]}/${slices[1][1]}/service0.ts` };
}

function writePreload(dir) {
  const preload = path.join(dir, 'memory-probe.cjs');
  fs.writeFileSync(
    preload,
    `const fs = require('fs');
const report = process.env.ARK_MEMORY_REPORT;
if (report) {
  process.on('exit', () => {
    const maxRSS = process.resourceUsage().maxRSS;
    const rss = process.memoryUsage().rss;
    // libuv reports KiB (older macOS builds reported bytes).
    const peak = maxRSS >= rss ? maxRSS : maxRSS * 1024;
    fs.appendFileSync(report, JSON.stringify({ kind: 'exit', peakRssBytes: peak }) + '\\n');
  });
  process.on('SIGUSR2', () => {
    if (typeof global.gc === 'function') { global.gc(); global.gc(); }
    const m = process.memoryUsage();
    fs.appendFileSync(report, JSON.stringify({ kind: 'heap', heapUsed: m.heapUsed, rss: m.rss }) + '\\n');
  });
}
`
  );
  return preload;
}

function readReport(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function runProbed(work, name, argv, { input } = {}) {
  const report = path.join(work.dir, `${name}.jsonl`);
  fs.rmSync(report, { force: true });
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, ['--require', work.preload, ...argv], {
    input,
    encoding: 'utf8',
    maxBuffer: 256 * MB,
    env: { ...process.env, ARK_MEMORY_REPORT: report, ARK_RESIDENT_HOOK: '0' },
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  const exit = readReport(report).find((row) => row.kind === 'exit');
  return {
    status: result.status,
    ms: Number(ms.toFixed(1)),
    peakRssBytes: exit?.peakRssBytes ?? null,
    outputSha256: sha256(`${result.status}\0${result.stdout}\0${result.stderr}`),
  };
}

async function runMcp(work, root, target, calls) {
  const report = path.join(work.dir, 'mcp.jsonl');
  fs.rmSync(report, { force: true });
  const child = spawn(
    process.execPath,
    ['--expose-gc', '--require', work.preload, MCP, '--root', root, '--config', 'ark.config.json'],
    {
      cwd: root,
      env: { ...process.env, ARK_MEMORY_REPORT: report, ARK_RESIDENT_HOOK: '0' },
      stdio: ['pipe', 'pipe', 'ignore'],
    }
  );
  const pending = new Map();
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  let nextId = 1;
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out`)), 120_000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  const heapSample = async () => {
    const before = readReport(report).filter((row) => row.kind === 'heap').length;
    child.kill('SIGUSR2');
    for (let i = 0; i < 400; i += 1) {
      const rows = readReport(report).filter((row) => row.kind === 'heap');
      if (rows.length > before) return rows.at(-1);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('MCP heap sample was not written');
  };
  const source = fs.readFileSync(path.join(root, target), 'utf8');
  const warmup = Math.min(10, Math.floor(calls / 5));
  const samples = [];
  const started = process.hrtime.bigint();
  let failures = 0;
  try {
    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'memory-bench', version: '1' } });
    for (let i = 1; i <= calls; i += 1) {
      const edited = `${source}export const edit${i} = ${i};\n`;
      const kind = i % 5;
      const call =
        kind === 0
          ? { name: 'ark_check', arguments: {} }
          : kind === 1
            ? { name: 'validate_code', arguments: { filePath: target, source: edited } }
            : kind === 2
              ? { name: 'validate_code', arguments: { filePath: target, source: `import { run0 } from '../../catalog/alpha/service0';\n${edited}` } }
              : kind === 3
                ? { name: 'ark_prepare_write', arguments: { filePath: target, source: edited } }
                : { name: 'ark_prepare_change', arguments: { changes: [{ path: target, content: edited }] } };
      const response = await rpc('tools/call', call);
      if (!response.result) failures += 1;
      if (i === warmup || i === calls) samples.push({ call: i, ...(await heapSample()) });
    }
  } finally {
    child.stdin.end();
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve();
      }, 5_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  const exit = readReport(report).find((row) => row.kind === 'exit');
  const [afterWarmup, final] = samples;
  return {
    calls,
    warmupCalls: warmup,
    failedCalls: failures,
    ms: Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)),
    heapAfterWarmupBytes: afterWarmup.heapUsed,
    heapFinalBytes: final.heapUsed,
    heapGrowthBytes: final.heapUsed - afterWarmup.heapUsed,
    peakRssBytes: exit?.peakRssBytes ?? null,
  };
}

export function memoryBudgetFailures(report, budgets) {
  const failures = [];
  const scenarios = budgets.scenarios;
  for (const name of ['check', 'doctor', 'doctorAll', 'hookWrite', 'hookPatch']) {
    const row = report.scenarios[name];
    const budget = scenarios[name];
    if (!row || !budget) continue;
    if (!Number.isFinite(row.peakRssBytes)) failures.push(`${name}: peak RSS was not recorded`);
    else if (row.peakRssBytes > budget.maxPeakRssBytes) {
      failures.push(`${name}: peak RSS ${row.peakRssBytes} exceeds ${budget.maxPeakRssBytes}`);
    }
  }
  const mcp = report.scenarios.mcp;
  if (mcp && scenarios.mcp) {
    if (mcp.failedCalls > 0) failures.push(`mcp: ${mcp.failedCalls} call(s) returned no result`);
    if (mcp.heapGrowthBytes > scenarios.mcp.maxHeapGrowthBytes) {
      failures.push(
        `mcp: post-GC heap grew ${mcp.heapGrowthBytes} bytes over ${mcp.calls - mcp.warmupCalls} calls (max ${scenarios.mcp.maxHeapGrowthBytes})`
      );
    }
    if (!Number.isFinite(mcp.peakRssBytes)) failures.push('mcp: peak RSS was not recorded');
    else if (mcp.peakRssBytes > scenarios.mcp.maxPeakRssBytes) {
      failures.push(`mcp: peak RSS ${mcp.peakRssBytes} exceeds ${scenarios.mcp.maxPeakRssBytes}`);
    }
  }
  return failures;
}

async function main() {
  const args = parseArgs(process.argv);
  const budgets = JSON.parse(fs.readFileSync(BUDGETS, 'utf8'));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-memory-bench-'));
  const root = path.join(base, 'fixture');
  const workDir = { dir: path.join(base, 'work'), preload: '' };
  fs.mkdirSync(workDir.dir, { recursive: true });
  let report;
  try {
    const { target } = writeMemoryFixture(root, args.size);
    workDir.preload = writePreload(workDir.dir);
    const targetAbs = path.join(root, target);
    const original = fs.readFileSync(targetAbs, 'utf8');
    const firstLine = original.split('\n')[0];
    const scenarios = {
      check: runProbed(workDir, 'check', [CHECK, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache']),
      doctor: runProbed(workDir, 'doctor', [CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--json', '--no-cache']),
      doctorAll: runProbed(workDir, 'doctor-all', [CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--all', '--json', '--no-cache']),
      hookWrite: runProbed(workDir, 'hook-write', [MCP, '--hook', '--root', root, '--config', 'ark.config.json'], {
        input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: targetAbs, content: `${original}export const oneLine = 1;\n` } }),
      }),
      hookPatch: runProbed(workDir, 'hook-patch', [MCP, '--hook', '--root', root, '--config', 'ark.config.json'], {
        input: JSON.stringify({
          tool_name: 'apply_patch',
          tool_input: { command: `*** Begin Patch\n*** Update File: ${target}\n@@\n ${firstLine}\n+// patched\n*** End Patch\n` },
        }),
      }),
      mcp: await runMcp(workDir, root, target, args.calls),
    };
    report = {
      schemaVersion: 1,
      tool: 'memory-bench',
      runner: { platform: process.platform, arch: process.arch, node: process.version },
      size: args.size,
      budgets: { schemaVersion: budgets.schemaVersion, path: path.relative(REPO, BUDGETS) },
      scenarios,
    };
    const failures = memoryBudgetFailures(report, budgets);
    report.ok = failures.length === 0;
    report.failures = failures;
  } finally {
    if (!args.keep) fs.rmSync(base, { recursive: true, force: true });
  }
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Ark memory bench (n=${report.size})`);
    for (const [name, row] of Object.entries(report.scenarios)) {
      const rss = row.peakRssBytes ? `${(row.peakRssBytes / MB).toFixed(1)} MB` : 'n/a';
      const growth = 'heapGrowthBytes' in row ? ` heap growth ${(row.heapGrowthBytes / MB).toFixed(2)} MB` : '';
      console.log(`  ${name.padEnd(9)} peak RSS ${rss}${growth} (${row.ms} ms)`);
    }
    for (const failure of report.failures) console.log(`  FAIL ${failure}`);
  }
  if (args.failBudget && !report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 2;
  });
}
