/** Coverage, plan, and doctor CLI surfaces (roadmap #11). */
import fs from 'node:fs';
import path from 'node:path';
import {
  arkCommand,
  buildArchitectureRecommendation,
  classifyRemediation,
  layerForFile,
  resolveOperatingMode,
  shouldShowNewHereNudge,
} from '../ark-shared.mjs';
import * as arkShared from '../ark-shared.mjs';
import { summarizeRulesUnderContract } from './rules-under-contract.mjs';
import { describePackageVersionDualTruth } from './field-install.mjs';
import { detectAgentHomeGaps } from './agent-homes.mjs';
import { operatingModeTitle } from './product-copy.mjs';
import { collectDoctorNextActions } from './doctor-next-actions.mjs';
export { summarizeRulesUnderContract };

/** Optional S3 dual-match classifier when ark-shared exports it (soft dep for S5 landing). */
const matchingLayersForRelativePath =
  typeof arkShared.matchingLayersForRelativePath === 'function'
    ? arkShared.matchingLayersForRelativePath
    : null;
import {
  collectAdoptionGaps,
  detectSkillGaps,
  detectCodexHomeGap,
  codexConcernIsActive,
  detectWritePathCapabilities,
  missingGates,
  staleRunnerGateFiles,
} from './agent-gates.mjs';
import {
  baselineOccurrenceKeys,
  readBaseline,
  summarizeViolations,
  violationEdge,
} from './violations.mjs';
import { buildUnclassifiedSuggestions } from './suggestions.mjs';
import {
  detectDesignSmells,
  buildPatternBetsFromSmells,
  summarizeDesignFitness,
  isDesignWeak,
} from './design-smells.mjs';
import {
  buildPostGreenNextAction,
  isDoctorHealthyNothingToDo,
  DESIGN_WEAK_HONESTY_FLAGS,
} from './post-green-path.mjs';
import {
  buildCoverageHonesty,
  computeDoctorEnforcementHonesty,
} from './enforcement-honesty.mjs';
import {
  computePureLayerOptInNudge,
  loadGoldenPattern,
  summarizeGoldenPattern,
} from './golden-pattern.mjs';
import { summarizePilotLoop } from './pilot-loop.mjs';
import { computeDoctorAdvisories } from './doctor-advisories.mjs';
import { printParseHealthSection } from './parse-health.mjs';
import { ANALYSIS_COMPLETENESS, analysisIncompleteStatement, normalizeAnalysisCompleteness } from './analysis-completeness.mjs';
import { buildDoctorImprovementCompass } from './improvement-compass-doctor.mjs';
import { buildDeepModuleCoachAdvisory } from './deep-module-coach.mjs';
import { writeCiMergeBoundary } from './ci-merge-boundary.mjs';
import {
  classifyAdopted,
  githubEvidenceForCiMergeBoundary,
  readAdoptionStance,
  NOT_ADOPTED_NEXT_ACTION,
} from './adoption-stance.mjs';

const color = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
function normalize(value) {
  return String(value).split(path.sep).join('/');
}

export function computeCoverage(root, config, files, rules) {
  const layers = config.layers ?? [];
  const counts = new Map(layers.map((layer) => [layer.name, 0]));
  const unclassified = [];
  const dualMembership = [];
  for (const file of files) {
    const rel = normalize(path.relative(root, file));
    const layer = layerForFile(root, file, layers);
    if (layer && counts.has(layer)) counts.set(layer, counts.get(layer) + 1);
    else unclassified.push(rel);

    // P0A-DUAL-MATCH: surface files that match 2+ layers (winner still single-valued).
    // Soft: classifier is S3; S5 landing must not hard-require it.
    if (matchingLayersForRelativePath) {
      try {
        const hits = matchingLayersForRelativePath(rel, layers);
        if (hits.length > 1) {
          dualMembership.push({
            file: rel,
            layers: hits.map((h) => h.layer),
            winner: layer ?? hits[0]?.layer ?? null,
            scores: Object.fromEntries(hits.map((h) => [h.layer, h.score])),
          });
        }
      } catch {
        /* pure classifier only — ignore if unavailable */
      }
    }
  }
  unclassified.sort();
  dualMembership.sort((a, b) => a.file.localeCompare(b.file));
  const layerRows = layers.map((layer) => ({
    name: layer.name,
    patterns: layer.patterns ?? [],
    files: counts.get(layer.name) ?? 0,
  }));
  // A layer whose patterns match zero files is dead config — it enforces nothing, usually a
  // wrong glob (the #1 monorepo mistake). A layer with no rule edge can import anything.
  const emptyLayers = layerRows.filter((row) => row.files === 0).map((row) => row.name);
  const layersWithoutRules = layerRows
    .map((row) => row.name)
    .filter((name) => !rules.some((rule) => rule.from === name || rule.to === name));
  const classifiedFiles = files.length - unclassified.length;
  // Empty scope is NOT "100% governed" — that was a false-green for monorepos/mis-includes
  // (0/0 → ENFORCE). Zero files means the contract is not checking anything yet.
  const fraction = files.length > 0 ? classifiedFiles / files.length : 0;
  return {
    include: config.include ?? [],
    totalFiles: files.length,
    emptyScope: files.length === 0,
    governed: { classifiedFiles, totalFiles: files.length, percent: Math.round(fraction * 100) },
    layers: layerRows,
    unclassified: { count: unclassified.length, files: unclassified },
    suggestions: buildUnclassifiedSuggestions(unclassified),
    emptyLayers,
    layersWithoutRules,
    dualMembership: {
      count: dualMembership.length,
      // Cap samples so doctor/JSON stay bounded on large trees.
      samples: dualMembership.slice(0, 25),
      note:
        dualMembership.length > 0
          ? `${dualMembership.length} file(s) match multiple layers; classification uses highest path-anchored specificity (winner listed). Review overlapping globs if the winner looks wrong.`
          : null,
    },
  };
}

