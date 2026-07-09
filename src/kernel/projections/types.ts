import type { DomainEvent, IntentName } from '../../domain/types';
import type { AuditTrail, MaybePromise } from '../audit';

export interface ProjectionDefinition<State = unknown> {
  name: string;
  sourceIntents: IntentName[];
  initialState: State | (() => State);
  project(event: DomainEvent<IntentName, unknown>, state: State): MaybePromise<State>;
}

export interface ProjectionCheckpoint {
  projection: string;
  appliedCount: number;
  lastIntent?: string;
  lastCorrelationId?: string;
  updatedAt?: string;
}

/**
 * Pluggable projection/read-model state.
 *
 * **Durability stance (R9):** Default `InMemoryReadModelStore` is reference-only (not
 * production durability). Inject a durable store for production. See
 * `docs/production-hardening.md`.
 */
export interface ReadModelStore {
  load<State = unknown>(name: string): MaybePromise<State | undefined>;
  save<State = unknown>(name: string, state: State): MaybePromise<void>;
  clear(name?: string): MaybePromise<void>;
}

export interface ProjectionRegistry {
  register<State>(definition: ProjectionDefinition<State>): void;
  list(): ProjectionDefinition[];
  apply(event: DomainEvent<IntentName, unknown>): Promise<string[]>;
  getState<State = unknown>(name: string): Promise<State | undefined>;
  getCheckpoint(name: string): ProjectionCheckpoint | undefined;
  getCheckpoints(): ProjectionCheckpoint[];
  clear(): Promise<void>;
}

export interface CreateProjectionRegistryOptions {
  store?: ReadModelStore;
  auditTrail?: AuditTrail;
}
