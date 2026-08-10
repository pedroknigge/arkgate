/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/improvementCompass.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/improvement-compass.mjs). Zero Node I/O.
 */

export { ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION, IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES, IMPROVEMENT_COMPASS_TOP_RESIDUAL_CAP, IMPROVEMENT_LENS_IDS, } from './improvement-compass-types.mjs';
import { ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION, IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES, improvementCompassHumanLabel, } from './improvement-compass-types.mjs';
import { createInitialImprovementCompassLenses, finalizeImprovementCompassTopResidual, lockImprovementCompassOutOfScope, projectImprovementCompassFacts, sortImprovementCompassEvidence, } from './improvement-compass-map.mjs';
/**
 * Build a deterministic improvement compass from supplied doctor-side facts.
 * Always returns all 15 lenses; always `notAScore: true`.
 */
export function buildImprovementCompass(facts = {}) {
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
            const out = {
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
export function formatImprovementCompassResidualLabels(compass) {
    return compass.topResidual.map((id) => improvementCompassHumanLabel(id));
}
/**
 * Primary next action from the first residual lens that carries one.
 */
export function primaryImprovementCompassNextAction(compass) {
    for (const id of compass.topResidual) {
        const lens = compass.lenses.find((l) => l.id === id);
        if (lens?.nextAction)
            return { ...lens.nextAction };
    }
    return null;
}
/**
 * Human doctor lines (no score bar). Caller prefixes section header.
 */
export function formatImprovementCompassDoctorLines(compass) {
    const residual = formatImprovementCompassResidualLabels(compass);
    const outOfScope = IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES.map((id) => improvementCompassHumanLabel(id));
    const next = primaryImprovementCompassNextAction(compass);
    const lines = [];
    if (residual.length > 0) {
        lines.push(`Residual: ${residual.join(' · ')}`);
    }
    else {
        lines.push('Residual: none on instrumented lenses (not a score — green edges ≠ finished design).');
    }
    lines.push(`Out of scope (honest): ${outOfScope.join(' · ')}`);
    if (next) {
        lines.push(`Next: ${next.ref} — ${next.summary}`);
    }
    return lines;
}
