import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compactAgentInstructions, cursorRule } from '../../../bin/lib/ci-and-commands.mjs';
import { missingGates } from '../../../bin/lib/gate-files.mjs';
import { renderHostSupportMatrixMarkdown } from '../../../bin/lib/host-support-matrix.mjs';
import { writePathModeHint } from '../../../bin/lib/html-report-depth.mjs';
import { cursorHooks, opencodeProjectConfig } from '../../../bin/lib/hook-templates.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';

const roots: string[] = [];

function temporaryRoot(label = 'ark-ph01-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), label));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('PH01 pre-hook first, MCP prepare fallback', () => {
  it('compact Cursor requires a fail-closed pre-hook; MCP alone is not enough', () => {
    const root = temporaryRoot('ark-ph01-cursor-');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- arkgate:compact-router host=cursor -->\n');
    fs.mkdirSync(path.join(root, '.cursor'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.cursor/mcp.json'),
      JSON.stringify({
        mcpServers: {
          ark: { command: 'npx', args: ['arkgate-mcp', '--root', '.', '--config', 'ark.config.json'] },
        },
      })
    );
    expect(missingGates(root)).toContain('compact host registration (cursor)');

    fs.writeFileSync(path.join(root, '.cursor/hooks.json'), cursorHooks(root));
    expect(missingGates(root)).not.toContain('compact host registration (cursor)');
  });

  it('names MCP-only as fallback on a hard-capable host', () => {
    const root = temporaryRoot('ark-ph01-claude-');
    fs.writeFileSync(
      path.join(root, '.mcp.json'),
      JSON.stringify({ mcpServers: { ark: { command: 'npx', args: ['arkgate-mcp'] } } })
    );
    const cap = detectWritePathCapabilities(root, 'claude');
    expect(cap.mode).toBe('mcp-only');
    expect(cap.gap?.id).toBe('write-path-mcp-only');
    expect(cap.gap?.message).toMatch(/Fell back to MCP prepare/i);
    expect(cap.gap?.message).toMatch(/install and trust the host write hook/i);
  });

  it('keeps OpenCode as MCP-only without asking for a hard hook', () => {
    const root = temporaryRoot('ark-ph01-opencode-');
    fs.writeFileSync(path.join(root, 'opencode.json'), opencodeProjectConfig(root));
    const cap = detectWritePathCapabilities(root, 'opencode');
    expect(cap.mode).toBe('mcp-only');
    expect(cap.gap?.message).toMatch(/OpenCode local write is advisory/i);
    expect(cap.gap?.message).not.toMatch(/install and trust the host write hook/i);
  });

  it('documents hook-first order on agent, compact, and host-matrix copy', () => {
    const root = temporaryRoot('ark-ph01-copy-');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"t","private":true}\n');
    expect(cursorRule(root)).toMatch(/pre-hook/i);
    expect(cursorRule(root)).toMatch(/fallback/i);
    expect(compactAgentInstructions(root, 'cursor')).toMatch(/host pre-hook is the write gate/i);
    expect(compactAgentInstructions(root, 'cursor')).toMatch(/fallback if that hook is missing or fail-open/i);
    expect(renderHostSupportMatrixMarkdown()).toMatch(/Write-gate order:/);
    expect(writePathModeHint('mcp-only')).toMatch(/Fell back to MCP prepare/i);
  });
});
