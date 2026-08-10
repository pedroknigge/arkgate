/**
 * Improvement compass (product 4.4.0) — pure Domain projection facade.
 *
 * Closed set of architecture **lenses** projected from existing doctor-side
 * evidence. Always `notAScore: true`. Never a gate input: residual lenses must
 * not flip `valid`, strict-merge exit, or `goal.met`.
 *
 * Out-of-scope lenses (`scalability`, `resilience`, `security`) are locked —
 * missing SAST/APM/chaos never invents residual.
 *
 * DF03 split: types → improvementCompassTypes.ts; fact mappers →
 * improvementCompassMap.ts; this module owns build + doctor formatters and
 * re-exports the public Domain surface.
 *
 * Pure Domain: no fs, fetch, Date.now, process — inject facts as input.
 */

export {
  ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION,
  IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES,
  IMPROVEMENT_COMPASS_TOP_RESIDUAL_CAP,
  IMPROVEMENT_LENS_IDS,
  type ImprovementCompass,
  type ImprovementCompassEvidence,
  type ImprovementCompassFacts,
  type ImprovementCompassNextAction,
  type ImprovementCompassSmellFact,
  type ImprovementCompassViolationFact,
  type ImprovementLens,
  type ImprovementLensId,
  type ImprovementLensStatus,
} from './improvementCompassTypes';

import {
  ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION,
  IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES,
  improvementCompassHumanLabel,
  type ImprovementCompass,
  type ImprovementCompassFacts,
  type ImprovementCompassNextAction,
  type ImprovementLens,
} from './improvementCompassTypes';
import {
  createInitialImprovementCompassLenses,
  finalizeImprovementCompassTopResidual,
  lockImprovementCompassOutOfScope,
  projectImprovementCompassFacts,
  sortImprovementCompassEvidence,
} from './improvementCompassMap';

/**
 * Build a deterministic improvement compass from supplied doctor-side facts.
 * Always returns all 15 lenses; always `notAScore: true`.
 */
export function buildImprovementCompass(
  facts: ImprovementCompassFacts = {}
): ImprovementCompass {
  const lenses = createInitialImprovementCompassLenses();
  const byId = new Map(lenses.map((l) => [l.id, l]));

  projectImprovementCompassFacts(byId, facts);
  lockImprovementCompassOutOfScope(byId);
  sortImprovementCompassEvidence(lenses);

  const topResidual = finalizeImprovementCompassTopResidual(lenses);

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
  return compass.topResidual.map((id) => improvementCompassHumanLabel(id));
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
  const outOfScope = IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES.map((id) =>
    improvementCompassHumanLabel(id)
  );
  const next = primaryImprovementCompassNextAction(compass);
  const lines: string[] = [];
  if (residual.length > 0) {
    lines.push(`Residual: ${residual.join(' · ')}`);
  } else {
    lines.push(
      'Residual: none on instrumented lenses (not a score — green edges ≠ finished design).'
    );
  }
  lines.push(`Out of scope (honest): ${outOfScope.join(' · ')}`);
  if (next) {
    lines.push(`Next: ${next.ref} — ${next.summary}`);
  }
  return lines;
}
