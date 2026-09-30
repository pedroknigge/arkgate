/**
 * ArkGate — Architecture Co-pilot for AI TypeScript
 *
 * Zero-dependency write gate + CI gate + co-pilot (plan / goal / loop) for
 * TypeScript repos and agents. Optional runtime kernel is not the product.
 * npm package: `arkgate` (formerly `ark-runtime-kernel`).
 *
 * **ArkRun kernel source:** this barrel is compiled into `arkgate/runtime`
 * (and the deprecated `@arkgate/runtime` companion). The stable `arkgate` root
 * is built from `src/gate.ts` and does not re-export kernel factories.
 *
 * @packageDocumentation
 */

export { version } from './version';

// Adapter contract, AI code gate, architecture profiles, analysis engine, policy
// delta, diagnostic catalog, enforcement state, design delta, and resolved facts:
// the same list the stable `arkgate` root exports.
export * from './kernel/sharedPublicSurface';

// Domain types are re-exported below; no local value imports needed here.

/**
 * Core domain types (re-exported).
 */
export type {
  IntentName,
  DomainEvent,
  EventMetadata,
  CorrelationId,
} from './domain/types';

// =============================================================================
// Intent Registry & Semantic Dependencies (Iteration 1)
// =============================================================================

export {
  defineIntent,
  createIntentRegistry,
  defaultIntentRegistry,
  type IntentCreator,
  type IntentRelationship,
  type IntentRelationshipKind,
  type DefineIntentOptions,
  IntentRegistry, // class (usable as value and type)
  validateIntentName,
  type IntentNameValidation,
} from './kernel/intent';

// Re-export legacy IntentDefinition name for backwards compatibility during early development
export type { IntentCreator as IntentDefinition } from './kernel/intent';

// =============================================================================
// Policy Engine (Iteration 2)
// =============================================================================

export {
  definePolicy,
  PolicyEngine,
  PolicyViolationError,
  defineLayerPolicy,
  defineArchitectureProfilePolicy,
  architecturalPolicies,
  isLayerPolicy,
  type Policy,
  type PolicySeverity,
  type PolicyEnforcementMode,
  type PolicyViolation,
  type PolicyEvaluationResult,
  type DefinePolicyOptions,
  type LayerPolicyOptions,
  type LayerFlowRule,
} from './kernel/policy';

// =============================================================================
// Event Bus (Iteration 3)
// =============================================================================

export {
  createEventBus,
  type EventBus,
  type EventBusOptions,
  type EventHandler,
  type EventInterceptionInfo,
  type EventInterceptor,
  type EventInterceptorContext,
  type EventPayloadPatch,
  type EventPublisher,
  type Unsubscribe,
  type PublishedEventRecord,
  type TraceRecord,
  type TraceRecordType,
  type TraceSink,
  type ObservedLayerFlowMode,
  buildPublishPolicyContext,
  definePublishPolicy,
  UnregisteredIntentError,
  InvalidIntentNameError,
  LayerPolicyContextError,
  EventContractViolationError,
  UnknownEventSourceError,
  SourceMetadataOverrideError,
  ObservedLayerFlowViolationError,
  ArkKernelConfigError,
  type PublishPolicyContext,
  type GraphPolicyContext,
  type BuildPublishPolicyContextOptions,
} from './kernel/event-bus';

// =============================================================================
// Event Contracts & Outbox
// =============================================================================

export {
  createEventContractRegistry,
  EventContractRegistryImpl,
  type EventContract,
  type EventContractIssue,
  type EventContractRegistry,
  type EventContractValidationResult,
  type EventPayloadSchema,
  type EventSchemaField,
  type EventSchemaFieldType,
} from './kernel/event-contracts';

export {
  InMemoryOutboxStore,
  InMemoryEventBuffer,
  type InMemoryEventBufferOptions,
  type OutboxRecord,
  type OutboxStatus,
  type OutboxStore,
  type EventBufferRecord,
  type EventBufferStatus,
  type EventBufferStore,
} from './kernel/outbox';

// =============================================================================
// Observability
// =============================================================================

