/**
 * Canonical host support promises.
 *
 * These records describe what ArkGate can install for each supported host.
 * Installed evidence remains authoritative for a specific repository and is
 * reported separately by write-path-capabilities.mjs.
 */

/**
 * @param {string} label
 * @param {string|null} hookPath
 * @param {string|null} hookSurface
 * @param {string[]} hookOperations
 * @param {boolean} hardWrite
 * @param {boolean} repairPayload reinjection guaranteed under hard boundary (historical key)
 * @param {{ repairEnvelopeEmitted?: boolean, operationCoverage?: Record<string, boolean> }} [extras]
 */
function hostProfile(label, hookPath, hookSurface, hookOperations, hardWrite, repairPayload, extras = {}) {
  // EH07: repair envelope emission ≠ reinjection guarantee.
  // Cursor/Codex hooks may emit --hook-repair JSON while reinjection stays host-dependent.
  const repairEnvelopeEmitted =
    extras.repairEnvelopeEmitted === true || repairPayload === true;
  const repairReinjectionGuaranteed = hardWrite === true && repairPayload === true;
  return Object.freeze({
    label,
    hookPath,
    hookSurface,
    hookOperations: Object.freeze(hookOperations),
    capabilities: Object.freeze({
      'hard-write': hardWrite,
      'advisory-write': true,
      'merge-gate': true,
      // Historical key: true only when hard reinjection path is package-supported.
      'repair-payload': repairPayload,
      'repair-envelope-emitted': repairEnvelopeEmitted,
      'repair-reinjection-guaranteed': repairReinjectionGuaranteed,
    }),
    // EH07 minimum ops matrix (hard=false for soft hosts on every listed op).
    operationCoverage: Object.freeze(
      extras.operationCoverage ||
        Object.fromEntries(hookOperations.map((op) => [op, hardWrite === true]))
    ),
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
  // Google Antigravity: official PreToolUse deny is a hard block. Claim hard only when
  // installed + trusted and the listed write tools are covered by the adapter.
  antigravity: hostProfile(
    'Google Antigravity',
    '.agents/hooks.json',
    'PreToolUse `write_to_file` / `replace_file_content` / `multi_replace_file_content`',
    ['write_to_file', 'replace_file_content', 'multi_replace_file_content'],
    true,
    true
  ),
  // Cursor: official preToolUse deny / exit 2 is a hard block for matched tools when
  // `.cursor/hooks.json` is installed + trusted. Claim hard only for Write|StrReplace;
  // Shell/Tab/human edits still rely on CI. Repair envelope may emit; Write updated_input
  // reinjection is not guaranteed on Cursor (agent_message + retry is the supported path).
  cursor: hostProfile(
    'Cursor',
    '.cursor/hooks.json',
    'preToolUse `Write` / `StrReplace`',
    ['Write', 'StrReplace'],
    true,
    false,
    {
      repairEnvelopeEmitted: true,
      operationCoverage: {
        Write: true,
        StrReplace: true,
        shell: false,
        'pre-commit': false,
      },
    }
  ),
  codex: hostProfile(
    'OpenAI Codex',
    '.codex/hooks.json',
    'PreToolUse `apply_patch` in Codex CLI and local ChatGPT Desktop/App Server',
    ['apply_patch'],
    true,
    false,
    {
      // Install writes --hook-repair; envelope can emit, but host reinjection is not guaranteed.
      repairEnvelopeEmitted: true,
      operationCoverage: {
        apply_patch: true,
        shell: false,
        'pre-commit': false,
      },
    }
  ),
  // OpenCode: first-class MCP + permissions; plugin tool.execute.before is incomplete
  // (subagent holes). Never claim hard write.
  opencode: hostProfile(
    'OpenCode',
    null,
    'Advisory MCP + optional experimental plugin (`tool.execute.before`); not a hard boundary',
    [],
    false,
    false,
    {
      operationCoverage: { shell: false, 'pre-commit': false },
    }
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
  // EH07 three-way repair story: reinjection guaranteed / envelope-only / none.
  let repair;
  if (capabilities['repair-reinjection-guaranteed']) {
    repair = 'repair reinjection (hard path)';
  } else if (capabilities['repair-envelope-emitted']) {
    repair = 'repair envelope may emit (reinjection not guaranteed)';
  } else {
    repair = 'no hard-boundary repair';
  }
  return `${write} + advisory MCP + CI check + ${repair}`;
}

export function renderHostSupportMatrixMarkdown() {
  const rows = HOST_SUPPORT_HOSTS.map((host) => {
    const profile = HOST_SUPPORT_MATRIX[host];
    const capabilities = profile.capabilities;
    // Fail-closed honesty: hard hosts claim only listed operations when hooks are
    // installed + trusted. OpenCode remains advisory; CI is required-status.
    // hookSurface already includes "PreToolUse/preToolUse …" — do not prefix again.
    let local;
    if (capabilities['hard-write']) {
      local = `**Hard** block for listed ops (${profile.hookSurface}) when installed + trusted`;
    } else if (host === 'opencode') {
      local =
        '**Advisory / best-effort** at write (MCP + optional plugin; not a hard boundary)';
    } else {
      local = '**Advisory only** at write (no hard hook)';
    }
    // EH07: distinguish envelope emission vs reinjection guarantee in the repair column.
    let repair;
    if (capabilities['repair-reinjection-guaranteed']) {
      repair = 'Emitted on hook deny; host must re-inject (hard path when installed + trusted)';
    } else if (capabilities['repair-envelope-emitted']) {
      repair = 'Envelope may emit (`--hook-repair`); reinjection **not** guaranteed';
    } else {
      repair = 'No hard-boundary payload';
    }
    // EH07: name the CLI explicitly; required status is a GitHub status context name, not the CLI alone.
    const merge =
      '**Required GitHub status context** running `arkgate-check --strict-merge` (alias `ark-check`)';
    return `| ${profile.label} | ${local} | Advisory; the agent must call it | ${merge} | ${repair} |`;
  }).join('\n');

  return `| Host | Local write boundary | MCP validation | CI / merge path | Repair payload |
|------|----------------------|----------------|-----------------|----------------|
${rows}

**Read the CI column:** for every host, the repository-wide hard guarantee is a **required**
GitHub **status context** that runs the CLI — not “CI file present,” and not the CLI binary name alone.
Codex hard write covers only a complete local \`apply_patch\`; Cursor covers only listed
\`preToolUse\` ops. In both cases the project hook must be installed + trusted, while shell/direct
filesystem writes, hosted or specialized opt-out paths, and human edits still rely on CI.

This table describes the supported profile **after its files are installed and the host loads/trusts them**. A hard local boundary covers only the listed hook operations; alternate tools, direct filesystem writes, and human edits still rely on CI. MCP validation is advisory because the agent must call it. The CI check blocks a merge only when the repository makes that status required. Repair **envelopes** may be emitted without reinjection being guaranteed; silent auto-apply never happens. Run \`arkgate-check --doctor\` (or \`ark-check --doctor\`) for the evidence actually detected in the current repository.`;
}

/**
 * EH07 doctor/JSON host capability split for repair envelope vs reinjection.
 * @param {string|null|undefined} host
 */
export function hostRepairCapabilities(host) {
  const profile = getHostSupportProfile(host);
  if (!profile) {
    return {
      repairEnvelopeEmitted: false,
      repairReinjectionGuaranteed: false,
      operationCoverage: {},
    };
  }
  return {
    repairEnvelopeEmitted: profile.capabilities['repair-envelope-emitted'] === true,
    repairReinjectionGuaranteed: profile.capabilities['repair-reinjection-guaranteed'] === true,
    operationCoverage: { ...(profile.operationCoverage || {}) },
  };
}

/**
 * Doctor human one-liner for active-host write honesty (fail-closed).
 * @returns {string|null}
 */
export function doctorWritePathHonestyMessage(activeHost, hardWriteActive) {
  const host = typeof activeHost === 'string' ? activeHost.trim().toLowerCase() : '';
  // EH07: distinguish CLI command (arkgate-check / ark-check) from the GitHub required status context name.
  const mergeBoundary =
    'Required CI hard merge boundary = a required GitHub status context that runs arkgate-check --strict-merge (alias ark-check --strict-merge)';
  if (host === 'cursor' && !hardWriteActive) {
    return `Cursor: pre-write block is supported for Write/StrReplace when .cursor/hooks.json is installed + trusted; without runtime-observed hook evidence, the block is unverified. ${mergeBoundary}.`;
  }
  if (host === 'codex' && !hardWriteActive) {
    return `Codex: a trusted PreToolUse hook can block complete local apply_patch calls in CLI and Desktop; without fresh runtime-observed apply_patch evidence, the block is unverified. Specialized/hosted paths and direct writes still rely on CI. ${mergeBoundary}.`;
  }
  if (host === 'opencode') {
    return `OpenCode: edits are warning only (not blocked). ${mergeBoundary}.`;
  }
  if ((host === 'claude' || host === 'grok' || host === 'antigravity') && !hardWriteActive) {
    const label =
      host === 'claude' ? 'Claude' : host === 'grok' ? 'Grok' : 'Antigravity';
    return `${label}: pre-write block is supported for listed ops when installed + trusted; without runtime-observed hook evidence, the block is unverified. ${mergeBoundary}.`;
  }
  return null;
}
