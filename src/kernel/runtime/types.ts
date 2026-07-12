import type { AuditTrail } from '../audit';
import type { DependencyGraph } from '../graph';
import type { EventContractRegistry } from '../event-contracts';
import type { IntentRegistry } from '../intent';
import type { ArchitectureProfile, ArkCheckConfig } from '../layers';
import type { ArkManifest } from '../manifest';
import type { MetadataRegistry } from '../metadata';
import type { ObservabilityReporter } from '../observability';
import type { Policy, PolicyEngine } from '../policy';
import type { ProjectionRegistry } from '../projections';
import type { EventBus, EventPublisher, ObservedLayerFlowMode } from '../event-bus';
import type { IntentCreator } from '../intent';
import type { IntentName } from '../../domain/types';
import type { EventBufferStore } from '../outbox';
import type { WorkflowEngine } from '../workflow';

export interface ArkKernel {
  instanceId: string;
  profile: ArchitectureProfile;
  registry: IntentRegistry;
  graph: DependencyGraph;
  metadata: MetadataRegistry;
  auditTrail: AuditTrail;
  eventContracts: EventContractRegistry;
  eventBuffer: EventBufferStore;
  /** @deprecated Use eventBuffer. */
  outbox: EventBufferStore;
  projections: ProjectionRegistry;
  policyEngine: PolicyEngine;
  eventBus: EventBus;
  workflowEngine: WorkflowEngine;
  observability: ObservabilityReporter;
  publisher<N extends IntentName, P>(
    source: N | IntentCreator<N, P>
  ): EventPublisher;
  syncGraph(): void;
  manifest(): ArkManifest;
}

export interface CreateArkKernelOptions {
  /**
   * When true (default), createArkKernel uses the hardened runtime defaults:
   * strict event contracts and hard observed-layer enforcement.
   * Set to false only for explicit migration/legacy paths.
   */
  strict?: boolean;
  profile?: ArchitectureProfile;
  policies?: Policy[];
  auditTrail?: AuditTrail;
  eventContracts?: EventContractRegistry;
  eventBuffer?: EventBufferStore;
  /** @deprecated Use eventBuffer. */
  outbox?: EventBufferStore;
  metadata?: MetadataRegistry;
  projections?: ProjectionRegistry;
  /**
   * Cap for in-memory event history, trace, and audit records.
   * Defaults to DEFAULT_MAX_HISTORY_SIZE (1000); oldest records are evicted
   * first. Pass Infinity for unbounded retention (pre-1.6 behavior).
   */
  maxHistorySize?: number;
  autoApplyProjections?: boolean;
  strictEventContracts?: boolean;
  requireKnownSource?: boolean;
  /**
   * Enforce observed producer→event layer flows against the profile at runtime.
   * Defaults to 'hard' when strict is true and 'off' when strict is false.
   */
  enforceObservedLayerFlow?: ObservedLayerFlowMode;
  instanceId?: string;
}

export interface CreateArkKernelFromConfigOptions
  extends Omit<CreateArkKernelOptions, 'profile'> {
  /** Runtime profile name. Default: config.name or "ark.config.json". */
  profileName?: string;
}

export type ArkKernelConfig = ArkCheckConfig;