export {
  createObservabilityReporter,
  type CreateObservabilityReporterOptions,
  type ObservabilityDriftReport,
  type ObservabilityFlow,
  type ObservabilityReporter,
} from './kernel/observability';

// =============================================================================
// Testing
// =============================================================================

export {
  createArkTestHarness,
  type ArkTestHarness,
  type ArkTestSnapshot,
} from './kernel/testing';

// =============================================================================
// Native Audit & History
// =============================================================================

export {
  createAuditTrail,
  InMemoryAuditStore,
  type AuditRecord,
  type AuditRecordInput,
  type AuditRecordType,
  type AuditQuery,
  type AuditStore,
  type AuditTrail,
  type CreateAuditTrailOptions,
} from './kernel/audit';

// =============================================================================
// Dependency Graph (Iteration 3+)
// =============================================================================

export {
  createDependencyGraph,
  syncRegistryToGraph,
  type DependencyGraph,
  type GraphEdge,
  type GraphNode,
  type SyncRegistryOptions,
} from './kernel/graph';

// =============================================================================
// Metadata System (basic)
// =============================================================================

export {
  createMetadataRegistry,
  type MetadataRegistry,
  type EntityMeta,
  type FieldMeta,
} from './kernel/metadata';

// =============================================================================
// Ports & Adapters (basic)
// =============================================================================

export {
  definePort,
  createAdapter,
  checkAdapterGovernance,
  checkContract,
  type Port,
  type Adapter,
  type AdapterGovernanceIssue,
  type AdapterGovernanceResult,
  type ContractCheckResult,
  type CreateAdapterOptions,
  type DefinePortOptions,
} from './kernel/adapters';

// =============================================================================
// Read Models / Projections
// =============================================================================

export {
  createProjectionRegistry,
  InMemoryReadModelStore,
  type ProjectionCheckpoint,
  type ProjectionDefinition,
  type ProjectionRegistry,
  type ReadModelStore,
  type CreateProjectionRegistryOptions,
} from './kernel/projections';

// =============================================================================
// Ark Manifest (machine-readable contract export)
// =============================================================================

export {
  createArkManifest,
  type ArkManifest,
  type ArkManifestData,
  type ArkManifestIntent,
  type ArkManifestPolicy,
  type ArkManifestGraph,
  type ArkManifestEntityLink,
  type ArkManifestArchitecture,
  type ArkManifestProjection,
  type CreateArkManifestOptions,
  MANIFEST_SCHEMA_VERSION,
} from './kernel/manifest';

// =============================================================================
// Workflow / Saga
// =============================================================================

export {
  createSaga,
  createWorkflowEngine,
  InMemoryWorkflowStore,
  type CreateWorkflowEngineOptions,
  type RetryPolicy,
  type SagaDefinition,
  type SagaStep,
  type SagaInstance,
  type SagaStatus,
  type WorkflowDefinition,
  type WorkflowEngine,
  type WorkflowSnapshot,
  type WorkflowStatus,
  type WorkflowStep,
  type WorkflowStore,
} from './kernel/workflow';

// =============================================================================
// Strict Ark Kernel Runtime
// =============================================================================

