import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cursorHooks,
  mergeCursorArkHook,
} from '../../../bin/lib/hook-templates.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';
import { getHostSupportProfile } from '../../../bin/lib/host-support-matrix.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MCP = path.join(REPO, 'bin/ark-mcp.mjs');
const TMP_ROOTS: string[] = [];

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-cursor-hard-'));
  TMP_ROOTS.push(root);
  return root;
}

afterEach(() => {
  while (TMP_ROOTS.length > 0) {
    const root = TMP_ROOTS.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Cursor hard write path (4.5.7)', () => {
  it('matrix claims hard write for Write|StrReplace with repair envelope only', () => {
    const profile = getHostSupportProfile('cursor');
    expect(profile?.capabilities['hard-write']).toBe(true);
    expect(profile?.hookPath).toBe('.cursor/hooks.json');
    expect(profile?.hookOperations).toEqual(['Write', 'StrReplace']);
    expect(profile?.capabilities['repair-envelope-emitted']).toBe(true);
    expect(profile?.capabilities['repair-reinjection-guaranteed']).toBe(false);
  });

  it('install template is Cursor hooks.json schema with failClosed Write|StrReplace', () => {
    const parsed = JSON.parse(cursorHooks(REPO));
    expect(parsed.version).toBe(1);
    expect(parsed.hooks.preToolUse).toHaveLength(1);
    const entry = parsed.hooks.preToolUse[0];
    expect(entry.matcher).toBe('Write|StrReplace');
    expect(entry.failClosed).toBe(true);
    expect(entry.command).toMatch(/arkgate-mcp/);
    expect(entry.command).toMatch(/--hook/);
    expect(entry.command).toMatch(/CURSOR_PROJECT_DIR/);
  });

  it('mergeCursorArkHook upserts Ark gate without wiping sibling hooks', () => {
    const existing = JSON.stringify({
      version: 1,
      hooks: {
        beforeShellExecution: [{ command: './hooks/audit.sh' }],
        preToolUse: [
          { command: './hooks/other.sh', matcher: 'Shell' },
          {
            command: 'npx arkgate-mcp --hook --root . --config ark.config.json',
            matcher: 'Write',
          },
        ],
      },
    });
    const merged = mergeCursorArkHook(existing, cursorHooks(REPO));
    expect(merged).toBeTruthy();
    const parsed = JSON.parse(merged!);
    expect(parsed.hooks.beforeShellExecution).toHaveLength(1);
    expect(parsed.hooks.preToolUse.some((e: { matcher?: string }) => e.matcher === 'Shell')).toBe(
      true
    );
    const ark = parsed.hooks.preToolUse.find((e: { command?: string }) =>
      /arkgate-mcp/.test(String(e.command))
    );
    expect(ark.matcher).toBe('Write|StrReplace');
    expect(ark.failClosed).toBe(true);
  });

  it('detects hard-write evidence from .cursor/hooks.json', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, '.cursor'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cursor', 'hooks.json'), cursorHooks(root));
    fs.writeFileSync(
      path.join(root, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: { ark: { command: 'npx', args: ['arkgate-mcp'] } },
      })
    );
    const model = detectWritePathCapabilities(root, 'cursor');
    expect(model.capabilities['hard-write']).toBe(true);
    expect(model.capabilityEvidence['hard-write']).toContain('.cursor/hooks.json');
    expect(model.capabilities['advisory-write']).toBe(true);
  });

  it('hook mode denies Cursor Write with contents + permission JSON', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'Infrastructure', patterns: ['src/infra/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'Infrastructure', allowed: false }],
      })
    );
    const payload = {
      hook_event_name: 'preToolUse',
      workspace_roots: [root],
      tool_name: 'Write',
      tool_input: {
        path: path.join(root, 'src/domain/order.ts'),
        contents: "import { db } from '../infra/db';\nexport const a = db;\n",
      },
    };
    const run = spawnSync(
      process.execPath,
      [MCP, '--hook', '--hook-repair', '--root', root, '--config', 'ark.config.json'],
      {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: { ...process.env, CURSOR_PROJECT_DIR: root },
        cwd: root,
      }
    );
    expect(run.status).toBe(2);
    const lines = String(run.stdout || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const deny = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .find((row) => row && row.permission === 'deny');
    expect(deny).toBeTruthy();
    expect(String(deny.agent_message)).toMatch(/Ark architecture gate/i);
    expect(String(run.stderr)).toMatch(/LAYER_IMPORT_VIOLATION/);
  });

  it('maps StrReplace to Edit and can fail-open non-source paths', () => {
    const run = spawnSync(
      process.execPath,
      [MCP, '--hook', '--root', REPO, '--config', 'ark.config.json'],
      {
        input: JSON.stringify({
          tool_name: 'StrReplace',
          tool_input: {
            path: path.join(REPO, 'README.md'),
            old_string: 'x',
            new_string: 'y',
          },
          hook_event_name: 'preToolUse',
        }),
        encoding: 'utf8',
        env: { ...process.env, CURSOR_PROJECT_DIR: REPO },
        cwd: REPO,
      }
    );
    // Non-source / ungoverned: fail-open (exit 0).
    expect(run.status ?? 0).toBe(0);
  });
});
