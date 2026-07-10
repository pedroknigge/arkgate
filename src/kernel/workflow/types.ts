/**
 * Workflow / Saga support.
 */

import type { DomainEvent, IntentName } from '../../domain/types';
import type { AuditTrail, MaybePromise } from '../audit';
import type { EventBus } from '../event-bus';

export type SagaContext = Record<string, unknown>;
export type SagaStatus = 'idle' | 'running' | 'compensating' | 'completed' | 'failed';
export type WorkflowStatus = SagaStatus | 'waiting';

export interface RetryPolicy {
  attempts: number;
  delayMs?: number;
}

export interface WorkflowStep<P extends SagaContext = SagaContext> {
  name: string;
  onEvent?: IntentName;
  retry?: RetryPolicy;
  timeoutMs?: number;
  /**
   * Execute one step. The signal is aborted when `timeoutMs` elapses; implementations
   * performing I/O must pass it to the underlying client for cooperative cancellation.
   */
  execute: (
    payload: P,
    bus: EventBus,
    signal: AbortSignal
  ) => MaybePromise<Partial<P> | void>;
  compensate?: (payload: P, bus: EventBus, error?: unknown) => MaybePromise<void>;
}

export interface WorkflowStartTrigger<P extends SagaContext = SagaContext> {
  intent: IntentName;
  mapEventToPayload(event: DomainEvent<IntentName, unknown>): P;
}

export interface WorkflowDefinition<P extends SagaContext = SagaContext> {
  name: string;
  steps: WorkflowStep<P>[];
  startOn?: WorkflowStartTrigger<P>;
}

export interface WorkflowSnapshot<P extends SagaContext = SagaContext> {
  id: string;
  workflowName: string;
  status: WorkflowStatus;
  context: P;
  completedSteps: string[];
  currentStep?: string;
  failedStep?: string;
  attempts: Record<string, number>;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

/**
 * Pluggable saga/workflow snapshot store.
 *
 * **Durability stance (R9):** Default `InMemoryWorkflowStore` is reference-only (not
 * production durability). Inject a durable store for production. See
 * `docs/production-hardening.md`.
 */
export interface WorkflowStore {
  save<P extends SagaContext>(snapshot: WorkflowSnapshot<P>): MaybePromise<void>;
  get<P extends SagaContext = SagaContext>(id: string): MaybePromise<WorkflowSnapshot<P> | undefined>;
  list(workflowName?: string): MaybePromise<WorkflowSnapshot[]>;
  clear(): MaybePromise<void>;
}

export interface WorkflowEngine {
  register<P extends SagaContext>(definition: WorkflowDefinition<P>): void;
  start<P extends SagaContext>(
    workflowName: string,
    initialPayload: P,
    options?: { id?: string }
  ): Promise<WorkflowSnapshot<P>>;
  get<P extends SagaContext = SagaContext>(id: string): Promise<WorkflowSnapshot<P> | undefined>;
  list(workflowName?: string): Promise<WorkflowSnapshot[]>;
}

export interface CreateWorkflowEngineOptions {
  store?: WorkflowStore;
  auditTrail?: AuditTrail;
  defaultRetry?: RetryPolicy;
}

export interface SagaStep<P extends SagaContext = SagaContext> extends WorkflowStep<P> {}

export interface SagaDefinition<P extends SagaContext = SagaContext> {
  name: string;
  steps: SagaStep<P>[];
}

export interface SagaInstance<P extends SagaContext = SagaContext> {
  id: string;
  definition: SagaDefinition<P>;
  readonly status: SagaStatus;
  readonly completedSteps: string[];
  run(initialPayload: P): Promise<void>;
}
