/**
 * Version-matched agent contract projection (ACS04).
 *
 * Compact agent-facing markdown (plus meta) derived from the installed package
 * version and an effective project contract summary. Explicitly **non-authoritative**:
 * enforcement is ark-check / hooks / CI — never this projection, AGENTS.md, or skills.
 *
 * **Canonical** for `ark agents-md`, install/upgrade AGENTS embedding, and drift tests.
 * Tooling gathers filesystem facts; this module only formats pure inputs.
 *
 * Zero Node I/O. Optional CLI surface: generated `bin/lib/agent-projection.mjs`.
 *
 * @see docs/plans/agent-contract-surface-4.3/README.md
 */

export const ARK_AGENT_PROJECTION_SCHEMA_VERSION = '1.0' as const;

/** Begin marker for the managed projection region inside AGENTS.md (or equivalent). */
export const AGENT_PROJECTION_BEGIN_MARKER = '<!-- arkgate:agent-projection:begin' as const;

/** End marker for the managed projection region. */
export const AGENT_PROJECTION_END_MARKER = '<!-- arkgate:agent-projection:end -->' as const;

/**
 * Non-enforcement label — must appear in every generated projection body.
 * Agents and humans must not treat the projection as a pass/fail authority.
 */
export const AGENT_PROJECTION_NON_ENFORCEMENT_LABEL =
  'This projection is **non-authoritative**. Enforcement is `ark-check` / host write hooks / required CI (`--strict-merge`), not AGENTS.md, skills, or this block.' as const;

/** Surfaces that actually enforce (closed vocabulary for meta + docs). */
export const AGENT_PROJECTION_ENFORCEMENT_SURFACES = Object.freeze([
  'ark-check',
  'host-write-hooks',
  'ci-strict-merge',
] as const);

/**
 * High-signal public ruleIds for the compact catalog short list in the projection.
 * Full catalog remains `docs/diagnostics.md` / `DIAGNOSTIC_CATALOG` (ACS02).
 * Titles are supplied by Tooling from the catalog when available.
 */
export const DEFAULT_AGENT_PROJECTION_RULE_IDS: readonly string[] = Object.freeze([
  'LAYER_IMPORT_VIOLATION',
  'LAYER_INTENT_REFERENCE_VIOLATION',
  'CIRCULAR_DEPENDENCY',
  'CAPABILITY_VIOLATION',
  'RAW_EVENT_PUBLISH',
  'ARKRULE_STRUCTURE',
  'ATOMIC_PREFLIGHT_UNAVAILABLE',
  'ANALYSIS_PARSE_INCOMPLETE',
  'ARK_UNKNOWN',
]);

export type AgentProjectionLayerSummary = {
  name: string;
  patterns?: readonly string[];
  intentPrefixes?: readonly string[];
};

export type AgentProjectionCatalogEntry = {
  ruleId: string;
  title: string;
};

export type AgentProjectionProfile = 'compact' | 'full';

/**
 * Pure facts supplied by Tooling after reading package version + ark.config.
 * Domain never opens files or prompts.
 */
export type AgentProjectionFacts = {
  /** Installed / shipping arkgate package version (stamped into the projection). */
  arkgateVersion: string;
  /** Project check command hint (e.g. `npm run check:architecture`). */
  checkCommand?: string | null;
  /** Effective layers from ark.config.json (null/empty → stock note). */
  layers?: readonly AgentProjectionLayerSummary[] | null;
  /** Short diagnostic catalog lines (ruleId + title). */
  catalogShortList?: readonly AgentProjectionCatalogEntry[] | null;
  /** Active host id when known (compact router context). */
  host?: string | null;
  /** full = placement + catalog short list; compact = thinner primary path. */
  profile?: AgentProjectionProfile | null;
  /** Docs path for the full diagnostic catalog (relative). */
  diagnosticsDocsPath?: string | null;
};

