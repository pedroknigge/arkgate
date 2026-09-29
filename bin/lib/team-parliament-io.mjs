/**
 * Team parliament I/O — git base refs, changed paths, pin/contract/baseline compare.
 * Pure classification lives in team-parliament.mjs (Domain).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { applyAdvisorySiblingRatchet, globToRegExp } from '../ark-layer-match.mjs';
import {
  baselineKeysFromDocument,
  classifyBaselineKeyDelta,
  classifyChangeSet,
  evaluateTeamGate,
  formatVsBaseLine,
  isTeamPersona,
  mapPolicyClassToKind,
  parseCodeownersHandles,
  personaCheckBudget,
  resolveStewardHandle,
  suggestStewards,
} from './team-parliament.mjs';
import {
  SPAWN_TIMEOUT_MS,
  TEAM_BASE_CANDIDATES,
  discoverTeamBaseRef,
  gitShowText,
  listChangedPaths,
  runGit,
  safeGitRef,
} from './git-change-scope.mjs';

export {
  baselineKeysFromDocument,
  classifyBaselineKeyDelta,
  classifyChangeSet,
  evaluateTeamGate,
  formatVsBaseLine,
  isTeamPersona,
  mapPolicyClassToKind,
  parseCodeownersHandles,
  personaCheckBudget,
  resolveStewardHandle,
  suggestStewards,
  SPAWN_TIMEOUT_MS,
  TEAM_BASE_CANDIDATES,
  discoverTeamBaseRef,
  gitShowText,
  listChangedPaths,
  safeGitRef,
};

export function contractSessionFrom(args, env = process.env) {
  if (args?.contractSession === true) return true;
  const raw = env.ARK_CONTRACT_SESSION;
  return raw === '1' || raw === 'true';
}

export function resolveTeamAuthor(args, env = process.env) {
  return resolveStewardHandle({
    explicit: typeof args?.author === 'string' ? args.author : null,
    githubActor: env.GITHUB_ACTOR,
    arkSteward: env.ARK_STEWARD,
    authorEmail: env.GIT_AUTHOR_EMAIL,
    gitName: env.GIT_AUTHOR_NAME,
  });
}

export function readJsonMaybe(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function arkgatePinFromPackageJson(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bags = [raw.dependencies, raw.devDependencies, raw.optionalDependencies];
  for (const bag of bags) {
    if (bag && typeof bag.arkgate === 'string' && bag.arkgate.trim()) return bag.arkgate.trim();
  }
  if (raw.name === 'arkgate' && typeof raw.version === 'string') return raw.version;
  return null;
}

function sha256Text(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export function collectVsBaseFacts({ root, baseRef, configRel = 'ark.config.json' }) {
  const localConfigPath = path.join(root, configRel);
  const localPkgPath = path.join(root, 'package.json');
  const localBaselinePath = path.join(root, '.ark-baseline.json');
  const localConfig = fs.existsSync(localConfigPath) ? fs.readFileSync(localConfigPath, 'utf8') : '';
  const localPkg = fs.existsSync(localPkgPath)
    ? readJsonMaybe(fs.readFileSync(localPkgPath, 'utf8'))
    : null;
  const localBaseline = fs.existsSync(localBaselinePath)
    ? readJsonMaybe(fs.readFileSync(localBaselinePath, 'utf8'))
    : null;
  const baseConfig = gitShowText(root, baseRef, configRel) ?? '';
  const basePkg = readJsonMaybe(gitShowText(root, baseRef, 'package.json'));
  const baseBaseline = readJsonMaybe(gitShowText(root, baseRef, '.ark-baseline.json'));
  const localKeys = baselineKeysFromDocument(localBaseline);
  const baseKeys = baselineKeysFromDocument(baseBaseline);
  const grew = classifyBaselineKeyDelta(baseKeys, localKeys).grow.length > 0;
  const facts = {
    baseRef,
    pinLocal: arkgatePinFromPackageJson(localPkg),
    pinBase: arkgatePinFromPackageJson(basePkg),
    contractEqual: Boolean(localConfig) && localConfig === baseConfig,
    baselineGrew: grew,
  };
  if (localConfig && baseConfig && !facts.contractEqual) {
    facts.contractEqual = sha256Text(localConfig) === sha256Text(baseConfig);
  }
  return { ...facts, line: formatVsBaseLine(facts) };
}

export function teamStewardsFromConfig(config) {
  return Array.isArray(config?.stewards) ? config.stewards.filter((s) => typeof s === 'string') : [];
}

export function applyPersonaDefaults(args) {
  const next = { ...args };
  if (!isTeamPersona(next.persona)) return next;
  const budget = personaCheckBudget(next.persona);
  if (budget.scan === 'none' || budget.scan === 'changed' || budget.scan === 'changed+ungoverned') {
    next.changed = true;
  }
  if (budget.scan === 'changed+ungoverned') next.failUngoverned = true;
  if (budget.contractDiff) next.contractDiff = true;
  if (next.persona === 'steward') next.contractSession = true;
  return next;
}

export function bindTeamBaseRefs(args, root) {
  const next = applyPersonaDefaults(args);
  const teamBase = discoverTeamBaseRef(
    root,
    next.base || next.against || next.policyBaseRef || next.baseRef
  );
  if (teamBase) {
    if (!next.against && (next.changed || next.contractDiff || next.persona)) {
      next.against = teamBase;
    }
    // A contract session must classify the law change, or loosening skips steward/ack checks.
    // policyBaseFromTeam: a base without the contract yet is adoption (no predecessor), not an error.
    if (!next.policyBaseRef && (next.contractDiff || next.changed || next.against || next.contractSession)) {
      next.policyBaseRef = teamBase;
      next.policyBaseFromTeam = true;
    }
    if (!next.baseRef && next.failOnNewSmells) next.baseRef = teamBase;
  }
  return { args: next, teamBase };
}

export function teamCheckRequested(args, config) {
  return Boolean(
    args.changed ||
      args.contractDiff ||
      args.against ||
      args.persona ||
      args.contractSession ||
      args.updateBaseline ||
      (args.strictMerge && teamStewardsFromConfig(config).length > 0)
  );
}

export function runTeamPreflight({ root, args, config, policyDelta, teamBase }) {
  const weakening =
    policyDelta?.classification === 'weakening' ||
    policyDelta?.classification === 'judgment-required';
  if (weakening && !contractSessionFrom(args)) {
    const message =
      'Weakening the contract requires --contract-session (and --policy-ack bound to both hashes).';
    const teamParliament = {
      deny: true,
      reasonId: 'steward-only-loosen',
      message,
      kinds: ['loosen'],
    };
    return {
      halt: { exitCode: 1, message, teamParliament, fail: true },
      teamParliament,
      changedPaths: [],
    };
  }
  if (!teamCheckRequested(args, config)) {
    return { halt: null, teamParliament: null, changedPaths: [] };
  }
  const againstRef = args.against || teamBase;
  if ((args.local || args.changed || args.contractDiff) && !againstRef) {
    const reasonId = args.local
      ? 'local-needs-base'
      : args.changed
        ? 'changed-needs-base'
        : 'contract-diff-needs-base';
    const message = args.local
      ? '--local needs a git merge base so it can reuse --changed. Pass --base <ref> (for example --base HEAD or --base origin/main). The merge gate stays --strict-merge.'
      : args.changed
        ? changedNeedsBaseMessage(args)
        : contractDiffNeedsBaseMessage(args);
    const teamParliament = { deny: false, reasonId, message };
    return {
      halt: { exitCode: 2, message, teamParliament },
      teamParliament,
      changedPaths: [],
    };
  }
  // No base ref means the change set was never computed: never report it as empty.
  const listed = againstRef
    ? listChangedPaths(root, againstRef)
    : { ok: false, paths: [], error: 'No git base ref resolved.' };
  const changedPaths = listed.ok ? listed.paths : [];
  const changeSet = classifyChangeSet(changedPaths);
  const baseBaselineRaw = againstRef
    ? readJsonMaybe(gitShowText(root, againstRef, '.ark-baseline.json'))
    : null;
  const localBaselinePath = path.join(root, args.baseline || '.ark-baseline.json');
  const localBaselineRaw = fs.existsSync(localBaselinePath)
    ? readJsonMaybe(fs.readFileSync(localBaselinePath, 'utf8'))
    : null;
  const baselineDelta = classifyBaselineKeyDelta(
    baselineKeysFromDocument(baseBaselineRaw),
    baselineKeysFromDocument(localBaselineRaw)
  );
  const policyKind = mapPolicyClassToKind(policyDelta?.classification ?? null);
  const verdict = evaluateTeamGate({
    changeSet,
    contractSession: contractSessionFrom(args),
    policyKind,
    baselineGrowCount: baselineDelta.grow.length,
    stewards: teamStewardsFromConfig(config),
    author: resolveTeamAuthor(args),
  });
  const teamParliament = {
    baseRef: againstRef,
    changeSet,
    policyKind,
    baselineGrow: baselineDelta.grow.length,
    baselineShrink: baselineDelta.shrink.length,
    ...verdict,
    changedPathError: listed.ok ? null : listed.error,
  };
  if (!listed.ok && (args.changed || args.against || args.contractDiff)) {
    // The verdict above ran over an uncomputed diff: never label it `ok`.
    teamParliament.deny = false;
    teamParliament.reasonId = 'changed-paths-unavailable';
    teamParliament.message = `${listed.error || 'Cannot list changed paths.'} Pass --base <ref> or fix the git error, or run a full check without diff flags.`;
    return {
      halt: { exitCode: 2, message: teamParliament.message, teamParliament },
      teamParliament,
      changedPaths,
    };
  }
  if (verdict.deny) {
    return {
      halt: { exitCode: 1, message: verdict.message, teamParliament, fail: true },
      teamParliament,
      changedPaths,
    };
  }
  if (args.changed && changeSet.productPaths.length === 0 && !changeSet.hasLaw) {
    return {
      halt: { exitCode: 0, cheap: true, teamParliament },
      teamParliament,
      changedPaths,
    };
  }
  return { halt: null, teamParliament, changedPaths };
}

/** `--changed` / `--persona touch|contributor|agent` without a resolvable merge base. */
export function changedNeedsBaseMessage(args) {
  const flag = args?.persona ? `--persona ${args.persona}` : '--changed';
  return `${flag} needs a git merge base to know which files changed, and none was found (tried ${TEAM_BASE_CANDIDATES.join(', ')}; or this is not a git repository). Pass --base <ref> (for example --base HEAD or --base origin/main), or run without ${flag} for a full-tree check.`;
}

