import { createAuditTrail } from '../audit';
import { createEventBus } from '../event-bus';
import { createEventContractRegistry } from '../event-contracts';
import { createDependencyGraph, syncRegistryToGraph } from '../graph';
import { createIntentRegistry } from '../intent';
import {
  createArchitectureProfileFromArkConfig,
  elevenLayerProfile,
} from '../layers';
import { createArkManifest } from '../manifest';
import { createMetadataRegistry } from '../metadata';
import { createObservabilityReporter } from '../observability';
import { InMemoryEventBuffer } from '../outbox';
import {
  PolicyEngine,
  defineArchitectureProfilePolicy,
} from '../policy';
import { createProjectionRegistry } from '../projections';
import { createWorkflowEngine } from '../workflow';
import type {
  ArkKernel,
  ArkKernelConfig,
  CreateArkKernelFromConfigOptions,
  CreateArkKernelOptions,
} from './types';

/**
 * Default cap for in-memory history, trace, and audit records. Without a cap a
 * long-running process grows without bound on every publish. Pass
 * `maxHistorySize: Infinity` to explicitly opt back into unbounded retention.
 */
export const DEFAULT_MAX_HISTORY_SIZE = 1000;

let kernelSequence = 0;

function nextKernelInstanceId(): string {
  kernelSequence += 1;
  return `ark-kernel-${Date.now()}-${kernelSequence}`;
}

export function createArkKernel(options: CreateArkKernelOptions = {}): ArkKernel {
  const strict = options.strict ?? true;
  const instanceId = options.instanceId ?? nextKernelInstanceId();
  const profile = options.profile ?? elevenLayerProfile;
  const maxHistorySize = options.maxHistorySize ?? DEFAULT_MAX_HISTORY_SIZE;
  const registry = createIntentRegistry();
  const graph = createDependencyGraph();
  const metadata = options.metadata ?? createMetadataRegistry();
  const auditTrail = options.auditTrail ?? createAuditTrail({ maxRecords: maxHistorySize });
  const eventContracts = options.eventContracts ?? createEventContractRegistry();
  const eventBuffer = options.eventBuffer ?? options.outbox ?? new InMemoryEventBuffer();
  const projections =
    options.projections ?? createProjectionRegistry({ auditTrail });
  const policyEngine = new PolicyEngine([
    defineArchitectureProfilePolicy(profile),
    ...(options.policies ?? []),
  ]);

  const syncGraph = () => {
    syncRegistryToGraph(registry, graph, { requireRegisteredTargets: true });
  };

  const eventBus = createEventBus({
    intentRegistry: registry,
    dependencyGraph: graph,
    policyEngine,
    strictRegistry: true,
    validateIntentNaming: true,
    auditTrail,
    eventContracts,
    strictEventContracts: options.strictEventContracts ?? strict,
    requireKnownSource: options.requireKnownSource ?? true,
    architectureProfile: profile,
    enforceObservedLayerFlow:
      options.enforceObservedLayerFlow ?? (strict ? 'hard' : 'off'),
    eventBuffer,
    instanceId,
    maxHistorySize,
    onPublish: options.autoApplyProjections === false
      ? undefined
      : async (event) => {
          await projections.apply(event);
        },
  });

  const workflowEngine = createWorkflowEngine(eventBus, { auditTrail });
  const observability = createObservabilityReporter({
    registry,
    eventBus,
    graph,
  });

  return {
    instanceId,
    profile,
    registry,
    graph,
    metadata,
    auditTrail,
    eventContracts,
    eventBuffer,
    outbox: eventBuffer,
    projections,
    policyEngine,
    eventBus,
    workflowEngine,
    observability,
    publisher(source) {
      return eventBus.createPublisher(source);
    },
    syncGraph,
    manifest() {
      syncGraph();
      return createArkManifest({
        registry,
        policyEngine,
        metadata,
        graph,
        profile,
        projections,
        eventContracts,
        observability,
      });
    },
  };
}

export function createStrictArkKernel(
  options: CreateArkKernelOptions = {}
): ArkKernel {
  return createArkKernel({
    ...options,
    strict: true,
    strictEventContracts: options.strictEventContracts ?? true,
    requireKnownSource: options.requireKnownSource ?? true,
    enforceObservedLayerFlow: options.enforceObservedLayerFlow ?? 'hard',
  });
}

function createOptionsFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions = {}
): CreateArkKernelOptions {
  const { profileName, ...kernelOptions } = options;
  return {
    ...kernelOptions,
    profile: createArchitectureProfileFromArkConfig(config, { name: profileName }),
  };
}

export function createArkKernelFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions = {}
): ArkKernel {
  return createArkKernel(createOptionsFromConfig(config, options));
}

export function createStrictArkKernelFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions = {}
): ArkKernel {
  return createStrictArkKernel(createOptionsFromConfig(config, options));
}

export function createLenientArkKernelFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions = {}
): ArkKernel {
  return createLenientArkKernel(createOptionsFromConfig(config, options));
}

export function createLenientArkKernel(
  options: CreateArkKernelOptions = {}
): ArkKernel {
  return createArkKernel({
    ...options,
    strict: false,
    strictEventContracts: options.strictEventContracts ?? false,
    enforceObservedLayerFlow: options.enforceObservedLayerFlow ?? 'off',
  });
}
