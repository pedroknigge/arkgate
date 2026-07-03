import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
let mcpRuntimeDir: string | undefined;
let mcpBin = path.join(root, 'bin', 'ark-mcp.mjs');

function prepareMcpRuntime() {
  if (mcpRuntimeDir) return;

  execSync('npm run build', { stdio: 'ignore' });

  mcpRuntimeDir = fs.mkdtempSync(path.join(root, '.ark-mcp-runtime-'));
  fs.cpSync(path.join(root, 'bin'), path.join(mcpRuntimeDir, 'bin'), { recursive: true });
  fs.cpSync(path.join(root, 'dist'), path.join(mcpRuntimeDir, 'dist'), { recursive: true });
  mcpBin = path.join(mcpRuntimeDir, 'bin', 'ark-mcp.mjs');
}

afterAll(() => {
  if (!mcpRuntimeDir) return;
  fs.rmSync(mcpRuntimeDir, { recursive: true, force: true });
});

/**
 * Drives the ark-mcp server over stdio with real JSON-RPC messages. Requires the built
 * dist (the server imports the compiled library), so we build once up front. The server
 * is pointed at a temp project whose ark.config.json uses NON-canonical layer names
 * ("core"/"app") and a custom rule, to prove the write-path gate enforces the project's
 * profile + rules (not the built-in elevenLayerProfile) and resolves nested paths.
 */
function createClient(root: string, extraArgs: string[] = []) {
  const proc = spawn('node', [mcpBin, '--root', root, ...extraArgs], {
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
    prepareMcpRuntime();

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

  it('uses the AST-backed gate to flag Ark publish calls without source metadata', async () => {
    const res = await client.request('tools/call', {
      name: 'validate_code',
      arguments: {
        source: 'bus.publish(OrderPlaced, { id: "o1" });\n',
        filePath: 'src/app/placeOrder.ts',
      },
    });

    expect(res.result.isError).toBe(true);
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.layer).toBe('app');
    expect(
      payload.violations.some((v: { code: string }) => v.code === 'PUBLISH_MISSING_SOURCE')
    ).toBe(true);
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
    // Undeclared default layers come back as placement suggestions for the agent.
    const suggested = contract.suggestedLayers.map((s: { layer: string }) => s.layer);
    expect(suggested).toContain('WorkflowSagaEngine');
    expect(
      contract.suggestedLayers.find((s: { layer: string }) => s.layer === 'WorkflowSagaEngine')
        .conventionalDirectories
    ).toEqual(['workflows', 'sagas']);
  });

  it('never responds to a notification (no id ever emitted)', async () => {
    client.sendRaw({ jsonrpc: '2.0', method: 'ping' }); // notification form: no id
    const res = await client.request('ping'); // request form: has id
    expect(res.result).toEqual({});
    // A spurious notification reply would have been emitted before this ping reply.
    expect(client.allMessages.every((m) => 'id' in m && m.id != null)).toBe(true);
  });

  it('applies DEFAULT_RULES when the config declares layers but omits rules (parity with ark-check)', async () => {
    const noRulesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-norules-'));
    fs.writeFileSync(
      path.join(noRulesRoot, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
          {
            name: 'PersistenceAdapters',
            patterns: ['src/infra/**'],
            intentPrefixes: ['Adapter.Persistence.'],
          },
        ],
        // no "rules" key — ark-check substitutes DEFAULT_RULES; the gate must match.
      })
    );
    const c = createClient(noRulesRoot);
    try {
      await c.request('initialize', { protocolVersion: '2024-11-05' });
      const res = await c.request('tools/call', {
        name: 'validate_code',
        arguments: {
          source: "export const ref = 'Adapter.Persistence.Save';\n",
          filePath: 'src/domain/order.ts',
        },
      });
      expect(res.result.isError).toBe(true);
      const payload = JSON.parse(res.result.content[0].text);
      expect(
        payload.violations.some((v: { code: string }) => v.code === 'LAYER_REFERENCE_VIOLATION')
      ).toBe(true);
    } finally {
      c.close();
    }
  });

  it('falls back to the 11-layer default contract when the project has no config', async () => {
    const defaultClient = createClient(emptyRoot);
    try {
      await defaultClient.request('initialize', { protocolVersion: '2024-11-05' });
      const res = await defaultClient.request('resources/read', { uri: 'ark://manifest' });
      const contract = JSON.parse(res.result.contents[0].text);
      expect(contract.source).toBe('strictDefaultElevenLayerProfile');
      expect(contract.layers).toHaveLength(11);
      // All 11 layers are active — nothing left to suggest.
      expect(contract.suggestedLayers).toBeUndefined();
    } finally {
      defaultClient.close();
    }
  });

  it('marks an externally supplied manifest as the manifest source', async () => {
    const manifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-manifest-'));
    fs.writeFileSync(
      path.join(manifestRoot, 'ark.manifest.json'),
      JSON.stringify({
        architecture: {
          layers: [
            { name: 'DomainModel', prefixes: ['Domain.'] },
            { name: 'PersistenceAdapters', prefixes: ['Adapter.Persistence.'] },
          ],
          rules: [
            { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          ],
        },
      })
    );
    const manifestClient = createClient(manifestRoot, ['--manifest', 'ark.manifest.json']);
    try {
      await manifestClient.request('initialize', { protocolVersion: '2024-11-05' });
      const res = await manifestClient.request('resources/read', { uri: 'ark://manifest' });
      const contract = JSON.parse(res.result.contents[0].text);
      expect(contract.source).toBe('manifest');
      expect(contract.architecture.layers[0].name).toBe('DomainModel');

      const validation = await manifestClient.request('tools/call', {
        name: 'validate_code',
        arguments: {
          source: "export const ref = 'Adapter.Persistence.Save';\n",
          layer: 'DomainModel',
        },
      });
      expect(validation.result.isError).toBe(true);
    } finally {
      manifestClient.close();
    }
  });
});

