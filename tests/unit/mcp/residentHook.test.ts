import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createResidentInputLedger,
  RESIDENT_HOOK_PROTOCOL_VERSION,
  requestResidentHook,
  residentDoctorEnvironment,
  residentEnvironmentIdentity,
  residentHookEndpoint,
  startResidentHookServer,
} from '../../../bin/lib/resident-hook.mjs';
import { tryResidentDoctor } from '../../../bin/lib/resident-doctor-client.mjs';

const repo = process.cwd();
const launcher = path.join(repo, 'bin', 'ark-mcp.mjs');
const checker = path.join(repo, 'bin', 'ark-check.mjs');
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

function invokeDoctor(root: string, resident: boolean) {
  return spawnSync(
    process.execPath,
    [
      checker,
      '--root', root,
      '--config', 'ark.config.json',
      '--doctor', '--json', '--no-cache',
      ...(resident ? ['--resident'] : []),
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...(resident
          ? {
              ARK_RESIDENT_DOCTOR_REQUIRED: '1',
              ARK_RESIDENT_DOCTOR_TIMEOUT_MS: '5000',
            }
          : {}),
      },
    }
  );
}

function requestDoctor(root: string, endpoint: { socket: string }) {
  return requestResidentHook({
    socket: endpoint.socket,
    timeoutMs: 5_000,
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
  it('keeps resident doctor opt-in and rejects incomplete invocation contracts', async () => {
    await expect(tryResidentDoctor({ resident: false })).resolves.toBe(false);
    await expect(tryResidentDoctor({ resident: true, doctor: false, json: true })).rejects.toThrow(
      '--resident requires --doctor --json.'
    );
    await expect(tryResidentDoctor({ resident: true, doctor: true, json: false })).rejects.toThrow(
      '--resident requires --doctor --json.'
    );
    const root = writeProject();
    const oldTimeout = process.env.ARK_RESIDENT_DOCTOR_TIMEOUT_MS;
    const oldRequired = process.env.ARK_RESIDENT_DOCTOR_REQUIRED;
    process.env.ARK_RESIDENT_DOCTOR_TIMEOUT_MS = '5';
    delete process.env.ARK_RESIDENT_DOCTOR_REQUIRED;
    try {
      await expect(tryResidentDoctor({
        resident: true,
        doctor: true,
        json: true,
        root,
        config: 'ark.config.json',
      })).resolves.toBe(false);
      process.env.ARK_RESIDENT_DOCTOR_REQUIRED = '1';
      await expect(tryResidentDoctor({
        resident: true,
        doctor: true,
        json: true,
        root,
        config: 'ark.config.json',
      })).rejects.toThrow('Resident doctor was required but unavailable.');
    } finally {
      if (oldTimeout === undefined) delete process.env.ARK_RESIDENT_DOCTOR_TIMEOUT_MS;
      else process.env.ARK_RESIDENT_DOCTOR_TIMEOUT_MS = oldTimeout;
      if (oldRequired === undefined) delete process.env.ARK_RESIDENT_DOCTOR_REQUIRED;
      else process.env.ARK_RESIDENT_DOCTOR_REQUIRED = oldRequired;
    }
  });

  it('accepts a complete cache-free resident doctor response', async () => {
    const root = writeProject();
    fs.writeFileSync(path.join(root, 'ark.manifest.json'), '{}\n');
    const endpoint = residentHookEndpoint({
      root,
      config: 'ark.config.json',
      manifest: 'ark.manifest.json',
      tsconfig: 'tsconfig.json',
      launcher,
    });
    const server = await startResidentHookServer({
      endpoint,
      handle: () => ({
        protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION,
        fallback: false,
        status: 0,
        stdout: 'resident-out',
        stderr: 'resident-err',
      }),
    });
    expect(server).not.toBeNull();
    const oldTimeout = process.env.ARK_RESIDENT_DOCTOR_TIMEOUT_MS;
    const oldExitCode = process.exitCode;
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env.ARK_RESIDENT_DOCTOR_TIMEOUT_MS = 'not-a-number';
    try {
      await expect(tryResidentDoctor({
        resident: true,
        doctor: true,
        json: true,
        root,
        config: 'ark.config.json',
        manifest: 'ark.manifest.json',
        tsconfig: 'tsconfig.json',
      })).resolves.toBe(true);
      expect(stdout).toHaveBeenCalledWith('resident-out');
      expect(stderr).toHaveBeenCalledWith('resident-err');
    } finally {
      server?.cleanup();
      stdout.mockRestore();
      stderr.mockRestore();
      process.exitCode = oldExitCode;
      if (oldTimeout === undefined) delete process.env.ARK_RESIDENT_DOCTOR_TIMEOUT_MS;
      else process.env.ARK_RESIDENT_DOCTOR_TIMEOUT_MS = oldTimeout;
    }
  });

  it('binds resident doctor output to every host, home, and provider environment input', () => {
    const first = residentDoctorEnvironment({
      CODEX_THREAD_ID: 'thread',
      CLAUDE_PROJECT_DIR: '/project',
      CURSOR_TRACE_ID: 'trace',
      GROK_SESSION_ID: 'session',
      GH_TOKEN: 'token',
      HOME: '/home',
      PATH: '/bin',
    });
    const changed = residentDoctorEnvironment({ CODEX_THREAD_ID: 'other' });
    expect(first.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(changed.digest).not.toBe(first.digest);
    expect(JSON.stringify(first)).not.toContain('token');
  });

  it('invalidates same-size edits, missing probes, directory topology, and symlink targets', () => {
    const root = writeProject();
    const source = path.join(root, 'src/domain/current.ts');
    const missing = path.join(root, 'src/domain/missing.ts');
    const directory = path.join(root, 'src/domain');
    const original = fs.statSync(source);
    const ledger = createResidentInputLedger([source, missing, directory]);
    const mixedIdentity = residentEnvironmentIdentity(
      [source, missing, directory],
      ['phase-z']
    );
    expect(mixedIdentity).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(mixedIdentity).not.toBe(
      residentEnvironmentIdentity([source, missing, directory], ['other-token'])
    );
    expect(ledger.matches()).toBe(true);
    fs.writeFileSync(source, 'export const current = 2;\n');
    fs.utimesSync(source, original.atime, original.mtime);
    expect(ledger.matches()).toBe(false);

    const missingLedger = createResidentInputLedger([missing]);
    fs.writeFileSync(missing, 'export const appeared = true;\n');
    expect(missingLedger.matches()).toBe(false);

    const directoryLedger = createResidentInputLedger([directory]);
    fs.writeFileSync(path.join(directory, 'added.ts'), 'export {};\n');
    expect(directoryLedger.matches()).toBe(false);

    if (process.platform !== 'win32') {
      const first = path.join(root, 'src/domain/first.ts');
      const second = path.join(root, 'src/domain/second.ts');
      const link = path.join(root, 'src/domain/linked.ts');
      fs.writeFileSync(first, 'export const value = 1;\n');
      fs.writeFileSync(second, 'export const value = 2;\n');
      fs.symlinkSync(first, link);
      const linkLedger = createResidentInputLedger([link]);
      const linkIdentity = residentEnvironmentIdentity([link]);
      const targetStat = fs.statSync(first);
      fs.writeFileSync(first, 'export const value = 3;\n');
      fs.utimesSync(first, targetStat.atime, targetStat.mtime);
      expect(residentEnvironmentIdentity([link])).not.toBe(linkIdentity);
      fs.unlinkSync(link);
      fs.symlinkSync(second, link);
      expect(linkLedger.matches()).toBe(false);
    }
  });

  it('uses the complete packaged runtime surface in the resident endpoint identity', () => {
    const root = writeProject();
    const bin = path.join(root, 'bin');
    const lib = path.join(bin, 'lib');
    const dist = path.join(root, 'dist');
    fs.mkdirSync(lib, { recursive: true });
    fs.mkdirSync(dist);
    const localLauncher = path.join(bin, 'ark-mcp.mjs');
    const runtime = path.join(bin, 'ark-mcp-runtime.mjs');
    const analysis = path.join(lib, 'analysis-engine.mjs');
    const publicGate = path.join(dist, 'index.js');
    fs.writeFileSync(localLauncher, 'export {};\n');
    fs.writeFileSync(runtime, 'export const runtime = 1;\n');
    fs.writeFileSync(analysis, 'export const analysis = 1;\n');
    fs.writeFileSync(publicGate, 'export const gate = 1;\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"probe","version":"1.0.0"}\n');
    const before = residentHookEndpoint({ root, config: 'ark.config.json', launcher: localLauncher });
    const unresolvedRoot = residentHookEndpoint({
      root: path.join(root, 'not-created-yet'),
      config: 'ark.config.json',
      launcher: localLauncher,
    });
    fs.writeFileSync(analysis, 'export const analysis = 2;\n');
    const helperChanged = residentHookEndpoint({ root, config: 'ark.config.json', launcher: localLauncher });
    fs.writeFileSync(publicGate, 'export const gate = 2;\n');
    const distChanged = residentHookEndpoint({ root, config: 'ark.config.json', launcher: localLauncher });
    expect(helperChanged.socket).not.toBe(before.socket);
    expect(distChanged.socket).not.toBe(helperChanged.socket);
    expect(unresolvedRoot.socket).not.toBe(before.socket);
  });

  it('reuses the authoritative evaluator with exact one-shot bytes and fail-closed invalidation', async () => {
    const root = writeProject();
    const resident = await startResident(root);
    expect(resident.response).toMatchObject({
      protocolVersion: 1,
      fallback: false,
      mode: 'resident-warm',
      resultCache: false,
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

  it('reuses canonical facts for exact doctor bytes and rebuilds after source changes', async () => {
    const root = writeProject();
    const resident = await startResident(root);
    const cold = invokeDoctor(root, false);
    const warm = invokeDoctor(root, true);
    expect({ status: warm.status, stdout: warm.stdout, stderr: warm.stderr }).toEqual({
      status: cold.status,
      stdout: cold.stdout,
      stderr: cold.stderr,
    });

    const first = await requestDoctor(root, resident.endpoint);
    expect(first).toMatchObject({
      fallback: false,
      mode: 'resident-warm',
      resultCache: false,
      snapshotReuse: true,
      status: 0,
      stdout: cold.stdout,
    });
    expect(first.analysisIdentity).toMatchObject({
      policyHash: expect.stringMatching(/^fnv1a-/),
      factsHash: expect.stringMatching(/^fnv1a-/),
      candidateTreeHash: expect.stringMatching(/^fnv1a-/),
    });

    const current = path.join(root, 'src/domain/current.ts');
    const original = fs.statSync(current);
    fs.writeFileSync(current, 'export const current = 2;\n');
    fs.utimesSync(current, original.atime, original.mtime);
    fs.unlinkSync(path.join(root, 'src/services/service.ts'));
    fs.writeFileSync(path.join(root, 'src/domain/created.ts'), 'export const created = true;\n');

    const coldAfter = invokeDoctor(root, false);
    const warmAfter = invokeDoctor(root, true);
    expect({ status: warmAfter.status, stdout: warmAfter.stdout, stderr: warmAfter.stderr }).toEqual({
      status: coldAfter.status,
      stdout: coldAfter.stdout,
      stderr: coldAfter.stderr,
    });
    const rebuilt = await requestDoctor(root, resident.endpoint);
    expect(rebuilt).toMatchObject({ fallback: false, snapshotReuse: true, stdout: coldAfter.stdout });
    expect(rebuilt.analysisIdentity.factsHash).not.toBe(first.analysisIdentity.factsHash);
  }, 30_000);
});
