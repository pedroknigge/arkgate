/** Pure source-policy decisions. Adapters extract syntax facts; this module owns rule outcomes. */

export const SOURCE_POLICY_MESSAGES = {
  RAW_EVENT_PUBLISH:
    'Publish through a registered intent creator; raw event objects or intent strings bypass Ark contracts and tooling.',
  PUBLISH_MISSING_SOURCE: 'Strict Ark publish calls must include metadata.source.',
} as const;

export type PublishSyntaxFacts = {
  publishCall: boolean;
  rawIntentName?: string;
  objectHasIntent: boolean;
  arkPublishCandidate: boolean;
  hasSource: boolean;
};

export type SourcePolicyFinding = {
  ruleId: keyof typeof SOURCE_POLICY_MESSAGES;
  message: string;
};

export function looksLikeArkIntent(value: string): boolean {
  return /^(Domain|Application|Adapter|Workflow|Job|Presentation|Reporting|Metadata|Security|Audit|Observability|Kernel)\.[A-Za-z0-9_.]+$/.test(
    value
  );
}

export function classifyPublishFacts(facts: PublishSyntaxFacts): SourcePolicyFinding[] {
  if (!facts.publishCall) return [];
  const findings: SourcePolicyFinding[] = [];
  if (
    (facts.rawIntentName !== undefined && looksLikeArkIntent(facts.rawIntentName)) ||
    facts.objectHasIntent
  ) {
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
