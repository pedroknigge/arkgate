/**
 * Active-host write-path capability surface for doctor and install checks.
 *
 * `inventory` records every supported host found in the repository. Top-level
 * capabilities and compatibility fields describe only `activeHost`, so a
 * Claude/Grok hook can never become a Codex/Cursor guarantee.
 */
import { arkCommand } from '../ark-shared.mjs';
import { formatHostSupportSummary } from './host-support-matrix.mjs';
import { buildWritePathCapabilityModel } from './write-path-capabilities.mjs';

function installToolsForHost(activeHost) {
  return activeHost === 'unknown'
    ? 'claude,grok,cursor,codex'
    : activeHost;
}

export function detectWritePathCapabilities(root, explicitHost, attempt) {
  const model = buildWritePathCapabilityModel(root, explicitHost, attempt);
  const { activeHost, support, capabilities, capabilityEvidence, enforcementLadder, enforcementState, inventory } = model;
  const hardWrite = capabilities['hard-write'];
  const advisoryWrite = capabilities['advisory-write'];
  const repairPayload = capabilities['repair-payload'];

  /** @type {'repair' | 'reject-only' | 'mcp-only' | 'none'} */
  let mode = 'none';
  if (hardWrite && repairPayload) mode = 'repair';
  else if (hardWrite) mode = 'reject-only';
  else if (advisoryWrite) mode = 'mcp-only';

  const tools = installToolsForHost(activeHost);
  let gap = null;
  // Repo inventory (any host) can show hard/advisory write while activeHost is
  // unknown (plain shell / `npx ark-check --report` outside an agent session).
  // Session projection stays mode=none (other hosts' hooks are not a guarantee for
  // this process) — but do not open an adoption gap: gates exist on disk.
  const inventoryHasWriteBoundary =
    Boolean(inventory?.capabilities?.['hard-write']) ||
    Boolean(inventory?.capabilities?.['advisory-write']);
  if (mode === 'none') {
    if (activeHost === 'unknown' && inventoryHasWriteBoundary) {
      gap = null;
    } else {
      gap = {
        id: 'write-path-none',
        severity: 'warn',
        message:
          `Active host ${activeHost} has no hard write boundary or advisory Ark MCP. ` +
          (capabilities['merge-gate']
            ? 'The CI check remains separate and does not block local writes.'
            : 'No Ark CI check was detected either.'),
        fix: arkCommand(
          root,
          'ark-check',
          `--install-agent-gates --tools ${tools}`
        ),
      };
    }
  } else if (mode === 'reject-only') {
    gap = {
      id: 'write-path-reject-only',
      severity: 'info',
      message:
        `Active host ${activeHost} has a hard write boundary without a repair payload. ` +
        (advisoryWrite
          ? 'Advisory MCP tools remain available.'
          : 'Install its MCP surface or enable hook repair for guided re-entry.'),
      fix: arkCommand(
        root,
        'ark-check',
        `--install-agent-gates --tools ${tools} --force`
      ),
    };
  } else if (mode === 'mcp-only') {
    const codexHonesty =
      activeHost === 'codex'
        ? 'Codex local write is advisory (MCP + best-effort hooks.json — not a hard boundary; ' +
          'not equivalent to Claude/Grok PreToolUse hard-write + repair). ' +
          'The hard merge backstop is CI --strict-merge plus a required status check.'
        : `Active host ${activeHost} has advisory prepare-write/autoPatch tools, ` +
          'but no hard write boundary; CI can report failure, while merge blocking requires provider policy.';
    gap = {
      id: 'write-path-mcp-only',
      severity: 'info',
      host: activeHost,
      message: codexHonesty,
      fix:
        activeHost === 'codex'
          ? 'Keep CI on --strict-merge and require the ark-check status on the default branch; ' +
            `refresh Codex MCP/skills with ${arkCommand(root, 'ark-check', '--install-agent-gates --tools codex')}`
          : arkCommand(root, 'ark-check', `--install-agent-gates --tools ${tools}`),
    };
  }

  /** @type {string|null} */
  let sessionNote = null;
  if (activeHost === 'unknown') {
    const onDiskHosts = Object.entries(inventory?.hosts ?? {})
      .filter(([, record]) => {
        if (!record || typeof record !== 'object') return false;
        const caps = record.capabilities ?? {};
        return Boolean(
          record.configured ||
            caps['hard-write'] ||
            caps['advisory-write'] ||
            caps['repair-payload']
        );
      })
      .map(([name]) => name)
      .sort();
    const parts = [];
    if (onDiskHosts.length > 0) {
      parts.push(`On-disk hosts with write-path assets: ${onDiskHosts.join(', ')}`);
    }
    if (inventory?.capabilities?.['merge-gate'] || capabilities['merge-gate']) {
      parts.push('CI merge gate configured on disk');
    }
    parts.push(
      'This invocation has no active hard-write guarantee (activeHost unknown); ' +
        'required-status remains unverified without provider evidence'
    );
    sessionNote = `${parts.join('. ')}.`;
  }

  return {
    activeHost,
    support,
    supportSummary: formatHostSupportSummary(support),
    capabilities,
    capabilityEvidence,
    enforcementLadder,
    enforcementState,
    inventory,
    // Configured inventory (on-disk hosts) vs this-invocation projection (activeHost).
    ...(sessionNote ? { sessionNote } : {}),
    // Compatibility projection for existing doctor/API consumers.
    mode,
    prepareWrite: advisoryWrite,
    autoPatch: advisoryWrite || repairPayload,
    hookPresent: hardWrite,
    hookRepair: repairPayload,
    mcpPresent: advisoryWrite,
    evidence: [
      ...new Set([
        ...capabilityEvidence['hard-write'],
        ...capabilityEvidence['advisory-write'],
        ...capabilityEvidence['repair-payload'],
      ]),
    ],
    gap,
  };
}
