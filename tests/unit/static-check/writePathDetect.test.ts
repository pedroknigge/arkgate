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
      expect(cap.gap?.id).toBe('write-path-reject-only');
      expect(cap.gap?.fix).toContain('--install-agent-gates --tools claude --force');
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
      expect(cap.gap?.id).toBe('write-path-mcp-only');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects ARK_HOOK_REPAIR env-style text without an MCP config', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude', 'settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                hooks: [{ command: 'node bin/ark-mcp.mjs --hook --root . ; ARK_HOOK_REPAIR=yes' }],
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

  it('detects each supported MCP config signature independently', () => {
    const cases = [
      { host: 'claude', rel: '.mcp.json', text: 'command = "arkgate-mcp"' },
      { host: 'grok', rel: '.grok/config.toml', text: '[mcp_servers.ark]\ncommand = "custom"' },
      { host: 'cursor', rel: '.cursor/mcp.json', text: '"ark": {' },
      { host: 'claude', rel: '.mcp.json', text: 'mcpServers = ["ark"]' },
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
      expect(repair.mode).toBe('repair');
      expect(repair.decision).toBe('deny');
      expect(repair.autoPatch?.valid).toBe(true);
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
      expect(repair.autoPatch?.valid).toBe(true);
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
