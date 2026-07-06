import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withDistLock } from '../../helpers/distLock';

const root = process.cwd();
let mcpRuntimeDir: string | undefined;
let mcpBin = path.join(root, 'bin', 'ark-mcp.mjs');

function prepareMcpRuntime() {
  if (mcpRuntimeDir) return;

  // Build AND copy under the lock so a concurrent `npm pack` prepack rebuild
  // can't clobber dist/ mid-copy.
  withDistLock(() => {
    execSync('npm run build', { stdio: 'ignore' });

    mcpRuntimeDir = fs.mkdtempSync(path.join(root, '.ark-mcp-runtime-'));
    fs.cpSync(path.join(root, 'bin'), path.join(mcpRuntimeDir, 'bin'), { recursive: true });
    fs.cpSync(path.join(root, 'dist'), path.join(mcpRuntimeDir, 'dist'), { recursive: true });
  });
  mcpBin = path.join(mcpRuntimeDir!, 'bin', 'ark-mcp.mjs');
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
    // core/app already claim the Domain./Application. prefixes under their own names —
    // suggesting DomainModel/ApplicationOrchestration would create ambiguous prefixes.
    expect(suggested).not.toContain('DomainModel');
    expect(suggested).not.toContain('ApplicationOrchestration');
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
    // The hook surfaces the gate's fix hints (previously dropped) and points a
    // would-be infra layer at the exemption.
    expect(result.stderr).toContain('fix:');
    expect(result.stderr).toContain('mayImportInfrastructure');
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

describe('ark-mcp read-side tools (ark_check / ark_coverage / ark_place)', () => {
  let projectRoot: string;
  let client: ReturnType<typeof createClient>;

  beforeAll(() => {
    prepareMcpRuntime();
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-read-'));
    fs.writeFileSync(
      path.join(projectRoot, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            forbiddenGlobals: ['Date.now'],
          },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      })
    );
    fs.mkdirSync(path.join(projectRoot, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'src/loose'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src/domain/order.ts'), 'export const o = 1;\n');
    fs.writeFileSync(path.join(projectRoot, 'src/loose/x.ts'), 'export const x = 1;\n'); // unclassified
    client = createClient(projectRoot, ['--config', 'ark.config.json']);
  }, 120000);

  afterAll(() => client?.close());

  it('lists all four tools', async () => {
    const res = await client.request('tools/list');
    expect(res.result.tools.map((t: { name: string }) => t.name)).toEqual([
      'validate_code',
      'ark_check',
      'ark_coverage',
      'ark_place',
    ]);
  });

  it('ark_coverage returns per-layer counts and the full unclassified list', async () => {
    const res = await client.request('tools/call', { name: 'ark_coverage', arguments: {} });
    expect(res.result.isError).toBe(false);
    const cov = JSON.parse(res.result.content[0].text).coverage;
    const byName = Object.fromEntries(cov.layers.map((l: { name: string; files: number }) => [l.name, l.files]));
    expect(byName.DomainModel).toBe(1);
    expect(cov.emptyLayers).toContain('PersistenceAdapters');
    expect(cov.unclassified.files).toEqual(['src/loose/x.ts']);
  });

  it('ark_check returns structured results; strict flag controls config-warning failure', async () => {
    // No import violations exist, but the loose/ file is unclassified — under the default
    // strict mode that config warning fails the check; strict:false ignores warnings.
    const strict = await client.request('tools/call', { name: 'ark_check', arguments: {} });
    const strictPayload = JSON.parse(strict.result.content[0].text);
    expect(strictPayload.ok).toBe(false);
    expect(strict.result.isError).toBe(true);
    expect(strictPayload.violations ?? []).toHaveLength(0); // it's a config warning, not a violation

    const loose = await client.request('tools/call', {
      name: 'ark_check',
      arguments: { strict: false },
    });
    const loosePayload = JSON.parse(loose.result.content[0].text);
    expect(loosePayload.ok).toBe(true);
    expect(loose.result.isError).toBe(false);
  });

  it('ark_place resolves the layer, forbidden globals, and denied import targets', async () => {
    const res = await client.request('tools/call', {
      name: 'ark_place',
      arguments: { filePath: 'src/domain/new-thing.ts' },
    });
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.layer).toBe('DomainModel');
    expect(payload.forbiddenGlobals).toContain('Date.now');
    expect(payload.mustNotImport).toContain('PersistenceAdapters');
    expect(payload.mayImport).not.toContain('PersistenceAdapters');
  });

  it('ark_place flags an ungoverned path with placement suggestions', async () => {
    const res = await client.request('tools/call', {
      name: 'ark_place',
      arguments: { filePath: 'scripts/build.ts' },
    });
    const payload = JSON.parse(res.result.content[0].text);
    expect(payload.layer).toBeNull();
    expect(payload.governed).toBe(false);
    expect(Array.isArray(payload.suggestedLayers)).toBe(true);
  });

  it('rejects an unknown tool name', async () => {
    const res = await client.request('tools/call', { name: 'nope', arguments: {} });
    expect(res.error.code).toBe(-32602);
  });
});

