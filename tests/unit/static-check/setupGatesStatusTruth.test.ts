/**
 * Setup-cluster regressions for gate install, status, and help truth:
 * - existing `.claude/settings.json` / `.codex/hooks.json` are merged, never skipped or wiped
 * - `ark status` / `ark agents-md` honor --config; status surfaces an invalid contract
 * - `ark-check --json` emits a CONFIG_INVALID envelope on stdout
 * - `--tools` help lists every accepted host; Codex home line reports what happened
 * - starter ArkRules ids are unique so `--promote <id> --apply` works on the starter
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { claudeSettings, mergeClaudeStyleArkHooks } from '../../../bin/lib/hook-templates.mjs';
import { validateHardWriteRequest } from '../../../bin/lib/enforcement-profiles.mjs';
import { setupUsageAll } from '../../../bin/lib/first-run-help.mjs';
import { KNOWN_TOOLS } from '../../../bin/lib/skill-install.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin', 'ark.mjs');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

function run(bin: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

const USER_SETTINGS = {
  permissions: { allow: ['Bash(ls:*)'] },
  hooks: {
    PostToolUse: [
      { matcher: 'Write', hooks: [{ type: 'command', command: 'prettier --write' }] },
    ],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo guard' }] }],
  },
};

function userSettingsFixture(prefix: string) {
  const root = tempRoot(prefix);
  write(root, 'package.json', `${JSON.stringify({ name: 'settings-merge' })}\n`);
  write(root, 'src/domain/a.ts', 'export const a = 1;\n');
  write(root, '.claude/settings.json', `${JSON.stringify(USER_SETTINGS, null, 2)}\n`);
  return root;
}

function readSettings(root: string) {
  return JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'));
}

function expectUserKeysAndArkHooks(settings: Record<string, any>) {
  expect(settings.permissions).toEqual(USER_SETTINGS.permissions);
  expect(settings.hooks.PostToolUse).toEqual(USER_SETTINGS.hooks.PostToolUse);
  const pre = JSON.stringify(settings.hooks.PreToolUse);
  expect(pre).toContain('echo guard');
  expect(pre).toMatch(/arkgate-mcp --hook/);
  expect(JSON.stringify(settings.hooks.SessionStart)).toMatch(/arkgate-mcp --session-context/);
}

describe('Claude-style hook merge', () => {
  it('keeps user keys and hooks, replaces only prior Ark entries, and is idempotent', () => {
    const generated = claudeSettings('/tmp/none');
    const once = mergeClaudeStyleArkHooks(JSON.stringify(USER_SETTINGS), generated);
    expect(once).not.toBeNull();
    expectUserKeysAndArkHooks(JSON.parse(once!));
    expect(mergeClaudeStyleArkHooks(once!, generated)).toBe(once);
    const parsed = JSON.parse(once!);
    expect(parsed.hooks.PreToolUse.filter((g: any) => /arkgate-mcp/.test(JSON.stringify(g)))).toHaveLength(1);
    expect(mergeClaudeStyleArkHooks('{ nope', generated)).toBeNull();
    expect(mergeClaudeStyleArkHooks('[]', generated)).toBeNull();
    expect(mergeClaudeStyleArkHooks('{"hooks":[]}', generated)).toBeNull();
  });

  it('install-agent-gates merges an existing .claude/settings.json without --force', () => {
    const root = userSettingsFixture('ark-claude-merge-');
    const install = run(ARK_CHECK, ['--root', root, '--install-agent-gates', '--tools', 'claude']);
    expect(install.status, install.stderr).toBe(0);
    expectUserKeysAndArkHooks(readSettings(root));
    const firstText = fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8');
    const again = run(ARK_CHECK, ['--root', root, '--install-agent-gates', '--tools', 'claude']);
    expect(again.status, again.stderr).toBe(0);
    expect(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8')).toBe(firstText);
  });

  it('--require-write-hook claude accepts a mergeable file and --force keeps user keys', () => {
    const root = userSettingsFixture('ark-claude-require-');
    expect(validateHardWriteRequest({ root, host: 'claude', tools: 'claude' })).toMatchObject({ ok: true });
    const forced = run(ARK_CHECK, ['--root', root, '--install-agent-gates', '--tools', 'claude', '--force']);
    expect(forced.status, forced.stderr).toBe(0);
    expectUserKeysAndArkHooks(readSettings(root));
  });

  it('start --apply plans an edit of existing Claude settings instead of skipping the hook', () => {
    const root = userSettingsFixture('ark-claude-start-');
    const applied = run(ARK, [
      'start',
      '--root',
      root,
      '--tools',
      'claude',
      '--preset',
      'hexagonal',
      '--apply',
      '--yes',
      '--no-install',
    ]);
    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.stdout).toMatch(/edit\s+\.claude\/settings\.json/);
    expectUserKeysAndArkHooks(readSettings(root));
  });

  it('merges an existing .codex/hooks.json and keeps user hooks', () => {
    const root = tempRoot('ark-codex-merge-');
    write(root, 'src/domain/a.ts', 'export const a = 1;\n');
    write(
      root,
      '.codex/hooks.json',
      `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] } })}\n`
    );
    const install = run(ARK_CHECK, ['--root', root, '--install-agent-gates', '--tools', 'codex']);
    expect(install.status, install.stderr).toBe(0);
    const hooks = JSON.parse(fs.readFileSync(path.join(root, '.codex/hooks.json'), 'utf8'));
    expect(JSON.stringify(hooks.hooks.Stop)).toContain('say done');
    expect(JSON.stringify(hooks.hooks.PreToolUse)).toMatch(/arkgate-mcp --hook/);
  });
});

describe('ark status / agents-md --config', () => {
  function customConfigFixture() {
    const root = tempRoot('ark-custom-config-');
    write(root, 'src/domain/a.ts', 'export const a = 1;\n');
    write(
      root,
      'custom.config.json',
      `${JSON.stringify({
        include: ['src'],
        layers: [{ name: 'CoreLayer', patterns: ['src/domain/**'], intentPrefixes: ['Core.'] }],
        rules: [],
      })}\n`
    );
    return root;
  }

  it('status reads the named config', () => {
    const root = customConfigFixture();
    const status = run(ARK, ['status', '--root', root, '--config', 'custom.config.json', '--json']);
    expect(status.status, status.stderr).toBe(0);
    const manifest = JSON.parse(status.stdout);
    expect(manifest.projectIdentity.resolvedConfigPath).toMatch(/custom\.config\.json$/);
    expect(manifest.contract).toBeUndefined();
  });

  it('agents-md projects the named config layers', () => {
    const root = customConfigFixture();
    const projection = run(ARK, ['agents-md', '--root', root, '--config', 'custom.config.json', '--stdout']);
    expect(projection.status, projection.stderr).toBe(0);
    expect(projection.stdout).toContain('CoreLayer');
    expect(projection.stdout).not.toMatch(/No project layers loaded/);
  });

  it('commands that do not read --config still reject it', () => {
    const root = customConfigFixture();
    const start = run(ARK, ['start', '--root', root, '--config', 'x.json']);
    expect(start.status).toBe(2);
    expect(start.stderr).toMatch(/--config is supported by ark preflight, ark status, and ark agents-md/);
  });
});

describe('invalid contract honesty', () => {
  function invalidConfigFixture() {
    const root = tempRoot('ark-invalid-config-');
    write(root, 'src/domain/a.ts', 'export const a = 1;\n');
    write(
      root,
      'ark.config.json',
      `${JSON.stringify({
        include: ['src'],
        layers: [{ name: 'Core', patterns: ['src/domain/**'], forbiddenGlobal: ['fetch'] }],
        rules: [],
      })}\n`
    );
    return root;
  }

  it('status reports contract invalid and fix-config as the next action', () => {
    const root = invalidConfigFixture();
    const status = run(ARK, ['status', '--root', root, '--json']);
    expect(status.status, status.stderr).toBe(0);
    const manifest = JSON.parse(status.stdout);
    expect(manifest.contract).toEqual({
      valid: false,
      errors: ['$.layers[0].forbiddenGlobal: unknown field'],
    });
    expect(manifest.nextAction.id).toBe('fix-config');
    const human = run(ARK, ['status', '--root', root]);
    expect(human.stdout).toMatch(/contract: invalid/);
  });

  it('ark-check --json and --doctor --json print a CONFIG_INVALID envelope on stdout', () => {
    const root = invalidConfigFixture();
    for (const extra of [[], ['--doctor']]) {
      const check = run(ARK_CHECK, ['--root', root, '--config', 'ark.config.json', ...extra, '--json']);
      expect(check.status).toBe(2);
      expect(JSON.parse(check.stdout)).toMatchObject({
        ok: false,
        error: 'CONFIG_INVALID',
        messages: ['$.layers[0].forbiddenGlobal: unknown field'],
      });
    }
  });
});

describe('help and install output truth', () => {
  it('--tools help lists every accepted host and says unknown hosts are rejected', () => {
    const help = setupUsageAll();
    const toolsLine = help.split('\n').find((line) => line.trimStart().startsWith('--tools'));
    for (const tool of KNOWN_TOOLS) expect(toolsLine).toContain(tool);
    // start accepts exactly one host; a comma list is refused, so help must not invite one.
    expect(toolsLine).toMatch(/One active agent host for start/);
    expect(toolsLine).not.toMatch(/comma-separated|host\(s\)/);
    expect(help).toMatch(/a list or an unknown host is rejected \(exit 2\)/);
    expect(help).not.toMatch(/unknown host creates only the shared compact router/);
  });

  it('--codex-home does not claim a refresh when the project catalog skipped the home write', () => {
    const root = tempRoot('ark-codex-home-');
    write(root, 'package.json', `${JSON.stringify({ name: 'codex-home' })}\n`);
    write(root, 'src/a.ts', 'export const a = 1;\n');
    const home = tempRoot('ark-codex-home-dir-');
    const env = { HOME: home, CODEX_HOME: path.join(home, '.codex') };
    const catalog = run(ARK_CHECK, ['--root', root, '--install-agent-gates', '--skills-only'], env);
    expect(catalog.status, catalog.stderr).toBe(0);
    const homeRun = run(ARK_CHECK, ['--root', root, '--install-agent-gates', '--skills-only', '--codex-home'], env);
    expect(homeRun.status, homeRun.stderr).toBe(0);
    expect(homeRun.stdout).toMatch(/Skip home write/);
    expect(homeRun.stdout).not.toMatch(/Codex: refreshed home skills/);
    expect(homeRun.stdout).toMatch(/Codex: home skills not written/);
  });
});

describe('starter ArkRules ids', () => {
  it('two adapter layers get unique rule ids, so --promote <id> --apply works', () => {
    const root = tempRoot('ark-arkrules-ids-');
    write(root, 'package.json', `${JSON.stringify({ name: 'arkrules-ids' })}\n`);
    write(root, 'src/domain/a.ts', 'export const a = 1;\n');
    write(root, 'src/application/b.ts', 'export const b = 1;\n');
    write(root, 'src/adapters/persistence/c.ts', 'export const c = 1;\n');
    const applied = run(ARK, [
      'start',
      '--root',
      root,
      '--preset',
      'hexagonal',
      '--apply',
      '--yes',
      '--no-install',
      '--tools',
      'claude',
    ]);
    expect(applied.status, applied.stderr).toBe(0);
    const dir = path.join(root, 'arkrules');
    const ids: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const rule of [...(doc.structure ?? []), ...(doc.invariants ?? [])]) ids.push(rule.id);
    }
    expect(ids).toContain('thin-persistence-adapter');
    expect(ids).toContain('thin-presentation-adapter');
    expect(new Set(ids).size).toBe(ids.length);
    const promoted = run(ARK_CHECK, ['--root', root, '--promote', 'thin-persistence-adapter', '--apply']);
    expect(promoted.status, `${promoted.stdout}${promoted.stderr}`).toBe(0);
  });
});
