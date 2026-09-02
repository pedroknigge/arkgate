/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/agentProjectionMerge.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/agent-projection-merge.mjs). Zero Node I/O.
 */

import { agentProjectionContentIdentity, ensureTrailingNewline, normalizeNewlines, safeVersion, } from './agent-projection-formatters.mjs';
const BEGIN_LINE_RE = /<!--\s*arkgate:agent-projection:begin\b([^>]*)-->/i;
const END_LINE_RE = /<!--\s*arkgate:agent-projection:end\s*-->/i;
// Attribute values: alnum + common version/schema tokens only (avoid open char-class ranges).
const VERSION_ATTR_RE = /\barkgateVersion=([A-Za-z0-9._+-]+)/i;
const SCHEMA_ATTR_RE = /\bschema=([A-Za-z0-9._+-]+)/i;
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
