/**
 * Closed ArkRun send-port vocabulary (ADR 0024).
 * Pure plan only — delivery is Kernel. Not a durability claim.
 */

export const ARK_RUN_TRANSPORT_KINDS = ['local', 'localBlocking', 'broker'] as const;

export type ArkRunTransportKind = (typeof ARK_RUN_TRANSPORT_KINDS)[number];

export type ArkRunDeliveredVia = 'local' | 'broker';

/** Await local recording / adapter handoff before `send()` resolves. Not durability. */
export const ARK_RUN_EPHEMERAL_DEFAULT = true;

const TRANSPORTS = new Set<string>(ARK_RUN_TRANSPORT_KINDS);

export class InvalidArkRunSendOptionError extends Error {
  readonly option: 'transport' | 'ephemeral';

  constructor(option: 'transport' | 'ephemeral') {
    super(
      option === 'transport'
        ? 'ArkRun transport must be "local", "localBlocking", or "broker".'
        : 'ArkRun ephemeral must be a boolean.'
    );
    this.name = 'InvalidArkRunSendOptionError';
    this.option = option;
  }
}

export type ArkRunSendPlan = {
  transport: ArkRunTransportKind;
  ephemeral: boolean;
  deliveredVia: ArkRunDeliveredVia;
  fallbackToLocal: boolean;
  notifySubscribers: boolean;
  awaitHandlers: boolean;
  awaitHandoff: boolean;
};

export type ArkRunSendPlanInput = {
  transport?: unknown;
  ephemeral?: unknown;
  brokerBound: boolean;
};

export function closedArkRunTransportKind(value: unknown): ArkRunTransportKind {
  if (value === undefined) return 'local';
  if (typeof value === 'string' && TRANSPORTS.has(value)) {
    return value as ArkRunTransportKind;
  }
  throw new InvalidArkRunSendOptionError('transport');
}

export function closedArkRunEphemeral(value: unknown): boolean {
  if (value === undefined) return ARK_RUN_EPHEMERAL_DEFAULT;
  if (value === true || value === false) return value;
  throw new InvalidArkRunSendOptionError('ephemeral');
}

/**
 * Decide where a send goes and what `send()` waits for.
 * Missing broker → in-process local fallback (not cloud portability).
 */
export function resolveArkRunSendPlan(input: ArkRunSendPlanInput): ArkRunSendPlan {
  const transport = closedArkRunTransportKind(input.transport);
  const ephemeral = closedArkRunEphemeral(input.ephemeral);
  const fallbackToLocal = transport === 'broker' && input.brokerBound !== true;
  const deliveredVia: ArkRunDeliveredVia =
    transport === 'broker' && !fallbackToLocal ? 'broker' : 'local';
  const awaitHandlers = transport === 'localBlocking';
  return {
    transport,
    ephemeral,
    deliveredVia,
    fallbackToLocal,
    notifySubscribers: deliveredVia === 'local',
    awaitHandlers,
    awaitHandoff: ephemeral || awaitHandlers,
  };
}
