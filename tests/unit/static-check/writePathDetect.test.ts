/**
 * Exercises shipped write-path-detect (doctor W5) and deny→repair via real bin/ark-mcp.mjs.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectWritePathCapabilities,
} from '../../../bin/lib/write-path-detect.mjs';
// Re-export surface used by doctor / install callers
import { detectWritePathCapabilities as fromAgentGates } from '../../../bin/lib/agent-gates.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SHIPPED_MCP = path.join(REPO, 'bin', 'ark-mcp.mjs');

function mk(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ark-wpd-'));
}

describe('detectWritePathCapabilities (shipped write-path-detect.mjs)', () => {
  it('re-exports the same function from agent-gates', () => {
    expect(fromAgentGates).toBe(detectWritePathCapabilities);
  });

  it('returns none when no hooks or MCP are installed', () => {
    const root = mk();
    try {
      const cap = detectWritePathCapabilities(root, 'unknown');
      expect(cap.mode).toBe('none');
      expect(cap.hookPresent).toBe(false);
      expect(cap.mcpPresent).toBe(false);
      expect(cap.autoPatch).toBe(false);
      expect(cap.capabilities['merge-gate']).toBe(false);
      expect(cap.gap?.id).toBe('write-path-none');
      expect(cap.gap?.fix).toContain(
        '--install-agent-gates --tools claude,grok,cursor,codex'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not open write-path-none when host is unknown but inventory has write gates', () => {
    // Report/CI path: npx ark-check --report with no agent env → activeHost unknown.
    // Hooks on disk must not become a false adoption gap.
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.grok', 'hooks'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.grok', 'hooks', 'ark-write-gate.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  {
                    command:
                      'npx arkgate-mcp --hook --hook-repair --root . --config ark.config.json',
                  },
                ],
              },
            ],
          },
        })
      );
      fs.writeFileSync(
        path.join(root, '.grok', 'config.toml'),
        '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\n'
      );
      const cap = detectWritePathCapabilities(root, 'unknown');
      expect(cap.activeHost).toBe('unknown');
      expect(cap.mode).toBe('none'); // session projection: not a guarantee for this process
      expect(cap.inventory.hosts.grok.configured).toBe(true);
      expect(cap.inventory.capabilities['hard-write']).toBe(true);
      expect(cap.gap).toBeNull();
      // Inventory vs this-invocation: sessionNote lists on-disk hosts; hard never from assets alone.
      expect(cap.sessionNote).toMatch(/On-disk hosts with write-path assets: grok/i);
      expect(cap.sessionNote).toMatch(/activeHost unknown/i);
      expect(cap.enforcementState.localWrite.hard).toBe(false);
      expect(cap.enforcementState.localWrite.runtimeObserved).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('classifies reject-only when hook has --hook without --hook-repair', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude', 'settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  {
                    command: 'npx arkgate-mcp --hook --root . --config ark.config.json',
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
      expect(cap.inventory.hosts.claude.configured).toBe(true);
      expect(cap.gap).toEqual({
        id: 'write-path-reject-only',
        severity: 'info',
        message:
          'Active host claude has a hard write boundary without a repair payload. ' +
          'Install its MCP surface or enable hook repair for guided re-entry.',
        fix: 'npx ark-check --install-agent-gates --tools claude --force',
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('classifies repair when installed hooks include --hook-repair', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.grok', 'hooks'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.grok', 'hooks', 'ark-write-gate.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  {
                    command:
                      'node bin/ark-mcp.mjs --hook --hook-repair --root . --config ark.config.json',
                  },
                ],
              },
            ],
          },
        })
      );
      fs.writeFileSync(
        path.join(root, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            ark: { command: 'npx', args: ['arkgate-mcp', '--root', '.'] },
          },
        })
      );
      fs.writeFileSync(
        path.join(root, '.grok', 'config.toml'),
        '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\n'
      );
      const cap = detectWritePathCapabilities(root, 'grok');
      expect(cap.mode).toBe('repair');
      expect(cap.hookRepair).toBe(true);
      expect(cap.prepareWrite).toBe(true);
      expect(cap.autoPatch).toBe(true);
      expect(cap.gap).toBeNull();
      expect(cap.evidence).toContain('.grok/hooks/ark-write-gate.json');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('classifies mcp-only when MCP is wired without a write hook', () => {
    const root = mk();
    try {
      fs.writeFileSync(
        path.join(root, '.mcp.json'),
        JSON.stringify({
          mcpServers: { ark: { command: 'npx', args: ['arkgate-mcp'] } },
        })
      );
      const cap = detectWritePathCapabilities(root, 'claude');
      expect(cap.mode).toBe('mcp-only');
      expect(cap.gap).toEqual({
        id: 'write-path-mcp-only',
        severity: 'info',
        host: 'claude',
        message:
          'Active host claude has advisory prepare-write/autoPatch tools, ' +
          'but no hard write boundary; CI can report failure, while merge blocking requires provider policy.',
        fix: 'npx ark-check --install-agent-gates --tools claude',
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects a prefixed ARK_HOOK_REPAIR environment without an MCP config', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude', 'settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                hooks: [{ command: 'ARK_HOOK_REPAIR=yes node bin/ark-mcp.mjs --hook --root .' }],
              },
            ],
          },
        })
      );
      const cap = detectWritePathCapabilities(root, 'claude');
      expect(cap.hookPresent).toBe(true);
      expect(cap.hookRepair).toBe(true);
      expect(cap.mcpPresent).toBe(false);
      expect(cap.autoPatch).toBe(true);
      expect(cap.mode).toBe('repair');
      expect(cap.evidence).toEqual(['.claude/settings.json']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not infer capabilities from unrelated hook or MCP content', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{"hooks":[]}');
      fs.writeFileSync(path.join(root, '.mcp.json'), '"ark"junk: {');

      expect(detectWritePathCapabilities(root, 'claude')).toMatchObject({
        mode: 'none',
        hookPresent: false,
        hookRepair: false,
        mcpPresent: false,
        evidence: [],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects each supported MCP config structure independently', () => {
    const cases = [
      {
        host: 'claude',
        rel: '.mcp.json',
        text: JSON.stringify({ mcpServers: { ark: { command: 'npx', args: ['arkgate-mcp'] } } }),
      },
      {
        host: 'grok',
        rel: '.grok/config.toml',
        text: '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\n',
      },
      {
        host: 'grok',
        rel: '.grok/config.toml',
        text: "[mcp_servers.ark]\ncommand = 'pnpm'\nargs = ['exec', 'arkgate-mcp']\n",
      },
      {
        host: 'cursor',
        rel: '.cursor/mcp.json',
        text: JSON.stringify({ mcpServers: { ark: { command: 'ark-mcp', args: [] } } }),
      },
      {
        host: 'claude',
        rel: '.mcp.json',
        text: JSON.stringify({ mcpServers: { ark: { command: 'arkgate-mcp' } } }),
      },
      {
        host: 'claude',
        rel: '.mcp.json',
        text: JSON.stringify({
          mcpServers: {
            ark: {
              command: 'pnpm',
              args: ['--config.verify-deps-before-run=false', 'exec', 'arkgate-mcp'],
            },
          },
        }),
      },
      {
        host: 'claude',
        rel: '.mcp.json',
        text: JSON.stringify({
          mcpServers: { ark: { command: 'node', args: ['bin/ark-mcp.mjs'] } },
        }),
      },
      {
        host: 'grok',
        rel: '.grok/config.toml',
        text: '["mcp_servers" . "ark"]\ncommand = "node"\nargs = ["bin/ark-mcp.mjs"]\n',
      },
      {
        host: 'claude',
        rel: '.mcp.json',
        text: JSON.stringify({
          mcpServers: { ark: { command: ' /usr/bin/npx ', args: [' arkgate-mcp '] } },
        }),
      },
      {
        host: 'claude',
        rel: '.mcp.json',
        text: JSON.stringify({
          mcpServers: { ark: { command: 'C:\\tools\\arkgate-mcp', args: [] } },
        }),
      },
      {
        host: 'claude',
        rel: '.mcp.json',
        text: JSON.stringify({
          mcpServers: { ark: { command: 'node', args: ['C:\\repo\\bin\\ark-mcp.mjs'] } },
        }),
      },
    ];

    for (const { host, rel, text } of cases) {
      const root = mk();
      try {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);

        expect(detectWritePathCapabilities(root, host)).toMatchObject({
          mode: 'mcp-only',
          prepareWrite: true,
          autoPatch: true,
          hookPresent: false,
          mcpPresent: true,
          evidence: [rel],
        });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('rejects Ark words outside real hook and MCP wiring', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        JSON.stringify({
          note: '--hook arkgate-mcp',
          hooks: {
            PreToolUse: [
              {
                matcher: 'Write|Edit|MultiEdit',
                hooks: [{ command: 'echo arkgate-mcp --hook' }],
              },
            ],
          },
        })
      );
      fs.writeFileSync(
        path.join(root, '.mcp.json'),
        JSON.stringify({
          note: 'arkgate-mcp',
          mcpServers: { ark: { command: 'custom', args: [] } },
        })
      );

      expect(detectWritePathCapabilities(root, 'claude')).toMatchObject({
        mode: 'none',
        hookPresent: false,
        mcpPresent: false,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects incomplete MCP argv and does not combine hook evidence', () => {
    const invalidServers = [
      { args: ['arkgate-mcp'] },
      { command: 'custom', args: ['arkgate-mcp'] },
      { command: 'npx', args: ['ark-mcp', 'arkgate-mcp'] },
      { command: 'pnpm', args: ['run', 'not-ark', 'exec', 'arkgate-mcp'] },
      { command: 'pnpm', args: ['dlx', 'other', 'exec', 'arkgate-mcp'] },
      { command: 'node', args: ['malicious/ark-mcp.mjs'] },
      { command: 'node', args: ['bin/ark-mcp.mjs.extra'] },
      { command: 'node', args: [] },
      { command: 'npx', args: 'arkgate-mcp' },
      { command: 'npx', args: ['arkgate-mcp', 42] },
      { command: 'npx', args: ['xarkgate-mcp'] },
      { command: 'npx', args: ['arkgate-mcpx'] },
      { command: 'custom', args: ['exec', 'arkgate-mcp'] },
      { command: 'pnpm', args: ['arkgate-mcp'] },
      {
        command: 'pnpm',
        args: ['--config.verify-deps-before-run=false', 'not-exec', 'arkgate-mcp'],
      },
      { command: 'pnpm', args: ['not-config', 'exec', 'arkgate-mcp'] },
    ];
    for (const server of invalidServers) {
      const root = mk();
      try {
        fs.writeFileSync(
          path.join(root, '.mcp.json'),
          JSON.stringify({ mcpServers: { ark: server } })
        );
        expect(detectWritePathCapabilities(root, 'claude').mcpPresent).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }

    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [{ command: 'npx arkgate-mcp --hook --hook-repair' }],
              },
              {
                matcher: 'Write|Edit|MultiEdit',
                hooks: [
                  { command: 'npx arkgate-mcp --hook' },
                  { command: 'ARK_HOOK_REPAIR=yes arkgate-mcp --session-context' },
                ],
              },
            ],
          },
        })
      );
      expect(detectWritePathCapabilities(root, 'claude')).toMatchObject({
        mode: 'reject-only',
        hookPresent: true,
        hookRepair: false,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not read hook flags after a shell comment or command separator', () => {
    for (const command of [
      'npx arkgate-mcp --session-context # --hook --hook-repair',
      'npx arkgate-mcp --session-context ; echo --hook --hook-repair',
    ]) {
      const root = mk();
      try {
        fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
        fs.writeFileSync(
          path.join(root, '.claude', 'settings.json'),
          JSON.stringify({
            hooks: {
              PreToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [{ command }] }],
            },
          })
        );

        expect(detectWritePathCapabilities(root, 'claude')).toMatchObject({
          mode: 'none',
          hookPresent: false,
          hookRepair: false,
        });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('parses exact quoted and pnpm hook invocations without widening command boundaries', () => {
    for (const command of [
      'npx "arkgate-mcp" --hook --hook-repair',
      "npx 'arkgate-mcp' --hook --hook-repair",
      'pnpm exec arkgate-mcp --hook --hook-repair',
    ]) {
      const root = mk();
      try {
        fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
        fs.writeFileSync(
          path.join(root, '.claude/settings.json'),
          JSON.stringify({
            hooks: {
              PreToolUse: [
                { matcher: 'Write|Edit|MultiEdit', hooks: [{ command }] },
              ],
            },
          })
        );
        expect(detectWritePathCapabilities(root, 'claude')).toMatchObject({
          mode: 'repair',
          hookPresent: true,
          hookRepair: true,
        });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('covers write operations across anchored matcher groups', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude', 'settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: '^(Write|Edit)$',
                hooks: [{ command: 'npx arkgate-mcp --hook --hook-repair' }],
              },
              {
                matcher: '^MultiEdit$',
                hooks: [{ command: 'npx arkgate-mcp --hook --hook-repair' }],
              },
            ],
          },
        })
      );

      expect(detectWritePathCapabilities(root, 'claude')).toMatchObject({
        mode: 'repair',
        hookPresent: true,
        hookRepair: true,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed hook structures and accepts scoped repair environment forms', () => {
    const invalidSettings = [
      '{',
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: '[',
              hooks: [{ command: 'npx arkgate-mcp --hook --hook-repair' }],
            },
          ],
        },
      }),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: 'Write|Edit|MultiEdit', hooks: 'not-an-array' },
            {
              matcher: 'Write|Edit|MultiEdit',
              hooks: [
                { command: '' },
                { command: 42 },
                { type: 'prompt', command: 'npx arkgate-mcp --hook --hook-repair' },
              ],
            },
          ],
        },
      }),
    ];
    for (const text of invalidSettings) {
      const root = mk();
      try {
        fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
        fs.writeFileSync(path.join(root, '.claude', 'settings.json'), text);
        expect(detectWritePathCapabilities(root, 'claude').hookPresent).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }

    for (const hook of [
      { command: 'env ARK_HOOK_REPAIR="yes" npx arkgate-mcp --hook' },
      { command: 'npx arkgate-mcp --hook', env: { ARK_HOOK_REPAIR: 'true' } },
    ]) {
      const root = mk();
      try {
        fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
        fs.writeFileSync(
          path.join(root, '.claude', 'settings.json'),
          JSON.stringify({
            hooks: {
              PreToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [hook] }],
            },
          })
        );
        expect(detectWritePathCapabilities(root, 'claude')).toMatchObject({
          mode: 'repair',
          hookPresent: true,
          hookRepair: true,
        });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('rejects malformed or duplicate Ark MCP TOML tables', () => {
    const invalidToml = [
      '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp" "--root", "."]\n',
      '[mcp_servers.ark]\ncommand = "npx"\ncommand = "arkgate-mcp"\nargs = ["arkgate-mcp"]\n',
      '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\nbogus = ???\n',
      '[mcp_servers.ark]\ncommand = "\\q"\nargs = ["arkgate-mcp"]\n',
      '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\n\n' +
        '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp"]\n',
    ];
    for (const text of invalidToml) {
      const root = mk();
      try {
        fs.mkdirSync(path.join(root, '.grok'), { recursive: true });
        fs.writeFileSync(path.join(root, '.grok', 'config.toml'), text);
        expect(detectWritePathCapabilities(root, 'grok').mcpPresent).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('ignores unreadable hook and MCP paths', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.claude', 'settings.json'), { recursive: true });
      fs.mkdirSync(path.join(root, '.mcp.json'), { recursive: true });

      expect(detectWritePathCapabilities(root, 'claude')).toMatchObject({
        mode: 'none',
        hookPresent: false,
        mcpPresent: false,
        evidence: [],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('dogfood: this repository reports repair-capable write path', () => {
    const cap = detectWritePathCapabilities(REPO, 'grok');
    expect(cap.mode).toBe('repair');
    expect(cap.hookRepair).toBe(true);
    expect(cap.hookPresent).toBe(true);
  });
});

describe('deny→repair via shipped bin/ark-mcp.mjs', () => {
  it('hard-denies type-only import edge and emits ARK_REPAIR_JSON + ARK_AUTOPATCH_JSON', () => {
    expect(fs.existsSync(SHIPPED_MCP)).toBe(true);
    const apRoot = mk();
    try {
      fs.mkdirSync(path.join(apRoot, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(apRoot, 'src/infra'), { recursive: true });
      fs.writeFileSync(
        path.join(apRoot, 'src/infra/types-only.ts'),
        'export type Row = { id: string };\nexport interface Item { n: number }\n'
      );
      fs.writeFileSync(
        path.join(apRoot, 'ark.config.json'),
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
      const payload = {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(apRoot, 'src/domain/use-row.ts'),
          content:
            "import { Row } from '../infra/types-only';\nexport function id(r: Row): string { return r.id; }\n",
        },
      };
      const result = spawnSync(
        'node',
        [SHIPPED_MCP, '--hook', '--hook-repair', '--root', apRoot],
        {
          input: JSON.stringify(payload),
          encoding: 'utf8',
          env: process.env,
          cwd: REPO,
        }
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('ARK_REPAIR_JSON:');
      expect(result.stderr).toContain('ARK_AUTOPATCH_JSON:');
      const repairLine = result.stderr
        .split('\n')
        .find((l) => l.startsWith('ARK_REPAIR_JSON:'));
      const repair = JSON.parse(repairLine!.slice('ARK_REPAIR_JSON:'.length));
      expect(repair.mode).toBe('lexical-compatibility');
      expect(repair.repair).toBe(true);
      expect(repair.decision).toBe('deny');
      expect(repair.autoPatch?.valid).toBe(false);
      expect(repair.autoPatch?.lexicalValid).toBe(true);
      expect(repair.autoPatch?.source).toMatch(/import\s+type/);
      // File on disk must not have been silently rewritten
      expect(fs.existsSync(path.join(apRoot, 'src/domain/use-row.ts'))).toBe(false);
    } finally {
      fs.rmSync(apRoot, { recursive: true, force: true });
    }
  });

  it('omit --hook-repair stays reject-only (supported consumer choice)', () => {
    const apRoot = mk();
    try {
      fs.mkdirSync(path.join(apRoot, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(apRoot, 'src/infra'), { recursive: true });
      fs.writeFileSync(
        path.join(apRoot, 'src/infra/types-only.ts'),
        'export type Row = { id: string };\n'
      );
      fs.writeFileSync(
        path.join(apRoot, 'ark.config.json'),
        JSON.stringify({
          include: ['src'],
          layers: [
            { name: 'DomainModel', patterns: ['src/domain/**'] },
            { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
          ],
          rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
        })
      );
      const payload = {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(apRoot, 'src/domain/use-row.ts'),
          content:
            "import { Row } from '../infra/types-only';\nexport function id(r: Row): string { return r.id; }\n",
        },
      };
      const result = spawnSync(
        'node',
        [SHIPPED_MCP, '--hook', '--root', apRoot],
        {
          input: JSON.stringify(payload),
          encoding: 'utf8',
          env: { ...process.env, ARK_HOOK_REPAIR: '' },
          cwd: REPO,
        }
      );
      expect(result.status).toBe(2);
      expect(result.stderr).not.toContain('ARK_AUTOPATCH_JSON:');
      expect(result.stderr).not.toContain('ARK_REPAIR_JSON:');
    } finally {
      fs.rmSync(apRoot, { recursive: true, force: true });
    }
  });

  it('Q2: deny → host re-injects autoPatch.source → revalidation allows (exit 0)', () => {
    expect(fs.existsSync(SHIPPED_MCP)).toBe(true);
    const apRoot = mk();
    try {
      fs.mkdirSync(path.join(apRoot, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(apRoot, 'src/infra'), { recursive: true });
      fs.writeFileSync(
        path.join(apRoot, 'src/infra/types-only.ts'),
        'export type Row = { id: string };\nexport interface Item { n: number }\n'
      );
      fs.writeFileSync(
        path.join(apRoot, 'ark.config.json'),
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
      const badContent =
        "import { Row } from '../infra/types-only';\nexport function id(r: Row): string { return r.id; }\n";
      const filePath = path.join(apRoot, 'src/domain/use-row.ts');
      const deny = spawnSync(
        'node',
        [SHIPPED_MCP, '--hook', '--hook-repair', '--root', apRoot],
        {
          input: JSON.stringify({
            tool_name: 'Write',
            tool_input: { file_path: filePath, content: badContent },
          }),
          encoding: 'utf8',
          cwd: REPO,
        }
      );
      expect(deny.status).toBe(2);
      const repairLine = deny.stderr.split('\n').find((l) => l.startsWith('ARK_REPAIR_JSON:'));
      expect(repairLine).toBeTruthy();
      const repair = JSON.parse(repairLine!.slice('ARK_REPAIR_JSON:'.length));
      expect(repair.autoPatch?.valid).toBe(false);
      expect(repair.autoPatch?.lexicalValid).toBe(true);
      expect(typeof repair.autoPatch?.source).toBe('string');
      // Host re-injects patched content (gate never wrote the file)
      const allow = spawnSync(
        'node',
        [SHIPPED_MCP, '--hook', '--hook-repair', '--root', apRoot],
        {
          input: JSON.stringify({
            tool_name: 'Write',
            tool_input: { file_path: filePath, content: repair.autoPatch.source },
          }),
          encoding: 'utf8',
          cwd: REPO,
        }
      );
      expect(allow.status, allow.stderr || allow.stdout).toBe(0);
      expect(allow.stderr).not.toContain('ARK_REPAIR_JSON:');
    } finally {
      fs.rmSync(apRoot, { recursive: true, force: true });
    }
  });
});
