import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ARK = path.resolve('bin/ark.mjs');
const roots: string[] = [];

function writeJson(root: string, relativePath: string, value: unknown): void {
  fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function setupRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t04-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/kernel'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
  writeJson(root, 'ark.config.json', {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'Kernel', patterns: ['src/kernel/**'] },
    ],
    rules: [],
  });
  return root;
}

function snapshotSources(root: string): Map<string, Buffer> {
  const snapshot = new Map<string, Buffer>();
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        snapshot.set(path.relative(root, absolute), fs.readFileSync(absolute));
      }
    }
  };
  visit(path.join(root, 'src'));
  return snapshot;
}

function run(root: string, json = true) {
  return spawnSync(
    process.execPath,
    [
      ARK,
      'preflight',
      '--root',
      root,
      '--changes',
      'changes.json',
      '--change-map',
      'change-map.json',
      ...(json ? ['--json'] : []),
    ],
    { cwd: root, encoding: 'utf8' }
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('T04 read-only structural convergence', () => {
  it('reports a clean map-to-candidate match and preserves every source byte', () => {
    const root = setupRoot();
    writeJson(root, 'changes.json', {
      changes: [
        {
          path: 'src/domain/order.ts',
          content: "import { service } from '../kernel/service';\nexport const order = service;\n",
        },
        { path: 'src/kernel/service.ts', content: 'export const service = 1;\n' },
      ],
    });
    writeJson(root, 'change-map.json', {
      $schema: 'https://unpkg.com/arkgate@3/schemas/ark.change-map.schema.json',
      schemaVersion: '1.0',
      files: [
        { path: 'src/domain/order.ts', operation: 'update', layer: 'DomainModel' },
        { path: 'src/kernel/service.ts', operation: 'create', layer: 'Kernel' },
      ],
      dependencies: [{ from: 'src/domain/order.ts', to: 'src/kernel/service.ts' }],
    });
    const before = snapshotSources(root);

    const result = run(root);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).convergence).toMatchObject({
      readOnly: true,
      structurallyConverged: true,
      behavioralCompletion: 'not-evaluated',
      summary: { satisfied: 3, missing: 0, contradictory: 0, unplanned: 0 },
    });
    expect(snapshotSources(root)).toEqual(before);

    const human = run(root, false);
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain('Structural convergence: passed');
    expect(human.stdout).toContain('Behavioral completion: not evaluated');
    expect(human.stdout).not.toContain('feature complete');
    expect(snapshotSources(root)).toEqual(before);
  });

  it('rejects structural drift even when architecture rules are otherwise green', () => {
    const root = setupRoot();
    writeJson(root, 'changes.json', {
      changes: [
        { path: 'src/domain/order.ts', content: 'export const order = 2;\n' },
        {
          path: 'src/kernel/service.ts',
          content: "import { order } from '../domain/order';\nexport const service = order;\n",
        },
        { path: 'src/domain/extra.ts', content: 'export const extra = true;\n' },
      ],
    });
    writeJson(root, 'change-map.json', {
      $schema: 'https://unpkg.com/arkgate@3/schemas/ark.change-map.schema.json',
      schemaVersion: '1.0',
      files: [
        { path: 'src/domain/order.ts', operation: 'update', layer: 'DomainModel' },
        { path: 'src/kernel/service.ts', operation: 'create', layer: 'Kernel' },
      ],
      dependencies: [{ from: 'src/domain/order.ts', to: 'src/kernel/service.ts' }],
    });
    const before = snapshotSources(root);

    const result = run(root);
    expect(result.status, result.stderr).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.valid).toBe(false);
    expect(payload.violations).toEqual([]);
    expect(payload.convergence).toMatchObject({
      structurallyConverged: false,
      behavioralCompletion: 'not-evaluated',
      summary: { satisfied: 2, missing: 0, contradictory: 1, unplanned: 1 },
    });
    expect(snapshotSources(root)).toEqual(before);

    const human = run(root, false);
    expect(human.status).toBe(1);
    expect(human.stderr).toContain('contradictory:dependency:');
    expect(human.stderr).toContain('unplanned:file:src/domain/extra.ts');
    expect(human.stderr).toContain('Behavioral completion: not evaluated');
    expect(snapshotSources(root)).toEqual(before);
  });
});
