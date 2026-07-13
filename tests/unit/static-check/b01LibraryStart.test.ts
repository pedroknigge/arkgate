import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin', 'ark.mjs');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const roots: string[] = [];

function run(file: string, args: string[], root: string) {
  return spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ARK_ACTIVE_HOST: 'claude', CODEX_HOME: path.join(root, '.codex-home') },
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('B01 library start adoption', () => {
  it('governs a root JavaScript package entrypoint without treating it as a monorepo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-b01-library-'));
    roots.push(root);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'queue', type: 'module', exports: './index.js' })
    );
    fs.writeFileSync(path.join(root, 'index.js'), 'export const queue = [];\n');
    fs.writeFileSync(path.join(root, 'test.js'), 'import { queue } from "./index.js";\n');

    const preview = run(ARK, ['start', '--root', root, '--tools', 'claude', '--yes', '--no-install', '--json'], root);
    expect(preview.status, `${preview.stdout}\n${preview.stderr}`).toBe(0);
    const result = JSON.parse(preview.stdout) as { projectedCoverage: { percent: number } };
    expect(result.projectedCoverage.percent).toBe(100);

    const applied = run(ARK, ['start', '--root', root, '--tools', 'claude', '--yes', '--no-install', '--apply', '--json'], root);
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as { include: string[]; frameworkOverlay: string };
    expect(config.include).toContain('.');
    expect(config.frameworkOverlay).toBe('library');

    const strict = run(ARK_CHECK, ['--root', root, '--strict-merge'], root);
    expect(strict.status, `${strict.stdout}\n${strict.stderr}`).toBe(0);
  });

  it('classifies flat workspace package roots by their declared role', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-b01-workspace-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'packages', 'schema', 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages', 'docs', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'workspace', private: true, workspaces: ['packages/*'] })
    );
    fs.writeFileSync(
      path.join(root, 'packages', 'schema', 'package.json'),
      JSON.stringify({ name: '@scope/schema', exports: './src/index.ts' })
    );
    fs.writeFileSync(path.join(root, 'packages', 'schema', 'src', 'index.ts'), 'export const schema = true;\n');
    fs.writeFileSync(path.join(root, 'packages', 'schema', 'src', 'parse.ts'), 'export const parse = true;\n');
    fs.writeFileSync(path.join(root, 'packages', 'schema', 'test-resolution.ts'), 'export const testResolution = true;\n');
    fs.writeFileSync(path.join(root, 'packages', 'docs', 'package.json'), JSON.stringify({ name: '@scope/docs' }));
    fs.writeFileSync(path.join(root, 'packages', 'docs', 'src', 'page.ts'), 'export const page = true;\n');

    const preview = run(ARK, ['start', '--root', root, '--tools', 'grok', '--yes', '--no-install', '--json'], root);
    expect(preview.status, `${preview.stdout}\n${preview.stderr}`).toBe(0);
    const result = JSON.parse(preview.stdout) as { projectedCoverage: { percent: number };
      changes: Array<{ path: string; afterBase64: string }> };
    expect(result.projectedCoverage.percent).toBe(100);
    const configChange = result.changes.find((change) => change.path === 'ark.config.json');
    expect(configChange).toBeDefined();
    const config = JSON.parse(Buffer.from(configChange!.afterBase64, 'base64').toString('utf8')) as {
      layers: Array<{ name: string; patterns: string[] }>;
    };
    expect(config.layers.find((layer) => layer.name === 'DomainModel')?.patterns).toContain('packages/schema/src/**');
    expect(config.layers.find((layer) => layer.name === 'ApplicationOrchestration')?.patterns).not.toContain('packages/docs/src/**');
  });
});
