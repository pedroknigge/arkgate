import { requestArkRunGraph } from '../../domain/arkRunGraph';
import {
  buildArkRunInspectorOutboxMonitor,
  buildArkRunInspectorSnapshot,
  buildArkRunInspectorWorkflowsMonitor,
} from '../../domain/arkRunInspector';
import { buildDependencyInformationPackage } from '../../domain/arkRunInformationPackage';
import { ARK_RUN_EPHEMERAL_DEFAULT } from '../../domain/arkRunTransport';
import { createAuditTrail } from '../audit';
import { EventBusImpl } from '../event-bus';
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
import { createComponentRegistry } from './componentRegistry';
import { startArkRunInspector, type ArkRunInspectorSource } from './inspector';
import { sendOnArkRunTransport } from './transport';
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

  const defaultEphemeral = options.ephemeral ?? ARK_RUN_EPHEMERAL_DEFAULT;
  const broker = options.broker;
  const eventBus = new EventBusImpl({
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
  const components = createComponentRegistry();
  const brokerBound = typeof broker?.send === 'function';

  const kernel: ArkKernel = {
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
      const inner = eventBus.createPublisher(source);
      return {
        source: inner.source,
        publish: inner.publish,
        send(intent, payload, sendOptions = {}) {
          return sendOnArkRunTransport(
            { eventBus, broker, defaultEphemeral },
            intent,
            payload,
            { ...sendOptions, source: inner.source }
          );
        },
      };
    },
    send(intent, payload, sendOptions = {}) {
      return sendOnArkRunTransport(
        { eventBus, broker, defaultEphemeral },
        intent,
        payload,
        sendOptions
      );
    },
    register(options) {
      return components.register(options);
    },
    resolve(id) {
      return components.resolve(id);
    },
    resolveSingleton(id) {
      return components.resolveSingleton(id);
    },
    getDependencyInformationPackage() {
      return buildDependencyInformationPackage({
        kernelInstanceId: instanceId,
        components: components.snapshotComponents(),
      });
    },
    requestGraph(query) {
      return requestArkRunGraph(
        {
          kernelInstanceId: instanceId,
          components: components.snapshotComponents(),
        },
        query
      );
    },
    getInspectorSnapshot(bind) {
      return buildArkRunInspectorSnapshot({
        kernelInstanceId: instanceId,
        host: bind?.host,
        port: bind?.port,
        package: {
          kernelInstanceId: instanceId,
          components: components.snapshotComponents(),
        },
        observability: observability.report(),
        ephemeralDefault: defaultEphemeral,
        brokerBound,
      });
    },
    startInspector(options) {
      const inspectorSource: ArkRunInspectorSource = {
        getInspectorSnapshot: (bind) => kernel.getInspectorSnapshot(bind),
        requestGraph: (query) => kernel.requestGraph(query),
        async listInspectorOutbox() {
          const [pending, failed] = await Promise.all([
            eventBuffer.list('pending'),
            eventBuffer.list('failed'),
          ]);
          return buildArkRunInspectorOutboxMonitor([...pending, ...failed]);
        },
        async listInspectorWorkflows() {
          return buildArkRunInspectorWorkflowsMonitor(await workflowEngine.list());
        },
        outbox: eventBuffer,
        eventBuffer,
        workflowEngine,
      };
      return startArkRunInspector(inspectorSource, options);
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
  return kernel;
}

/**
 * Preferred ArkRun factory. Each call is a new isolated instance — there is no
 * process-wide singleton.
 */
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