export function runCoverage(root, config, files, rules, asJson) {
  const cov = computeCoverage(root, config, files, rules);
  if (asJson) {
    console.log(JSON.stringify({ ok: true, coverage: cov }, null, 2));
    return;
  }
  const { governed, layers: layerRows, suggestions, layersWithoutRules } = cov;
  const classifiedFiles = governed.classifiedFiles;
  const unclassified = cov.unclassified.files;

  const nameWidth = Math.max(
    'Layer'.length,
    '(unclassified)'.length,
    ...layerRows.map((row) => row.name.length)
  );
  const pad = (value) => value.padEnd(nameWidth);
  console.log(`Ark coverage (include: ${(config.include ?? []).join(', ') || '.'}):`);
  console.log('');
  console.log(`  ${pad('Layer')}  Files`);
  for (const row of layerRows) {
    const flag = row.files === 0 ? '   (pattern matches nothing)' : '';
    console.log(`  ${pad(row.name)}  ${String(row.files).padStart(5)}${flag}`);
  }
  console.log(`  ${pad('(unclassified)')}  ${String(unclassified.length).padStart(5)}`);
  console.log('');
  console.log(
    `${files.length} source file(s) in scope; ${unclassified.length} not matched by any layer.`
  );
  console.log(`Governed: ${governed.percent}% (${classifiedFiles}/${files.length} files).`);
  if (files.length > 0 && governed.percent < 50) {
    console.log('');
    console.log(
      `⚠ Ark governs a MINORITY of your code (${governed.percent}%). A green check on ~${governed.percent}%`
    );
    console.log(
      '  is worse than no gate — it looks safe while most code is ungoverned. Classify the'
    );
    console.log('  directories below before treating green as enforcement.');
  }
  if (suggestions.length > 0) {
    console.log('');
    console.log('Ungoverned directories (proposed layer — from the 11-layer profile + presets):');
    for (const s of suggestions) {
      const count = `(${s.files})`.padStart(6);
      if (s.unrecognized) {
        console.log(`  ${count}  ${s.dir}/  — unrecognized, you classify`);
      } else {
        const alt = s.alternatives ? ` (or ${s.alternatives.join(' / ')})` : '';
        console.log(`  ${count}  ${s.dir}/  → ${s.layer}${alt}`);
      }
    }
    console.log('');
    console.log('Apply these via /ark-adopt (adds the layer patterns to ark.config.json).');
  }
  if (layersWithoutRules.length > 0) {
    console.log('');
    console.log(`Layers with no rule edge (can import anything): ${layersWithoutRules.join(', ')}`);
  }
  if (cov.dualMembership?.count > 0) {
    console.log('');
    console.log(
      `Dual-match: ${cov.dualMembership.count} file(s) match multiple layers (winner by path-anchored specificity).`
    );
    for (const sample of (cov.dualMembership.samples ?? []).slice(0, 5)) {
      console.log(
        `  ${sample.file} → ${sample.winner} (also: ${sample.layers.filter((l) => l !== sample.winner).join(', ')})`
      );
    }
    if (cov.dualMembership.count > 5) {
      console.log(`  … +${cov.dualMembership.count - 5} more (see --coverage --json dualMembership)`);
    }
  }
}

// --doctor: one consolidated health view — coverage, violations, gates, skills, baseline,
// and command runners — each with the exact command to fix it. Folds the data the other
// modes already produce so a team sees "what state is my Ark adoption in?" at a glance.
/**
 * @param {string} root
 * @param {object[]} activeViolations
 * @param {number|null} [governedPercent]
 * @param {number|null} [totalFiles]
 * @param {object} [options]
 * @param {object[]} [options.designSmells]
 * @param {object[]} [options.patternBets]
 * @param {object} [options.config]
 * @param {string[]} [options.files]
 * @param {object} [options.coverage]
 */
