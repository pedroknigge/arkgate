/**
 * Thin gallery bridge (ADR 0034 D7). Consumer owns handlers.
 * Absorb may send(); escalate_up human may raises. No coordinator.
 */
import {
  ingestTravelAction,
  type IngestEscalateUp,
  type IngestResult,
} from '../../src/kernel/order';

export type BillingBridgeHandlers = {
  send: (kind: string, payload: Readonly<Record<string, unknown>>) => Promise<unknown> | unknown;
  raiseHuman: (residual: IngestEscalateUp) => Promise<unknown> | unknown;
};

export async function travelBillingResidual(
  residual: IngestResult,
  handlers: BillingBridgeHandlers
): Promise<'send' | 'raises' | 'none'> {
  const action = ingestTravelAction(residual);
  if (action === 'send') {
    await handlers.send(residual.event.kind, residual.event.payload ?? {});
  }
  if (action === 'raises' && residual.kind === 'escalate_up') {
    await handlers.raiseHuman(residual);
  }
  return action;
}
