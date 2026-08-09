/**
 * IC02 — Domain pure improvement compass.
 *
 * Matrix: residual SoC/DIP/domain from smells/walls; out-of-scope locked;
 * empty input; deterministic topResidual; never a score.
 */
import { describe, expect, it } from 'vitest';
import {
  ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION,
  IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES,
  IMPROVEMENT_COMPASS_TOP_RESIDUAL_CAP,
  IMPROVEMENT_LENS_IDS,
  buildImprovementCompass,
  formatImprovementCompassDoctorLines,
  formatImprovementCompassResidualLabels,
  primaryImprovementCompassNextAction,
  type ImprovementCompass,
  type ImprovementLensId,
  type ImprovementLensStatus,
} from '../../../src/domain/improvementCompass';

function lens(compass: ImprovementCompass, id: ImprovementLensId) {
  const found = compass.lenses.find((l) => l.id === id);
  expect(found, `lens ${id}`).toBeDefined();
  return found!;
}

function statuses(compass: ImprovementCompass): ImprovementLensStatus[] {
  return compass.lenses.map((l) => l.status);
}

describe('improvementCompass (Domain pure)', () => {
  it('exposes schema 1.0, 15 closed lenses, always notAScore', () => {
    const compass = buildImprovementCompass({});
    expect(ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION).toBe('1.0');
    expect(compass.schemaVersion).toBe('1.0');
    expect(compass.notAScore).toBe(true);
    expect(IMPROVEMENT_LENS_IDS).toHaveLength(15);
    expect(compass.lenses).toHaveLength(15);
    expect(compass.lenses.map((l) => l.id)).toEqual([...IMPROVEMENT_LENS_IDS]);
    // No numeric score / rank product fields (notAScore is required; prose may say "not a score")
    expect((compass as { average?: unknown }).average).toBeUndefined();
    expect((compass as { score?: unknown }).score).toBeUndefined();
    expect((compass as { rank?: unknown }).rank).toBeUndefined();
    expect(JSON.stringify(compass)).not.toMatch(/"Excellent"|"Good"/);
  });

  it('empty input → only ok | out-of-scope | not-instrumented (never residual invent)', () => {
    const compass = buildImprovementCompass({});
    for (const status of statuses(compass)) {
      expect(['ok', 'out-of-scope', 'not-instrumented']).toContain(status);
    }
    expect(compass.topResidual).toEqual([]);
    for (const id of IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES) {
      expect(lens(compass, id).status).toBe('out-of-scope');
      expect(lens(compass, id).evidence).toEqual([]);
    }
    expect(lens(compass, 'ocp').status).toBe('not-instrumented');
  });

  it('maps design smells → soc / cohesion / srp / domain / dip residual', () => {
    const compass = buildImprovementCompass({
      designSmells: [
        {
          id: 'domain-logic-in-ui',
          outcome: 'Business rules in UI',
          evidence: ['src/ui/canBuy.ts'],
        },
        {
          id: 'io-under-application',
          message: 'prisma in app service',
          evidence: ['src/services/billing.ts'],
        },
        {
          id: 'god-module',
          evidence: ['src/god.ts'],
        },
      ],
    });

    expect(lens(compass, 'soc').status).toBe('residual');
    expect(lens(compass, 'domain').status).toBe('residual');
    expect(lens(compass, 'dip').status).toBe('residual');
    expect(lens(compass, 'testability').status).toBe('residual');
    expect(lens(compass, 'cohesion').status).toBe('residual');
    expect(lens(compass, 'srp').status).toBe('residual');

    expect(lens(compass, 'soc').evidence.some((e) => e.ref === 'domain-logic-in-ui')).toBe(
      true
    );
    expect(lens(compass, 'dip').evidence.some((e) => e.ref === 'io-under-application')).toBe(
      true
    );
  });

  it('maps capability/forbidden residual and violations → dip / testability / coupling', () => {
    const compass = buildImprovementCompass({
      pureOrCapabilityResidual: 2,
      forbiddenGlobalResidual: 1,
      cycleCount: 1,
      peerIsolationCount: true,
      violations: [
        { ruleId: 'LAYER_IMPORT_VIOLATION', file: 'src/a.ts', message: 'App → Domain reverse' },
        { ruleId: 'CAPABILITY_VIOLATION', file: 'src/domain/x.ts' },
        { ruleId: 'FORBIDDEN_GLOBAL', file: 'src/domain/y.ts' },
        { ruleId: 'ARKRULE_PRIVATE_STATE', file: 'src/domain/Order.ts' },
      ],
    });

    expect(lens(compass, 'dip').status).toBe('residual');
    expect(lens(compass, 'testability').status).toBe('residual');
    expect(lens(compass, 'coupling').status).toBe('residual');
    expect(lens(compass, 'encapsulation').status).toBe('residual');
    expect(lens(compass, 'domain').status).toBe('residual');
  });

  it('maps physicalCohesion + design-weak → cohesion/srp/maintainability', () => {
    const compass = buildImprovementCompass({
      physicalCohesionFindingCount: 3,
      designWeak: true,
      dirtyBaselineRisk: true,
    });
    expect(lens(compass, 'cohesion').status).toBe('residual');
    expect(lens(compass, 'srp').status).toBe('residual');
    expect(lens(compass, 'maintainability').status).toBe('residual');
  });

  it('out-of-scope lenses cannot become residual even with hostile facts', () => {
    const compass = buildImprovementCompass({
      designSmells: [{ id: 'god-module' }],
      // Hostile / nonsense — must not flip locked lenses
      violations: [
        { ruleId: 'SCALABILITY_SCORE', message: 'fake' },
        { ruleId: 'SECURITY_SCAN', message: 'fake' },
      ],
      pureOrCapabilityResidual: 99,
    });
    for (const id of IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES) {
      const l = lens(compass, id);
      expect(l.status).toBe('out-of-scope');
      expect(l.evidence).toEqual([]);
      expect(l.summary.toLowerCase()).toMatch(/does not|not measure|not run/);
    }
    expect(compass.topResidual).not.toContain('scalability');
    expect(compass.topResidual).not.toContain('resilience');
    expect(compass.topResidual).not.toContain('security');
  });

  it('topResidual is capped, deterministic, severity-then-id ordered', () => {
    const a = buildImprovementCompass({
      designSmells: [
        { id: 'domain-logic-in-ui' },
        { id: 'io-under-application' },
        { id: 'god-module' },
        { id: 'mixed-pattern-cluster' },
        { id: 'soft-contract' },
      ],
      cycleCount: 2,
      pureOrCapabilityResidual: 1,
      designWeak: true,
      physicalCohesionFindingCount: 1,
      arkRulesStructureResidual: 1,
      ungovernedDirCount: 2,
    });
    const b = buildImprovementCompass({
      // Same facts, different smell order — must not change projection order.
      designSmells: [
        { id: 'soft-contract' },
        { id: 'mixed-pattern-cluster' },
        { id: 'god-module' },
        { id: 'io-under-application' },
        { id: 'domain-logic-in-ui' },
      ],
      cycleCount: 2,
      pureOrCapabilityResidual: 1,
      designWeak: true,
      physicalCohesionFindingCount: 1,
      arkRulesStructureResidual: 1,
      ungovernedDirCount: 2,
    });

    expect(a.topResidual.length).toBeLessThanOrEqual(IMPROVEMENT_COMPASS_TOP_RESIDUAL_CAP);
    expect(a.topResidual).toEqual(b.topResidual);
    expect(a.topResidual.length).toBeGreaterThan(0);
    // soc should lead residual when present (highest product priority among residual).
    expect(a.topResidual[0]).toBe('soc');
    // Full JSON equality for deterministic projection
    expect(a).toEqual(b);
  });

  it('stack: typescript partial ok vs unknown not-instrumented', () => {
    const ts = buildImprovementCompass({ stackKind: 'typescript' });
    expect(lens(ts, 'stack').status).toBe('ok');
    expect(lens(ts, 'stack').summary.toLowerCase()).toMatch(/partial/);

    const unk = buildImprovementCompass({ stackKind: 'unknown' });
    expect(lens(unk, 'stack').status).toBe('not-instrumented');

    const missing = buildImprovementCompass({});
    expect(lens(missing, 'stack').status).toBe('not-instrumented');
  });

  it('format helpers produce plain residual language without score bars', () => {
    const compass = buildImprovementCompass({
      designSmells: [{ id: 'domain-logic-in-ui' }, { id: 'io-under-application' }],
    });
    const labels = formatImprovementCompassResidualLabels(compass);
    expect(labels.some((s) => /separation of concerns/i.test(s))).toBe(true);
    const lines = formatImprovementCompassDoctorLines(compass);
    expect(lines.join('\n')).toMatch(/Residual:/);
    expect(lines.join('\n')).toMatch(/Out of scope/);
    expect(lines.join('\n')).not.toMatch(/\d+\s*\/\s*10|score bar|Excellent/i);
    const next = primaryImprovementCompassNextAction(compass);
    expect(next?.ref).toBeTruthy();
  });
});
