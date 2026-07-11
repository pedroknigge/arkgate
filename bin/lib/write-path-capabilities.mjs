/**
 * Host-specific write enforcement inventory and active-host projection.
 *
 * Hard hooks, advisory MCP tools, CI merge gates, and repair payloads are
 * deliberately separate capabilities. Repo-wide inventory never becomes an
 * active-host guarantee unless that host owns the supporting evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  codexConfigPath,
  listCodexArkServerTables,
} from './codex-home.mjs';
import { detectActiveAgentHost } from './skill-install.mjs';
import { detectCiEnforcement } from './weakest-link.mjs';

export const WRITE_CAPABILITY_NAMES = [
  'hard-write',
  'advisory-write',
  'merge-gate',
  'repair-payload',
];

const KNOWN_HOSTS = ['claude', 'grok', 'cursor', 'codex'];

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
  const merge = detectCiEnforcement(root).arkWorkflowFiles;
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

export function buildWritePathCapabilityModel(root, explicitHost) {
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
    capabilities: capabilityMap(capabilityEvidence),
    capabilityEvidence,
    inventory,
  };
}
