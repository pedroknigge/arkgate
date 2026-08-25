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
import type { DependencyInformationPackage } from '../../domain/arkRunInformationPackage';
import type {
  ArkRunInspectorBind,
  ArkRunInspectorSnapshot,
} from '../../domain/arkRunInspector';
import type {
  ArkRunRegisterOptions,
  ArkRunRegistrationHandle,
} from './componentRegistry';
import type { ArkRunInspectorHandle, StartArkRunInspectorOptions } from './inspector';
import type {
  ArkRunBrokerAdapter,
  ArkRunSendOptions,
  ArkRunSendResult,
} from './transport';

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
  ): ArkRunPublisher;
  /**
   * One send site for local / localBlocking / broker (ADR 0024).
   * Missing broker falls back to in-process local delivery — not cloud portability.
   */
  send<N extends IntentName, P>(
    intent: IntentCreator<N, P>,
    payload: P,
    options?: ArkRunSendOptions
  ): Promise<ArkRunSendResult>;
  /** Handle is declaration metadata only; the factory never leaves the registry. */
  register<T>(options: ArkRunRegisterOptions<T>): ArkRunRegistrationHandle;
  resolve<T = unknown>(id: string): T;
  resolveSingleton<T = unknown>(id: string): T;
  /** Tooling snapshot of ids, lifetime, and declarations — never construction. */
  getDependencyInformationPackage(): DependencyInformationPackage;
  /**
   * Inspector snapshot (package + transport facts + observability). Never
   * includes factories, live instances, broker adapters, or input DTOs.
   */
  getInspectorSnapshot(bind?: ArkRunInspectorBind): ArkRunInspectorSnapshot;
  /**
   * Opt-in loopback inspector. Refuses NODE_ENV=production and public binds.
   * Loads HTTP only when called.
   */
  startInspector(options?: StartArkRunInspectorOptions): Promise<ArkRunInspectorHandle>;
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
  /**
   * Consumer-injected broker adapter. Absence is normal: broker sends fall back
   * to in-process local delivery. Not cloud portability. This package does not
   * ship cloud SDKs.
   */
  broker?: ArkRunBrokerAdapter;
  /**
   * Await local bus recording / broker adapter handoff before `send()` resolves.
   * Default true (CLI, tests, short-lived workers). Not a durability claim.
   */
  ephemeral?: boolean;
}

export interface ArkRunPublisher extends EventPublisher {
  send<N extends IntentName, P>(
    intent: IntentCreator<N, P>,
    payload: P,
    options?: Omit<ArkRunSendOptions, 'source'>
  ): Promise<ArkRunSendResult>;
}

export interface CreateArkKernelFromConfigOptions
  extends Omit<CreateArkKernelOptions, 'profile'> {
  /** Runtime profile name. Default: config.name or "ark.config.json". */
  profileName?: string;
}

export type ArkKernelConfig = ArkCheckConfig;
