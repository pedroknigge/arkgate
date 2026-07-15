/**
 * Host-specific write enforcement inventory and active-host projection.
 *
 * Hard hooks, advisory MCP tools, CI checks, and repair payloads are
 * deliberately separate capabilities. Repo-wide inventory never becomes an
 * active-host guarantee unless that host owns the supporting evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  codexConfigPath,
  listCodexArkServerTables,
} from './codex-home.mjs';
import {
  getHostSupportProfile,
  HOST_SUPPORT_HOSTS,
} from './host-support-matrix.mjs';
import { detectActiveAgentHost } from './skill-install.mjs';
import { detectCiEnforcement } from './weakest-link.mjs';

export const WRITE_CAPABILITY_NAMES = [
  'hard-write',
  'advisory-write',
  'merge-gate',
  'repair-payload',
];

function boundaryState({ supported, evidence, active, bypassable, hard = false, extra = {} }) {
  return {
    supported,
    installed: evidence.length > 0,
    active,
    bypassable,
    hard,
    evidence: [...evidence],
    ...extra,
  };
}

function operationCovered(profile, operation) {
  if (!profile || typeof operation !== 'string') return false;
  const normalized = operation.trim().toLowerCase();
  return profile.hookOperations.some((candidate) => candidate.toLowerCase() === normalized);
}

function buildEnforcementLadder(activeHost, support, evidence, attempt) {
  const localInstalled = evidence['hard-write'].length > 0;
  const observedPreTool = attempt?.boundary === 'pre-tool';
  const covered = observedPreTool && operationCovered(support, attempt.operation);
  const hard = Boolean(
    support?.capabilities['hard-write'] && (localInstalled || observedPreTool) && covered
  );
  const inferredActive = (installed) => (installed ? 'unverified' : false);
  return {
    schemaVersion: '1.0',
    activeHost,
    localWrite: boundaryState({
      supported: Boolean(support?.capabilities['hard-write']),
      evidence: evidence['hard-write'],
      active: observedPreTool ? covered : inferredActive(localInstalled),
      bypassable: !hard,
      hard,
      extra: {
        installed: localInstalled || observedPreTool,
        completePatch: Boolean(covered && attempt?.completePatch),
        coverage: covered && attempt?.completePatch ? 'complete-patch' : support?.hookSurface ?? null,
        ...(observedPreTool
          ? { operation: attempt.operation, operationCovered: covered }
          : { operationCovered: 'unverified' }),
      },
    }),
    advisoryMcp: boundaryState({
      supported: Boolean(support?.capabilities['advisory-write']),
      evidence: evidence['advisory-write'],
      active: inferredActive(evidence['advisory-write'].length > 0),
      bypassable: true,
    }),
    ciMerge: boundaryState({
      supported: true,
      evidence: evidence['merge-gate'],
      active: inferredActive(evidence['merge-gate'].length > 0),
      bypassable: 'unknown',
      extra: { requiredStatus: 'unverified' },
    }),
  };
}

const KNOWN_HOSTS = HOST_SUPPORT_HOSTS;

function unique(values) {
  return [...new Set(values)];
}

function emptyEvidence() {
  return {
    'hard-write': [],
    'advisory-write': [],
    'merge-gate': [],
    'repair-payload': [],
  };
}

function capabilityMap(evidence) {
  return {
    'hard-write': evidence['hard-write'].length > 0,
    'advisory-write': evidence['advisory-write'].length > 0,
    'merge-gate': evidence['merge-gate'].length > 0,
    'repair-payload': evidence['repair-payload'].length > 0,
  };
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function relativeEvidencePath(root, file) {
  const relative = path.relative(root, file);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return file.split(path.sep).join('/');
}

function isArkMcpText(text) {
  return (
    /\b(ark|arkgate)-mcp\b/.test(text) ||
    /mcp_servers\.ark\b/.test(text) ||
    /"ark"\s*:\s*\{/.test(text) ||
    /mcpServers[\s\S]*\bark\b/.test(text)
  );
}

function hookEvidence(root, relativePath) {
  const text = readText(path.join(root, relativePath));
  const hard = Boolean(text && /--hook\b/.test(text));
  const repair = Boolean(
    hard &&
      (/--hook-repair\b/.test(text) ||
        /ARK_HOOK_REPAIR\s*=\s*['"]?(1|true|yes|on)/i.test(text))
  );
  return {
    hard: hard ? [relativePath] : [],
    repair: repair ? [relativePath] : [],
  };
}

function mcpEvidence(root, relativePath) {
  const text = readText(path.join(root, relativePath));
  return isArkMcpText(text) ? [relativePath] : [];
}

function codexMcpEvidence(root) {
  const file = codexConfigPath();
  const text = readText(file);
  const resolvedRoot = path.resolve(root);
  const registered = listCodexArkServerTables(text).some((entry) => {
    if (!entry.root || !/\b(ark|arkgate)-mcp\b/.test(entry.block)) return false;
    return path.resolve(entry.root) === resolvedRoot;
  });
  return registered ? [relativeEvidencePath(root, file)] : [];
}

function hostRecord(hard, advisory, repair, merge) {
  const evidence = {
    'hard-write': unique(hard),
    'advisory-write': unique(advisory),
    'merge-gate': unique(merge),
    'repair-payload': unique(repair),
  };
  return {
    configured:
      evidence['hard-write'].length > 0 ||
      evidence['advisory-write'].length > 0,
    capabilities: capabilityMap(evidence),
    evidence,
  };
}

export function detectWritePathInventory(root) {
  // Merge-gate evidence only when CI uses the fail-closed profile (not bare ark-check).
  const ci = detectCiEnforcement(root);
  const merge = ci.failClosed ? ci.arkWorkflowFiles : [];
  const claudeHook = hookEvidence(root, '.claude/settings.json');
  const grokHook = hookEvidence(root, '.grok/hooks/ark-write-gate.json');
  const hosts = {
    claude: hostRecord(
      claudeHook.hard,
      mcpEvidence(root, '.mcp.json'),
      claudeHook.repair,
      merge
    ),
    grok: hostRecord(
      grokHook.hard,
      mcpEvidence(root, '.grok/config.toml'),
      grokHook.repair,
      merge
    ),
    cursor: hostRecord([], mcpEvidence(root, '.cursor/mcp.json'), [], merge),
    // Codex 0.123+ emits PreToolUse for the native apply_patch handler, but some
    // Code Mode hosts execute deferred nested writes without dispatching that
    // project hook. Keep the installed hook as best-effort protection; do not
    // report a hard boundary that cannot be verified for every write surface.
    codex: hostRecord([], codexMcpEvidence(root), [], merge),
  };

  const evidence = emptyEvidence();
  for (const host of KNOWN_HOSTS) {
    for (const capability of WRITE_CAPABILITY_NAMES) {
      evidence[capability].push(...hosts[host].evidence[capability]);
    }
  }
  for (const capability of WRITE_CAPABILITY_NAMES) {
    evidence[capability] = unique(evidence[capability]);
  }

  return {
    capabilities: capabilityMap(evidence),
    evidence,
    hosts,
  };
}

export function buildWritePathCapabilityModel(root, explicitHost, attempt) {
  const inventory = detectWritePathInventory(root);
  const detectedHost = explicitHost ?? detectActiveAgentHost();
  const activeHost = KNOWN_HOSTS.includes(detectedHost) ? detectedHost : 'unknown';
  const activeRecord = inventory.hosts[activeHost];
  const capabilityEvidence = activeRecord
    ? Object.fromEntries(
        WRITE_CAPABILITY_NAMES.map((name) => [name, [...activeRecord.evidence[name]]])
      )
    : {
        ...emptyEvidence(),
        'merge-gate': [...inventory.evidence['merge-gate']],
      };

  return {
    activeHost,
    support: getHostSupportProfile(activeHost),
    capabilities: capabilityMap(capabilityEvidence),
    capabilityEvidence,
    enforcementLadder: buildEnforcementLadder(
      activeHost,
      getHostSupportProfile(activeHost),
      capabilityEvidence,
      attempt
    ),
    inventory,
  };
}
