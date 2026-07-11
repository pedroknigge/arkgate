/**
 * Structrail — Architecture guardrails for AI TypeScript
 *
 * Zero-dependency write gate + CI gate + co-pilot (plan / goal / loop) for
 * TypeScript repos and agents. Optional runtime kernel is not the product.
 * legacy-identity:start v3-compatibility removal=v4
 * npm package: `structrail` (`arkgate` is the deprecated v3 compatibility package).
 * legacy-identity:end
 *
 * **Runtime kernel (opt-in):** prefer `import { … } from 'structrail/runtime'`.
 * This root barrel still re-exports kernel symbols for compatibility within
 * this major — see `docs/package-surface.md`.
 *
 * @packageDocumentation
 */

export { version } from './version';

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
  type OutboxRecord,
  type OutboxStatus,
  type OutboxStore,
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
  createStructrailTestHarness,
  type StructrailTestHarness,
  type StructrailTestSnapshot,
} from './kernel/testing';

/** @deprecated Use the Structrail-named testing exports. Removal target: v4. */
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
// Architecture Profiles / 11-Layer Governance
// =============================================================================

export {
  createArchitectureProfile,
  createArchitectureProfileFromStructrailConfig,
  createElevenLayerStructrailConfig,
  elevenLayerProfile,
  type ArchitectureLayer,
  type ArchitectureLayerConfig,
  type ArchitectureProfile,
  type ArchitectureRule,
  type StructrailCheckConfig,
  type CreateArchitectureProfileFromStructrailConfigOptions,
  type CreateArchitectureProfileOptions,
  type CreateElevenLayerStructrailConfigOptions,
} from './kernel/layers';

/** @deprecated Use the Structrail-named config exports. Removal target: v4. */
export {
  createArchitectureProfileFromArkConfig,
  createElevenLayerArkConfig,
  type ArkCheckConfig,
  type CreateArchitectureProfileFromArkConfigOptions,
  type CreateElevenLayerArkConfigOptions,
} from './kernel/layers';

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
// AI Code Gate (basic)
// =============================================================================

export {
  createAICodeGate,
  type AICodeGate,
  type AICodeGateResult,
  type AICodeGateViolation,
  type AICodeGateContext,
  type AICodeGateOptions,
  type AIGateExtension,
} from './kernel/ai-gate';

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
// Structrail Manifest (machine-readable contract export)
// =============================================================================

export {
  createStructrailManifest,
  type StructrailManifest,
  type StructrailManifestData,
  type StructrailManifestIntent,
  type StructrailManifestPolicy,
  type StructrailManifestGraph,
  type StructrailManifestEntityLink,
  type StructrailManifestArchitecture,
  type StructrailManifestProjection,
  type CreateStructrailManifestOptions,
  MANIFEST_SCHEMA_VERSION,
} from './kernel/manifest';

/** @deprecated Use the Structrail-named manifest exports. Removal target: v4. */
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
// Optional Structrail Kernel Runtime
// =============================================================================

export {
  DEFAULT_MAX_HISTORY_SIZE,
  createStructrailKernel,
  createStructrailKernelFromConfig,
  createLenientStructrailKernel,
  createLenientStructrailKernelFromConfig,
  createStrictStructrailKernel,
  createStrictStructrailKernelFromConfig,
  type StructrailKernelConfig,
  type StructrailKernel,
  type CreateStructrailKernelFromConfigOptions,
  type CreateStructrailKernelOptions,
} from './kernel/runtime';

/** @deprecated Use the Structrail-named runtime exports. Removal target: v4. */
export {
  createArkKernel,
  createArkKernelFromConfig,
  createLenientArkKernel,
  createLenientArkKernelFromConfig,
  createStrictArkKernel,
  createStrictArkKernelFromConfig,
  type ArkKernelConfig,
  type ArkKernel,
  type CreateArkKernelFromConfigOptions,
  type CreateArkKernelOptions,
} from './kernel/runtime';
