import { requestArkRunGraph } from '../../domain/arkRunGraph';
import {
  ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
  buildArkRunInspectorHardening,
  buildArkRunInspectorOutboxMonitor,
  buildArkRunInspectorSnapshot,
  buildArkRunInspectorWorkflowsMonitor,
  classifyArkRunInspectorStoreDurability,
} from '../../domain/arkRunInspector';
import {
  buildDependencyInformationPackage,
  sanitizeDecisionTapeRecord,
  type ArkRunDecisionTapeRecord,
} from '../../domain/arkRunInformationPackage';
import { unresolvableLayerFlowLayers } from '../../domain/sourcePolicy';
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
import {
  startArkRunInspector,
  type ArkRunInspectorHandle,
  type ArkRunInspectorSource,
} from './inspector';
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

const DEFAULT_DECISION_TAPE_SIZE = 500;

function normalizeDecisionTapeCap(value: number | undefined): number {
  if (value === undefined) return DEFAULT_DECISION_TAPE_SIZE;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new RangeError('maxDecisionTapeSize must be a positive integer.');
  }
  return value;
}

function cloneDecisionTapeRecord(
  entry: ArkRunDecisionTapeRecord
): ArkRunDecisionTapeRecord {
  return {
    xiHash: entry.xiHash,
    event: {
      kind: entry.event.kind,
      ...(entry.event.payload ? { payload: { ...entry.event.payload } } : {}),
    },
    residual: { ...entry.residual },
  };
}

function nextKernelInstanceId(): string {
  return nextRuntimeId('ark-kernel');
}

