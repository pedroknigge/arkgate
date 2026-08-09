/**
 * Improvement compass (product 4.4.0) — pure Domain projection.
 *
 * Closed set of architecture **lenses** projected from existing doctor-side
 * evidence. Always `notAScore: true`. Never a gate input: residual lenses must
 * not flip `valid`, strict-merge exit, or `goal.met`.
 *
 * Out-of-scope lenses (`scalability`, `resilience`, `security`) are locked —
 * missing SAST/APM/chaos never invents residual.
 *
 * Pure Domain: no fs, fetch, Date.now, process — inject facts as input.
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

const OUT_OF_SCOPE_SET = new Set<string>(IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES);

/**
 * Residual sort priority (lower = earlier in topResidual). Product relevance,
 * not a health score. Ties break by id.
 */
const RESIDUAL_SORT_PRIORITY: Record<ImprovementLensId, number> = {
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

const LENS_LABELS: Record<ImprovementLensId, string> = {
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

const OUT_OF_SCOPE_SUMMARIES: Record<
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
  failsStrict?: boolean;
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

type MutableLens = {
  id: ImprovementLensId;
  status: ImprovementLensStatus;
  summary: string;
  evidence: ImprovementCompassEvidence[];
  nextAction?: ImprovementCompassNextAction;
};

function smellIdOf(smell: ImprovementCompassSmellFact): string {
  const raw = smell.id ?? smell.smellId ?? '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function violationRuleId(v: ImprovementCompassViolationFact): string {
  const raw = v.ruleId ?? v.code ?? '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function pushEvidence(
  lens: MutableLens,
  source: string,
  ref: string,
  detail?: string
): void {
  if (!ref) return;
  // Dedup by source+ref for deterministic stability.
  if (lens.evidence.some((e) => e.source === source && e.ref === ref)) return;
  const entry: ImprovementCompassEvidence = { source, ref };
  if (detail && detail.trim()) entry.detail = detail.trim().slice(0, 240);
  lens.evidence.push(entry);
}

function markResidual(
  lens: MutableLens,
  summary: string,
  nextAction?: ImprovementCompassNextAction
): void {
  if (OUT_OF_SCOPE_SET.has(lens.id)) return;
  lens.status = 'residual';
  lens.summary = summary;
  if (nextAction) lens.nextAction = nextAction;
}

function defaultOkSummary(id: ImprovementLensId): string {
  switch (id) {
    case 'soc':
      return 'No separation-of-concerns residual detected from current sensors.';
    case 'cohesion':
      return 'No cohesion residual (god-module / physical cohesion) from current sensors.';
    case 'coupling':
      return 'No coupling residual (import edges, cycles, peer isolation) from current sensors.';
    case 'srp':
      return 'No single-responsibility residual from current sensors.';
    case 'dip':
      return 'No dependency-inversion residual (pure / capability / forbidden walls) from current sensors.';
    case 'ocp':
      return 'Open/closed is not strongly instrumented — no switch-chain sensor.';
    case 'encapsulation':
      return 'No encapsulation residual from ArkRules structure sensors.';
    case 'modularity':
      return 'No modularity / placement residual from current sensors.';
    case 'maintainability':
      return 'No maintainability residual (design-weak / baseline honesty) from current sensors.';
    case 'testability':
      return 'No testability residual (impure domain / capability walls) from current sensors.';
    case 'domain':
      return 'No domain-alignment residual from current sensors.';
    case 'stack':
      return 'Stack practices are only partially instrumented (TypeScript / host / Ark idioms).';
    default:
      return `${LENS_LABELS[id]} — no residual from current sensors.`;
  }
}

function initLenses(): MutableLens[] {
  return IMPROVEMENT_LENS_IDS.map((id) => {
    if (OUT_OF_SCOPE_SET.has(id)) {
      const key = id as (typeof IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES)[number];
      return {
        id,
        status: 'out-of-scope' as const,
        summary: OUT_OF_SCOPE_SUMMARIES[key],
        evidence: [],
        nextAction: {
          kind: 'docs',
          ref: 'docs/use.md#improvement-compass',
          summary: 'Out of scope for ArkGate — use dedicated tooling outside the gate.',
        },
      };
    }
    if (id === 'ocp') {
      return {
        id,
        status: 'not-instrumented' as const,
        summary: defaultOkSummary(id),
        evidence: [],
      };
    }
    return {
      id,
      status: 'ok' as const,
      summary: defaultOkSummary(id),
      evidence: [],
    };
  });
}

function mapDesignSmells(
  byId: Map<ImprovementLensId, MutableLens>,
  smells: readonly ImprovementCompassSmellFact[]
): void {
  for (const smell of smells) {
    const id = smellIdOf(smell);
    if (!id) continue;
    const detail = smell.outcome || smell.message || undefined;
    const evidencePaths = Array.isArray(smell.evidence) ? smell.evidence : [];
    const pathHint = evidencePaths[0];

    const attach = (lensId: ImprovementLensId, summary: string, action?: ImprovementCompassNextAction) => {
      const lens = byId.get(lensId);
      if (!lens || OUT_OF_SCOPE_SET.has(lensId)) return;
      pushEvidence(lens, 'designSmells', id, detail);
      if (pathHint) pushEvidence(lens, 'designSmells', pathHint, id);
      markResidual(lens, summary, action);
    };

    const shapeAction: ImprovementCompassNextAction = {
      kind: 'skill',
      ref: '/ark-explore',
      summary: 'Map Shape residual (shape-focus), then one extraction pilot with user OK.',
    };
    const dipAction: ImprovementCompassNextAction = {
      kind: 'skill',
      ref: '/ark-fix',
      summary: 'Inject a port/adapter for I/O; keep domain pure.',
    };

    switch (id) {
      case 'domain-logic-in-ui':
        attach(
          'soc',
          'Business rules still mix with UI or presentation surfaces.',
          shapeAction
        );
        attach(
          'domain',
          'Domain logic lives outside Domain — align rules with Domain ownership.',
          shapeAction
        );
        break;
      case 'facade-sql-in-routes':
        attach(
          'soc',
          'Routes/controllers own SQL or ORM access — concerns are mixed.',
          shapeAction
        );
        attach(
          'dip',
          'Transport depends on concrete persistence instead of a port.',
          dipAction
        );
        break;
      case 'io-under-application':
        attach(
          'soc',
          'Application/business code reaches I/O directly — separation is weak.',
          shapeAction
        );
        attach(
          'dip',
          'I/O is not inverted behind ports/adapters.',
          dipAction
        );
        attach(
          'testability',
          'Direct I/O under application code hurts pure unit testing.',
          dipAction
        );
        break;
      case 'handler-in-persistence':
        attach(
          'soc',
          'HTTP/transport handlers live under persistence folders.',
          shapeAction
        );
        break;
      case 'god-module':
        attach(
          'cohesion',
          'Large multi-responsibility modules reduce cohesion.',
          shapeAction
        );
        attach(
          'srp',
          'God modules own too many responsibilities — split by concern (one pilot).',
          {
            kind: 'skill',
            ref: '/ark-autopilot',
            summary: 'One Shape pilot with user OK — never multi-pilot batch.',
          }
        );
        break;
      case 'mixed-pattern-cluster':
        attach(
          'modularity',
          'Multiple layout styles coexist — placement is unclear for the next AI turn.',
          {
            kind: 'skill',
            ref: '/ark-explore',
            summary: 'Pick a golden pattern and migrate one pilot cluster on touch.',
          }
        );
        attach(
          'cohesion',
          'Mixed layout styles scatter the same concern across patterns.',
          shapeAction
        );
        break;
      case 'soft-contract':
        attach(
          'maintainability',
          'Soft contract walls (layers without deny rules) hide maintainability debt.',
          {
            kind: 'skill',
            ref: '/ark-contract',
            summary: 'Add real layer rules so the AI has hard walls.',
          }
        );
        attach(
          'coupling',
          'Layers with files but almost no deny rules allow free peer coupling.',
          {
            kind: 'skill',
            ref: '/ark-contract',
            summary: 'Tighten inter-layer allows/denies without weakening enforcement.',
          }
        );
        break;
      default:
        // Unknown smell ids still feed maintainability residual (honest residual,
        // not out-of-scope invention).
        attach(
          'maintainability',
          'Design residual remains under an unrecognized smell id — review evidence.',
          shapeAction
        );
        break;
    }
  }
}

function mapViolations(
  byId: Map<ImprovementLensId, MutableLens>,
  violations: readonly ImprovementCompassViolationFact[]
): void {
  for (const v of violations) {
    const ruleId = violationRuleId(v);
    if (!ruleId) continue;
    const detail = v.message;
    const upper = ruleId.toUpperCase();

    const attach = (
      lensId: ImprovementLensId,
      summary: string,
      action?: ImprovementCompassNextAction
    ) => {
      const lens = byId.get(lensId);
      if (!lens || OUT_OF_SCOPE_SET.has(lensId)) return;
      pushEvidence(lens, 'violations', ruleId, detail);
      if (v.file) pushEvidence(lens, 'violations', v.file, ruleId);
      markResidual(lens, summary, action);
    };

    const edgeAction: ImprovementCompassNextAction = {
      kind: 'skill',
      ref: '/ark-fix',
      summary: 'Clear the active edge residual, then re-doctor.',
    };

    if (
      upper === 'LAYER_IMPORT_VIOLATION' ||
      upper.includes('LAYER_IMPORT') ||
      upper === 'DYNAMIC_IMPORT_VIOLATION'
    ) {
      attach(
        'coupling',
        'Import graph edges violate the layer contract.',
        edgeAction
      );
      continue;
    }
    if (upper.includes('CYCLE') || upper === 'CIRCULAR_DEPENDENCY') {
      attach(
        'coupling',
        'Import cycles couple modules tightly.',
        edgeAction
      );
      continue;
    }
    if (upper.includes('PEER_ISOLATION') || upper === 'PEER_ISOLATION_VIOLATION') {
      attach(
        'coupling',
        'Peer isolation residual — slices import each other freely.',
        {
          kind: 'skill',
          ref: '/ark-loop',
          summary: 'Peer isolation fixes are judgment-class — one cluster at a time.',
        }
      );
      continue;
    }
    if (upper === 'FORBIDDEN_GLOBAL' || upper.startsWith('FORBIDDEN_')) {
      attach(
        'dip',
        'Forbidden globals / effect surfaces break dependency inversion.',
        {
          kind: 'skill',
          ref: '/ark-fix',
          summary: 'Inject a port instead of the forbidden global.',
        }
      );
      attach(
        'testability',
        'Forbidden ambient effects reduce pure-domain testability.',
        {
          kind: 'skill',
          ref: '/ark-fix',
          summary: 'Replace ambient effects with injectable ports.',
        }
      );
      continue;
    }
    if (upper === 'CAPABILITY_VIOLATION') {
      attach(
        'dip',
        'Denied capability use — invert through an allowed adapter/port.',
        {
          kind: 'skill',
          ref: '/ark-fix',
          summary: 'Capability walls require port injection (judgment, not mechanical-safe).',
        }
      );
      attach(
        'testability',
        'Capability violations couple domain code to I/O — harder to unit-test.',
        {
          kind: 'skill',
          ref: '/ark-fix',
          summary: 'Keep pure layers free of denied capabilities.',
        }
      );
      continue;
    }
    if (upper.startsWith('ARKRULE_') || upper === 'INVARIANT_UNCOVERED') {
      attach(
        'encapsulation',
        'ArkRules structure / invariant residual inside a layer.',
        {
          kind: 'skill',
          ref: '/ark-fix',
          summary: 'Label [ArkRules]; structure fixes are judgment — never invent mechanical-safe.',
        }
      );
      attach(
        'domain',
        'Intra-layer domain structure or invariant coverage residual.',
        {
          kind: 'skill',
          ref: '/ark-explore',
          summary: 'Inventory candidates → one ArkRules pilot with coverage evidence.',
        }
      );
      continue;
    }
  }
}

function mapCountsAndFlags(
  byId: Map<ImprovementLensId, MutableLens>,
  facts: ImprovementCompassFacts
): void {
  const cycleCount = Number(facts.cycleCount) || 0;
  if (cycleCount > 0) {
    const lens = byId.get('coupling')!;
    pushEvidence(lens, 'cycles', `count:${cycleCount}`);
    markResidual(lens, 'Import cycles couple modules tightly.', {
      kind: 'skill',
      ref: '/ark-fix',
      summary: 'Break cycles with a judgment extraction — one pilot.',
    });
  }

  const peer =
    typeof facts.peerIsolationCount === 'boolean'
      ? facts.peerIsolationCount
        ? 1
        : 0
      : Number(facts.peerIsolationCount) || 0;
  if (peer > 0) {
    const lens = byId.get('coupling')!;
    pushEvidence(lens, 'peerIsolation', `count:${peer}`);
    markResidual(lens, 'Peer isolation residual remains.', {
      kind: 'skill',
      ref: '/ark-loop',
      summary: 'Peer isolation is judgment-class residual.',
    });
  }

  const pc = Number(facts.physicalCohesionFindingCount) || 0;
  if (pc > 0) {
    const cohesion = byId.get('cohesion')!;
    pushEvidence(cohesion, 'physicalCohesion', `findings:${pc}`);
    markResidual(
      cohesion,
      'Physical cohesion residual — mirrored concept clusters across anchors.',
      {
        kind: 'skill',
        ref: '/ark-explore',
        summary: 'Review reshape pilot; one decision-aware pilot at a time.',
      }
    );
    const srp = byId.get('srp')!;
    pushEvidence(srp, 'physicalCohesion', `findings:${pc}`);
    markResidual(
      srp,
      'Mirrored clusters suggest split-by-concern residual (architecture SRP).',
      {
        kind: 'skill',
        ref: '/ark-autopilot',
        summary: 'One reshape/extraction pilot with user OK.',
      }
    );
  }

  const pureN = Number(facts.pureOrCapabilityResidual) || 0;
  const fgN = Number(facts.forbiddenGlobalResidual) || 0;
  if (pureN > 0 || fgN > 0) {
    const dip = byId.get('dip')!;
    if (pureN > 0) pushEvidence(dip, 'capability', `residual:${pureN}`);
    if (fgN > 0) pushEvidence(dip, 'forbiddenGlobals', `residual:${fgN}`);
    markResidual(dip, 'Pure / capability / forbidden residual weakens dependency inversion.', {
      kind: 'skill',
      ref: '/ark-fix',
      summary: 'Inject ports; keep pure layers free of effects.',
    });
    const test = byId.get('testability')!;
    if (pureN > 0) pushEvidence(test, 'capability', `residual:${pureN}`);
    if (fgN > 0) pushEvidence(test, 'forbiddenGlobals', `residual:${fgN}`);
    markResidual(test, 'Impure domain or capability residual reduces testability.', {
      kind: 'skill',
      ref: '/ark-fix',
      summary: 'Prefer ports over concrete I/O in pure/domain modules.',
    });
  }

  const arkN = Number(facts.arkRulesStructureResidual) || 0;
  if (arkN > 0) {
    const enc = byId.get('encapsulation')!;
    pushEvidence(enc, 'arkRules', `structureResidual:${arkN}`);
    markResidual(enc, 'ArkRules structure residual — encapsulation inside the layer.', {
      kind: 'skill',
      ref: '/ark-fix',
      summary: 'Fix structure sensors under [ArkRules] without inventing mechanical-safe.',
    });
    const domain = byId.get('domain')!;
    pushEvidence(domain, 'arkRules', `structureResidual:${arkN}`);
    markResidual(domain, 'ArkRules residual may mean domain shape is not yet under contract.', {
      kind: 'skill',
      ref: '/ark-explore',
      summary: 'Map inventory candidates; one pilot rule at a time.',
    });
  } else if (facts.arkRulesLoaded === false || facts.arkRulesLoaded == null) {
    // No ArkRules → encapsulation stays ok (absence is valid), not residual.
    // Domain remains ok unless other evidence marked it.
  }

  if (facts.designWeak === true) {
    const m = byId.get('maintainability')!;
    pushEvidence(m, 'designFitness', 'design-weak');
    markResidual(
      m,
      'Design-weak: checked edges may be clean, but design residual remains — not finished.',
      {
        kind: 'skill',
        ref: '/ark-explore',
        summary: 'Shape door: explore shape-focus → dual-plan B → one pilot with OK.',
      }
    );
  }

  if (facts.dirtyBaselineRisk === true || (Number(facts.baselineStale) || 0) > 0) {
    const m = byId.get('maintainability')!;
    if (facts.dirtyBaselineRisk === true) {
      pushEvidence(m, 'baseline', 'dirty-freeze-risk');
    }
    if ((Number(facts.baselineStale) || 0) > 0) {
      pushEvidence(m, 'baseline', `stale:${facts.baselineStale}`);
    }
    markResidual(
      m,
      'Baseline honesty residual — frozen debt or stale keys need review.',
      {
        kind: 'command',
        ref: 'ark-check --doctor',
        summary: 'Review baseline freeze honesty; do not freeze new wrong debt.',
      }
    );
  }

  const ungov = Number(facts.ungovernedDirCount) || 0;
  const emptyL = Number(facts.emptyLayerCount) || 0;
  if (ungov > 0 || emptyL > 0) {
    const mod = byId.get('modularity')!;
    if (ungov > 0) pushEvidence(mod, 'coverage', `ungovernedDirs:${ungov}`);
    if (emptyL > 0) pushEvidence(mod, 'coverage', `emptyLayers:${emptyL}`);
    markResidual(
      mod,
      'Placement / modularity residual — ungoverned dirs or empty layer globs.',
      {
        kind: 'skill',
        ref: '/ark-contract',
        summary: 'Classify ungoverned paths; fix empty layer patterns.',
      }
    );
  }

  // Stack: TypeScript host partially instrumented; unknown → not-instrumented.
  const stack = byId.get('stack')!;
  const kind = facts.stackKind ?? null;
  if (kind === 'typescript') {
    // Partial instrumentation is still honest `ok` when no residual evidence.
    if (stack.status === 'ok') {
      stack.summary =
        'Stack practices are partially instrumented for TypeScript / host / Ark idioms only — not a full framework checklist.';
    }
  } else {
    stack.status = 'not-instrumented';
    stack.summary =
      'Stack-specific best practices outside TypeScript/host/Ark idioms are not instrumented.';
    stack.evidence = [];
    stack.nextAction = {
      kind: 'docs',
      ref: 'docs/use.md#improvement-compass',
      summary: 'Ark does not score non-TS stack idioms.',
    };
  }
}

function finalizeTopResidual(lenses: readonly MutableLens[]): ImprovementLensId[] {
  const residual = lenses
    .filter((l) => l.status === 'residual' && !OUT_OF_SCOPE_SET.has(l.id))
    .slice()
    .sort((a, b) => {
      const pa = RESIDUAL_SORT_PRIORITY[a.id] ?? 150;
      const pb = RESIDUAL_SORT_PRIORITY[b.id] ?? 150;
      if (pa !== pb) return pa - pb;
      return a.id.localeCompare(b.id);
    });
  return residual.slice(0, IMPROVEMENT_COMPASS_TOP_RESIDUAL_CAP).map((l) => l.id);
}

function humanLabel(id: ImprovementLensId): string {
  return LENS_LABELS[id] ?? id;
}

/**
 * Build a deterministic improvement compass from supplied doctor-side facts.
 * Always returns all 15 lenses; always `notAScore: true`.
 */
export function buildImprovementCompass(
  facts: ImprovementCompassFacts = {}
): ImprovementCompass {
  const lenses = initLenses();
  const byId = new Map(lenses.map((l) => [l.id, l]));

  if (Array.isArray(facts.designSmells) && facts.designSmells.length > 0) {
    // Sort by smell id so projection is input-order independent.
    const smells = [...facts.designSmells].sort((a, b) =>
      smellIdOf(a).localeCompare(smellIdOf(b))
    );
    mapDesignSmells(byId, smells);
  }
  if (Array.isArray(facts.violations) && facts.violations.length > 0) {
    const violations = [...facts.violations].sort((a, b) => {
      const ra = violationRuleId(a).localeCompare(violationRuleId(b));
      if (ra !== 0) return ra;
      return String(a.file ?? '').localeCompare(String(b.file ?? ''));
    });
    mapViolations(byId, violations);
  }
  mapCountsAndFlags(byId, facts);

  // Hard lock: out-of-scope can never be residual, even if bad facts arrive.
  for (const id of IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES) {
    const lens = byId.get(id)!;
    lens.status = 'out-of-scope';
    lens.summary = OUT_OF_SCOPE_SUMMARIES[id];
    lens.evidence = [];
    lens.nextAction = {
      kind: 'docs',
      ref: 'docs/use.md#improvement-compass',
      summary: 'Out of scope for ArkGate — use dedicated tooling outside the gate.',
    };
  }

  // Stable evidence order per lens (source then ref).
  for (const lens of lenses) {
    lens.evidence.sort((a, b) => {
      const s = a.source.localeCompare(b.source);
      if (s !== 0) return s;
      return a.ref.localeCompare(b.ref);
    });
  }

  const topResidual = finalizeTopResidual(lenses);

  return {
    schemaVersion: ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION,
    notAScore: true,
    lenses: lenses.map((l) => {
      const out: ImprovementLens = {
        id: l.id,
        status: l.status,
        summary: l.summary,
        evidence: l.evidence.map((e) => ({ ...e })),
      };
      if (l.nextAction) {
        out.nextAction = { ...l.nextAction };
      }
      return out;
    }),
    topResidual,
  };
}

/**
 * Plain residual lens names for human doctor / compact router (never a score).
 */
export function formatImprovementCompassResidualLabels(
  compass: ImprovementCompass
): string[] {
  return compass.topResidual.map((id) => humanLabel(id));
}

/**
 * Primary next action from the first residual lens that carries one.
 */
export function primaryImprovementCompassNextAction(
  compass: ImprovementCompass
): ImprovementCompassNextAction | null {
  for (const id of compass.topResidual) {
    const lens = compass.lenses.find((l) => l.id === id);
    if (lens?.nextAction) return { ...lens.nextAction };
  }
  return null;
}

/**
 * Human doctor lines (no score bar). Caller prefixes section header.
 */
export function formatImprovementCompassDoctorLines(
  compass: ImprovementCompass
): string[] {
  const residual = formatImprovementCompassResidualLabels(compass);
  const outOfScope = IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES.map((id) => humanLabel(id));
  const next = primaryImprovementCompassNextAction(compass);
  const lines: string[] = [];
  if (residual.length > 0) {
    lines.push(`Residual: ${residual.join(' · ')}`);
  } else {
    lines.push('Residual: none on instrumented lenses (not a score — green edges ≠ finished design).');
  }
  lines.push(`Out of scope (honest): ${outOfScope.join(' · ')}`);
  if (next) {
    lines.push(`Next: ${next.ref} — ${next.summary}`);
  }
  return lines;
}
