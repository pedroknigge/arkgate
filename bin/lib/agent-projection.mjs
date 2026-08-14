/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/agentProjection.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/agent-projection.mjs). Zero Node I/O.
 */

export const ARK_AGENT_PROJECTION_SCHEMA_VERSION = '1.0';
/** Begin marker for the managed projection region inside AGENTS.md (or equivalent). */
export const AGENT_PROJECTION_BEGIN_MARKER = '<!-- arkgate:agent-projection:begin';
/** End marker for the managed projection region. */
export const AGENT_PROJECTION_END_MARKER = '<!-- arkgate:agent-projection:end -->';
/**
 * Non-enforcement label — must appear in every generated projection body.
 * Agents and humans must not treat the projection as a pass/fail authority.
 */
export const AGENT_PROJECTION_NON_ENFORCEMENT_LABEL = 'This projection is **non-authoritative**. Enforcement is `ark-check` / host write hooks / required CI (`--strict-merge`), not AGENTS.md, skills, or this block.';
/** Surfaces that actually enforce (closed vocabulary for meta + docs). */
export const AGENT_PROJECTION_ENFORCEMENT_SURFACES = Object.freeze([
    'ark-check',
    'host-write-hooks',
    'ci-strict-merge',
]);
/**
 * High-signal public ruleIds for the compact catalog short list in the projection.
 * Full catalog remains `docs/diagnostics.md` / `DIAGNOSTIC_CATALOG` (ACS02).
 * Titles are supplied by Tooling from the catalog when available.
 */
