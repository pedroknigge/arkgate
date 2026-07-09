/**
 * Observed producer→event layer-flow enforcement (metadata.source → intent).
 * Runs BEFORE the flow is recorded so hard mode leaves no phantom graph edge.
 */
import type { DomainEvent } from '../../domain/types';
import type { ArchitectureProfile } from '../layers';
import type { AuditRecordType } from '../audit';
import type { ObservedLayerFlowMode, TraceRecord } from './types';
import { ObservedLayerFlowViolationError } from './errors';

export type ObservedLayerFlowDeps = {
  mode: ObservedLayerFlowMode;
  architectureProfile?: ArchitectureProfile;
  appendTrace: (record: TraceRecord) => void;
  recordAudit: (
    type: AuditRecordType,
    event: DomainEvent,
    details?: unknown
  ) => Promise<void>;
};

/**
 * Enforce observed producer→event flow against architecture profile rules.
 * Soft mode traces/audits and continues; hard mode throws.
 */
export async function assertObservedLayerFlowAllowed(
  event: DomainEvent,
  deps: ObservedLayerFlowDeps
): Promise<void> {
  if (deps.mode === 'off' || !deps.architectureProfile) {
    return;
  }

  const source = event.metadata.source;
  if (!source || source === 'unknown') return;

  const profile = deps.architectureProfile;
  const fromLayer = profile.resolveLayer(source);
  const toLayer = profile.resolveLayer(event.intent);
  if (!fromLayer || !toLayer) return;

  const blocked = profile.rules.find(
    (rule) => !rule.allowed && rule.from === fromLayer && rule.to === toLayer
  );
  if (!blocked) return;

  const severity = deps.mode;
  const message =
    blocked.message ??
    `Observed layer violation: "${source}" (${fromLayer}) must not produce "${event.intent}" (${toLayer}).`;
  const details = {
    source,
    intent: event.intent,
    fromLayer,
    toLayer,
    severity,
    message,
    rule: blocked,
  };

  deps.appendTrace({
    type: 'layer.observedViolation',
    timestamp: new Date().toISOString(),
    intent: event.intent,
    correlationId: event.metadata.correlationId,
    traceId: event.metadata.traceId,
    spanId: event.metadata.spanId,
    details,
  });
  await deps.recordAudit('layer.observedViolation', event, details);

  if (severity === 'hard') {
    throw new ObservedLayerFlowViolationError(
      source,
      event.intent,
      fromLayer,
      toLayer,
      message
    );
  }
}
