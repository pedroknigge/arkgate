import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ARK = path.resolve('bin/ark.mjs');
const roots: string[] = [];

function writeJson(root: string, relativePath: string, value: unknown): void {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

function setupRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t03-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
  writeJson(root, 'ark.config.json', {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'Kernel', patterns: ['src/kernel/**'] },
    ],
    rules: [],
  });
  writeJson(root, 'changes.json', {
    changes: [
      { path: 'src/domain/order.ts', content: 'export const order = 2;\n' },
      { path: 'src/kernel/service.ts', content: 'export const service = true;\n' },
    ],
  });
  return root;
}

function run(root: string, withMap: boolean) {
  return spawnSync(
    process.execPath,
    [
      ARK,
      'preflight',
      '--root',
      root,
      '--changes',
      'changes.json',
      ...(withMap ? ['--change-map', 'change-map.json'] : []),
      '--json',
    ],
    { cwd: root, encoding: 'utf8' }
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
describe('T03 optional architecture change map', () => {
  it('binds a valid versioned map to preflight without making it mandatory', () => {
    const root = setupRoot();
    writeJson(root, 'change-map.json', {
      $schema: 'https://unpkg.com/arkgate@3/schemas/ark.change-map.schema.json',
      schemaVersion: '1.0',
      files: [
        { path: 'src/domain/order.ts', operation: 'update', layer: 'DomainModel' },
        { path: 'src/kernel/service.ts', operation: 'create', layer: 'Kernel' },
      ],
      dependencies: [],
    });

    const withoutMap = run(root, false);
    const withMap = run(root, true);
    expect(withoutMap.status, withoutMap.stderr).toBe(0);
    expect(JSON.parse(withoutMap.stdout).changeMapHash).toBeUndefined();
    expect(withMap.status, withMap.stderr).toBe(0);
    expect(JSON.parse(withMap.stdout).changeMapHash).toMatch(/^fnv1a-/);
  });

  it('rejects unresolved layers and edges before source writes', () => {
    const root = setupRoot();
    const before = fs.readFileSync(path.join(root, 'src/domain/order.ts'));
    writeJson(root, 'change-map.json', {
      $schema: 'https://unpkg.com/arkgate@3/schemas/ark.change-map.schema.json',
      schemaVersion: '1.0',
      files: [{ path: 'src/domain/order.ts', operation: 'update', layer: 'Kernel' }],
      dependencies: [
        { from: 'src/domain/order.ts', to: 'src/kernel/not-planned.ts' },
      ],
    });

    const result = run(root, true);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('resolves to DomainModel, not Kernel');
    expect(result.stderr).toContain('must reference a planned file path');
    expect(fs.readFileSync(path.join(root, 'src/domain/order.ts'))).toEqual(before);
    expect(fs.existsSync(path.join(root, 'src/kernel/service.ts'))).toBe(false);
  });
});
