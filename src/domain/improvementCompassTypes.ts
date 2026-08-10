/**
 * Improvement compass — closed types, constants, and labels (Domain pure).
 *
 * Split from improvementCompass.ts (DF03): contracts stay small and import-free
 * of mapping logic so CLI gen and unit tests share one vocabulary.
 *
 * Pure Domain: no fs, fetch, Date.now, process.
 */

export const ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION = '1.0' as const;

/** Closed 15 lens ids (stable order for projection). */
export const IMPROVEMENT_LENS_IDS = [
  'soc',
  'cohesion',
  'coupling',
  'srp',
  'dip',
  'ocp',
  'encapsulation',
  'modularity',
  'scalability',
  'resilience',
  'security',
  'maintainability',
  'testability',
  'domain',
  'stack',
] as const;

export type ImprovementLensId = (typeof IMPROVEMENT_LENS_IDS)[number];

export type ImprovementLensStatus =
  | 'ok'
  | 'residual'
  | 'not-instrumented'
  | 'out-of-scope';

export type ImprovementCompassEvidence = {
  source: string;
  ref: string;
  detail?: string;
};

export type ImprovementCompassNextAction = {
  kind: string;
  ref: string;
  summary: string;
};

export type ImprovementLens = {
  id: ImprovementLensId;
  status: ImprovementLensStatus;
  summary: string;
  evidence: ImprovementCompassEvidence[];
  nextAction?: ImprovementCompassNextAction;
};

export type ImprovementCompass = {
  schemaVersion: typeof ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION;
  notAScore: true;
  lenses: ImprovementLens[];
  topResidual: ImprovementLensId[];
};

/** Cap for topResidual — short, agent-legible list (not a ranking score). */
export const IMPROVEMENT_COMPASS_TOP_RESIDUAL_CAP = 5;

/** Locked out-of-scope — never become residual from missing sensors. */
export const IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES = [
  'scalability',
  'resilience',
  'security',
] as const satisfies readonly ImprovementLensId[];

/** Shared out-of-scope set for mappers and build. */
export const IMPROVEMENT_COMPASS_OUT_OF_SCOPE_SET = new Set<string>(
  IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES
);

/**
 * Residual sort priority (lower = earlier in topResidual). Product relevance,
 * not a health score. Ties break by id.
 */
export const IMPROVEMENT_COMPASS_RESIDUAL_SORT_PRIORITY: Record<
  ImprovementLensId,
  number
> = {
  soc: 10,
  coupling: 20,
  dip: 30,
  domain: 40,
  srp: 50,
  cohesion: 60,
  encapsulation: 70,
  modularity: 80,
  testability: 90,
  maintainability: 100,
  ocp: 110,
  stack: 120,
  scalability: 200,
  resilience: 200,
  security: 200,
};

export const IMPROVEMENT_COMPASS_LENS_LABELS: Record<ImprovementLensId, string> = {
  soc: 'Separation of concerns',
  cohesion: 'High cohesion',
  coupling: 'Low coupling',
  srp: 'Single responsibility (architecture)',
  dip: 'Dependency inversion',
  ocp: 'Open/closed',
  encapsulation: 'Encapsulation',
  modularity: 'Modularity',
  scalability: 'Scalability / performance',
  resilience: 'Resilience / fault tolerance',
  security: 'Security by design',
  maintainability: 'Maintainability',
  testability: 'Testability',
  domain: 'Domain alignment',
  stack: 'Stack-specific practices',
};

export const IMPROVEMENT_COMPASS_OUT_OF_SCOPE_SUMMARIES: Record<
  (typeof IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES)[number],
  string
> = {
  scalability:
    'ArkGate does not measure performance or horizontal scale. Use load tests and APM outside Ark.',
  resilience:
    'ArkGate does not measure app resilience or chaos readiness. Structural boundaries and optional experimental runtime are not a resilience score.',
  security:
    'ArkGate does not run SAST or app-security tooling. Structural least-privilege of effects is partial only — not a security rating.',
};

export type ImprovementCompassSmellFact = {
  /** Stable smell id (designSmells) or smellId alias. */
  id?: string;
  smellId?: string;
  message?: string;
  outcome?: string;
  evidence?: readonly string[];
};

export type ImprovementCompassViolationFact = {
  ruleId?: string;
  code?: string;
  message?: string;
  fromLayer?: string;
  toLayer?: string;
  file?: string;
  /** When false, type-only placement debt — not runtime coupling (product voice). */
  failsStrict?: boolean;
  /** Alias for non-blocking type-only edges (mirrors doctor violation shape). */
  typeOnly?: boolean;
};

/**
 * Pure facts supplied by Tooling/doctor after I/O.
 * Domain never opens files or clocks time.
 */
export type ImprovementCompassFacts = {
  designSmells?: readonly ImprovementCompassSmellFact[];
  violations?: readonly ImprovementCompassViolationFact[];
  /** Detected import cycles (count). */
  cycleCount?: number;
  /** Peer-isolation residual findings (count) or true when any. */
  peerIsolationCount?: number | boolean;
  /** physicalCohesion findings length. */
  physicalCohesionFindingCount?: number;
  /** Whether ArkRules map is loaded on the contract. */
  arkRulesLoaded?: boolean;
  /** Open structure/invariant residual from ArkRules plane. */
  arkRulesStructureResidual?: number;
  /** designFitness.designWeak */
  designWeak?: boolean;
  baselineExists?: boolean;
  baselineStale?: number | null;
  frozenResidual?: number | null;
  dirtyBaselineRisk?: boolean;
  /** Pure / capability / forbidden residual counts. */
  pureOrCapabilityResidual?: number;
  forbiddenGlobalResidual?: number;
  /** Ungoverned directory suggestions / empty layers (modularity/placement). */
  ungovernedDirCount?: number;
  emptyLayerCount?: number;
  goldenPatternPresent?: boolean;
  /**
   * Host/language stack. TypeScript is partially instrumented (host/TS/Ark
   * idioms only). Unknown or non-TS stays not-instrumented / out-of-scope.
   */
  stackKind?: 'typescript' | 'unknown' | null;
};

/** Mutable lens used while projecting facts (not part of public JSON shape). */
export type ImprovementCompassMutableLens = {
  id: ImprovementLensId;
  status: ImprovementLensStatus;
  summary: string;
  evidence: ImprovementCompassEvidence[];
  nextAction?: ImprovementCompassNextAction;
};

export function improvementCompassHumanLabel(id: ImprovementLensId): string {
  return IMPROVEMENT_COMPASS_LENS_LABELS[id] ?? id;
}
