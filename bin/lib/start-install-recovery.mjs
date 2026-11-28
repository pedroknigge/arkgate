/**
 * Classified next steps when start / start --apply package install fails.
 *
 * Callers render `formatStartPackageInstallFailure`. Classification, Age window,
 * pin-aware npx, and AgeExclude-must-be-in-config stay behind this module.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pinArkgateDevDependency } from './field-install.mjs';
import {
  arkPackageRecoveryCommand,
  detectBunPackageManager,
  packageInstallArgv,
} from './package-manager.mjs';

const AGE_MARK = /ERR_PNPM_NO_MATURE_MATCHING_VERSION|minimumReleaseAge/i;
const PEER_DEPS_MARK =
  /ERESOLVE|Could not resolve dependency|peer (?:dependency|dep)[^.]{0,40}(?:conflict|incompatible)|While resolving/i;
/** Exit 127 / spawn ENOENT / shell "not found" — the declared PM is not on PATH (#411). */
const PM_MISSING_MARK = /command not found|not recognized as an internal or external command|no such file or directory/i;
const AGE_EXCLUDE_LINE =
  'To add it locally later: put arkgate on minimumReleaseAgeExclude in pnpm config or pnpm-workspace.yaml (a CLI flag is not enough), or wait until the release is old enough.';
const BIN_NOTE =
  '`arkgate-check` is a command in the arkgate package — not its own npm package.';