function portConstructorId(port: object, fallback: string): string {
  const name = (port as { constructor?: { name?: string } }).constructor?.name;
  return typeof name === 'string' && name.length > 0 && name !== 'Object'
    ? name
    : fallback;
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
    strictRegistry: options.strictRegistry ?? strict,
    validateIntentNaming: options.validateIntentNaming ?? strict,
    auditTrail,
    eventContracts,
    strictEventContracts: options.strictEventContracts ?? strict,
    requireKnownSource: options.requireKnownSource ?? strict,
    rethrowHandlerErrors: options.rethrowHandlerErrors,
    traceSinks: options.traceSinks,
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

  const usedDefaultWorkflowStore = options.workflowStore === undefined;
  const workflowEngine = createWorkflowEngine(eventBus, {
    auditTrail,
    store: options.workflowStore,
  });
  const observability = createObservabilityReporter({
    registry,
    eventBus,
    graph,
  });
  let kernel!: ArkKernel;
  const components = createComponentRegistry({
    getKernel: () => kernel,
    allowOverrides: options.allowOverrides === true,
  });
  const brokerBound = typeof broker?.send === 'function';
  const activeInspectors = new Set<ArkRunInspectorHandle>();
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  const decisionTape: ArkRunDecisionTapeRecord[] = [];
  let decisionTapeCap = normalizeDecisionTapeCap(options.maxDecisionTapeSize);
  let disposed = false;
  let inboundUnsub: (() => void) | undefined;

  if (typeof broker?.onInbound === 'function') {
    const unsub = broker.onInbound(async (event) => {
      if (disposed) return;
      await eventBus.dispatch(event, undefined, undefined, {
        notifySubscribers: true,
        awaitHandlers: true,
      });
    });
    if (typeof unsub === 'function') {
      inboundUnsub = unsub;
    }
  }

  const outboxStoreId = usedDefaultEventBuffer
    ? 'InMemoryEventBuffer'
    : portConstructorId(eventBuffer, 'EventBufferStore');
  const auditStoreId = usedDefaultAudit
    ? 'InMemoryAuditStore'
    : portConstructorId(auditTrail, 'AuditTrail');
  const workflowStoreId = usedDefaultWorkflowStore
    ? 'InMemoryWorkflowStore'
    : portConstructorId(options.workflowStore!, 'WorkflowStore');
  const hardening = buildArkRunInspectorHardening({
    stores: [
      classifyArkRunInspectorStoreDurability(outboxStoreId, 'outbox'),
      classifyArkRunInspectorStoreDurability(auditStoreId, 'audit'),
      classifyArkRunInspectorStoreDurability(workflowStoreId, 'workflow'),
    ],
  });

  kernel = {
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
    register(regOptions) {
      return components.register(regOptions);
    },
    resolve(id, input) {
      return components.resolve(id, input);
    },
    resolveSingleton(id) {
      return components.resolveSingleton(id);
    },
    has(id) {
      return components.has(id);
    },
    hasSingleton(id) {
      return components.hasSingleton(id);
    },
    replaceForTest(id, factory) {
      components.replaceForTest(id, factory);
    },
    subscribeTrace(sink) {
      return eventBus.subscribeTrace(sink);
    },
    recordDecisionTape(record, maxSize) {
      const sanitized = sanitizeDecisionTapeRecord(record);
      if (!sanitized) return;
      if (maxSize !== undefined) {
        decisionTapeCap = normalizeDecisionTapeCap(maxSize);
      }
      decisionTape.push(sanitized);
      if (decisionTape.length > decisionTapeCap) {
        decisionTape.splice(0, decisionTape.length - decisionTapeCap);
      }
    },
    getDecisionTape() {
      return decisionTape.map(cloneDecisionTapeRecord);
    },
    getDependencyInformationPackage() {
      return buildDependencyInformationPackage({
        kernelInstanceId: instanceId,
        components: components.snapshotComponents(),
        decisionTape,
      });
    },
    requestGraph(query) {
      return requestArkRunGraph(
        {
          kernelInstanceId: instanceId,
          components: components.snapshotComponents(),
        },
        query,
        {
          dependencyGraph: graph,
          eventBus,
          observability,
        }
      );
    },
    getInspectorSnapshot(bind) {
      const snapshot = buildArkRunInspectorSnapshot({
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
      if (decisionTape.length > 0) {
        snapshot.package = buildDependencyInformationPackage({
          kernelInstanceId: instanceId,
          components: components.snapshotComponents(),
          decisionTape,
        });
      }
      return snapshot;
    },
    async startInspector(inspectorOptions) {
      const inspectorSource: ArkRunInspectorSource = {
        getInspectorSnapshot: (bind) => kernel.getInspectorSnapshot(bind),
        requestGraph: (query) => kernel.requestGraph(query),
        subscribeTrace: (listener) => kernel.subscribeTrace(listener),
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
      const rawHandle = await startArkRunInspector(inspectorSource, inspectorOptions);
      const originalClose = rawHandle.close.bind(rawHandle);
      const trackedHandle: ArkRunInspectorHandle = {
        ...rawHandle,
        async close() {
          activeInspectors.delete(trackedHandle);
          await originalClose();
        },
      };
      activeInspectors.add(trackedHandle);
      return trackedHandle;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      if (inboundUnsub) {
        const unsub = inboundUnsub;
        inboundUnsub = undefined;
        try {
          unsub();
        } catch {
          /* Continue releasing remaining kernel resources if unsubscribe throws. */
        }
      }
      for (const timer of pendingTimers) {
        clearTimeout(timer);
      }
      pendingTimers.clear();
      eventBus.dispose();
      const inspectors = [...activeInspectors];
      activeInspectors.clear();
      await Promise.allSettled(inspectors.map((handle) => handle.close()));
    },
    close() {
      return kernel.dispose();
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
    strictRegistry: options.strictRegistry ?? true,
    validateIntentNaming: options.validateIntentNaming ?? true,
    strictEventContracts: options.strictEventContracts ?? true,
    requireKnownSource: options.requireKnownSource ?? true,
    enforceObservedLayerFlow: options.enforceObservedLayerFlow ?? 'hard',
  });
}

type ConfigKernelPlan = {
  options: CreateArkKernelOptions;
  /** Deny-rule layers no intent maps to; non-empty only under implied hard mode. */
  unresolvable: string[];
};

function planKernelFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions,
  defaultFlowMode: ObservedLayerFlowMode
): ConfigKernelPlan {
  const { profileName, ...kernelOptions } = options;
  const explicitMode = options.enforceObservedLayerFlow;
  const missing =
    (explicitMode ?? defaultFlowMode) === 'hard' ? unresolvableLayerFlowLayers(config) : [];
  // Explicit `enforceObservedLayerFlow: 'hard'` fails closed: the caller asked for
  // teeth the config cannot provide.
  if (explicitMode === 'hard' && missing.length > 0) throw new ArkKernelConfigError(missing);
  return {
    options: {
      ...kernelOptions,
      profile: createArchitectureProfileFromArkConfig(config, { name: profileName }),
    },
    unresolvable: missing,
  };
}

/**
 * Implied hard mode (strict default) with unresolvable deny-rule layers: the
 * kernel still builds (the configs `ark init` presets write must not crash at
 * startup), enforces every resolvable layer, and records the gap once as a
 * `layer.observedFlowUnresolvable` audit record so it is never silent.
 */
function withUnresolvableNotice(kernel: ArkKernel, unresolvable: string[]): ArkKernel {
  if (unresolvable.length === 0) return kernel;
  void Promise.resolve()
    .then(() =>
      kernel.auditTrail.record({
        type: 'layer.observedFlowUnresolvable',
        subject: unresolvable.join(','),
        details: {
          code: 'ARKRUN_LAYER_FLOW_UNRESOLVABLE',
          layers: unresolvable,
          message: new ArkKernelConfigError(unresolvable).message,
        },
      })
    )
    .catch(() => undefined);
  return kernel;
}

export function createArkKernelFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions = {}
): ArkKernel {
  const strict = options.strict ?? true;
  const plan = planKernelFromConfig(config, options, strict ? 'hard' : 'off');
  return withUnresolvableNotice(createArkKernel(plan.options), plan.unresolvable);
}

/**
 * Strict kernel whose runtime layer profile comes from `ark.config.json`.
 * Hard observed-layer-flow needs every layer a deny rule names to resolve an
 * intent: declared `intentPrefixes`, or a canonical 11-layer name (`DomainModel`,
 * `ApplicationOrchestration`, … — what `ark init` writes) which gets the built-in
 * prefixes. A custom-named deny layer without prefixes is recorded as a
 * `layer.observedFlowUnresolvable` audit record (`ARKRUN_LAYER_FLOW_UNRESOLVABLE`);
 * passing `enforceObservedLayerFlow: 'hard'` explicitly throws `ArkKernelConfigError`
 * instead.
 */
export function createStrictArkKernelFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions = {}
): ArkKernel {
  const plan = planKernelFromConfig(config, options, 'hard');
  return withUnresolvableNotice(createStrictArkKernel(plan.options), plan.unresolvable);
}

export function createLenientArkKernelFromConfig(
  config: ArkKernelConfig,
  options: CreateArkKernelFromConfigOptions = {}
): ArkKernel {
  return createLenientArkKernel(planKernelFromConfig(config, options, 'off').options);
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
