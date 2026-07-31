import { describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexRuntimeActivation } from '../../../bin/lib/enforcement-state.mjs';
import { codexProjectMcpIsValid } from '../../../bin/lib/codex-home.mjs';
import { inspectCodexInstallActivation } from '../../../bin/lib/install-activation.mjs';
import { renderStartPreview } from '../../../bin/lib/start-preview.mjs';

const ARK_CHECK = path.resolve('bin/ark-check.mjs');

function fixture(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"activation-fixture","private":true}\n');
  return root;
}

function install(root: string) {
  return spawnSync(
    process.execPath,
    [ARK_CHECK, '--install-agent-gates', '--root', root, '--tools', 'codex'],
    {
      encoding: 'utf8',
      env: { ...process.env, CODEX_HOME: path.join(root, '.codex-home') },
    }
  );
}

function codexToml(command: string, args: string[]) {
  return (
    `[mcp_servers.ark]\ncommand = ${JSON.stringify(command)}\n` +
    `args = [${args.map((value) => JSON.stringify(value)).join(', ')}]\n`
  );
}

describe('WI01 Codex runtime activation truth', () => {
  it('keeps disk configuration separate from runtime identity and activation', () => {
    expect(codexRuntimeActivation({ configuredOnDisk: true })).toEqual({
      configuredOnDisk: true,
      restartRequired: true,
      runtimeObserved: false,
      identityMatch: 'unverified',
      active: false,
    });
    expect(codexRuntimeActivation()).toEqual({
      configuredOnDisk: false,
      restartRequired: false,
      runtimeObserved: false,
      identityMatch: 'unverified',
      active: false,
    });
  });

  it('rejects an echo/lookalike command instead of claiming disk activation', () => {
    const root = fixture('ark-wi-lookalike-');
    try {
      fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
      const toml = codexToml('echo', [
        'arkgate-mcp',
        '--root',
        '.',
        '--config',
        'ark.config.json',
      ]);
      fs.writeFileSync(path.join(root, '.codex', 'config.toml'), toml);
      expect(codexProjectMcpIsValid(toml, root)).toBe(false);
      expect(inspectCodexInstallActivation(root, true)).toMatchObject({
        codexProjectConfigured: false,
        runtimeActivation: {
          configuredOnDisk: false,
          restartRequired: false,
          active: false,
        },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts only supported direct, package-runner, and node launcher shapes', () => {
    const root = '/workspace/current';
    const flags = ['--root', '.', '--config', 'ark.config.json'];
    const valid = [
      ['arkgate-mcp', flags],
      ['/usr/local/bin/ark-mcp', flags],
      ['npx', ['arkgate-mcp', ...flags]],
      ['yarn', ['arkgate-mcp', ...flags]],
      ['pnpm', ['exec', 'arkgate-mcp', ...flags]],
      [
        'pnpm',
        ['--config.verify-deps-before-run=false', 'exec', 'arkgate-mcp', ...flags],
      ],
      ['node', ['bin/ark-mcp.mjs', ...flags]],
    ] as const;
    for (const [command, args] of valid) {
      expect(codexProjectMcpIsValid(codexToml(command, [...args]), root)).toBe(true);
    }

    const invalid = [
      ['custom', ['arkgate-mcp', ...flags]],
      ['npx', ['--yes', 'arkgate-mcp', ...flags]],
      ['pnpm', ['run', 'arkgate-mcp', ...flags]],
      ['node', ['malicious/ark-mcp.mjs', ...flags]],
      ['npx', ['ark-mcp', 'arkgate-mcp', ...flags]],
      ['npx', ['arkgate-mcp', ...flags, '--root', root]],
      ['npx', ['arkgate-mcp', ...flags, '--config', 'other.json']],
    ] as const;
    for (const [command, args] of invalid) {
      expect(codexProjectMcpIsValid(codexToml(command, [...args]), root)).toBe(false);
    }
  });

  it('rejects root, manifest, and compiler-input overrides on project activation', () => {
    const root = '/workspace/current';
    const generated = ['arkgate-mcp', '--root', '.', '--config', 'ark.config.json'];
    const overrides = [
      ['--root-env', 'HOME'],
      ['--manifest', 'other.manifest.json'],
      ['--tsconfig', 'tsconfig.other.json'],
      ['--manifest', 'one.json', '--manifest', 'two.json'],
    ];
    for (const extra of overrides) {
      expect(codexProjectMcpIsValid(codexToml('npx', [...generated, ...extra]), root)).toBe(
        false
      );
    }

    const cwdOverride = codexToml('npx', generated).replace(
      'args =',
      'cwd = "/workspace/other"\nargs ='
    );
    expect(codexProjectMcpIsValid(cwdOverride, root)).toBe(false);
  });

  it('compares Windows root and exact config paths portably', () => {
    const root = 'C:\\Work\\Current';
    const valid = codexToml('C:\\Program Files\\nodejs\\node.exe', [
      'C:\\Tools\\arkgate\\bin\\ark-mcp.mjs',
      '--root',
      'c:\\work\\current',
      '--config',
      'C:\\WORK\\CURRENT\\ark.config.json',
    ]);
    expect(codexProjectMcpIsValid(valid, root)).toBe(true);
    expect(
      codexProjectMcpIsValid(
        codexToml('npx.cmd', [
          'arkgate-mcp.cmd',
          '--root',
          'C:\\Work\\Other',
          '--config',
          'C:\\Work\\Current\\ark.config.json',
        ]),
        root
      )
    ).toBe(false);
    expect(
      codexProjectMcpIsValid(
        codexToml('npx.cmd', [
          'arkgate-mcp.cmd',
          '--root',
          '.',
          '--config',
          'C:\\Work\\Other\\ark.config.json',
        ]),
        root
      )
    ).toBe(false);
  });

  it('reports project-scoped Codex config as configured but runtime-unverified', () => {
    const root = fixture('ark-wi-activation-');
    try {
      fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.codex', 'config.toml'),
        '[features]\nweb_search = true\n'
      );

      const result = install(root);
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.stdout).toContain('CODEX MCP CONFIGURED — RUNTIME NOT VERIFIED');
      expect(result.stdout).toContain(
        '"configuredOnDisk":true,"restartRequired":true,"runtimeObserved":false,"identityMatch":"unverified","active":false'
      );
      expect(result.stdout).toContain(
        `ark_identity with expectedRoot "${path.resolve(root)}"`
      );
      expect(result.stdout).toMatch(/Do not trust MCP verdicts before the project identity matches/i);

      const toml = fs.readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8');
      expect(toml).toContain('[features]\nweb_search = true');
      expect(toml).toContain('[mcp_servers.ark]');
      expect(toml).toMatch(/CONFIGURED ON DISK — RUNTIME NOT VERIFIED/);
      expect(toml.match(/\[mcp_servers\.ark\]/g)).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('renders the compact-start restart and identity handshake warning', () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((value = '') => {
      lines.push(String(value));
    });
    try {
      renderStartPreview({
        root: '/workspace/current',
        changes: [],
        analysis: null,
        projectedCoverage: { percent: 100, classifiedFiles: 1, totalFiles: 1 },
        setupBudget: {
          files: 0,
          gateFiles: 0,
          arkrulesFiles: 0,
          bytes: 0,
          maxFiles: 8,
          maxBytes: 32 * 1024,
          ok: true,
        },
        commands: [],
        hostGuarantees: [],
        unresolvedDecisions: [],
        runtimeActivation: codexRuntimeActivation({ configuredOnDisk: true }),
      });
    } finally {
      log.mockRestore();
    }
    const output = lines.join('\n');
    expect(output).toContain('Codex MCP CONFIGURED — RUNTIME NOT VERIFIED');
    expect(output).toContain('ark_identity with expectedRoot "/workspace/current"');
    expect(output).toMatch(/Do not trust MCP verdicts before the project identity matches/i);
  });

  it('headlines a recoverable partial install and does not roll back successful writes', () => {
    const root = fixture('ark-wi-partial-');
    try {
      fs.mkdirSync(path.join(root, '.codex', 'config.toml'), { recursive: true });

      const result = install(root);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status).toBe(1);
      expect(output).toContain('INSTALL PARTIAL');
      expect(output).toContain('Written:');
      expect(output).toContain('.codex/hooks.json');
      expect(output).toContain('Failed:');
      expect(output).toContain('.codex/config.toml');
      expect(output).toContain('Recovery:');
      expect(output).toMatch(/no destructive rollback was attempted/i);
      expect(output).not.toContain('Next steps:');
      expect(fs.existsSync(path.join(root, '.codex', 'hooks.json'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
