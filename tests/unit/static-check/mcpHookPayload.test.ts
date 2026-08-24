import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyCodexUpdatePatch,
  codexPatchWrites,
  emitHostAllow,
  formatWriteGateDeny,
  mapAntigravityToolCall,
  normalizeHookPayload,
  proposedSource,
} from '../../../bin/lib/mcp-hook-payload.mjs';

describe('mcp-hook-payload (extracted)', () => {
  it('maps Antigravity write/replace tools onto Claude names', () => {
    expect(mapAntigravityToolCall(null)).toBeNull();
    expect(
      mapAntigravityToolCall({
        name: 'write_to_file',
        args: { TargetFile: 'src/a.ts', CodeContent: 'x' },
      })
    ).toMatchObject({ toolName: 'Write', toolInput: { file_path: 'src/a.ts', content: 'x' } });
    expect(
      mapAntigravityToolCall({
        name: 'replace_file_content',
        args: { TargetFile: 'src/a.ts', TargetContent: 'a', ReplacementContent: 'b' },
      })
    ).toMatchObject({ toolName: 'Edit', toolInput: { old_string: 'a', new_string: 'b' } });
  });

  it('normalizes Claude, Grok, and Cursor payloads', () => {
    const claude = normalizeHookPayload({
      tool_name: 'Write',
      tool_input: { file_path: 'src/a.ts', content: 'ok' },
    });
    expect(claude.toolName).toBe('Write');
    expect(claude.toolInput.file_path).toBe('src/a.ts');
    expect(claude.grokStyle).toBe(false);

    const grok = normalizeHookPayload({
      toolName: 'search_replace',
      toolInput: { file_path: 'src/a.ts', old_string: 'a', new_string: 'b' },
    });
    expect(grok.toolName).toBe('Edit');
    expect(grok.grokStyle).toBe(true);

    const cursor = normalizeHookPayload({
      tool_name: 'Write',
      tool_input: { file_path: 'src/a.ts', contents: 'cursor' },
    });
    expect(cursor.toolInput.content).toBe('cursor');
    expect(cursor.cursorStyle).toBe(true);
  });

  it('computes Write/Edit proposed source and formats deny copy', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ark-hook-'));
    const file = path.join(dir, 'a.ts');
    writeFileSync(file, 'hello world\n');
    expect(proposedSource('Write', { content: 'new' })).toBe('new');
    expect(proposedSource('Edit', { file_path: file, old_string: 'world', new_string: 'ark' })).toBe(
      'hello ark\n'
    );
    const deny = formatWriteGateDeny({
      file: 'src/a.ts',
      reason: 'Domain imported fetch',
      ruleId: 'FORBIDDEN_GLOBAL',
    });
    expect(deny).toMatch(/^blocked src\/a\.ts/);
    expect(deny).toContain('[FORBIDDEN_GLOBAL]');
  });

  it('applies a complete Codex update patch inside the project root', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ark-codex-'));
    const rel = 'src/a.ts';
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'hello world\n');
    const patched = applyCodexUpdatePatch('hello world\n', ['@@', '-hello world', '+hello ark']);
    expect(patched).toBe('hello ark\n');
    const patch = [
      '*** Begin Patch',
      `*** Update File: ${rel}`,
      '@@',
      '-hello world',
      '+hello ark',
      '*** End Patch',
    ].join('\n');
    const result = codexPatchWrites(patch, dir);
    expect(result.complete).toBe(true);
    expect(result.writes).toHaveLength(1);
    expect(result.writes[0].content).toBe('hello ark\n');
  });

  it('emits host allow JSON only for the matching style', () => {
    const lines = [];
    emitHostAllow({ stdout: (chunk) => lines.push(chunk) }, { antigravityStyle: true, cursorStyle: false });
    expect(JSON.parse(lines[0])).toEqual({ decision: 'allow' });
    lines.length = 0;
    emitHostAllow({ stdout: (chunk) => lines.push(chunk) }, { antigravityStyle: false, cursorStyle: true });
    expect(JSON.parse(lines[0])).toEqual({ permission: 'allow' });
    lines.length = 0;
    emitHostAllow({ stdout: (chunk) => lines.push(chunk) }, { antigravityStyle: false, cursorStyle: false });
    expect(lines).toEqual([]);
  });
});
