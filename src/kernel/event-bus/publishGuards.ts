/**
 * Publish-time guards: intent registry, known source, event contracts.
 * Pure relative to I/O — throw or return; no history/trace side effects.
 */
import type { DomainEvent } from '../../domain/types';
import type { IntentRegistry } from '../intent/IntentRegistry';
import type { EventContractRegistry } from '../event-contracts';
import { validateIntentName } from '../intent/validateIntentName';
import {
  UnregisteredIntentError,
  InvalidIntentNameError,
  EventContractViolationError,
  UnknownEventSourceError,
} from './errors';

export function assertIntentAllowed(
  intentName: string,
  options: {
    strictRegistry: boolean;
    validateIntentNaming: boolean;
    intentRegistry?: IntentRegistry;
  }
): void {
  if (!options.strictRegistry && !options.validateIntentNaming) {
    return;
  }

  if (options.validateIntentNaming) {
    const validation = validateIntentName(intentName);
    if (!validation.valid) {
      throw new InvalidIntentNameError(intentName, validation.reason!);
    }
  }

  if (
    options.strictRegistry &&
    options.intentRegistry &&
    !options.intentRegistry.has(intentName)
  ) {
    throw new UnregisteredIntentError(intentName);
  }
}

export function assertSourceAllowed(
  event: DomainEvent,
  options: {
    requireKnownSource: boolean;
    intentRegistry?: IntentRegistry;
  }
): void {
  if (!options.requireKnownSource) return;
  if (!event.metadata.source || event.metadata.source === 'unknown') {
    throw new UnknownEventSourceError(event.intent);
  }
  if (options.intentRegistry && !options.intentRegistry.has(event.metadata.source)) {
    throw new UnknownEventSourceError(event.intent, event.metadata.source);
  }
}

export function assertContractAllowed(
  event: DomainEvent,
  options: {
    eventContracts?: EventContractRegistry;
    strictEventContracts: boolean;
  }
): void {
  if (!options.eventContracts) return;
  const result = options.eventContracts.validate(event);

  if (!result.ok && (options.strictEventContracts || result.contract)) {
    throw new EventContractViolationError(event.intent, result.issues);
  }
}
