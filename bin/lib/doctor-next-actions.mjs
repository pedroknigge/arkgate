/**
 * Rank doctor next actions from already-computed facts (no I/O).
 * Lets the human printer show light + #1 before honesty/compass sections.
 */
import { arkCommand, globToRegExp } from '../ark-shared.mjs';
import { skillGapsForActiveHost } from './agent-gates.mjs';
import { agentHomeConcernIsActive, agentHomeRefreshCommand } from './agent-homes.mjs';
import { mergePostGreenTopActions } from './post-green-path.mjs';
import { ADOPTED_NOT, NOT_ADOPTED_NEXT_ACTION } from './adoption-stance.mjs';
import { REQUIRED_GATE_WORKFLOW } from './gate-files.mjs';

/** Package pin may exist; local resolve still failed. Lead with install, not CI. */
export const PACKAGE_UNRESOLVED_NEXT_ACTION =
  'Install arkgate in this project first (npx --package=arkgate, or pnpm add -D arkgate -w / yarn add -D arkgate -W at a workspace root), then re-run --doctor';

export function packageUnresolvedNextAction(ctx) {
  if (ctx?.packageInstalled === false && ctx?.selfHost !== true) {
    return PACKAGE_UNRESOLVED_NEXT_ACTION;
  }
  return null;
}

/** Compact doctor JSON #1 — same rank as collectDoctorNextActions when package is missing. */
export function preferredDoctorPrimaryNextAction({
  adopted,
  packageInstalled,
  selfHost,
  postGreenPath,
  dualTruthNext,
} = {}) {
  return (
    packageUnresolvedNextAction({ packageInstalled, selfHost }) ||
    (adopted === 'not-adopted' ? NOT_ADOPTED_NEXT_ACTION : postGreenPath?.action ?? dualTruthNext ?? null)
  );
}

function missingGateFiles(ctx) {
  const list = Array.isArray(ctx.gatesMissing) ? ctx.gatesMissing : [];
  if (ctx.ciNotFailClosed) {
    return list.filter((item) => item !== REQUIRED_GATE_WORKFLOW);
  }
  return list;
}

/** Ignore a handful of expected Next API dual-matches. */
const DUAL_MATCH_REPAIR_FLOOR = 20;
/** Absolute pile-up even when the tree is huge. */
const DUAL_MATCH_REPAIR_ABSOLUTE = 50;
/** Share of in-scope files that match two+ layers. */
const DUAL_MATCH_REPAIR_SHARE = 0.1;

function isWildcardPattern(pattern) {
  return /[*?]/.test(String(pattern ?? ''));
}

function posixRel(file) {
  return String(file ?? '').split(/\\/).join('/');
}

function layerPatterns(cov, layerName) {
  const rows = Array.isArray(cov?.layers) ? cov.layers : [];
  const row = rows.find((layer) => layer?.name === layerName);
  return Array.isArray(row?.patterns) ? row.patterns : [];
}

function fileMatchesWildcardPatterns(file, patterns) {
  const rel = posixRel(file);
  return patterns.some((pattern) => isWildcardPattern(pattern) && globToRegExp(pattern).test(rel));
}

/**
 * Domain overlap is a glob leak when Domain matched the sample via a wildcard.
 * Exact-file Domain listings under another layer glob (mother generated CLI)
 * are intentional dual-lists, not a repair. No layer patterns → keep the
 * Domain-sample shortcut so older #269 fixtures still fire.
 */
function domainSampleIsGlobLeak(row, cov) {
  if (!(row?.layers ?? []).includes('DomainModel')) return false;
  const patterns = layerPatterns(cov, 'DomainModel');
  if (patterns.length === 0) return true;
  return fileMatchesWildcardPatterns(row.file, patterns);
}

/** Overlapping roots from matching Domain wildcards, else sample path prefixes. */
export function overlappingRootsFromCoverage(cov) {
  const samples = Array.isArray(cov?.dualMembership?.samples) ? cov.dualMembership.samples : [];
  const domainPatterns = layerPatterns(cov, 'DomainModel');
  const fromPatterns = [];
  for (const row of samples) {
    const rel = posixRel(row?.file);
    for (const pattern of domainPatterns) {
      if (isWildcardPattern(pattern) && globToRegExp(pattern).test(rel)) {
        fromPatterns.push(pattern);
      }
    }
  }
  if (fromPatterns.length > 0) {
    return [...new Set(fromPatterns)].slice(0, 2);
  }
  const derived = [];
  for (const row of samples) {
    const first = posixRel(row?.file).split('/').filter(Boolean)[0];
    if (first) derived.push(`${first}/**`);
  }
  return [...new Set(derived)].slice(0, 2);
}

/**
 * Dual-match is a lying layer map when it is large — especially Domain
 * overlapping Presentation/Application after over-broad monorepo start globs.
 * Intentional file+glob dual-lists (exact Domain files under Tooling `bin/**`)
 * do not steal doctor #1.
 */
