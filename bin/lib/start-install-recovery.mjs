/**
 * Classified next steps when start / start --apply package install fails.
 *
 * Callers render `formatStartPackageInstallFailure`. Classification, Age window,
 * pin-aware npx, and AgeExclude-must-be-in-config stay behind this module.
 */
import { spawnSync } from 'node:child_process';
import { arkPackageRecoveryCommand } from './package-manager.mjs';

const AGE_MARK = /ERR_PNPM_NO_MATURE_MATCHING_VERSION|minimumReleaseAge/i;
const AGE_EXCLUDE_LINE =
  'To add it locally later: put arkgate on minimumReleaseAgeExclude in pnpm config or pnpm-workspace.yaml (a CLI flag is not enough), or wait until the release is old enough.';
const BIN_NOTE =
  '`arkgate-check` is a command in the arkgate package — not its own npm package.';

/**
 * @param {unknown} hostOutput
 * @returns {string[]}
 */
function hostOutputTail(hostOutput) {
  if (!hostOutput || !String(hostOutput).trim()) return [];
  return String(hostOutput)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .slice(-6);
}

/**
 * Exact npm version for `npx --package=arkgate@<pin>` when Age blocked add.
 * @param {string|undefined} packageVersion
 * @param {string|undefined} installCommand
 * @returns {string|null}
 */
export function resolveStartInstallPackagePin(packageVersion, installCommand) {
  const fromArg = String(packageVersion ?? '')
    .trim()
    .replace(/^arkgate@/i, '')
    .replace(/^\^/, '')
    .replace(/^v/i, '');
  if (/^\d+\.\d+\.\d+/.test(fromArg)) return fromArg.match(/^\d+\.\d+\.\d+/)?.[0] ?? null;
  const fromCmd = String(installCommand ?? '').match(/arkgate@\^?v?(\d+\.\d+\.\d+)/i);
  return fromCmd?.[1] ?? null;
}

/**
 * @typedef {{ kind: 'pnpm-age', ageWindow: string, headline: string }} PnpmAgeInstallFailure
 * @typedef {{ kind: 'generic', hostTail: string[] }} GenericInstallFailure
 * @typedef {PnpmAgeInstallFailure | GenericInstallFailure} ClassifiedStartInstallFailure
 */

/**
 * Classify captured package-manager stdout+stderr. Age is one class.
 * @param {unknown} hostOutput
 * @returns {ClassifiedStartInstallFailure}
 */
export function classifyStartInstallFailure(hostOutput) {
  const text = String(hostOutput ?? '');
  if (AGE_MARK.test(text)) {
    const days = text.match(/(\d+)\s*days?/i)?.[1];
    const ageWindow = days ? `${days} days` : 'a cooling-off window';
    const headline = days
      ? `This repo waits before trusting new npm packages (pnpm Age — ${days} days).`
      : 'This repo waits before trusting new npm packages (pnpm Age).';
    return { kind: 'pnpm-age', ageWindow, headline };
  }
  return { kind: 'generic', hostTail: hostOutputTail(text) };
}

/**
 * Plain Age headline, or null. Kept for the #268 one-liner tests.
 * @param {unknown} hostOutput
 * @returns {string|null}
 */
export function explainPnpmMaturityBlock(hostOutput) {
  const classified = classifyStartInstallFailure(hostOutput);
  return classified.kind === 'pnpm-age' ? classified.headline : null;
}

/**
 * @typedef {{
 *   kind: 'pnpm-age' | 'generic',
 *   ageWindow?: string,
 *   primaryCommand: string,
 *   replayInstallCommand: string | null,
 *   lines: string[],
 * }} StartInstallRecovery
 */

/**
 * Typed next-step for a failed start package install.
 * Age never replays the doomed add; generic still names the exact command.
 * @param {{
 *   exitStatus: number,
 *   installCommand: string,
 *   hostOutput?: string,
 *   packageVersion?: string,
 * }} input
 * @returns {StartInstallRecovery}
 */
export function startInstallRecovery(input) {
  const exitStatus = input?.exitStatus ?? 1;
  const installCommand = input?.installCommand ?? '';
  const classified = classifyStartInstallFailure(input?.hostOutput);
  const pin = resolveStartInstallPackagePin(input?.packageVersion, installCommand);
  const honesty = `Package install failed (exit ${exitStatus}). Setup files are written; the local command is not installed yet.`;
  if (classified.kind === 'pnpm-age') {
    const doctor = arkPackageRecoveryCommand(
      'arkgate-check',
      '--doctor',
      pin ? `arkgate@${pin}` : undefined
    );
    return {
      kind: 'pnpm-age',
      ageWindow: classified.ageWindow,
      primaryCommand: doctor,
      replayInstallCommand: null,
      lines: [classified.headline, honesty, `  ${doctor}`, BIN_NOTE, AGE_EXCLUDE_LINE],
    };
  }
  const doctor = arkPackageRecoveryCommand('arkgate-check', '--doctor');
  return {
    kind: 'generic',
    primaryCommand: installCommand,
    replayInstallCommand: installCommand,
    lines: [...classified.hostTail, honesty, `  ${installCommand}`, `  ${doctor}`, BIN_NOTE],
  };
}

/**
 * Red next-step when post-apply package install fails.
 * Host files may already be written; local bins may be missing.
 * @param {{
 *   exitStatus: number,
 *   installCommand: string,
 *   hostOutput?: string,
 *   packageVersion?: string,
 * }} input
 */
export function formatStartPackageInstallFailure(input) {
  return startInstallRecovery(input).lines.join('\n');
}

/** Pipe the package manager so recovery can hide maturity internals. */
export function runStartPackageInstall(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
