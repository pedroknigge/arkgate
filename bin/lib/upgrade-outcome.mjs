/**
 * UpgradeOutcome — one value for `upgrade --apply`.
 *
 * Sketch (D2). Callers see one object and one exit mapping. Gitignore
 * detection, rule aggregation, and version-note lookup stay in here.
 *
 *   classifyManagedAsset({ ..., gitignored }) →
 *     { state: 'absent-local', requiresConsent: false } when recorded + gitignored + missing
 *
 *   runPostUpgradeVerification(root) →
 *     { verdict: 'green'|'red'|'skipped', failing: [{ ruleId, count, sample }], behaviorChanges: string[] }
 *
 *   exitCodeFor(outcome) →
 *     0 applied+green (also nothing-to-apply / verification skipped)
 *     3 applied+red
 *     2 blocked
 *     1 error
 *
 * JSON fields on the existing upgrade payload are additive (`outcome`, `postUpgrade`,
 * per-asset `reason` / `nextCommand`, state `absent-local`).
 */
import { spawnSync } from 'node:child_process';

import { behaviorChangeLines } from './upgrade-behavior-changes.mjs';

/**
 * @typedef {'applied-green'|'applied-skipped'|'applied-red'|'blocked'|'error'|'nothing'|'preview'} UpgradeOutcomeKind
 * @typedef {{ ruleId: string, count: number, sample: string }} FailingRule
 * @typedef {{
 *   verdict: 'green'|'red'|'skipped',
 *   failing: FailingRule[],
 *   behaviorChanges: string[],
 *   mode: 'strict-merge'|'skipped',
 *   exitCode: number,
 *   stderr?: string,
 * }} PostUpgradeVerification
 * @typedef {{
 *   kind: UpgradeOutcomeKind,
 *   applied: boolean,
 *   blocked: boolean,
 *   postUpgrade: PostUpgradeVerification|null,
 *   error?: string,
 * }} UpgradeOutcome
 */

export const ABSENT_LOCAL_REASON =
  'Recorded managed file is missing and gitignored (per-machine file). Recreated without consent.';

/**
 * @param {string} state
 * @returns {string}
 */
export function blockedAssetReason(state) {
  if (state === 'missing') {
    return 'Recorded managed file is missing and is not gitignored. Apply will not recreate a deleted file without consent.';
  }
  if (state === 'conflicted') {
    return 'Managed base and local edits both changed. Apply will not overwrite without consent.';
  }
  return 'Apply needs consent before changing this managed file.';
}

/**
 * Paths git would ignore. Not a git repo, or git missing → empty set
 * (fail closed toward consent). Global excludes are not consulted.
 *
 * @param {string} root
 * @param {string[]} relativePaths
 * @returns {Set<string>}
 */
export function gitignoredPathSet(root, relativePaths) {
  const paths = [...new Set(relativePaths.filter((entry) => typeof entry === 'string' && entry.length > 0))];
  if (paths.length === 0) return new Set();
  let result;
  try {
    result = spawnSync(
      'git',
      ['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-z', '--stdin'],
      {
        cwd: root,
        input: `${paths.join('\0')}\0`,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
        },
      }
    );
  } catch {
    return new Set();
  }
  if (!result || result.error || (result.status !== 0 && result.status !== 1)) return new Set();
  const ignored = new Set();
  for (const entry of String(result.stdout ?? '').split('\0')) {
    if (entry) ignored.add(entry);
  }
  return ignored;
}

/**
 * @param {unknown} check
 * @returns {FailingRule[]}
 */
export function aggregateFailingRules(check) {
  const violations = Array.isArray(check?.violations) ? check.violations : [];
  /** @type {Map<string, FailingRule>} */
  const groups = new Map();
  for (const violation of violations) {
    if (!violation || typeof violation !== 'object') continue;
    if (violation.failsStrict === false) continue;
    const ruleId = typeof violation.ruleId === 'string' && violation.ruleId.trim()
      ? violation.ruleId.trim()
      : 'UNKNOWN';
    const existing = groups.get(ruleId) ?? { ruleId, count: 0, sample: '' };
    existing.count += 1;
    if (!existing.sample) existing.sample = sampleForViolation(violation, ruleId);
    groups.set(ruleId, existing);
  }
  return [...groups.values()].sort(
    (left, right) => right.count - left.count || left.ruleId.localeCompare(right.ruleId)
  );
}

