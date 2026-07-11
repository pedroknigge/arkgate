import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const HOST_ENV_KEYS = [
  'ARK_ACTIVE_HOST',
  'GROK_BUILD',
  'XAI_GROK',
  'GROK_WORKSPACE_ROOT',
  'GROK_SESSION_ID',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_CODE',
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CURSOR_TRACE_ID',
  'CURSOR_AGENT',
  'CURSOR_AGENT_CLI',
  'CODEX_SANDBOX',
  'CODEX_THREAD_ID',
  'CODEX_CI',
  'CODEX_SESSION_ID',
] as const;

function mk(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ark-host-cap-'));
}

function write(root: string, relativePath: string, content: string): void {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeMergeGate(root: string): void {
  write(
    root,
    '.github/workflows/ark-check.yml',
    'name: Ark\njobs:\n  architecture:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run check:architecture\n'
  );
}

function writeHook(root: string, host: 'claude' | 'grok', repair = true): void {
  const relativePath =
    host === 'claude'
      ? '.claude/settings.json'
      : '.grok/hooks/ark-write-gate.json';
  write(
    root,
    relativePath,
    `command: npx arkgate-mcp --hook${repair ? ' --hook-repair' : ''} --root .\n`
  );
}

function writeMcp(root: string, host: 'claude' | 'grok' | 'cursor' | 'codex'): void {
  if (host === 'claude') {
    write(root, '.mcp.json', '{"mcpServers":{"ark":{"command":"npx","args":["arkgate-mcp"]}}}');
    return;
  }
  if (host === 'grok') {
    write(root, '.grok/config.toml', '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\n');
    return;
  }
  if (host === 'cursor') {
    write(root, '.cursor/mcp.json', '{"mcpServers":{"ark":{"command":"npx","args":["arkgate-mcp"]}}}');
    return;
  }
  write(
    root,
    '.codex-home/config.toml',
    `[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp", "--root", "${root}", "--config", "ark.config.json"]\n`
  );
}

function project(result: ReturnType<typeof detectWritePathCapabilities>) {
  const activeInventory = result.inventory.hosts[result.activeHost];
  return {
    activeHost: result.activeHost,
    mode: result.mode,
    capabilities: result.capabilities,
    capabilityEvidence: result.capabilityEvidence,
    inventoryCapabilities: result.inventory.capabilities,
    activeInventory: activeInventory
      ? {
          configured: activeInventory.configured,
          capabilities: activeInventory.capabilities,
        }
      : null,
  };
}

function withCodexHome<T>(root: string, run: () => T): T {
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = path.join(root, '.codex-home');
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
  }
}

