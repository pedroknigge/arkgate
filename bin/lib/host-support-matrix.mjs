/**
 * Canonical host support promises.
 *
 * These records describe what ArkGate can install for each supported host.
 * Installed evidence remains authoritative for a specific repository and is
 * reported separately by write-path-capabilities.mjs.
 */

function hostProfile(label, hookPath, hookSurface, hookOperations, hardWrite, repairPayload) {
  return Object.freeze({
    label,
    hookPath,
    hookSurface,
    hookOperations: Object.freeze(hookOperations),
    capabilities: Object.freeze({
      'hard-write': hardWrite,
      'advisory-write': true,
      'merge-gate': true,
      'repair-payload': repairPayload,
    }),
  });
}

export const HOST_SUPPORT_MATRIX = Object.freeze({
  claude: hostProfile(
    'Claude Code',
    '.claude/settings.json',
    'PreToolUse `Write` / `Edit` / `MultiEdit`',
    ['Write', 'Edit', 'MultiEdit'],
    true,
    true
  ),
  grok: hostProfile(
    'Grok Build',
    '.grok/hooks/ark-write-gate.json',
    'PreToolUse `write` / `search_replace` (plus aliases)',
    ['write', 'search_replace'],
    true,
    true
  ),
  cursor: hostProfile('Cursor', null, null, [], false, false),
  codex: hostProfile(
    'OpenAI Codex',
    '.codex/hooks.json',
    'Best-effort PreToolUse `apply_patch`; Code Mode hosts may bypass the event',
    ['apply_patch'],
    false,
    false
  ),
});

export const HOST_SUPPORT_HOSTS = Object.freeze(Object.keys(HOST_SUPPORT_MATRIX));

export function getHostSupportProfile(host) {
  const normalized = typeof host === 'string' ? host.trim().toLowerCase() : '';
  return HOST_SUPPORT_MATRIX[normalized] ?? null;
}

export function formatHostSupportSummary(profile) {
  if (!profile) return 'unknown host; no local write guarantee';
  const capabilities = profile.capabilities;
  const write = capabilities['hard-write']
    ? 'hard local write boundary'
    : 'no hard local write boundary';
  const repair = capabilities['repair-payload'] ? 'repair payload' : 'no hard-boundary repair';
  return `${write} + advisory MCP + CI check + ${repair}`;
}

export function renderHostSupportMatrixMarkdown() {
  const rows = HOST_SUPPORT_HOSTS.map((host) => {
    const profile = HOST_SUPPORT_MATRIX[host];
    const capabilities = profile.capabilities;
    const local = capabilities['hard-write']
      ? `Hard block for ${profile.hookSurface}`
      : 'No hard hook; MCP/rules are advisory';
    const repair = capabilities['repair-payload']
      ? 'Emitted on hook deny; host must re-inject'
      : 'No hard-boundary payload';
    return `| ${profile.label} | ${local} | Advisory; the agent must call it | Available \`arkgate-check --strict-merge\` check | ${repair} |`;
  }).join('\n');

  return `| Host | Local write boundary | MCP validation | CI / merge path | Repair payload |
|------|----------------------|----------------|-----------------|----------------|
${rows}

This table describes the supported profile **after its files are installed and the host loads/trusts them**. A hard local boundary covers only the listed hook operations; alternate tools, direct filesystem writes, and human edits still rely on CI. MCP validation is advisory because the agent must call it. The CI check blocks a merge only when the repository makes that status required. Repair payloads never write code silently: the host must re-inject the candidate and ArkGate revalidates it. Run \`arkgate-check --doctor\` for the evidence actually detected in the current repository.`;
}