/**
 * @param {Record<string, unknown>} violation
 * @param {string} ruleId
 */
function sampleForViolation(violation, ruleId) {
  const file = typeof violation.file === 'string'
    ? violation.file
    : typeof violation.path === 'string'
      ? violation.path
      : '';
  const line = Number.isInteger(violation.line) ? `:${violation.line}` : '';
  const where = file ? `${file}${line}` : '';
  const message = typeof violation.message === 'string' ? violation.message.trim() : '';
  const sample = [where, message].filter(Boolean).join(' — ') || ruleId;
  return sample.length > 180 ? `${sample.slice(0, 177)}...` : sample;
}

/**
 * @param {string} stdout
 * @returns {Record<string, unknown>|null}
 */
export function parseCheckStdout(stdout) {
  const text = typeof stdout === 'string' ? stdout.trim() : '';
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

/**
 * @param {string} root
 * @param {string} arkCheck
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function spawnArchitectureCheck(root, arkCheck) {
  if (typeof arkCheck !== 'string' || !arkCheck) {
    return { exitCode: 1, stdout: '', stderr: 'architecture check binary is missing' };
  }
  const result = spawnSync(
    process.execPath,
    [arkCheck, '--root', root, '--config', 'ark.config.json', '--strict-merge', '--json'],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }
  );
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Structured post-upgrade verification. Reuses check JSON (rule ids), and
 * attaches behavior-change lines from the shipped per-version table.
 *
 * @param {string} root
 * @param {{
 *   strict?: boolean,
 *   arkCheck?: string,
 *   packageVersion?: string,
 *   checkResult?: { exitCode?: number, status?: number, stdout?: string, stderr?: string },
 * }} [options]
 * @returns {PostUpgradeVerification}
 */
export function runPostUpgradeVerification(root, options = {}) {
  const behaviorChanges = behaviorChangeLines();
  if (options.strict === false) {
    return {
      verdict: 'skipped',
      failing: [],
      behaviorChanges,
      mode: 'skipped',
      exitCode: 0,
    };
  }
  const raw = options.checkResult ?? spawnArchitectureCheck(root, options.arkCheck);
  const parsed = parseCheckStdout(raw.stdout ?? '');
  const failing = aggregateFailingRules(parsed);
  const exitCode = raw.exitCode ?? raw.status ?? 1;
  const red = exitCode !== 0 || parsed?.ok === false || parsed?.valid === false;
  if (red && failing.length === 0) {
    const sampleSource = String(raw.stderr || 'architecture check failed').trim() || 'architecture check failed';
    failing.push({
      ruleId: 'ARCHITECTURE_CHECK',
      count: 1,
      sample: sampleSource.length > 180 ? `${sampleSource.slice(0, 177)}...` : sampleSource,
    });
  }
  const stderr = typeof raw.stderr === 'string' && raw.stderr.trim() ? raw.stderr.trim() : undefined;
  return {
    verdict: red ? 'red' : 'green',
    failing: red ? failing : [],
    behaviorChanges,
    mode: 'strict-merge',
    exitCode: red ? (exitCode || 1) : 0,
    ...(stderr ? { stderr } : {}),
  };
}

/**
 * @param {{
 *   applied?: boolean,
 *   blocked?: boolean,
 *   nothingToApply?: boolean,
 *   postUpgrade?: PostUpgradeVerification|null,
 *   error?: unknown,
 * }} input
 * @returns {UpgradeOutcome}
 */
export function upgradeOutcome(input) {
  if (input.error != null && input.error !== false) {
    const message = input.error instanceof Error ? input.error.message : String(input.error);
    return { kind: 'error', applied: false, blocked: false, postUpgrade: null, error: message };
  }
  if (input.blocked) {
    return { kind: 'blocked', applied: false, blocked: true, postUpgrade: null };
  }
  if (input.nothingToApply && !input.applied) {
    return { kind: 'nothing', applied: false, blocked: false, postUpgrade: null };
  }
  const postUpgrade = input.postUpgrade ?? null;
  if (postUpgrade?.verdict === 'red') {
    return { kind: 'applied-red', applied: true, blocked: false, postUpgrade };
  }
  if (postUpgrade?.verdict === 'skipped') {
    return { kind: 'applied-skipped', applied: Boolean(input.applied), blocked: false, postUpgrade };
  }
  return { kind: 'applied-green', applied: Boolean(input.applied), blocked: false, postUpgrade };
}

/**
 * @param {UpgradeOutcome|null|undefined} outcome
 * @returns {0|1|2|3}
 */
export function exitCodeFor(outcome) {
  switch (outcome?.kind) {
    case 'applied-green':
    case 'applied-skipped':
    case 'nothing':
    case 'preview':
      return 0;
    case 'applied-red':
      return 3;
    case 'blocked':
      return 2;
    case 'error':
      return 1;
    default:
      return 1;
  }
}

/**
 * @param {{ mode?: string, exitCode?: number, verdict?: string }} [verification]
 * @returns {boolean|null}
 */
export function architectureVerificationOk(verification) {
  if (!verification || verification.mode === 'skipped' || verification.verdict === 'skipped') return null;
  if (verification.verdict === 'green') return true;
  if (verification.verdict === 'red') return false;
  if (verification.exitCode === 0) return true;
  if (typeof verification.exitCode === 'number') return false;
  return null;
}

/**
 * @param {{ mode?: string, exitCode?: number, verdict?: string, failing?: FailingRule[] }} [verification]
 * @returns {string}
 */
export function architectureVerificationDetail(verification) {
  if (!verification || verification.mode === 'skipped' || verification.verdict === 'skipped') {
    return 'Strict architecture verification was skipped (--no-strict).';
  }
  const code = verification.exitCode;
  if (architectureVerificationOk(verification) === true) {
    return 'Strict-merge architecture verification passed.';
  }
  const failing = Array.isArray(verification.failing) ? verification.failing : [];
  const rules = failing.map((row) => `${row.ruleId} ×${row.count}`).join(', ');
  const head = `Architecture verification exit ${code ?? 'unknown'}.`;
  if (!rules) return head;
  return `${head} Failing rules: ${rules}. Read behaviorChanges before editing code.`;
}

/**
 * @param {{ assets?: Array<{ blocked?: boolean, path?: string, state?: string, reason?: string, nextCommand?: string }>, blocked?: boolean, nextCommand?: string }} plan
 * @param {{ refused?: boolean }} [options]
 * @returns {string[]}
 */
export function formatBlockedAssets(plan, options = {}) {
  const blocked = (plan?.assets ?? []).filter((asset) => asset?.blocked);
  if (blocked.length === 0) return [];
  const lines = [options.refused ? 'Apply refused.' : 'Blocked until you consent:'];
  for (const asset of blocked) {
    const reason = asset.reason || blockedAssetReason(asset.state ?? '');
    lines.push(`  ${asset.path} — ${reason}`);
  }
  const next = blocked.find((asset) => asset.nextCommand)?.nextCommand ?? plan?.nextCommand;
  if (next) lines.push(`Next: ${next}`);
  return lines;
}

/**
 * @param {PostUpgradeVerification|null|undefined} postUpgrade
 * @returns {string[]}
 */
export function formatPostUpgradeHuman(postUpgrade) {
  if (!postUpgrade) return [];
  const lines = [`Post-upgrade verification: ${postUpgrade.verdict}.`];
  if (postUpgrade.verdict !== 'red') return lines;
  lines.push('Failing rules:');
  const failing = postUpgrade.failing ?? [];
  if (failing.length === 0) lines.push('  (check returned red without a rule id)');
  for (const row of failing) {
    lines.push(`  ${row.ruleId} ×${row.count} — ${row.sample}`);
  }
  lines.push('Read behaviorChanges before editing code.');
  for (const note of postUpgrade.behaviorChanges ?? []) lines.push(`  ${note}`);
  return lines;
}
