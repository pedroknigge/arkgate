/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/sourcePolicy.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/source-policy.mjs). Zero Node I/O.
 */

export const SOURCE_POLICY_MESSAGES = {
    RAW_EVENT_PUBLISH: 'Publish through a registered intent creator; raw event objects or intent strings bypass Ark contracts and tooling.',
    PUBLISH_MISSING_SOURCE: 'Strict Ark publish calls must include metadata.source.',
};
export const DEFAULT_INTENT_PREFIXES = Object.freeze([
    { layer: 'DomainModel', prefixes: ['Domain.'] },
    { layer: 'ApplicationOrchestration', prefixes: ['Application.'] },
    { layer: 'PersistenceAdapters', prefixes: ['Adapter.Persistence.', 'Adapter.Repository.'] },
    { layer: 'IntegrationAdapters', prefixes: ['Adapter.Integration.', 'Adapter.External.'] },
    { layer: 'WorkflowSagaEngine', prefixes: ['Workflow.'] },
    { layer: 'BackgroundJobsScheduling', prefixes: ['Job.'] },
    { layer: 'PresentationAdapters', prefixes: ['Presentation.', 'Adapter.Presentation.', 'Adapter.Api.'] },
    { layer: 'ReportingReadModels', prefixes: ['Reporting.'] },
    { layer: 'ExtensibilityMetadata', prefixes: ['Metadata.'] },
    { layer: 'SecurityAuditObservability', prefixes: ['Security.', 'Audit.', 'Observability.'] },
    { layer: 'Kernel', prefixes: ['Kernel.'] },
]);
/**
 * Runtime intent prefixes for one config layer: its declared `intentPrefixes`,
 * else the built-in prefixes when the layer uses a canonical 11-layer name
 * (`DomainModel` → `Domain.`, …; the same table the static gate falls back to),
 * else none. Keeps `ark init` configs, which name canonical layers without
 * declaring prefixes, resolvable by the ArkRun kernel.
 */
export function effectiveIntentPrefixes(layer) {
    const declared = (layer.intentPrefixes ?? []).filter((prefix) => prefix.trim().length > 0);
    if (declared.length > 0)
        return declared;
    return DEFAULT_INTENT_PREFIXES.find((entry) => entry.layer === layer.name)?.prefixes ?? [];
}
/**
 * Layers named by an `allowed: false` (non-peerIsolation) rule that no intent can map to at runtime
 * (no declared `intentPrefixes` and not a canonical layer name). Hard observed
 * layer flow can never fire for such a rule. Sorted, unique.
 */
export function unresolvableLayerFlowLayers(config) {
    const resolvable = new Set(config.layers
        .filter((layer) => effectiveIntentPrefixes(layer).length > 0)
        .map((layer) => layer.name));
    const missing = new Set();
    for (const rule of config.rules ?? []) {
        // peerIsolation walls are file-path slice rules; runtime flow never evaluates them.
        if (rule.allowed !== false || rule.peerIsolation === true)
            continue;
        for (const name of [rule.from, rule.to]) {
            if (!resolvable.has(name))
                missing.add(name);
        }
    }
    return [...missing].sort();
}
/** Longest matching prefix wins; declaration order resolves an identical-prefix tie. */
export function resolveIntentLayer(intent, layers) {
    const candidates = layers.flatMap((layer, layerIndex) => (layer.prefixes ?? layer.intentPrefixes ?? []).map((prefix) => ({
        layer: layer.name,
        layerIndex,
        prefix: prefix.endsWith('.') ? prefix : `${prefix}.`,
    })));
    return candidates
        .filter(({ prefix }) => intent.startsWith(prefix))
        .sort((left, right) => right.prefix.length - left.prefix.length || left.layerIndex - right.layerIndex)[0]?.layer;
}
export function looksLikeArkIntent(value) {
    return /^(Domain|Application|Adapter|Workflow|Job|Presentation|Reporting|Metadata|Security|Audit|Observability|Kernel)\.[A-Za-z0-9_.]+$/.test(value);
}
export function classifyPublishFacts(facts) {
    if (!facts.publishCall)
        return [];
    const findings = [];
    if ((facts.rawIntentName !== undefined && looksLikeArkIntent(facts.rawIntentName)) ||
        facts.objectHasIntent) {
        findings.push({
            ruleId: 'RAW_EVENT_PUBLISH',
            message: SOURCE_POLICY_MESSAGES.RAW_EVENT_PUBLISH,
        });
    }
    if (facts.arkPublishCandidate && !facts.hasSource) {
        findings.push({
            ruleId: 'PUBLISH_MISSING_SOURCE',
            message: SOURCE_POLICY_MESSAGES.PUBLISH_MISSING_SOURCE,
        });
    }
    return findings;
}
/** Intent prefixes are short tokens (`Domain.`, `Application.`). Bound the scan. */
const INTENT_PREFIX_SCAN_LIMIT = 64;
/**
 * Strip trailing `.` without a regex. `\.+$` on config strings is CodeQL
 * js/polynomial-redos (backtracking on long runs of `.`). Linear walk is enough.
 */
