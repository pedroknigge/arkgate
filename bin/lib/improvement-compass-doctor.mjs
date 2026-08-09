/**
 * Doctor adapter for the Domain improvement compass (notAScore projection).
 * Keeps doctor-plan.mjs inside its module budget; pure assembly only.
 */
import {
  buildImprovementCompass,
  formatImprovementCompassDoctorLines,
  primaryImprovementCompassNextAction,
} from './improvement-compass.mjs';

/**
 * @param {{
 *   designSmells?: object[],
 *   violations?: object[],
 *   designWeak?: boolean,
 *   physicalCohesion?: { findings?: object[] } | null,
 *   rulesUnderContract?: object | null,
 *   baselineExists?: boolean,
 *   baselineStale?: number | null,
 *   frozenResidual?: number | null,
 *   dirtyBaselineRisk?: boolean,
 *   ungovernedDirCount?: number,
 *   emptyLayerCount?: number,
 *   goldenPatternPresent?: boolean,
 *   arkRulesLoaded?: boolean,
 * }} input
 */
export function buildDoctorImprovementCompass(input = {}) {
  const violations = Array.isArray(input.violations) ? input.violations : [];
  const ruleId = (v) => String(v?.ruleId ?? v?.code ?? '');

  let cycleCount = 0;
  let peerIsolationCount = 0;
  let pureOrCapabilityResidual = 0;
  let forbiddenGlobalResidual = 0;
  let arkRulesStructureResidual = 0;

  for (const v of violations) {
    const id = ruleId(v).toUpperCase();
    if (!id) continue;
    if (id.includes('CYCLE') || id === 'CIRCULAR_DEPENDENCY') cycleCount += 1;
    if (id.includes('PEER_ISOLATION')) peerIsolationCount += 1;
    if (id === 'CAPABILITY_VIOLATION') pureOrCapabilityResidual += 1;
    if (id === 'FORBIDDEN_GLOBAL' || id.startsWith('FORBIDDEN_')) forbiddenGlobalResidual += 1;
    if (id.startsWith('ARKRULE_') || id === 'INVARIANT_UNCOVERED') arkRulesStructureResidual += 1;
  }

  const pcFindings = input.physicalCohesion?.findings;
  const physicalCohesionFindingCount = Array.isArray(pcFindings) ? pcFindings.length : 0;

  const arkRulesLoaded =
    input.arkRulesLoaded === true ||
    input.rulesUnderContract?.active === true ||
    (typeof input.rulesUnderContract?.structureRules === 'number' &&
      input.rulesUnderContract.structureRules > 0);

  return buildImprovementCompass({
    designSmells: Array.isArray(input.designSmells) ? input.designSmells : [],
    violations: violations.map((v) => ({
      ruleId: ruleId(v) || undefined,
      message: typeof v?.message === 'string' ? v.message : undefined,
      file: typeof v?.file === 'string' ? v.file : typeof v?.path === 'string' ? v.path : undefined,
      fromLayer: v?.fromLayer,
      toLayer: v?.toLayer,
      failsStrict: v?.failsStrict,
      typeOnly: v?.typeOnly === true || v?.namedBindingsTypeOnly === true || undefined,
    })),
    cycleCount,
    peerIsolationCount,
    physicalCohesionFindingCount,
    arkRulesLoaded,
    arkRulesStructureResidual,
    designWeak: input.designWeak === true,
    baselineExists: input.baselineExists === true,
    baselineStale: input.baselineStale ?? null,
    frozenResidual: input.frozenResidual ?? null,
    dirtyBaselineRisk: input.dirtyBaselineRisk === true,
    pureOrCapabilityResidual,
    forbiddenGlobalResidual,
    ungovernedDirCount: Number(input.ungovernedDirCount) || 0,
    emptyLayerCount: Number(input.emptyLayerCount) || 0,
    goldenPatternPresent: input.goldenPatternPresent === true,
    // Doctor path is TypeScript-oriented (ArkGate product surface).
    stackKind: 'typescript',
  });
}

export {
  formatImprovementCompassDoctorLines,
  primaryImprovementCompassNextAction,
};

/**
 * Human doctor section (never a score bar).
 * @param {import('./improvement-compass.mjs').ImprovementCompass} compass
 * @param {{ line: Function, warn: string, ok: string, color: { bold: Function } }} io
 */
export function printImprovementCompassSection(compass, io) {
  const { line, warn, ok, color } = io;
  console.log('');
  console.log(color.bold('Improvement compass (not a score)'));
  const mark = compass.topResidual.length > 0 ? warn : ok;
  for (const text of formatImprovementCompassDoctorLines(compass)) {
    line(mark, text);
  }
}
