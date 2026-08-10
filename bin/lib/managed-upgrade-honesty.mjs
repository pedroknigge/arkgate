/**
 * DF05 — managed-upgrade self-service honesty (one residual pilot).
 *
 * Self-service criterion (must stay answerable from package surfaces without a maintainer):
 *   After a managed upgrade (or equivalent), can a consumer learn from package surfaces whether
 *   the write-path is still honestly labeled active/advisory and whether customized install
 *   content was preserved — without asking a maintainer?
 *
 * This module projects that answer onto `ark upgrade` JSON/human output:
 * - write-path activation labels per selected host (hard | advisory | unavailable)
 * - customized (and conflicted) content-identity preserve proof
 *
 * Soft hosts never claim hard. Upgrade never invents hardWriteActive from disk alone —
 * hard requires runtime evidence elsewhere (hooks/doctor/status); upgrade labels fail-closed.
 * Always notAScore; never a gate input.
 */
import { getHostSupportProfile } from './host-support-matrix.mjs';
import { classifyStatusWritePath, defaultHonestLabel } from './status-manifest.mjs';

/**
 * @param {string} host
 * @param {{ hardWriteActive?: boolean }} [evidence]
 * @returns {{
 *   host: string,
 *   writePath: 'hard'|'advisory'|'unavailable',
 *   softWriteHost: boolean,
 *   hardWriteSupported: boolean,
 *   hardWriteActive: boolean,
 *   label: string,
 * }}
 */
export function projectHostWritePathActivation(host, evidence = {}) {
  const normalized = typeof host === 'string' ? host.trim().toLowerCase() : '';
  if (!normalized) {
    return {
      host: 'unknown',
      writePath: 'unavailable',
      softWriteHost: false,
      hardWriteSupported: false,
      hardWriteActive: false,
      label: defaultHonestLabel('unavailable', null),
    };
  }

  const profile = getHostSupportProfile(normalized);
  if (!profile) {
    return {
      host: normalized,
      writePath: 'unavailable',
      softWriteHost: false,
      hardWriteSupported: false,
      hardWriteActive: false,
      label: defaultHonestLabel('unavailable', normalized),
    };
  }

  const hardWriteSupported = profile.capabilities?.['hard-write'] === true;
  const softWriteHost = !hardWriteSupported;
  // Fail-closed: soft never hard; hard only when caller supplies proven active evidence.
  const hardWriteActive =
    !softWriteHost && hardWriteSupported && evidence.hardWriteActive === true;
  const writePath = classifyStatusWritePath({
    softWriteHost,
    hardWriteActive,
    activeHost: normalized,
  });
  return {
    host: normalized,
    writePath,
    softWriteHost,
    hardWriteSupported,
    hardWriteActive,
    label: defaultHonestLabel(writePath, normalized),
  };
}

/**
 * Project self-service honesty facts from a managed upgrade plan.
 *
 * @param {{
 *   hosts?: string[],
 *   assets?: Array<{ path?: string, state?: string, willApply?: boolean, blocked?: boolean }>,
 *   summary?: { customizedPreserved?: number, blocked?: number, states?: Record<string, number> },
 * }} plan
 * @param {{
 *   hardWriteActiveByHost?: Record<string, boolean>,
 * }} [options]
 * @returns {{
 *   schemaVersion: '1.0',
 *   notAScore: true,
 *   criterionId: 'df05-upgrade-activation-preserve',
 *   customizedPreserved: number,
 *   customizedPaths: string[],
 *   conflictedPaths: string[],
 *   customizedContentPreserved: boolean,
 *   writePathActivation: ReturnType<typeof projectHostWritePathActivation>[],
 *   writePathHonestlyLabeled: boolean,
 *   answers: {
 *     writePathActivationLabeled: boolean,
 *     customizedContentPreserved: boolean,
 *   },
 * }}
 */
export function projectManagedUpgradeSelfServiceHonesty(plan, options = {}) {
  const assets = Array.isArray(plan?.assets) ? plan.assets : [];
  const hosts = Array.isArray(plan?.hosts) ? plan.hosts : [];
  const hardByHost =
    options.hardWriteActiveByHost && typeof options.hardWriteActiveByHost === 'object'
      ? options.hardWriteActiveByHost
      : {};

  const customizedPaths = assets
    .filter((asset) => asset?.state === 'customized' && typeof asset.path === 'string')
    .map((asset) => asset.path)
    .sort();
  const conflictedPaths = assets
    .filter((asset) => asset?.state === 'conflicted' && typeof asset.path === 'string')
    .map((asset) => asset.path)
    .sort();

  // Preserve contract: customized assets must never be scheduled writes without consent.
  const customizedContentPreserved = assets
    .filter((asset) => asset?.state === 'customized' || asset?.state === 'conflicted')
    .every((asset) => asset.willApply !== true);

  const summaryCount =
    typeof plan?.summary?.customizedPreserved === 'number'
      ? plan.summary.customizedPreserved
      : customizedPaths.length;

  const writePathActivation = hosts.map((host) => {
    const key = typeof host === 'string' ? host.trim().toLowerCase() : '';
    return projectHostWritePathActivation(host, {
      hardWriteActive: hardByHost[key] === true,
    });
  });

  // Soft hosts never labeled hard; hard only when evidence supplied.
  const writePathHonestlyLabeled = writePathActivation.every((entry) => {
    if (entry.softWriteHost && entry.writePath === 'hard') return false;
    if (entry.softWriteHost && entry.hardWriteActive) return false;
    if (!entry.hardWriteSupported && entry.writePath === 'hard') return false;
    if (entry.writePath === 'hard' && !entry.hardWriteActive) return false;
    return true;
  });

  const answers = {
    writePathActivationLabeled: writePathHonestlyLabeled && writePathActivation.length >= 0,
    customizedContentPreserved,
  };

  return {
    schemaVersion: '1.0',
    notAScore: true,
    criterionId: 'df05-upgrade-activation-preserve',
    customizedPreserved: summaryCount,
    customizedPaths,
    conflictedPaths,
    customizedContentPreserved,
    writePathActivation,
    writePathHonestlyLabeled,
    answers,
  };
}

/**
 * Human one-liner block for upgrade preview/apply (stdout).
 * @param {ReturnType<typeof projectManagedUpgradeSelfServiceHonesty>} honesty
 */
export function formatManagedUpgradeSelfServiceHonesty(honesty) {
  if (!honesty) return [];
  const lines = ['Self-service honesty (no maintainer required):'];
  if (honesty.writePathActivation.length === 0) {
    lines.push('  Write-path: shared/gates only (no host selected) — activation unavailable.');
  } else {
    for (const entry of honesty.writePathActivation) {
      const soft = entry.softWriteHost ? 'soft host' : 'hard-capable';
      const active = entry.hardWriteActive ? 'active' : 'not proven this invocation';
      lines.push(
        `  Write-path ${entry.host}: ${entry.writePath} (${soft}; hard ${active}).`
      );
    }
  }
  if (honesty.customizedPaths.length > 0) {
    lines.push(
      `  Customized preserved: ${honesty.customizedPreserved} (${honesty.customizedPaths.join(', ')}).`
    );
  } else {
    lines.push(
      `  Customized preserved: ${honesty.customizedPreserved} (no customized managed assets).`
    );
  }
  if (honesty.conflictedPaths.length > 0) {
    lines.push(
      `  Conflicted (consent required): ${honesty.conflictedPaths.join(', ')}.`
    );
  }
  return lines;
}
