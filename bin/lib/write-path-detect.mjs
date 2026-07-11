/**
 * W5 — Write-path capability surface for doctor (stable additive JSON).
 * Extracted from agent-gates so install orchestration stays scannable.
 *
 * Detects whether installed agent gates expose:
 *   - MCP prepare-write / validate_code (autoPatch) tools
 *   - PreToolUse hook in reject-only vs repair mode (--hook-repair / ARK_HOOK_REPAIR)
 *
 * Never claims silent apply; "repair" means host can re-inject a patch after hard deny.
 */
import fs from 'node:fs';
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';

/**
 * @returns {{
 *   mode: 'repair' | 'reject-only' | 'mcp-only' | 'none',
 *   prepareWrite: boolean,
 *   autoPatch: boolean,
 *   hookPresent: boolean,
 *   hookRepair: boolean,
 *   mcpPresent: boolean,
 *   evidence: string[],
 *   gap: null | { id: string, severity: string, message: string, fix: string },
 * }}
 */
export function detectWritePathCapabilities(root) {
  const evidence = [];
  let hookPresent = false;
  let hookRepair = false;

  const hookFiles = [
    '.claude/settings.json',
    '.grok/hooks/ark-write-gate.json',
  ];
  for (const rel of hookFiles) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    let text = '';
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    // PreToolUse / write-gate command using Ark's --hook mode.
    if (/--hook\b/.test(text)) {
      hookPresent = true;
      evidence.push(rel);
    }
    if (
      /--hook-repair\b/.test(text) ||
      /ARK_HOOK_REPAIR\s*=\s*['"]?(1|true|yes|on)/i.test(text)
    ) {
      hookRepair = true;
      evidence.push(rel);
    }
  }

  let mcpPresent = false;
  const mcpFiles = ['.mcp.json', '.cursor/mcp.json', '.grok/config.toml'];
  for (const rel of mcpFiles) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    let text = '';
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (
      /\b(ark|arkgate)-mcp\b/.test(text) ||
      /mcp_servers\.ark\b/.test(text) ||
      /"ark"\s*:\s*\{/.test(text) ||
      /mcpServers[\s\S]*\bark\b/.test(text)
    ) {
      mcpPresent = true;
      evidence.push(rel);
    }
  }

  // Package tools when MCP is wired: ark_prepare_write + validate_code(autoPatch).
  // Hook repair emits machine-readable autoPatch without silent write.
  const prepareWrite = mcpPresent;
  const autoPatch = mcpPresent || hookRepair;

  /** @type {'repair' | 'reject-only' | 'mcp-only' | 'none'} */
  let mode = 'none';
  if (hookPresent && hookRepair) mode = 'repair';
  else if (hookPresent && !hookRepair) mode = 'reject-only';
  else if (mcpPresent) mode = 'mcp-only';

  let gap = null;
  if (mode === 'none') {
    gap = {
      id: 'write-path-none',
      severity: 'warn',
      message:
        'Write path is not installed — no PreToolUse hook and no Ark MCP. Agents write without architecture gate or prepare-write.',
      fix: arkCommand(root, 'ark-check', '--install-agent-gates'),
    };
  } else if (mode === 'reject-only') {
    gap = {
      id: 'write-path-reject-only',
      severity: 'info',
      message: mcpPresent
        ? 'PreToolUse hook is reject-only (hard block, no ARK_REPAIR_JSON). MCP still exposes prepare-write/autoPatch — enable --hook-repair so the write boundary itself can re-inject patches.'
        : 'Write path is reject-only (hard block with prose; no repair payload). Enable --hook-repair or ARK_HOOK_REPAIR=1 so hosts can re-inject patches without full re-draft.',
      fix: arkCommand(
        root,
        'ark-check',
        '--install-agent-gates --tools claude,grok --force'
      ),
    };
  } else if (mode === 'mcp-only') {
    gap = {
      id: 'write-path-mcp-only',
      severity: 'info',
      message:
        'MCP exposes prepare-write / autoPatch tools, but no PreToolUse write hook is installed — enforcement is advisory unless the agent calls tools.',
      fix: arkCommand(root, 'ark-check', '--install-agent-gates --tools claude,grok'),
    };
  }

  return {
    mode,
    prepareWrite,
    autoPatch,
    hookPresent,
    hookRepair,
    mcpPresent,
    evidence: [...new Set(evidence)],
    gap,
  };
}
