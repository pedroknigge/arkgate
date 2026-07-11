/**
 * Shared Phase C verification helpers — one code path for vitest assertions and
 * {SCRATCH} artifact capture (see scripts/capture-phase-c-evidence.mjs).
 */
import { spawn, spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');

export const EVIDENCE_FILES = [
  'vitest-phase-c.log',
  'vitest-static-check.log',
  'mcp-recommend-parity.json',
  'session-context-hint.txt',
  'phase-c-docs.txt',
  'eval-cases.log',
  'check-architecture.log',
];

let mcpRuntimeDir;

function writeScratch(scratchDir, name, content) {
  fs.mkdirSync(scratchDir, { recursive: true });
  const file = path.join(scratchDir, name);
  fs.writeFileSync(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  return file;
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

export function ensureMcpRuntime() {
  if (mcpRuntimeDir) {
    return {
      mcpRuntimeDir,
      mcpBin: path.join(mcpRuntimeDir, 'bin/structrail-mcp.mjs'),
      structrailCheckBin: path.join(mcpRuntimeDir, 'bin/structrail-check.mjs'),
    };
  }
  execSync('npm run build', { cwd: REPO_ROOT, stdio: 'ignore' });
  mcpRuntimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-phasec-evidence-'));
  fs.cpSync(path.join(REPO_ROOT, 'bin'), path.join(mcpRuntimeDir, 'bin'), { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, 'dist'), path.join(mcpRuntimeDir, 'dist'), { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, 'templates'), path.join(mcpRuntimeDir, 'templates'), { recursive: true });
  return {
    mcpRuntimeDir,
    mcpBin: path.join(mcpRuntimeDir, 'bin/structrail-mcp.mjs'),
    structrailCheckBin: path.join(mcpRuntimeDir, 'bin/structrail-check.mjs'),
  };
}

function createMcpClient(mcpBin, projectRoot) {
  const proc = spawn('node', [mcpBin, '--root', projectRoot], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map();
  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  let nextId = 1;
  function request(method, params) {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
  function close() {
    proc.stdin.end();
    proc.kill();
  }
  return { request, close };
}

export async function listMcpToolNames(projectRoot) {
  const { mcpBin } = ensureMcpRuntime();
  const client = createMcpClient(mcpBin, projectRoot);
  try {
    const res = await client.request('tools/list');
    return res.result.tools.map((tool) => tool.name);
  } finally {
    client.close();
  }
}

function seedGreenfield(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify({ name: 'greenfield', version: '0.0.0' }, null, 2)}\n`
  );
}

export function captureVitestPhaseC(scratchDir, env = {}) {
  const result = spawnSync(
    'npm',
    ['run', 'test:run', '--', 'tests/unit/mcp/phase-c.test.ts'],
    { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, ...env } }
  );
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  writeScratch(scratchDir, 'vitest-phase-c.log', output);
  assertOk(result.status === 0, `vitest phase-c failed (exit ${result.status})`);
  return output;
}

export function captureVitestStaticCheck(scratchDir) {
  const result = spawnSync('npm', ['run', 'test:run', '--', 'tests/unit/static-check/'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  writeScratch(scratchDir, 'vitest-static-check.log', output);
  assertOk(result.status === 0, `vitest static-check failed (exit ${result.status})`);
  return output;
}

export async function captureMcpRecommendParity(scratchDir) {
  const { mcpBin, structrailCheckBin } = ensureMcpRuntime();
  const greenfield = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-parity-green-'));
  seedGreenfield(greenfield);

  const client = createMcpClient(mcpBin, greenfield);
  try {
    const mcpRes = await client.request('tools/call', { name: 'structrail_recommend', arguments: {} });
    assertOk(mcpRes.result?.content?.[0]?.text, 'structrail_recommend returned no content');
    const mcp = JSON.parse(mcpRes.result.content[0].text);

    const cli = spawnSync('node', [structrailCheckBin, '--root', greenfield, '--recommend', '--json'], {
      encoding: 'utf8',
    });
    assertOk(cli.status === 0, `CLI recommend failed (exit ${cli.status})`);
    const cliPayload = JSON.parse(cli.stdout);

    const matched =
      mcp.archetype === cliPayload.archetype &&
      mcp.preset === cliPayload.preset &&
      JSON.stringify(mcp.adoptInOrder?.phase1) === JSON.stringify(cliPayload.adoptInOrder?.phase1);

    assertOk(mcp.archetype, 'MCP payload missing archetype');
    assertOk(mcp.preset, 'MCP payload missing preset');
    assertOk(Array.isArray(mcp.adoptInOrder?.phase1), 'MCP payload missing adoptInOrder.phase1');
    assertOk(matched, 'MCP and CLI recommend payloads diverged');

    writeScratch(scratchDir, 'mcp-recommend-parity.json', {
      matched: true,
      mcp: {
        archetype: mcp.archetype,
        preset: mcp.preset,
        adoptInOrder: mcp.adoptInOrder,
        confidence: mcp.confidence,
        ok: mcp.ok,
      },
      cli: {
        archetype: cliPayload.archetype,
        preset: cliPayload.preset,
        adoptInOrder: cliPayload.adoptInOrder,
        confidence: cliPayload.confidence,
        ok: cliPayload.ok,
      },
    });

    return { mcp, cli: cliPayload, matched };
  } finally {
    client.close();
  }
}

export function captureSessionContextHint(scratchDir) {
  const { mcpBin } = ensureMcpRuntime();
  const lines = [];

  const lowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-session-low-'));
  fs.mkdirSync(path.join(lowRoot, 'src/loose'), { recursive: true });
  fs.writeFileSync(path.join(lowRoot, 'src/loose/util.ts'), 'export const u = 1;\n');
  fs.writeFileSync(
    path.join(lowRoot, 'structrail.config.json'),
    `${JSON.stringify(
      {
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] }],
        rules: [],
      },
      null,
      2
    )}\n`
  );

  const low = spawnSync('node', [mcpBin, '--session-context', '--root', lowRoot, '--config', 'structrail.config.json'], {
    encoding: 'utf8',
  });
  assertOk(low.status === 0, `session-context low fixture failed (exit ${low.status})`);
  assertOk(low.stdout.includes('New to Structrail?'), 'low-coverage session-context missing New to Structrail?');
  assertOk(low.stdout.includes('/structrail-architect'), 'low-coverage session-context missing /structrail-architect');
  assertOk(low.stdout.includes('structrail-check --recommend'), 'low-coverage session-context missing bare recommend command');

  lines.push('=== low coverage fixture ===');
  lines.push(low.stdout);

  const highRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-session-high-'));
  fs.mkdirSync(path.join(highRoot, 'src/domain'), { recursive: true });
  fs.writeFileSync(path.join(highRoot, 'src/domain/order.ts'), 'export const o = 1;\n');
  fs.writeFileSync(
    path.join(highRoot, 'structrail.config.json'),
    `${JSON.stringify(
      {
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] }],
        rules: [],
      },
      null,
      2
    )}\n`
  );

  const high = spawnSync('node', [mcpBin, '--session-context', '--root', highRoot, '--config', 'structrail.config.json'], {
    encoding: 'utf8',
  });
  assertOk(high.status === 0, `session-context high fixture failed (exit ${high.status})`);
  assertOk(!high.stdout.includes('New to Structrail?'), 'high-coverage session-context should omit New to Structrail?');

  lines.push('=== high coverage fixture ===');
  lines.push(high.stdout);

  writeScratch(scratchDir, 'session-context-hint.txt', `${lines.join('\n')}\n`);
  return { low: low.stdout, high: high.stdout };
}

export function capturePhaseCDocs(scratchDir) {
  const skillPath = path.join(REPO_ROOT, 'templates/skills/structrail-architect.md');
  const guidePath = path.join(REPO_ROOT, 'docs/agent-guide.md');
  assertOk(fs.existsSync(skillPath), 'templates/skills/structrail-architect.md missing');

  const grep = spawnSync(
    'grep',
    ['-n', '-E', 'structrail_recommend|structrail-architect|New to Structrail', guidePath, skillPath],
    { encoding: 'utf8' }
  );
  const output = grep.stdout || '';
  assertOk(output.includes('structrail_recommend'), 'phase-c-docs grep missing structrail_recommend');
  assertOk(output.includes('structrail-architect'), 'phase-c-docs grep missing structrail-architect');

  writeScratch(scratchDir, 'phase-c-docs.txt', output);
  return output;
}

export function captureEvalCases(scratchDir) {
  const lines = [];

  const skip = spawnSync('node', [path.join(REPO_ROOT, 'eval/run.mjs')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, STRUCTRAIL_EVAL_CASE: 'enthusiast-greenfield-crud' },
  });
  lines.push('=== STRUCTRAIL_EVAL_CASE=enthusiast-greenfield-crud ===');
  lines.push(`${skip.stdout}${skip.stderr}`);
  assertOk(`${skip.stdout}${skip.stderr}`.includes('SKIPPED'), 'greenfield-crud eval did not report SKIPPED');

  const wrongLayerCase = path.join(REPO_ROOT, 'eval/cases/enthusiast-wrong-layer');
  const pre = spawnSync(
    'node',
    [path.join(REPO_ROOT, 'bin/structrail-check.mjs'), '--root', wrongLayerCase, '--config', 'structrail.config.json'],
    { encoding: 'utf8' }
  );
  lines.push('=== enthusiast-wrong-layer pre-check ===');
  lines.push(`exit: ${pre.status}`);
  lines.push(`${pre.stdout}${pre.stderr}`);
  assertOk(pre.status === 1, `enthusiast-wrong-layer pre-check expected exit 1, got ${pre.status}`);

  writeScratch(scratchDir, 'eval-cases.log', `${lines.join('\n')}\n`);
  return lines.join('\n');
}

export function captureCheckArchitecture(scratchDir) {
  const result = spawnSync('npm', ['run', 'check:architecture'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  writeScratch(scratchDir, 'check-architecture.log', output);
  assertOk(result.status === 0, `check:architecture failed (exit ${result.status})`);
  assertOk(output.includes('Structrail check passed'), 'check:architecture output missing pass marker');
  return output;
}

export async function runAllPhaseCEvidence(scratchDir) {
  fs.mkdirSync(scratchDir, { recursive: true });
  captureVitestPhaseC(scratchDir, { PHASE_C_SCRATCH: scratchDir });
  captureVitestStaticCheck(scratchDir);
  await captureMcpRecommendParity(scratchDir);
  captureSessionContextHint(scratchDir);
  capturePhaseCDocs(scratchDir);
  captureEvalCases(scratchDir);
  captureCheckArchitecture(scratchDir);

  const missing = EVIDENCE_FILES.filter((name) => !fs.existsSync(path.join(scratchDir, name)));
  assertOk(missing.length === 0, `missing scratch artifacts: ${missing.join(', ')}`);
  return EVIDENCE_FILES.map((name) => path.join(scratchDir, name));
}
