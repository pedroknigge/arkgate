/**
 * Coverage, plan, and doctor CLI surfaces (roadmap #11).
 */
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
import {
  collectAdoptionGaps,
  detectSkillGaps,
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
      `⚠ Ark governs a MINORITY of your code (${governed.percent}%). A green check here does NOT`
    );
    console.log('  mean the codebase is checked — the rest is ungoverned. Classify the directories');
    console.log('  below to actually cover it.');
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
// Co-pilot Phase F — turn active violations into a classified, ordered remediation PLAN with an
// embedded GOAL. This is the `plan` primitive the future apply-loop (Phase H, `loop`) consumes
// and the autopilot (Phase I) drives toward the `goal`. Read-only: it changes no files.
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
  // A plan with 0 violations but ~0% governed (or ZERO files in scope) is a FALSE green:
  // nothing is actually being checked. Treat as "not done — classify / fix include first."
  const governedLow = governedPercent != null && governedPercent < 50;
  const emptyScope = totalFiles === 0;
  const notHonestlyEnforced = governedLow || emptyScope;
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

  return {
    version: '1',
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
  const missingSkills = skillGaps.reduce((sum, gap) => sum + gap.missing, 0);
  const staleSkills = skillGaps.reduce((sum, gap) => sum + gap.stale, 0);
  const designSmells = detectDesignSmells(root, config, files, cov);
  const designFitness = summarizeDesignFitness(designSmells, {
    activeViolations: activeCount,
    governedPercent: cov.governed.percent,
    totalFiles: cov.governed.totalFiles,
  });

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          doctor: {
            operatingMode: resolveOperatingMode({
              governedPercent: cov.governed.percent,
              planMet: activeCount === 0 && cov.governed.percent >= 50,
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
            governed: cov.governed,
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
              stale: staleBaseline,
              policy: adoption.baseline,
            },
            gatesMissing,
            skillGaps,
            staleRunnerFiles: staleRunners,
            // Active-host guarantees plus separate repo-wide inventory.
            writePath: {
              activeHost: writePath.activeHost,
              support: writePath.support,
              supportSummary: writePath.supportSummary,
              capabilities: writePath.capabilities,
              capabilityEvidence: writePath.capabilityEvidence,
              inventory: writePath.inventory,
              mode: writePath.mode,
              prepareWrite: writePath.prepareWrite,
              autoPatch: writePath.autoPatch,
              hookPresent: writePath.hookPresent,
              hookRepair: writePath.hookRepair,
              mcpPresent: writePath.mcpPresent,
              evidence: writePath.evidence,
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

  console.log(color.bold(`Ark doctor — ${path.basename(path.resolve(root)) || '.'}`));

  const emptyScope = cov.governed.totalFiles === 0;
  const totalFiles = cov.governed.totalFiles || 0;
  const presentationRow = cov.layers.find((r) => r.name === 'PresentationAdapters');
  const mode = resolveOperatingMode({
    governedPercent: emptyScope ? 0 : cov.governed.percent,
    planMet:
      activeCount === 0 && !emptyScope && cov.governed.percent >= 50,
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
  const modeMark = mode === 'enforce' ? ok : mode === 'adapt' ? warn : warn;
  const modeHelp = {
    suggest:
      'Setup — Ark proposes a starting architecture shape. You do not pick this mode; it means the tree is thin or new. Next: accept the shape (ark start / ark init) and add real layers as you grow.',
    adapt:
      'Align — contract and folders still disagree, or coverage is weak / debt is open. You do not pick this mode. Next: classify ungoverned dirs (/ark-contract, /ark-adopt), run the plan (/ark-autopilot or /ark-loop). Gates do not fully protect you yet.',
    enforce:
      'Guard — contract coverage is honest and checked edges are clean. You do not pick this mode; you arrived here. Next: keep the host-appropriate write path and CI check on; only NEW violations should fail.',
  };
  const modeTitle =
    mode === 'enforce' && designFitness.designWeak
      ? 'ENFORCE · design-weak'
      : mode.toUpperCase();
  line(
    modeMark,
    `${modeTitle} — ${
      designFitness.designWeak
        ? 'Guard on edges is honest, but design smells remain (Shape residual). You do not pick this mode. Next: /ark-explore dual-plan B or /ark-autopilot for pattern bets — never treat empty plan A as healthy finished.'
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
    line(ok, designFitness.label);
  } else {
    line(designFitness.designWeak ? warn : warn, designFitness.label);
    for (const smell of designSmells.slice(0, 5)) {
      line(' ', color.dim(`[${smell.id}] ${smell.message}`));
      if (smell.evidence?.length) {
        line(' ', color.dim(`evidence: ${smell.evidence.slice(0, 4).join(', ')}`));
      }
    }
    if (designFitness.designWeak) {
      actions.push(
        'shape residual: /ark-explore (shape-focus) or /ark-autopilot dual-plan B — pattern bets are never mechanical-safe'
      );
    }
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
    if (recommendation) {
      line(warn, `Suggested application shape: ${recommendation.archetype} — ${recommendation.label} (preset ${recommendation.preset})`);
      if (recommendation.galleryStarter) {
        line(ok, `Gallery starter: ${recommendation.galleryStarter}`);
      }
      if (recommendation.policyPack) {
        line(ok, `Policy pack: ${arkCommand(root, 'ark-check', `--apply-policy-pack ${recommendation.policyPack}`)}`);
      }
      if (recommendation.signals?.nestFramework) {
        line(
          ok,
          'Nest modular monolith → prefer hexagonal (or ddd-bounded-contexts if you have src/contexts/*)'
        );
      }
      if (recommendation.signals?.monorepoTooling?.length) {
        line(
          ok,
          `Monorepo tooling (${recommendation.signals.monorepoTooling.join(', ')}) → preset monorepo (apps/packages/libs)`
        );
      }
    } else {
      line(warn, 'Low governed coverage or fresh config — pick an application shape before adding code.');
    }
    line(ok, `See the plan: ${arkCommand(root, 'ark-check', '--recommend')}`);
    if (recommendation?.archetype) {
      line(ok, `Quick setup: ${arkCommand(root, 'ark', `init --archetype ${recommendation.archetype} --yes`)}`);
    }
    actions.unshift('run ark-check --recommend or /ark-architect to choose your application shape');
  }

  console.log('');
  console.log(color.bold('Violations'));
  if (violations.length === 0) {
    // Avoid false confidence when the contract barely covers the tree.
    if (emptyScope || cov.governed.percent < 50) {
      line(
        warn,
        'No active violations — coverage is still thin, so green is not yet honest enforcement'
      );
    } else {
      line(ok, 'None — the code matches the contract');
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
  line(
    capabilities['hard-write'] ? ok : warn,
    `Hard write boundary: ${capabilities['hard-write'] ? 'yes' : 'no'}`
  );
  line(
    warn,
    `Advisory write tools (MCP): ${capabilities['advisory-write'] ? 'yes' : 'no'}`
  );
  line(
    capabilities['merge-gate'] ? ok : bad,
    `CI check (--strict-merge): ${capabilities['merge-gate'] ? 'yes' : 'no'} (merge blocking requires a required status)`
  );
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
  if (missingSkills + staleSkills === 0) line(ok, '/ark-* skills current for detected tools');
  else {
    line(warn, `${missingSkills} missing / ${staleSkills} outdated /ark-* skill(s) for ${skillGaps.map((g) => g.tool).join(', ')}`);
    actions.push('refresh /ark-* skills (--install-agent-gates --skills-only --force)');
  }

  console.log('');
  console.log(color.bold('Baseline'));
  if (!baseline.exists) {
    line(violations.length > 0 ? warn : ok, violations.length > 0 ? 'No baseline — adopting a dirty repo? freeze with --update-baseline' : 'No baseline (nothing to freeze)');
  } else {
    // Baseline keys are line-agnostic, so N keys can suppress ≥N violations — label as keys
    // to avoid an apparent mismatch with the "frozen" violation count above.
    line(ok, `${baseline.keys.size} frozen key(s)`);
    if (staleBaseline > 0) {
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
  if (actions.length === 0) {
    console.log(color.green('✔ Healthy — nothing to do.'));
  } else {
    const uniqueActions = [...new Set(actions.filter(Boolean))];
    console.log(color.bold(`Top actions (${uniqueActions.length}):`));
    uniqueActions.forEach((action, index) => console.log(`  ${index + 1}. ${action}`));
  }
}
