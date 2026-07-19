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
  codexProjectMcpIsValid,
  codexConfigPath,
  extractCodexArgsFromBlock,
  listCodexArkServerTables,
} from './codex-home.mjs';
import {
  getHostSupportProfile,
  HOST_SUPPORT_HOSTS,
} from './host-support-matrix.mjs';
import { detectActiveAgentHost } from './skill-install.mjs';
import { detectCiEnforcement } from './weakest-link.mjs';
import { buildEnforcementState } from './enforcement-state.mjs';

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

function isArkMcpToken(value) {
  if (typeof value !== 'string') return false;
  return /^(?:arkgate-mcp|ark-mcp)(?:\.mjs)?$/.test(
    path.basename(value.trim().replace(/\\/g, '/'))
  );
}

function arkMcpInvocation(server) {
  if (!server || typeof server !== 'object' || typeof server.command !== 'string') return false;
  if (server.args !== undefined && !Array.isArray(server.args)) return false;
  const args = server.args ?? [];
  if (!args.every((value) => typeof value === 'string')) return false;
  const argv = [server.command, ...args];
  if (argv.filter(isArkMcpToken).length !== 1) return false;
  if (isArkMcpToken(server.command)) return { argv, binIndex: 0 };
  const runner = path.basename(server.command.trim().replace(/\\/g, '/'));
  if (['npx', 'yarn'].includes(runner) && isArkMcpToken(args[0])) {
    return { argv, binIndex: 1 };
  }
  if (runner === 'node') {
    const script = args[0]?.replace(/\\/g, '/');
    return isArkMcpToken(script) && /(?:^|\/)bin\/ark-mcp\.mjs$/.test(script)
      ? { argv, binIndex: 1 }
      : false;
  }
  if (runner === 'pnpm') {
    const prefix = args[0] === 'exec'
      ? 1
      : args[0] === '--config.verify-deps-before-run=false' && args[1] === 'exec'
        ? 2
        : 0;
    return prefix > 0 && isArkMcpToken(args[prefix])
      ? { argv, binIndex: prefix + 1 }
      : false;
  }
  return false;
}

function mcpServerRunsArk(server) {
  return Boolean(arkMcpInvocation(server));
}