export function buildRemediationPlan(
  root,
  activeViolations,
  governedPercent = null,
  totalFiles = null,
  options = {}
) {
  const completeness = normalizeAnalysisCompleteness(options.completeness);
  const governedLow = governedPercent != null && governedPercent < 50;
  const emptyScope = totalFiles === 0;
  const notHonestlyEnforced = governedLow || emptyScope || completeness !== ANALYSIS_COMPLETENESS.complete;
  const steps = activeViolations.map((v, index) => {
    const verdict = classifyRemediation(v);
    return {
      id: `${v.ruleId}:${v.file}:${v.line ?? 0}:${index}`,
      class: verdict.class,
      confidence: verdict.confidence,
      rationale: verdict.rationale,
      ruleId: v.ruleId,
      edge: violationEdge(v),
      file: v.file,
      ...(v.line ? { line: v.line } : {}),
      ...(v.target ? { target: v.target } : {}),
      ...(v.typeOnly ? { typeOnly: true } : {}),
      ...(v.targetTypeOnlyExports ? { targetTypeOnlyExports: true } : {}),
      ...(v.sourcePureTypeModule ? { sourcePureTypeModule: true } : {}),
      ...(v.namedBindingsTypeOnly ? { namedBindingsTypeOnly: true } : {}),
      ...(v.edgeKind ? { edgeKind: v.edgeKind } : {}),
      ...(verdict.remediationKind ? { remediationKind: verdict.remediationKind } : {}),
    };
  });
  // Order: value edges first (runtime coupling), then type-only placement debt as a group,
  // and within each bucket: mechanical-safe → judgment → deferred (NEW-TYPEONLY-VOLUME).
  const rank = { 'mechanical-safe': 0, judgment: 1, deferred: 2 };
  steps.sort((a, b) => {
    const aType = a.typeOnly || a.namedBindingsTypeOnly ? 1 : 0;
    const bType = b.typeOnly || b.namedBindingsTypeOnly ? 1 : 0;
    if (aType !== bType) return aType - bType;
    return rank[a.class] - rank[b.class];
  });
  const countOf = (cls) => steps.filter((s) => s.class === cls).length;
  const counts = {
    mechanicalSafe: countOf('mechanical-safe'),
    judgment: countOf('judgment'),
    deferred: countOf('deferred'),
  };

  // Plan B (pattern bets) — never mechanical-safe; additive within major (P03).
  let designSmells = options.designSmells;
  if (!designSmells && options.config && options.files) {
    designSmells = detectDesignSmells(
      root,
      options.config,
      options.files,
      options.coverage ?? null
    );
  }
  designSmells = designSmells ?? [];
  const patternBets =
    options.patternBets ?? buildPatternBetsFromSmells(designSmells);
  // P1-type: goal.met uses blocking (value) edges only; type-only placement debt still listed.
  const blockingCount =
    typeof options.blockingViolationCount === 'number'
      ? options.blockingViolationCount
      : activeViolations.filter((v) => v.failsStrict !== false).length;
  const typeOnlyCount = activeViolations.filter(
    (v) => v.typeOnly || v.namedBindingsTypeOnly
  ).length;
  const edgesMet = blockingCount === 0 && !notHonestlyEnforced;
  const designWeak = isDesignWeak(designSmells, {
    activeViolations: blockingCount,
    governedPercent,
    totalFiles,
  });
  // Q04 — single next pilot extraction card (one at a time → re-doctor).
  const pilotLoop = summarizePilotLoop({
    designWeak,
    patternBets,
    designSmells,
  });
  const coverageHonesty = buildCoverageHonesty({
    percent: governedPercent,
    totalFiles,
    emptyScope,
  });

  let statement =
    blockingCount > 0
      ? `Resolve ${blockingCount} architecture violation(s) without weakening the contract.` +
        (typeOnlyCount > 0
          ? ` (${typeOnlyCount} type-only placement debt also reported — SharedTypes / owning layer.)`
          : '')
      : typeOnlyCount > 0
        ? `No blocking value edges — ${typeOnlyCount} type-only placement debt remain (prefer SharedTypes / owning layer; not runtime coupling).`
        : emptyScope
          ? 'No source files matched the contract include paths — this "clean" result checks nothing. Fix include/layers (monorepo → apps/packages, or /ark-adopt) so Ark has real code to govern.'
          : governedLow
            ? `No violations — but Ark governs only ${governedPercent}% of your code, so this "clean" result checks almost nothing. Classify the rest (ark-check --coverage, then /ark-adopt) so it's actually enforced.`
            : 'No active violations — the architecture already meets its contract.';
  if (designWeak) {
    statement =
      'No active import-rule violations — imports check out, but design smells remain (leftover design work). Shape work is plan B only; not healthy finished.';
  }
  if (completeness !== ANALYSIS_COMPLETENESS.complete) statement = analysisIncompleteStatement(completeness);

  // NEW-TYPEONLY-VOLUME: group type-only steps for plan messaging (value first).
  const typeOnlySteps = steps.filter((s) => s.typeOnly || s.namedBindingsTypeOnly);
  const valueSteps = steps.filter((s) => !(s.typeOnly || s.namedBindingsTypeOnly));
  const typeOnlyGroup =
    typeOnlySteps.length > 0
      ? {
          count: typeOnlySteps.length,
          valueCount: valueSteps.length,
          guidance:
            'Type-only placement debt is non-blocking. Prefer a SharedTypes (or owning) layer both sides may import; fix value runtime coupling first. See templates/layers/shared-types.starter.json.',
          stepIds: typeOnlySteps.map((s) => s.id).slice(0, 40),
        }
      : null;

  return {
    version: '1',
    completeness,
    goal: {
      statement,
      // Edge remediation termination (Phase H). Design-weak does NOT flip met false
      // (would break loop semantics) — it is reported separately for honesty.
      met: edgesMet,
      designWeak,
      ...(designWeak
        ? {
            designWeakLabel:
              'Design-weak — use patternBets / dual-plan B; never auto-apply as mechanical-safe',
            ...DESIGN_WEAK_HONESTY_FLAGS,
          }
        : {}),
      ...(governedPercent != null ? { governedPercent } : {}),
      ...(totalFiles != null ? { totalFiles } : {}),
      ...(emptyScope ? { emptyScope: true } : {}),
      activeViolations: activeViolations.length,
      autoApplicable: counts.mechanicalSafe,
      needsDecision: counts.judgment,
      deferred: counts.deferred,
      patternBetCount: patternBets.length,
      ...(typeOnlyCount > 0
        ? { typeOnlyPlacementDebt: typeOnlyCount, typeOnlyNonBlocking: true }
        : {}),
    },
    counts,
    steps,
    ...(typeOnlyGroup ? { typeOnlyGroup } : {}),
    // Additive: pattern evolution bets derived from design smells (never auto).
    patternBets,
    designSmells,
    // Q04: one-pilot loop step (extraction card); never mechanical-safe.
    pilotLoop,
    coverageHonesty,
  };
}

