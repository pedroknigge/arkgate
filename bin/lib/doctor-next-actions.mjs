/**
 * Rank doctor next actions from already-computed facts (no I/O).
 * Lets the human printer show light + #1 before honesty/compass sections.
 */
import { arkCommand } from '../ark-shared.mjs';
import { skillGapsForActiveHost } from './agent-gates.mjs';
import { agentHomeConcernIsActive, agentHomeRefreshCommand } from './agent-homes.mjs';
import { mergePostGreenTopActions } from './post-green-path.mjs';
import { ADOPTED_NOT, NOT_ADOPTED_NEXT_ACTION } from './adoption-stance.mjs';
import { REQUIRED_GATE_WORKFLOW } from './gate-files.mjs';

function missingGateFiles(ctx) {
  const list = Array.isArray(ctx.gatesMissing) ? ctx.gatesMissing : [];
  if (ctx.ciNotFailClosed) {
    return list.filter((item) => item !== REQUIRED_GATE_WORKFLOW);
  }
  return list;
}

export function collectDoctorNextActions(ctx) {
  const actions = [];
  const missingFiles = missingGateFiles(ctx);
  const gatesInstalled = missingFiles.length === 0;
  const planAEmpty = !ctx.activeCount;
  const notAdopted = ctx.adopted !== 'required-merge' && ctx.adopted !== 'advisory-only-acked';
  if (notAdopted || ctx.adopted === ADOPTED_NOT || ctx.adopted == null) {
    actions.push(ctx.notAdoptedNextAction || NOT_ADOPTED_NEXT_ACTION);
  }
  const nudge = ctx.stewardNudge;
  if (
    nudge &&
    (nudge.needsStewards || nudge.drift || nudge.emptyStewardsPastGrace) &&
    nudge.nextAction
  ) {
    actions.push(nudge.nextAction);
  }
  const enforceEmptyPlan =
    ctx.operatingMode === 'enforce' && planAEmpty && gatesInstalled && !notAdopted;
  if (enforceEmptyPlan) {
    actions.push(
      ctx.postGreenPath?.action ||
        '/ark-explore, then one small refactor with /ark-autopilot and your OK'
    );
  }
  if (!ctx.analysisComplete) actions.push('restore complete analysis, then rerun ark-check --doctor');
  if (ctx.designSmells.length > 0 && ctx.postGreenPath) actions.push(ctx.postGreenPath.action);
  if (ctx.coverageHonesty.greenIsNotEnforcement && ctx.coverageHonesty.worseThanNoGate) {
    actions.push('raise governed coverage above a minority slice before treating green as enforcement');
  }
  if (ctx.cov.suggestions.length > 0) actions.push('classify the ungoverned directories (/ark-adopt)');
  if (ctx.packageVersionTruth?.dualTruth) {
    actions.push(
      ctx.dualTruthNext ||
        'bump package.json arkgate pin to match this CLI (or install without --no-install)'
    );
  } else if (ctx.packageVersionTruth?.code === 'PACKAGE_PIN_ABSENT') {
    actions.push(
      ctx.dualTruthNext ||
        'Add arkgate to package.json and install so CI/npx resolve this CLI (PACKAGE_PIN_ABSENT)'
    );
  }
  if (ctx.activeCount > 0) {
    actions.push(
      `resolve the non-baselined violations — see the classified plan (${arkCommand(ctx.root, 'ark-check', '--plan')}), then /ark-autopilot`
    );
  }
  if (ctx.writePath?.gap?.fix && !gatesInstalled) actions.push(ctx.writePath.gap.fix);
  if (!gatesInstalled && missingFiles.length > 0) {
    actions.push(`install gates (${arkCommand(ctx.root, 'ark-check', '--install-agent-gates')})`);
  }
  if (ctx.ciNotFailClosed) {
    const file = ctx.ciNotFailClosed.workflowFile;
    actions.push(
      ctx.ciNotFailClosed.nextAction ||
        (file
          ? `Remove the skippable if: in ${file}, or write .ark/adoption-stance.json with stance: advisory-only`
          : 'Remove the skippable if:, or write .ark/adoption-stance.json with stance: advisory-only')
    );
  }
  const humanSkillGaps = skillGapsForActiveHost(ctx.skillGaps);
  const legacyCodex = humanSkillGaps.some((g) => g.tool === 'codex' && g.legacyPromptsOnly);
  const remainingGaps = humanSkillGaps.filter(
    (g) => !(g.tool === 'codex' && (g.legacyPromptsOnly || g.legacyAdvisory))
  );
  const remMiss = remainingGaps.reduce((s, g) => s + g.missing, 0);
  const remStale = remainingGaps.reduce((s, g) => s + g.stale, 0);
  if (legacyCodex) {
    actions.push('install Codex SKILL.md catalog (--install-agent-gates --skills-only --tools codex --force)');
  }
  if (remMiss > 0) {
    actions.push('install missing /ark-* skills (--install-agent-gates --skills-only --force)');
  } else if (remStale > 0) {
    actions.push('refresh stale /ark-* skills (--install-agent-gates --skills-only --force) — gates are installed, catalog is stale');
  }
  if (ctx.codexHomeGap && ctx.codexConcernActive && ctx.codexHomeGap.duplicateHome) {
    actions.push(
      'remove duplicate Codex home /ark-* skills (project .agents/skills is enough): --install-agent-gates --skills-only --prune-home-duplicates'
    );
  } else if (ctx.codexHomeGap && ctx.codexConcernActive && ctx.codexHomeGap.preferProject !== true) {
    actions.push(
      ctx.codexHomeGap.catalogMetadataInvalid
        ? 'repair invalid Codex home catalog metadata after verifying the newest installed version'
        : 'refresh Codex home skills (--install-agent-gates --skills-only --codex-home --force)'
    );
  }
  for (const gap of ctx.agentHomeGaps) {
    if (agentHomeConcernIsActive(gap.host)) {
      actions.push(
        gap.catalogMetadataInvalid
          ? `repair invalid ${gap.label} home catalog metadata after verifying the newest installed version`
          : `refresh ${gap.label} shared agent skills (${agentHomeRefreshCommand(ctx.root, gap)})`
      );
    }
  }
  if (ctx.analysisComplete && ctx.baselineHonesty?.dirtyBaselineRisk) {
    actions.push('review dirty baseline freezes — fix the contract before trusting green-via-freeze');
  }
  if (ctx.analysisComplete && ctx.staleBaseline > 0) {
    actions.push(
      'tighten the baseline (--update-baseline --force --contract-session --author <steward>)'
    );
  }
  if (ctx.staleRunners.length > 0) {
    actions.push(
      `migrate command runners (${arkCommand(ctx.root, 'ark-check', '--install-agent-gates --migrate-commands')})`
    );
  }
  for (const gap of ctx.adoption.gaps) {
    if (gap.id === 'adoption-stance-missing') continue;
    if (!gap.deferred) actions.push(gap.fix || gap.message);
  }
  if (ctx.safety && ctx.safetyHasEntries) {
    actions.push('resolve strict safety diagnostics before treating CI as enforcement');
  }
  if (ctx.showNewHere) {
    actions.unshift('finish ark start (preview + --apply), then re-run --doctor');
  }
  const unique = mergePostGreenTopActions(actions, ctx.postGreenPath);
  if (ctx.designFitness.designWeak && unique.length === 0 && ctx.postGreenPath) {
    unique.push(ctx.postGreenPath.action);
  }
  if (notAdopted) {
    const next = ctx.notAdoptedNextAction || NOT_ADOPTED_NEXT_ACTION;
    return [next, ...unique.filter((a) => a !== next)];
  }
  return unique;
}
