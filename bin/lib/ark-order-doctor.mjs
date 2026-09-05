/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkOrderDoctor.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-order-doctor.mjs). Zero Node I/O.
 */

import { composeMergePlanesHonesty, extraMergeTeethAllowed, isArkOrderRuleId, } from './extra-merge-teeth.mjs';
export const ARK_ORDER_DOCTOR_SCHEMA_VERSION = '1.0';
const RESIDUAL_RULE_CAP = 12;
export const ARKORDER_ONE_BREATH = 'Layers stop a bad import. ArkOrder stops rewriting a big product choice — like the billing plan — as if it were a seat count. Change those choices through a valve, not a generic update.';
function closedMode(value) {
    return value === 'enforced' || value === 'advisory' ? value : null;
}
function uniqueArkOrderRuleIds(findings) {
    const seen = new Set();
    if (!Array.isArray(findings))
        return [];
    for (const finding of findings) {
        const id = finding?.ruleId;
        if (typeof id !== 'string' || !isArkOrderRuleId(id) || seen.has(id))
            continue;
        seen.add(id);
    }
    return [...seen].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
function extraFromConfig(arkOrder) {
    if (!arkOrder || typeof arkOrder !== 'object') {
        return { present: false, mode: null, roots: 0, layers: 0, xiKeys: [] };
    }
    const xiKeys = Array.isArray(arkOrder.xiKeys)
        ? arkOrder.xiKeys.filter((key) => typeof key === 'string' && key.length > 0)
        : [];
    return {
        present: true,
        mode: closedMode(arkOrder.mode),
        roots: Array.isArray(arkOrder.planeRoots) ? arkOrder.planeRoots.length : 0,
        layers: Array.isArray(arkOrder.managedLayers) ? arkOrder.managedLayers.length : 0,
        xiKeys,
    };
}
/**
 * Doctor / HTML ArkOrder advisory. Always emitted; absence is an honest silent row.
 */
export function summarizeArkOrderSection(input = {}) {
    const extra = extraFromConfig(input.arkOrder);
    const uniqueIds = extra.present ? uniqueArkOrderRuleIds(input.findings) : [];
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
            present: input.arkRun?.present === true,
            mode: input.arkRun?.mode ?? null,
            residualCount: input.arkRun?.residualCount,
        },
        arkOrder: {
            present: extra.present,
            mode: extra.mode,
            residualCount,
        },
    });
    const extraMergeTeeth = extra.present && extra.mode === 'enforced' && extraMergeTeethAllowed(input.classification);
    let note;
    if (!extra.present) {
        note = 'Absence of arkOrder is silent — Layers verdicts unchanged. Not a score.';
    }
    else if (extra.mode === 'advisory') {
        note =
            'Advisory ArkOrder residual only — never flips valid or --strict-merge. Residual is a finding-id count, never a score.';
    }
    else if (extraMergeTeeth) {
        note =
            'Enforced ArkOrder is on the extra merge plane. Residual is a finding-id count, never a score.';
    }
    else {
        note =
            'Enforced ArkOrder extra teeth stay demoted until the layer plane is honestly classified. Residual is a finding-id count, never a score.';
    }
    return {
        schemaVersion: ARK_ORDER_DOCTOR_SCHEMA_VERSION,
        notAScore: true,
        active: extra.present,
        mode: extra.mode,
        planeRoots: extra.roots,
        managedLayers: extra.layers,
        xiKeys: extra.xiKeys,
        residual: { count: residualCount, ruleIds },
        extraMergeTeeth,
        failMergeWhen: mergePlanes.failMergeWhen,
        note,
        mergePlanes,
    };
}
/** Thin status slice — counts only; residual null means unknown, not green. */
export function projectStatusArkOrder(input = {}) {
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
export function formatArkOrderDoctorLines(section) {
    if (!section || section.notAScore !== true)
        return [];
    if (section.active !== true) {
        return ['ArkOrder extra is off — silent on Layers (not a score).'];
    }
    const mode = section.mode ?? 'unknown';
    const teeth = section.extraMergeTeeth === true ? 'armed' : 'not armed';
    const keys = section.xiKeys.length > 0 ? section.xiKeys.join(', ') : '(none named — field-write sensor silent)';
    const lines = [
        ARKORDER_ONE_BREATH,
        `mode: ${mode} · xiKeys: ${keys} · extra merge teeth ${teeth} · not a score`,
    ];
    if (section.residual.count > 0) {
        const shown = section.residual.ruleIds.join(', ');
        const more = section.residual.count > section.residual.ruleIds.length
            ? ` (+${section.residual.count - section.residual.ruleIds.length} more)`
            : '';
        lines.push(`Residual: ${shown}${more}`);
    }
    else {
        lines.push('Residual: none on this scan (not a score — green extras ≠ a frozen billing plan).');
    }
    if (section.failMergeWhen)
        lines.push(section.failMergeWhen);
    return lines;
}