// `--plan`: print the classified remediation plan. Dual-focus output — a one-line headline
// anyone can read, then the per-step detail a developer acts on. Read-only.
/**
 * @param {object} [options] optional { config, files, coverage, designSmells, patternBets }
 */
export function runPlan(
  root,
  activeViolations,
  asJson,
  governedPercent = null,
  totalFiles = null,
  options = {}
) {
  const plan = buildRemediationPlan(
    root,
    activeViolations,
    governedPercent,
    totalFiles,
    options
  );
  // Honesty: a zero-violation plan with almost nothing governed is NOT "ok".
  // design-weak still ok:true for edge goal.met, but JSON carries designWeak + patternBets.
  const planOk = plan.goal.met === true;
  if (asJson) {
    console.log(JSON.stringify({ ok: planOk, plan }, null, 2));
    return plan;
  }
  console.log(color.bold(`Ark plan — ${path.basename(path.resolve(root)) || '.'}`));
  console.log('');
  console.log(plan.goal.statement);
  if (plan.goal.designWeak) {
    console.log(
      color.yellow(
        `  Design-weak — ${plan.patternBets?.length ?? 0} pattern bet(s) (never auto-apply)`
      )
    );
  }
  if (governedPercent != null) {
    const pctLabel =
      governedPercent < 50
        ? color.yellow(`Governed: ${governedPercent}% of in-scope files`)
        : color.dim(`Governed: ${governedPercent}% of in-scope files`);
    console.log(pctLabel);
  }
  if (plan.patternBets?.length && activeViolations.length === 0) {
    console.log('');
    console.log(color.bold('Pattern bets (B) — judgment only'));
    for (const bet of plan.patternBets.slice(0, 5)) {
      console.log(`  [decide] ${bet.smellId}  ${color.dim(bet.pilot)}`);
      console.log(color.dim(`           success: ${bet.successSignal}`));
    }
  }
  // Q04 — single next pilot (one at a time → re-doctor).
  if (plan.pilotLoop?.active && plan.pilotLoop.nextPilot) {
    console.log('');
    console.log(color.bold('Next pilot (one at a time → re-doctor)'));
    const np = plan.pilotLoop.nextPilot;
    console.log(`  Pilot: ${np.pilotTarget || np.pilot}  [${np.smellId}]`);
    console.log(color.dim(`  Move: ${np.move}`));
    console.log(color.dim(`  Success: ${np.successSignal}`));
    console.log(color.dim(`  Kill-switch: ${np.killSwitch}`));
    console.log(
      color.dim(
        '  Apply this ONE pilot, then ark-check --doctor — never multi-pilot batch; never mechanical-safe.'
      )
    );
  }
  if (activeViolations.length === 0) return plan;
  console.log('');
  console.log(
    `  ${color.green(`${plan.counts.mechanicalSafe} safe to auto-apply`)} · ` +
      `${color.yellow(`${plan.counts.judgment} need your decision`)} · ` +
      `${color.dim(`${plan.counts.deferred} deferred`)}`
  );
  if (plan.typeOnlyGroup?.count) {
    console.log('');
    console.log(
      color.dim(
        `Type-only group: ${plan.typeOnlyGroup.count} placement-debt step(s) after ${plan.typeOnlyGroup.valueCount} value step(s) — non-blocking; SharedTypes starter optional.`
      )
    );
  }
  console.log('');
  const tag = {
    'mechanical-safe': color.green('auto  '),
    judgment: color.yellow('decide'),
    deferred: color.dim('defer '),
  };
  let typeOnlyHeaderPrinted = false;
  for (const step of plan.steps) {
    if ((step.typeOnly || step.namedBindingsTypeOnly) && !typeOnlyHeaderPrinted) {
      console.log(color.dim('  --- type-only placement debt (non-blocking) ---'));
      typeOnlyHeaderPrinted = true;
    }
    const where = `${step.file}${step.line ? `:${step.line}` : ''}`;
    console.log(`  [${tag[step.class]}] ${step.edge}  ${color.dim(where)}`);
    console.log(color.dim(`           ${step.rationale}`));
  }
  console.log('');
  console.log(
    color.dim(
      'Plan only — no files changed. "auto" = an agent can safely apply it; "decide" = your call. patternBets are never auto.'
    )
  );
  return plan;
}

