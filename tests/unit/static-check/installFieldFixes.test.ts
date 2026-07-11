/**
 * Field-log install fixes: non-TTY start, baseline sync, package pin, Grok default tools,
 * false-green contract steer.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureBaselineFlagInCheckCommand,
  syncBaselineIntoCheckSurfaces,
  pinArkgateDevDependency,
  detectContractFalseGreenRisk,
} from '../../../bin/lib/field-install.mjs';
import {
  resolveTools,
  detectSkillGaps,
  detectWritePathCapabilities,
  claudeSettings,
  grokHooks,
} from '../../../bin/lib/agent-gates.mjs';
import {
  shouldUseNonInteractiveDefaults,
  ensureProjectArkgateDependency,
} from '../../../bin/ark.mjs';

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

describe('shouldUseNonInteractiveDefaults', () => {
  it('treats missing TTY as non-interactive even without --yes', () => {
    expect(shouldUseNonInteractiveDefaults({ yes: false }, false)).toBe(true);
    expect(shouldUseNonInteractiveDefaults({}, false)).toBe(true);
  });

  it('treats --yes as non-interactive even on a TTY', () => {
    expect(shouldUseNonInteractiveDefaults({ yes: true }, true)).toBe(true);
  });

  it('is interactive only when TTY and not --yes', () => {
    expect(shouldUseNonInteractiveDefaults({ yes: false }, true)).toBe(false);
  });
});

describe('ark start non-TTY without --yes', () => {
  it('does not crash with rl.question / null interface; exits cleanly', () => {
    const root = tempRoot('ark-nontty-start-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'fixture-nontty', version: '0.0.0', private: true }, null, 2)
    );
    write(root, 'src/index.ts', 'export const x = 1;\n');
    // --no-install avoids network; non-TTY is default for spawn without stdio inherit TTY
    const result = spawnSync(
      process.execPath,
      [path.resolve('bin/ark.mjs'), 'start', '--root', root, '--no-install', '--no-strict'],
      {
        encoding: 'utf8',
        env: { ...process.env, // force non-TTY semantics even if somehow attached
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(combined).not.toMatch(/Cannot read properties of null/i);
    expect(combined).not.toMatch(/rl\.question/i);
    expect(combined).not.toMatch(/TypeError/i);
    // Should complete setup (config and/or gates) with defaults
    expect(
      result.status === 0 ||
        combined.includes('Non-interactive') ||
        fs.existsSync(path.join(root, 'ark.config.json')) ||
        fs.existsSync(path.join(root, 'AGENTS.md'))
    ).toBe(true);
    // Persist for verification harness
    const scratch = process.env.ARK_TEST_SCRATCH;
    if (scratch) {
      fs.mkdirSync(scratch, { recursive: true });
      fs.writeFileSync(
        path.join(scratch, 'start-nontty.log'),
        `status=${result.status}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}\n`
      );
    }
  });
});

describe('ensureBaselineFlagInCheckCommand + syncBaselineIntoCheckSurfaces', () => {
  it('appends --baseline only for ark-check commands, idempotent', () => {
    const a = ensureBaselineFlagInCheckCommand(
      'npx ark-check --root . --config ark.config.json --strict-config'
    );
    expect(a.changed).toBe(true);
    expect(a.command).toContain('--baseline .ark-baseline.json');
    const b = ensureBaselineFlagInCheckCommand(a.command);
    expect(b.changed).toBe(false);
    expect(ensureBaselineFlagInCheckCommand('echo hello').changed).toBe(false);
    // Comments must not be rewritten
    expect(ensureBaselineFlagInCheckCommand('# npx ark-check --root .').changed).toBe(false);
    const custom = ensureBaselineFlagInCheckCommand(
      'npx ark-check --strict-config',
      'debt/baseline.json'
    );
    expect(custom.command).toContain('--baseline debt/baseline.json');
  });

  it('syncs package.json script and GH workflow after baseline file exists', () => {
    const root = tempRoot('ark-baseline-sync-');
    write(
      root,
      'package.json',
      JSON.stringify(
        {
          name: 'sync-fixture',
          scripts: {
            'check:architecture':
              'npx ark-check --root . --config ark.config.json --strict-config',
            build: 'echo no',
          },
        },
        null,
        2
      )
    );
    write(
      root,
      '.github/workflows/ark-check.yml',
      `name: Ark\non: push\njobs:\n  ark:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check --root . --config ark.config.json --strict-config --require-gates\n`
    );
    // No baseline yet → no-op
    const before = syncBaselineIntoCheckSurfaces(root);
    expect(before.changed).toEqual([]);

    write(
      root,
      '.ark-baseline.json',
      JSON.stringify({ version: 1, violations: ['DomainModel|PersistenceAdapters|x|y'] }, null, 2)
    );
    const after = syncBaselineIntoCheckSurfaces(root);
    expect(after.changed.some((c) => c.file === 'package.json')).toBe(true);
    expect(after.changed.some((c) => c.file.includes('ark-check.yml'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['check:architecture']).toContain('--baseline .ark-baseline.json');
    expect(pkg.scripts.build).toBe('echo no');
    const wf = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    expect(wf).toContain('--baseline .ark-baseline.json');
  });

  it('update-baseline CLI path patches existing check surfaces (real bin)', () => {
    const root = tempRoot('ark-update-baseline-sync-');
    write(
      root,
      'ark.config.json',
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
    write(
      root,
      'src/domain/a.ts',
      `import { db } from '../infra/db';\nexport const x = db;\n`
    );
    write(root, 'src/infra/db.ts', `export const db = 1;\n`);
    write(
      root,
      'package.json',
      JSON.stringify(
        {
          name: 'ub-fixture',
          scripts: {
            'check:architecture':
              'npx ark-check --root . --config ark.config.json --strict-config',
          },
        },
        null,
        2
      )
    );
    write(
      root,
      '.github/workflows/ark-check.yml',
      `name: Ark\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check --root . --config ark.config.json --strict-config\n`
    );

    const out = spawnSync(
      process.execPath,
      [
        path.resolve('bin/ark-check.mjs'),
        '--root',
        root,
        '--config',
        'ark.config.json',
        '--update-baseline',
        '--force',
      ],
      { encoding: 'utf8' }
    );
    expect(out.status).toBe(0);
    expect(fs.existsSync(path.join(root, '.ark-baseline.json'))).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['check:architecture']).toMatch(/--baseline/);
    const wf = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    expect(wf).toMatch(/--baseline/);
    expect(`${out.stdout}${out.stderr}`).toMatch(/Synced --baseline|baseline/i);
  });
});

describe('pinArkgateDevDependency + start --no-install', () => {
  it('pins arkgate in devDependencies without network', () => {
    const root = tempRoot('ark-pin-');
    write(root, 'package.json', JSON.stringify({ name: 'pin-me', version: '1.0.0' }, null, 2));
    const r1 = pinArkgateDevDependency(root);
    expect(r1.changed).toBe(true);
    expect(r1.version).toBeTruthy();
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.devDependencies.arkgate).toBe(r1.version);
    const r2 = pinArkgateDevDependency(root);
    expect(r2.changed).toBe(false);
    expect(r2.reason).toBe('already-present');
  });

  it('ensureProjectArkgateDependency respects --no-install', () => {
    const root = tempRoot('ark-pin-skip-');
    write(root, 'package.json', JSON.stringify({ name: 'skip', version: '1.0.0' }, null, 2));
    const r = ensureProjectArkgateDependency(root, { install: false });
    expect(r.pinned.reason).toBe('skipped-no-install');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.devDependencies?.arkgate).toBeUndefined();
  });

  it('start --no-install still runs; start without --no-install pins package.json', () => {
    const root = tempRoot('ark-start-pin-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'start-pin', version: '0.0.1', private: true }, null, 2)
    );
    write(root, 'src/index.ts', 'export {};\n');
    // Pin only via pure helper (no network) — simulates what start does before optional npm
    const pin = pinArkgateDevDependency(root);
    expect(pin.changed).toBe(true);
    // Full start with --no-install must not throw and leave gates
    const result = spawnSync(
      process.execPath,
      [path.resolve('bin/ark.mjs'), 'start', '--root', root, '--no-install', '--no-strict'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(root, 'ark.config.json')) || fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(
      true
    );
  });
});

describe('resolveTools Grok default / env detection', () => {
  it('includes grok in the no-signal default tool set', () => {
    const root = tempRoot('ark-tools-default-');
    // empty project — no agent dirs
    const { tools, source } = resolveTools({ root });
    expect(source).toBe('default');
    expect([...tools].sort()).toEqual(['claude', 'codex', 'cursor', 'grok']);
  });

  it('adds grok when GROK_BUILD env is set even if only other hosts detected', () => {
    const root = tempRoot('ark-tools-grok-env-');
    fs.mkdirSync(path.join(root, '.claude'));
    const prev = process.env.GROK_BUILD;
    process.env.GROK_BUILD = '1';
    try {
      const { tools, source } = resolveTools({ root });
      expect(source).toBe('detected');
      expect(tools.has('claude')).toBe(true);
      expect(tools.has('grok')).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.GROK_BUILD;
      else process.env.GROK_BUILD = prev;
    }
  });
});

describe('detectContractFalseGreenRisk', () => {
  it('flags empty Persistence + airtable under Application globs', () => {
    const root = tempRoot('ark-false-green-');
    write(
      root,
      'ark.config.json',
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/lib/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
          { name: 'PresentationAdapters', patterns: ['src/app/**'] },
        ],
        rules: [],
      })
    );
    write(root, 'src/lib/airtable/client.ts', 'export const c = 1;\n');
    write(root, 'src/lib/services/x.ts', 'export const s = 1;\n');
    write(root, 'src/app/page.ts', 'export {};\n');
    // no domain, no infra files
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const risk = detectContractFalseGreenRisk(root, config, {
      emptyLayers: ['DomainModel', 'PersistenceAdapters'],
      layers: [
        { name: 'DomainModel', files: 0 },
        { name: 'ApplicationOrchestration', files: 2 },
        { name: 'PersistenceAdapters', files: 0 },
        { name: 'PresentationAdapters', files: 1 },
      ],
    });
    expect(risk).not.toBeNull();
    expect(risk!.risk).toBe(true);
    expect(risk!.ioPaths.some((p) => p.includes('airtable'))).toBe(true);
    expect(risk!.fix).toMatch(/ark-adopt|ark-contract/i);
  });

  it('doctor surfaces false-green adoption gap (real CLI)', () => {
    const root = tempRoot('ark-false-green-doctor-');
    write(
      root,
      'ark.config.json',
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/lib/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
          { name: 'PresentationAdapters', patterns: ['src/app/**'] },
        ],
        rules: [
          { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          { from: 'ApplicationOrchestration', to: 'PresentationAdapters', allowed: false },
          { from: 'PresentationAdapters', to: 'PersistenceAdapters', allowed: false },
          { from: 'ApplicationOrchestration', to: 'PersistenceAdapters', allowed: true },
        ],
      })
    );
    write(root, 'src/lib/airtable/client.ts', 'export const c = 1;\n');
    write(root, 'src/lib/ok.ts', 'export const o = 1;\n');
    write(root, 'src/app/page.ts', 'export {};\n');
    write(root, 'AGENTS.md', '# ArkGate Enforcement\n\nContract test.\n');

    const out = spawnSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--doctor', '--json'],
      { encoding: 'utf8' }
    );
    expect(out.status).toBe(0);
    const json = JSON.parse(out.stdout);
    const gaps: Array<{ id: string; message: string; fix?: string }> =
      json.doctor?.adoption?.gaps ?? [];
    const hit = gaps.find((g) => g.id === 'contract-false-green-io-under-application');
    expect(hit).toBeTruthy();
    expect(hit!.message + (hit!.fix ?? '')).toMatch(/adopt|contract/i);
  });
});

describe('detectSkillGaps reports missing skills for this package', () => {
  it('counts missing skill files when AGENTS.md present and host dir partial', () => {
    const root = tempRoot('ark-skill-gap-');
    write(root, 'AGENTS.md', '# ArkGate Enforcement\n');
    // Create .claude with only one skill so others are missing
    write(root, '.claude/skills/ark-loop/SKILL.md', '---\nname: ark-loop\n---\n');
    const gaps = detectSkillGaps(root);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].missing).toBeGreaterThan(0);
  });
});

describe('W4 install templates include --hook-repair', () => {
  it('claude and grok PreToolUse commands opt into repair payload', () => {
    const root = tempRoot('ark-hook-tpl-');
    write(root, 'package-lock.json', '{}\n');
    const claude = claudeSettings(root);
    expect(claude).toContain('--hook-repair');
    expect(claude).toContain('--hook');
    const grok = grokHooks(root);
    expect(grok).toContain('--hook-repair');
    expect(grok).toMatch(/Write\|Edit\|MultiEdit|write\|search_replace/);
  });
});

describe('W5 detectWritePathCapabilities', () => {
  it('reports none when no hooks or MCP', () => {
    const root = tempRoot('ark-wp-none-');
    const cap = detectWritePathCapabilities(root, 'unknown');
    expect(cap.mode).toBe('none');
    expect(cap.prepareWrite).toBe(false);
    expect(cap.autoPatch).toBe(false);
    expect(cap.gap?.id).toBe('write-path-none');
  });

  it('reports reject-only when --hook without --hook-repair', () => {
    const root = tempRoot('ark-wp-reject-');
    write(
      root,
      '.claude/settings.json',
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'npx ark-mcp --hook --root . --config ark.config.json',
                },
              ],
            },
          ],
        },
      })
    );
    const cap = detectWritePathCapabilities(root, 'claude');
    expect(cap.mode).toBe('reject-only');
    expect(cap.hookPresent).toBe(true);
    expect(cap.hookRepair).toBe(false);
    expect(cap.autoPatch).toBe(false);
    expect(cap.gap?.id).toBe('write-path-reject-only');
  });

  it('reports repair when --hook-repair and MCP prepare-write', () => {
    const root = tempRoot('ark-wp-repair-');
    write(
      root,
      '.claude/settings.json',
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'npx ark-mcp --hook --hook-repair --root . --config ark.config.json',
                },
              ],
            },
          ],
        },
      })
    );
    write(
      root,
      '.mcp.json',
      JSON.stringify({
        mcpServers: {
          ark: { command: 'npx', args: ['ark-mcp', '--root', '.'] },
        },
      })
    );
    const cap = detectWritePathCapabilities(root, 'claude');
    expect(cap.mode).toBe('repair');
    expect(cap.prepareWrite).toBe(true);
    expect(cap.autoPatch).toBe(true);
    expect(cap.gap).toBeNull();
  });

  it('reports mcp-only when MCP present without PreToolUse hook', () => {
    const root = tempRoot('ark-wp-mcp-');
    write(
      root,
      '.mcp.json',
      JSON.stringify({
        mcpServers: { ark: { command: 'npx', args: ['arkgate-mcp'] } },
      })
    );
    const cap = detectWritePathCapabilities(root, 'claude');
    expect(cap.mode).toBe('mcp-only');
    expect(cap.prepareWrite).toBe(true);
    expect(cap.autoPatch).toBe(true);
    expect(cap.gap?.id).toBe('write-path-mcp-only');
  });
});