export const DEFAULT_AGENT_PROJECTION_RULE_IDS = Object.freeze([
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
const BEGIN_LINE_RE = /<!--\s*arkgate:agent-projection:begin\b([^>]*)-->/i;
const END_LINE_RE = /<!--\s*arkgate:agent-projection:end\s*-->/i;
// Attribute values: alnum + common version/schema tokens only (avoid open char-class ranges).
const VERSION_ATTR_RE = /\barkgateVersion=([A-Za-z0-9._+-]+)/i;
const SCHEMA_ATTR_RE = /\bschema=([A-Za-z0-9._+-]+)/i;
/** FNV-1a identity — portable, no Node crypto (same family as stableHash). */
export function agentProjectionContentIdentity(body) {
    const normalized = String(body ?? '').replace(/\r\n/g, '\n');
    let hash = 0x811c9dc5;
    for (let index = 0; index < normalized.length; index += 1) {
        hash ^= normalized.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function normalizeNewlines(text) {
    return String(text ?? '').replace(/\r\n/g, '\n');
}
function ensureTrailingNewline(text) {
    const normalized = normalizeNewlines(text);
    return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}
function safeVersion(version) {
    if (typeof version !== 'string' || version.trim().length === 0)
        return 'unknown';
    // Avoid breaking HTML comments / markdown with control chars.
    return version.trim().replace(/[>\s]/g, '');
}
function resolveProfile(profile) {
    return profile === 'compact' ? 'compact' : 'full';
}
/**
 * Build the managed begin marker line (includes version + nonAuthoritative stamp).
 */
export function buildAgentProjectionBeginMarker(facts) {
    const version = safeVersion(facts.arkgateVersion);
    const schema = typeof facts.schemaVersion === 'string' && facts.schemaVersion.trim()
        ? facts.schemaVersion.trim()
        : ARK_AGENT_PROJECTION_SCHEMA_VERSION;
    return `<!-- arkgate:agent-projection:begin schema=${schema} arkgateVersion=${version} nonAuthoritative=true -->`;
}
/**
 * Layer placement rows for the projection (compact markdown table).
 */
export function formatAgentProjectionLayers(layers) {
    if (!Array.isArray(layers) || layers.length === 0) {
        return '_No project layers loaded — read `ark.config.json` or run `ark start` / `ark_manifest`._';
    }
    const rows = layers
        .map((layer) => {
        const name = layer.name?.trim() || 'Unknown';
        const patternList = layer.patterns ?? [];
        const prefixList = layer.intentPrefixes ?? [];
        const patterns = patternList.map((pattern) => `\`${pattern}\``).join(', ') || '—';
        const prefixes = prefixList.map((prefix) => `\`${prefix}\``).join(', ') || '—';
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
export function formatAgentProjectionCatalogShortList(entries, docsPath) {
    const path = docsPath.trim() || 'docs/diagnostics.md';
    if (!Array.isArray(entries) || entries.length === 0) {
        return `Full public codes: \`${path}\` (and package \`DIAGNOSTIC_CATALOG\`).`;
    }
    const lines = entries
        .filter((entry) => entry && typeof entry.ruleId === 'string' && entry.ruleId.length > 0)
        .map((entry) => {
        const title = typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : entry.ruleId;
        return `- \`${entry.ruleId}\` — ${title}`;
    });
    return `${lines.join('\n')}

Full catalog: \`${path}\` (\`#RULE_ID\` anchors).`;
}
/**
 * Projection **body** only (no begin/end markers). Used for content-identity.
 */
export function buildAgentProjectionBody(facts) {
    const version = safeVersion(facts.arkgateVersion);
    const profile = resolveProfile(facts.profile);
    const checkCommand = typeof facts.checkCommand === 'string' && facts.checkCommand.trim()
        ? facts.checkCommand.trim()
        : 'ark-check --strict-config';
    const docsPath = typeof facts.diagnosticsDocsPath === 'string' && facts.diagnosticsDocsPath.trim()
        ? facts.diagnosticsDocsPath.trim()
        : 'docs/diagnostics.md';
    const hostRaw = typeof facts.host === 'string' ? facts.host.trim().toLowerCase() : '';
    const host = hostRaw && hostRaw !== 'unknown' ? hostRaw : null;
    const layers = Array.isArray(facts.layers) ? facts.layers : [];
    const catalog = Array.isArray(facts.catalogShortList) ? facts.catalogShortList : [];
    const lines = [
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
        lines.push('### Primary path', '', '1. Run doctor (`ark-check --doctor`) — status light + primary next action.', '2. Read the improvement compass (not a score). Name leftover work in plain language; never “done” on green imports alone while leftover design work remains.', '3. Call `ark_identity` with `project.expectedRoot` at the exact project root; reuse root + `projectId` on Ark MCP calls.', '4. Read architecture config with `ark_manifest` (same expectation). `ark://manifest` is compatibility-only / unverified.', '5. Place files inside configured layers; validate; run the check command above on violations — fix architecture, do not weaken the gate.', '6. Single door: import-rule debt → fix; leftover design work / residual shape lenses → map then guided apply with user OK.', '', '### Contract layers (summary)', '', formatAgentProjectionLayers(layers), '');
    }
    else {
        lines.push('### Contract layers', '', formatAgentProjectionLayers(layers), '', 'When creating a **new** kind of code that no layer covers, update `ark.config.json` first (`/ark-adopt`), then place the file.', '', '### Diagnostic codes (short list)', '', formatAgentProjectionCatalogShortList(catalog, docsPath), '', '### Session truth', '', '- Machine snapshot: `ark status --json` (or MCP `ark_status`) — identity, activation honesty, last check, residual counts. **Not a score.**', '- Authoritative contract: `ark_manifest` after a matched `ark_identity` handshake.', '');
    }
    lines.push('### Enforcement surfaces (authoritative)', '', AGENT_PROJECTION_ENFORCEMENT_SURFACES.map((surface) => `- \`${surface}\``).join('\n'), '');
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
/**
 * Full managed block: begin marker + body + end marker.
 */
export function buildAgentProjectionBlock(facts) {
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
export function buildAgentProjectionMeta(facts) {
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
export function extractAgentProjectionBlock(document) {
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
    // Strip a single leading newline after the begin marker; keep body content as-is.
    let body = rest.slice(0, endIndexInRest);
    if (body.startsWith('\n'))
        body = body.slice(1);
    const block = text.slice(beginIndex, beginEnd + endEndInRest);
    const after = rest.slice(endEndInRest);
    return {
        block,
        body,
        before: text.slice(0, beginIndex),
        after,
        beginAttrs: beginMatch[1] ?? '',
    };
}
/**
 * Parse stamps from a projection begin marker or full block/document.
 */
export function parseAgentProjectionStamp(source) {
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
export function projectionMatchesPackageVersion(source, packageVersion) {
    const stamped = parseAgentProjectionStamp(source).arkgateVersion;
    if (!stamped)
        return false;
    return stamped === safeVersion(packageVersion);
}
/**
 * True when body text carries the non-enforcement label (substring match).
 */
export function projectionHasNonEnforcementLabel(bodyOrBlock) {
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
export function mergeAgentProjectionDocument(existing, desiredBlock) {
    const desired = ensureTrailingNewline(normalizeNewlines(desiredBlock));
    const desiredExtract = extractAgentProjectionBlock(desired);
    const desiredBody = desiredExtract.body ??
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
