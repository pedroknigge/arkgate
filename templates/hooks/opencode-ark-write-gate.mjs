/**
 * Experimental OpenCode plugin: best-effort write gate via tool.execute.before.
 *
 * Install:
 *   1. Copy to `.opencode/plugins/ark-write-gate.mjs` (or reference from opencode.json plugin list)
 *   2. Ensure `arkgate-mcp` / `npx arkgate-mcp` is on PATH
 *   3. Keep CI on `arkgate-check --strict-merge` + required status
 *
 * Honesty: OpenCode plugin hooks are **not** a complete hard write boundary
 * (subagent and alternate tool paths may bypass). Never treat this plugin as
 * Claude/Grok/Antigravity PreToolUse hard-write. This host has no hard pre-hook,
 * so MCP `ark_prepare_write` is the local write fallback + required merge status.
 *
 * This file is a gallery template shipped with arkgate — not auto-installed.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const WRITE_TOOLS = new Set(['write', 'edit', 'apply_patch', 'patch']);

function resolveMcpBin() {
  return process.env.ARK_MCP_BIN?.trim() || 'npx';
}

function resolveMcpArgs(root) {
  const bin = process.env.ARK_MCP_SCRIPT?.trim();
  if (bin) {
    return [bin, '--hook', '--root', root, '--config', 'ark.config.json'];
  }
  return ['arkgate-mcp', '--hook', '--root', root, '--config', 'ark.config.json'];
}

function toClaudePayload(tool, args) {
  if (tool === 'write') {
    return {
      tool_name: 'Write',
      tool_input: {
        file_path: args?.filePath ?? args?.path ?? args?.file_path,
        content: args?.content ?? '',
      },
    };
  }
  if (tool === 'edit') {
    return {
      tool_name: 'Edit',
      tool_input: {
        file_path: args?.filePath ?? args?.path ?? args?.file_path,
        old_string: args?.oldString ?? args?.old_string ?? '',
        new_string: args?.newString ?? args?.new_string ?? '',
      },
    };
  }
  if (tool === 'apply_patch' || tool === 'patch') {
    return {
      tool_name: 'apply_patch',
      tool_input: {
        patch: args?.patchText ?? args?.patch ?? args?.content ?? '',
      },
    };
  }
  return null;
}

export default async function ArkWriteGatePlugin(ctx) {
  const root = ctx?.directory ?? ctx?.worktree ?? process.cwd();
  return {
    'tool.execute.before': async (input, output) => {
      const tool = String(input?.tool ?? '').toLowerCase();
      if (!WRITE_TOOLS.has(tool)) return;
      const payload = toClaudePayload(tool, output?.args ?? input?.args ?? {});
      if (!payload) return;
      const result = spawnSync(resolveMcpBin(), resolveMcpArgs(root), {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        cwd: root,
        env: process.env,
      });
      if (result.status === 2) {
        const reason = (result.stderr || result.stdout || 'Ark write gate denied').trim();
        throw new Error(reason);
      }
      // Plumbing failures fail open (same as ark-mcp --hook contract).
    },
  };
}
