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
          { name: 'tooling', patterns: ['tools/**'] },
        ],
        rules: [
          { from: 'core', to: 'app', allowed: false },
          { from: 'core', to: 'tooling', allowed: false },
        ],
      })
    );
    emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-empty-'));

    client = createClient(projectRoot);
  }, 120000);

  afterAll(() => client?.close());

  it('handshakes and echoes the protocol version', async () => {
    const res = await client.request('initialize', { protocolVersion: '2024-11-05' });
    expect(res.result.serverInfo.name).toBe('arkgate');
    expect(res.result.protocolVersion).toBe('2024-11-05');
    expect(res.result.capabilities).toHaveProperty('tools');
    expect(res.result.capabilities).toHaveProperty('resources');
  });

  it('lists the validate_code tool', async () => {
    const res = await client.request('tools/list');
    expect(res.result.tools.map((t: { name: string }) => t.name)).toContain('validate_code');
  });

  it('lists the ark_prepare_write tool (W2)', async () => {
    const res = await client.request('tools/list');
    expect(res.result.tools.map((t: { name: string }) => t.name)).toContain('ark_prepare_write');
  });

  it('lists and runs atomic ark_prepare_change without writing a rejected batch', async () => {
    const listed = await client.request('tools/list');
    expect(listed.result.tools.map((t: { name: string }) => t.name)).toContain(
      'ark_prepare_change'
    );

    const res = await client.request('tools/call', {
      name: 'ark_prepare_change',
      arguments: {
        changeMap: {
          $schema: 'https://unpkg.com/arkgate@3/schemas/ark.change-map.schema.json',
          schemaVersion: '1.0',
          files: [
            { path: 'src/core/order.ts', operation: 'create', layer: 'core' },
            { path: 'src/app/service.ts', operation: 'create', layer: 'app' },
          ],
          dependencies: [{ from: 'src/core/order.ts', to: 'src/app/service.ts' }],
        },
        changes: [
          {
            path: 'src/core/order.ts',
            content: "import { service } from '../app/service';\nexport const order = service;\n",
          },
          { path: 'src/app/service.ts', content: 'export const service = 1;\n' },
        ],
      },
    });
    const payload = JSON.parse(res.result.content[0].text);
    expect(res.result.isError).toBe(true);
    expect(payload).toMatchObject({
      schemaVersion: '1.0',
      valid: false,
      readOnly: true,
      changes: [
        { path: 'src/app/service.ts', operation: 'create' },
        { path: 'src/core/order.ts', operation: 'create' },
      ],
    });
    expect(payload.policyHash).toMatch(/^fnv1a-/);
    expect(payload.baseTreeHash).toMatch(/^fnv1a-/);
    expect(payload.candidateTreeHash).toMatch(/^fnv1a-/);
    expect(payload.changeMapHash).toMatch(/^fnv1a-/);
    expect(payload.convergence).toMatchObject({
      readOnly: true,
      structurallyConverged: true,
      behavioralCompletion: 'not-evaluated',
      summary: { satisfied: 3, missing: 0, contradictory: 0, unplanned: 0 },
    });
    expect(payload.violations).toEqual([
      expect.objectContaining({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'src/core/order.ts',
      }),
    ]);
    expect(fs.existsSync(path.join(projectRoot, 'src/core/order.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/app/service.ts'))).toBe(false);
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

  it('reports clean single-file code as partial lexical evidence, not a green verdict', async () => {
    const res = await client.request('tools/call', {
      name: 'validate_code',
      arguments: {
        source: 'export const total = (a: number, b: number) => a + b;\n',
        filePath: 'src/core/math.ts',
      },
    });
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(res.result.content[0].text)).toMatchObject({
      schemaVersion: '1.4',
      mode: 'lexical-compatibility',
      valid: false,
      completeness: 'partial',
      completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }],
      diagnostics: [],
      violations: [],
    });
  });

  it('fails closed when validate_code cannot completely parse the source', async () => {
    const res = await client.request('tools/call', {
      name: 'validate_code',
      arguments: {
        source: 'export const broken = ;\n',
        filePath: 'src/core/broken.ts',
      },
    });
    const payload = JSON.parse(res.result.content[0].text);
    expect(res.result.isError).toBe(true);
    expect(res.result.structuredContent).toMatchObject({
      schemaVersion: '1.4',
      mode: 'lexical-compatibility',
      valid: false,
      completeness: 'partial',
      completenessReasons: [{ code: 'ANALYSIS_PARSE_INCOMPLETE' }],
      diagnostics: [{ ruleId: 'ANALYSIS_PARSE_INCOMPLETE' }],
      binding: { status: 'unverified', authoritative: false },
      authoritative: false,
      projectIdentity: { schemaVersion: '1.0', contractSource: 'project' },
    });
    expect(payload).toMatchObject({
      valid: false,
      completeness: 'partial',
      completenessReasons: [{ code: 'ANALYSIS_PARSE_INCOMPLETE' }],
      violations: [{ ruleId: 'ANALYSIS_PARSE_INCOMPLETE' }],
    });
  });

  it('W2: ark_prepare_write composes place + validate + autoPatch + contentHash', async () => {
    const prepRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-prepare-'));
    fs.writeFileSync(
      path.join(prepRoot, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            intentPrefixes: ['Domain.'],
            forbiddenGlobals: ['fetch'],
          },
          {
            name: 'PersistenceAdapters',
            patterns: ['src/infra/**'],
            intentPrefixes: ['Adapter.Persistence.'],
          },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      })
    );
    fs.mkdirSync(path.join(prepRoot, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(prepRoot, 'src/infra'), { recursive: true });
    fs.writeFileSync(
      path.join(prepRoot, 'src/infra/types-only.ts'),
      'export type Row = { id: string };\nexport interface Item { n: number }\n'
    );
    const c = createClient(prepRoot);
    try {
      await c.request('initialize', { protocolVersion: '2024-11-05' });
      const res = await c.request('tools/call', {
        name: 'ark_prepare_write',
        arguments: {
          source:
            "import { Row } from '../infra/types-only';\nexport function id(r: Row): string { return r.id; }\n",
          filePath: 'src/domain/use.ts',
        },
      });
      const payload = JSON.parse(res.result.content[0].text);
      expect(payload.filePath).toBe('src/domain/use.ts');
      expect(payload.layer).toBe('DomainModel');
      expect(payload.mustNotImport).toContain('PersistenceAdapters');
      expect(payload.forbiddenGlobals).toContain('fetch');
      expect(payload.contentHash).toMatch(/^sha256:/);
      expect(payload).toMatchObject({
        mode: 'lexical-compatibility',
        valid: false,
        completeness: 'partial',
        completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }],
      });
      // Proposed source still invalid → isError (autoPatch is additive, not soft-success)
      expect(res.result.isError).toBe(true);
      expect(payload.autoPatch).toMatchObject({
        mode: 'lexical-compatibility',
        valid: false,
        lexicalValid: true,
        completeness: 'partial',
        completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }],
      });
      expect(payload.autoPatch?.source).toMatch(/import\s+type/);
      // A clean snippet has no lexical violations, but is still not a full-project verdict.
      const clean = await c.request('tools/call', {
        name: 'ark_prepare_write',
        arguments: {
          source: 'export type Id = string;\n',
          filePath: 'src/domain/id.ts',
        },
      });
      const cleanPayload = JSON.parse(clean.result.content[0].text);
      expect(cleanPayload).toMatchObject({
        mode: 'lexical-compatibility',
        valid: false,
        completeness: 'partial',
        completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }],
        violations: [],
      });
      expect(clean.result.isError).toBe(true);
    } finally {
      c.close();
      fs.rmSync(prepRoot, { recursive: true, force: true });
    }
  });

  it('W1: validate_code returns autoPatch for import-type mechanical-safe rewrite', async () => {
    // Domain must not import Persistence; pure-type target → convert to import type.
    const autoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-autopatch-'));
    fs.writeFileSync(
      path.join(autoRoot, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            intentPrefixes: ['Domain.'],
          },
          {
            name: 'PersistenceAdapters',
            patterns: ['src/infra/**'],
            intentPrefixes: ['Adapter.Persistence.'],
          },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      })
    );
    fs.mkdirSync(path.join(autoRoot, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(autoRoot, 'src/infra'), { recursive: true });
    fs.writeFileSync(
      path.join(autoRoot, 'src/infra/types-only.ts'),
      'export type Row = { id: string };\nexport interface Item { n: number }\n'
    );
    const c = createClient(autoRoot);
    try {
      await c.request('initialize', { protocolVersion: '2024-11-05' });
      const res = await c.request('tools/call', {
        name: 'validate_code',
        arguments: {
          source: "import { Row } from '../infra/types-only';\nexport function id(r: Row): string { return r.id; }\n",
          filePath: 'src/domain/use.ts',
        },
      });
      expect(res.result.isError).toBe(true);
      const payload = JSON.parse(res.result.content[0].text);
      expect(payload.valid).toBe(false);
      expect(payload.autoPatch).toBeTruthy();
      expect(payload.autoPatch).toMatchObject({
        mode: 'lexical-compatibility',
        valid: false,
        lexicalValid: true,
        completeness: 'partial',
        completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }],
      });
      expect(payload.autoPatch.remediationKind).toMatch(
        /import-type-from-pure-type-module|import-type-of-type-exports/
      );
      expect(payload.autoPatch.source).toMatch(/import\s+type\s*\{/);
      // Post-patch removes the lexical violation, but single-file evidence remains partial.
      const res2 = await c.request('tools/call', {
        name: 'validate_code',
        arguments: {
          source: payload.autoPatch.source,
          filePath: 'src/domain/use.ts',
        },
      });
      expect(res2.result.isError).toBe(true);
      expect(JSON.parse(res2.result.content[0].text)).toMatchObject({
        schemaVersion: '1.4',
        mode: 'lexical-compatibility',
        valid: false,
        completeness: 'partial',
        completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }],
        diagnostics: [],
        violations: [],
      });
    } finally {
      c.close();
      fs.rmSync(autoRoot, { recursive: true, force: true });
    }
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
    expect(contract.layers.map((l: { name: string }) => l.name).sort()).toEqual([
      'app',
      'core',
      'tooling',
    ]);
    expect(contract.layers.find((l: { name: string }) => l.name === 'tooling').patterns).toEqual([
      'tools/**',
    ]);
    expect(contract.intentLayers.map((l: { name: string }) => l.name).sort()).toEqual([
      'app',
      'core',
    ]);
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
      expect(contract.projectIdentity.contractSource).toBe('default-profile');
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
      expect(contract.projectIdentity.contractSource).toBe('manifest');
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

