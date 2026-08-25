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

export function extraMergeTeethAllowed(
  classification?: ExtraMergeTeethClassification | null
): boolean {
  if (!classification) return true;
  const governed =
    typeof classification.governedPercent === 'number' ? classification.governedPercent : null;
  const populated =
    typeof classification.populatedLayerCount === 'number'
      ? classification.populatedLayerCount
      : null;
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
