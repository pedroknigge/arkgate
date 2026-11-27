/**
 * Per-kernel managed-component registry. Factories stay private so the
 * information package cannot observe construction (ADR 0023 D4).
 */
import {
  sanitizeArkRunComponent,
  type ArkRunComponentLifetime,
  type ArkRunExtendedInfo,
  type ArkRunInformationPackageComponent,
} from '../../domain/arkRunInformationPackage';
import type { ArkKernel } from './types';

export type ArkRunComponentFactory<T = unknown, Input = unknown> = (
  kernel: ArkKernel,
  input: Input
) => T;

export type ArkRunRegisterOptions<T = unknown, Input = unknown> = {
  id: string;
  lifetime?: ArkRunComponentLifetime;
  uses?: readonly string[];
  reactsTo?: readonly string[];
  raises?: readonly string[];
  sends?: readonly string[];
  extendedInfo?: ArkRunExtendedInfo;
  factory?: ArkRunComponentFactory<T, Input>;
};

export type ArkRunRegistrationHandle = ArkRunInformationPackageComponent;

type InternalFactory = (kernel: ArkKernel, input: unknown) => unknown;

type InternalRecord = {
  component: ArkRunInformationPackageComponent;
  factory?: InternalFactory;
};

const LIFETIMES = new Set<string>(['singleton', 'transient']);

function cloneComponent(
  component: ArkRunInformationPackageComponent
): ArkRunInformationPackageComponent {
  const copy: ArkRunInformationPackageComponent = {
    id: component.id,
    lifetime: component.lifetime,
    uses: [...component.uses],
    reactsTo: [...component.reactsTo],
    raises: [...component.raises],
    sends: [...component.sends],
  };
  if (component.extendedInfo) {
    const info = component.extendedInfo;
    copy.extendedInfo = {
      ...(info.label ? { label: info.label } : {}),
      ...(info.architectureKind ? { architectureKind: info.architectureKind } : {}),
      ...(info.tags ? { tags: [...info.tags] } : {}),
      ...(info.group ? { group: info.group } : {}),
      ...(info.metadata ? { metadata: { ...info.metadata } } : {}),
    };
  }
  return copy;
}

function closedLifetime(value: unknown): ArkRunComponentLifetime {
  if (value === undefined) return 'singleton';
  if (typeof value === 'string' && LIFETIMES.has(value)) {
    return value as ArkRunComponentLifetime;
  }
  throw new Error('ArkRun component lifetime must be "singleton" or "transient".');
}

export interface ArkRunComponentContainer {
  /** Handle is declaration metadata only; the factory never leaves the registry. */
  register<T, Input = unknown>(
    options: ArkRunRegisterOptions<T, Input>
  ): ArkRunRegistrationHandle;
  resolve<T = unknown, Input = unknown>(id: string, input?: Input): T;
  resolveSingleton<T = unknown>(id: string): T;
  has(id: string): boolean;
  /**
   * True only after a singleton has been materialized. A registered singleton
   * that has not been resolved yet returns false; use `has(id)` for registration.
   */
  hasSingleton(id: string): boolean;
  /**
   * Test-only component factory replacement. Requires `{ allowOverrides: true }`
   * on the kernel options; invalidates any cached singleton for `id`.
   */
  replaceForTest<T, Input = unknown>(
    id: string,
    factory: ArkRunComponentFactory<T, Input>
  ): void;
}

export interface ComponentRegistry extends ArkRunComponentContainer {
  snapshotComponents(): ArkRunInformationPackageComponent[];
}

export type CreateComponentRegistryOptions = {
  getKernel: () => ArkKernel;
  allowOverrides?: boolean;
};

export function createComponentRegistry(
  options: CreateComponentRegistryOptions
): ComponentRegistry {
  const records = new Map<string, InternalRecord>();
  const singletons = new Map<string, unknown>();
  const resolving = new Set<string>();
  const allowOverrides = options.allowOverrides === true;

  function mustRecord(id: string): InternalRecord {
    const record = records.get(id);
    if (!record) {
      throw new Error(`ArkRun component "${id}" is not registered.`);
    }
    return record;
  }

  function instantiate(
    id: string,
    record: InternalRecord,
    input: unknown
  ): unknown {
    if (!record.factory) {
      throw new Error(
        `ArkRun component "${id}" has no factory; declarations-only registrations cannot be resolved.`
      );
    }
    if (resolving.has(id)) {
      throw new Error(`ArkRun component "${id}" has a circular resolve.`);
    }
    resolving.add(id);
    try {
      return record.factory(options.getKernel(), input);
    } finally {
      resolving.delete(id);
    }
  }

  function singleton(id: string, record: InternalRecord): unknown {
    if (singletons.has(id)) return singletons.get(id);
    const instance = instantiate(id, record, undefined);
    singletons.set(id, instance);
    return instance;
  }

  return {
    register<T, Input = unknown>(
      regOptions: ArkRunRegisterOptions<T, Input>
    ): ArkRunRegistrationHandle {
      const id = typeof regOptions?.id === 'string' ? regOptions.id.trim() : '';
      if (!id) throw new Error('ArkRun component id must be a non-empty string.');
      if (records.has(id)) {
        throw new Error(`ArkRun component "${id}" is already registered.`);
      }
      const lifetime = closedLifetime(regOptions.lifetime);
      const component = sanitizeArkRunComponent({
        id,
        lifetime,
        uses: regOptions.uses,
        reactsTo: regOptions.reactsTo,
        raises: regOptions.raises,
        sends: regOptions.sends,
        extendedInfo: regOptions.extendedInfo,
      });
      if (!component) {
        throw new Error('ArkRun component id must be a non-empty string.');
      }
      const factory =
        typeof regOptions.factory === 'function'
          ? (regOptions.factory as InternalFactory)
          : undefined;
      records.set(id, { component, factory });
      return cloneComponent(component);
    },

    resolve<T = unknown, Input = unknown>(id: string, input?: Input): T {
      const record = mustRecord(id);
      if (record.component.lifetime === 'transient') {
        return instantiate(id, record, input) as T;
      }
      if (input !== undefined) {
        throw new Error(
          `ArkRun component "${id}" is a singleton and does not accept resolve input; use lifetime "transient" for per-call input.`
        );
      }
      return singleton(id, record) as T;
    },

    resolveSingleton<T = unknown>(id: string): T {
      const record = mustRecord(id);
      if (record.component.lifetime === 'transient') {
        throw new Error(
          `ArkRun component "${id}" is transient; resolveSingleton requires lifetime "singleton".`
        );
      }
      return singleton(id, record) as T;
    },

    has(id: string): boolean {
      return records.has(id);
    },

    hasSingleton(id: string): boolean {
      return singletons.has(id);
    },

    replaceForTest<T, Input = unknown>(
      id: string,
      factory: ArkRunComponentFactory<T, Input>
    ): void {
      if (!allowOverrides) {
        throw new Error(
          'ArkRun component overrides are disabled. Pass { allowOverrides: true } when creating a test kernel.'
        );
      }
      if (typeof factory !== 'function') {
        throw new Error('ArkRun override factory must be a function.');
      }
      const record = mustRecord(id);
      record.factory = factory as InternalFactory;
      singletons.delete(id);
    },

    snapshotComponents(): ArkRunInformationPackageComponent[] {
      return [...records.values()].map((record) => cloneComponent(record.component));
    },
  };
}