export type AgentProjectionMeta = {
  schemaVersion: typeof ARK_AGENT_PROJECTION_SCHEMA_VERSION;
  arkgateVersion: string;
  /** Always true — projection is never a gate input. */
  nonAuthoritative: true;
  enforcementSurfaces: readonly string[];
  /** Content identity of the projection body (markers excluded). */
  contentIdentity: string;
  layerCount: number;
  catalogCodeCount: number;
  profile: AgentProjectionProfile;
};

export type AgentProjectionMergeAction =
  | 'created'
  | 'block-replaced'
  | 'block-inserted'
  | 'unchanged';

export type AgentProjectionMergeResult = {
  content: string;
  action: AgentProjectionMergeAction;
  previousBlock: string | null;
  contentIdentity: string;
  /** True when customized text outside the managed block was preserved. */
  preservedOutsideBlock: boolean;
};

const BEGIN_LINE_RE =
  /<!--\s*arkgate:agent-projection:begin\b([^>]*)-->/i;
const END_LINE_RE = /<!--\s*arkgate:agent-projection:end\s*-->/i;
const VERSION_ATTR_RE = /\barkgateVersion=([^\s-->]+)/i;
const SCHEMA_ATTR_RE = /\bschema=([^\s-->]+)/i;

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

function normalizeNewlines(text: string): string {
  return String(text ?? '').replace(/\r\n/g, '\n');
}

