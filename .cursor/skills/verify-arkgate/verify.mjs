#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SCRIPT_DIR, '../../..');
const MAP_PATH = path.join(REPO, 'docs/feature-map.json');
const DEFAULT_EVIDENCE = '/tmp/arkgate-verify-evidence.txt';
const BINS = {
  'ark-check': 'bin/ark-check.mjs',
  ark: 'bin/ark.mjs',
  'ark-mcp': 'bin/ark-mcp.mjs',
};
const STEP_TIMEOUT_MS = 20_000;
const RPC_TIMEOUT_MS = 15_000;

function parseArgs(argv) {
  const args = { doctor: false, only: undefined, evidence: DEFAULT_EVIDENCE, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--doctor') args.doctor = true;
    else if (flag === '--help' || flag === '-h') args.help = true;
    else if (flag === '--only') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --only');
      args.only = value;
      index += 1;
    } else if (flag === '--evidence') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --evidence');
      args.evidence = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument ${flag}`);
    }
  }
  return args;
}

function usage() {
  return [
    'node .cursor/skills/verify-arkgate/verify.mjs [--doctor] [--only <feature-id>] [--evidence <path>]',
    'Reads docs/feature-map.json, runs the real CLI, and writes the report.',
  ].join('\n');
}

function loadMap() {
  return JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
}

function tempParent() {
  const base = path.resolve(os.tmpdir());
  if (base === REPO || base.startsWith(`${REPO}${path.sep}`)) return '/tmp';
  return base;
}

function stripAnsi(text) {
  return String(text).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

function substitute(value, root) {
  if (typeof value === 'string') return value.replaceAll('{root}', root).replaceAll('{repo}', REPO);
  if (Array.isArray(value)) return value.map((item) => substitute(item, root));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = substitute(item, root);
    return out;
  }
  return value;
}

function versionLine() {
  const result = spawnSync(process.execPath, [path.join(REPO, BINS.ark), '--version'], {
    encoding: 'utf8',
    cwd: REPO,
    timeout: 10_000,
  });
  const printed = stripAnsi(`${result.stdout ?? ''}`).trim();
  if (result.status === 0 && printed) return printed.split('\n')[0];
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  return `${pkg.version} (package.json)`;
}

function doctor(map) {
  const lines = ['doctor'];
  const missing = [];
  lines.push(`  node ${process.version}`);
  for (const relative of Object.values(BINS)) {
    const ok = fs.existsSync(path.join(REPO, relative));
    lines.push(`  ${relative} ${ok ? 'present' : 'MISSING'}`);
    if (!ok) missing.push(relative);
  }
  const typescript = 'node_modules/typescript-ark-host/package.json';
  const dist = 'dist/index.js';
  for (const relative of [typescript, dist]) {
    const ok = fs.existsSync(path.join(REPO, relative));
    lines.push(`  ${relative} ${ok ? 'present' : 'MISSING'}`);
    if (!ok) missing.push(relative);
  }
  const fixtures = new Set();
  for (const feature of map.features) {
    const featureFile = path.join(SCRIPT_DIR, 'features', `${feature.id}.md`);
    if (!fs.existsSync(featureFile)) missing.push(`.cursor/skills/verify-arkgate/features/${feature.id}.md`);
    for (const proof of feature.proofs ?? []) {
      if (proof.root) fixtures.add(proof.root);
      if (proof.workspace?.copy) fixtures.add(proof.workspace.copy);
      for (const source of proof.workspace?.mergeJson?.sources ?? []) fixtures.add(source);
    }
  }
  for (const relative of fixtures) {
    const ok = fs.existsSync(path.join(REPO, relative));
    if (!ok) {
      lines.push(`  fixture ${relative} MISSING`);
      missing.push(relative);
    }
  }
  lines.push(`  fixtures ${fixtures.size}`);
  if (missing.length === 0) lines.push('doctor ok');
  else {
    lines.push('doctor failed');
    lines.push('Next: from the repo root, npm ci && npm run build');
  }
  return { text: `${lines.join('\n')}\n`, ok: missing.length === 0 };
}

function prepareWorkspace(workspace) {
  const dir = fs.mkdtempSync(path.join(tempParent(), 'arkgate-verify-'));
  fs.cpSync(path.join(REPO, workspace.copy), dir, { recursive: true });
  for (const relative of workspace.remove ?? []) {
    fs.rmSync(path.join(dir, relative), { recursive: true, force: true });
  }
  for (const [from, to] of workspace.rename ?? []) {
    fs.renameSync(path.join(dir, from), path.join(dir, to));
  }
  if (workspace.mergeJson) {
    let merged = {};
    for (const source of workspace.mergeJson.sources) {
      merged = { ...merged, ...JSON.parse(fs.readFileSync(path.join(REPO, source), 'utf8')) };
    }
    const destination = path.join(dir, workspace.mergeJson.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(merged, null, 2)}\n`);
  }
  return dir;
}

function commandText(bin, args) {
  return `node ${BINS[bin]} ${args.join(' ')}`;
}

