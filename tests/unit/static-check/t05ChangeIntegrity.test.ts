import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withDistLock } from '../../helpers/distLock';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const ARK_MCP = path.resolve('bin/ark-mcp.mjs');
const roots: string[] = [];

function write(root: string, relativePath: string, content: string): void {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  write(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function setupRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t05-'));
  roots.push(root);
  write(root, 'src/domain/existing.ts', 'export const existing = true;\n');
  writeJson(root, 'ark.config.json', {
    schemaVersion: '1.0',
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'], forbiddenGlobals: ['fetch'] },
      { name: 'Kernel', patterns: ['src/kernel/**'] },
    ],
    rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
  });
  return root;
}

function batchChanges() {
  return [
    {
      path: 'src/domain/order.ts',
      content:
        "import { service } from '../kernel/service';\nexport const order = service;\n",
    },
    { path: 'src/kernel/service.ts', content: 'export const service = 1;\n' },
  ];
}

function preflight(root: string, json: boolean) {
  writeJson(root, 'changes.json', { changes: batchChanges() });
  return spawnSync(
    process.execPath,
    [ARK, 'preflight', '--root', root, '--changes', 'changes.json', ...(json ? ['--json'] : [])],
    { cwd: root, encoding: 'utf8' }
  );
}

function repairPayload(stderr: string): Record<string, any> {
  const line = stderr.split('\n').find((entry) => entry.startsWith('ARK_REPAIR_JSON:'));
  expect(line).toBeTruthy();
  return JSON.parse(line!.slice('ARK_REPAIR_JSON:'.length));
}

