import type {
  ArchitectureLayer,
  ArchitectureProfile,
  ArchitectureRule,
  ArkCheckConfig,
  CreateArchitectureProfileFromArkConfigOptions,
  CreateElevenLayerArkConfigOptions,
  CreateArchitectureProfileOptions,
} from './types';

function normalizePrefix(prefix: string): string {
  return prefix.endsWith('.') ? prefix : `${prefix}.`;
}

function byLongestPrefix(a: ArchitectureLayer, b: ArchitectureLayer): number {
  const maxA = a.prefixes.length
    ? Math.max(...a.prefixes.map((p) => p.length))
    : 0;
  const maxB = b.prefixes.length
    ? Math.max(...b.prefixes.map((p) => p.length))
    : 0;
  return maxB - maxA;
}

function flowKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function createStrictDenyRules(
  layers: ArchitectureLayer[],
  allowedFlows: Array<Pick<ArchitectureRule, 'from' | 'to'>>
): ArchitectureRule[] {
  const allowed = new Set(allowedFlows.map((flow) => flowKey(flow.from, flow.to)));
  const rules: ArchitectureRule[] = [];

  for (const from of layers) {
    for (const to of layers) {
      if (from.name === to.name) continue;
      if (allowed.has(flowKey(from.name, to.name))) continue;
      rules.push({ from: from.name, to: to.name, allowed: false });
    }
  }

  return rules;
}

export function createArchitectureProfile(
  options: CreateArchitectureProfileOptions
): ArchitectureProfile {
  const layers = options.layers.map((layer) => ({
    ...layer,
    prefixes: layer.prefixes.map(normalizePrefix),
  }));
  const sortedLayers = [...layers].sort(byLongestPrefix);
  const rules: ArchitectureRule[] = [...(options.rules ?? [])];

  return {
    name: options.name,
    layers,
    rules,
    resolveLayer(name: string): string | undefined {
      // Explicit matchers win over prefix conventions, in declaration order.
      return (
        layers.find((layer) => layer.match?.(name))?.name ??
        sortedLayers.find((layer) =>
          layer.prefixes.some((prefix) => name.startsWith(prefix))
        )?.name
      );
    },
  };
}

export function createArchitectureProfileFromArkConfig(
  config: ArkCheckConfig,
  options: CreateArchitectureProfileFromArkConfigOptions = {}
): ArchitectureProfile {
  return createArchitectureProfile({
    name: options.name ?? config.name ?? 'ark.config.json',
    layers: config.layers.map((layer, index) => ({
      name: layer.name,
      prefixes: layer.intentPrefixes ?? [],
      description: layer.description,
      order: index + 1,
    })),
    rules: config.rules ?? [],
  });
}

const elevenLayerProfileLayers: ArchitectureLayer[] = [
  {
    name: 'DomainModel',
    prefixes: ['Domain'],
    description: 'Rich domain model, business rules, and domain events.',
    order: 1,
  },
  {
    name: 'ApplicationOrchestration',
    prefixes: ['Application'],
    description: 'Use cases and command orchestration.',
    order: 2,
  },
  {
    name: 'PersistenceAdapters',
    prefixes: ['Adapter.Persistence', 'Adapter.Repository'],
    description: 'Database, repository, and storage adapters.',
    order: 3,
  },
  {
    name: 'IntegrationAdapters',
    prefixes: ['Adapter.Integration', 'Adapter.External'],
    description: 'External systems, APIs, and integration adapters.',
    order: 4,
  },
  {
    name: 'WorkflowSagaEngine',
    prefixes: ['Workflow'],
    description: 'Sagas, workflows, and long-running processes.',
    order: 5,
  },
  {
    name: 'BackgroundJobsScheduling',
    prefixes: ['Job'],
    description: 'Background jobs, scheduled work, and async processors.',
    order: 6,
  },
  {
    name: 'PresentationAdapters',
    prefixes: ['Presentation', 'Adapter.Presentation', 'Adapter.Api'],
    description: 'API, UI, controller, and presentation adapters.',
    order: 7,
  },
  {
    name: 'ReportingReadModels',
    prefixes: ['Reporting'],
    description: 'Read models, projections, and reporting surfaces.',
    order: 8,
  },
  {
    name: 'ExtensibilityMetadata',
    prefixes: ['Metadata'],
    description: 'Metadata, extensions, and schema contracts.',
    order: 9,
  },
  {
    name: 'SecurityAuditObservability',
    prefixes: ['Security', 'Audit', 'Observability'],
    description: 'Security, audit, and observability concerns.',
    order: 10,
  },
  {
    name: 'Kernel',
    prefixes: ['Kernel'],
    description: 'Ark-owned governance and kernel signals.',
    order: 11,
  },
];

const elevenLayerAllowedFlows: Array<Pick<ArchitectureRule, 'from' | 'to'>> = [
  { from: 'PresentationAdapters', to: 'ApplicationOrchestration' },
  { from: 'ApplicationOrchestration', to: 'DomainModel' },
  { from: 'WorkflowSagaEngine', to: 'ApplicationOrchestration' },
  { from: 'WorkflowSagaEngine', to: 'DomainModel' },
  { from: 'BackgroundJobsScheduling', to: 'ApplicationOrchestration' },
];

export const elevenLayerProfile = createArchitectureProfile({
  name: 'Ark 11-layer Hexagonal Event-Driven Profile',
  layers: elevenLayerProfileLayers,
  rules: createStrictDenyRules(
    elevenLayerProfileLayers,
    elevenLayerAllowedFlows
  ),
});

const defaultElevenLayerDirectories: Record<string, string[]> = {
  DomainModel: ['domain'],
  ApplicationOrchestration: ['application', 'app'],
  PersistenceAdapters: [
    'adapters/persistence',
    'adapters/repository',
    'repositories',
    'infra/persistence',
  ],
  IntegrationAdapters: ['adapters/integration', 'adapters/external', 'integrations'],
  WorkflowSagaEngine: ['workflows', 'sagas'],
  BackgroundJobsScheduling: ['jobs', 'schedules'],
  PresentationAdapters: ['presentation', 'adapters/presentation', 'adapters/api'],
  ReportingReadModels: ['reporting', 'read-models', 'projections'],
  ExtensibilityMetadata: ['metadata', 'extensions'],
  SecurityAuditObservability: ['security', 'audit', 'observability'],
  Kernel: ['kernel'],
};

export function createElevenLayerArkConfig(
  options: CreateElevenLayerArkConfigOptions = {}
): ArkCheckConfig {
  const rootDir = options.rootDir ?? 'src';
  const optional = options.optionalLayers ?? true;
  const prefix = rootDir === '.' ? '' : `${rootDir}/`;

  return {
    include: options.include ?? [rootDir],
    layers: elevenLayerProfile.layers.map((layer) => ({
      name: layer.name,
      patterns: (defaultElevenLayerDirectories[layer.name] ?? [layer.name]).map(
        (directory) => `${prefix}${directory}/**`
      ),
      intentPrefixes: layer.prefixes,
      optional,
    })),
    rules: [...elevenLayerProfile.rules],
  };
}