function withActiveHost<T>(host: string | null, run: () => T): T {
  const previous = Object.fromEntries(
    HOST_ENV_KEYS.map((key) => [key, process.env[key]])
  );
  for (const key of HOST_ENV_KEYS) delete process.env[key];
  if (host) process.env.ARK_ACTIVE_HOST = host;
  try {
    return run();
  } finally {
    for (const key of HOST_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('active-host write capability model', () => {
  it('keeps stable host-only and unknown JSON snapshots', () => {
    const snapshots: Record<string, unknown> = {};
    for (const host of ['claude', 'grok', 'cursor', 'codex', 'unknown'] as const) {
      const root = mk();
      try {
        writeMergeGate(root);
        if (host === 'claude' || host === 'grok') writeHook(root, host);
        if (host !== 'unknown') writeMcp(root, host);
        if (host === 'unknown') {
          writeHook(root, 'claude');
          writeMcp(root, 'cursor');
        }
        snapshots[host] = withCodexHome(root, () =>
          project(detectWritePathCapabilities(root, host))
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }

    expect(snapshots).toMatchInlineSnapshot(`
      {
        "claude": {
          "activeHost": "claude",
          "activeInventory": {
            "capabilities": {
              "advisory-write": true,
              "hard-write": true,
              "merge-gate": true,
              "repair-payload": true,
            },
            "configured": true,
          },
          "capabilities": {
            "advisory-write": true,
            "hard-write": true,
            "merge-gate": true,
            "repair-payload": true,
          },
          "capabilityEvidence": {
            "advisory-write": [
              ".mcp.json",
            ],
            "hard-write": [
              ".claude/settings.json",
            ],
            "merge-gate": [
              ".github/workflows/ark-check.yml",
            ],
            "repair-payload": [
              ".claude/settings.json",
            ],
          },
          "inventoryCapabilities": {
            "advisory-write": true,
            "hard-write": true,
            "merge-gate": true,
            "repair-payload": true,
          },
          "mode": "repair",
        },
        "codex": {
          "activeHost": "codex",
          "activeInventory": {
            "capabilities": {
              "advisory-write": true,
              "hard-write": false,
              "merge-gate": true,
              "repair-payload": false,
            },
            "configured": true,
          },
          "capabilities": {
            "advisory-write": true,
            "hard-write": false,
            "merge-gate": true,
            "repair-payload": false,
          },
          "capabilityEvidence": {
            "advisory-write": [
              ".codex-home/config.toml",
            ],
            "hard-write": [],
            "merge-gate": [
              ".github/workflows/ark-check.yml",
            ],
            "repair-payload": [],
          },
          "inventoryCapabilities": {
            "advisory-write": true,
            "hard-write": false,
            "merge-gate": true,
            "repair-payload": false,
          },
          "mode": "mcp-only",
        },
        "cursor": {
          "activeHost": "cursor",
          "activeInventory": {
            "capabilities": {
              "advisory-write": true,
              "hard-write": false,
              "merge-gate": true,
              "repair-payload": false,
            },
            "configured": true,
          },
          "capabilities": {
            "advisory-write": true,
            "hard-write": false,
            "merge-gate": true,
            "repair-payload": false,
          },
          "capabilityEvidence": {
            "advisory-write": [
              ".cursor/mcp.json",
            ],
            "hard-write": [],
            "merge-gate": [
              ".github/workflows/ark-check.yml",
            ],
            "repair-payload": [],
          },
          "inventoryCapabilities": {
            "advisory-write": true,
            "hard-write": false,
            "merge-gate": true,
            "repair-payload": false,
          },
          "mode": "mcp-only",
        },
        "grok": {
          "activeHost": "grok",
          "activeInventory": {
            "capabilities": {
              "advisory-write": true,
              "hard-write": true,
              "merge-gate": true,
              "repair-payload": true,
            },
            "configured": true,
          },
          "capabilities": {
            "advisory-write": true,
            "hard-write": true,
            "merge-gate": true,
            "repair-payload": true,
          },
          "capabilityEvidence": {
            "advisory-write": [
              ".grok/config.toml",
            ],
            "hard-write": [
              ".grok/hooks/ark-write-gate.json",
            ],
            "merge-gate": [
              ".github/workflows/ark-check.yml",
            ],
            "repair-payload": [
              ".grok/hooks/ark-write-gate.json",
            ],
          },
          "inventoryCapabilities": {
            "advisory-write": true,
            "hard-write": true,
            "merge-gate": true,
            "repair-payload": true,
          },
          "mode": "repair",
        },
        "unknown": {
          "activeHost": "unknown",
          "activeInventory": null,
          "capabilities": {
            "advisory-write": false,
            "hard-write": false,
            "merge-gate": true,
            "repair-payload": false,
          },
          "capabilityEvidence": {
            "advisory-write": [],
            "hard-write": [],
            "merge-gate": [
              ".github/workflows/ark-check.yml",
            ],
            "repair-payload": [],
          },
          "inventoryCapabilities": {
            "advisory-write": true,
            "hard-write": true,
            "merge-gate": true,
            "repair-payload": true,
          },
          "mode": "none",
        },
      }
    `);
  });

  it('does not inherit Grok hard-write or repair guarantees in a mixed Codex repo', () => {
    const root = mk();
    try {
      writeMergeGate(root);
      writeHook(root, 'grok');
      writeMcp(root, 'grok');
      writeMcp(root, 'cursor');

      const result = withCodexHome(root, () =>
        detectWritePathCapabilities(root, 'codex')
      );

      expect(project(result)).toMatchInlineSnapshot(`
        {
          "activeHost": "codex",
          "activeInventory": {
            "capabilities": {
              "advisory-write": false,
              "hard-write": false,
              "merge-gate": true,
              "repair-payload": false,
            },
            "configured": false,
          },
          "capabilities": {
            "advisory-write": false,
            "hard-write": false,
            "merge-gate": true,
            "repair-payload": false,
          },
          "capabilityEvidence": {
            "advisory-write": [],
            "hard-write": [],
            "merge-gate": [
              ".github/workflows/ark-check.yml",
            ],
            "repair-payload": [],
          },
          "inventoryCapabilities": {
            "advisory-write": true,
            "hard-write": true,
            "merge-gate": true,
            "repair-payload": true,
          },
          "mode": "none",
        }
      `);
      expect(result.inventory.hosts.grok.capabilities).toMatchObject({
        'hard-write': true,
        'repair-payload': true,
      });
      expect(result.gap?.fix).toContain('--install-agent-gates --tools codex');
      expect(result.gap?.fix).not.toContain('--tools claude');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps external Codex configuration as an absolute evidence path', () => {
    const root = mk();
    const codexHome = mk();
    try {
      write(
        codexHome,
        'config.toml',
        `[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp", "--root", "${root}"]\n`
      );
      const previous = process.env.CODEX_HOME;
      process.env.CODEX_HOME = codexHome;
      try {
        const result = detectWritePathCapabilities(root, 'codex');
        expect(result.capabilityEvidence['advisory-write']).toEqual([
          path.join(codexHome, 'config.toml').split(path.sep).join('/'),
        ]);
      } finally {
        if (previous === undefined) delete process.env.CODEX_HOME;
        else process.env.CODEX_HOME = previous;
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it('rejects incomplete or non-Ark Codex MCP tables', () => {
    const root = mk();
    const codexHome = mk();
    try {
      write(
        codexHome,
        'config.toml',
        `[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\n\n` +
          `[mcp_servers.ark_other]\ncommand = "custom"\nargs = ["--root", "${root}"]\n`
      );
      const previous = process.env.CODEX_HOME;
      process.env.CODEX_HOME = codexHome;
      try {
        expect(detectWritePathCapabilities(root, 'codex').capabilities['advisory-write']).toBe(false);

        write(
          codexHome,
          'config.toml',
          `[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\n\n` +
            `[mcp_servers.ark_valid]\ncommand = "npx"\nargs = ["arkgate-mcp", "--root", "${root}"]\n`
        );
        expect(detectWritePathCapabilities(root, 'codex').capabilities['advisory-write']).toBe(true);

        const otherRoot = mk();
        try {
          write(
            codexHome,
            'config.toml',
            `[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp", "--root", "${otherRoot}"]\n`
          );
          expect(detectWritePathCapabilities(root, 'codex').capabilities['advisory-write']).toBe(false);
        } finally {
          fs.rmSync(otherRoot, { recursive: true, force: true });
        }
      } finally {
        if (previous === undefined) delete process.env.CODEX_HOME;
        else process.env.CODEX_HOME = previous;
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it('uses active-host detection only when no explicit host is supplied', () => {
    const root = mk();
    try {
      writeMcp(root, 'cursor');
      expect(
        withActiveHost('cursor', () => detectWritePathCapabilities(root))
      ).toMatchObject({
        activeHost: 'cursor',
        capabilities: { 'advisory-write': true },
      });
      expect(
        withActiveHost(null, () => detectWritePathCapabilities(root))
      ).toMatchObject({
        activeHost: 'unknown',
        capabilities: { 'advisory-write': false },
      });
      expect(
        withActiveHost('cursor', () => detectWritePathCapabilities(root, 'claude'))
      ).toMatchObject({
        activeHost: 'claude',
        capabilities: { 'advisory-write': false },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts intentional whitespace variants without broadening signatures', () => {
    const root = mk();
    try {
      write(root, '.mcp.json', '"ark":{');
      write(
        root,
        '.claude/settings.json',
        'command: arkgate-mcp --hook\nARK_HOOK_REPAIR = true\n'
      );
      expect(detectWritePathCapabilities(root, 'claude')).toMatchObject({
        mode: 'repair',
        capabilities: {
          'hard-write': true,
          'advisory-write': true,
          'repair-payload': true,
        },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports active-host capabilities in doctor JSON and human output', () => {
    const root = mk();
    try {
      writeMergeGate(root);
      writeHook(root, 'grok');
      writeMcp(root, 'grok');
      writeMcp(root, 'cursor');
      write(root, 'AGENTS.md', '# ArkGate Enforcement\n');
      write(root, 'src/domain/value.ts', 'export const value = 1;\n');
      write(
        root,
        'ark.config.json',
        JSON.stringify({
          include: ['src'],
          layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
          rules: [],
        })
      );

      const env = {
        ...process.env,
        CODEX_HOME: path.join(root, '.codex-home'),
        ARK_ACTIVE_HOST: 'codex',
      };
      const jsonRun = spawnSync(
        process.execPath,
        [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
        { cwd: REPO, env, encoding: 'utf8' }
      );
      expect(jsonRun.status).toBe(0);
      const payload = JSON.parse(jsonRun.stdout);
      expect(payload.doctor.writePath.activeHost).toBe('codex');
      expect(payload.doctor.writePath.capabilities['hard-write']).toBe(false);
      expect(payload.doctor.writePath.capabilities['repair-payload']).toBe(false);
      expect(payload.doctor.writePath.inventory.hosts.grok.capabilities['hard-write']).toBe(true);

      write(root, '.mcp.json', '{"mcpServers":{"ark":{"args":["arkgate-mcp"]}}}\n');
      const humanRun = spawnSync(
        process.execPath,
        [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--no-cache'],
        {
          cwd: REPO,
          env: { ...env, ARK_ACTIVE_HOST: 'cursor' },
          encoding: 'utf8',
        }
      );
      expect(humanRun.status).toBe(0);
      expect(humanRun.stdout).toContain('Active host: cursor');
      expect(humanRun.stdout).toContain('Hard write boundary: no');
      expect(humanRun.stdout).toContain('Advisory write tools (MCP): yes');
      expect(humanRun.stdout).toContain('CI check (--strict-merge): yes');
      expect(humanRun.stdout).toContain('merge blocking requires a required status');
      expect(humanRun.stdout).toContain('Shared gate files present (AGENTS.md, .mcp.json, CI)');
      expect(humanRun.stdout).not.toContain('Gate files present (AGENTS.md, .mcp.json, CI, write gate)');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