describe('ark-mcp project identity and fail-closed binding (WI01)', () => {
  function createIdentityProject(label: string) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), `ark-mcp-identity-${label}-`));
    fs.mkdirSync(path.join(project, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(project, '.ark'), { recursive: true });
    fs.writeFileSync(
      path.join(project, 'src/domain/entity.ts'),
      `export const project = ${JSON.stringify(label)};\n`
    );
    fs.writeFileSync(
      path.join(project, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: `Domain${label}`, patterns: ['src/domain/**'] }],
        rules: [],
      })
    );
    fs.writeFileSync(
      path.join(project, '.ark/golden-pattern.json'),
      JSON.stringify({
        schemaVersion: '1',
        name: `golden-${label}`,
        norm: `Only use the ${label} architecture.`,
      })
    );
    return project;
  }

  it('publishes one project input contract on every tool and marks legacy calls unverified', async () => {
    prepareMcpRuntime();
    const project = createIdentityProject('schema');
    const c = createClient(project);
    try {
      const listed = await c.request('tools/list');
      expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
        expect.arrayContaining(['ark_identity', 'ark_manifest'])
      );
      for (const tool of listed.result.tools) {
        expect(tool.inputSchema.properties.project).toMatchObject({
          type: 'object',
          additionalProperties: false,
        });
        expect(tool.inputSchema.properties.project.properties).toHaveProperty('expectedRoot');
        expect(tool.inputSchema.properties.project.properties).toHaveProperty(
          'expectedProjectId'
        );
      }
      for (const name of ['validate_code', 'ark_check']) {
        const tool = listed.result.tools.find((entry: { name: string }) => entry.name === name);
        expect(tool.outputSchema.oneOf[0].properties).toMatchObject({
          projectIdentity: { type: 'object' },
          binding: { type: 'object' },
          authoritative: { type: 'boolean' },
        });
        expect(tool.outputSchema.oneOf[1].properties.error).toMatchObject({
          type: 'object',
        });
      }

      const identity = await c.request('tools/call', {
        name: 'ark_identity',
        arguments: {},
      });
      const body = JSON.parse(identity.result.content[0].text);
      expect(identity.result.authoritative).toBe(false);
      expect(body.binding).toMatchObject({ status: 'unverified', authoritative: false });
      expect(body.projectIdentity).toMatchObject({
        schemaVersion: '1.0',
        contractSource: 'project',
        resolvedRoot: fs.realpathSync(project),
        resolvedConfigPath: fs.realpathSync(path.join(project, 'ark.config.json')),
      });
      expect(body.projectIdentity.projectId).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(body.projectIdentity.contractHash).toMatch(/^sha256:[a-f0-9]{64}$/);

      const idOnly = await c.request('tools/call', {
        name: 'ark_identity',
        arguments: {
          project: { expectedProjectId: body.projectIdentity.projectId },
        },
      });
      expect(JSON.parse(idOnly.result.content[0].text).binding).toMatchObject({
        status: 'unverified',
        authoritative: false,
        expectedProjectId: body.projectIdentity.projectId,
      });
    } finally {
      c.close();
    }
  });

  it('keeps projectId stable across contract edits and restarts while runtime evidence changes', async () => {
    prepareMcpRuntime();
    const project = createIdentityProject('stable');
    const firstClient = createClient(project);
    const first = JSON.parse(
      (
        await firstClient.request('tools/call', {
          name: 'ark_identity',
          arguments: { project: { expectedRoot: project } },
        })
      ).result.content[0].text
    );
    firstClient.close();

    const configPath = path.join(project, 'ark.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.layers[0].description = 'Contract changed without changing project identity.';
    fs.writeFileSync(configPath, JSON.stringify(config));

    const secondClient = createClient(project);
    try {
      const second = JSON.parse(
        (
          await secondClient.request('tools/call', {
            name: 'ark_identity',
            arguments: {
              project: {
                expectedRoot: project,
                expectedProjectId: first.projectIdentity.projectId,
              },
            },
          })
        ).result.content[0].text
      );
      expect(second.binding).toMatchObject({ status: 'matched', authoritative: true });
      expect(second.projectIdentity.projectId).toBe(first.projectIdentity.projectId);
      expect(second.projectIdentity.contractHash).not.toBe(first.projectIdentity.contractHash);
      expect(second.projectIdentity.runtimeId).not.toBe(first.projectIdentity.runtimeId);
      expect(second.projectIdentity).toHaveProperty('processStartedAt');
    } finally {
      secondClient.close();
    }
  });

  it('uses one startup ArkRules snapshot for identity, manifest, and inventory until restart', async () => {
    prepareMcpRuntime();
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-rules-snapshot-'));
    const rulesPath = path.join(project, 'arkrules', 'core.json');
    fs.mkdirSync(path.join(project, 'src/core'), { recursive: true });
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
    fs.writeFileSync(
      path.join(project, 'src/core/order.ts'),
      `export class Order {
        public id: string;
        public status: string;
      }\n`
    );
    fs.writeFileSync(
      path.join(project, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          {
            name: 'core',
            patterns: ['src/core/**'],
            intentPrefixes: ['Domain.'],
          },
        ],
        rules: [],
        arkRules: { core: 'arkrules/core.json' },
      })
    );
    const writeRules = (id: string) =>
      fs.writeFileSync(
        rulesPath,
        JSON.stringify({
          schemaVersion: '1.0',
          layer: 'core',
          structure: [
            {
              id,
              sensor: 'no-anemic-model',
              mode: 'advisory',
            },
          ],
          invariants: [],
        })
      );
    writeRules('no-anemic-model');

    const firstClient = createClient(project);
    let firstHash = '';
    try {
      const identity = JSON.parse(
        (
          await firstClient.request('tools/call', {
            name: 'ark_identity',
            arguments: { project: { expectedRoot: project } },
          })
        ).result.content[0].text
      );
      firstHash = identity.projectIdentity.contractHash;

      // A running process remains internally coherent even if the contract changes on disk.
      writeRules('custom-rule-b');

      const manifest = await firstClient.request('tools/call', {
        name: 'ark_manifest',
        arguments: {
          project: {
            expectedRoot: project,
            expectedProjectId: identity.projectIdentity.projectId,
          },
        },
      });
      const manifestBody = JSON.parse(manifest.result.content[0].text);
      expect(manifestBody.binding).toMatchObject({ status: 'matched', authoritative: true });
      expect(manifestBody.projectIdentity.contractHash).toBe(firstHash);
      expect(manifestBody.arkRulesCatalog.structure.map((rule: { id: string }) => rule.id)).toEqual(
        ['no-anemic-model']
      );

      const inventory = await firstClient.request('tools/call', {
        name: 'ark_rules_inventory',
        arguments: {
          project: {
            expectedRoot: project,
            expectedProjectId: identity.projectIdentity.projectId,
          },
        },
      });
      const inventoryBody = JSON.parse(inventory.result.content[0].text);
      expect(inventoryBody.projectIdentity.contractHash).toBe(firstHash);
      expect(inventoryBody.rulesInventory).toMatchObject({
        underContract: 1,
        candidates: [
          expect.objectContaining({
            kind: 'anemic-entity',
            governedLayer: 'core',
            suggestedArkRule: expect.objectContaining({
              layer: 'core',
              structureId: 'no-anemic-model',
            }),
          }),
        ],
      });
    } finally {
      firstClient.close();
    }

    const restartedClient = createClient(project);
    try {
      const restartedIdentity = JSON.parse(
        (
          await restartedClient.request('tools/call', {
            name: 'ark_identity',
            arguments: { project: { expectedRoot: project } },
          })
        ).result.content[0].text
      );
      expect(restartedIdentity.projectIdentity.contractHash).not.toBe(firstHash);

      const restartedManifest = await restartedClient.request('tools/call', {
        name: 'ark_manifest',
        arguments: { project: { expectedRoot: project } },
      });
      const restartedBody = JSON.parse(restartedManifest.result.content[0].text);
      expect(
        restartedBody.arkRulesCatalog.structure.map((rule: { id: string }) => rule.id)
      ).toEqual(['custom-rule-b']);
    } finally {
      restartedClient.close();
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  it('rejects project B expectations and paths before returning project A placement evidence', async () => {
    prepareMcpRuntime();
    const projectA = createIdentityProject('A');
    const projectB = createIdentityProject('B');
    const c = createClient(projectA);
    try {
      const expectedMismatch = await c.request('tools/call', {
        name: 'ark_place',
        arguments: {
          project: { expectedRoot: projectB },
          filePath: path.join(projectB, 'src/domain/new.ts'),
        },
      });
      const expectedBody = JSON.parse(expectedMismatch.result.content[0].text);
      expect(expectedMismatch.result.isError).toBe(true);
      expect(expectedMismatch.result.structuredContent).toMatchObject({
        error: { code: 'PROJECT_ROOT_MISMATCH' },
        binding: { status: 'mismatch', authoritative: false },
        projectIdentity: { contractSource: 'project' },
        authoritative: false,
      });
      expect(expectedBody.error.code).toBe('PROJECT_ROOT_MISMATCH');
      expect(expectedBody.binding).toMatchObject({
        status: 'mismatch',
        authoritative: false,
      });
      expect(expectedBody).not.toHaveProperty('layer');
      expect(JSON.stringify(expectedBody)).not.toContain('golden-A');

      const pathMismatch = await c.request('tools/call', {
        name: 'ark_place',
        arguments: { filePath: path.join(projectB, 'src/domain/new.ts') },
      });
      const pathBody = JSON.parse(pathMismatch.result.content[0].text);
      expect(pathBody.error.code).toBe('PROJECT_ROOT_MISMATCH');
      expect(pathBody).not.toHaveProperty('governed');
      expect(JSON.stringify(pathBody)).not.toContain('golden-A');

      const crossRootCalls = [
        {
          name: 'validate_code',
          arguments: {
            source: 'export const value = 1;\n',
            filePath: path.join(projectB, 'src/domain/validate.ts'),
          },
        },
        {
          name: 'ark_prepare_write',
          arguments: {
            source: 'export const value = 1;\n',
            filePath: path.join(projectB, 'src/domain/write.ts'),
          },
        },
        {
          name: 'ark_prepare_change',
          arguments: {
            changes: [
              {
                path: path.join(projectB, 'src/domain/change.ts'),
                content: 'export const value = 1;\n',
              },
            ],
          },
        },
      ];
      for (const call of crossRootCalls) {
        const response = await c.request('tools/call', call);
        const body = JSON.parse(response.result.content[0].text);
        expect(body.error.code).toBe('PROJECT_ROOT_MISMATCH');
        expect(body).not.toHaveProperty('violations');
        expect(JSON.stringify(body)).not.toContain('golden-A');
      }

      const rulesMismatch = await c.request('tools/call', {
        name: 'ark_rules_inventory',
        arguments: { project: { expectedRoot: projectB } },
      });
      const rulesBody = JSON.parse(rulesMismatch.result.content[0].text);
      expect(rulesBody.error.code).toBe('PROJECT_ROOT_MISMATCH');
      expect(rulesBody).not.toHaveProperty('rulesInventory');
    } finally {
      c.close();
    }
  });

  it('requires exact-root initial binding and a prior id for descendants', async () => {
    prepareMcpRuntime();
    const project = createIdentityProject('paths');
    const aliasParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-alias-'));
    const alias = path.join(aliasParent, 'project-link');
    fs.symlinkSync(project, alias, 'dir');
    const descendant = path.join(project, 'src/domain');
    const nested = path.join(project, 'packages/nested');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [], rules: [] })
    );

    const c = createClient(project);
    const aliasClient = createClient(alias);
    try {
      const canonicalIdentity = JSON.parse(
        (
          await c.request('tools/call', {
            name: 'ark_identity',
            arguments: { project: { expectedRoot: project } },
          })
        ).result.content[0].text
      );
      const aliasIdentity = JSON.parse(
        (
          await aliasClient.request('tools/call', {
            name: 'ark_identity',
            arguments: { project: { expectedRoot: alias } },
          })
        ).result.content[0].text
      );
      expect(aliasIdentity.projectIdentity.projectId).toBe(
        canonicalIdentity.projectIdentity.projectId
      );

      const aliasResponse = await c.request('tools/call', {
        name: 'ark_identity',
        arguments: { project: { expectedRoot: alias } },
      });
      expect(JSON.parse(aliasResponse.result.content[0].text).binding).toMatchObject({
        status: 'matched',
        authoritative: true,
      });

      const descendantUnverified = await c.request('tools/call', {
        name: 'ark_identity',
        arguments: { project: { expectedRoot: descendant } },
      });
      expect(JSON.parse(descendantUnverified.result.content[0].text).binding).toMatchObject({
        status: 'unverified',
        authoritative: false,
      });

      const descendantBound = await c.request('tools/call', {
        name: 'ark_identity',
        arguments: {
          project: {
            expectedRoot: descendant,
            expectedProjectId: canonicalIdentity.projectIdentity.projectId,
          },
        },
      });
      expect(JSON.parse(descendantBound.result.content[0].text).binding).toMatchObject({
        status: 'matched',
        authoritative: true,
      });

      const mismatch = await c.request('tools/call', {
        name: 'ark_identity',
        arguments: { project: { expectedRoot: nested } },
      });
      expect(JSON.parse(mismatch.result.content[0].text).error.code).toBe(
        'PROJECT_ROOT_MISMATCH'
      );
    } finally {
      c.close();
      aliasClient.close();
    }
  });

  it('does not authoritatively bind an unknown descendant with a custom config name', async () => {
    prepareMcpRuntime();
    const project = createIdentityProject('custom-parent');
    const nested = path.join(project, 'packages/custom-child');
    fs.mkdirSync(path.join(nested, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(nested, 'custom.ark.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'CustomChild', patterns: ['src/domain/**'] }],
        rules: [],
      })
    );

    const parentClient = createClient(project);
    const childClient = createClient(nested, ['--config', 'custom.ark.json']);
    try {
      const parentAttempt = await parentClient.request('tools/call', {
        name: 'ark_manifest',
        arguments: { project: { expectedRoot: nested } },
      });
      const parentBody = JSON.parse(parentAttempt.result.content[0].text);
      expect(parentBody.binding).toMatchObject({
        status: 'unverified',
        authoritative: false,
      });

      const childAttempt = await childClient.request('tools/call', {
        name: 'ark_manifest',
        arguments: { project: { expectedRoot: nested } },
      });
      const childBody = JSON.parse(childAttempt.result.content[0].text);
      expect(childBody.binding).toMatchObject({ status: 'matched', authoritative: true });
      expect(childBody.layers.map((layer: { name: string }) => layer.name)).toContain(
        'CustomChild'
      );
    } finally {
      parentClient.close();
      childClient.close();
    }
  });

  it('rejects an explicit config outside root before starting the MCP server', () => {
    prepareMcpRuntime();
    const projectA = createIdentityProject('config-A');
    const projectB = createIdentityProject('config-B');
    const result = spawnSync(
      'node',
      [
        mcpBin,
        '--root',
        projectA,
        '--config',
        path.join(projectB, 'ark.config.json'),
      ],
      {
        input: `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05' },
        })}\n`,
        encoding: 'utf8',
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PROJECT_ROOT_MISMATCH');
    expect(result.stdout).toBe('');

    const linkedConfig = path.join(projectA, 'linked-config.json');
    fs.symlinkSync(path.join(projectB, 'ark.config.json'), linkedConfig);
    const linkedResult = spawnSync(
      'node',
      [mcpBin, '--root', projectA, '--config', linkedConfig],
      { encoding: 'utf8' }
    );
    expect(linkedResult.status).toBe(1);
    expect(linkedResult.stderr).toContain('PROJECT_ROOT_MISMATCH');
  });

  it('binds ark_manifest, keeps the compatibility resource unverified, and exposes the split verdict', async () => {
    prepareMcpRuntime();
    const project = createIdentityProject('verdict');
    const c = createClient(project);
    try {
      const compatibility = await c.request('resources/read', {
        uri: 'ark://manifest',
        project: { expectedRoot: project },
      });
      const compatibilityBody = JSON.parse(compatibility.result.contents[0].text);
      expect(compatibilityBody.binding).toMatchObject({
        status: 'unverified',
        authoritative: false,
      });
      expect(compatibility.result.authoritative).toBe(false);

      const manifest = await c.request('tools/call', {
        name: 'ark_manifest',
        arguments: { project: { expectedRoot: project } },
      });
      const manifestBody = JSON.parse(manifest.result.content[0].text);
      expect(manifestBody.binding).toMatchObject({ status: 'matched', authoritative: true });
      expect(manifestBody.projectIdentity.contractSource).toBe('project');

      const checked = await c.request('tools/call', {
        name: 'ark_check',
        arguments: {
          strict: false,
          project: {
            expectedRoot: project,
            expectedProjectId: manifestBody.projectIdentity.projectId,
          },
        },
      });
      const body = JSON.parse(checked.result.content[0].text);
      expect(body.ok).toBe(true);
      expect(body.verdict).toMatchObject({
        identity: { status: 'matched', ok: true },
        completeness: { ok: true },
        graph: { ok: true },
        coverage: { ok: true, governedPercent: 100, unclassified: 0 },
        gates: {
          advisoryMcpActive: true,
          advisoryMcpRuntimeObserved: true,
        },
        overallOk: false,
      });
      expect(checked.result.structuredContent).toMatchObject({
        verdict: {
          identity: { status: 'matched', ok: true },
          coverage: { ok: true },
          overallOk: false,
        },
        binding: { status: 'matched', authoritative: true },
        projectIdentity: { projectId: manifestBody.projectIdentity.projectId },
        authoritative: true,
      });
    } finally {
      c.close();
    }
  });
});

/**
 * One-shot hook mode (Claude Code PreToolUse contract): payload on stdin, exit 2 +
 * violations on stderr blocks the write, exit 0 allows it. Plumbing failures must
 * fail open (never block the agent on gate errors).
 */
function runHook(root: string, payload: unknown, env?: NodeJS.ProcessEnv) {
  const result = spawnSync(
    'node',
    [mcpBin, '--hook', '--root', root],
    {
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      encoding: 'utf8',
      env: env ? { ...process.env, ...env } : process.env,
    }
  );
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

describe('ark-mcp --hook (PreToolUse gate)', () => {
  let root: string;

  beforeAll(() => {
    prepareMcpRuntime();

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
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
    expect(result.stderr).toContain('Fix:');
    expect(result.stderr).toContain('mayImportInfrastructure');
  });

  it('blocks every invalid file in a Codex apply_patch payload', () => {
    const result = runHook(root, {
      tool_name: 'apply_patch',
      tool_input: {
        patch: `*** Begin Patch
*** Add File: src/domain/customer.ts
+import { db } from '../infra/db';
+export const repo = db;
*** Add File: src/domain/order-repo.ts
+import { db } from '../infra/db';
+export const orders = db;
*** End Patch`,
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr.match(/\[LAYER_IMPORT_VIOLATION\]/g)).toHaveLength(2);
  });

  it('canonicalizes equivalent ApplyPatch paths before contract scope matching', () => {
    const result = runHook(root, {
      tool_name: 'apply_patch',
      tool_input: {
        patch: `*** Begin Patch
*** Add File: ./src/domain/canonical-path.ts
+import { db } from '../infra/db';
+export const value = db;
*** End Patch`,
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('[LAYER_IMPORT_VIOLATION]');
  });

  it('fails closed when one complete patch changes resolver inputs and source', () => {
    const result = runHook(
      root,
      {
        tool_name: 'apply_patch',
        tool_input: {
          patch: `*** Begin Patch
*** Add File: tsconfig.json
+{"compilerOptions":{"baseUrl":".","paths":{"@infra/*":["src/infra/*"]}}}
*** Add File: src/domain/alias-input.ts
+import { db } from '@infra/db';
+export const value = db;
*** End Patch`,
        },
      },
      { ARK_HOOK_REPAIR: '1' }
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('ATOMIC_PREFLIGHT_UNAVAILABLE');
    const repairLine = result.stderr
      .split('\n')
      .find((line) => line.startsWith('ARK_REPAIR_JSON:'));
    expect(repairLine).toBeTruthy();
    const repair = JSON.parse(repairLine!.slice('ARK_REPAIR_JSON:'.length));
    expect(repair).toMatchObject({
      mode: 'resolved-candidate-facts',
      completeness: 'unavailable',
      valid: false,
      repair: true,
      decision: 'deny',
    });
  });

  it.each([
    ['JSON', 'base.json', false],
    ['JSONC', 'base.jsonc', false],
    ['symlink-aliased JSON', 'base.json', true],
  ])(
    'fails closed for transitive %s tsconfig input with a non-conventional name',
    (_caseName, configName, throughSymlink) => {
    const extendedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-tsconfig-closure-'));
    try {
      fs.mkdirSync(path.join(extendedRoot, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(extendedRoot, 'tooling/typescript'), { recursive: true });
      if (throughSymlink) {
        fs.symlinkSync(
          path.join(extendedRoot, 'tooling/typescript'),
          path.join(extendedRoot, 'config-link'),
          'dir'
        );
      }
      fs.writeFileSync(
        path.join(extendedRoot, 'ark.config.json'),
        JSON.stringify({
          include: ['src'],
          layers: [
            { name: 'DomainModel', patterns: ['src/domain/**'] },
            { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
          ],
          rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
        })
      );
      fs.writeFileSync(
        path.join(extendedRoot, 'tsconfig.json'),
        JSON.stringify({
          extends: throughSymlink
            ? `./config-link/${configName}`
            : `./tooling/typescript/${configName}`,
        })
      );
      fs.writeFileSync(
        path.join(extendedRoot, 'tooling/typescript', configName),
        '{"compilerOptions":{"baseUrl":"."}}\n'
      );

      const result = runHook(
        extendedRoot,
        {
          tool_name: 'apply_patch',
          tool_input: {
            patch: `*** Begin Patch
*** Update File: tooling/typescript/${configName}
@@
-{"compilerOptions":{"baseUrl":"."}}
+{"compilerOptions":{"baseUrl":"../..","paths":{"@infra/*":["src/infra/*"]}}}
*** Add File: src/domain/closure.ts
+import { db } from '@infra/db';
+export const value = db;
*** End Patch`,
          },
        },
        { ARK_HOOK_REPAIR: '1' }
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(`tooling/typescript/${configName}`);
      expect(result.stderr).toContain('ATOMIC_PREFLIGHT_UNAVAILABLE');
    } finally {
      fs.rmSync(extendedRoot, { recursive: true, force: true });
    }
    }
  );

  it('canonicalizes an empty internal symlink before selecting governed ApplyPatch writes', () => {
    const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-empty-symlink-'));
    try {
      fs.mkdirSync(path.join(symlinkRoot, 'src'), { recursive: true });
      fs.mkdirSync(path.join(symlinkRoot, 'shared'), { recursive: true });
      fs.symlinkSync(path.join(symlinkRoot, 'shared'), path.join(symlinkRoot, 'src/link'), 'dir');
      fs.writeFileSync(
        path.join(symlinkRoot, 'ark.config.json'),
        JSON.stringify({
          include: ['shared'],
          layers: [
            { name: 'Kernel', patterns: ['shared/**'], forbiddenGlobals: ['fetch'] },
          ],
          rules: [],
        })
      );

      const result = runHook(
        symlinkRoot,
        {
          tool_name: 'apply_patch',
          tool_input: {
            patch: `*** Begin Patch
*** Add File: src/link/new.ts
+export const load = () => fetch('/data');
*** End Patch`,
          },
        },
        { ARK_HOOK_REPAIR: '1' }
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('[FORBIDDEN_GLOBAL]');
      const repairLine = result.stderr
        .split('\n')
        .find((line) => line.startsWith('ARK_REPAIR_JSON:'));
      expect(repairLine).toBeTruthy();
      expect(JSON.parse(repairLine!.slice('ARK_REPAIR_JSON:'.length))).toMatchObject({
        valid: false,
        diagnostics: [
          expect.objectContaining({
            ruleId: 'FORBIDDEN_GLOBAL',
            location: expect.objectContaining({ file: 'shared/new.ts' }),
          }),
        ],
      });
    } finally {
      fs.rmSync(symlinkRoot, { recursive: true, force: true });
    }
  });

  it('W4: default --hook is reject-only (no ARK_AUTOPATCH_JSON); still exit 2', () => {
    const apRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-reject-'));
    try {
      fs.mkdirSync(path.join(apRoot, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(apRoot, 'src/infra'), { recursive: true });
      fs.writeFileSync(
        path.join(apRoot, 'src/infra/types-only.ts'),
        'export type Row = { id: string };\nexport interface Item { n: number }\n'
      );
      fs.writeFileSync(
        path.join(apRoot, 'ark.config.json'),
        JSON.stringify({
          include: ['src'],
          layers: [
            {
              name: 'DomainModel',
              patterns: ['src/domain/**'],
              intentPrefixes: ['Domain.'],
            },
            {
              name: 'PersistenceAdapters',
              patterns: ['src/infra/**'],
              intentPrefixes: ['Adapter.Persistence.'],
            },
          ],
          rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
        })
      );
      const payload = {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(apRoot, 'src/domain/use-row.ts'),
          content:
            "import { Row } from '../infra/types-only';\nexport function id(r: Row): string { return r.id; }\n",
        },
      };
      const result = runHook(apRoot, payload);
      expect(result.status).toBe(2);
      expect(result.stderr).not.toContain('ARK_AUTOPATCH_JSON:');
      expect(result.stderr).not.toContain('ARK_REPAIR_JSON:');
      expect(result.stderr).toMatch(/ARK_HOOK_REPAIR=1|--hook-repair/);
    } finally {
      fs.rmSync(apRoot, { recursive: true, force: true });
    }
  });

  it('W4: --hook-repair emits ARK_REPAIR_JSON + ARK_AUTOPATCH_JSON (still exit 2, never allow)', () => {
    const apRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-repair-'));
    try {
      fs.mkdirSync(path.join(apRoot, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(apRoot, 'src/infra'), { recursive: true });
      fs.writeFileSync(
        path.join(apRoot, 'src/infra/types-only.ts'),
        'export type Row = { id: string };\nexport interface Item { n: number }\n'
      );
      fs.writeFileSync(
        path.join(apRoot, 'ark.config.json'),
        JSON.stringify({
          include: ['src'],
          layers: [
            {
              name: 'DomainModel',
              patterns: ['src/domain/**'],
              intentPrefixes: ['Domain.'],
            },
            {
              name: 'PersistenceAdapters',
              patterns: ['src/infra/**'],
              intentPrefixes: ['Adapter.Persistence.'],
            },
          ],
          rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
        })
      );
      const payload = {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(apRoot, 'src/domain/use-row.ts'),
          content:
            "import { Row } from '../infra/types-only';\nexport function id(r: Row): string { return r.id; }\n",
        },
      };
      const result = spawnSync(
        'node',
        [mcpBin, '--hook', '--hook-repair', '--root', apRoot],
        {
          input: JSON.stringify(payload),
          encoding: 'utf8',
          env: process.env,
        }
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('ARK_REPAIR_JSON:');
      expect(result.stderr).toContain('ARK_AUTOPATCH_JSON:');
      const repairLine = result.stderr
        .split('\n')
        .find((l) => l.startsWith('ARK_REPAIR_JSON:'));
      expect(repairLine).toBeTruthy();
      const repair = JSON.parse(repairLine!.slice('ARK_REPAIR_JSON:'.length));
      expect(repair).toMatchObject({
        mode: 'lexical-compatibility',
        repair: true,
        valid: false,
        completeness: 'partial',
        completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }],
      });
      expect(repair.decision).toBe('deny');
      expect(repair.autoPatch).toMatchObject({
        mode: 'lexical-compatibility',
        valid: false,
        lexicalValid: true,
        completeness: 'partial',
        completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }],
      });
      expect(repair.autoPatch?.source).toMatch(/import\s+type/);
      expect(repair.autoPatch?.remediationKind).toMatch(/import-type/);
      const patchLine = result.stderr
        .split('\n')
        .find((l) => l.startsWith('ARK_AUTOPATCH_JSON:'));
      const patch = JSON.parse(patchLine!.slice('ARK_AUTOPATCH_JSON:'.length));
      expect(patch.source).toBe(repair.autoPatch.source);
    } finally {
      fs.rmSync(apRoot, { recursive: true, force: true });
    }
  });

  it('W4: ARK_HOOK_REPAIR=1 enables repair payload without --hook-repair flag', () => {
    const apRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-env-repair-'));
    try {
      fs.mkdirSync(path.join(apRoot, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(apRoot, 'src/infra'), { recursive: true });
      fs.writeFileSync(
        path.join(apRoot, 'src/infra/types-only.ts'),
        'export type Row = { id: string };\n'
      );
      fs.writeFileSync(
        path.join(apRoot, 'ark.config.json'),
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
          rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
        })
      );
      const result = runHook(
        apRoot,
        {
          tool_name: 'Write',
          tool_input: {
            file_path: path.join(apRoot, 'src/domain/use-row.ts'),
            content:
              "import { Row } from '../infra/types-only';\nexport function id(r: Row): string { return r.id; }\n",
          },
        },
        { ARK_HOOK_REPAIR: '1' }
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('ARK_REPAIR_JSON:');
    } finally {
      fs.rmSync(apRoot, { recursive: true, force: true });
    }
  });

  it('W4: Grok deny JSON includes autoPatch only when repair mode is on', () => {
    const apRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-grok-repair-'));
    try {
      fs.mkdirSync(path.join(apRoot, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(apRoot, 'src/infra'), { recursive: true });
      fs.writeFileSync(
        path.join(apRoot, 'src/infra/types-only.ts'),
        'export type Row = { id: string };\n'
      );
      fs.writeFileSync(
        path.join(apRoot, 'ark.config.json'),
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
          rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
        })
      );
      const payload = {
        toolName: 'write',
        toolInput: {
          file_path: path.join(apRoot, 'src/domain/use-row.ts'),
          content:
            "import { Row } from '../infra/types-only';\nexport function id(r: Row): string { return r.id; }\n",
        },
      };
      const off = spawnSync('node', [mcpBin, '--hook', '--root', apRoot], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
      });
      expect(off.status).toBe(2);
      const offJson = JSON.parse(off.stdout.trim().split('\n').pop()!);
      expect(offJson.decision).toBe('deny');
      expect(offJson.autoPatch).toBeUndefined();

      const on = spawnSync('node', [mcpBin, '--hook', '--hook-repair', '--root', apRoot], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
      });
      expect(on.status).toBe(2);
      const onJson = JSON.parse(on.stdout.trim().split('\n').pop()!);
      expect(onJson.decision).toBe('deny');
      expect(onJson.repair).toBe(true);
      expect(onJson.autoPatch?.source).toMatch(/import\s+type/);
    } finally {
      fs.rmSync(apRoot, { recursive: true, force: true });
    }
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

  it('blocks parse-invalid source and emits a fail-closed repair envelope', () => {
    const result = spawnSync('node', [mcpBin, '--hook', '--hook-repair', '--root', root], {
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(root, 'src/domain/broken.ts'),
          content: 'export const broken = ;\n',
        },
      }),
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('ANALYSIS_PARSE_INCOMPLETE');
    const repairLine = result.stderr
      .split('\n')
      .find((line) => line.startsWith('ARK_REPAIR_JSON:'));
    expect(repairLine).toBeTruthy();
    expect(JSON.parse(repairLine!.slice('ARK_REPAIR_JSON:'.length))).toMatchObject({
      schemaVersion: '1.4',
      mode: 'lexical-compatibility',
      valid: false,
      completeness: 'partial',
      completenessReasons: [{ code: 'ANALYSIS_PARSE_INCOMPLETE' }],
      diagnostics: [{ ruleId: 'ANALYSIS_PARSE_INCOMPLETE' }],
      decision: 'deny',
    });
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

  it('accepts Grok Build camelCase write payloads and emits deny JSON', () => {
    const result = runHook(root, {
      toolName: 'write',
      toolInput: {
        file_path: path.join(root, 'src/domain/customer.ts'),
        content: "import { PrismaClient } from 'prisma';\nexport const repo = new PrismaClient();\n",
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('FORBIDDEN_IMPORT');
    const decision = JSON.parse(result.stdout.trim());
    expect(decision.decision).toBe('deny');
    expect(decision.reason).toContain('FORBIDDEN_IMPORT');
  });

  it('accepts Grok search_replace as Edit', () => {
    const result = runHook(root, {
      toolName: 'search_replace',
      toolInput: {
        file_path: path.join(root, 'src/domain/order.ts'),
        old_string: 'export const a = 1;',
        new_string: "import { db } from 'typeorm';\nexport const a = db;",
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('typeorm');
  });

  it('accepts Antigravity write_to_file payloads and emits deny decision JSON', () => {
    const result = runHook(root, {
      toolCall: {
        name: 'write_to_file',
        args: {
          TargetFile: path.join(root, 'src/domain/customer.ts'),
          CodeContent:
            "import { PrismaClient } from 'prisma';\nexport const repo = new PrismaClient();\n",
          Overwrite: true,
          Description: 'bad write',
        },
      },
      conversationId: 'test-agy',
      workspacePaths: [root],
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('FORBIDDEN_IMPORT');
    const decision = JSON.parse(result.stdout.trim());
    expect(decision.decision).toBe('deny');
    expect(decision.reason).toContain('FORBIDDEN_IMPORT');
  });

  it('accepts Antigravity replace_file_content as Edit', () => {
    const result = runHook(root, {
      toolCall: {
        name: 'replace_file_content',
        args: {
          TargetFile: path.join(root, 'src/domain/order.ts'),
          TargetContent: 'export const a = 1;',
          ReplacementContent: "import { db } from 'typeorm';\nexport const a = db;",
          Instruction: 'inject infra',
          Description: 'bad edit',
        },
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('typeorm');
  });

  it('accepts Antigravity multi_replace_file_content as MultiEdit', () => {
    const result = runHook(root, {
      toolCall: {
        name: 'multi_replace_file_content',
        args: {
          TargetFile: path.join(root, 'src/domain/order.ts'),
          ReplacementChunks: [
            {
              TargetContent: 'export const a = 1;',
              ReplacementContent: "import { db } from '../infra/db';\nexport const a = db;",
            },
          ],
          Instruction: 'multi',
          Description: 'bad multi',
        },
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/LAYER_IMPORT_VIOLATION|FORBIDDEN_IMPORT|typeorm|infra/i);
  });

  it('allows a clean Antigravity write_to_file with required decision:allow on stdout', () => {
    const result = runHook(root, {
      toolCall: {
        name: 'write_to_file',
        args: {
          TargetFile: path.join(root, 'src/domain/clean.ts'),
          CodeContent: 'export const clean = true;\n',
        },
      },
    });
    expect(result.status).toBe(0);
    expect(result.stderr ?? '').not.toContain('blocked');
    const decision = JSON.parse(result.stdout.trim());
    expect(decision).toEqual({ decision: 'allow' });
  });

  it('emits Antigravity decision:allow on fail-open non-source paths', () => {
    const result = runHook(root, {
      toolCall: {
        name: 'write_to_file',
        args: {
          TargetFile: path.join(root, 'README.md'),
          CodeContent: '# not source\n',
        },
      },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({ decision: 'allow' });
  });
});

// The write gate resolves a file's layer with the same `layerForFile` as ark-check, so
// `exclude` must behave identically here: an excluded subtree is ungoverned and its
// forbiddenGlobals do not apply — the two enforcement paths never diverge.
describe('ark-mcp --hook layer exclude parity', () => {
  let root: string;

  beforeAll(() => {
    prepareMcpRuntime();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-exclude-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/kernel/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/**/domain/**'],
            exclude: ['**/kernel/**'],
            intentPrefixes: ['Domain.'],
            forbiddenGlobals: ['process'],
          },
        ],
        rules: [],
      })
    );
  });

  it('blocks a forbidden global in governed app-domain code', () => {
    const result = runHook(root, {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/domain/order.ts'),
        content: 'export const x = process.env.A;\n',
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('FORBIDDEN_GLOBAL');
  });

  it('blocks the exact node:process module dual with one forbidden-global voice (Y08)', () => {
    const result = runHook(root, {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/domain/process.ts'),
        content:
          "import process from 'node:process';\nexport const cwd = process.cwd();\n",
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('FORBIDDEN_GLOBAL');
    expect(result.stderr).toContain('node:process');
    expect(result.stderr).not.toContain('CAPABILITY_VIOLATION');
  });

  it('allows the same code in an excluded framework-internal subtree', () => {
    const result = runHook(root, {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/kernel/domain/wiring.ts'),
        content: 'export const p = process.env.B;\n',
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

  it('lists all read-side and recommend tools', async () => {
    const res = await client.request('tools/list');
    expect(res.result.tools.map((t: { name: string }) => t.name)).toEqual([
      'ark_identity',
      'ark_manifest',
      'validate_code',
      'ark_check',
      'ark_policy_delta',
      'ark_coverage',
      'ark_place',
      'ark_prepare_write',
      'ark_prepare_change',
      'ark_recommend',
      'ark_suggest_include',
      'ark_rules_inventory',
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
    expect(loosePayload.binding).toMatchObject({
      status: 'unverified',
      authoritative: false,
    });
    expect(loosePayload.verdict).toMatchObject({
      identity: { status: 'unverified', ok: false },
      coverage: { ok: false, governedPercent: 50, unclassified: 1 },
      overallOk: false,
    });
  });

  it('ark_policy_delta shares the hash-bound classifier and rejects weakening', async () => {
    const baseConfig = {
      include: ['src'],
      layers: [
        {
          name: 'DomainModel',
          patterns: ['src/domain/**'],
          forbiddenGlobals: ['Date.now', 'fetch'],
        },
        { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    };
    const response = await client.request('tools/call', {
      name: 'ark_policy_delta',
      arguments: { baseConfig },
    });
    const payload = JSON.parse(response.result.content[0].text);

    expect(response.result.isError).toBe(true);
    expect(payload).toMatchObject({
      classification: 'weakening',
      valid: false,
      requiresAcknowledgement: true,
    });
    // D6 (U04): a lowerable forbidden-global loss classifies on the lowered space.
    expect(payload.findings).toContainEqual(
      expect.objectContaining({ path: '$.layers[DomainModel].capabilities' })
    );
  });

  it('ark_policy_delta keeps a valid neutral transition non-error', async () => {
    const baseConfig = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    };
    const response = await client.request('tools/call', {
      name: 'ark_policy_delta',
      arguments: { baseConfig, candidateConfig: baseConfig },
    });
    const payload = JSON.parse(response.result.content[0].text);

    expect(response.result.isError).toBe(false);
    expect(payload).toMatchObject({ classification: 'neutral', valid: true });
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

  it('blocks an added duplicate occurrence of a pre-existing violation', () => {
    const result = hook({
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(root, 'src/domain/legacy.ts'),
        old_string: 'export const at = Date.now();',
        new_string: 'export const at = Date.now();\nexport const again = Date.now();',
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Date.now');
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

  it('reports a permitted governed edge without lexical diagnostics, but not as full parity', async () => {
    // The specifier contains the "repositories" infra token, but App → Data has no deny rule,
    // so the contract permits it — no mayImportInfrastructure flag needed. (Pre-Option-A the
    // path-heuristic blocked this.)
    const res = await validate(
      "import { getOrders } from '@/lib/repositories/orders';\nexport const r = getOrders;\n",
      'src/app/orders/route.ts'
    );
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(res.result.content[0].text)).toMatchObject({
      schemaVersion: '1.4',
      mode: 'lexical-compatibility',
      valid: false,
      completeness: 'partial',
      completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }],
      diagnostics: [],
      violations: [],
    });
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