/**
 * One-shot hook mode (Claude Code PreToolUse contract): payload on stdin, exit 2 +
 * violations on stderr blocks the write, exit 0 allows it. Plumbing failures must
 * fail open (never block the agent on gate errors).
 */
function runHook(root: string, payload: unknown) {
  const result = spawnSync(
    'node',
    [mcpBin, '--hook', '--root', root],
    {
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      encoding: 'utf8',
    }
  );
  return { status: result.status, stderr: result.stderr };
}

describe('ark-mcp --hook (PreToolUse gate)', () => {
  let root: string;

  beforeAll(() => {
    prepareMcpRuntime();

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] }],
        rules: [],
      })
    );
  });

  it('blocks a Write that violates the architecture (exit 2, violations on stderr)', () => {
    const result = runHook(root, {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/domain/customer.ts'),
        content: "import { PrismaClient } from 'prisma';\nexport const repo = new PrismaClient();\n",
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('FORBIDDEN_IMPORT');
    expect(result.stderr).toContain('DomainModel');
  });

  it('allows a clean Write (exit 0)', () => {
    const result = runHook(root, {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/domain/customer.ts'),
        content: 'export interface Customer { id: string }\n',
      },
    });
    expect(result.status).toBe(0);
  });

  it('validates the post-edit file state for Edit, not the snippet alone', () => {
    const result = runHook(root, {
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(root, 'src/domain/order.ts'),
        old_string: 'export const a = 1;',
        new_string: "import { db } from 'typeorm';\nexport const a = db;",
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('typeorm');
  });

  it('ignores non-source files and tools other than Write/Edit', () => {
    const readme = runHook(root, {
      tool_name: 'Write',
      tool_input: { file_path: path.join(root, 'README.md'), content: '# prisma' },
    });
    expect(readme.status).toBe(0);

    const bash = runHook(root, {
      tool_name: 'Bash',
      tool_input: { command: "echo 'import prisma'" },
    });
    expect(bash.status).toBe(0);
  });

  it('fails open on malformed stdin payloads', () => {
    const result = runHook(root, 'not json at all');
    expect(result.status).toBe(0);
  });

  it('ignores files outside the governed root', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-outside-'));
    const result = runHook(root, {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(outside, 'anything.ts'),
        content: "import { PrismaClient } from 'prisma';\n",
      },
    });
    expect(result.status).toBe(0);
  });
});
