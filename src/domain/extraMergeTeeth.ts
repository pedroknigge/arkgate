/**
 * Extra-plane merge teeth (ArkRules + ArkRun). Same classification floor.
 *
 * Unknown classification (contract-only callers) allows teeth. Known empty or
 * under-floor trees demote extra-plane findings so they never merge-block.
 */
export const EXTRA_MERGE_TEETH_GOVERNED_FLOOR = 50;

export type ExtraMergeTeethClassification = {
  governedPercent?: number | null;
  populatedLayerCount?: number | null;
};

export type ExtraMergeTeethClassificationInput = ExtraMergeTeethClassification & {
  classifiedFiles?: number | null;
};

export function normalizeExtraMergeTeethClassification(
  classification?: ExtraMergeTeethClassificationInput | null
): ExtraMergeTeethClassification {
  if (!classification) return {};
  const governedPercent =
    typeof classification.governedPercent === 'number' ? classification.governedPercent : null;
  let populatedLayerCount =
    typeof classification.populatedLayerCount === 'number'
      ? classification.populatedLayerCount
      : null;
  if (
    populatedLayerCount == null &&
    typeof classification.classifiedFiles === 'number'
  ) {
    populatedLayerCount = classification.classifiedFiles > 0 ? 1 : 0;
  }
  return { governedPercent, populatedLayerCount };
}

export function extraMergeTeethAllowed(
  classification?: ExtraMergeTeethClassificationInput | null
): boolean {
  const normalized = normalizeExtraMergeTeethClassification(classification);
  const governed =
    typeof normalized.governedPercent === 'number' ? normalized.governedPercent : null;
  const populated =
    typeof normalized.populatedLayerCount === 'number' ? normalized.populatedLayerCount : null;
  if (governed == null && populated == null) return true;
  return (
    (governed ?? 0) >= EXTRA_MERGE_TEETH_GOVERNED_FLOOR && (populated ?? 0) >= 1
  );
}

export function classifyResolvedLayerCoverage(
  files: readonly { layer?: string | null | undefined }[]
): ExtraMergeTeethClassification {
  const total = files.length;
  let classified = 0;
  const populated = new Set<string>();
  for (const file of files) {
    const layer = typeof file.layer === 'string' && file.layer.length > 0 ? file.layer : null;
    if (!layer) continue;
    classified += 1;
    populated.add(layer);
  }
  return {
    governedPercent: total > 0 ? Math.round((classified / total) * 100) : 0,
    populatedLayerCount: populated.size,
  };
}

export function isArkRunRuleId(ruleId: unknown): boolean {
  return typeof ruleId === 'string' && ruleId.startsWith('ARKRUN_');
}

export function isExtraPlaneFinding(violation: {
  ruleId?: unknown;
  arkruleId?: unknown;
}): boolean {
  if (violation?.arkruleId != null) return true;
  const id = typeof violation?.ruleId === 'string' ? violation.ruleId : '';
  return id.startsWith('ARKRULE') || id.startsWith('arkrule') || id.startsWith('ARKRUN_');
}

/**
 * Under the classification floor, demote enforced extra-plane findings in place
 * so merge/write/CI match (layer graph only). Unknown classification is a no-op.
 */
export function demoteExtraPlaneTeethUnderClassificationFloor<
  T extends { ruleId?: unknown; arkruleId?: unknown; failsStrict?: boolean; severity?: string },
>(violations: T[], classification: ExtraMergeTeethClassification = {}): T[] {
  if (!Array.isArray(violations)) return violations;
  if (extraMergeTeethAllowed(classification)) return violations;
  for (const violation of violations) {
    if (isExtraPlaneFinding(violation) && violation.failsStrict !== false) {
      violation.failsStrict = false;
      if (violation.severity === 'error') violation.severity = 'warning';
    }
  }
  return violations;
}

/** Stamp for extra-plane honesty: never one architecture score. */
export const MERGE_PLANES_DUAL_STAMP =
  'Structure = heuristics; invariants = catalog+coverage evidence (not business runtime); ArkRun = kernel usage + declarations (not a score). Extra planes never merge into one architecture score. Advisory ArkRules ≠ merge teeth. Advisory ArkRun ≠ merge teeth.';

export type MergePlanesArkRulesInput = {
  active: boolean;
  structureEnforced?: number;
  structureTotal?: number;
  structureAdvisory?: number;
  invariantEnforced?: number;
  invariantTotal?: number;
  invariantAdvisory?: number;
  covered?: number;
  uncovered?: number;
};

export type MergePlanesArkRunInput = {
  present: boolean;
  mode?: 'advisory' | 'enforced' | null;
  residualCount?: number;
};

export type MergePlanesHonesty = {
  layers: {
    role: 'inter-layer-edges';
    alwaysOnGate: true;
    note: string;
  };
  structureSensors: {
    role: 'intra-layer-heuristics';
    total: number;
    enforced: number;
    advisory: number;
    note: string;
  };
  invariants: {
    role: 'catalog-plus-coverage';
    total: number;
    enforced: number;
    advisory: number;
    covered: number;
    uncovered: number;
    note: string;
  };
  arkRun: {
    role: 'kernel-usage-and-declarations';
    present: boolean;
    mode: 'advisory' | 'enforced' | null;
    residualCount: number;
    extraMergeTeeth: boolean;
    note: string;
  };
  extraMergeTeeth: boolean;
  dualPlaneStamp: string;
  failMergeWhen: string;
  classificationGate?: {
    governedPercent: number | null;
    populatedLayerCount: number | null;
    floorPercent: number;
    allowsTeeth: boolean;
  };
};

function countOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Which extra planes can fail merge. Counts and stamps only — never a score.
 */