export function runDoctor(root, config, files, rules, violations, asJson, options = {}) {
  const completeness = normalizeAnalysisCompleteness(options.completeness);
  const analysisComplete = completeness === ANALYSIS_COMPLETENESS.complete;
  const cov = computeCoverage(root, config, files, rules);
  const summary = summarizeViolations(violations);
  const configPath = options.configPath ?? path.join(root, 'ark.config.json');
  const configMissing = options.configMissing ?? !fs.existsSync(configPath);
  const showNewHere = shouldShowNewHereNudge(root, configPath, cov.governed.percent, configMissing);
  let recommendation;
  if (showNewHere) {
    try {
      recommendation = buildArchitectureRecommendation(root);
    } catch {
      recommendation = undefined;
    }
  }
  const gatesMissing = missingGates(root);
  const skillGaps = detectSkillGaps(root);
  const agentHomeGaps = detectAgentHomeGaps(root);
  // Dual-truth: CLI version vs package.json pin (field residual after upgrade --no-install).
  const packageVersionTruth = describePackageVersionDualTruth(root);
  const staleRunners = staleRunnerGateFiles(root);
  const adoption = collectAdoptionGaps(root, config, cov);
  // Prefer writePath from adoption (same detector); recompute only if missing (tests/stubs).
  const writePath = adoption.writePath ?? detectWritePathCapabilities(root);
  let ciMergeBoundary = null;
  try {
    ciMergeBoundary = writeCiMergeBoundary(root, {
      writePath,
      github: githubEvidenceForCiMergeBoundary(adoption, writePath),
    });
  } catch {
    ciMergeBoundary = null;
  }
  const baseline = readBaseline(root, '.ark-baseline.json');
  const occurrenceKeys = baselineOccurrenceKeys(violations);
  const currentKeys = new Set(occurrenceKeys);
  const suppressed = baseline.exists
    ? occurrenceKeys.filter((key) => baseline.keys.has(key)).length
    : 0;
  const staleBaseline = baseline.exists
    ? [...baseline.keys].filter((key) => !currentKeys.has(key)).length
    : 0;
  const activeCount = violations.length - suppressed;
  // productHonesty: blocking = failsStrict !== false only (type-only placement debt excluded).
  const blockingActive = violations.filter((v, index) => {
    if (v.failsStrict === false) return false;
    if (!baseline.exists) return true;
    return !baseline.keys.has(occurrenceKeys[index]);
  }).length;
  const emptyScopeEarly = cov.emptyScope === true || cov.governed.totalFiles === 0;
  const presentationRowEarly = cov.layers.find((r) => r.name === 'PresentationAdapters');
  const totalFilesEarly = cov.governed.totalFiles || 0;
  const operatingMode = resolveOperatingMode({
    governedPercent: emptyScopeEarly ? 0 : cov.governed.percent,
    // planMet uses blocking only; type-only placement debt alone must not force ADAPT.
    planMet:
      analysisComplete &&
      blockingActive === 0 &&
      !emptyScopeEarly &&
      cov.governed.percent >= 50,
    mature: cov.governed.totalFiles >= 150,
    totalFiles: cov.governed.totalFiles,
    emptyLayers: cov.emptyLayers,
    coreOptionalWithFiles: adoption.coreOptional?.length ?? 0,
    presentationShare:
      totalFilesEarly > 0 && presentationRowEarly
        ? presentationRowEarly.files / totalFilesEarly
        : null,
  });
  const designSmells = detectDesignSmells(root, config, files, cov);
  const observedDesignFitness = summarizeDesignFitness(designSmells, {
    activeViolations: blockingActive,
    governedPercent: cov.governed.percent,
    totalFiles: cov.governed.totalFiles,
    operatingMode,
  });
  const designFitness = analysisComplete ? observedDesignFitness : {
    ...observedDesignFitness, status: 'analysis-incomplete', designWeak: false, label: 'Design fitness not verified — analysis is incomplete; observed smells remain advisory.',
  };
  // Q01 — single post-green door when design-weak (map → B; no skill shopping).
  const postGreenPath = buildPostGreenNextAction(designFitness);
  // Q03 — optional golden pattern for NEW code (advisory; never clears design-weak).
  const goldenLoad = loadGoldenPattern(root);
  const goldenPattern = summarizeGoldenPattern(goldenLoad);
  // Y06 — pure-layer opt-in when golden names pure modules but no pure:true layer.
  const pureLayerOptIn = computePureLayerOptInNudge(config, goldenLoad);
  // Q04 — one next pilot (extraction card) when design-weak.
  const patternBetsForLoop = buildPatternBetsFromSmells(designSmells);
  const pilotLoop = summarizePilotLoop({
    designWeak: designFitness.designWeak,
    patternBets: patternBetsForLoop,
    designSmells,
  });
  const doctorAdvisories = computeDoctorAdvisories(root, config, cov, rules, files, options.ts, options.parseHealth);
  // AR12 — compute once for JSON + product honesty + human lines.
  // P1M: classification gate on extraMergeTeeth (no teeth at empty graph).
  const rulesUnderContract = summarizeRulesUnderContract(
    root,
    config,
    options.facts ?? options.architectureFacts,
    {
      governedPercent: cov.governed?.percent ?? null,
      populatedLayerCount: Array.isArray(cov.layers)
        ? cov.layers.filter((row) => (row?.files ?? 0) > 0).length
        : null,
      classifiedFiles: cov.governed?.classifiedFiles ?? null,
    }
  );
  // Single residual expression (nextPilot || extractionCard) — HTML report uses the same.
  const residualPilot = pilotLoop?.nextPilot || pilotLoop?.extractionCard || null;
  // Evidence-backed hard only (never capabilities-from-hook-files alone).
  const hardWriteActive = writePath.enforcementState?.localWrite?.hard === true;
  const packageInstalled = writePath.enforcementState?.localWrite?.installed === true;
  const dualTruthNext =
    packageVersionTruth?.dualTruth === true
      ? `Bump package.json arkgate pin to ${packageVersionTruth.cliVersion || 'this CLI'} (or re-run install without --no-install)`
      : packageVersionTruth?.code === 'PACKAGE_PIN_ABSENT'
        ? 'Add arkgate to package.json and install so CI/npx resolve this CLI (PACKAGE_PIN_ABSENT)'
        : null;
  const stanceFile = readAdoptionStance(root);
  const githubForBoundary = githubEvidenceForCiMergeBoundary(adoption, writePath);
  const adopted = classifyAdopted({
    stance: stanceFile,
    github: githubForBoundary,
    ci: ciMergeBoundary?.ci,
  });
  const { coverageHonesty, baselineHonesty, writePathHonesty, productHonesty } =
    computeDoctorEnforcementHonesty({
      governedPercent: cov.governed.percent,
      totalFiles: cov.governed.totalFiles,
      emptyScope: emptyScopeEarly,
      baselineExists: baseline.exists,
      frozenKeys: baseline.exists ? baseline.keys.size : 0,
      activeViolations: activeCount,
      activeBlockingViolations: blockingActive,
      suppressed,
      totalViolations: violations.length,
      activeHost: writePath.activeHost,
      hardWriteActive,
      designWeak: designFitness.designWeak === true,
      designWeakLabel: designFitness.label,
      designSmellCount: designSmells.length,
      designSmellsWithOpenEdges: designSmells.length > 0 && blockingActive > 0,
      packageVersionTruth,
      residualPilots: Boolean(residualPilot) && designFitness.designWeak === true,
      pilotTarget: residualPilot?.pilotTarget ?? residualPilot?.pilot ?? null,
      arkRulesMergeHonesty: rulesUnderContract?.mergePlanes
        ? { active: rulesUnderContract.active === true, ...rulesUnderContract.mergePlanes }
        : rulesUnderContract?.active === true
          ? { active: true, extraMergeTeeth: false }
          : null,
      primaryNextAction:
        adopted === 'not-adopted' ? NOT_ADOPTED_NEXT_ACTION : postGreenPath?.action ?? dualTruthNext,
      operatingMode,
      packageInstalled,
      selfHost:
        packageVersionTruth?.selfHost === true ||
        packageVersionTruth?.code === 'PACKAGE_PIN_SELF_HOST',
      adopted,
      ciMergeBoundary,
      github: githubForBoundary,
      adoptionStance: stanceFile,
      stewardNudge: doctorAdvisories.stewardNudge,
    });

  // Improvement compass: projection only — never feeds ok/valid/goal.met.
  const improvementCompass = buildDoctorImprovementCompass({
    designSmells,
    violations,
    designWeak: designFitness.designWeak === true,
    physicalCohesion: doctorAdvisories.physicalCohesion,
    rulesUnderContract,
    baselineExists: baseline.exists,
    baselineStale: analysisComplete ? staleBaseline : null,
    frozenResidual: baseline.exists ? baseline.keys.size : null,
    dirtyBaselineRisk: productHonesty?.reasonIds?.includes?.('dirty-baseline') === true,
    ungovernedDirCount: cov.suggestions?.length ?? 0,
    emptyLayerCount: cov.emptyLayers?.length ?? 0,
    goldenPatternPresent: goldenPattern.present === true,
    arkRulesLoaded: rulesUnderContract?.active === true,
  });
  // Deep-module coach: hot paths + deepening candidates — advisory only (notAScore).
  const deepModuleCoach = buildDeepModuleCoachAdvisory(root, {
    designSmells,
    physicalCohesion: doctorAdvisories.physicalCohesion,
    improvementCompass,
    pilotLoop,
  });
  const stewardUnfinished = Boolean(
    doctorAdvisories.stewardNudge?.emptyStewardsPastGrace ||
      (doctorAdvisories.stewardNudge?.needsStewards &&
        (doctorAdvisories.stewardNudge?.stewardCount ?? 0) === 0)
  );

  if (asJson) {
    (options.writeJson ?? console.log)(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          envelope: 'doctor',
          ok: analysisComplete && (options.designDelta?.valid ?? true),
          doctor: {
            completeness,
            operatingMode,
            // Monorepo walk-up (NEW-MONOREPO-CWD-WALKUP): where ark.config.json was resolved.
            configRoot: options.configRoot ?? root,
            ...(options.configWalkedUp ? { configWalkedUp: true } : {}),
            // Path-correct ENFORCE can still be design-weak (P02).
            designFitness,
            designSmells,
            // Improvement compass (lenses; notAScore; never a gate input).
            improvementCompass,
            // Deep-module coach (hot paths + deepening; notAScore; never a gate input).
            deepModuleCoach,
            ...(options.designDelta ? { designDelta: options.designDelta } : {}),
            // Q01: primary next action when Shape residual dominates (null if not design-weak).
            postGreenPath,
            adoptionStance: adopted,
            ...(adopted === 'not-adopted'
              ? {
                  primaryNextAction: NOT_ADOPTED_NEXT_ACTION,
                  ...(postGreenPath ? DESIGN_WEAK_HONESTY_FLAGS : {}),
                }
              : postGreenPath
                ? { primaryNextAction: postGreenPath.action, ...DESIGN_WEAK_HONESTY_FLAGS }
                : productHonesty.primaryNextAction
                  ? { primaryNextAction: productHonesty.primaryNextAction }
                  : {}),
            ...(stewardUnfinished
              ? { healthyFinishedForbidden: true, stewardsUnfinished: true }
              : {}),
            // Q03: advisory golden for new-code placement (absent = no claim).
            goldenPattern,
            // Y06: advisory pure-layer opt-in (null when not applicable).
            pureLayerOptIn,
            // Q04: one-pilot loop (extraction card → re-doctor).
            pilotLoop,
            // Dual-truth: managed CLI vs package.json pin (not a gate fail).
            packageVersionTruth,
            // Advisories, never a verdict: W01/U05/X04/Y03 + graph-blind spots.
            // (rulesUnderContract is also in advisories; re-assert after spread so mergePlanes wins.)
            ...doctorAdvisories,
            // AR12 + P1-M mergePlanes (authoritative; after advisories spread).
            rulesUnderContract,
            // P0-B — single anti-false-green honesty surface (never a score).
            productHonesty,
            governed: cov.governed,
            coverageHonesty,
            emptyLayers: cov.emptyLayers,
            layersWithoutRules: cov.layersWithoutRules,
            ungovernedDirs: cov.suggestions.length,
            violations: {
              total: violations.length,
              active: activeCount,
              suppressed,
              value: summary.valueCount,
              typeOnly: summary.typeOnlyCount,
              // DL-TYPEEDGE-POLICY-FIELD / P1-type: always emit when type-only findings
              // exist or the type-edge policy surface is active (default: always on).
              typeEdgePolicy: {
                active: true,
                valueBlocksMerge: true,
                typeOnlyIsPlacementDebt: true,
                typeOnlyCount: summary.typeOnlyCount,
                ...(summary.typeOnlyCount > 0
                  ? {
                      volume:
                        summary.typeOnlyCount >= 20
                          ? 'high'
                          : summary.typeOnlyCount >= 5
                            ? 'moderate'
                            : 'low',
                      starter:
                        'templates/layers/shared-types.starter.json — optional SharedTypes layer both sides may import.',
                    }
                  : {}),
                guidance:
                  'Type-only edges (`import type` / pure type modules) are placement debt — fix value runtime coupling first; place shared types in a SharedTypes / owning layer.',
              },
              concentrated: summary.concentrated,
              dominant: summary.dominant,
              topEdges: summary.edges.slice(0, 5),
            },
            baseline: {
              exists: baseline.exists,
              frozen: baseline.exists ? baseline.keys.size : 0,
              stale: analysisComplete ? staleBaseline : null,
              policy: adoption.baseline,
              honesty: baselineHonesty,
            },
            gatesMissing,
            skillGaps,
            ...(agentHomeGaps.length > 0 ? { agentHomeGaps } : {}),
            staleRunnerFiles: staleRunners,
            ciMergeBoundary,
            writePath: {
              activeHost: writePath.activeHost,
              support: writePath.support,
              supportSummary: writePath.supportSummary,
              capabilities: writePath.capabilities,
              capabilityEvidence: writePath.capabilityEvidence,
              inventory: writePath.inventory,
              enforcementLadder: writePath.enforcementLadder,
              enforcementState: writePath.enforcementState,
              mode: writePath.mode,
              prepareWrite: writePath.prepareWrite,
              autoPatch: writePath.autoPatch,
              hookPresent: writePath.hookPresent,
              hookRepair: writePath.hookRepair,
              mcpPresent: writePath.mcpPresent,
              evidence: writePath.evidence,
              honesty: writePathHonesty,
              ...(writePath.sessionNote ? { sessionNote: writePath.sessionNote } : {}),
              ...(writePath.gap
                ? {
                    gap: {
                      id: writePath.gap.id,
                      severity: writePath.gap.severity,
                      message: writePath.gap.message,
                      fix: writePath.gap.fix,
                    },
                  }
                : { gap: null }),
            },
            adoption,
            safety: options.safety,
            newHere: showNewHere
              ? {
                  show: true,
                  archetype: recommendation?.archetype,
                  label: recommendation?.label,
                  preset: recommendation?.preset,
                  galleryStarter: recommendation?.galleryStarter,
                  policyPack: recommendation?.policyPack,
                  recommendCommand: arkCommand(root, 'ark-check', '--recommend'),
                  initCommand: recommendation?.archetype
                    ? arkCommand(root, 'ark', `init --archetype ${recommendation.archetype} --yes`)
                    : undefined,
                }
              : { show: false },
          },
        },
        null,
        2
      )
    );
    return;
  }

  const ok = color.green('✓');
  const warn = color.yellow('!');
  const bad = color.red('✗');
  const line = (mark, text) => console.log(`  ${mark} ${text}`);
  console.log(color.bold(`Ark doctor — ${path.basename(path.resolve(root)) || '.'}`));
  if (!analysisComplete) line(warn, analysisIncompleteStatement(completeness));
  printParseHealthSection(doctorAdvisories.parseHealth, { color, warn, line });

  const emptyScope = emptyScopeEarly;
  const mode = operatingMode;
  console.log('');
  console.log(color.bold('Operating mode'));
  // Modes are detected states, not user-picked settings. Plain-language "what you do next".
  // Never paint green (ok) under design residual — edges clean ≠ design done (product-voice).
  const modeMark =
    mode === 'enforce' &&
    !designFitness.designWeak &&
    adopted !== 'not-adopted' &&
    !stewardUnfinished
      ? ok
      : warn;
  // modeTitle alone names the light — bodies must not re-prefix Suggest/Adapt/Enforce.
  const modeHelp = {
    suggest: 'thin or new tree. Next: ark start --apply, then doctor.',
    adapt: 'config and tree still disagree. Next: do #1.',
    enforce:
      adopted === 'not-adopted'
        ? 'import rules check out; merge boundary not adopted.'
        : 'import rules check out. Keep host + CI.',
  };
  const modeTitle = operatingModeTitle(mode, designFitness.designWeak, stewardUnfinished);
  line(
    modeMark,
    `${modeTitle} — ${
      designFitness.designWeak
        ? 'import rules check out; leftover design work remains.'
        : modeHelp[mode]
    }`
  );
  if (emptyScope) {
    line(
      bad,
      'Empty scope: include paths match 0 source files — a green check is meaningless until include/layers match the tree (monorepo → apps/packages, or /ark-adopt).'
    );
  }

  const safetyHasEntries = Boolean(
    options.safety &&
      [
        options.safety.nonLiteralDynamicImports,
        options.safety.tsSuppressions,
        options.safety.anyCasts,
        options.safety.inMemoryProductionStores,
        options.safety.disabledPeerIsolationRules,
      ].some((entries) => Array.isArray(entries) && entries.length > 0)
  );
  const uniqueActions = collectDoctorNextActions({
    root,
    analysisComplete,
    designSmells,
    postGreenPath,
    coverageHonesty,
    cov,
    packageVersionTruth,
    dualTruthNext,
    activeCount,
    writePath,
    gatesMissing,
    skillGaps,
    codexHomeGap: detectCodexHomeGap(root),
    codexConcernActive: codexConcernIsActive(),
    agentHomeGaps,
    baselineHonesty,
    staleBaseline,
    staleRunners,
    adoption,
    safety: options.safety,
    safetyHasEntries,
    showNewHere,
    designFitness,
    operatingMode,
    adopted,
    stewardNudge: doctorAdvisories.stewardNudge,
  });
  console.log('');
  if (ciMergeBoundary?.ci?.state) {
    line(
      ciMergeBoundary.ci.state === 'required' ? ok : warn,
      `CI merge: ${ciMergeBoundary.ci.state}`
    );
  }
  if (adopted === 'advisory-only-acked') {
    line(warn, 'Adoption: advisory-only ack — not a required GitHub status.');
  }
  if (isDoctorHealthyNothingToDo(designFitness, uniqueActions, adopted)) {
    console.log(color.green('✔ Healthy — nothing to do.'));
    console.log(color.dim('  Keep write path + CI.'));
  } else {
    console.log(color.bold('Primary next action'));
    console.log(`  1. ${uniqueActions[0]}`);
  }

  console.log('');
  console.log(color.bold('Coverage'));
  const govMark =
    emptyScope || cov.governed.percent < 50
      ? bad
      : cov.governed.percent >= 80
        ? ok
        : warn;
  line(govMark, `Governed: ${cov.governed.percent}% (${cov.governed.classifiedFiles}/${cov.governed.totalFiles} files)`);

  const hostRed =
    gatesMissing.length > 0 ||
    Boolean(writePath.gap) ||
    writePathHonesty?.softWriteHost === true;
  if (hostRed) {
    console.log('');
    console.log(color.bold('Host / CI'));
    if (writePath.activeHost) line(' ', `Active host: ${writePath.activeHost}`);
    if (gatesMissing.length > 0) line(bad, `Missing gates: ${gatesMissing.join(', ')}`);
    else if (writePath.gap || writePathHonesty?.softWriteHost) {
      line(warn, 'Local writes are advisory; required CI is the merge boundary.');
    }
  }

  const nudge = doctorAdvisories.stewardNudge;
  if ((nudge?.needsStewards || nudge?.drift || nudge?.emptyStewardsPastGrace) && nudge.ask) {
    console.log('');
    console.log(color.bold('Stewards'));
    line(warn, nudge.ask);
  }

}
