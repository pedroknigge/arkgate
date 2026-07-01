/**
 * IntentRegistry
 *
 * Central registry for semantic intents.
 * Supports registration, duplicate prevention, and declared dependency relationships.
 *
 * This is a core building block for governance, dependency graphs, and policy enforcement.
 */

import type { IntentName } from '../../domain/types';
import type { IntentCreator, IntentRelationship } from './types';
import type { DomainEvent } from '../../domain/types';

/**
 * Options for declaring relationships when defining an intent.
 */
export interface DefineIntentOptions {
  /** Other intents this one depends on (semantic names) */
  dependsOn?: IntentName[];
  /** Intents that this one produces / triggers */
  produces?: IntentName[];
}

/**
 * IntentRegistry manages all registered intents and their declared relationships.
 */
export class IntentRegistry {
  private readonly intents = new Map<string, IntentCreator<any, any>>();
  private readonly dependencies = new Map<string, Set<string>>();
  private readonly productions = new Map<string, Set<string>>();

  /**
   * Define/register a new intent.
   *
   * @param name - Semantic intent name following the convention (Domain.*, Application.*, etc.)
   * @param options - Optional relationship declarations
   * @throws Error if an intent with the same name is already registered
   */
  define<N extends IntentName, P = unknown>(
    name: N,
    options?: DefineIntentOptions
  ): IntentCreator<N, P> {
    if (this.intents.has(name)) {
      throw new Error(
        `Intent "${name}" is already registered. Intent names must be unique within a registry.`
      );
    }

    // Create the callable creator using a proper function so we can safely attach .name
    const fn = (payload: P): DomainEvent<N, P> => ({
      intent: name,
      payload,
      metadata: {
        occurredAt: new Date().toISOString(),
        source: 'unknown',
      },
    });

    // Attach the semantic name in a cross-environment safe way
    Object.defineProperty(fn, 'name', {
      value: name,
      enumerable: true,
      configurable: false,
      writable: false,
    });

    const creator = fn as IntentCreator<N, P>;

    this.intents.set(name, creator);

    // Apply initial declared relationships if provided
    if (options?.dependsOn) {
      for (const dep of options.dependsOn) {
        this.declareDependency(name, dep);
      }
    }
    if (options?.produces) {
      for (const prod of options.produces) {
        this.declareProduction(name, prod);
      }
    }

    return creator;
  }

  /**
   * Declare that one intent depends on / relates to another.
   * This information is used by the DependencyGraph (future iterations) and for policy checks.
   *
   * @param from - The source intent (e.g. an Application operation)
   * @param to - The target intent it depends on (e.g. a Domain event or concept)
   */
  declareDependency(from: string, to: string): void {
    if (!this.dependencies.has(from)) {
      this.dependencies.set(from, new Set());
    }
    this.dependencies.get(from)!.add(to);
  }

  /**
   * Declare that one intent produces / emits another (e.g. use case → domain event).
   */
  declareProduction(from: string, to: string): void {
    if (!this.productions.has(from)) {
      this.productions.set(from, new Set());
    }
    this.productions.get(from)!.add(to);
  }

  /**
   * Retrieve a previously defined intent creator by name.
   */
  get<N extends IntentName = IntentName, P = unknown>(
    name: string
  ): IntentCreator<N, P> | undefined {
    return this.intents.get(name) as IntentCreator<N, P> | undefined;
  }

  /**
   * List all registered intent creators.
   */
  list(): IntentCreator<any, any>[] {
    return Array.from(this.intents.values());
  }

  /**
   * Get all declared dependencies for a given intent.
   */
  getDependencies(intentName: string): string[] {
    const deps = this.dependencies.get(intentName);
    return deps ? Array.from(deps) : [];
  }

  /**
   * Get all intents produced / emitted by a given intent.
   */
  getProductions(intentName: string): string[] {
    const prods = this.productions.get(intentName);
    return prods ? Array.from(prods) : [];
  }

  /**
   * Get all declared relationships (useful for graph generation).
   */
  getAllRelationships(): IntentRelationship[] {
    const result: IntentRelationship[] = [];
    for (const [from, tos] of this.dependencies.entries()) {
      for (const to of tos) {
        result.push({ from, to, kind: 'dependsOn' });
      }
    }
    for (const [from, tos] of this.productions.entries()) {
      for (const to of tos) {
        result.push({ from, to, kind: 'produces' });
      }
    }
    return result;
  }

  /**
   * Check if an intent name has been registered.
   */
  has(name: string): boolean {
    return this.intents.has(name);
  }

  /**
   * Clear the registry. Primarily useful for tests.
   */
  clear(): void {
    this.intents.clear();
    this.dependencies.clear();
    this.productions.clear();
  }
}
