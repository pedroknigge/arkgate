import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

/**
 * Drives the ark-mcp server over stdio with real JSON-RPC messages. Requires the built
 * dist (the server imports the compiled library), so we build once up front.
 */
function createClient() {
  const proc = spawn('node', [path.resolve('bin/ark-mcp.mjs'), '--root', path.resolve('.')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;

  const pending = new Map<number, (msg: any) => void>();
  let buffer = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
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
  function close() {
    proc.stdin.end();
    proc.kill();
  }
  return { request, close };
}

describe('ark-mcp server (write-path gate)', () => {
  let client: ReturnType<typeof createClient>;

  beforeAll(() => {
    execSync('npm run build', { stdio: 'ignore' });
    client = createClient();
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

  it('flags architecturally-invalid generated code (isError + valid:false)', async () => {
    const res = await client.request('tools/call', {
      name: 'validate_code',
      arguments: {
        source: "import { db } from './infra/db';\nexport const x = db;\n",
        layer: 'DomainModel',
        filePath: 'src/domain/order.ts',
      },
    });
    expect(res.result.isError).toBe(true);
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.valid).toBe(false);
    expect(payload.violations.length).toBeGreaterThan(0);
  });

  it('passes clean code (isError:false + valid:true)', async () => {
    const res = await client.request('tools/call', {
      name: 'validate_code',
      arguments: {
        source: 'export const total = (a: number, b: number) => a + b;\n',
        layer: 'DomainModel',
        filePath: 'src/domain/math.ts',
      },
    });
    expect(res.result.isError).toBe(false);
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.valid).toBe(true);
  });

  it('serves the architectural contract as a resource', async () => {
    const res = await client.request('resources/read', { uri: 'ark://manifest' });
    const contract = JSON.parse(res.result.contents[0].text);
    expect(contract.layers).toHaveLength(11);
    expect(contract.rules.length).toBeGreaterThan(0);
  });
});
