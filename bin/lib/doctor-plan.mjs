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
import { summarizeRulesUnderContract } from './rules-under-contract.mjs';
export { summarizeRulesUnderContract };
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
  mergePostGreenTopActions,
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
import { computeDoctorAdvisories, printDoctorAdvisories } from './doctor-advisories.mjs';
import { ANALYSIS_COMPLETENESS, analysisIncompleteStatement, normalizeAnalysisCompleteness } from './analysis-completeness.mjs';
import { designDeltaDoctorLines } from './design-delta.mjs';
import { enforcementDoctorLines } from './enforcement-state.mjs';

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
  for (const file of files) {
    const layer = layerForFile(root, file, layers);
    if (layer && counts.has(layer)) counts.set(layer, counts.get(layer) + 1);
    else unclassified.push(normalize(path.relative(root, file)));
  }
  unclassified.sort();
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
    console.log('Apply these via /ark-contract (adds the layer patterns to ark.config.json).');
  }
  if (layersWithoutRules.length > 0) {
    console.log('');
    console.log(`Layers with no rule edge (can import anything): ${layersWithoutRules.join(', ')}`);
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
  // Order: auto-applicable first (quick, safe wins), then human decisions, then deferred.
  const rank = { 'mechanical-safe': 0, judgment: 1, deferred: 2 };
  steps.sort((a, b) => rank[a.class] - rank[b.class]);
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
  const edgesMet = activeViolations.length === 0 && !notHonestlyEnforced;
  const designWeak = isDesignWeak(designSmells, {
    activeViolations: activeViolations.length,
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
    activeViolations.length > 0
      ? `Resolve ${activeViolations.length} architecture violation(s) without weakening the contract.`
      : emptyScope
        ? 'No source files matched the contract include paths — this "clean" result checks nothing. Fix include/layers (monorepo → apps/packages, or /ark-adopt) so Ark has real code to govern.'
        : governedLow
          ? `No violations — but Ark governs only ${governedPercent}% of your code, so this "clean" result checks almost nothing. Classify the rest (ark-check --coverage, then /ark-adopt) so it's actually enforced.`
          : 'No active violations — the architecture already meets its contract.';
  if (designWeak) {
    statement =
      'No active edge violations — contract edges are clean, but design smells remain (ENFORCE · design-weak). Shape residual is plan B only; not healthy finished.';
  }
  if (completeness !== ANALYSIS_COMPLETENESS.complete) statement = analysisIncompleteStatement(completeness);

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
              'ENFORCE · design-weak — use patternBets / dual-plan B; never auto-apply as mechanical-safe',
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
    },
    counts,
    steps,
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
        `  ENFORCE · design-weak — ${plan.patternBets?.length ?? 0} pattern bet(s) (never auto-apply)`
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
  console.log('');
  const tag = {
    'mechanical-safe': color.green('auto  '),
    judgment: color.yellow('decide'),
    deferred: color.dim('defer '),
  };
  for (const step of plan.steps) {
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
  const staleRunners = staleRunnerGateFiles(root);
  const adoption = collectAdoptionGaps(root, config, cov);
  // Prefer writePath from adoption (same detector); recompute only if missing (tests/stubs).
  const writePath = adoption.writePath ?? detectWritePathCapabilities(root);
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
  const designSmells = detectDesignSmells(root, config, files, cov);
  const observedDesignFitness = summarizeDesignFitness(designSmells, {
    activeViolations: activeCount,
    governedPercent: cov.governed.percent,
    totalFiles: cov.governed.totalFiles,
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
  const { coverageHonesty, baselineHonesty, writePathHonesty } = computeDoctorEnforcementHonesty({
    governedPercent: cov.governed.percent,
    totalFiles: cov.governed.totalFiles,
    emptyScope: cov.emptyScope === true || cov.governed.totalFiles === 0,
    baselineExists: baseline.exists,
    frozenKeys: baseline.exists ? baseline.keys.size : 0,
    activeViolations: activeCount,
    suppressed,
    totalViolations: violations.length,
    activeHost: writePath.activeHost,
    hardWriteActive: writePath.capabilities?.['hard-write'] === true,
  });

  if (asJson) {
    (options.writeJson ?? console.log)(
      JSON.stringify(
        {
          ok: analysisComplete && (options.designDelta?.valid ?? true),
          doctor: {
            completeness,
            operatingMode: resolveOperatingMode({
              governedPercent: cov.governed.percent,
              planMet: analysisComplete && activeCount === 0 && cov.governed.percent >= 50,
              mature: cov.governed.totalFiles >= 150,
              totalFiles: cov.governed.totalFiles,
              emptyLayers: cov.emptyLayers,
              coreOptionalWithFiles: adoption.coreOptional?.length ?? 0,
              presentationShare: (() => {
                const total = cov.governed.totalFiles || 0;
                if (total <= 0) return null;
                const p = cov.layers.find((r) => r.name === 'PresentationAdapters');
                return p ? p.files / total : null;
              })(),
            }),
            // Path-correct ENFORCE can still be design-weak (P02).
            designFitness,
            designSmells,
            ...(options.designDelta ? { designDelta: options.designDelta } : {}),
            // Q01: primary next action when Shape residual dominates (null if not design-weak).
            postGreenPath,
            ...(postGreenPath
              ? { primaryNextAction: postGreenPath.action, ...DESIGN_WEAK_HONESTY_FLAGS }
              : {}),
            // Q03: advisory golden for new-code placement (absent = no claim).
            goldenPattern,
            // Y06: advisory pure-layer opt-in (null when not applicable).
            pureLayerOptIn,
            // Q04: one-pilot loop (extraction card → re-doctor).
            pilotLoop,
            // AR12 — Rules under contract (honest counts, not a score).
            rulesUnderContract: summarizeRulesUnderContract(root, config),
            // Advisories, never a verdict: W01/U05/X04/Y03 + graph-blind spots.
            ...doctorAdvisories,
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
            staleRunnerFiles: staleRunners,
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
  const actions = [];
  const line = (mark, text) => console.log(`  ${mark} ${text}`);
  if (!analysisComplete) actions.push('restore complete analysis, then rerun ark-check --doctor');
  console.log(color.bold(`Ark doctor — ${path.basename(path.resolve(root)) || '.'}`));
  if (!analysisComplete) line(warn, analysisIncompleteStatement(completeness));

  const emptyScope = cov.governed.totalFiles === 0;
  const totalFiles = cov.governed.totalFiles || 0;
  const presentationRow = cov.layers.find((r) => r.name === 'PresentationAdapters');
  const mode = resolveOperatingMode({
    governedPercent: emptyScope ? 0 : cov.governed.percent,
    planMet: analysisComplete && activeCount === 0 && !emptyScope && cov.governed.percent >= 50,
    mature: cov.governed.totalFiles >= 150,
    totalFiles: cov.governed.totalFiles,
    emptyLayers: cov.emptyLayers,
    coreOptionalWithFiles: adoption.coreOptional?.length ?? 0,
    presentationShare:
      totalFiles > 0 && presentationRow ? presentationRow.files / totalFiles : null,
  });
  console.log('');
  console.log(color.bold('Operating mode'));
  // Modes are detected states, not user-picked settings. Plain-language "what you do next".
  // Never paint green (ok) under design residual — edges clean ≠ design done (product-voice).
  const modeMark =
    mode === 'enforce' && !designFitness.designWeak
      ? ok
      : warn;
  // Status lights are detected states, not user-picked settings (see docs/product-voice.md).
  // modeTitle alone names the light — bodies must not re-prefix Suggest/Adapt/Enforce.
  const modeHelp = {
    suggest:
      'thin or new tree; the contract is not yet the control plane. You do not pick this light. Next: ark start (preview), then ark start --apply; re-check with --doctor.',
    adapt:
      'contract and tree still disagree, or debt is open. Write path does not fully protect you yet. You do not pick this light. Next: do doctor top action #1 (often /ark-adopt, /ark-contract, or /ark-autopilot).',
    enforce:
      'honest coverage and clean checked edges. You arrived here; you never turn Enforce on. Next: keep the host write path and CI check; only NEW violations should fail.',
  };
  const modeTitle =
    mode === 'enforce' && designFitness.designWeak
      ? 'ENFORCE · design-weak'
      : mode.toUpperCase();
  line(
    modeMark,
    `${modeTitle} — ${
      designFitness.designWeak
        ? 'checked edges are honest; design smells remain. Green is not elegant design. You do not pick this light. Next: one Shape door — /ark-explore shape-focus → dual-plan B; apply B only with /ark-autopilot and your OK. Empty plan A is not done.'
        : modeHelp[mode]
    }`
  );
  if (emptyScope) {
    line(
      bad,
      'Empty scope: include paths match 0 source files — a green check is meaningless until include/layers match the tree (monorepo → apps/packages, or /ark-adopt).'
    );
  }

  console.log('');
  console.log(color.bold('Design fitness'));
  if (designSmells.length === 0) {
    line(analysisComplete ? ok : warn, designFitness.label);
  } else {
    line(designFitness.designWeak ? warn : warn, designFitness.label);
    for (const smell of designSmells.slice(0, 5)) {
      // Q02: outcome-first (plain language); technical message stays in JSON + dim detail.
      const outcome = smell.outcome || smell.message;
      line(' ', `[${smell.id}] ${outcome}`);
      if (smell.outcome && smell.message && smell.message !== smell.outcome) {
        line(' ', color.dim(`detail: ${smell.message}`));
      }
      if (smell.evidence?.length) {
        line(' ', color.dim(`evidence: ${smell.evidence.slice(0, 4).join(', ')}`));
      }
    }
    if (postGreenPath) {
      // Rank first via mergePostGreenTopActions at the end (Q01 single door).
      actions.push(postGreenPath.action);
    }
    // Q04 — surface one next pilot under design-weak.
    if (pilotLoop?.active && pilotLoop.nextPilot) {
      const np = pilotLoop.nextPilot;
      line(
        warn,
        `Next pilot (one at a time): ${np.pilotTarget || np.pilot} [${np.smellId}] → re-doctor after change`
      );
      line(' ', color.dim(`success: ${np.successSignal}`));
      line(' ', color.dim('never multi-pilot batch; patternBets never mechanical-safe'));
    }
  }

  if (options.designDelta) {
    console.log('');
    console.log(color.bold('Design delta (opt-in)'));
    for (const row of designDeltaDoctorLines(options.designDelta))
      line(row.level === 'bad' ? bad : row.level === 'ok' ? ok : ' ', row.level === 'dim' ? color.dim(row.text) : row.text);
  }

  // Q03 — optional golden pattern note (advisory for new code only).
  if (goldenPattern.present) {
    console.log('');
    console.log(color.bold('Golden pattern (new code)'));
    line(
      ok,
      `"${goldenPattern.name}" — ${goldenPattern.norm}` +
        (goldenPattern.newCodeHome ? ` Prefer: ${goldenPattern.newCodeHome}.` : '') +
        ' Advisory only — does not clear design-weak or replace the gate.'
    );
  } else if (goldenPattern.invalid) {
    console.log('');
    console.log(color.bold('Golden pattern (new code)'));
    line(
      warn,
      `${goldenPattern.path} is present but invalid (${goldenPattern.error || 'invalid'}). ` +
        'Fix or remove it — absence is fine; a bad file is not guidance.'
    );
  }
  // Y06 — one-line pure-layer opt-in (U05 voice; never blocker).
  if (pureLayerOptIn) {
    line(' ', color.dim(pureLayerOptIn.message));
  }

  printDoctorAdvisories(doctorAdvisories, { line, warn, color }); // advisory sections

  console.log('');
  console.log(color.bold('Coverage'));
  const govMark =
    emptyScope || cov.governed.percent < 50
      ? bad
      : cov.governed.percent >= 80
        ? ok
        : warn;
  line(govMark, `Governed: ${cov.governed.percent}% (${cov.governed.classifiedFiles}/${cov.governed.totalFiles} files)`);
  if (coverageHonesty.greenIsNotEnforcement) {
    line(coverageHonesty.worseThanNoGate ? bad : warn, coverageHonesty.message);
    if (coverageHonesty.worseThanNoGate) {
      actions.push('raise governed coverage above a minority slice before treating green as enforcement');
    }
  }
  if (cov.suggestions.length > 0) {
    line(warn, `${cov.suggestions.length} ungoverned director(y/ies) — proposals: ${arkCommand(root, 'ark-check', '--coverage')}`);
    actions.push('classify the ungoverned directories (/ark-contract)');
  }
  if (cov.emptyLayers.length > 0) line(warn, `Empty layers (pattern matches nothing): ${cov.emptyLayers.join(', ')}`);
  if (cov.layersWithoutRules.length > 0) line(warn, `Layers with no rule edge: ${cov.layersWithoutRules.join(', ')}`);
  if (cov.suggestions.length === 0 && cov.emptyLayers.length === 0) line(ok, 'Every layer classifies files; no empty layers');

  if (showNewHere) {
    console.log('');
    console.log(color.bold('New here?'));
    // Suggest residual: start → doctor only (not a competing recommend/architect curriculum).
    line(ok, `Primary path: ${arkCommand(root, 'ark', 'start')} (preview) → ${arkCommand(root, 'ark', 'start --apply')} → re-run --doctor`);
    if (recommendation) {
      line(warn, `Sensor shape hint (not a second curriculum): ${recommendation.archetype} — ${recommendation.label} (preset ${recommendation.preset})`);
      if (recommendation.galleryStarter) line(ok, `Gallery starter (optional): ${recommendation.galleryStarter}`);
      if (recommendation.policyPack) {
        line(ok, `Policy pack (optional expert): ${arkCommand(root, 'ark-check', `--apply-policy-pack ${recommendation.policyPack}`)}`);
      }
      if (recommendation.signals?.nestFramework) {
        line(ok, 'Nest modular monolith → prefer hexagonal (or ddd-bounded-contexts if you have src/contexts/*)');
      }
      if (recommendation.signals?.monorepoTooling?.length) {
        line(ok, `Monorepo tooling (${recommendation.signals.monorepoTooling.join(', ')}) → preset monorepo (apps/packages/libs)`);
      }
    } else {
      line(warn, 'Low governed coverage or fresh config — finish start, then re-run doctor before adding layers of code.');
    }
    line(ok, `Optional sensor detail: ${arkCommand(root, 'ark-check', '--recommend')}`);
    actions.unshift('finish ark start (preview + --apply), then re-run --doctor');
  }

  console.log('');
  console.log(color.bold('Violations'));
  if (violations.length === 0) {
    if (!analysisComplete) line(warn, 'No reported violations — contract compliance is not verified until analysis is complete');
    else if (emptyScope || cov.governed.percent < 50) {
      line(
        warn,
        'No active violations — coverage is still thin, so green is not yet honest enforcement'
      );
    } else if (designFitness.designWeak) {
      line(warn, 'None on checked edges — edges match the contract; design residual remains (ENFORCE · design-weak). Not healthy finished.');
    } else {
      line(ok, 'None — the code matches the contract on checked edges');
    }
  } else {
    const typeNote = summary.typeOnlyCount > 0 ? ` (${summary.valueCount} value · ${summary.typeOnlyCount} type-only)` : '';
    const supNote = suppressed > 0 ? `, ${suppressed} frozen` : '';
    line(
      activeCount > 0 ? warn : ok,
      `${violations.length} total${typeNote}${supNote}${activeCount > 0 ? ` — ${activeCount} NOT baselined` : ''}`
    );
    for (const edge of summary.edges.slice(0, 3)) line(' ', color.dim(`${edge.count}  ${edge.edge}`));
    if (summary.concentrated) {
      line(warn, color.dim(`${Math.round(summary.dominantShare * 100)}% on one edge (${summary.dominant}) — likely a contract fix, not debt`));
    }
    if (activeCount > 0) {
      actions.push(
        `resolve the non-baselined violations — see the classified plan (${arkCommand(root, 'ark-check', '--plan')}), then /ark-fix`
      );
    }
  }

  console.log('');
  console.log(color.bold('Write path (agent)'));
  const capabilities = writePath.capabilities;
  const writePathLabels = {
    repair: 'repair-capable — hard block + machine-readable autoPatch / ARK_REPAIR_JSON',
    'reject-only': 'reject-only — hard block with prose; no repair payload',
    'mcp-only': 'MCP tools only — prepare-write/autoPatch available; no PreToolUse hook',
    none: 'no write gate hook and no Ark MCP',
  };
  const wpMark =
    capabilities['hard-write']
      ? ok
      : capabilities['advisory-write'] || capabilities['merge-gate']
        ? warn
        : bad;
  line(' ', `Active host: ${writePath.activeHost}`);
  line(' ', `Supported profile: ${writePath.supportSummary}`);
  line(wpMark, `Mode: ${writePath.mode} — ${writePathLabels[writePath.mode] || writePath.mode}`);
  if (writePathHonesty.message) line(warn, writePathHonesty.message);
  if (writePath.sessionNote) {
    line(warn, writePath.sessionNote);
  }
  const enforcement = writePath.enforcementState;
  for (const row of enforcementDoctorLines(enforcement)) line(row.level === 'ok' ? ok : row.level === 'bad' ? bad : warn, row.text);
  line(
    capabilities['repair-payload'] ? ok : warn,
    `Repair payload at hard boundary: ${capabilities['repair-payload'] ? 'yes' : 'no'}`
  );
  if (writePath.gap) {
    line(writePath.gap.severity === 'warn' ? warn : warn, writePath.gap.message);
    if (writePath.gap.fix) {
      line(' ', color.dim(`Fix: ${writePath.gap.fix}`));
      actions.push(writePath.gap.fix);
    }
  }

  console.log('');
  console.log(color.bold('Gates & skills'));
  if (gatesMissing.length === 0) line(ok, 'Shared gate files present (AGENTS.md, .mcp.json, CI)');
  else {
    line(bad, `Missing gates: ${gatesMissing.join(', ')}`);
    actions.push(`install gates (${arkCommand(root, 'ark-check', '--install-agent-gates')})`);
  }
  // Report Codex legacy prompts and other-host missing/stale independently (never exclusive).
  const legacyCodex = skillGaps.some((g) => g.tool === 'codex' && g.legacyPromptsOnly);
  const codexLegacySafeDelete = skillGaps.some(
    (g) => g.tool === 'codex' && g.legacyAdvisory && g.catalogComplete
  );
  const remainingGaps = skillGaps.filter(
    (g) => !(g.tool === 'codex' && (g.legacyPromptsOnly || g.legacyAdvisory))
  );
  const remMiss = remainingGaps.reduce((s, g) => s + g.missing, 0);
  const remStale = remainingGaps.reduce((s, g) => s + g.stale, 0);
  if (remMiss + remStale === 0 && !legacyCodex) line(ok, '/ark-* skills current for detected tools');
  if (legacyCodex) {
    line(warn, 'Codex: legacy flat .codex/prompts only (not a loadable skill catalog)');
    actions.push('install Codex SKILL.md catalog (--install-agent-gates --skills-only --tools codex --force)');
  }
  if (codexLegacySafeDelete) {
    line(
      ' ',
      color.dim(
        'Codex catalog complete — leftover .codex/prompts/ark-*.md are safe to delete (not loadable; not required).'
      )
    );
  }
  if (remMiss + remStale > 0) {
    line(
      warn,
      `${remMiss} missing / ${remStale} content-behind-package /ark-* skill(s) for ${remainingGaps.map((g) => g.tool).join(', ')}`
    );
    actions.push('refresh /ark-* skills (--install-agent-gates --skills-only --force)');
  }
  const codexHomeGap = detectCodexHomeGap(root);
  if (codexHomeGap) {
    const parts = [
      codexHomeGap.legacyPromptsOnly ? 'legacy-prompts-only' : null,
      codexHomeGap.missing > 0 ? `${codexHomeGap.missing} missing` : null,
      codexHomeGap.stale > 0 ? `${codexHomeGap.stale} content-behind-package` : null,
    ].filter(Boolean);
    const deferred = !codexConcernIsActive();
    // Deferred home debt is dim/info (not warn) so non-Codex sessions are not "incomplete".
    if (deferred) {
      line(color.dim('·'), color.dim(`Codex home skills ${parts.join(', ')} (deferred — not on Codex session)`));
    } else {
      line(warn, `Codex home skills ${parts.join(', ')}`);
      actions.push('refresh Codex home skills (--install-agent-gates --skills-only --codex-home --force)');
    }
  }

  console.log('');
  console.log(color.bold('Baseline'));
  if (!baseline.exists) {
    line(!analysisComplete || violations.length > 0 ? warn : ok, !analysisComplete ? 'No baseline — current violations were not fully evaluated' : violations.length > 0 ? 'No baseline — adopting a dirty repo? freeze with --update-baseline' : 'No baseline (nothing to freeze)');
  } else {
    // Baseline keys are line-agnostic, so N keys can suppress ≥N violations — label as keys
    // to avoid an apparent mismatch with the "frozen" violation count above.
    const baseMark = !analysisComplete || baselineHonesty.dirtyBaselineRisk ? warn : ok;
    line(baseMark, `${baseline.keys.size} frozen key(s)${analysisComplete ? '' : ' — stale comparison not verified'}`);
    if (analysisComplete && baselineHonesty.dirtyBaselineRisk) {
      line(warn, baselineHonesty.message);
      actions.push('review dirty baseline freezes — fix the contract before trusting green-via-freeze');
    }
    if (analysisComplete && staleBaseline > 0) {
      line(warn, `${staleBaseline} stale entr(y/ies) no longer occur — tighten with --update-baseline`);
      actions.push('tighten the baseline (--update-baseline)');
    }
  }

  console.log('');
  console.log(color.bold('Command runners'));
  if (staleRunners.length === 0) line(ok, 'Emitted commands match the package manager');
  else {
    line(warn, `Stale runner in ${staleRunners.join(', ')}`);
    actions.push(`migrate command runners (${arkCommand(root, 'ark-check', '--install-agent-gates --migrate-commands')})`);
  }

  // Adoption completeness (hosts, MCP health, codex home, core optionality, origin, baseline policy)
  console.log('');
  console.log(color.bold('Adoption (separate from fitness score)'));
  if (adoption.gaps.length === 0 && !adoption.layerBalance) {
    line(
      ok,
      'Hosts, MCP argv, core optionality, origin report, baseline policy, and deploy-path lint/types look complete'
    );
  } else {
    for (const gap of adoption.gaps) {
      // Deferred Codex-home debt (non-temp) is annotated, not a top action, when the
      // session host is not Codex — fix when that host is used.
      const mark = gap.deferred
        ? color.dim('·')
        : gap.severity === 'warn'
          ? warn
          : gap.severity === 'info'
            ? warn
            : bad;
      line(mark, gap.message);
      if (gap.fix) {
        line(' ', color.dim(gap.deferred ? `When using Codex: ${gap.fix}` : `Fix: ${gap.fix}`));
      }
      if (!gap.deferred) actions.push(gap.fix || gap.message);
    }
    if (adoption.layerBalance) {
      line(warn, color.dim(adoption.layerBalance.educational));
    }
  }
  if (adoption.baseline) {
    line(
      ' ',
      color.dim(
        `Baseline policy: ${adoption.baseline.signal}` +
          (adoption.baseline.primaryPathUsesBaseline
            ? ' · primary path uses --baseline'
            : ' · primary path does not use --baseline')
      )
    );
  }
  if (adoption.originReport.present) {
    line(ok, 'Origin architecture snapshot present (.ark/reports/origin.json)');
  }

  console.log('');
  console.log(color.bold('Safety / bypass resistance'));
  const safety = options.safety;
  if (!safety) {
    line(warn, 'Safety diagnostics unavailable');
  } else {
    const rows = [
      ['Non-literal dynamic dependencies', safety.nonLiteralDynamicImports],
      ['@ts-ignore / @ts-nocheck', safety.tsSuppressions],
      ['Explicit any casts', safety.anyCasts],
      ['InMemory stores in production source', safety.inMemoryProductionStores],
      ['Rules with peerIsolation: false', safety.disabledPeerIsolationRules],
    ];
    for (const [label, entries] of rows) {
      line(entries.length === 0 ? ok : warn, `${label}: ${entries.length}`);
    }
    if (rows.some(([, entries]) => entries.length > 0)) {
      actions.push('resolve strict safety diagnostics before treating CI as enforcement');
    }
  }

  console.log('');
  const uniqueActions = mergePostGreenTopActions(actions, postGreenPath);
  if (isDoctorHealthyNothingToDo(designFitness, uniqueActions)) {
    console.log(color.green('✔ Healthy — nothing to do.'));
    console.log(color.dim('  Contract edges and design residual are clear. Keep write path + CI.'));
  } else {
    if (designFitness.designWeak && uniqueActions.length === 0 && postGreenPath) {
      uniqueActions.push(postGreenPath.action);
    }
    console.log(color.bold(`Primary next action`));
    console.log(`  1. ${uniqueActions[0]}`);
    if (uniqueActions.length > 1) {
      console.log(color.bold(`Also (${uniqueActions.length - 1}):`));
      uniqueActions.slice(1).forEach((action, index) => console.log(`  ${index + 2}. ${action}`));
    }
    if (postGreenPath) {
      console.log(
        color.dim(
          '  Shape residual is the primary door under ENFORCE · design-weak — do not skill-shop explore vs coverage vs think.'
        )
      );
    } else {
      console.log(color.dim('  Doctor is the control plane: do #1 first, then re-run --doctor.'));
    }
  }
}
