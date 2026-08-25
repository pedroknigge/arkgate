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

export type ArkRunRegisterOptions<T = unknown> = {
  id: string;
  lifetime?: ArkRunComponentLifetime;
  uses?: readonly string[];
  reactsTo?: readonly string[];
  raises?: readonly string[];
  sends?: readonly string[];
  extendedInfo?: ArkRunExtendedInfo;
  factory?: () => T;
};

export type ArkRunRegistrationHandle = ArkRunInformationPackageComponent;

type InternalRecord = {
  component: ArkRunInformationPackageComponent;
  factory?: () => unknown;
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

export type ComponentRegistry = {
  register<T>(options: ArkRunRegisterOptions<T>): ArkRunRegistrationHandle;
  resolve<T = unknown>(id: string): T;
  resolveSingleton<T = unknown>(id: string): T;
  snapshotComponents(): ArkRunInformationPackageComponent[];
};

export function createComponentRegistry(): ComponentRegistry {
  const records = new Map<string, InternalRecord>();
  const singletons = new Map<string, unknown>();
  const resolving = new Set<string>();

  function mustRecord(id: string): InternalRecord {
    const record = records.get(id);
    if (!record) {
      throw new Error(`ArkRun component "${id}" is not registered.`);
    }
    return record;
  }

  function instantiate(id: string, record: InternalRecord): unknown {
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
      return record.factory();
    } finally {
      resolving.delete(id);
    }
  }

  function singleton(id: string, record: InternalRecord): unknown {
    if (singletons.has(id)) return singletons.get(id);
    const instance = instantiate(id, record);
    singletons.set(id, instance);
    return instance;
  }

  return {
    register<T>(options: ArkRunRegisterOptions<T>): ArkRunRegistrationHandle {
      const id = typeof options?.id === 'string' ? options.id.trim() : '';
      if (!id) throw new Error('ArkRun component id must be a non-empty string.');
      if (records.has(id)) {
        throw new Error(`ArkRun component "${id}" is already registered.`);
      }
      const lifetime = closedLifetime(options.lifetime);
      const component = sanitizeArkRunComponent({
        id,
        lifetime,
        uses: options.uses,
        reactsTo: options.reactsTo,
        raises: options.raises,
        sends: options.sends,
        extendedInfo: options.extendedInfo,
      });
      if (!component) {
        throw new Error('ArkRun component id must be a non-empty string.');
      }
      const factory = typeof options.factory === 'function' ? options.factory : undefined;
      records.set(id, { component, factory });
      return cloneComponent(component);
    },

    resolve<T = unknown>(id: string): T {
      const record = mustRecord(id);
      if (record.component.lifetime === 'transient') {
        return instantiate(id, record) as T;
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

    snapshotComponents(): ArkRunInformationPackageComponent[] {
      return [...records.values()].map((record) => cloneComponent(record.component));
    },
  };
}
