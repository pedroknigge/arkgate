import type { DomainEvent, IntentName } from '../../domain/types';
import type {
  CreateProjectionRegistryOptions,
  ProjectionCheckpoint,
  ProjectionDefinition,
  ProjectionRegistry,
  ReadModelStore,
} from './types';

/**
 * Reference in-process read-model store. **Not production durability.**
 * See `docs/production-hardening.md`.
 */
export class InMemoryReadModelStore implements ReadModelStore {
  private readonly states = new Map<string, unknown>();

  load<State = unknown>(name: string): State | undefined {
    return this.states.get(name) as State | undefined;
  }

  save<State = unknown>(name: string, state: State): void {
    this.states.set(name, state);
  }

  clear(name?: string): void {
    if (name) {
      this.states.delete(name);
    } else {
      this.states.clear();
    }
  }
}

function initialState<State>(definition: ProjectionDefinition<State>): State {
  return typeof definition.initialState === 'function'
    ? (definition.initialState as () => State)()
    : definition.initialState;
}

export class ProjectionRegistryImpl implements ProjectionRegistry {
  private readonly definitions = new Map<string, ProjectionDefinition>();
  private readonly checkpoints = new Map<string, ProjectionCheckpoint>();
  private readonly store: ReadModelStore;
  private readonly auditTrail?: CreateProjectionRegistryOptions['auditTrail'];

  constructor(options: CreateProjectionRegistryOptions = {}) {
    this.store = options.store ?? new InMemoryReadModelStore();
    this.auditTrail = options.auditTrail;
  }

  register<State>(definition: ProjectionDefinition<State>): void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`Projection "${definition.name}" is already registered.`);
    }
    this.definitions.set(definition.name, definition as ProjectionDefinition);
    this.checkpoints.set(definition.name, {
      projection: definition.name,
      appliedCount: 0,
    });
  }

  list(): ProjectionDefinition[] {
    return Array.from(this.definitions.values());
  }

  async apply(event: DomainEvent<IntentName, unknown>): Promise<string[]> {
    const applied: string[] = [];

    for (const definition of this.definitions.values()) {
      if (!definition.sourceIntents.includes(event.intent)) continue;

      const current =
        (await this.store.load(definition.name)) ?? initialState(definition);
      const next = await definition.project(event, current);
      await this.store.save(definition.name, next);

      const previous = this.checkpoints.get(definition.name);
      this.checkpoints.set(definition.name, {
        projection: definition.name,
        appliedCount: (previous?.appliedCount ?? 0) + 1,
        lastIntent: event.intent,
        lastCorrelationId: event.metadata.correlationId,
        updatedAt: new Date().toISOString(),
      });
      await this.auditTrail?.record({
        type: 'projection.applied',
        source: 'Kernel.ProjectionRegistry',
        intent: event.intent,
        correlationId: event.metadata.correlationId,
        causationId: event.metadata.causationId,
        subject: definition.name,
        details: { projection: definition.name },
      });
      applied.push(definition.name);
    }

    return applied;
  }

  async getState<State = unknown>(name: string): Promise<State | undefined> {
    return this.store.load<State>(name);
  }

  getCheckpoint(name: string): ProjectionCheckpoint | undefined {
    return this.checkpoints.get(name);
  }

  getCheckpoints(): ProjectionCheckpoint[] {
    return Array.from(this.checkpoints.values());
  }

  async clear(): Promise<void> {
    await this.store.clear();
    for (const definition of this.definitions.values()) {
      this.checkpoints.set(definition.name, {
        projection: definition.name,
        appliedCount: 0,
      });
    }
  }
}

export function createProjectionRegistry(
  options?: CreateProjectionRegistryOptions
): ProjectionRegistry {
  return new ProjectionRegistryImpl(options);
}
