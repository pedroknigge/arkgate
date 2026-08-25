import { describe, expect, it } from 'vitest';
import {
  ARK_RUN_EPHEMERAL_DEFAULT,
  ARK_RUN_TRANSPORT_KINDS,
  InvalidArkRunSendOptionError,
  closedArkRunEphemeral,
  closedArkRunTransportKind,
  resolveArkRunSendPlan,
} from '../../../src/domain/arkRunTransport';

describe('RN11 ArkRun transport plan (ADR 0024)', () => {
  it('locks closed kinds and ephemeral default true', () => {
    expect([...ARK_RUN_TRANSPORT_KINDS]).toEqual(['local', 'localBlocking', 'broker']);
    expect(ARK_RUN_EPHEMERAL_DEFAULT).toBe(true);
    expect(closedArkRunTransportKind(undefined)).toBe('local');
    expect(closedArkRunEphemeral(undefined)).toBe(true);
  });

  it('fails closed on unknown transport or non-boolean ephemeral', () => {
    expect(() => closedArkRunTransportKind('kafka')).toThrow(InvalidArkRunSendOptionError);
    expect(() => closedArkRunEphemeral('true')).toThrow(InvalidArkRunSendOptionError);
    expect(() => resolveArkRunSendPlan({ transport: 'sqs', brokerBound: true })).toThrow(
      InvalidArkRunSendOptionError
    );
  });

  it('keeps local fire-and-forget distinct from localBlocking', () => {
    const local = resolveArkRunSendPlan({ transport: 'local', brokerBound: false });
    expect(local).toEqual({
      transport: 'local',
      ephemeral: true,
      deliveredVia: 'local',
      fallbackToLocal: false,
      notifySubscribers: true,
      awaitHandlers: false,
      awaitHandoff: true,
    });

    const blocking = resolveArkRunSendPlan({
      transport: 'localBlocking',
      ephemeral: false,
      brokerBound: true,
    });
    expect(blocking.awaitHandlers).toBe(true);
    expect(blocking.awaitHandoff).toBe(true);
    expect(blocking.deliveredVia).toBe('local');
    expect(blocking.notifySubscribers).toBe(true);
  });

  it('falls back broker to local when no adapter is bound', () => {
    const fallback = resolveArkRunSendPlan({ transport: 'broker', brokerBound: false });
    expect(fallback.deliveredVia).toBe('local');
    expect(fallback.fallbackToLocal).toBe(true);
    expect(fallback.notifySubscribers).toBe(true);
    expect(fallback.awaitHandlers).toBe(false);
  });

  it('hands off to broker only when an adapter is bound', () => {
    const handed = resolveArkRunSendPlan({
      transport: 'broker',
      ephemeral: true,
      brokerBound: true,
    });
    expect(handed.deliveredVia).toBe('broker');
    expect(handed.fallbackToLocal).toBe(false);
    expect(handed.notifySubscribers).toBe(false);
    expect(handed.awaitHandoff).toBe(true);
    expect(handed.awaitHandlers).toBe(false);

    const fireAndForget = resolveArkRunSendPlan({
      transport: 'broker',
      ephemeral: false,
      brokerBound: true,
    });
    expect(fireAndForget.awaitHandoff).toBe(false);
  });
});