export function contractDiffNeedsBaseMessage(args) {
  const flag = args?.persona ? `--persona ${args.persona}` : '--contract-diff';
  return `${flag} compares the contract and .ark-baseline.json against a git base, and none was found (tried ${TEAM_BASE_CANDIDATES.join(', ')}; or this is not a git repository). Pass --base <ref> (for example --base origin/main), or run a plain full-tree check without ${flag}.`;
}

export function ungovernedDumpMessage(dumped) {
  return `New ungoverned source in this diff: ${dumped.slice(0, 8).join(', ')}${dumped.length > 8 ? '…' : ''}. Classify via /ark-adopt (contract session) or move into a governed layer.`;
}

export function filterChangedGovernedFiles(allGovernedFiles, root, changedPaths, normalizeRel) {
  if (!changedPaths?.length) return allGovernedFiles;
  const changedSet = new Set(changedPaths);
  return allGovernedFiles.filter((abs) => changedSet.has(normalizeRel(path.relative(root, abs))));
}

/**
 * `--changed` scans a subset, so a layer whose files were not touched looks empty to the
 * kernel. Keep CONFIG_LAYER_PATTERN_NO_MATCHES only when the FULL governed tree has no
 * match either (a real typo). `loadFullFiles` is lazy: the full walk runs only when needed.
 */
