/**
 * Event bus governance errors.
 */

export class UnregisteredIntentError extends Error {
  readonly intentName: string;

  constructor(intentName: string) {
    super(
      `Intent "${intentName}" is not registered. Register it with IntentRegistry.define() before publish/subscribe, including metadata.source producer intents in strict mode.`
    );
    this.name = 'UnregisteredIntentError';
    this.intentName = intentName;
  }
}

export class InvalidIntentNameError extends Error {
  readonly intentName: string;
  readonly reason: string;

  constructor(intentName: string, reason: string) {
    super(`Invalid intent name "${intentName}": ${reason}`);
    this.name = 'InvalidIntentNameError';
    this.intentName = intentName;
    this.reason = reason;
  }
}

export class LayerPolicyContextError extends Error {
  constructor() {
    super(
      'Layer/architecture policies require intentRegistry, dependencyGraph, or a custom getPolicyContext. ' +
        'Without graph/registry context, layer policies cannot inspect relationships.'
    );
    this.name = 'LayerPolicyContextError';
  }
}

export class EventContractViolationError extends Error {
  readonly intentName: string;
  readonly issues: unknown[];

  constructor(intentName: string, issues: unknown[]) {
    super(
      `Event contract violation for "${intentName}". Register a matching event contract/version or fix the payload before publishing.`
    );
    this.name = 'EventContractViolationError';
    this.intentName = intentName;
    this.issues = issues;
  }
}

export class UnknownEventSourceError extends Error {
  readonly intentName: string;
  readonly source?: string;

  constructor(intentName: string, source?: string) {
    super(
      source
        ? `Event "${intentName}" metadata.source "${source}" is not registered. Register the producer intent or publish from a known source.`
        : `Event "${intentName}" must include metadata.source. Strict Ark uses source to enforce observed layer flow.`
    );
    this.name = 'UnknownEventSourceError';
    this.intentName = intentName;
    this.source = source;
  }
}

export class SourceMetadataOverrideError extends Error {
  readonly boundSource: string;
  readonly attemptedSource: string;

  constructor(boundSource: string, attemptedSource: string) {
    super(
      `Source-bound publisher for "${boundSource}" cannot publish with metadata.source "${attemptedSource}". Create a publisher for the intended source instead.`
    );
    this.name = 'SourceMetadataOverrideError';
    this.boundSource = boundSource;
    this.attemptedSource = attemptedSource;
  }
}

/**
 * Thrown when the OBSERVED producer→event flow crosses a forbidden layer boundary
 * under `enforceObservedLayerFlow: 'hard'`. Unlike declared-model policy errors, this
 * reflects what the running system actually did at publish time.
 */
export class ObservedLayerFlowViolationError extends Error {
  readonly source: string;
  readonly intentName: string;
  readonly fromLayer: string;
  readonly toLayer: string;

  constructor(
    source: string,
    intentName: string,
    fromLayer: string,
    toLayer: string,
    message?: string
  ) {
    super(
      message ??
        `Observed layer violation: "${source}" (${fromLayer}) must not produce "${intentName}" (${toLayer}). Route this through an allowed layer or adjust the architecture profile rule.`
    );
    this.name = 'ObservedLayerFlowViolationError';
    this.source = source;
    this.intentName = intentName;
    this.fromLayer = fromLayer;
    this.toLayer = toLayer;
  }
}