function runHook(root: string, payload: unknown) {
  return withDistLock(() =>
    spawnSync(
      process.execPath,
      [
        ARK_MCP,
        '--hook',
        '--hook-repair',
        '--root',
        root,
        '--config',
        path.join(root, 'ark.config.json'),
      ],
      {
        cwd: root,
        encoding: 'utf8',
        input: JSON.stringify(payload),
      }
    )
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('T05 context-independent enforcement proof', () => {
  it('gives the same deterministic next action in human and JSON preflight output', () => {
    const root = setupRoot();
    const jsonRun = preflight(root, true);
    const humanRun = preflight(root, false);

    expect(jsonRun.status).toBe(1);
    expect(humanRun.status).toBe(1);
    const payload = JSON.parse(jsonRun.stdout);
    const diagnostic = payload.diagnostics[0];
    expect(diagnostic).toMatchObject({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      evidence: {
        target: 'src/kernel/service.ts',
        fromLayer: 'DomainModel',
        toLayer: 'Kernel',
      },
    });
    expect(diagnostic.nextAction).toContain('Define a port in DomainModel');
    expect(humanRun.stderr).toContain(`Next action: ${diagnostic.nextAction}`);
  });

  it('preflights a complete ApplyPatch atomically without overstating Codex hardness', () => {
    const root = setupRoot();
    const patch = [
      '*** Begin Patch',
      '*** Add File: src/domain/order.ts',
      "+import { service } from '../kernel/service';",
      '+export const order = service;',
      '*** Add File: src/kernel/service.ts',
      '+export const service = 1;',
      '*** End Patch',
    ].join('\n');
    const run = runHook(root, { tool_name: 'ApplyPatch', tool_input: { patch } });

    expect(run.status, run.stderr).toBe(2);
    const repair = repairPayload(run.stderr);
    const cli = JSON.parse(preflight(root, true).stdout);
    expect(repair.diagnostics).toEqual(cli.diagnostics);
    expect(repair.enforcement.localWrite).toMatchObject({
      supported: false,
      installed: true,
      active: true,
      bypassable: true,
      hard: false,
      operation: 'apply_patch',
      coverage: 'complete-patch',
    });
    expect(fs.existsSync(path.join(root, 'src/domain/order.ts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/kernel/service.ts'))).toBe(false);
  });

  it('preserves update and delete operations in complete ApplyPatch preflight', () => {
    const root = setupRoot();
    write(root, 'src/kernel/service.ts', 'export const service = 1;\n');
    write(root, 'src/kernel/obsolete.ts', 'export const obsolete = true;\n');
    const patch = [
      '*** Begin Patch',
      '*** Update File: src/domain/existing.ts',
      '@@',
      '-export const existing = true;',
      "+import { service } from '../kernel/service';",
      '+export const existing = service;',
      '*** Delete File: src/kernel/obsolete.ts',
      '*** End Patch',
    ].join('\n');
    const run = runHook(root, { tool_name: 'ApplyPatch', tool_input: { patch } });

    expect(run.status, run.stderr).toBe(2);
    expect(repairPayload(run.stderr).changes).toEqual([
      expect.objectContaining({ path: 'src/domain/existing.ts', operation: 'update' }),
      expect.objectContaining({ path: 'src/kernel/obsolete.ts', operation: 'delete' }),
    ]);
    expect(fs.readFileSync(path.join(root, 'src/domain/existing.ts'), 'utf8')).toBe(
      'export const existing = true;\n'
    );
    expect(fs.existsSync(path.join(root, 'src/kernel/obsolete.ts'))).toBe(true);
  });

  it('honors named update anchors before reconstructing a complete ApplyPatch', () => {
    const root = setupRoot();
    write(
      root,
      'src/domain/existing.ts',
      [
        'export function first() {',
        '  return 1;',
        '}',
        'export function target() {',
        '  return 1;',
        '}',
        '',
      ].join('\n')
    );
    const patch = [
      '*** Begin Patch',
      '*** Update File: src/domain/existing.ts',
      '@@ export function target() {',
      '-  return 1;',
      "+  return fetch('/price');",
      '*** End Patch',
    ].join('\n');
    const run = runHook(root, { tool_name: 'ApplyPatch', tool_input: { patch } });

    expect(run.status, run.stderr).toBe(2);
    expect(repairPayload(run.stderr).diagnostics[0]).toMatchObject({
      ruleId: 'FORBIDDEN_GLOBAL',
      location: { file: 'src/domain/existing.ts', line: 5 },
    });
  });

  it('never labels a partially reconstructed ApplyPatch as complete enforcement', () => {
    const root = setupRoot();
    const patch = [
      '*** Begin Patch',
      '*** Update File: src/domain/existing.ts',
      '@@',
      '-export const valueThatDoesNotExist = true;',
      '+export const existing = false;',
      '*** Add File: src/domain/order.ts',
      "+import { service } from '../kernel/service';",
      '+export const order = service;',
      '*** End Patch',
    ].join('\n');
    const run = runHook(root, { tool_name: 'ApplyPatch', tool_input: { patch } });

    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).not.toContain('ARK_REPAIR_JSON:');
    expect(run.stderr).not.toContain('complete ApplyPatch');
    expect(fs.readFileSync(path.join(root, 'src/domain/existing.ts'), 'utf8')).toBe(
      'export const existing = true;\n'
    );
    expect(fs.existsSync(path.join(root, 'src/domain/order.ts'))).toBe(false);
  });

  it('reports hard only after a trusted host invokes a covered single-file operation', () => {
    const root = setupRoot();
    write(root, 'src/kernel/service.ts', 'export const service = 1;\n');
    const run = runHook(root, {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/domain/order.ts'),
        content:
          "import { service } from '../kernel/service';\nexport const order = service;\n",
      },
    });

    expect(run.status, run.stderr).toBe(2);
    expect(repairPayload(run.stderr).enforcement.localWrite).toMatchObject({
      supported: true,
      installed: true,
      active: true,
      bypassable: false,
      hard: true,
      operation: 'Write',
      operationCovered: true,
      completePatch: false,
    });
  });

  it('doctor separates support, install evidence, active trust, and bypassability', () => {
    const root = setupRoot();
    write(
      root,
      '.claude/settings.json',
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Write|Edit|MultiEdit',
              hooks: [
                { command: 'npx arkgate-mcp --hook --hook-repair --root .' },
              ],
            },
          ],
        },
      })
    );
    write(
      root,
      '.mcp.json',
      '{"mcpServers":{"ark":{"command":"npx","args":["arkgate-mcp"]}}}\n'
    );
    write(
      root,
      '.github/workflows/ark-check.yml',
      'jobs:\n  architecture:\n    steps:\n      - run: npx ark-check --strict-merge\n'
    );
    const run = spawnSync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, ARK_ACTIVE_HOST: 'claude' },
      }
    );

    expect(run.status, run.stderr).toBe(0);
    const ladder = JSON.parse(run.stdout).doctor.writePath.enforcementLadder;
    expect(ladder.localWrite).toMatchObject({
      supported: true,
      installed: true,
      active: 'unverified',
      bypassable: true,
      hard: false,
    });
    expect(ladder.advisoryMcp).toMatchObject({
      supported: true,
      installed: true,
      active: 'unverified',
      bypassable: true,
    });
    expect(ladder.ciMerge).toMatchObject({
      supported: true,
      installed: true,
      active: 'unverified',
      bypassable: 'unknown',
    });
  });
});