describe('ark-mcp --session-context (SessionStart injection)', () => {
  beforeAll(() => {
    prepareMcpRuntime();
  });

  function runSessionContext(root: string) {
    const result = spawnSync(
      'node',
      [mcpBin, '--session-context', '--root', root, '--config', 'ark.config.json'],
      { encoding: 'utf8' }
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it('prints layers, forbidden globals, baseline state, and the check command', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-session-'));
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            intentPrefixes: ['Domain.'],
            forbiddenGlobals: ['fetch', 'Date.now'],
          },
        ],
        rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
      })
    );
    fs.writeFileSync(
      path.join(root, '.ark-baseline.json'),
      JSON.stringify({ version: 1, violations: ['a|b|c', 'd|e|f'] })
    );

    const result = runSessionContext(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DomainModel: src/domain/**');
    expect(result.stdout).toContain('forbidden globals: fetch, Date.now');
    expect(result.stdout).toContain('1 denied layer edge(s)');
    expect(result.stdout).toContain('2 frozen violation(s)');
    expect(result.stdout).toContain('npx ark-check --root . --config ark.config.json --strict-config');
  });

  it('is a silent no-op in a project without ark.config.json (safe for global hooks)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-session-none-'));
    const result = runSessionContext(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});

describe('ark-mcp --hook ratchet (pre-existing violations do not block edits)', () => {
  let root: string;

  beforeAll(() => {
    prepareMcpRuntime();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-ratchet-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            intentPrefixes: ['Domain.'],
            forbiddenGlobals: ['Date.now', 'fetch'],
          },
        ],
        rules: [],
      })
    );
    // Brownfield file: the violation predates the edit (frozen in a baseline).
    fs.writeFileSync(
      path.join(root, 'src/domain/legacy.ts'),
      'export const at = Date.now();\n'
    );
  });

  function hook(payload: unknown) {
    const result = spawnSync('node', [mcpBin, '--hook', '--root', root], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });
    return { status: result.status, stderr: result.stderr };
  }

  it('allows an edit that does not add violations to a file with frozen ones', () => {
    const result = hook({
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(root, 'src/domain/legacy.ts'),
        old_string: 'export const at',
        new_string: 'export const touched = 1;\nexport const at',
      },
    });
    expect(result.status).toBe(0);
  });

  it('blocks an edit that ADDS a new violation, reporting only the new one', () => {
    const result = hook({
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(root, 'src/domain/legacy.ts'),
        old_string: 'export const at = Date.now();',
        new_string: 'export const at = Date.now();\nexport const r = fetch("/api");',
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('fetch');
    expect(result.stderr).not.toContain('Date.now');
  });

  it('still blocks all violations in a brand-new file', () => {
    const result = hook({
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/domain/fresh.ts'),
        content: 'export const at = Date.now();\n',
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Date.now');
  });
});

describe('ark-mcp write gate — contract-first layer resolution (Option A)', () => {
  let root: string;
  let client: ReturnType<typeof createClient>;

  beforeAll(() => {
    prepareMcpRuntime();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-optA-'));
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    // tsconfig path alias so the gate resolves `@/…` targets to a layer (like a real repo).
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } })
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'App', patterns: ['src/app/**'] },
          { name: 'Data', patterns: ['src/lib/repositories/**'] },
          { name: 'Db', patterns: ['src/lib/db/**'] },
        ],
        // App may call repositories (no rule = allowed) but not the raw DB.
        rules: [{ from: 'App', to: 'Db', allowed: false }],
      })
    );
    client = createClient(root);
  }, 120000);

  afterAll(() => client?.close());

  const validate = (source: string, filePath: string) =>
    client.request('tools/call', {
      name: 'validate_code',
      arguments: { source, filePath },
    });

  it('ALLOWS a governed edge the rules permit, despite an infra token (App → repository)', async () => {
    // The specifier contains the "repositories" infra token, but App → Data has no deny rule,
    // so the contract permits it — no mayImportInfrastructure flag needed. (Pre-Option-A the
    // path-heuristic blocked this.)
    const res = await validate(
      "import { getOrders } from '@/lib/repositories/orders';\nexport const r = getOrders;\n",
      'src/app/orders/route.ts'
    );
    expect(res.result.isError).toBe(false);
    expect(JSON.parse(res.result.content[0].text).valid).toBe(true);
  });

  it('BLOCKS a denied edge as LAYER_IMPORT_VIOLATION (App → raw DB)', async () => {
    const res = await validate(
      "import { sqlClient } from '@/lib/db';\nexport const r = sqlClient;\n",
      'src/app/orders/route.ts'
    );
    expect(res.result.isError).toBe(true);
    const body = JSON.parse(res.result.content[0].text);
    expect(body.valid).toBe(false);
    expect(body.violations.map((v: { ruleId: string }) => v.ruleId)).toContain(
      'LAYER_IMPORT_VIOLATION'
    );
  });

  it('still BLOCKS an ungoverned infra target via the heuristic (bare ORM package)', async () => {
    const res = await validate(
      "import { PrismaClient } from 'prisma';\nexport const c = PrismaClient;\n",
      'src/app/orders/route.ts'
    );
    expect(res.result.isError).toBe(true);
    const body = JSON.parse(res.result.content[0].text);
    expect(body.violations.map((v: { ruleId: string }) => v.ruleId)).toContain('FORBIDDEN_IMPORT');
  });
});
