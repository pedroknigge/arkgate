/**
 * FX01–FX02 — package install decision for `ark upgrade`.
 *
 * Pure-ish helpers: registry version is injectable so unit tests need no network.
 * Production may pass `getRegistryLatest` that runs `npm view arkgate version`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Compare numeric major.minor.patch cores (prerelease / build ignored).
 * @returns {-1|0|1}
 */
export function compareSemverCore(a, b) {
  const parse = (value) => {
    const core = String(value ?? '')
      .trim()
      .replace(/^v/i, '')
      .split(/[-+]/)[0];
    const parts = core.split('.').map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}

/**
 * Best-effort registry latest (npm view). Returns null on failure.
 * @param {{ timeoutMs?: number, run?: Function }} [opts]
 */
export function probeRegistryArkgateLatest(opts = {}) {
  const timeout = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 8000;
  const run =
    typeof opts.run === 'function'
      ? opts.run
      : () =>
          spawnSync('npm', ['view', 'arkgate', 'version'], {
            encoding: 'utf8',
            timeout,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
  try {
    const result = run();
    if (!result || result.status !== 0) return null;
    const v = String(result.stdout || '')
      .trim()
      .split(/\s+/)[0];
    return v || null;
  } catch {
    return null;
  }
}

/**
 * Whether install of arkgate can be skipped.
 *
 * FX01: when CLI == installed, still install if registryLatest > installed
 * (unless registry probe skipped/unavailable — then fail open to install only if
 * explicitly behind CLI; if equal and no registry, stay skip with honesty).
 *
 * @param {string} root
 * @param {string} [cliVersion]
 * @param {{
 *   registryLatest?: string|null,
 *   getRegistryLatest?: () => string|null|undefined,
 *   skipRegistryProbe?: boolean,
 * }} [options]
 * @returns {{
 *   skip: boolean,
 *   installedVersion: string|null,
 *   reason: string,
 *   reasonCode: string,
 *   registryLatest: string|null,
 *   cliVersion: string|null,
 * }}
 */
export function shouldSkipArkgateInstall(root, cliVersion, options = {}) {
  const cli = typeof cliVersion === 'string' && cliVersion.trim() ? cliVersion.trim() : null;
  const pkgPath = path.join(root, 'node_modules', 'arkgate', 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return {
      skip: false,
      installedVersion: null,
      reason: 'not-installed',
      reasonCode: 'NOT_INSTALLED',
      registryLatest: null,
      cliVersion: cli,
    };
  }
  let installedVersion = null;
  try {
    installedVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? null;
  } catch {
    return {
      skip: false,
      installedVersion: null,
      reason: 'unreadable',
      reasonCode: 'UNREADABLE',
      registryLatest: null,
      cliVersion: cli,
    };
  }

  let registryLatest =
    options.registryLatest !== undefined ? options.registryLatest : undefined;
  if (registryLatest === undefined && options.skipRegistryProbe !== true) {
    if (typeof options.getRegistryLatest === 'function') {
      try {
        registryLatest = options.getRegistryLatest() ?? null;
      } catch {
        registryLatest = null;
      }
    } else {
      registryLatest = probeRegistryArkgateLatest();
    }
  }
  if (registryLatest === undefined) registryLatest = null;

  // Behind CLI version → always install
  if (cli && installedVersion && installedVersion !== cli) {
    return {
      skip: false,
      installedVersion,
      reason: 'version-differs',
      reasonCode: 'VERSION_DIFFERS',
      registryLatest,
      cliVersion: cli,
    };
  }

  // Same as CLI (or no CLI): check registry
  if (installedVersion && registryLatest && compareSemverCore(installedVersion, registryLatest) < 0) {
    return {
      skip: false,
      installedVersion,
      reason: 'behind-registry',
      reasonCode: 'BEHIND_REGISTRY',
      registryLatest,
      cliVersion: cli,
    };
  }

  if (cli && installedVersion && installedVersion === cli) {
    if (registryLatest == null && options.skipRegistryProbe !== true) {
      // Probe failed: do not false-skip forever — still report honesty; skip only when
      // we cannot know registry (offline). Field preferred install when unsure is worse
      // for offline CI; document REGISTRY_UNAVAILABLE and skip with reason.
      return {
        skip: true,
        installedVersion,
        reason: 'already-current-registry-unknown',
        reasonCode: 'REGISTRY_UNAVAILABLE',
        registryLatest: null,
        cliVersion: cli,
      };
    }
    return {
      skip: true,
      installedVersion,
      reason: 'already-current',
      reasonCode: 'ALREADY_CURRENT',
      registryLatest: registryLatest ?? installedVersion,
      cliVersion: cli,
    };
  }

  return {
    skip: false,
    installedVersion,
    reason: 'version-differs',
    reasonCode: 'VERSION_DIFFERS',
    registryLatest,
    cliVersion: cli,
  };
}

/**
 * Machine-readable install decision + human recovery (FX02).
 * @param {ReturnType<typeof shouldSkipArkgateInstall>} decision
 * @param {string} root
 * @param {(root: string, spec?: string) => [string, string[]]} packageInstallArgv
 */
export function buildPackageInstallSkipPayload(decision, root, packageInstallArgv) {
  const targetSpec =
    decision.registryLatest && compareSemverCore(decision.installedVersion || '0.0.0', decision.registryLatest) < 0
      ? decision.registryLatest
      : 'latest';
  const [command, commandArgs] = packageInstallArgv(root, targetSpec);
  const suggestedInstallCmd = `${command} ${commandArgs.join(' ')}`.trim();
  return {
    schemaVersion: '1.0',
    notAScore: true,
    packageInstallSkipped: decision.skip === true,
    reasonCode: decision.reasonCode || 'UNKNOWN',
    reason: decision.reason || null,
    installedVersion: decision.installedVersion,
    cliVersion: decision.cliVersion,
    registryLatest: decision.registryLatest,
    suggestedInstallCmd,
  };
}

/**
 * Human lines for skip / behind-registry install decision.
 * @param {ReturnType<typeof buildPackageInstallSkipPayload>} payload
 */
export function formatPackageInstallDecisionHuman(payload) {
  if (!payload) return [];
  if (payload.packageInstallSkipped && payload.reasonCode === 'ALREADY_CURRENT') {
    return [
      `Package already at arkgate@${payload.installedVersion}` +
        (payload.registryLatest ? ` (registry ${payload.registryLatest})` : '') +
        '; skipping install and recomputing managed preview.',
    ];
  }
  if (payload.packageInstallSkipped && payload.reasonCode === 'REGISTRY_UNAVAILABLE') {
    return [
      `Package at arkgate@${payload.installedVersion} matches this CLI; registry latest unknown (offline or npm view failed). Skipping install.`,
      `If you know a newer release exists, run: ${payload.suggestedInstallCmd}`,
    ];
  }
  if (!payload.packageInstallSkipped && payload.reasonCode === 'BEHIND_REGISTRY') {
    return [
      `Installed arkgate@${payload.installedVersion} is behind registry ${payload.registryLatest}; installing update.`,
      `  ${payload.suggestedInstallCmd}`,
    ];
  }
  if (!payload.packageInstallSkipped) {
    return [`Updating ArkGate (${payload.reasonCode}): ${payload.suggestedInstallCmd}`];
  }
  return [];
}
