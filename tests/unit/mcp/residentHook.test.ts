import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  RESIDENT_HOOK_PROTOCOL_VERSION,
  requestResidentHook,
  residentHookEndpoint,
} from '../../../bin/lib/resident-hook.mjs';

const repo = process.cwd();
const launcher = path.join(repo, 'bin', 'ark-mcp.mjs');
const roots: string[] = [];
const children: ChildProcessWithoutNullStreams[] = [];

function writeProject(forbiddenGlobals: string[] = ['fetch']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-resident-hook-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/services'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    `${JSON.stringify({
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'], forbiddenGlobals },
        { name: 'ApplicationOrchestration', patterns: ['src/services/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
    }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext' }, include: ['src'] }, null, 2)}\n`
  );
  fs.writeFileSync(path.join(root, 'src/domain/current.ts'), 'export const current = 1;\n');
  fs.writeFileSync(path.join(root, 'src/services/service.ts'), 'export const service = 1;\n');
  return root;
}

function invoke(root: string, payload: unknown, resident: boolean) {
  return spawnSync(
    process.execPath,
    [launcher, '--hook', '--hook-repair', '--root', root, '--config', 'ark.config.json'],
    {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, ARK_RESIDENT_HOOK: resident ? '1' : '0' },
    }
  );
}

async function startResident(root: string) {
  const child = spawn(
    process.execPath,
    [launcher, '--root', root, '--config', 'ark.config.json'],
    {
      cwd: repo,
      env: { ...process.env, ARK_RESIDENT_HOOK: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  ) as ChildProcessWithoutNullStreams;
  children.push(child);
  const endpoint = residentHookEndpoint({ root, config: 'ark.config.json', launcher });
  const payload = {
    tool_name: 'Write',
    tool_input: {
      file_path: path.join(root, 'src/domain/probe.ts'),
      content: 'export const probe = 1;\n',
    },
  };
  const request = {
    protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION,
    kind: 'hook',
    root,
    config: 'ark.config.json',
    manifest: null,
    tsconfig: null,
    hookRepair: true,
    grokHookEvent: false,
    payload,
  };
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const response = await requestResidentHook({
      socket: endpoint.socket,
      request,
      timeoutMs: 100,
    });
    if (response && response.fallback === false) return { child, endpoint, request, response };
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('resident hook server did not become ready');
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) {
      child.stdin.end();
      child.kill('SIGTERM');
    }
  }
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Z07 resident hook transport', () => {
  it('reuses the authoritative evaluator with exact one-shot bytes and fail-closed invalidation', async () => {
    const root = writeProject();
    const resident = await startResident(root);
    expect(resident.response).toMatchObject({
      protocolVersion: 1,
      fallback: false,
      mode: 'resident-warm',
      status: 0,
    });
    expect(resident.response.environmentIdentity).toMatch(/^sha256:[a-f0-9]{64}$/);

    const cases = [
      {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(root, 'src/domain/clean.ts'),
          content: 'export const clean = 1;\n',
        },
      },
      {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(root, 'src/domain/fetch.ts'),
          content: 'export const load = () => fetch("/orders");\n',
        },
      },
      {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(root, 'src/domain/import.ts'),
          content: 'import { service } from "../services/service";\nexport { service };\n',
        },
      },
      {
        toolName: 'write',
        toolInput: {
          file_path: path.join(root, 'src/domain/parse.ts'),
          content: 'export const broken = ;\n',
        },
      },
    ];
    for (const payload of cases) {
      const cold = invoke(root, payload, false);
      const warm = invoke(root, payload, true);
      expect(
        { status: warm.status, stdout: warm.stdout, stderr: warm.stderr },
        JSON.stringify(payload)
      ).toEqual({ status: cold.status, stdout: cold.stdout, stderr: cold.stderr });
    }

    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      `${JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], forbiddenGlobals: [] },
          { name: 'ApplicationOrchestration', patterns: ['src/services/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
      }, null, 2)}\n`
    );
    const invalidated = await requestResidentHook({
      socket: resident.endpoint.socket,
      request: resident.request,
      timeoutMs: 250,
    });
    expect(invalidated).toEqual({ protocolVersion: 1, fallback: true });

    const payload = cases[1];
    const coldAfter = invoke(root, payload, false);
    const fallbackAfter = invoke(root, payload, true);
    expect({
      status: fallbackAfter.status,
      stdout: fallbackAfter.stdout,
      stderr: fallbackAfter.stderr,
    }).toEqual({
      status: coldAfter.status,
      stdout: coldAfter.stdout,
      stderr: coldAfter.stderr,
    });
    expect(fallbackAfter.status).toBe(0);
  }, 20_000);
});
