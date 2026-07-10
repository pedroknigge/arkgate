/**
 * In-process workflow engine with durable-store seams.
 */

import type { EventBus } from '../event-bus';
import type {
  CreateWorkflowEngineOptions,
  SagaContext,
  SagaDefinition,
  SagaInstance,
  WorkflowDefinition,
  WorkflowEngine,
  WorkflowSnapshot,
  WorkflowStep,
  WorkflowStore,
} from './types';

let workflowSequence = 0;

function createWorkflowId(prefix: string): string {
  workflowSequence += 1;
  return `${prefix}-${Date.now()}-${workflowSequence}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number | undefined,
  stepName: string
): Promise<T> {
  const controller = new AbortController();
  if (timeoutMs === undefined) return operation(controller.signal);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(`Workflow step "${stepName}" timed out after ${timeoutMs}ms.`);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Reference in-process workflow store. **Not production durability.**
 * See `docs/production-hardening.md`.
 */
export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly snapshots = new Map<string, WorkflowSnapshot>();

  save<P extends SagaContext>(snapshot: WorkflowSnapshot<P>): void {
    this.snapshots.set(snapshot.id, { ...snapshot, context: { ...snapshot.context } });
  }

  get<P extends SagaContext = SagaContext>(id: string): WorkflowSnapshot<P> | undefined {
    const snapshot = this.snapshots.get(id) as WorkflowSnapshot<P> | undefined;
    return snapshot ? { ...snapshot, context: { ...snapshot.context } } : undefined;
  }

  list(workflowName?: string): WorkflowSnapshot[] {
    return Array.from(this.snapshots.values())
      .filter((snapshot) => !workflowName || snapshot.workflowName === workflowName)
      .map((snapshot) => ({ ...snapshot, context: { ...snapshot.context } }));
  }

  clear(): void {
    this.snapshots.clear();
  }
}

class WorkflowEngineImpl implements WorkflowEngine {
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly store: WorkflowStore;

  constructor(
    private readonly bus: EventBus,
    private readonly options: CreateWorkflowEngineOptions = {}
  ) {
    this.store = options.store ?? new InMemoryWorkflowStore();
  }

  register<P extends SagaContext>(definition: WorkflowDefinition<P>): void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`Workflow "${definition.name}" is already registered.`);
    }

    const names = new Set<string>();
    for (const step of definition.steps) {
      if (names.has(step.name)) {
        throw new Error(
          `Workflow "${definition.name}" has duplicate step name "${step.name}".`
        );
      }
      names.add(step.name);
    }

    this.definitions.set(definition.name, definition as WorkflowDefinition);

    if (definition.startOn) {
      const trigger = definition.startOn;
      this.bus.subscribe(trigger.intent, async (event) => {
        await this.start(definition.name, trigger.mapEventToPayload(event));
      });
    }
  }

  async start<P extends SagaContext>(
    workflowName: string,
    initialPayload: P,
    options: { id?: string } = {}
  ): Promise<WorkflowSnapshot<P>> {
    const definition = this.definitions.get(workflowName) as
      | WorkflowDefinition<P>
      | undefined;

    if (!definition) {
      throw new Error(`Workflow "${workflowName}" is not registered.`);
    }

    const now = new Date().toISOString();
    const snapshot: WorkflowSnapshot<P> = {
      id: options.id ?? createWorkflowId(workflowName),
      workflowName,
      status: 'running',
      context: { ...initialPayload },
      completedSteps: [],
      attempts: {},
      startedAt: now,
      updatedAt: now,
    };

    await this.store.save(snapshot);
    await this.audit('workflow.started', snapshot, { workflowName });

    try {
      for (const step of definition.steps) {
        await this.runStep(snapshot, step);
      }

      snapshot.status = 'completed';
      snapshot.currentStep = undefined;
      snapshot.completedAt = new Date().toISOString();
      snapshot.updatedAt = snapshot.completedAt;
      await this.store.save(snapshot);
      await this.audit('workflow.completed', snapshot, { workflowName });
      return { ...snapshot, context: { ...snapshot.context } };
    } catch (err) {
      await this.compensate(snapshot, definition.steps, err);
      snapshot.status = 'failed';
      snapshot.currentStep = undefined;
      snapshot.error = errorMessage(err);
      snapshot.updatedAt = new Date().toISOString();
      await this.store.save(snapshot);
      await this.audit('workflow.failed', snapshot, {
        workflowName,
        error: snapshot.error,
        failedStep: snapshot.failedStep,
      });
      throw err;
    }
  }

  async get<P extends SagaContext = SagaContext>(
    id: string
  ): Promise<WorkflowSnapshot<P> | undefined> {
    return this.store.get<P>(id);
  }

  async list(workflowName?: string): Promise<WorkflowSnapshot[]> {
    return this.store.list(workflowName);
  }

  private async runStep<P extends SagaContext>(
    snapshot: WorkflowSnapshot<P>,
    step: WorkflowStep<P>
  ): Promise<void> {
    const retry = step.retry ?? this.options.defaultRetry ?? { attempts: 1 };
    const maxAttempts = Math.max(1, retry.attempts);

    snapshot.currentStep = step.name;
    snapshot.updatedAt = new Date().toISOString();
    await this.store.save(snapshot);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      snapshot.attempts[step.name] = attempt;
      await this.store.save(snapshot);

      try {
        const result = await withTimeout(
          (signal) => Promise.resolve(step.execute(snapshot.context, this.bus, signal)),
          step.timeoutMs,
          step.name
        );
        if (result) Object.assign(snapshot.context, result);
        snapshot.completedSteps.push(step.name);
        snapshot.currentStep = undefined;
        snapshot.updatedAt = new Date().toISOString();
        await this.store.save(snapshot);
        await this.audit('workflow.step.completed', snapshot, {
          step: step.name,
          attempt,
        });
        return;
      } catch (err) {
        if (attempt < maxAttempts) {
          if (retry.delayMs) await sleep(retry.delayMs);
          continue;
        }

        snapshot.failedStep = step.name;
        snapshot.updatedAt = new Date().toISOString();
        await this.store.save(snapshot);
        await this.audit('workflow.step.failed', snapshot, {
          step: step.name,
          attempt,
          error: errorMessage(err),
        });
        throw err;
      }
    }

    throw new Error(`Workflow step "${step.name}" did not complete.`);
  }

  private async compensate<P extends SagaContext>(
    snapshot: WorkflowSnapshot<P>,
    steps: WorkflowStep<P>[],
    error: unknown
  ): Promise<void> {
    snapshot.status = 'compensating';
    snapshot.updatedAt = new Date().toISOString();
    await this.store.save(snapshot);

    const completed = steps.filter((step) =>
      snapshot.completedSteps.includes(step.name)
    );

    for (let index = completed.length - 1; index >= 0; index -= 1) {
      const step = completed[index];
      if (!step.compensate) continue;

      try {
        await Promise.resolve(step.compensate(snapshot.context, this.bus, error));
        await this.audit('workflow.compensation.completed', snapshot, {
          step: step.name,
        });
      } catch (compensationError) {
        await this.audit('workflow.step.failed', snapshot, {
          step: step.name,
          compensation: true,
          error: errorMessage(compensationError),
        });
      }
    }
  }

  private async audit<P extends SagaContext>(
    type:
      | 'workflow.started'
      | 'workflow.step.completed'
      | 'workflow.step.failed'
      | 'workflow.compensation.completed'
      | 'workflow.completed'
      | 'workflow.failed',
    snapshot: WorkflowSnapshot<P>,
    details?: unknown
  ): Promise<void> {
    await this.options.auditTrail?.record({
      type,
      source: 'Kernel.WorkflowEngine',
      subject: snapshot.id,
      details,
    });
  }
}

export function createWorkflowEngine(
  bus: EventBus,
  options?: CreateWorkflowEngineOptions
): WorkflowEngine {
  return new WorkflowEngineImpl(bus, options);
}

export function createSaga<P extends SagaContext = SagaContext>(
  def: SagaDefinition<P>,
  bus: EventBus,
  options: CreateWorkflowEngineOptions & { id?: string } = {}
): SagaInstance<P> {
  const engine = createWorkflowEngine(bus, options);
  const definition: WorkflowDefinition<P> = { name: def.name, steps: def.steps };
  engine.register(definition);

  const sagaId = options.id ?? createWorkflowId(def.name);
  let status: SagaInstance<P>['status'] = 'idle';
  let completedStepNames: string[] = [];

  return {
    id: sagaId,
    definition: def,
    get status() {
      return status;
    },
    get completedSteps() {
      return [...completedStepNames];
    },
    async run(initialPayload: P) {
      status = 'running';
      completedStepNames = [];
      try {
        const snapshot = await engine.start(def.name, initialPayload, { id: sagaId });
        status = snapshot.status === 'waiting' ? 'idle' : snapshot.status;
        completedStepNames = [...snapshot.completedSteps];
      } catch (err) {
        const snapshot = await engine.get<P>(sagaId);
        status =
          snapshot?.status === 'waiting' ? 'idle' : (snapshot?.status ?? 'failed');
        completedStepNames = snapshot?.completedSteps ?? [];
        throw err;
      }
    },
  };
}