export function pruneScopedPatternWarnings(warnings, root, loadFullFiles) {
  const isNoMatch = (w) =>
    (w?.ruleId ?? w?.code) === 'CONFIG_LAYER_PATTERN_NO_MATCHES' && typeof w.pattern === 'string';
  if (!Array.isArray(warnings) || !warnings.some(isNoMatch)) return warnings;
  const rels = loadFullFiles().map((abs) => path.relative(root, abs).split(path.sep).join('/'));
  for (let i = warnings.length - 1; i >= 0; i -= 1) {
    if (!isNoMatch(warnings[i])) continue;
    let expression;
    try {
      expression = globToRegExp(warnings[i].pattern);
    } catch {
      continue;
    }
    if (rels.some((rel) => expression.test(rel))) warnings.splice(i, 1);
  }
  return warnings;
}

export function applyAgainstRatchet({
  violations,
  againstRef,
  root,
  changed,
  changedPaths,
  occurrenceKeys,
  rules,
  layers,
}) {
  const baseRaw = readJsonMaybe(gitShowText(root, againstRef, '.ark-baseline.json'));
  const baseKeys = new Set(baselineKeysFromDocument(baseRaw));
  const judged = baseRaw ? applyAdvisorySiblingRatchet(violations, occurrenceKeys, baseKeys, { rules, layers }) : violations;
  const vsBaseActive = judged.filter((_, index) => !baseKeys.has(occurrenceKeys[index]));
  const changedSet = new Set(changedPaths ?? []);
  // A CROSS_PARENT_VIA_SHARED path belongs to the change when any file on it changed.
  const touched = (v) => [v.file, ...(Array.isArray(v.via) ? v.via : []), ...(v.reasonId === 'CROSS_PARENT_VIA_SHARED' ? [v.target] : [])];
  const activeViolations = changed
    ? vsBaseActive.filter((v) => touched(v).some((f) => changedSet.has(String(f || '').replace(/\\/g, '/'))))
    : vsBaseActive;
  return {
    activeViolations,
    suppressed: judged.filter((violation) => !activeViolations.includes(violation)),
  };
}

