/**
 * ArkGate — Architecture Co-pilot for AI TypeScript
 *
 * Zero-dependency write gate + CI gate + co-pilot (plan / goal / loop) for
 * TypeScript repos and agents. Optional runtime kernel is not the product.
 * npm package: `arkgate` (formerly `ark-runtime-kernel`).
 *
 * **Runtime package source:** this barrel is compiled only into `@arkgate/runtime`.
 * The stable `arkgate` root is built from `src/gate.ts`.
 *
 * @packageDocumentation
 */

export { version } from './version';

export {
  ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
  ARK_ANALYSIS_RESULT_SCHEMA,
  createAdapterResult,
  toAdapterDiagnostic,
  type AnalysisCompleteness,
  type AdapterDiagnostic,
  type AdapterResult,
  type AdapterSeverity,
  type AdapterViolationInput,
} from './domain/adapterContract';

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
  InMemoryEventBuffer,
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
// Architecture Profiles / 11-Layer Governance
// =============================================================================

export {
  createArchitectureProfile,
  createArchitectureProfileFromArkConfig,
  createElevenLayerArkConfig,
  elevenLayerProfile,
  type ArchitectureLayer,
  type ArchitectureLayerConfig,
  type ArchitectureProfile,
  type ArchitectureRule,
  type ArkCheckConfig,
  type CreateArchitectureProfileFromArkConfigOptions,
  type CreateArchitectureProfileOptions,
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
// Analysis Engine (stable IR contract)
// =============================================================================

export {
  loadContract,
  analyzeProject,
  analyzeChange,
  preflightChange,
  analyzePolicyDelta,
  analyzeArchitectureConvergence,
  explainViolation,
  evaluateArchitectureGraph,
  collectAnalysisConfigWarnings,
  detectArchitectureCycles,
  collectForbiddenCapabilityUses,
  extractSemanticDependencies,
  type AnalysisContract,
  type ArchitectureChangeMap,
  type ArchitectureChangeMapContract,
  type ArchitectureChangeMapDependency,
  type ArchitectureChangeMapFile,
  type ArchitectureChangeOperation,
  type AnalyzeArchitectureConvergenceInput,
  type ArchitectureActualChange,
  type ArchitectureConvergenceClassification,
  type ArchitectureConvergenceFinding,
  type ArchitectureConvergenceResult,
  type ArchitectureDependency,
  type AnalyzeProjectInput,
  type AnalyzeChangeInput,
  type AnalysisResult,
  type PreparedChangeFile,
  type ChangePreflightResult,
  type AnalyzePolicyDeltaInput,
  type PolicyDeltaAnalysis,
  type ArchitectureEngineViolation,
  type ArchitectureEngineEdge,
  type EvaluateArchitectureGraphInput,
  type ArchitectureEngineResult,
  type CollectAnalysisConfigWarningsInput,
  type ForbiddenCapabilityUse,
  type SemanticDependency,
  type SemanticDependencyKind,
} from './kernel/analysis';

export {
  POLICY_DELTA_SCHEMA_VERSION,
  classifyArkPolicyDelta,
  policyDeltaAcknowledgementMatches,
  type PolicyDelta,
  type PolicyDeltaAcknowledgement,
  type PolicyDeltaClassification,
  type PolicyDeltaFinding,
} from './domain/policyDelta';

export {
  ANALYSIS_IR_SCHEMA_VERSION,
  deterministicHash,
  stableSerialize,
  type AnalysisFileInput,
  type AnalysisFileChange,
  type AnalysisCompilerOptions,
  type AnalysisFile,
  type AnalysisImportEdge,
  type AnalysisCapabilityUse,
  type AnalysisEvidence,
  type AnalysisViolation,
  type AnalysisIr,
} from './domain/analysis';

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
