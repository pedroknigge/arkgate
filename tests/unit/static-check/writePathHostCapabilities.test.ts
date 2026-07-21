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
  'GROK_AGENT',
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
    'name: Ark\njobs:\n  architecture:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check --strict-merge\n'
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
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher:
              host === 'grok'
                ? 'Write|Edit|MultiEdit|write|search_replace'
                : 'Write|Edit|MultiEdit',
            hooks: [
              {
                type: 'command',
                command: `npx arkgate-mcp --hook${repair ? ' --hook-repair' : ''} --root .`,
              },
            ],
          },
        ],
      },
    })
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
      expect(result.gap).toEqual({
        id: 'write-path-none',
        severity: 'warn',
        message:
          'Active host codex has no hard write boundary or advisory Ark MCP. ' +
          'The CI check remains separate and does not block local writes.',
        fix: 'npx ark-check --install-agent-gates --tools codex',
      });
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

  it('prefers project-scoped Codex MCP evidence over an unrelated home primary', () => {
    const root = mk();
    const codexHome = mk();
    try {
      write(
        root,
        '.codex/config.toml',
        '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp", "--root", ".", "--config", "ark.config.json"]\n'
      );
      write(
        codexHome,
        'config.toml',
        '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp", "--root", "/another/project"]\n'
      );
      const previous = process.env.CODEX_HOME;
      process.env.CODEX_HOME = codexHome;
      try {
        const result = detectWritePathCapabilities(root, 'codex');
        expect(result.capabilities['advisory-write']).toBe(true);
        expect(result.capabilityEvidence['advisory-write']).toEqual(['.codex/config.toml']);
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
          root,
          '.codex/config.toml',
          `[mcp_servers.ark_local]\ncommand = "npx"\nargs = ["arkgate-mcp", "--root", ".", "--config", "ark.config.json"]\n`
        );
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

  it('does not infer Codex project scope from TOML comments', () => {
    const root = mk();
    const codexHome = mk();
    try {
      write(
        root,
        '.codex/config.toml',
        '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\n' +
          '# args = ["arkgate-mcp", "--root", ".", "--config", "ark.config.json"]\n'
      );
      write(
        codexHome,
        'config.toml',
        '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\n' +
          `# args = ["arkgate-mcp", "--root", "${root}"]\n`
      );
      const previous = process.env.CODEX_HOME;
      process.env.CODEX_HOME = codexHome;
      try {
        expect(detectWritePathCapabilities(root, 'codex')).toMatchObject({
          mode: 'none',
          capabilities: { 'advisory-write': false },
          capabilityEvidence: { 'advisory-write': [] },
        });
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
      write(
        root,
        '.mcp.json',
        '{ "mcpServers" : { "ark" : { "command" : "npx", "args" : [ "arkgate-mcp" ] } } }'
      );
      write(
        root,
        '.claude/settings.json',
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  { command: 'ARK_HOOK_REPAIR=true arkgate-mcp --hook' },
                ],
              },
            ],
          },
        })
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

  it('rejects an npx MCP declaration without an ArkGate binary argument', () => {
    const root = mk();
    try {
      write(root, '.mcp.json', '{"mcpServers":{"ark":{"command":"npx"}}}');
      expect(detectWritePathCapabilities(root, 'claude')).toMatchObject({
        capabilities: { 'advisory-write': false },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps observed pre-tool coverage and CI-required evidence fail-closed', () => {
    const root = mk();
    try {
      const complete = detectWritePathCapabilities(root, 'grok', {
        boundary: 'pre-tool',
        operation: 'write',
        completePatch: true,
      });
      expect(complete.enforcementLadder.localWrite).toMatchObject({
        installed: true,
        active: true,
        bypassable: false,
        hard: true,
        completePatch: true,
        coverage: 'complete-patch',
        operation: 'write',
        operationCovered: true,
      });
      expect(complete.enforcementLadder.ciMerge).toMatchObject({
        bypassable: 'unknown',
        requiredStatus: 'unverified',
      });

      const unsupported = detectWritePathCapabilities(root, 'grok', {
        boundary: 'pre-tool',
        operation: 'Bash',
        completePatch: true,
      });
      expect(unsupported.enforcementLadder.localWrite).toMatchObject({
        active: false,
        bypassable: true,
        hard: false,
        completePatch: false,
        operationCovered: false,
      });

      expect(() =>
        detectWritePathCapabilities(root, 'grok', {
          boundary: 'pre-tool',
          operation: 42,
          completePatch: true,
        })
      ).not.toThrow();
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

      write(
        root,
        '.mcp.json',
        '{"mcpServers":{"ark":{"command":"npx","args":["arkgate-mcp"]}}}\n'
      );
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
      expect(humanRun.stdout).toContain(
        'Local write — supported: no · analyzed: yes · configured: no · installed: no · runtime observed: no · operation: none · operation covered: unverified · active: no · bypassable: yes · required: unverified · hard: no'
      );
      expect(humanRun.stdout).toContain(
        'Advisory MCP — supported: yes · analyzed: yes · configured: yes · installed: no · runtime observed: no · operation: none · operation covered: unverified · active: no · bypassable: yes · required: unverified · hard: no'
      );
      expect(humanRun.stdout).toContain(
        'CI merge — supported: yes · analyzed: yes · configured: yes · installed: no · runtime observed: no · operation: merge · operation covered: unverified · active: no · bypassable: unverified · required: unverified · hard: no'
      );
      expect(humanRun.stdout).toContain('Shared gate files present (AGENTS.md, .mcp.json, CI)');
      expect(humanRun.stdout).not.toContain('Gate files present (AGENTS.md, .mcp.json, CI, write gate)');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