export function dualMatchNeedsGlobRepair(cov) {
  const count = Number(cov?.dualMembership?.count) || 0;
  if (count < DUAL_MATCH_REPAIR_FLOOR) return false;
  const total = Number(cov?.totalFiles ?? cov?.governed?.totalFiles) || 0;
  const samples = Array.isArray(cov?.dualMembership?.samples) ? cov.dualMembership.samples : [];
  const domainOverlap = samples.some((row) => domainSampleIsGlobLeak(row, cov));
  if (domainOverlap) return true;
  if (total > 0 && count / total >= DUAL_MATCH_REPAIR_SHARE) return true;
  return count >= DUAL_MATCH_REPAIR_ABSOLUTE;
}

export function overlappingGlobNextAction(cov) {
  const count = Number(cov?.dualMembership?.count) || 0;
  const sample = Array.isArray(cov?.dualMembership?.samples) ? cov.dualMembership.samples[0] : null;
  const layers = Array.isArray(sample?.layers) ? sample.layers.filter(Boolean) : [];
  const example =
    sample?.file && layers.length > 1
      ? `${sample.file} matches ${layers.join(' + ')}`
      : 'the same files match two layer globs';
  const roots = overlappingRootsFromCoverage(cov);
  const rootPhrase = roots.length > 0 ? roots.join(', ') : 'the overlapping globs';
  return `Fix overlapping layer globs — ${count} files match more than one layer (e.g. ${example}). Narrow overlapping roots like ${rootPhrase}. Then /ark-adopt`;
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
  const resolvePkg = packageUnresolvedNextAction(ctx);
  if (resolvePkg) actions.push(resolvePkg);
  const nudge = ctx.stewardNudge;
  if (
    nudge &&
    (nudge.needsStewards || nudge.drift || nudge.emptyStewardsPastGrace) &&
    nudge.nextAction
  ) {
    actions.push(nudge.nextAction);
  }
  if (ctx.layerOwners?.required && ctx.layerOwners.nextAction) {
    actions.push(ctx.layerOwners.nextAction);
  }
  const humanSkillGaps = skillGapsForActiveHost(ctx.skillGaps ?? []);
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
  const enforceEmptyPlan =
    ctx.operatingMode === 'enforce' && planAEmpty && gatesInstalled && !notAdopted;
  // Stale/missing doors outrank the Shape nudge — a colleague on an old catalog
  // must see skills-only refresh as #1, not leftover-design explore.
  if (enforceEmptyPlan && remMiss === 0 && remStale === 0 && !legacyCodex) {
    actions.push(
      ctx.postGreenPath?.action ||
        '/ark-explore, then one small refactor with /ark-autopilot and your OK'
    );
  }
  if (ctx.adrPresence?.missing && ctx.adrPresence.nextAction) {
    actions.push(ctx.adrPresence.nextAction);
  }
  if (ctx.statusTransitionCatalog?.nextAction) {
    actions.push(ctx.statusTransitionCatalog.nextAction);
  } else if (ctx.statesTransitions?.nextAction) {
    actions.push(ctx.statesTransitions.nextAction);
  }
  if (ctx.noDomainFrontend?.nextAction) {
    actions.push(ctx.noDomainFrontend.nextAction);
  }
  if (ctx.prototypeShortcuts?.nextAction) {
    actions.push(ctx.prototypeShortcuts.nextAction);
  }
  if (ctx.invariantTestsPath?.missing && ctx.invariantTestsPath.nextAction) {
    actions.push(ctx.invariantTestsPath.nextAction);
  }
  if (ctx.invariantCoverageRoots?.missing && ctx.invariantCoverageRoots.nextAction) {
    actions.push(ctx.invariantCoverageRoots.nextAction);
  }
  if (!ctx.analysisComplete) actions.push('restore complete analysis, then rerun ark-check --doctor');
  if (ctx.designSmells.length > 0 && ctx.postGreenPath) actions.push(ctx.postGreenPath.action);
  if (ctx.coverageHonesty.greenIsNotEnforcement && ctx.coverageHonesty.worseThanNoGate) {
    actions.push('raise governed coverage above a minority slice before treating green as enforcement');
  }
  const overlapAction = dualMatchNeedsGlobRepair(ctx.cov) ? overlappingGlobNextAction(ctx.cov) : null;
  if (overlapAction) actions.push(overlapAction);
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
  if (resolvePkg) {
    return [resolvePkg, ...unique.filter((a) => a !== resolvePkg)];
  }
  if (overlapAction) {
    return [overlapAction, ...unique.filter((a) => a !== overlapAction)];
  }
  if (notAdopted) {
    const next = ctx.notAdoptedNextAction || NOT_ADOPTED_NEXT_ACTION;
    return [next, ...unique.filter((a) => a !== next)];
  }
  return unique;
}
