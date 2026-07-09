/**
 * Policy-engine stage of the publish pipeline (hard + soft violations).
 */
import type { DomainEvent } from '../../domain/types';
import type { AuditRecordType } from '../audit';
import {
  PolicyEngine,
  PolicyViolationError,
  type PolicyEvaluationResult,
} from '../policy';
import type { TraceRecord } from './types';

export type EnforcePublishPolicyDeps<Context = unknown> = {
  policyEngine: PolicyEngine<Context>;
  getPolicyContext: (event: DomainEvent) => Context;
  appendTrace: (record: TraceRecord) => void;
  recordAudit: (
    type: AuditRecordType,
    event: DomainEvent,
    details?: unknown
  ) => Promise<void>;
  onSoftViolation?: (
    result: PolicyEvaluationResult,
    event: DomainEvent
  ) => void | Promise<void>;
  safeHook: (
    fn: () => void | Promise<void>,
    hookName: string,
    event: DomainEvent
  ) => Promise<void>;
};

/**
 * Run policy engine on the event. Hard violations throw after tracing;
 * soft violations are traced, audited, and optionally hooked.
 */
export async function enforcePublishPolicy<Context = unknown>(
  event: DomainEvent,
  deps: EnforcePublishPolicyDeps<Context>
): Promise<void> {
  const ctx = deps.getPolicyContext(event);
  let policyResult: PolicyEvaluationResult;
  try {
    policyResult = deps.policyEngine.enforce(ctx);
  } catch (err) {
    if (err instanceof PolicyViolationError) {
      deps.appendTrace({
        type: 'policy.hardViolation',
        timestamp: new Date().toISOString(),
        intent: event.intent,
        correlationId: event.metadata.correlationId,
        traceId: event.metadata.traceId,
        spanId: event.metadata.spanId,
        details: { violations: err.violations },
      });
      await deps.recordAudit('policy.hardViolation', event, {
        violations: err.violations,
      });
    }
    throw err;
  }

  if (policyResult.softViolations.length > 0) {
    deps.appendTrace({
      type: 'policy.softViolation',
      timestamp: new Date().toISOString(),
      intent: event.intent,
      correlationId: event.metadata.correlationId,
      traceId: event.metadata.traceId,
      spanId: event.metadata.spanId,
      details: { violations: policyResult.softViolations },
    });
    await deps.recordAudit('policy.softViolation', event, {
      violations: policyResult.softViolations,
    });

    if (deps.onSoftViolation) {
      await deps.safeHook(
        () => deps.onSoftViolation!(policyResult, event),
        'onSoftViolation',
        event
      );
    }
  }
}
