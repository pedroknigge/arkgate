/**
 * Structrail Event Bus module
 * Publish/subscribe for Domain Events with history and metadata support.
 */

export * from './types';
export { createEventBus, EventBusImpl } from './EventBus';
export {
  buildPublishPolicyContext,
  definePublishPolicy,
  type PublishPolicyContext,
  type GraphPolicyContext,
  type BuildPublishPolicyContextOptions,
} from './policyContext';
export {
  UnregisteredIntentError,
  InvalidIntentNameError,
  LayerPolicyContextError,
  EventContractViolationError,
  UnknownEventSourceError,
  SourceMetadataOverrideError,
  ObservedLayerFlowViolationError,
} from './errors';