const LIFECYCLE_NOISE =
  /^(?:progress:|npm (?:warn|notice)\b)|ELIFECYCLE|command failed with exit code|lifecycle script [`'"].*failed/i;
const DEPENDENCY_ORDER_LINT =
  /should be ordered alphabetically|dependenc(?:y|ies) (?:are|should be) (?:sorted|ordered)/i;
const OWN_EDIT_ORDER_NOTE =
  "arkgate edited package.json before install, and that edit failed this repo's dependency order check.";

/**
 * @param {unknown} hostOutput
 * @returns {string[]}
 */
function hostOutputLines(hostOutput) {
  if (!hostOutput || !String(hostOutput).trim()) return [];
  return String(hostOutput)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
}

/**
 * @param {unknown} hostOutput
 * @returns {string[]}
 */
function hostOutputTail(hostOutput) {
  return hostOutputLines(hostOutput).slice(-6);
}

/** First host line that is the failure itself, ahead of lifecycle wrappers. */
function firstHostErrorLine(hostOutput) {
  const lines = hostOutputLines(hostOutput);
  const order = lines.find((line) => DEPENDENCY_ORDER_LINT.test(line));
  if (order) return order;
  return lines.find((line) => !LIFECYCLE_NOISE.test(line.trim())) ?? lines[0] ?? null;
}

function dependencyOrderOwnEditNote(hostOutput) {
  return hostOutputLines(hostOutput).some((line) => DEPENDENCY_ORDER_LINT.test(line))
    ? OWN_EDIT_ORDER_NOTE
    : null;
}

/**
 * Exact npm version for `npx --package=arkgate@<pin>` when Age blocked add.
 * @param {string|undefined} packageVersion
 * @param {string|undefined} installCommand
 * @returns {string|null}
 */
function resolveStartInstallPackagePin(packageVersion, installCommand) {
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
 * @typedef {{ kind: 'package-manager-missing', packageManager: string, headline: string }} PmMissingInstallFailure
 * @typedef {{ kind: 'peer-deps', headline: string }} PeerDepsInstallFailure
 * @typedef {{ kind: 'generic', hostTail: string[] }} GenericInstallFailure
 * @typedef {PnpmAgeInstallFailure | PmMissingInstallFailure | PeerDepsInstallFailure | GenericInstallFailure} ClassifiedStartInstallFailure
 */

/**
 * Classify captured package-manager stdout+stderr. Age, a missing package manager
 * (exit 127 / spawn ENOENT), and npm ERESOLVE are one class each (#411 / #388).
 * @param {unknown} hostOutput
 * @param {{ spawnErrorCode?: string|null, exitStatus?: number }} [signals]
 * @returns {ClassifiedStartInstallFailure}
 */
export function classifyStartInstallFailure(hostOutput, signals = {}) {
  const text = String(hostOutput ?? '');
  if (AGE_MARK.test(text)) {
    const days = text.match(/(\d+)\s*days?/i)?.[1];
    const ageWindow = days ? `${days} days` : 'a cooling-off window';
    const headline = days
      ? `This repo waits before trusting new npm packages (pnpm Age — ${days} days).`
      : 'This repo waits before trusting new npm packages (pnpm Age).';
    return { kind: 'pnpm-age', ageWindow, headline };
  }
  const spawnedMissing =
    String(signals.spawnErrorCode ?? '').toUpperCase() === 'ENOENT' ||
    signals.exitStatus === 127 ||
    PM_MISSING_MARK.test(text);
  if (spawnedMissing) {
    return {
      kind: 'package-manager-missing',
      packageManager: 'the declared package manager',
      headline: 'The declared package manager is not on PATH (spawn ENOENT / exit 127).',
    };
  }
  if (PEER_DEPS_MARK.test(text)) {
    return {
      kind: 'peer-deps',
      headline: 'npm could not resolve peer dependencies (ERESOLVE).',
    };
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
 *   kind: 'pnpm-age' | 'package-manager-missing' | 'peer-deps' | 'generic',
 *   ageWindow?: string,
 *   primaryCommand: string,
 *   replayInstallCommand: string | null,
 *   lines: string[],
 * }} StartInstallRecovery
 */

/**
 * Typed next-step for a failed start package install.
 * Age never replays the doomed add; a missing package manager leads with `corepack enable`
 * and echoes the npx fallback the user actually ran, instead of repeating the failed
 * command (#411). ERESOLVE names the npm escape hatch (#388). Generic still names the
 * exact command.
 * @param {{
 *   exitStatus: number,
 *   installCommand: string,
 *   hostOutput?: string,
 *   packageVersion?: string,
 *   spawnErrorCode?: string | null,
 * }} input
 * @returns {StartInstallRecovery}
 */
export function startInstallRecovery(input) {
  const exitStatus = input?.exitStatus ?? 1;
  const installCommand = input?.installCommand ?? '';
  const classified = classifyStartInstallFailure(input?.hostOutput, {
    spawnErrorCode: input?.spawnErrorCode,
    exitStatus,
  });
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
  if (classified.kind === 'package-manager-missing') {
    const doctor = arkPackageRecoveryCommand(
      'arkgate-check',
      '--doctor',
      pin ? `arkgate@${pin}` : undefined
    );
    const pmName = String(installCommand).trim().split(/\s+/)[0] || 'package manager';
    return {
      kind: 'package-manager-missing',
      primaryCommand: 'corepack enable',
      replayInstallCommand: null,
      lines: [
        `The declared package manager (${pmName}) is not on PATH — the install never ran.`,
        honesty,
        `  corepack enable`,
        `  ${doctor}`,
        `Then re-run the setup: ${installCommand}`,
        BIN_NOTE,
      ],
    };
  }
  if (classified.kind === 'peer-deps') {
    const doctor = arkPackageRecoveryCommand('arkgate-check', '--doctor');
    return {
      kind: 'peer-deps',
      primaryCommand: `${installCommand} --legacy-peer-deps`,
      replayInstallCommand: `${installCommand} --legacy-peer-deps`,
      lines: [
        classified.headline,
        honesty,
        `  ${installCommand} --legacy-peer-deps`,
        '  (--force is the blunter npm escape hatch — review the resolved tree afterwards.)',
        `  ${doctor}`,
        BIN_NOTE,
      ],
    };
  }
  const doctor = arkPackageRecoveryCommand('arkgate-check', '--doctor');
  const seen = new Set();
  const preface = [];
  for (const line of [
    firstHostErrorLine(input?.hostOutput),
    dependencyOrderOwnEditNote(input?.hostOutput),
    ...classified.hostTail,
  ]) {
    if (!line || seen.has(line)) continue;
    seen.add(line);
    preface.push(line);
  }
  return {
    kind: 'generic',
    primaryCommand: installCommand,
    replayInstallCommand: installCommand,
    lines: [...preface, honesty, `  ${installCommand}`, `  ${doctor}`, BIN_NOTE],
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

/** Pipe the package manager so recovery can hide maturity internals and see spawn ENOENT. */
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
    spawnErrorCode: result.error?.code ?? null,
  };
}

// Setup-time arkgate pin shared by `ark start` and `ark init` (kept out of bin/ark.mjs).
/**
 * Pin arkgate in package.json (and optionally run the package manager).
 * start calls this so CI/`npx` is not forced to rely on a stale global install.
 *
 * @param {string} root
 * @param {{ install?: boolean, runPackageManager?: boolean }} [opts]
 */
export function ensureProjectArkgateDependency(root, opts = {}) {
  const install = opts.install !== false;
  const runPm = opts.runPackageManager === true;
  if (!install) {
    return { pinned: { changed: false, reason: 'skipped-no-install' }, installStatus: null };
  }
  const pinned = pinArkgateDevDependency(root);
  let installStatus = null;
  let hostOutput = '';
  let spawnErrorCode = null;
  // Only run the package manager after a successful pin change — avoid surprise
  // network on every start when arkgate is already listed.
  if (runPm && pinned.changed) {
    const [command, commandArgs] = packageInstallArgv(root, pinned.version);
    const install = runStartPackageInstall(command, commandArgs, root);
    installStatus = install.status;
    hostOutput = `${install.stdout}\n${install.stderr}`;
    spawnErrorCode = install.spawnErrorCode;
  }
  return { pinned, installStatus, hostOutput, spawnErrorCode };
}

/**
 * Setup-time pin shared by `ark start` and `ark init`. With the pin, generated CI and host
 * hooks call the local `ark-check` / `arkgate-mcp` bins through the project runner. Without
 * it they run `npx -y -p arkgate@<this exact version> <bin>`, because a bare `npx ark-check`
 * asks npm for a package named `ark-check` (404) or runs a stale global.
 */
export function pinArkgateForSetup(root, args, cliVersion) {
  if (!args.install) {
    console.log('  Skipping arkgate package pin (--no-install).');
    return;
  }
  // #415: a bun workspace dies under npm install (EUNSUPPORTEDPROTOCOL `catalog:`) and
  // npm drive is the one thing bun repos cannot accept. Refuse honestly, name the manual
  // command, and let the bun-aware CI branch (ci-and-commands) emit a real gate.
  if (detectBunPackageManager(root)) {
    console.log('  Bun detected — arkgate start does not drive bun installs yet.');
    console.log(`  Add it by hand: bun add -d arkgate@${cliVersion()}`);
    console.log('  Then re-run ark start --apply to write the host gates against the local install.');
    return;
  }
  if (!fs.existsSync(path.join(root, 'package.json'))) {
    console.log(
      `  Warning: no package.json — the generated CI workflow and host hooks run npx -y -p arkgate@${cliVersion()} (downloaded on each run). To run a local install instead, create package.json, add arkgate@^${cliVersion()} to devDependencies, then re-run setup.`
    );
    return;
  }
  const { pinned, installStatus, hostOutput, spawnErrorCode } = ensureProjectArkgateDependency(root, {
    install: true,
    runPackageManager: !args.skipPackageManager,
  });
  if (pinned.changed) {
    console.log(`  Pinned arkgate@${pinned.version} in package.json devDependencies.`);
    if (installStatus !== null && installStatus !== 0) {
      const [command, commandArgs] = packageInstallArgv(root, pinned.version);
      console.error(
        formatStartPackageInstallFailure({
          exitStatus: installStatus,
          installCommand: `${command} ${commandArgs.join(' ')}`,
          hostOutput,
          packageVersion: cliVersion(),
          spawnErrorCode,
        })
      );
    }
  } else if (pinned.reason === 'already-present') {
    console.log(`  arkgate already in package.json (${pinned.version}).`);
  }
}
