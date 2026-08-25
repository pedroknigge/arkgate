/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkRunDoctor.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-run-doctor.mjs). Zero Node I/O.
 */

import { composeMergePlanesHonesty, extraMergeTeethAllowed, isArkRunRuleId, } from './extra-merge-teeth.mjs';
export const ARK_RUN_DOCTOR_SCHEMA_VERSION = '1.0';
const RESIDUAL_RULE_CAP = 12;
function closedMode(value) {
    return value === 'enforced' || value === 'advisory' ? value : null;
}
function uniqueArkRunRuleIds(findings) {
    const seen = new Set();
    if (!Array.isArray(findings))
        return [];
    for (const finding of findings) {
        const id = finding?.ruleId;
        if (typeof id !== 'string' || !isArkRunRuleId(id) || seen.has(id))
            continue;
        seen.add(id);
    }
    return [...seen].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
function extraFromConfig(arkRun) {
    if (!arkRun || typeof arkRun !== 'object') {
        return { present: false, mode: null, roots: 0, layers: 0, requireDeclarations: null };
    }
    return {
        present: true,
        mode: closedMode(arkRun.mode),
        roots: Array.isArray(arkRun.compositionRoots) ? arkRun.compositionRoots.length : 0,
        layers: Array.isArray(arkRun.managedLayers) ? arkRun.managedLayers.length : 0,
        requireDeclarations: arkRun.requireDeclarations === true,
    };
}
/**
 * Doctor / HTML ArkRun advisory. Always emitted; absence is an honest silent row.
 */
export function summarizeArkRunSection(input = {}) {
    const extra = extraFromConfig(input.arkRun);
    const uniqueIds = extra.present ? uniqueArkRunRuleIds(input.findings) : [];
    const ruleIds = uniqueIds.slice(0, RESIDUAL_RULE_CAP);
    const residualCount = uniqueIds.length;
    const mergePlanes = composeMergePlanesHonesty({
        classification: input.classification,
        arkRules: {
            active: input.arkRules?.active === true,
            structureEnforced: input.arkRules?.structureEnforced,
            structureTotal: input.arkRules?.structureTotal,
            structureAdvisory: input.arkRules?.structureAdvisory,
            invariantEnforced: input.arkRules?.invariantEnforced,
            invariantTotal: input.arkRules?.invariantTotal,
            invariantAdvisory: input.arkRules?.invariantAdvisory,
            covered: input.arkRules?.covered,
            uncovered: input.arkRules?.uncovered,
        },
        arkRun: {
            present: extra.present,
            mode: extra.mode,
            residualCount,
        },
    });
    const extraMergeTeeth = extra.present && extra.mode === 'enforced' && extraMergeTeethAllowed(input.classification);
    let note;
    if (!extra.present) {
        note =
            'Absence of arkRun is silent — Layers and ArkRules verdicts unchanged. Not a score.';
    }
    else if (extra.mode === 'advisory') {
        note =
            'Advisory ArkRun residual only — never flips valid or --strict-merge. Residual is a finding-id count, never a score.';
    }
    else if (extraMergeTeeth) {
        note =
            'Enforced ArkRun is on the extra merge plane. Residual is a finding-id count, never a score.';
    }
    else {
        note =
            'Enforced ArkRun extra teeth stay demoted until the layer plane is honestly classified. Residual is a finding-id count, never a score.';
    }
    return {
        schemaVersion: ARK_RUN_DOCTOR_SCHEMA_VERSION,
        notAScore: true,
        active: extra.present,
        mode: extra.mode,
        compositionRoots: extra.roots,
        managedLayers: extra.layers,
        requireDeclarations: extra.requireDeclarations,
        residual: { count: residualCount, ruleIds },
        extraMergeTeeth,
        failMergeWhen: mergePlanes.failMergeWhen,
        note,
        mergePlanes,
    };
}
/** Thin status slice — counts only; residual null means unknown, not green. */
export function projectStatusArkRun(input = {}) {
    const present = input.present === true;
    const mode = closedMode(input.mode);
    const residualRaw = input.residual;
    let residual = null;
    if (typeof residualRaw === 'number' && Number.isFinite(residualRaw) && residualRaw >= 0) {
        residual = Math.floor(residualRaw);
    }
    if (!present)
        residual = residual == null ? 0 : residual;
    return {
        notAScore: true,
        present,
        mode: present ? mode : null,
        extraMergeTeeth: present && mode === 'enforced' && input.extraMergeTeeth === true,
        residual,
    };
}
export function formatArkRunDoctorLines(section) {
    if (!section || section.notAScore !== true)
        return [];
    if (section.active !== true) {
        return ['ArkRun extra is off — silent on Layers/ArkRules (not a score).'];
    }
    const mode = section.mode ?? 'unknown';
    const teeth = section.extraMergeTeeth === true ? 'armed' : 'not armed';
    const lines = [
        `mode: ${mode} · extra merge teeth ${teeth} · not a score`,
    ];
    if (section.residual.count > 0) {
        const shown = section.residual.ruleIds.join(', ');
        const more = section.residual.count > section.residual.ruleIds.length
            ? ` (+${section.residual.count - section.residual.ruleIds.length} more)`
            : '';
        lines.push(`Residual: ${shown}${more}`);
    }
    else {
        lines.push('Residual: none on this scan (not a score — green extras ≠ finished kernel wiring).');
    }
    if (section.failMergeWhen)
        lines.push(section.failMergeWhen);
    return lines;
}