function commandArkMcpInvocation(command) {
  if (typeof command !== 'string') return false;
  const words = [];
  for (const match of command.matchAll(/"([^"]*)"|'([^']*)'|(&&|\|\||[;|#])|([^\s;&|#]+)/g)) {
    if (match[3]) break;
    words.push(match[1] ?? match[2] ?? match[4]);
  }
  if (path.basename(words[0]?.replace(/\\/g, '/') ?? '') === 'env') words.shift();
  const environment = {};
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0] ?? '')) {
    const assignment = words.shift();
    const split = assignment.indexOf('=');
    const value = assignment.slice(split + 1);
    environment[assignment.slice(0, split)] = /^(['"]).*\1$/.test(value)
      ? value.slice(1, -1)
      : value;
  }
  const [executable, ...args] = words;
  const invocation = arkMcpInvocation({ command: executable, args });
  return invocation
    ? { ...invocation, binArgs: invocation.argv.slice(invocation.binIndex + 1), environment }
    : false;
}

function requiredWriteOperations(relativePath) {
  return relativePath.startsWith('.grok/')
    ? ['write', 'search_replace']
    : ['Write', 'Edit', 'MultiEdit'];
}

function matcherOperations(relativePath, matcher) {
  const required = requiredWriteOperations(relativePath);
  if (typeof matcher !== 'string' || matcher.trim() === '') return required;
  try {
    const pattern = new RegExp(`^(?:${matcher})$`);
    return required.filter((operation) => pattern.test(operation));
  } catch {
    return [];
  }
}

function jsonArkMcpIsValid(text) {
  try {
    return mcpServerRunsArk(JSON.parse(text)?.mcpServers?.ark);
  } catch {
    return false;
  }
}

function tomlMcpBlockIsValid(block) {
  const matches = [
    ...block.matchAll(
      /^[ \t]*command[ \t]*=[ \t]*("(?:\\.|[^"\\])*"|'[^']*')[ \t]*(?:#.*)?$/gm
    ),
  ];
  const args = extractCodexArgsFromBlock(block);
  if (matches.length !== 1 || !args) return false;
  const validLine = (line) =>
    /^[ \t]*(?:#.*)?$/.test(line) ||
    /^[ \t]*\[.*\][ \t]*(?:#.*)?$/.test(line) ||
    /^[ \t]*command[ \t]*=[ \t]*("(?:\\.|[^"\\])*"|'[^']*')[ \t]*(?:#.*)?$/.test(line) ||
    /^[ \t]*args[ \t]*=[ \t]*\[[^\]\r\n]*\][ \t]*(?:#.*)?$/.test(line);
  if (block.split('\n').some((line) => !validLine(line))) return false;
  let command;
  try {
    command = matches[0][1].startsWith('"')
      ? JSON.parse(matches[0][1])
      : matches[0][1].slice(1, -1);
  } catch {
    return false;
  }
  return mcpServerRunsArk({ command, args });
}

function tomlArkMcpIsValid(text) {
  const primary = listCodexArkServerTables(text).filter((entry) => entry.table === 'ark');
  return primary.length === 1 && tomlMcpBlockIsValid(primary[0].block);
}

function hookEvidence(root, relativePath) {
  const text = readText(path.join(root, relativePath));
  let hooks = [];
  try {
    const groups = JSON.parse(text)?.hooks?.PreToolUse;
    if (Array.isArray(groups)) {
      hooks = groups.flatMap((group) =>
        Array.isArray(group?.hooks)
          ? group.hooks
              .filter((hook) => !hook?.type || hook.type === 'command')
              .map((hook) => ({
                hook,
                invocation: commandArkMcpInvocation(hook?.command),
                operations: matcherOperations(relativePath, group.matcher),
              }))
              .filter((entry) => entry.invocation)
          : []
      );
    }
  } catch {
    hooks = [];
  }
  const hardHooks = hooks.filter((entry) => entry.invocation.binArgs.includes('--hook'));
  const required = requiredWriteOperations(relativePath);
  const hard = required.every((operation) =>
    hardHooks.some((entry) => entry.operations.includes(operation))
  );
  const repair = hard && required.every((operation) =>
    hardHooks.some(({ hook, invocation, operations }) =>
      operations.includes(operation) &&
      (invocation.binArgs.includes('--hook-repair') ||
        /^(?:1|true|yes|on)$/i.test(
          String(hook.env?.ARK_HOOK_REPAIR ?? invocation.environment.ARK_HOOK_REPAIR ?? '')
        ))
    )
  );
  return {
    hard: hard ? [relativePath] : [],
    repair: repair ? [relativePath] : [],
  };
}

function mcpEvidence(root, relativePath) {
  const text = readText(path.join(root, relativePath));
  const valid = relativePath.endsWith('.toml')
    ? tomlArkMcpIsValid(text)
    : jsonArkMcpIsValid(text);
  return valid ? [relativePath] : [];
}

function codexMcpEvidence(root) {
  const projectFile = path.join(root, '.codex', 'config.toml');
  const projectText = readText(projectFile);
  const projectRegistered =
    codexProjectMcpIsValid(projectText, root) && tomlArkMcpIsValid(projectText);
  if (projectRegistered) return ['.codex/config.toml'];

  const file = codexConfigPath();
  const text = readText(file);
  const resolvedRoot = path.resolve(root);
  const tables = listCodexArkServerTables(text);
  const registered = new Set(tables.map((entry) => entry.table)).size === tables.length && tables.some((entry) => {
    if (!entry.root || !tomlMcpBlockIsValid(entry.block)) return false;
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
    ci,
  };
}

export function buildWritePathCapabilityModel(root, explicitHost, attempt) {
  const inventory = detectWritePathInventory(root);
  const ci = inventory.ci;
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

  const model = {
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
  model.enforcementState = buildEnforcementState(root, { ...model, ci });
  model.enforcementLadder.ciMerge.requiredStatus = model.enforcementState.ciMerge.required;
  return model;
}