function ensureTrailingNewline(text: string): string {
  const normalized = normalizeNewlines(text);
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

function safeVersion(version: string | null | undefined): string {
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
      '1. Call `ark_identity` with `project.expectedRoot` at the exact project root; reuse root + `projectId` on Ark MCP calls.',
      '2. Read the contract with `ark_manifest` (same expectation). `ark://manifest` is compatibility-only / unverified.',
      '3. Place files inside configured layers; validate; run the check command above on violations — fix architecture, do not weaken the gate.',
      '',
      '### Contract layers (summary)',
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
      'When creating a **new** kind of code that no layer covers, update `ark.config.json` first (`/ark-contract`), then place the file.',
      '',
      '### Diagnostic codes (short list)',
      '',
      formatAgentProjectionCatalogShortList(catalog, docsPath),
      '',
      '### Session truth',
      '',
      '- Machine snapshot: `ark status --json` (or MCP `ark_status`) — identity, activation honesty, last check, residual counts. **Not a score.**',
      '- Authoritative contract: `ark_manifest` after a matched `ark_identity` handshake.',
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

/**
 * Extract the managed projection block from a document (AGENTS.md or equivalent).
 */
export function extractAgentProjectionBlock(document: string): {
  block: string | null;
  body: string | null;
  before: string;
  after: string;
  beginAttrs: string | null;
} {
  const text = normalizeNewlines(document ?? '');
  const beginMatch = BEGIN_LINE_RE.exec(text);
  if (!beginMatch) {
    return { block: null, body: null, before: text, after: '', beginAttrs: null };
  }
  const beginIndex = beginMatch.index;
  const beginEnd = beginIndex + beginMatch[0].length;
  const rest = text.slice(beginEnd);
  const endMatch = END_LINE_RE.exec(rest);
  if (!endMatch) {
    // Unclosed block: treat as absent so merge can insert a well-formed block.
    return { block: null, body: null, before: text, after: '', beginAttrs: null };
  }
  const endIndexInRest = endMatch.index;
  const endEndInRest = endIndexInRest + endMatch[0].length;
  const body = rest.slice(0, endIndexInRest).replace(/^\n/, '').replace(/\n$/, '\n');
  const block = text.slice(beginIndex, beginEnd + endEndInRest);
  const after = rest.slice(endEndInRest);
  return {
    block,
    body: body.startsWith('\n') ? body.slice(1) : body,
    before: text.slice(0, beginIndex),
    after,
    beginAttrs: beginMatch[1] ?? '',
  };
}

/**
 * Parse stamps from a projection begin marker or full block/document.
 */
export function parseAgentProjectionStamp(source: string): {
  arkgateVersion: string | null;
  schemaVersion: string | null;
  nonAuthoritative: boolean;
} {
  const text = String(source ?? '');
  const begin = BEGIN_LINE_RE.exec(text);
  const attrs = begin?.[1] ?? text;
  const versionMatch = VERSION_ATTR_RE.exec(attrs);
  const schemaMatch = SCHEMA_ATTR_RE.exec(attrs);
  const nonAuthoritative = /\bnonAuthoritative\s*=\s*true\b/i.test(attrs);
  return {
    arkgateVersion: versionMatch?.[1] ?? null,
    schemaVersion: schemaMatch?.[1] ?? null,
    nonAuthoritative,
  };
}

/**
 * True when the document/block stamps the given package version.
 */
export function projectionMatchesPackageVersion(
  source: string,
  packageVersion: string
): boolean {
  const stamped = parseAgentProjectionStamp(source).arkgateVersion;
  if (!stamped) return false;
  return stamped === safeVersion(packageVersion);
}

/**
 * True when body text carries the non-enforcement label (substring match).
 */
export function projectionHasNonEnforcementLabel(bodyOrBlock: string): boolean {
  return String(bodyOrBlock ?? '').includes('non-authoritative');
}

/**
 * Merge a desired projection block into an existing document without rewriting
 * customized content **outside** the managed markers.
 *
 * - Missing document → create `# Ark Enforcement` + block
 * - Existing markers → replace block when content-identity differs; else unchanged
 * - No markers → insert block after the first markdown H1 (or at top)
 */
export function mergeAgentProjectionDocument(
  existing: string | null | undefined,
  desiredBlock: string
): AgentProjectionMergeResult {
  const desired = ensureTrailingNewline(normalizeNewlines(desiredBlock));
  const desiredExtract = extractAgentProjectionBlock(desired);
  const desiredBody =
    desiredExtract.body ??
    desired.replace(BEGIN_LINE_RE, '').replace(END_LINE_RE, '').trim() + '\n';
  const contentIdentity = agentProjectionContentIdentity(desiredBody);

  if (existing == null || !String(existing).trim()) {
    return {
      content: ensureTrailingNewline(`# Ark Enforcement\n\n${desired}`),
      action: 'created',
      previousBlock: null,
      contentIdentity,
      preservedOutsideBlock: false,
    };
  }

  const current = normalizeNewlines(existing);
  const extracted = extractAgentProjectionBlock(current);
  if (extracted.block != null) {
    const currentBody = extracted.body ?? '';
    if (agentProjectionContentIdentity(currentBody) === contentIdentity) {
      return {
        content: ensureTrailingNewline(current),
        action: 'unchanged',
        previousBlock: extracted.block,
        contentIdentity,
        preservedOutsideBlock: true,
      };
    }
    const before = extracted.before.replace(/\s*$/, '\n\n');
    const after = extracted.after.replace(/^\s*/, '\n');
    return {
      content: ensureTrailingNewline(`${before}${desired.trimEnd()}\n${after}`),
      action: 'block-replaced',
      previousBlock: extracted.block,
      contentIdentity,
      preservedOutsideBlock: true,
    };
  }

  // Insert after first H1 line when present.
  const h1 = /^(#\s+[^\n]*\n)/m.exec(current);
  if (h1 && h1.index != null) {
    const insertAt = h1.index + h1[1].length;
    const before = current.slice(0, insertAt).replace(/\s*$/, '\n\n');
    const after = current.slice(insertAt).replace(/^\s*/, '\n');
    return {
      content: ensureTrailingNewline(`${before}${desired.trimEnd()}\n${after}`),
      action: 'block-inserted',
      previousBlock: null,
      contentIdentity,
      preservedOutsideBlock: true,
    };
  }

  return {
    content: ensureTrailingNewline(`${desired.trimEnd()}\n\n${current.trimStart()}`),
    action: 'block-inserted',
    previousBlock: null,
    contentIdentity,
    preservedOutsideBlock: true,
  };
}