/** Cheap doctor-path probe: skip git spawns on non-repos (hook-path bench tmpdirs). */
function gitDirPresent(root) {
  let dir = path.resolve(root);
  for (let i = 0; i < 10; i += 1) {
    try {
      if (fs.existsSync(path.join(dir, '.git'))) return true;
    } catch {
      return false;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

function gitAuthors(root) {
  if (!gitDirPresent(root)) return [];
  const log = runGit(root, ['log', '--format=%aN<%aE>', '--max-count=300']);
  if (log.status !== 0) return [];
  const ids = [];
  for (const line of log.stdout.split('\n')) {
    const match = line.trim().match(/^(.*)<([^>]+)>$/);
    if (!match) continue;
    const name = match[1].trim();
    const email = match[2].trim();
    ids.push(email || name);
  }
  return ids;
}

function readCodeowners(root) {
  for (const rel of ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    try {
      return parseCodeownersHandles(fs.readFileSync(full, 'utf8'));
    } catch {
      return [];
    }
  }
  return [];
}

function gitFirstAddIso(root, relPath) {
  if (!gitDirPresent(root)) return null;
  const log = runGit(root, ['log', '--diff-filter=A', '--follow', '--format=%cI', '--', relPath]);
  if (log.status !== 0) return null;
  const lines = log.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : null;
}

/** Tooling clock: git first-add of ark.config.json vs injected `now`. Domain never clocks. */
export function adoptAgeDaysFromGit(root, relPath, now) {
  const iso = gitFirstAddIso(root, relPath);
  if (!iso) return { days: null, source: 'unavailable' };
  const then = Date.parse(iso);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(then) || !Number.isFinite(nowMs)) return { days: null, source: 'unavailable' };
  return { days: Math.floor((nowMs - then) / 86_400_000), source: 'git-first-add' };
}

/** Advisory residual. Never flips `valid` / `goal.met`. Missing git is unknown age, not green. */
export function collectStewardNudge(root, config, options = {}) {
  const now = options.now instanceof Date ? options.now : options.now != null ? new Date(options.now) : new Date();
  const age = adoptAgeDaysFromGit(root, options.configRel || 'ark.config.json', now);
  return suggestStewards({
    existingStewards: teamStewardsFromConfig(config),
    gitAuthors: gitAuthors(root),
    codeowners: readCodeowners(root),
    adoptAgeDays: age.days,
  });
}
