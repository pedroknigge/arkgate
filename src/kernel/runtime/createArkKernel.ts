import { requestArkRunGraph } from '../../domain/arkRunGraph';
import {
  ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
  buildArkRunInspectorHardening,
  buildArkRunInspectorOutboxMonitor,
  buildArkRunInspectorSnapshot,
  buildArkRunInspectorWorkflowsMonitor,
  classifyArkRunInspectorStoreDurability,
} from '../../domain/arkRunInspector';
import { buildDependencyInformationPackage } from '../../domain/arkRunInformationPackage';
import { ARK_RUN_EPHEMERAL_DEFAULT } from '../../domain/arkRunTransport';
import { createAuditTrail } from '../audit';
import { ArkKernelConfigError, EventBusImpl } from '../event-bus';
import type { ObservedLayerFlowMode } from '../event-bus';
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
import { nextRuntimeId } from '../runtimeIds';

/**
 * Default cap for in-memory history, trace, audit, and default event-buffer
 * records. Without a cap a long-running process grows without bound on every
 * publish. Pass `maxHistorySize: Infinity` to explicitly opt back into unbounded
 * retention. An injected `eventBuffer` owns its own retention.
 */
export const DEFAULT_MAX_HISTORY_SIZE = 1000;

function nextKernelInstanceId(): string {
  return nextRuntimeId('ark-kernel');
}

function portConstructorId(port: object, fallback: string): string {
  const name = (port as { constructor?: { name?: string } }).constructor?.name;
  return typeof name === 'string' && name.length > 0 ? name : fallback;
}

export function createArkKernel(options: CreateArkKernelOptions = {}): ArkKernel {
  const strict = options.strict ?? true;
  const instanceId = options.instanceId ?? nextKernelInstanceId();
  const profile = options.profile ?? elevenLayerProfile;
  const maxHistorySize = options.maxHistorySize ?? DEFAULT_MAX_HISTORY_SIZE;
  const registry = createIntentRegistry();
  const graph = createDependencyGraph();
  const metadata = options.metadata ?? createMetadataRegistry();
  const usedDefaultAudit = options.auditTrail === undefined;
  const auditTrail = options.auditTrail ?? createAuditTrail({ maxRecords: maxHistorySize });
  const eventContracts = options.eventContracts ?? createEventContractRegistry();
  const usedDefaultEventBuffer = options.eventBuffer === undefined && options.outbox === undefined;
  const eventBuffer =
    options.eventBuffer ??
    options.outbox ??
    new InMemoryEventBuffer({ maxRecords: maxHistorySize });
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
    // No relay drains the default in-memory buffer: settle its records when the
    // kernel finishes delivery so the outbox monitor does not report a backlog
    // nobody will ever drain. Injected buffers stay relay-owned (`pending`).
    settleBufferOnLocalDelivery: usedDefaultEventBuffer,
    instanceId,
    maxHistorySize,
    onPublish: options.autoApplyProjections === false
      ? undefined
      : async (event) => {
          await projections.apply(event);
        },
  });

  // createWorkflowEngine defaults to InMemoryWorkflowStore (not injectable via kernel options).
  const workflowEngine = createWorkflowEngine(eventBus, { auditTrail });
  const observability = createObservabilityReporter({
    registry,
    eventBus,
    graph,
  });
  const components = createComponentRegistry();
  const brokerBound = typeof broker?.send === 'function';

  const outboxStoreId = usedDefaultEventBuffer
    ? 'InMemoryEventBuffer'
    : portConstructorId(eventBuffer, 'EventBufferStore');
  const auditStoreId = usedDefaultAudit
    ? 'InMemoryAuditStore'
    : portConstructorId(auditTrail, 'AuditTrail');
  const hardening = buildArkRunInspectorHardening({
    stores: [
      classifyArkRunInspectorStoreDurability(outboxStoreId, 'outbox'),
      classifyArkRunInspectorStoreDurability(auditStoreId, 'audit'),
      classifyArkRunInspectorStoreDurability('InMemoryWorkflowStore', 'workflow'),
    ],
  });

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
        hardening,
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
          return buildArkRunInspectorOutboxMonitor([...pending, ...failed], {
            sampleLimit: ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
          });
        },
        async listInspectorWorkflows() {
          return buildArkRunInspectorWorkflowsMonitor(await workflowEngine.list(), {
            sampleLimit: ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
          });
        },
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

/**
 * Layers named by a deny rule that declare no `intentPrefixes`. Runtime
 * observed-layer-flow maps intents to layers by prefix only, so such a rule can
 * never fire at runtime.
 */
function unresolvableDenyRuleLayers(config: ArkKernelConfig): string[] {
  const withPrefixes = new Set(
    config.layers
      .filter((layer) => (layer.intentPrefixes ?? []).some((p) => p.trim().length > 0))
      .map((layer) => layer.name)
  );
  const missing = new Set<string>();
  for (const rule of config.rules ?? []) {
    if (rule.allowed !== false) continue;
    for (const name of [rule.from, rule.to]) {
      if (!withPrefixes.has(name)) missing.add(name);
    }
  }
  return [...missing].sort();
}

function createOptionsFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions,
  defaultFlowMode: ObservedLayerFlowMode
): CreateArkKernelOptions {
  const { profileName, ...kernelOptions } = options;
  // Fail closed: a kernel labelled hard must not silently enforce nothing.
  if ((options.enforceObservedLayerFlow ?? defaultFlowMode) === 'hard') {
    const missing = unresolvableDenyRuleLayers(config);
    if (missing.length > 0) throw new ArkKernelConfigError(missing);
  }
  return {
    ...kernelOptions,
    profile: createArchitectureProfileFromArkConfig(config, { name: profileName }),
  };
}

export function createArkKernelFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions = {}
): ArkKernel {
  const strict = options.strict ?? true;
  return createArkKernel(
    createOptionsFromConfig(config, options, strict ? 'hard' : 'off')
  );
}

/**
 * Strict kernel whose runtime layer profile comes from `ark.config.json`.
 * Hard observed-layer-flow needs `intentPrefixes` on every layer a deny rule
 * names; otherwise this throws `ArkKernelConfigError`
 * (`ARKRUN_LAYER_FLOW_UNRESOLVABLE`) instead of enforcing nothing.
 */
export function createStrictArkKernelFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions = {}
): ArkKernel {
  return createStrictArkKernel(createOptionsFromConfig(config, options, 'hard'));
}

export function createLenientArkKernelFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions = {}
): ArkKernel {
  return createLenientArkKernel(createOptionsFromConfig(config, options, 'off'));
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
