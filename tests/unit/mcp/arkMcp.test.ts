import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Drives the ark-mcp server over stdio with real JSON-RPC messages. Requires the built
 * dist (the server imports the compiled library), so we build once up front. The server
 * is pointed at a temp project whose ark.config.json uses NON-canonical layer names
 * ("core"/"app") and a custom rule, to prove the write-path gate enforces the project's
 * profile + rules (not the built-in elevenLayerProfile) and resolves nested paths.
 */
function createClient(root: string) {
  const proc = spawn('node', [path.resolve('bin/ark-mcp.mjs'), '--root', root], {
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;

  const pending = new Map<number, (msg: any) => void>();
  const allMessages: any[] = [];
  let buffer = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      allMessages.push(msg);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
      }
    }
  });

  let nextId = 1;
  function request(method: string, params?: unknown): Promise<any> {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
  function sendRaw(obj: unknown) {
    proc.stdin.write(`${JSON.stringify(obj)}\n`);
  }
  function close() {
    proc.stdin.end();
    proc.kill();
  }
  return { request, sendRaw, allMessages, close };
}

describe('ark-mcp server (write-path gate)', () => {
  let projectRoot: string;
  let emptyRoot: string;
  let client: ReturnType<typeof createClient>;

  beforeAll(() => {
    execSync('npm run build', { stdio: 'ignore' });

    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-proj-'));
    fs.writeFileSync(
      path.join(projectRoot, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'core', patterns: ['src/core/**'], intentPrefixes: ['Domain.'] },
          { name: 'app', patterns: ['src/app/**'], intentPrefixes: ['Application.'] },
        ],
        rules: [{ from: 'core', to: 'app', allowed: false }],
      })
    );
    emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-empty-'));

    client = createClient(projectRoot);
  }, 120000);

  afterAll(() => client?.close());

  it('handshakes and echoes the protocol version', async () => {
    const res = await client.request('initialize', { protocolVersion: '2024-11-05' });
    expect(res.result.serverInfo.name).toBe('ark-runtime-kernel');
    expect(res.result.protocolVersion).toBe('2024-11-05');
    expect(res.result.capabilities).toHaveProperty('tools');
    expect(res.result.capabilities).toHaveProperty('resources');
  });

  it('lists the validate_code tool', async () => {
    const res = await client.request('tools/list');
    expect(res.result.tools.map((t: { name: string }) => t.name)).toContain('validate_code');
  });

  it('flags a forbidden infra import (isError + valid:false)', async () => {
    const res = await client.request('tools/call', {
      name: 'validate_code',
      arguments: {
        source: "import { db } from './infra/db';\nexport const x = db;\n",
        filePath: 'src/core/order.ts',
      },
    });
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(res.result.content[0].text).valid).toBe(false);
  });

  it('passes clean code (isError:false + valid:true)', async () => {
    const res = await client.request('tools/call', {
      name: 'validate_code',
      arguments: {
        source: 'export const total = (a: number, b: number) => a + b;\n',
        filePath: 'src/core/math.ts',
      },
    });
    expect(res.result.isError).toBe(false);
    expect(JSON.parse(res.result.content[0].text).valid).toBe(true);
  });

  it("enforces the PROJECT's layer names + rules on a nested file (not elevenLayerProfile)", async () => {
    // core -> app is forbidden by the project's ark.config.json (custom rule, non-canonical
    // names). The file is nested (src/core/sub/...) so layer inference must match `src/core/**`
    // across `/`. Under the built-in profile this would resolve to no rule and pass — the bug.
    const res = await client.request('tools/call', {
      name: 'validate_code',
      arguments: {
        source: "export const ref = 'Application.PlaceOrder';\n",
        filePath: 'src/core/sub/order.ts',
      },
    });
    expect(res.result.isError).toBe(true);
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.layer).toBe('core');
    expect(
      payload.violations.some((v: { code: string }) => v.code === 'LAYER_REFERENCE_VIOLATION')
    ).toBe(true);
  });

  it('serves the effective (project) profile as the manifest resource', async () => {
    const res = await client.request('resources/read', { uri: 'ark://manifest' });
    const contract = JSON.parse(res.result.contents[0].text);
    expect(contract.source).toBe('project');
    expect(contract.layers.map((l: { name: string }) => l.name).sort()).toEqual(['app', 'core']);
    expect(contract.rules.some((r: { from: string; to: string }) => r.from === 'core' && r.to === 'app')).toBe(
      true
    );
  });

  it('never responds to a notification (no id ever emitted)', async () => {
    client.sendRaw({ jsonrpc: '2.0', method: 'ping' }); // notification form: no id
    const res = await client.request('ping'); // request form: has id
    expect(res.result).toEqual({});
    // A spurious notification reply would have been emitted before this ping reply.
    expect(client.allMessages.every((m) => 'id' in m && m.id != null)).toBe(true);
  });

  it('falls back to the 11-layer default contract when the project has no config', async () => {
    const defaultClient = createClient(emptyRoot);
    try {
      await defaultClient.request('initialize', { protocolVersion: '2024-11-05' });
      const res = await defaultClient.request('resources/read', { uri: 'ark://manifest' });
      const contract = JSON.parse(res.result.contents[0].text);
      expect(contract.source).toBe('elevenLayerProfile');
      expect(contract.layers).toHaveLength(11);
    } finally {
      defaultClient.close();
    }
  });
});
