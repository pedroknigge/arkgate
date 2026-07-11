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
import { generationIdentityForRoot } from './product-identity.mjs';

function installToolsForHost(activeHost) {
  return activeHost === 'unknown'
    ? 'claude,grok,cursor,codex'
    : activeHost;
}

export function detectWritePathCapabilities(root, explicitHost) {
  const identity = generationIdentityForRoot(root);
  const model = buildWritePathCapabilityModel(root, explicitHost);
  const { activeHost, support, capabilities, capabilityEvidence, inventory } = model;
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
  if (mode === 'none') {
    gap = {
      id: 'write-path-none',
      severity: 'warn',
      message:
        `Active host ${activeHost} has no hard write boundary or advisory ${identity.productName} MCP. ` +
        (capabilities['merge-gate']
          ? 'The CI check remains separate and does not block local writes.'
          : `No ${identity.productName} CI check was detected either.`),
      fix: arkCommand(
        root,
        identity.checkBin,
        `--install-agent-gates --tools ${tools}`
      ),
    };
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
        identity.checkBin,
        `--install-agent-gates --tools ${tools} --force`
      ),
    };
  } else if (mode === 'mcp-only') {
    gap = {
      id: 'write-path-mcp-only',
      severity: 'info',
      message:
        `Active host ${activeHost} has advisory prepare-write/autoPatch tools, ` +
        'but no hard write boundary; the CI check can still reject the change before merge.',
      fix: arkCommand(
        root,
        identity.checkBin,
        `--install-agent-gates --tools ${tools}`
      ),
    };
  }

  return {
    activeHost,
    support,
    supportSummary: formatHostSupportSummary(support),
    capabilities,
    capabilityEvidence,
    inventory,
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
