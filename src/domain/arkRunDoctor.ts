/**
 * Doctor / status / report ArkRun section (RN08). Always notAScore.
 * Residual is a unique ARKRUN finding-id count — never a score or LLM verdict.
 */
import {
  composeMergePlanesHonesty,
  extraMergeTeethAllowed,
  isArkRunRuleId,
  type ExtraMergeTeethClassificationInput,
  type MergePlanesHonesty,
} from './extraMergeTeeth';

export const ARK_RUN_DOCTOR_SCHEMA_VERSION = '1.0' as const;

const RESIDUAL_RULE_CAP = 12;

export type ArkRunDoctorMode = 'advisory' | 'enforced';

export type ArkRunDoctorResidual = {
  count: number;
  ruleIds: string[];
};

export type ArkRunDoctorSection = {
  schemaVersion: typeof ARK_RUN_DOCTOR_SCHEMA_VERSION;
  notAScore: true;
  active: boolean;
  mode: ArkRunDoctorMode | null;
  compositionRoots: number;
  managedLayers: number;
  requireDeclarations: boolean | null;
  residual: ArkRunDoctorResidual;
  extraMergeTeeth: boolean;
  failMergeWhen: string;
  note: string;
  mergePlanes: MergePlanesHonesty;
};

export type ArkRunStatusSlice = {
  notAScore: true;
  present: boolean;
  mode: ArkRunDoctorMode | null;
  extraMergeTeeth: boolean;
  residual: number | null;
};

export type ArkRunDoctorConfig = {
  mode?: string;
  compositionRoots?: readonly string[];
  managedLayers?: readonly string[];
  requireDeclarations?: boolean;
};

function closedMode(value: unknown): ArkRunDoctorMode | null {
  return value === 'enforced' || value === 'advisory' ? value : null;
}

function uniqueArkRunRuleIds(findings: readonly { ruleId?: unknown }[] | null | undefined): string[] {
  const seen = new Set<string>();
  if (!Array.isArray(findings)) return [];
  for (const finding of findings) {
    const id = finding?.ruleId;
    if (typeof id !== 'string' || !isArkRunRuleId(id) || seen.has(id)) continue;
    seen.add(id);
  }
  return [...seen].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function extraFromConfig(
  arkRun?: ArkRunDoctorConfig | null
): { present: boolean; mode: ArkRunDoctorMode | null; roots: number; layers: number; requireDeclarations: boolean | null } {
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
export function summarizeArkRunSection(input: {
  arkRun?: ArkRunDoctorConfig | null;
  findings?: readonly { ruleId?: unknown }[] | null;
  classification?: ExtraMergeTeethClassificationInput | null;
  arkRules?: {
    active?: boolean;
    structureEnforced?: number;
    structureTotal?: number;
    structureAdvisory?: number;
    invariantEnforced?: number;
    invariantTotal?: number;
    invariantAdvisory?: number;
    covered?: number;
    uncovered?: number;
  } | null;
} = {}): ArkRunDoctorSection {
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

  let note: string;
  if (!extra.present) {
    note =
      'Absence of arkRun is silent — Layers and ArkRules verdicts unchanged. Not a score.';
  } else if (extra.mode === 'advisory') {
    note =
      'Advisory ArkRun residual only — never flips valid or --strict-merge. Residual is a finding-id count, never a score.';
  } else if (extraMergeTeeth) {
    note =
      'Enforced ArkRun is on the extra merge plane. Residual is a finding-id count, never a score.';
  } else {
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
export function projectStatusArkRun(input: {
  present?: boolean;
  mode?: string | null;
  extraMergeTeeth?: boolean;
  residual?: number | null;
} = {}): ArkRunStatusSlice {
  const present = input.present === true;
  const mode = closedMode(input.mode);
  const residualRaw = input.residual;
  let residual: number | null = null;
  if (typeof residualRaw === 'number' && Number.isFinite(residualRaw) && residualRaw >= 0) {
    residual = Math.floor(residualRaw);
  }
  if (!present) residual = residual == null ? 0 : residual;
  return {
    notAScore: true,
    present,
    mode: present ? mode : null,
    extraMergeTeeth: present && mode === 'enforced' && input.extraMergeTeeth === true,
    residual,
  };
}

export function formatArkRunDoctorLines(section: ArkRunDoctorSection): string[] {
  if (!section || section.notAScore !== true) return [];
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
    const more =
      section.residual.count > section.residual.ruleIds.length
        ? ` (+${section.residual.count - section.residual.ruleIds.length} more)`
        : '';
    lines.push(`Residual: ${shown}${more}`);
  } else {
    lines.push(
      'Residual: none on this scan (not a score — green extras ≠ finished kernel wiring).'
    );
  }
  if (section.failMergeWhen) lines.push(section.failMergeWhen);
  return lines;
}
