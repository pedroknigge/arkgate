import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin', 'ark.mjs');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const HOSTS = [
  'claude',
  'grok',
  'cursor',
  'codex',
  'windsurf',
  'cline',
  'copilot',
  'kiro',
  'roo',
  'continue',
  'gemini',
] as const;

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-o03-'));
  fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    '{\n    "name": "o03-fixture",\n    "private": true,\n    "scripts": {\n        "verify": "node check.mjs"\n    }\n}\n'
  );
  fs.writeFileSync(path.join(root, 'check.mjs'), 'console.log("user script");\n');
  fs.writeFileSync(path.join(root, 'src', 'domain', 'value.ts'), 'export const value = 1;\n');
  return root;
}

function snapshot(root: string) {
  const files = new Map<string, Buffer>();
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.set(path.relative(root, file).split(path.sep).join('/'), fs.readFileSync(file));
    }
  };
  visit(root);
  return files;
}

function changedPaths(before: Map<string, Buffer>, after: Map<string, Buffer>) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((file) => !before.get(file)?.equals(after.get(file)!))
    .sort();
}

function start(root: string, host: string, args: string[] = []) {
  // O03 measures compact gate budget; --no-install isolates package pin (default since 3.8.3).
  return execFileSync(
    process.execPath,
    [ARK, 'start', '--root', root, '--no-strict', '--no-install', '--json', ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, ARK_ACTIVE_HOST: host, CODEX_HOME: path.join(root, '.codex-home') },
    }
  );
}

describe('O03 compact start', () => {
  it.each(HOSTS)('%s setup stays under the eight-file/32 KB gate budget and is idempotent', (host) => {
    const root = createFixture();
    try {
      const originalPackage = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
      const preview = JSON.parse(start(root, host)) as {
        changes: Array<{ path: string }>;
        setupBudget: {
          files: number;
          bytes: number;
          ok: boolean;
          gateFiles?: number;
          arkrulesFiles?: number;
          maxFiles: number;
        };
      };
      expect(preview.setupBudget).toMatchObject({ files: expect.any(Number), bytes: expect.any(Number), ok: true });
      // Gate surface (MCP + host + CI + AGENTS + config) stays ≤8; arkrules/*.json are extra content.
      const gateFiles =
        preview.setupBudget.gateFiles ??
        preview.changes.filter((c) => !c.path.startsWith('arkrules/') && c.path !== 'package.json').length;
      expect(gateFiles).toBeLessThanOrEqual(8);
      expect(preview.setupBudget.maxFiles).toBe(8);
      expect(preview.setupBudget.bytes).toBeLessThan(32 * 1024);
      expect(preview.changes.some((change) => change.path === 'package.json')).toBe(false);
      expect(preview.changes.some((change) => /\/(skills|prompts|commands)\//.test(change.path))).toBe(false);
      expect(preview.changes.some((change) => change.path === '.mcp.json')).toBe(true);

      const before = snapshot(root);
      const applied = JSON.parse(start(root, host, ['--apply'])) as typeof preview;
      const after = snapshot(root);
      const changed = changedPaths(before, after);
      expect(changed).toEqual(applied.changes.map((change) => change.path).sort());
      const gateChanged = changed.filter((file) => !file.startsWith('arkrules/'));
      expect(gateChanged.length).toBeLessThanOrEqual(8);
      expect(applied.setupBudget.ok).toBe(true);
      expect(changed).not.toContain('check.mjs');
      expect(changed).not.toContain('src/domain/value.ts');
      expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(originalPackage);
      const instructions = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
      expect(instructions).toContain('## Compact router');
      expect(instructions).toMatch(/Primary path/i);
      expect(instructions).toMatch(/Expert depth/i);
      expect(instructions).toMatch(/--doctor/);
      expect(instructions).not.toMatch(/origin is frozen/i);
      // Optional single guided-skill mention under expert depth is allowed; no full skill catalog.
      expect(instructions).not.toMatch(/\/ark-coverage|\/ark-think|\/ark-loop|\/ark-adopt/);
      expect(fs.existsSync(path.join(root, '.codex', 'prompts'))).toBe(false);

      const strict = spawnSync(process.execPath, [ARK_CHECK, '--root', root, '--strict-merge'], {
        encoding: 'utf8',
      });
      expect(strict.status, `${strict.stdout}\n${strict.stderr}`).toBe(0);
      expect(`${strict.stdout}\n${strict.stderr}`).not.toMatch(/skill\(s\) not installed/i);

      const rerun = JSON.parse(start(root, host)) as typeof preview;
      expect(rerun.changes).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('changes package.json only with explicit --install and preserves its formatting', () => {
    const root = createFixture();
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        '{\n    "name": "o03-fixture",\n    "private": true,\n    "devDependencies": {\n        "vitest": "^3.2.6"\n    }\n}\n'
      );
      const preview = JSON.parse(
        start(root, 'codex', ['--install', '--apply', '--skip-package-manager'])
      ) as {
        changes: Array<{ path: string }>;
      };
      expect(preview.changes.map((change) => change.path)).toContain('package.json');
      const packageText = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
      expect(packageText).toContain('    "name": "o03-fixture"');
      expect(packageText).toContain('        "vitest": "^3.2.6",');
      expect(packageText).toContain('        "arkgate":');
      expect(JSON.parse(packageText).devDependencies.arkgate).toMatch(/^\^/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a compact setup that names more than one host', () => {
    const root = createFixture();
    try {
      const result = spawnSync(
        process.execPath,
        [ARK, 'start', '--root', root, '--tools', 'codex,cursor', '--json'],
        { encoding: 'utf8' }
      );
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain('--compact accepts exactly one selected host');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('removes a compact host explicitly and restores it through the selected host path', () => {
    const root = createFixture();
    try {
      start(root, 'codex', ['--apply']);
      expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);
      const removal = JSON.parse(
        execFileSync(process.execPath, [ARK, 'start', '--root', root, '--remove-host', 'codex', '--apply', '--json'], {
          encoding: 'utf8',
        })
      ) as { changes: Array<{ path: string; action: string }>; unresolvedDecisions: string[] };
      expect(removal.unresolvedDecisions).toEqual([]);
      expect(removal.changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '.codex/hooks.json', action: 'delete' }),
          expect.objectContaining({ path: 'AGENTS.md', action: 'edit' }),
        ])
      );
      expect(fs.existsSync(path.join(root, '.codex', 'hooks.json'))).toBe(false);
      // Shared MCP registration is kept (or recreated) when a compact host is removed.
      expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);

      start(root, 'codex', ['--apply']);
      expect(fs.existsSync(path.join(root, '.codex', 'hooks.json'))).toBe(true);
      // 3.8.3: compact always installs project .mcp.json for every host.
      expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
