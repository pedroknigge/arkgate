/**
 * Version-matched agent contract projection formatters (ACS04).
 *
 * Split from agentProjection.ts: content identity, layer/catalog markdown,
 * projection body/block, and machine meta. Merge/stamp lives in
 * `agentProjectionMerge.ts`.
 *
 * Zero Node I/O. Optional CLI surface: generated `bin/lib/agent-projection-formatters.mjs`.
 */

import {
  AGENT_PROJECTION_END_MARKER,
  AGENT_PROJECTION_ENFORCEMENT_SURFACES,
  AGENT_PROJECTION_NON_ENFORCEMENT_LABEL,
  ARK_AGENT_PROJECTION_SCHEMA_VERSION,
  type AgentProjectionCatalogEntry,
  type AgentProjectionFacts,
  type AgentProjectionLayerSummary,
  type AgentProjectionMeta,
  type AgentProjectionProfile,
} from './agentProjectionTypes';

/** FNV-1a identity — portable, no Node crypto (same family as stableHash). */
export function agentProjectionContentIdentity(body: string): string {
  const normalized = String(body ?? '').replace(/\r\n/g, '\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeNewlines(text: string): string {
  return String(text ?? '').replace(/\r\n/g, '\n');
}

export function ensureTrailingNewline(text: string): string {
  const normalized = normalizeNewlines(text);
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

export function safeVersion(version: string | null | undefined): string {
  if (typeof version !== 'string' || version.trim().length === 0) return 'unknown';
  // Avoid breaking HTML comments / markdown with control chars.
  return version.trim().replace(/[>\s]/g, '');
}

function resolveProfile(profile: AgentProjectionProfile | null | undefined): AgentProjectionProfile {
  return profile === 'compact' ? 'compact' : 'full';
}

/**
 * Build the managed begin marker line (includes version + nonAuthoritative stamp).
 */
export function buildAgentProjectionBeginMarker(facts: {
  arkgateVersion: string;
  schemaVersion?: string;
}): string {
  const version = safeVersion(facts.arkgateVersion);
  const schema =
    typeof facts.schemaVersion === 'string' && facts.schemaVersion.trim()
      ? facts.schemaVersion.trim()
      : ARK_AGENT_PROJECTION_SCHEMA_VERSION;
  return `<!-- arkgate:agent-projection:begin schema=${schema} arkgateVersion=${version} nonAuthoritative=true -->`;
}

/**
 * Layer placement rows for the projection (compact markdown table).
 */
export function formatAgentProjectionLayers(
  layers: readonly AgentProjectionLayerSummary[] | null | undefined
): string {
  if (!Array.isArray(layers) || layers.length === 0) {
    return '_No project layers loaded — read `ark.config.json` or run `ark start` / `ark_manifest`._';
  }
  const rows = layers
    .map((layer) => {
      const name = layer.name?.trim() || 'Unknown';
      const patternList: readonly string[] = layer.patterns ?? [];
      const prefixList: readonly string[] = layer.intentPrefixes ?? [];
      const patterns =
        patternList.map((pattern: string) => `\`${pattern}\``).join(', ') || '—';
      const prefixes =
        prefixList.map((prefix: string) => `\`${prefix}\``).join(', ') || '—';
      return `| ${name} | ${patterns} | ${prefixes} |`;
    })
    .join('\n');
  return `| Layer | Patterns | Intent prefixes |
|-------|----------|-----------------|
${rows}`;
}

/**
 * Catalog short-list bullets (ruleId + title). Empty list → pointer only.
 */
export function formatAgentProjectionCatalogShortList(
  entries: readonly AgentProjectionCatalogEntry[] | null | undefined,
  docsPath: string
): string {
  const path = docsPath.trim() || 'docs/diagnostics.md';
  if (!Array.isArray(entries) || entries.length === 0) {
    return `Full public codes: \`${path}\` (and package \`DIAGNOSTIC_CATALOG\`).`;
  }
  const lines = entries
    .filter((entry) => entry && typeof entry.ruleId === 'string' && entry.ruleId.length > 0)
    .map((entry) => {
      const title =
        typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : entry.ruleId;
      return `- \`${entry.ruleId}\` — ${title}`;
    });
  return `${lines.join('\n')}

Full catalog: \`${path}\` (\`#RULE_ID\` anchors).`;
}

/**
 * Projection **body** only (no begin/end markers). Used for content-identity.
 */
export function buildAgentProjectionBody(facts: AgentProjectionFacts): string {
  const version = safeVersion(facts.arkgateVersion);
  const profile = resolveProfile(facts.profile);
  const checkCommand =
    typeof facts.checkCommand === 'string' && facts.checkCommand.trim()
      ? facts.checkCommand.trim()
      : 'ark-check --strict-config';
  const docsPath =
    typeof facts.diagnosticsDocsPath === 'string' && facts.diagnosticsDocsPath.trim()
      ? facts.diagnosticsDocsPath.trim()
      : 'docs/diagnostics.md';
  const hostRaw = typeof facts.host === 'string' ? facts.host.trim().toLowerCase() : '';
  const host = hostRaw && hostRaw !== 'unknown' ? hostRaw : null;
  const layers = Array.isArray(facts.layers) ? facts.layers : [];
  const catalog = Array.isArray(facts.catalogShortList) ? facts.catalogShortList : [];

  const lines: string[] = [
    '## ArkGate agent contract projection',
    '',
    AGENT_PROJECTION_NON_ENFORCEMENT_LABEL,
    '',
    `- **arkgateVersion:** \`${version}\` (must match the installed package; regenerate with \`ark agents-md --write\` after upgrade)`,
    `- **projectionSchema:** \`${ARK_AGENT_PROJECTION_SCHEMA_VERSION}\``,
    `- **profile:** \`${profile}\`${host ? ` · **host:** \`${host}\`` : ''}`,
    `- **after edits:** \`${checkCommand}\``,
    '',
  ];

  if (profile === 'compact') {
    lines.push(
      '### Primary path',
      '',
      '1. Run doctor (`ark-check --doctor`) — what is wrong and what to do first. Prefer the project-local CLI; do not wait on MCP “still connecting”.',
      '2. Name leftover work in plain language; never “done” on green imports alone while leftover design work remains.',
      '3. Identity handshake is optional when the CLI already resolved the project root. Call `ark_identity` only when using MCP evidence.',
      '4. Read the rules file with `ark_manifest` (same expectation) or the local `ark.config.json`. `ark://manifest` is compatibility-only / unverified.',
      '5. Place files inside configured layers; validate; run the check command above on violations — fix the import, do not weaken the rules file.',
      '6. Single door: illegal imports → fix; leftover design work → map then one small refactor with user OK.',
      '',
      '### Layers (summary)',
      '',
      formatAgentProjectionLayers(layers),
      ''
    );
  } else {
    lines.push(
      '### Contract layers',
      '',
      formatAgentProjectionLayers(layers),
      '',
      'When creating a **new** kind of code that no layer covers, update `ark.config.json` first (`/ark-adopt`), then place the file.',
      '',
      '### Diagnostic codes (short list)',
      '',
      formatAgentProjectionCatalogShortList(catalog, docsPath),
      '',
      '### Session truth',
      '',
      '- Machine snapshot: `ark status --json` (or MCP `ark_status`) — identity, activation honesty, last check, residual counts. **Not a score.**',
      '- Authoritative contract: local `ark.config.json` / CLI, or `ark_manifest` after a matched `ark_identity` handshake. Identity is optional when CLI already resolved the root.',
      '- Host docs: the same projection schema is merged into `AGENTS.md` and `CLAUDE.md` (`ark agents-md --write`).',
      ''
    );
  }

  lines.push(
    '### Enforcement surfaces (authoritative)',
    '',
    AGENT_PROJECTION_ENFORCEMENT_SURFACES.map((surface) => `- \`${surface}\``).join('\n'),
    ''
  );

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/**
 * Full managed block: begin marker + body + end marker.
 */
export function buildAgentProjectionBlock(facts: AgentProjectionFacts): string {
  const body = buildAgentProjectionBody(facts);
  const begin = buildAgentProjectionBeginMarker({
    arkgateVersion: facts.arkgateVersion,
    schemaVersion: ARK_AGENT_PROJECTION_SCHEMA_VERSION,
  });
  return `${begin}\n${body}${AGENT_PROJECTION_END_MARKER}\n`;
}

/**
 * Machine meta for CLI `--json` / tests (never a gate input).
 */
export function buildAgentProjectionMeta(facts: AgentProjectionFacts): AgentProjectionMeta {
  const body = buildAgentProjectionBody(facts);
  const layers = Array.isArray(facts.layers) ? facts.layers : [];
  const catalog = Array.isArray(facts.catalogShortList) ? facts.catalogShortList : [];
  return {
    schemaVersion: ARK_AGENT_PROJECTION_SCHEMA_VERSION,
    arkgateVersion: safeVersion(facts.arkgateVersion),
    nonAuthoritative: true,
    enforcementSurfaces: [...AGENT_PROJECTION_ENFORCEMENT_SURFACES],
    contentIdentity: agentProjectionContentIdentity(body),
    layerCount: layers.length,
    catalogCodeCount: catalog.filter((entry) => entry?.ruleId).length,
    profile: resolveProfile(facts.profile),
  };
}
