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
