#!/usr/bin/env node
/**
 * U06 — end-to-end pre-tool (hook) and doctor path benchmark (ADR 0009 D5).
 *
 * Measures the COMPLETE paths a user feels:
 *   hook.coldFallback — `ark-mcp --hook` validating one Write payload in a
 *                 fresh process with the resident pilot disabled
 *   hook.residentWarm — the same fresh launcher process and authoritative
 *                 evaluator over the opt-in resident MCP transport, after one
 *                 discarded prime; no verdict/result cache is involved
 *   doctor.cold — `ark-check --doctor --json --no-cache` over the tree
 *   doctor.oneShotWarm — the exact same command in fresh processes after one
 *                 discarded prime over the same immutable tree/cache state
 *   doctor.residentWarm — a fresh `ark-check` client reusing canonical facts in
 *                 the same resident MCP; dynamic doctor advisories are recomputed
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
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESIDENT_HOOK_PROTOCOL_VERSION,
  requestResidentHook,
  residentDoctorEnvironment,
  residentHookEndpoint,
} from '../bin/lib/resident-hook.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = fileURLToPath(import.meta.url);
const BUDGETS = path.join(REPO, 'eval', 'performance', 'hook-budgets.v1.json');
const MCP = path.join(REPO, 'bin', 'ark-mcp.mjs');

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

function runHookOnce(root, payload, resident) {
  const started = process.hrtime.bigint();
  const result = spawnSync(
    process.execPath,
    [MCP, '--hook', '--root', root, '--config', 'ark.config.json'],
    {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, ARK_RESIDENT_HOOK: resident ? '1' : '0' },
    }
  );
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  // The payload is clean by construction: a non-zero exit means a broken
  // environment, and its (fast) timing must never become a baseline.
  if (result.status !== 0) {
    throw new Error(`hook exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  return {
    elapsedMs,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function waitForSocket(socket, child, timeoutMs = 5_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (child.exitCode !== null) {
        reject(new Error(`resident MCP exited ${child.exitCode} before its socket was ready`));
        return;
      }
      const client = net.createConnection(socket);
      client.once('connect', () => {
        client.destroy();
        resolve();
      });
      client.once('error', () => {
        client.destroy();
        if (Date.now() - started >= timeoutMs) {
          reject(new Error(`resident MCP socket was not ready after ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, 10);
        }
      });
    };
    attempt();
  });
}

async function startResidentMcp(root) {
  const child = spawn(
    process.execPath,
    [MCP, '--root', root, '--config', 'ark.config.json'],
    {
      cwd: root,
      env: { ...process.env, ARK_RESIDENT_HOOK: '1' },
      stdio: ['pipe', 'ignore', 'pipe'],
    }
  );
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const endpoint = residentHookEndpoint({
    root,
    config: 'ark.config.json',
    launcher: MCP,
  });
  try {
    await waitForSocket(endpoint.socket, child);
  } catch (error) {
    child.kill('SIGTERM');
    throw new Error(`${error instanceof Error ? error.message : String(error)}${stderr ? `: ${stderr}` : ''}`);
  }
  return { child, endpoint, stderr: () => stderr };
}

function stopResidentMcp(control) {
  return new Promise((resolve) => {
    if (!control || control.child.exitCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => control.child.kill('SIGTERM'), 2_000);
    control.child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    control.child.stdin.end();
  });
}

function doctorCommand(root, resident = false) {
  return [
    path.join(REPO, 'bin/ark-check.mjs'),
    '--root',
    root,
    '--config',
    'ark.config.json',
    '--doctor',
    '--json',
    '--no-cache',
    ...(resident ? ['--resident'] : []),
  ];
}

function runDoctorSample(root, resident = false) {
  const argv = doctorCommand(root, resident);
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, argv, {
    encoding: 'utf8',
    env: resident
      ? {
          ...process.env,
          ARK_RESIDENT_DOCTOR_REQUIRED: '1',
          ARK_RESIDENT_DOCTOR_TIMEOUT_MS: '10000',
        }
      : process.env,
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`doctor exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  return {
    elapsedMs,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

async function residentDoctorMetadata(root, control) {
  return requestResidentHook({
    socket: control.endpoint.socket,
    timeoutMs: 10_000,
    request: {
      protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION,
      kind: 'doctor',
      root,
      config: 'ark.config.json',
      manifest: null,
      tsconfig: null,
      environment: residentDoctorEnvironment(),
    },
  });
}

async function residentHookMetadata(root, control, payload) {
  return requestResidentHook({
    socket: control.endpoint.socket,
    timeoutMs: 10_000,
    request: {
      protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION,
      kind: 'hook',
      root,
      config: 'ark.config.json',
      manifest: null,
      tsconfig: null,
      hookRepair: false,
      grokHookEvent: false,
      payload,
    },
  });
}

function metricAt(result, metric) {
  return metric.split('.').reduce((value, key) => value?.[key], result);
}

export function evidenceFailures(results) {
  const failures = [];
  for (const result of results) {
    const at = `n=${result.size}`;
    if (!result.fixture.unchanged || result.fixture.treeHashBefore !== result.fixture.treeHashAfter) {
      failures.push(`Evidence fail: fixture changed for ${at}`);
    }
    if (!result.hook.exactOutputParity) failures.push(`Evidence fail: hook output diverged for ${at}`);
    if (result.hook.residentWarm.resultCache !== false) {
      failures.push(`Evidence fail: hook result cache was not disabled for ${at}`);
    }
    if (!result.doctor.exactOutputParity) failures.push(`Evidence fail: doctor output diverged for ${at}`);
    if (
      result.doctor.cache.mode !== 'none' ||
      !result.doctor.cache.legacyCacheAbsentBefore ||
      !result.doctor.cache.legacyCacheAbsentAfter
    ) {
      failures.push(`Evidence fail: doctor cache invariant failed for ${at}`);
    }
    if (result.doctor.residentWarm.resultCache !== false) {
      failures.push(`Evidence fail: doctor result cache was not disabled for ${at}`);
    }
    if (result.doctor.residentWarm.snapshotReuse !== true) {
      failures.push(`Evidence fail: doctor snapshot was not reused for ${at}`);
    }
  }
  return failures;
}

async function main() {
  const args = parseArgs(process.argv);
  const budgets = fs.existsSync(BUDGETS) ? JSON.parse(fs.readFileSync(BUDGETS, 'utf8')) : undefined;
  const results = [];
  for (const size of args.sizes) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-bench-'));
    let residentControl;
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
      const hookColdFallback = [];
      const hookResidentWarm = [];
      const doctorCold = [];
      const doctorOneShotWarm = [];
      const doctorResidentWarm = [];
      for (let i = 0; i < args.runs; i += 1) {
        hookColdFallback.push(runHookOnce(root, payload, false));
      }
      residentControl = await startResidentMcp(root);
      const hookResidentPrime = runHookOnce(root, payload, true);
      const residentHook = await residentHookMetadata(root, residentControl, payload);
      if (!residentHook || residentHook.fallback !== false || residentHook.resultCache !== false) {
        throw new Error('resident hook did not expose a cache-free authoritative evaluation');
      }
      for (let i = 0; i < args.runs; i += 1) {
        hookResidentWarm.push(runHookOnce(root, payload, true));
      }
      const hookReference = hookColdFallback[0];
      const hookComparable = [
        ...hookColdFallback,
        hookResidentPrime,
        ...hookResidentWarm,
        residentHook,
      ];
      const hookExactOutputParity = hookComparable.every(
        (sample) =>
          sample.status === hookReference.status &&
          sample.stdout === hookReference.stdout &&
          sample.stderr === hookReference.stderr
      );
      const doctorRuns = Math.max(3, Math.floor(args.runs / 2));
      for (let i = 0; i < doctorRuns; i += 1) {
        doctorCold.push(runDoctorSample(root));
      }
      const doctorPrime = runDoctorSample(root);
      for (let i = 0; i < doctorRuns; i += 1) {
        doctorOneShotWarm.push(runDoctorSample(root));
      }
      const doctorResidentPrime = runDoctorSample(root, true);
      const residentDoctor = await residentDoctorMetadata(root, residentControl);
      if (!residentDoctor || residentDoctor.fallback !== false || residentDoctor.snapshotReuse !== true) {
        throw new Error('resident doctor did not expose a reusable canonical snapshot');
      }
      for (let i = 0; i < doctorRuns; i += 1) {
        doctorResidentWarm.push(runDoctorSample(root, true));
      }
      const reference = doctorCold[0];
      const comparableSamples = [
        ...doctorCold,
        doctorPrime,
        ...doctorOneShotWarm,
        doctorResidentPrime,
        ...doctorResidentWarm,
        residentDoctor,
      ];
      const exactOutputParity = comparableSamples.every(
        (sample) =>
          sample.status === reference.status &&
          sample.stdout === reference.stdout &&
          (sample.stderr ?? '') === reference.stderr
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
        hook: {
          coldFallback: stats(hookColdFallback.map((sample) => sample.elapsedMs)),
          residentWarm: {
            ...stats(hookResidentWarm.map((sample) => sample.elapsedMs)),
            primeMs: Number(hookResidentPrime.elapsedMs.toFixed(3)),
            transport: process.platform === 'win32' ? 'named-pipe' : 'unix-socket',
            resultCache: residentHook.resultCache,
          },
          exactOutputParity: hookExactOutputParity,
          outputSha256: `sha256:${sha256(
            `${hookReference.status}\0${hookReference.stdout}\0${hookReference.stderr}`
          )}`,
        },
        doctor: {
          executable: process.execPath,
          argv: doctorCommand(root),
          processMode: 'fresh-client-per-sample',
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
          residentWarm: {
            ...stats(doctorResidentWarm.map((sample) => sample.elapsedMs)),
            primeMs: Number(doctorResidentPrime.elapsedMs.toFixed(3)),
            transport: process.platform === 'win32' ? 'named-pipe' : 'unix-socket',
            resultCache: residentDoctor.resultCache,
            snapshotReuse: residentDoctor.snapshotReuse,
            analysisIdentity: residentDoctor.analysisIdentity,
          },
          exactOutputParity,
          outputSha256: `sha256:${sha256(reference.stdout)}`,
        },
      });
    } finally {
      await stopResidentMcp(residentControl);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const failures = evidenceFailures(results);
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
    schemaVersion: 4,
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
        `size ${r.size}: hook fallback/resident p95 ${r.hook.coldFallback.p95Ms}/${r.hook.residentWarm.p95Ms}ms · doctor cold p95 ${r.doctor.cold.p95Ms}ms · ` +
          `doctor one-shot/resident warm p95 ${r.doctor.oneShotWarm.p95Ms}/${r.doctor.residentWarm.p95Ms}ms`
      );
    }
  }
  for (const failure of failures) console.error(failure);
  if (failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 2;
  });
}