function stripTrailingDots(value) {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 46) {
        end -= 1;
    }
    return end === value.length ? value : value.slice(0, end);
}
function normalizeIntentPrefix(prefix) {
    const trimmed = prefix.trim();
    const bounded = trimmed.length > INTENT_PREFIX_SCAN_LIMIT
        ? trimmed.slice(0, INTENT_PREFIX_SCAN_LIMIT)
        : trimmed;
    return stripTrailingDots(bounded);
}
/**
 * Canonical Domain-role layer predicate shared by ArkRun, ArkOrder, and ArkRules.
 * Start-anchored domain/entity/aggregate (unanchored "model" would misclassify
 * ReportingReadModels), or a `Domain.` intentPrefix.
 */
export function isDomainRoleLayer(layer, intentPrefixes = []) {
    const name = layer.trim();
    if (/^domain(?:model)?$/i.test(name) || /^domain(?=[A-Z_\-\s])/i.test(name))
        return true;
    if (/^(?:entit(?:y|ies)|aggregates?)(?:$|(?=[A-Z_\-\s]))/i.test(name))
        return true;
    return intentPrefixes.some((prefix) => {
        const normalized = normalizeIntentPrefix(prefix);
        return normalized === 'Domain' || normalized.startsWith('Domain.');
    });
}
/** 1-based line number of an AST node inside `sourceFile`. */
export function tsAstNodeLine(sourceFile, node) {
    const pos = typeof node.getStart === 'function' ? node.getStart(sourceFile) : node.pos ?? 0;
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}
/** Unwrap parens, `as`, `satisfies`, `!`, `<T>x`, and `Object.freeze(x)`. */
export function unwrapTsAstExpression(ts, node) {
    let current = node;
    for (let depth = 0; depth < 16; depth += 1) {
        if (ts.isParenthesizedExpression(current) ||
            ts.isAsExpression(current) ||
            ts.isNonNullExpression(current) ||
            ts.isTypeAssertionExpression(current) ||
            (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(current))) {
            current = current.expression;
            continue;
        }
        if (ts.isCallExpression(current) &&
            ts.isPropertyAccessExpression(current.expression) &&
            ts.isIdentifier(current.expression.expression) &&
            current.expression.expression.text === 'Object' &&
            current.expression.name.text === 'freeze' &&
            current.arguments.length >= 1) {
            current = current.arguments[0];
            continue;
        }
        break;
    }
    return current;
}
/** Property key name for an identifier, string/template/numeric literal, or static computed key. */
export function tsAstPropertyKeyName(ts, nameNode) {
    if (ts.isIdentifier(nameNode) ||
        ts.isStringLiteral(nameNode) ||
        ts.isNoSubstitutionTemplateLiteral(nameNode) ||
        ts.isNumericLiteral(nameNode)) {
        return nameNode.text;
    }
    if (ts.isComputedPropertyName(nameNode)) {
        const inner = unwrapTsAstExpression(ts, nameNode.expression);
        if (ts.isStringLiteral(inner) ||
            ts.isNoSubstitutionTemplateLiteral(inner) ||
            ts.isNumericLiteral(inner)) {
            return inner.text;
        }
    }
    return null;
}
