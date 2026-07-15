import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const roots: string[] = [];

function writeJson(root: string, relativePath: string, value: unknown): void {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

function setupRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t02-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
  fs.writeFileSync(path.join(root, 'src/domain/obsolete.ts'), 'export const obsolete = true;\n');
  writeJson(root, 'ark.config.json', {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'Kernel', patterns: ['src/kernel/**'] },
    ],
    rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
  });
  return root;
}

function preflight(root: string, changes: unknown[]) {
  writeJson(root, 'changes.json', { changes });
  return spawnSync(
    process.execPath,
    [ARK, 'preflight', '--root', root, '--changes', 'changes.json', '--json'],
    { cwd: root, encoding: 'utf8' }
  );
}

function sourceSnapshot(root: string): Map<string, Buffer> {
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
  visit(root);
  return snapshot;
}

function applyChanges(root: string, changes: Array<{ path: string; content?: string; delete?: true }>) {
  for (const change of changes) {
    const absolute = path.join(root, change.path);
    if (change.delete) fs.rmSync(absolute, { force: true });
    else {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, change.content ?? '');
    }
  }
}

function finalCheck(root: string) {
  return spawnSync(
    process.execPath,
    [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache'],
    { cwd: root, encoding: 'utf8' }
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('T02 atomic change preflight', () => {
  it('classifies create/update/delete, returns hashes, and leaves source bytes untouched', () => {
    const root = setupRoot();
    const before = sourceSnapshot(root);
    const result = preflight(root, [
      { path: 'src/domain/created.ts', content: 'export const created = true;\n' },
      { path: 'src/domain/order.ts', content: 'export const order = 2;\n' },
      { path: 'src/domain/obsolete.ts', delete: true },
    ]);

    expect(result.status, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      valid: true,
      readOnly: true,
      changes: [
        { path: 'src/domain/created.ts', operation: 'create' },
        { path: 'src/domain/obsolete.ts', operation: 'delete' },
        { path: 'src/domain/order.ts', operation: 'update' },
      ],
      violations: [],
    });
    expect(payload.policyHash).toMatch(/^fnv1a-/);
    expect(payload.baseTreeHash).not.toBe(payload.candidateTreeHash);
    expect(sourceSnapshot(root)).toEqual(before);
  });

  it('matches the final full-check verdict for a cross-file forbidden edge', () => {
    const root = setupRoot();
    const changes = [
      {
        path: 'src/domain/order.ts',
        content: "import { service } from '../kernel/service';\nexport const order = service;\n",
      },
      { path: 'src/kernel/service.ts', content: 'export const service = 1;\n' },
    ];
    const before = sourceSnapshot(root);
    const result = preflight(root, changes);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.valid).toBe(false);
    expect(payload.violations).toEqual([
      expect.objectContaining({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'src/domain/order.ts',
        target: 'src/kernel/service.ts',
      }),
    ]);
    expect(sourceSnapshot(root)).toEqual(before);

    const applied = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t02-applied-'));
    roots.push(applied);
    fs.cpSync(root, applied, { recursive: true });
    applyChanges(applied, changes);
    const final = finalCheck(applied);
    expect(final.status).toBe(1);
    expect(JSON.parse(final.stdout).valid).toBe(payload.valid);
  });

  it('matches the final full-check verdict for a cycle created only by the complete batch', () => {
    const root = setupRoot();
    const changes = [
      {
        path: 'src/domain/a.ts',
        content: "import { b } from './b';\nexport const a = b;\n",
      },
      {
        path: 'src/domain/b.ts',
        content: "import { a } from './a';\nexport const b = a;\n",
      },
    ];
    const result = preflight(root, changes);
    const payload = JSON.parse(result.stdout);
    expect(result.status).toBe(1);
    expect(payload.violations).toEqual([
      expect.objectContaining({ ruleId: 'CIRCULAR_DEPENDENCY', file: 'src/domain/a.ts' }),
    ]);

    const applied = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t02-cycle-'));
    roots.push(applied);
    fs.cpSync(root, applied, { recursive: true });
    applyChanges(applied, changes);
    const final = finalCheck(applied);
    expect(final.status).toBe(1);
    expect(JSON.parse(final.stdout).valid).toBe(payload.valid);
  });

  it('rejects escaping paths as invalid input', () => {
    const root = setupRoot();
    const result = preflight(root, [{ path: '../escape.ts', content: 'export {};\n' }]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('escapes the project root');
  });

  it('fails closed instead of claiming to inspect an ungoverned or non-source path', () => {
    const root = setupRoot();
    const outside = preflight(root, [
      { path: 'scripts/generated.ts', content: 'export const generated = true;\n' },
    ]);
    expect(outside.status).toBe(2);
    expect(outside.stderr).toContain('outside the configured source scope');

    const testFile = preflight(root, [
      { path: 'src/domain/order.test.ts', content: 'export {};\n' },
    ]);
    expect(testFile.status).toBe(2);
    expect(testFile.stderr).toContain('only accepts governed production source files');
  });

  it('rejects a lexical project path whose existing ancestor is an escaping symlink', () => {
    const root = setupRoot();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t02-outside-'));
    roots.push(outside);
    fs.symlinkSync(outside, path.join(root, 'linked-outside'), 'dir');

    const result = preflight(root, [
      { path: 'linked-outside/escape.ts', content: 'export const escaped = true;\n' },
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('resolves outside the project root');
    expect(fs.existsSync(path.join(outside, 'escape.ts'))).toBe(false);
  });
});
