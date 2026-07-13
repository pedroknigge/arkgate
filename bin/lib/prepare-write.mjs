/**
 * W2 — ark_prepare_write composition helpers.
 *
 * Place + constrain + validate + autoPatch + judgmentBrief + content identity.
 * Pure-ish: no second architecture contract — callers pass placement + validate.
 */
import crypto from 'node:crypto';
import { validateWithAutoPatch } from './auto-patch.mjs';
import { classifyRemediation, enrichViolationWithFixClass } from './remediation.mjs';

/**
 * Stable content identity for host commit / cache keys.
 * @param {string} source
 * @returns {{ contentHash: string, byteLength: number }}
 */
export function contentIdentity(source) {
  const text = typeof source === 'string' ? source : '';
  const contentHash = `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
  return { contentHash, byteLength: Buffer.byteLength(text, 'utf8') };
}

/**
 * One judgment decision for the agent when autoPatch is absent or insufficient.
 * @param {Array<object>} violations
 * @returns {null | { fixClass: string, decision: string, remediationClass: string, remediationKind?: string }}
 */
export function buildJudgmentBrief(violations) {
  if (!Array.isArray(violations) || violations.length === 0) return null;
  for (const v of violations) {
    const ruleId = v.ruleId || v.code;
    const shaped = {
      ruleId,
      typeOnly: v.typeOnly ?? v.details?.typeOnly,
      sourcePureTypeModule: v.sourcePureTypeModule,
      targetTypeOnlyExports: v.targetTypeOnlyExports,
      namedBindingsTypeOnly: v.namedBindingsTypeOnly,
      peerIsolation: v.peerIsolation ?? v.details?.peerIsolation,
      edgeKind: v.edgeKind ?? v.details?.importKind,
      fromLayer: v.fromLayer,
      toLayer: v.toLayer,
      target: v.target,
      message: v.message,
    };
    const verdict = classifyRemediation(shaped);
    if (verdict.class === 'mechanical-safe') continue;
    const enriched = enrichViolationWithFixClass(shaped);
    return {
      fixClass: enriched.fixClass,
      decision: enriched.enthusiastHint,
      remediationClass: verdict.class,
      ...(verdict.remediationKind ? { remediationKind: verdict.remediationKind } : {}),
    };
  }
  // All mechanical-safe or unclassifiable — still offer first enriched hint
  const first = violations[0];
  const ruleId = first.ruleId || first.code;
  const shaped = { ...first, ruleId };
  const enriched = enrichViolationWithFixClass(shaped);
  const verdict = classifyRemediation(shaped);
  return {
    fixClass: enriched.fixClass,
    decision: enriched.enthusiastHint,
    remediationClass: verdict.class,
    ...(verdict.remediationKind ? { remediationKind: verdict.remediationKind } : {}),
  };
}

/**
 * Compose placement + write-boundary validation into one prepare_write result.
 *
 * @param {{
 *   source: string,
 *   placement: object,
 *   root: string,
 *   ts: object,
 *   validate: (source: string) => { valid: boolean, violations?: any[] },
 *   resolveTargetAbs?: Function,
 * }} opts
 */
export function composePrepareWrite(opts) {
  const { source, placement, root, ts, validate, resolveTargetAbs } = opts;
  if (typeof source !== 'string') {
    return {
      ok: false,
      error: 'source is required (string)',
    };
  }
  const identity = contentIdentity(source);
  const filePath = placement?.filePath;
  const gate = validateWithAutoPatch({
    source,
    filePath,
    root,
    ts,
    validate,
    resolveTargetAbs,
  });

  // judgmentBrief when invalid and no mechanical autoPatch (agent must decide).
  // When autoPatch is present, omit brief — host should apply the patch first.
  const judgment =
    !gate.valid && !gate.autoPatch ? buildJudgmentBrief(gate.violations) : null;

  return {
    ok: true,
    filePath: placement?.filePath ?? null,
    layer: placement?.layer ?? null,
    governed: placement?.governed,
    proposed: placement?.proposed,
    mayImport: placement?.mayImport,
    mustNotImport: placement?.mustNotImport,
    forbiddenGlobals: placement?.forbiddenGlobals ?? [],
    ...(placement?.mayImportInfrastructure ? { mayImportInfrastructure: true } : {}),
    ...(placement?.suggestedLayers ? { suggestedLayers: placement.suggestedLayers } : {}),
    ...(placement?.message ? { placementMessage: placement.message } : {}),
    ...(placement?.note ? { placementNote: placement.note } : {}),
    ...(placement?.description ? { description: placement.description } : {}),
    // Q03: pass through golden pattern from ark_place (advisory; absent is normal).
    ...(placement?.goldenPattern ? { goldenPattern: placement.goldenPattern } : {}),
    valid: gate.valid,
    violations: gate.violations,
    ...(gate.autoPatch ? { autoPatch: gate.autoPatch } : {}),
    ...(judgment ? { judgmentBrief: judgment } : {}),
    contentHash: identity.contentHash,
    byteLength: identity.byteLength,
    ...(gate.autoPatch
      ? {
          autoPatchContentHash: contentIdentity(gate.autoPatch.source).contentHash,
        }
      : {}),
  };
}