export {
  DEFAULT_MAX_HISTORY_SIZE,
  ARK_RUN_COMPONENT_LIFETIMES,
  ARK_RUN_EPHEMERAL_DEFAULT,
  ARK_RUN_GRAPH_DEFAULT_SLICE,
  ARK_RUN_GRAPH_NODE_KINDS,
  ARK_RUN_GRAPH_PROCESS_EDGE_KINDS,
  ARK_RUN_GRAPH_SCHEMA_VERSION,
  ARK_RUN_GRAPH_SLICES,
  ARK_RUN_GRAPH_TECHNICAL_EDGE_KINDS,
  ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION,
  ARK_RUN_INSPECTOR_DEFAULT_HOST,
  ARK_RUN_INSPECTOR_DEFAULT_PORT,
  ARK_RUN_INSPECTOR_EVENTS_PATH,
  ARK_RUN_INSPECTOR_GRAPH_PATH,
  ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
  ARK_RUN_INSPECTOR_OUTBOX_PATH,
  ARK_RUN_INSPECTOR_SCHEMA_VERSION,
  ARK_RUN_INSPECTOR_SNAPSHOT_PATH,
  ARK_RUN_INSPECTOR_SSE_EVENT,
  ARK_RUN_INSPECTOR_TRANSPORT_FALLBACK,
  ARK_RUN_INSPECTOR_WORKFLOWS_PATH,
  ARK_RUN_TRANSPORT_KINDS,
  ArkRunInspectorBindError,
  ArkRunInspectorProductionError,
  InvalidArkRunGraphQueryError,
  InvalidArkRunSendOptionError,
  arkRunGraphQueryFromSearchParams,
  arkRunInspectorUrl,
  buildArkRunInspectorHardening,
  buildArkRunInspectorOutboxMonitor,
  buildArkRunInspectorSnapshot,
  buildArkRunInspectorWorkflowsMonitor,
  classifyArkRunInspectorStoreDurability,
  appendDecisionTape,
  buildDependencyInformationPackage,
  compareInformationPackages,
  replayInformationPackages,
  shadowInformationPackage,
  closeArkRunGraphQuery,
  closedArkRunEphemeral,
  closedArkRunTransportKind,
  createArkKernel,
  createArkKernelFromConfig,
  createLenientArkKernel,
  createLenientArkKernelFromConfig,
  createStrictArkKernel,
  createStrictArkKernelFromConfig,
  formatArkRunGraphMermaid,
  formatArkRunInspectorSseEvent,
  isArkRunInspectorLoopbackHost,
  isArkRunInspectorProductionEnv,
  requestArkRunGraph,
  resolveArkRunInspectorBind,
  resolveArkRunSendPlan,
  startArkRunInspector,
  unavailableArkRunInspectorOutboxMonitor,
  unavailableArkRunInspectorWorkflowsMonitor,
  type ArkKernelConfig,
  type ArkKernel,
  type ArkRunBrokerAdapter,
  type ArkRunComponentLifetime,
  type ArkRunDeliveredVia,
  type ArkRunExtendedInfo,
  type ArkRunGraph,
  type ArkRunGraphEdge,
  type ArkRunGraphEdgeKind,
  type ArkRunGraphMatch,
  type ArkRunGraphMatchInput,
  type ArkRunGraphNode,
  type ArkRunGraphNodeKind,
  type ArkRunGraphProcessEdgeKind,
  type ArkRunGraphQuery,
  type ArkRunGraphResolvedQuery,
  type ArkRunGraphSlice,
  type ArkRunGraphTechnicalEdgeKind,
  type ArkRunInformationPackageComponent,
  type ArkRunInspectorBind,
  type ArkRunInspectorBindInput,
  type ArkRunInspectorHandle,
  type ArkRunInspectorHardening,
  type ArkRunInspectorHardeningDurability,
  type ArkRunInspectorMonitorBuildOptions,
  type ArkRunInspectorOutboxMonitor,
  type ArkRunInspectorOutboxRecordSummary,
  type ArkRunInspectorSnapshot,
  type ArkRunInspectorSnapshotInput,
  type ArkRunInspectorSource,
  type ArkRunInspectorStoreDurability,
  type ArkRunInspectorStoreDurabilityKind,
  type ArkRunInspectorStoreRole,
  type ArkRunInspectorTransportFacts,
  type ArkRunInspectorWorkflowSummary,
  type ArkRunInspectorWorkflowsMonitor,
  type ArkRunPublisher,
  type ArkRunRegisterOptions,
  type ArkRunRegistrationHandle,
  type ArkRunSendOptions,
  type ArkRunSendPlan,
  type ArkRunSendPlanInput,
  type ArkRunSendResult,
  type ArkRunTransportKind,
  type CreateArkKernelFromConfigOptions,
  type CreateArkKernelOptions,
  type DependencyInformationPackage,
  type InformationPackageCompare,
  type InformationPackageDiff,
  type StartArkRunInspectorOptions,
} from './kernel/runtime';