export function composeMergePlanesHonesty(input: {
  classification?: ExtraMergeTeethClassificationInput | null;
  arkRules?: MergePlanesArkRulesInput | null;
  arkRun?: MergePlanesArkRunInput | null;
} = {}): MergePlanesHonesty {
  const normalized = normalizeExtraMergeTeethClassification(input.classification);
  const governedPercent =
    typeof normalized.governedPercent === 'number' ? normalized.governedPercent : null;
  const populatedLayerCount =
    typeof normalized.populatedLayerCount === 'number' ? normalized.populatedLayerCount : null;
  const classificationKnown = governedPercent != null || populatedLayerCount != null;
  const classificationAllowsTeeth = extraMergeTeethAllowed(normalized);

  const arkRules = input.arkRules;
  const structureEnforced = countOrZero(arkRules?.structureEnforced);
  const structureTotal = countOrZero(arkRules?.structureTotal);
  const structureAdvisory =
    typeof arkRules?.structureAdvisory === 'number'
      ? countOrZero(arkRules.structureAdvisory)
      : Math.max(0, structureTotal - structureEnforced);
  const invariantEnforced = countOrZero(arkRules?.invariantEnforced);
  const invariantTotal = countOrZero(arkRules?.invariantTotal);
  const invariantAdvisory =
    typeof arkRules?.invariantAdvisory === 'number'
      ? countOrZero(arkRules.invariantAdvisory)
      : Math.max(0, invariantTotal - invariantEnforced);
  const arkRulesHasEnforced = structureEnforced > 0 || invariantEnforced > 0;

  const arkRunPresent = input.arkRun?.present === true;
  const arkRunMode =
    input.arkRun?.mode === 'enforced' || input.arkRun?.mode === 'advisory'
      ? input.arkRun.mode
      : null;
  const arkRunResidual = countOrZero(input.arkRun?.residualCount);
  const arkRunHasEnforced = arkRunPresent && arkRunMode === 'enforced';
  const arkRunTeeth = arkRunHasEnforced && classificationAllowsTeeth;

  const hasEnforcedTeeth = arkRulesHasEnforced || arkRunHasEnforced;
  const extraMergeTeeth = hasEnforcedTeeth && classificationAllowsTeeth;
  const teethDeferredForClassification =
    hasEnforcedTeeth && classificationKnown && !classificationAllowsTeeth;

  let failMergeWhen: string;
  if (extraMergeTeeth) {
    const extras: string[] = [];
    if (arkRulesHasEnforced) extras.push('enforced structure/invariant findings');
    if (arkRunHasEnforced) extras.push('enforced ArkRun skip findings');
    failMergeWhen = `Layer graph failures plus ${extras.join(' and ')} (advisory extras never fail merge alone).`;
  } else if (teethDeferredForClassification) {
    const which = [
      arkRulesHasEnforced ? 'ArkRules structure/invariant' : null,
      arkRunHasEnforced ? 'ArkRun' : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' and ');
    failMergeWhen = `Layer graph only — enforced ${which} findings are demoted under the teeth floor (need ≥${EXTRA_MERGE_TEETH_GOVERNED_FLOOR}% governed and ≥1 populated layer); they do not merge-block until classification is honest.`;
  } else {
    const arkRunBit = !arkRunPresent
      ? ' Absence of arkRun is silent.'
      : arkRunMode === 'advisory'
        ? ' Advisory ArkRun never merge-blocks.'
        : ' ArkRun extra is present but does not arm merge teeth.';
    failMergeWhen =
      'Layer graph only — no enforced ArkRules structure/invariant teeth on this tree. Advisory packs do not arm merge teeth.' +
      arkRunBit;
  }

  const out: MergePlanesHonesty = {
    layers: {
      role: 'inter-layer-edges',
      alwaysOnGate: true,
      note: 'Import/export layer graph — the default merge plane. Absent arkRules or arkRun changes nothing here.',
    },
    structureSensors: {
      role: 'intra-layer-heuristics',
      total: structureTotal,
      enforced: structureEnforced,
      advisory: structureAdvisory,
      note: 'Structure sensors are heuristics (prefer false negatives). Only mode:enforced fails merge; noisy sensors stay advisory by default. Advisory-only packs never add merge teeth (FG-ARKRULES-ADVISORY-ONLY).',
    },
    invariants: {
      role: 'catalog-plus-coverage',
      total: invariantTotal,
      enforced: invariantEnforced,
      advisory: invariantAdvisory,
      covered: countOrZero(arkRules?.covered),
      uncovered: countOrZero(arkRules?.uncovered),
      note: 'Invariants are catalog + coverage evidence, not a business runtime. Enforced + proven-uncovered fails merge; absence of enforced rules adds no extra teeth.',
    },
    arkRun: {
      role: 'kernel-usage-and-declarations',
      present: arkRunPresent,
      mode: arkRunMode,
      residualCount: arkRunResidual,
      extraMergeTeeth: arkRunTeeth,
      note: arkRunPresent
        ? arkRunMode === 'enforced'
          ? 'Enforced ArkRun arms extra merge teeth only when the layer plane is classified. Residual is a count, never a score.'
          : 'Advisory ArkRun never adds merge teeth and never flips valid. Residual is a count, never a score.'
        : 'Absence of arkRun is silent — Layers and ArkRules verdicts unchanged. The extra never becomes a score.',
    },
    extraMergeTeeth,
    dualPlaneStamp: MERGE_PLANES_DUAL_STAMP,
    failMergeWhen,
  };

  if (classificationKnown) {
    out.classificationGate = {
      governedPercent,
      populatedLayerCount,
      floorPercent: EXTRA_MERGE_TEETH_GOVERNED_FLOOR,
      allowsTeeth: classificationAllowsTeeth,
    };
  }
  return out;
}
