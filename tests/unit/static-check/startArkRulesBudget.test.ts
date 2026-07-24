/**
 * Regression: ark start --apply must succeed when AR08 emits arkrules/*.json
 * (field amarilla: 10/8 gate budget refusal). Pure setupBudget negatives included.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { setupBudget } from '../../../bin/lib/start-preview.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin', 'ark.mjs');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-start-arkrules-'));
  tempDirs.push(root);
  fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'application'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'presentation'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'infrastructure'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    '{"name":"start-arkrules-fixture","private":true}\n'
  );
  fs.writeFileSync(path.join(root, 'src/domain/value.ts'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'src/application/use.ts'), 'export const use = 1;\n');
  fs.writeFileSync(path.join(root, 'src/presentation/page.ts'), 'export const page = 1;\n');
  fs.writeFileSync(path.join(root, 'src/infrastructure/db.ts'), 'export const db = 1;\n');
  return root;
}

function change(pathname: string, afterText: string) {
  return {
    path: pathname,
    action: 'create' as const,
    beforeHash: null,
    afterHash: 'sha256:test',
    beforeBase64: null,
    afterBase64: Buffer.from(afterText).toString('base64'),
  };
}

describe('setupBudget pure contract', () => {
  it('returns ok:false when gateFiles exceed maxFiles (9 non-arkrules)', () => {
    const changes = Array.from({ length: 9 }, (_, i) => change(`gate-${i}.json`, '{}'));
    const budget = setupBudget(changes);
    expect(budget.gateFiles).toBe(9);
    expect(budget.arkrulesFiles).toBe(0);
    expect(budget.maxFiles).toBe(8);
    expect(budget.ok).toBe(false);
  });

  it('returns ok:true for 6 gate + many small arkrules under byte cap', () => {
    const changes = [
      ...Array.from({ length: 6 }, (_, i) => change(`gate-${i}.md`, 'x')),
      ...Array.from({ length: 12 }, (_, i) => change(`arkrules/Layer${i}.json`, '{"schemaVersion":"1.0"}')),
    ];
    const budget = setupBudget(changes);
    expect(budget.gateFiles).toBe(6);
    expect(budget.arkrulesFiles).toBe(12);
    expect(budget.files).toBe(18);
    expect(budget.files).toBeGreaterThan(budget.maxFiles);
    expect(budget.ok).toBe(true);
  });

  it('returns ok:false when total bytes exceed maxBytes even with few gate files', () => {
    const fat = 'x'.repeat(33 * 1024);
    const changes = [
      change('ark.config.json', '{}'),
      change('arkrules/DomainModel.json', fat),
    ];
    const budget = setupBudget(changes);
    expect(budget.gateFiles).toBe(1);
    expect(budget.arkrulesFiles).toBe(1);
    expect(budget.ok).toBe(false);
  });

  it('excludes package.json from file and byte counts', () => {
    const changes = [
      change('package.json', '{"name":"x"}'),
      change('AGENTS.md', 'router'),
    ];
    const budget = setupBudget(changes);
    expect(budget.files).toBe(1);
    expect(budget.gateFiles).toBe(1);
    expect(budget.ok).toBe(true);
  });
});

describe('ark start ArkRules budget (AR08 / field P0-1)', () => {
  it('preview reports ok with arkrules files beyond the 8-file gate surface', () => {
    const root = createFixture();
    const stdout = execFileSync(
      process.execPath,
      [ARK, 'start', '--root', root, '--no-strict', '--no-install', '--json'],
      {
        encoding: 'utf8',
        env: { ...process.env, ARK_ACTIVE_HOST: 'claude', CODEX_HOME: path.join(root, '.codex-home') },
      }
    );
    const preview = JSON.parse(stdout) as {
      changes: Array<{ path: string }>;
      setupBudget: {
        ok: boolean;
        files: number;
        gateFiles: number;
        arkrulesFiles: number;
        maxFiles: number;
        bytes: number;
      };
    };
    const arkrules = preview.changes.filter((c) => c.path.startsWith('arkrules/'));
    const nonArkRules = preview.changes.filter(
      (c) => !c.path.startsWith('arkrules/') && c.path !== 'package.json'
    );
    expect(arkrules.length).toBeGreaterThanOrEqual(1);
    expect(preview.setupBudget.gateFiles).toBeDefined();
    expect(preview.setupBudget.arkrulesFiles).toBeDefined();
    expect(preview.setupBudget.gateFiles).toBe(nonArkRules.length);
    expect(preview.setupBudget.arkrulesFiles).toBe(arkrules.length);
    expect(preview.setupBudget.ok).toBe(true);
    expect(preview.setupBudget.maxFiles).toBe(8);
    expect(preview.setupBudget.gateFiles).toBeLessThanOrEqual(8);
    // Total may exceed maxFiles; gate surface must not.
    if (preview.setupBudget.files > 8) {
      expect(preview.setupBudget.gateFiles).toBeLessThanOrEqual(8);
    }
  });

  it('apply succeeds when plan includes arkrules starters (would have been 10/8 before fix)', () => {
    const root = createFixture();
    const result = spawnSync(
      process.execPath,
      [ARK, 'start', '--root', root, '--no-strict', '--no-install', '--apply', '--yes', '--json'],
      {
        encoding: 'utf8',
        env: { ...process.env, ARK_ACTIVE_HOST: 'claude', CODEX_HOME: path.join(root, '.codex-home') },
      }
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stderr || '').not.toMatch(/exceeds the compact setup budget/i);
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
      arkRules?: Record<string, string>;
    };
    expect(config.arkRules).toBeTruthy();
    for (const rel of Object.values(config.arkRules ?? {})) {
      expect(fs.existsSync(path.join(root, rel)), rel).toBe(true);
      const body = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')) as { layer: string };
      // layer field matches exact map key (basename without .json)
      const expectedLayer = path.basename(rel, '.json');
      expect(body.layer).toBe(expectedLayer);
    }
  });
});
