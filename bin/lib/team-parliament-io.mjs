/**
 * Team parliament I/O — git base refs, changed paths, pin/contract/baseline compare.
 * Pure classification lives in team-parliament.mjs (Domain).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
};

/** Kill hung git instead of stalling CI. */
export const SPAWN_TIMEOUT_MS = 8000;

function runGit(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: SPAWN_TIMEOUT_MS,
  });
}

export function safeGitRef(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(value) &&
    !value.includes('..')
  );
}

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

export function discoverTeamBaseRef(root, preferred) {
  if (safeGitRef(preferred)) return preferred;
  const candidates = ['origin/dev', 'origin/main', 'origin/master', 'dev', 'main'];
  for (const candidate of candidates) {
    const exists = runGit(root, ['rev-parse', '--verify', `${candidate}^{commit}`]);
    if (exists.status === 0) return candidate;
  }
  return null;
}

export function listChangedPaths(root, baseRef) {
  if (!safeGitRef(baseRef)) {
    return { ok: false, paths: [], error: 'Invalid or missing git base ref.' };
  }
  const verify = runGit(root, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
  if (verify.status !== 0) {
    return { ok: false, paths: [], error: `Cannot resolve git ref ${baseRef}.` };
  }
  const diff = runGit(root, ['diff', '--name-only', `${baseRef}...HEAD`]);
  const unstaged = runGit(root, ['diff', '--name-only']);
  const staged = runGit(root, ['diff', '--name-only', '--cached']);
  const untracked = runGit(root, ['ls-files', '--others', '--exclude-standard']);
  if (diff.status !== 0) {
    return { ok: false, paths: [], error: diff.stderr.trim() || `git diff ${baseRef} failed.` };
  }
  const paths = [
    ...diff.stdout.split('\n'),
    ...unstaged.stdout.split('\n'),
    ...staged.stdout.split('\n'),
    ...untracked.stdout.split('\n'),
  ]
    .map((line) => line.trim().replace(/\\/g, '/'))
    .filter(Boolean);
  return { ok: true, paths: [...new Set(paths)].sort(), error: null };
}

export function gitShowText(root, baseRef, relPath) {
  if (!safeGitRef(baseRef) || !relPath) return null;
  const shown = runGit(root, ['show', `${baseRef}:${relPath}`]);
  if (shown.status !== 0) return null;
  return shown.stdout;
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
    if (!next.policyBaseRef && (next.contractDiff || next.changed || next.against)) {
      next.policyBaseRef = teamBase;
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
  const listed = againstRef ? listChangedPaths(root, againstRef) : { ok: true, paths: [], error: null };
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
    return {
      halt: { exitCode: 2, message: listed.error || 'Cannot resolve team base ref.', teamParliament },
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

export function ungovernedDumpMessage(dumped) {
  return `New ungoverned source in this diff: ${dumped.slice(0, 8).join(', ')}${dumped.length > 8 ? '…' : ''}. Classify via /ark-adopt (contract session) or move into a governed layer.`;
}

export function filterChangedGovernedFiles(allGovernedFiles, root, changedPaths, normalizeRel) {
  if (!changedPaths?.length) return allGovernedFiles;
  const changedSet = new Set(changedPaths);
  return allGovernedFiles.filter((abs) => changedSet.has(normalizeRel(path.relative(root, abs))));
}

export function applyAgainstRatchet({
  violations,
  againstRef,
  root,
  changed,
  changedPaths,
  occurrenceKeys,
}) {
  const baseRaw = readJsonMaybe(gitShowText(root, againstRef, '.ark-baseline.json'));
  const baseKeys = new Set(baselineKeysFromDocument(baseRaw));
  const vsBaseActive = violations.filter((_, index) => !baseKeys.has(occurrenceKeys[index]));
  const changedSet = new Set(changedPaths ?? []);
  const activeViolations = changed
    ? vsBaseActive.filter((violation) =>
        changedSet.has(String(violation.file || '').replace(/\\/g, '/'))
      )
    : vsBaseActive;
  return {
    activeViolations,
    suppressed: violations.filter((violation) => !activeViolations.includes(violation)),
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
