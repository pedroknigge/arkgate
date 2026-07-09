/**
 * Structural + behavioral smoke for R8 publish pipeline modules.
 * Full order-of-enforcement stays in event-bus + integration suites.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertIntentAllowed, assertContractAllowed } from '../../../src/kernel/event-bus/publishGuards';
import { UnregisteredIntentError } from '../../../src/kernel/event-bus/errors';
import { createIntentRegistry, defineIntent } from '../../../src/index';

const EVENT_BUS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../src/kernel/event-bus'
);

describe('R8 EventBus publish pipeline modules', () => {
  it('ships the decomposed stage modules next to EventBus.ts', () => {
    for (const name of [
      'payloadPatch.ts',
      'publishGuards.ts',
      'publishInterceptors.ts',
      'observedLayerFlow.ts',
      'publishPolicy.ts',
      'publishRecording.ts',
      'EventBus.ts',
    ]) {
      expect(existsSync(path.join(EVENT_BUS_DIR, name)), name).toBe(true);
    }
  });

  it('assertIntentAllowed enforces strict registry via the extracted guard', () => {
    const registry = createIntentRegistry();
    registry.define('Domain.Order.Placed');
    expect(() =>
      assertIntentAllowed('Domain.Unknown', {
        strictRegistry: true,
        validateIntentNaming: true,
        intentRegistry: registry,
      })
    ).toThrow(UnregisteredIntentError);

    expect(() =>
      assertIntentAllowed('Domain.Order.Placed', {
        strictRegistry: true,
        validateIntentNaming: true,
        intentRegistry: registry,
      })
    ).not.toThrow();
  });

  it('assertContractAllowed is a no-op without contracts', () => {
    const OrderPlaced = defineIntent<'Domain.Order.Placed', { id: string }>(
      'Domain.Order.Placed'
    );
    const event = OrderPlaced({ id: '1' });
    expect(() =>
      assertContractAllowed(event, {
        strictEventContracts: true,
      })
    ).not.toThrow();
  });
});
