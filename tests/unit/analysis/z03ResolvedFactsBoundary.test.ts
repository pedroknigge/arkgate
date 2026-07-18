import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject, loadContract } from '../../../src/gate';

const SOURCE = path.resolve('tests/fixtures/resolved-facts-boundary');
const CHECK = path.resolve('bin/ark-check.mjs');
const roots: string[] = [];

function installedFixture(): string {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z03-facts-'));
  const root = path.join(parent, 'project');
  fs.cpSync(SOURCE, root, { recursive: true });
  roots.push(parent);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const install = spawnSync(
    npm,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'],
    { cwd: root, encoding: 'utf8' }
  );
  expect(install.status, install.stderr).toBe(0);
  // TypeScript realpaths workspace links. Canonicalize the temporary root too so
  // macOS' /var -> /private/var alias does not turn an internal target into an escape.
  return fs.realpathSync(root);
}

describe('Z03 resolved-facts boundary', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('reproduces the alias/workspace divergence between the lexical API and final CLI', () => {
    const root = installedFixture();
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const files = [
      'packages/domain/src/order.ts',
      'packages/kernel/src/index.ts',
    ].map((file) => ({
      path: file,
      content: fs.readFileSync(path.join(root, file), 'utf8'),
    }));

    const lexical = analyzeProject({ contract: loadContract(config), files });
    expect(lexical.ir.edges).toEqual([]);
    expect(lexical.ir.violations).toEqual([]);

    const run = spawnSync(
      process.execPath,
      [CHECK, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache'],
      { encoding: 'utf8' }
    );
    expect(run.status).toBe(1);
    const resolved = JSON.parse(run.stdout);
    expect(resolved.valid).toBe(false);
    expect(resolved.completeness).toBe('complete');
    expect(resolved.diagnostics).toHaveLength(2);
    expect(resolved.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'LAYER_IMPORT_VIOLATION',
          location: expect.objectContaining({ file: 'packages/domain/src/order.ts', line: 1 }),
          evidence: expect.objectContaining({
            target: 'packages/kernel/src/index.ts',
            fromLayer: 'DomainModel',
            toLayer: 'Kernel',
          }),
        }),
        expect.objectContaining({
          ruleId: 'LAYER_IMPORT_VIOLATION',
          location: expect.objectContaining({ file: 'packages/domain/src/order.ts', line: 2 }),
          evidence: expect.objectContaining({
            target: 'packages/kernel/src/index.ts',
            fromLayer: 'DomainModel',
            toLayer: 'Kernel',
          }),
        }),
      ])
    );
  });
});
