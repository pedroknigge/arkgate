/**
 * MCP contract honesty: published outputSchemas are valid MCP tool schemas and the
 * structuredContent every tool returns validates against them; write-path tools see
 * the same Effective Contract (ArkRules) as ark-check; a contract edit after startup
 * fails project tools closed; ark_status honors the server's --config.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { withDistLock } from '../../helpers/distLock';

const repo = process.cwd();
let runtimeDir: string | undefined;
let mcpBin = path.join(repo, 'bin', 'ark-mcp.mjs');
const checkBin = path.join(repo, 'bin', 'ark-check.mjs');

function prepareRuntime() {
  if (runtimeDir) return;
  withDistLock(() => {
    execSync('npm run build', { stdio: 'ignore' });
    runtimeDir = fs.mkdtempSync(path.join(repo, '.ark-mcp-contract-'));
    fs.cpSync(path.join(repo, 'bin'), path.join(runtimeDir, 'bin'), { recursive: true });
    fs.cpSync(path.join(repo, 'dist'), path.join(runtimeDir, 'dist'), { recursive: true });
    fs.copyFileSync(path.join(repo, 'package.json'), path.join(runtimeDir, 'package.json'));
  });
  mcpBin = path.join(runtimeDir!, 'bin', 'ark-mcp.mjs');
}

afterAll(() => {
  if (runtimeDir) fs.rmSync(runtimeDir, { recursive: true, force: true });
});

function createClient(root: string, extraArgs: string[] = []) {
  const proc = spawn('node', [mcpBin, '--root', root, ...extraArgs], {
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
  function call(name: string, args: Record<string, unknown> = {}) {
    return request('tools/call', { name, arguments: args });
  }
  function close() {
    proc.stdin.end();
    proc.kill();
  }
  return { request, call, close };
}

function project(files: Record<string, string>) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-contract-')));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

const BASE_CONFIG = {
  schemaVersion: '1.3',
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'Infrastructure', patterns: ['src/infra/**'] },
  ],
  rules: [{ from: 'DomainModel', to: 'Infrastructure', allowed: false }],
};

const ARKRULES_CONFIG = { ...BASE_CONFIG, arkRules: { DomainModel: 'arkrules/DomainModel.json' } };
const ARKRULES_FILE = {
  schemaVersion: '1.0',
  layer: 'DomainModel',
  structure: [{ id: 'DM-PRIV-1', sensor: 'aggregate-private-state', mode: 'enforced' }],
  invariants: [{ id: 'INV-ORDER-1', description: 'Order total is never negative', mode: 'advisory' }],
};
const BAD_ORDER = 'export class Order { public total = 0; add(n: number) { this.total += n; } }\n';

function arkCheck(root: string) {
  const result = spawnSync(
    process.execPath,
    [checkBin, '--root', root, '--config', path.join(root, 'ark.config.json'), '--json'],
    { encoding: 'utf8' }
  );
  return { status: result.status, data: JSON.parse(result.stdout) };
}

describe('MCP outputSchema + structuredContent contract', () => {
  let root: string;
  let client: ReturnType<typeof createClient>;
  let schemas: Record<string, unknown>;
  const ajv = new Ajv2020({ strict: false, allErrors: true });

  beforeAll(async () => {
    prepareRuntime();
    root = project({
      'package.json': '{"name":"fx","private":true}',
      'ark.config.json': JSON.stringify(BASE_CONFIG),
      'src/infra/b.ts': 'export const y = 1;\n',
      'src/domain/a.ts': 'export const a = 1;\n',
    });
    client = createClient(root);
    const listed = await client.request('tools/list');
    schemas = Object.fromEntries(
      listed.result.tools
        .filter((tool: any) => tool.outputSchema)
        .map((tool: any) => [tool.name, tool.outputSchema])
    );
  }, 120000);

  afterAll(() => {
    client?.close();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('publishes every outputSchema with top-level type "object" (MCP ToolSchema)', () => {
    expect(Object.keys(schemas).sort()).toEqual(['ark_check', 'ark_status', 'validate_code']);
    for (const [name, schema] of Object.entries(schemas)) {
      expect((schema as { type?: string }).type, name).toBe('object');
      expect(() => ajv.compile(schema as object), name).not.toThrow();
    }
  });

  async function expectConforms(name: string, args: Record<string, unknown>) {
    const response = await client.call(name, args);
    const validate = ajv.compile(schemas[name] as object);
    const structured = response.result.structuredContent;
    expect(structured, `${name} structuredContent`).toBeTruthy();
    expect(validate(structured), `${name}: ${JSON.stringify(validate.errors)}`).toBe(true);
    return response.result;
  }

  it('validate_code structuredContent validates for clean, violation, missing-arg and mismatch', async () => {
    const clean = await expectConforms('validate_code', {
      source: 'export const c = 1;\n',
      filePath: 'src/domain/c.ts',
      project: { expectedRoot: root },
    });
    expect(clean.structuredContent.lexicalValid).toBe(true);
    expect(JSON.parse(clean.content[0].text).lexicalValid).toBe(true);
    const bad = await expectConforms('validate_code', {
      source: "import { y } from '../infra/b';\nexport const c = y;\n",
      filePath: 'src/domain/c.ts',
    });
    expect(bad.structuredContent.lexicalValid).toBe(false);
    await expectConforms('validate_code', { filePath: 'src/domain/c.ts' });
    await expectConforms('validate_code', {
      source: 'export const c = 1;\n',
      project: { expectedRoot: '/definitely/not/this/project' },
    });
  });

  it('ark_check and ark_status structuredContent validate (bound, unbound, mismatch)', async () => {
    await expectConforms('ark_check', {});
    await expectConforms('ark_check', { project: { expectedRoot: root } });
    await expectConforms('ark_check', { project: { expectedRoot: '/definitely/not/this/project' } });
    await expectConforms('ark_status', { project: { expectedRoot: root } });
  });

  it('MCP completeness text is surface-neutral (no hook-only instruction)', async () => {
    const response = await client.call('validate_code', {
      source: 'export const c = 1;\n',
      filePath: 'src/domain/c.ts',
    });
    expect(response.result.content[0].text).not.toMatch(/from a hook deny/);
  });

  it('ark_prepare_write requires filePath in its schema and never promises path proposal', async () => {
    const listed = await client.request('tools/list');
    const prepareWrite = listed.result.tools.find((tool: any) => tool.name === 'ark_prepare_write');
    expect(prepareWrite.inputSchema.required).toEqual(['source', 'filePath']);
    for (const tool of listed.result.tools) {
      expect(JSON.stringify(tool)).not.toMatch(/propose a conventional path/);
    }
    const validateCode = listed.result.tools.find((tool: any) => tool.name === 'validate_code');
    expect(validateCode.description).not.toMatch(/Bind to PreToolUse/);
    expect(validateCode.description).toMatch(/lexicalValid/);
    const response = await client.call('ark_prepare_write', {
      source: 'export const repo = 1;',
      description: 'orders repository',
    });
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toMatch(/requires filePath/);
  });
});

describe('MCP write tools share the Effective Contract with ark-check (ArkRules)', () => {
  it('ark_prepare_change: same policyHash, blocks ARKRULE_STRUCTURE, no false INVARIANT_CATALOG_EMPTY', async () => {
    prepareRuntime();
    const root = project({
      'package.json': '{"name":"fx","private":true}',
      'ark.config.json': JSON.stringify(ARKRULES_CONFIG),
      'arkrules/DomainModel.json': JSON.stringify(ARKRULES_FILE),
      'src/domain/a.ts': 'export const a = 1;\n',
    });
    const client = createClient(root);
    try {
      const base = arkCheck(root);
      const response = await client.call('ark_prepare_change', {
        changes: [{ path: 'src/domain/order.ts', content: BAD_ORDER }],
      });
      const body = JSON.parse(response.result.content[0].text);
      expect(body.policyHash).toBe(base.data.policyHash);
      expect(body.valid).toBe(false);
      expect(body.violations.map((v: { ruleId: string }) => v.ruleId)).toContain(
        'ARKRULE_STRUCTURE'
      );
      expect(body.warnings.map((w: { ruleId: string }) => w.ruleId)).not.toContain(
        'INVARIANT_CATALOG_EMPTY'
      );

      const prepareWrite = await client.call('ark_prepare_write', {
        source: BAD_ORDER,
        filePath: 'src/domain/order.ts',
      });
      const prepared = JSON.parse(prepareWrite.result.content[0].text);
      expect(prepared.lexicalValid).toBe(false);
      expect(prepared.violations.map((v: { ruleId: string }) => v.ruleId)).toContain(
        'ARKRULE_STRUCTURE'
      );

      const validate = await client.call('validate_code', {
        source: BAD_ORDER,
        filePath: 'src/domain/order.ts',
      });
      expect(
        JSON.parse(validate.result.content[0].text).violations.map(
          (v: { ruleId: string }) => v.ruleId
        )
      ).toContain('ARKRULE_STRUCTURE');

      // CI agrees once the same content lands on disk.
      fs.writeFileSync(path.join(root, 'src/domain/order.ts'), BAD_ORDER);
      const after = arkCheck(root);
      expect(after.data.violations.map((v: { ruleId: string }) => v.ruleId)).toContain(
        'ARKRULE_STRUCTURE'
      );
    } finally {
      client.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120000);

  it('ark_prepare_change fails closed when a referenced ArkRules file is missing', async () => {
    prepareRuntime();
    const root = project({
      'package.json': '{"name":"fx","private":true}',
      'ark.config.json': JSON.stringify(ARKRULES_CONFIG),
      'src/domain/a.ts': 'export const a = 1;\n',
    });
    const client = createClient(root);
    try {
      const response = await client.call('ark_prepare_change', {
        changes: [{ path: 'src/domain/order.ts', content: 'export const q = 1;\n' }],
      });
      expect(response.result.isError).toBe(true);
      expect(response.result.content[0].text).toMatch(/Invalid Effective Contract/);
      const validate = await client.call('validate_code', {
        source: 'export const q = 1;\n',
        filePath: 'src/domain/order.ts',
      });
      expect(
        JSON.parse(validate.result.content[0].text).violations.map(
          (v: { ruleId: string }) => v.ruleId
        )
      ).toContain('WRITE_GATE_UNAVAILABLE');
    } finally {
      client.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120000);
});

describe('MCP contract staleness and --config honesty', () => {
  it('fails validate_code closed with CONTRACT_STALE after a rule is tightened on disk', async () => {
    prepareRuntime();
    const loose = { ...BASE_CONFIG, rules: [] };
    const root = project({
      'package.json': '{"name":"fx","private":true}',
      'ark.config.json': JSON.stringify(loose),
      'src/infra/b.ts': 'export const y = 1;\n',
    });
    const client = createClient(root);
    const source = "import { y } from '../infra/b';\nexport const c = y;\n";
    try {
      const before = await client.call('validate_code', {
        source,
        filePath: 'src/domain/c.ts',
        project: { expectedRoot: root },
      });
      expect(JSON.parse(before.result.content[0].text).authoritative).toBe(true);
      fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(BASE_CONFIG));
      const after = await client.call('validate_code', {
        source,
        filePath: 'src/domain/c.ts',
        project: { expectedRoot: root },
      });
      expect(after.result.isError).toBe(true);
      const body = JSON.parse(after.result.content[0].text);
      expect(body.error.code).toBe('CONTRACT_STALE');
      expect(body.authoritative).toBe(false);
      const identity = await client.call('ark_identity', { project: { expectedRoot: root } });
      expect(identity.result.isError).toBe(false);
      expect(JSON.parse(identity.result.content[0].text)).toMatchObject({
        contractStale: true,
        authoritative: false,
      });
    } finally {
      client.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120000);

  it('ark_status resolves the server --config in a subdirectory', async () => {
    prepareRuntime();
    const root = project({
      'package.json': '{"name":"fx","private":true}',
      'configs/ark.config.json': JSON.stringify(BASE_CONFIG),
      'src/domain/a.ts': 'export const a = 1;\n',
    });
    const client = createClient(root, ['--config', 'configs/ark.config.json']);
    try {
      const response = await client.call('ark_status', { project: { expectedRoot: root } });
      const body = JSON.parse(response.result.content[0].text);
      expect(body.status.projectIdentity.resolvedConfigPath).toBe(path.join(root, 'configs', 'ark.config.json'));
      expect(JSON.stringify(body.status.nextAction)).not.toMatch(/No ark\.config\.json found/);
    } finally {
      client.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120000);
});