function runProcess(bin, args, stdin) {
  return spawnSync(process.execPath, [path.join(REPO, BINS[bin]), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    input: stdin,
    timeout: STEP_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function runRpc(bin, args, calls) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(REPO, BINS[bin]), ...args], {
      cwd: REPO,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let buffer = '';
    const seen = new Set();
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (!line) continue;
        stdout += `${line}\n`;
        try {
          const message = JSON.parse(line);
          if (message.id != null) seen.add(message.id);
        } catch {
          continue;
        }
      }
      if (seen.size === calls.length) finish(0);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    calls.forEach((call, index) => {
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: index + 1, method: call.method, params: call.params })}\n`
      );
    });
    const timer = setTimeout(() => finish(1), RPC_TIMEOUT_MS);
    let settled = false;
    function finish(status) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve({ status, stdout, stderr, error: null });
    }
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr, error });
    });
  });
}

function excerpt(output, needle) {
  const index = output.indexOf(needle);
  if (index < 0) return null;
  const lineStart = output.lastIndexOf('\n', index) + 1;
  const lineEnd = output.indexOf('\n', index);
  let line = output.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
  if (line.length > 180) {
    const at = Math.max(0, line.indexOf(needle) - 50);
    line = line.slice(at, at + needle.length + 90);
  }
  return line.replaceAll('\\n', ' ').replaceAll('\\"', '"').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function evaluate(expect, output, status, root) {
  const problems = [];
  if (expect.exit !== undefined && status !== expect.exit) {
    problems.push(`exit ${status}, expected ${expect.exit}`);
  }
  for (const needle of expect.outputIncludes ?? []) {
    if (!output.includes(needle)) problems.push(`missing ${JSON.stringify(needle)}`);
  }
  for (const needle of expect.outputExcludes ?? []) {
    if (output.includes(needle)) problems.push(`unexpected ${JSON.stringify(needle)}`);
  }
  for (const file of expect.files ?? []) {
    const absolute = path.join(root, file.path);
    const exists = fs.existsSync(absolute);
    if (file.absent) {
      if (exists) problems.push(`${file.path} exists`);
      continue;
    }
    if (!exists) {
      problems.push(`${file.path} missing`);
      continue;
    }
    if (file.includes || file.excludes) {
      const text = fs.readFileSync(absolute, 'utf8');
      for (const needle of file.includes ?? []) {
        if (!text.includes(needle)) problems.push(`${file.path} missing ${JSON.stringify(needle)}`);
      }
      for (const needle of file.excludes ?? []) {
        if (text.includes(needle)) problems.push(`${file.path} contains ${JSON.stringify(needle)}`);
      }
    }
  }
  return problems;
}

function cleanupPaths(root, relativePaths) {
  for (const relative of relativePaths ?? []) {
    fs.rmSync(path.join(root, relative), { recursive: true, force: true });
  }
}

async function runProof(proof) {
  const lines = [];
  let workspace;
  let root = proof.root ? path.resolve(REPO, proof.root) : REPO;
  try {
    if (proof.needsDist && !fs.existsSync(path.join(REPO, 'dist/index.js'))) {
      return { ok: false, lines: ['  dist/index.js missing. Run npm run build'] };
    }
    if (proof.workspace) {
      workspace = prepareWorkspace(proof.workspace);
      root = workspace;
    }
    let ok = true;
    for (const step of proof.steps) {
      const args = substitute(step.args, root);
      lines.push(`  $ ${commandText(step.bin, args)}`);
      let result;
      if (step.rpc) {
        result = await runRpc(step.bin, args, substitute(step.rpc, root));
      } else {
        const stdin = step.stdin === undefined ? undefined : JSON.stringify(substitute(step.stdin, root));
        result = runProcess(step.bin, args, stdin);
        if (result.error) {
          ok = false;
          lines.push(`  ${result.error.message}`);
          continue;
        }
      }
      const output = stripAnsi(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
      const problems = evaluate(step.expect, output, result.status ?? 1, root);
      if (problems.length > 0) {
        ok = false;
        for (const problem of problems) lines.push(`  ${problem}`);
      }
      const seen = new Set();
      for (const needle of step.expect.outputIncludes ?? []) {
        const line = excerpt(output, needle);
        if (line && !seen.has(line)) {
          seen.add(line);
          lines.push(`  ${line}`);
        }
      }
    }
    return { ok, lines };
  } catch (error) {
    return { ok: false, lines: [...lines, `  ${error instanceof Error ? error.message : String(error)}`] };
  } finally {
    cleanupPaths(root, proof.cleanup);
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const map = loadMap();
  if (args.doctor) {
    const report = doctor(map);
    process.stdout.write(report.text);
    if (!report.ok) process.exitCode = 1;
    return;
  }
  const check = doctor(map);
  if (!check.ok) {
    process.stdout.write(check.text);
    process.exitCode = 1;
    return;
  }
  const features = map.features.filter((feature) => !args.only || feature.id === args.only);
  if (args.only && features.length === 0) throw new Error(`No feature ${args.only}`);
  const lines = [
    'ArkGate verification',
    `version: ${versionLine()}`,
    `map: docs/feature-map.json`,
    `root: ${REPO}`,
    '',
  ];
  let failed = 0;
  let passed = 0;
  for (const feature of features) {
    for (const proof of feature.proofs ?? []) {
      if (proof.driver === false) continue;
      const result = await runProof(proof);
      const label = result.ok ? 'PASS' : 'FAIL';
      if (result.ok) passed += 1;
      else failed += 1;
      lines.push(`${label}  ${feature.id}  ${proof.id}`);
      lines.push(...result.lines);
    }
  }
  lines.push('');
  lines.push(`${passed} passed, ${failed} failed`);
  const text = `${lines.join('\n')}\n`;
  fs.writeFileSync(args.evidence, text);
  process.stdout.write(text);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
