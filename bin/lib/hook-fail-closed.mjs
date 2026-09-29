/**
 * Fail-closed envelope for the one-shot PreToolUse hook (`ark-mcp --hook`).
 *
 * Claude Code, Grok Build, and Codex treat any exit code other than 2 as a
 * non-blocking error: the write lands. When the write gate itself cannot run
 * (ark.config.json missing / unparsable / invalid, a referenced ArkRules file
 * missing, dist/ missing or broken), exiting 1 would silently turn the hard
 * write gate off. "No checker, no write": governed source writes are denied
 * with the host's blocking contract instead.
 *
 * Plumbing cases stay fail-open, exactly like the healthy hook: no stdin or a
 * malformed payload, non-file tools, non-source files (so ark.config.json itself
 * can still be repaired), files outside the root, and node_modules.
 *
 * This module must not import dist/ or the MCP runtime — it runs precisely when
 * those are the broken part.
 */
import path from 'node:path';

import {
  emitHostAllow,
  emitHostDeny,
  formatWriteGateDeny,
  normalizeHookPayload,
  relativeToHookRoot,
} from './mcp-hook-payload.mjs';

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const PATCH_FILE_DIRECTIVE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/;
const PATCH_MOVE_DIRECTIVE = /^\*\*\* Move to: (.+)$/;

/** Same root resolution as the runtime: --root, then the first non-empty --root-env var. */
export function hookRootFromArgv(argv, env = process.env, cwd = process.cwd()) {
  let root = cwd;
  const rootEnv = [];
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--root' && argv[index + 1]) root = path.resolve(argv[++index]);
    else if (value === '--root-env' && argv[index + 1]) {
      rootEnv.push(
        ...String(argv[++index])
          .split(',')
          .map((name) => name.trim())
          .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      );
    }
  }
  for (const name of rootEnv) {
    const value = env[name];
    if (typeof value === 'string' && value.trim() !== '') return path.resolve(value.trim());
  }
  return root;
}

function patchTargets(patch) {
  if (typeof patch !== 'string') return [];
  const targets = [];
  for (const line of patch.split('\n')) {
    const match = line.match(PATCH_FILE_DIRECTIVE) ?? line.match(PATCH_MOVE_DIRECTIVE);
    if (match) targets.push(match[1].trim());
  }
  return targets;
}

/** File paths the hook payload would write, or null for non-file tools. */
export function hookPayloadTargets(normalized) {
  const { toolName, toolInput } = normalized;
  if (toolName === 'ApplyPatch') {
    return patchTargets(
      toolInput.command ?? toolInput.patch ?? toolInput.input ?? toolInput.content
    );
  }
  if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) return null;
  return typeof toolInput.file_path === 'string' ? [toolInput.file_path] : [];
}

function isGovernedCandidate(root, target) {
  if (!SOURCE_FILE.test(target) || target.endsWith('.d.ts')) return false;
  const relative = relativeToHookRoot(root, target);
  if (relative === null) return false;
  return !relative.split(path.sep).includes('node_modules');
}

/**
 * Map an internal hook failure onto the host's blocking contract.
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
export function hookFailClosedResponse({ hookInput, error, root, grokHookEvent }) {
  let stdout = '';
  let stderr = '';
  const output = {
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  };
  let payload;
  try {
    payload = JSON.parse(hookInput ?? '');
  } catch {
    // Same as the healthy hook: no stdin / malformed payload never blocks.
    return { status: 0, stdout, stderr };
  }
  const normalized = normalizeHookPayload(payload, grokHookEvent);
  const targets = hookPayloadTargets(normalized);
  const governed = (targets ?? []).filter((target) => isGovernedCandidate(root, target));
  if (governed.length === 0) {
    emitHostAllow(output, normalized);
    return { status: 0, stdout, stderr };
  }
  const reason = error instanceof Error ? error.message : String(error);
  const relative = relativeToHookRoot(root, governed[0]) ?? governed[0];
  const file = String(relative).split(path.sep).join('/');
  const message = formatWriteGateDeny({
    file,
    reason: `ArkGate write gate could not run: ${reason}`,
    ruleId: 'WRITE_GATE_UNAVAILABLE',
    nextAction:
      'Fix ark.config.json (or the ArkRules file it references), or run npm run build / reinstall arkgate from npm, then retry this write. No checker, no write — do not remove the hook to get past it.',
  });
  emitHostDeny(output, { ...normalized, message, file });
  return { status: 2, stdout, stderr };
}
