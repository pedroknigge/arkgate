/**
 * Product honesty helpers — weak coverage, dirty baseline, soft write hosts.
 *
 * Pure / fail-closed: never invent hard write guarantees; never paint thin
 * coverage or a dirty freeze as "done." Advisory labels only.
 */
import {
  doctorWritePathHonestyMessage,
  HOST_SUPPORT_MATRIX,
  HOST_SUPPORT_HOSTS,
} from './host-support-matrix.mjs';

/** Soft = matrix hard-write false; hard-capable = matrix hard-write true. Single source of truth. */
function hostWriteClassSets() {
  const soft = new Set();
  const hard = new Set();
  for (const host of HOST_SUPPORT_HOSTS) {
    const profile = HOST_SUPPORT_MATRIX[host];
    if (profile?.capabilities?.['hard-write']) hard.add(host);
    else soft.add(host);
  }
  return { soft, hard };
}

const { soft: SOFT_WRITE_HOSTS, hard: HARD_WRITE_HOSTS } = hostWriteClassSets();

/**
 * Coverage honesty: green on a minority of the tree is worse than no gate.
 * `greenIsNotEnforcement` stays true until the whole in-scope tree is governed (100%).
 * @param {{ percent?: number|null, totalFiles?: number|null, emptyScope?: boolean }} input
 */
export function buildCoverageHonesty(input = {}) {
  const total = Number(input.totalFiles) || 0;
  const empty = input.emptyScope === true || total === 0;
  const percent = Number.isFinite(Number(input.percent)) ? Number(input.percent) : 0;

  if (empty) {
    return {
      status: 'empty-scope',
      advisory: true,
      greenIsNotEnforcement: true,
      worseThanNoGate: true,
      wholeTreeGoverned: false,
      governedPercent: 0,
      // Always 0 when empty-scope so payload cannot contradict the message.
      totalFiles: 0,
      message:
        'Empty scope: a green check matches 0 files and is worse than no gate until include/layers cover real code.',
    };
  }
  if (percent < 50) {
    return {
      status: 'weak',
      advisory: true,
      greenIsNotEnforcement: true,
      worseThanNoGate: true,
      wholeTreeGoverned: false,
      governedPercent: percent,
      totalFiles: total,
      message: `Weak coverage (${percent}%): a green check on a minority of the tree is worse than no gate — most code is ungoverned.`,
    };
  }
  if (percent < 80) {
    return {
      status: 'partial',
      advisory: true,
      greenIsNotEnforcement: true,
      worseThanNoGate: false,
      wholeTreeGoverned: false,
      governedPercent: percent,
      totalFiles: total,
      message: `Partial coverage (${percent}%): green means edges on the governed slice only, not the whole tree.`,
    };
  }
  const wholeTree = percent >= 100;
  return {
    status: 'strong',
    advisory: true,
    // Strong slice ≠ full-tree enforcement; boolean consumers must not oversell.
    greenIsNotEnforcement: !wholeTree,
    worseThanNoGate: false,
    wholeTreeGoverned: wholeTree,
    governedPercent: percent,
    totalFiles: total,
    message: wholeTree
      ? `Governed 100% of in-scope files — green is meaningful for the full in-scope tree.`
      : `Governed ${percent}% of in-scope files — green is meaningful only for that governed slice; ${100 - percent}% remains ungoverned.`,
  };
}

/**
 * Baseline honesty: a large freeze that zeros active violations can look safe
 * while hiding false-positive debt.
 * @param {{
 *   exists?: boolean,
 *   frozenKeys?: number,
 *   activeViolations?: number,
 *   suppressed?: number,
 *   totalViolations?: number,
 * }} input
 */
export function buildBaselineHonesty(input = {}) {
  const exists = input.exists === true;
  const frozen = Number(input.frozenKeys) || 0;
  const active = Number(input.activeViolations) || 0;
  const suppressed = Number(input.suppressed) || 0;
  const total = Number(input.totalViolations) || 0;

  if (!exists) {
    return {
      status: total > 0 ? 'missing-with-debt' : 'absent',
      advisory: true,
      dirtyBaselineRisk: false,
      frozenKeys: 0,
      activeViolations: active,
      suppressed: 0,
      message:
        total > 0
          ? 'No baseline while violations exist — freeze only real debt after the contract is honest.'
          : 'No baseline (nothing to freeze).',
    };
  }

  const suppressShare = total > 0 ? suppressed / total : 0;
  // Dirty: green-via-freeze with material frozen debt (false-positive risk).
  const dirty =
    active === 0 &&
    frozen > 0 &&
    (frozen >= 10 || (frozen >= 5 && suppressed > 0) || (total >= 3 && suppressShare >= 0.5));

  if (dirty) {
    return {
      status: 'dirty-freeze',
      advisory: true,
      dirtyBaselineRisk: true,
      frozenKeys: frozen,
      activeViolations: active,
      suppressed,
      message: `Baseline freezes ${frozen} key(s) while active violations are ${active} — green may hide false-positive debt. Prefer contract fixes over a dirty freeze.`,
    };
  }
  if (frozen > 0) {
    return {
      status: 'active-freeze',
      advisory: true,
      dirtyBaselineRisk: false,
      frozenKeys: frozen,
      activeViolations: active,
      suppressed,
      message: `${frozen} frozen key(s); new distinct violations still fail. Ratchet down; do not reopen.`,
    };
  }
  return {
    status: 'empty-freeze',
    advisory: true,
    dirtyBaselineRisk: false,
    frozenKeys: 0,
    activeViolations: active,
    suppressed,
    message: 'Baseline present with 0 frozen keys — every violation is active (honest).',
  };
}

/**
 * Write-path honesty for the active host (fail-closed).
 * Soft hosts never claim hard local write; hard hosts without proof stay unverified.
 * @param {string|null|undefined} activeHost
 * @param {boolean} hardWriteActive
 */
export function buildWritePathHonesty(activeHost, hardWriteActive = false) {
  const host = typeof activeHost === 'string' ? activeHost.trim().toLowerCase() : '';
  const softWriteHost = SOFT_WRITE_HOSTS.has(host);
  const hardCapable = HARD_WRITE_HOSTS.has(host);
  const message = doctorWritePathHonestyMessage(host, hardWriteActive);

  return {
    advisory: true,
    activeHost: host || null,
    softWriteHost,
    hardWriteSupported: hardCapable,
    hardWriteActive: Boolean(hardWriteActive) && hardCapable && !softWriteHost,
    hardWriteUnverified: hardCapable && !hardWriteActive,
    hardMergeBoundary: 'required-ci-status (arkgate-check --strict-merge)',
    message,
    // Explicit product rule for soft hosts.
    ...(softWriteHost
      ? {
          note: 'Local write is advisory / best-effort — not a hard PreToolUse boundary. Required CI status is the hard merge boundary.',
        }
      : {}),
  };
}

/**
 * One-shot doctor honesty bundle (coverage + baseline + write path).
 * Keeps doctor-plan.mjs under its module budget.
 */
export function computeDoctorEnforcementHonesty({
  governedPercent,
  totalFiles,
  emptyScope,
  baselineExists,
  frozenKeys,
  activeViolations,
  suppressed,
  totalViolations,
  activeHost,
  hardWriteActive,
} = {}) {
  return {
    coverageHonesty: buildCoverageHonesty({
      percent: governedPercent,
      totalFiles,
      emptyScope,
    }),
    baselineHonesty: buildBaselineHonesty({
      exists: baselineExists,
      frozenKeys,
      activeViolations,
      suppressed,
      totalViolations,
    }),
    writePathHonesty: buildWritePathHonesty(activeHost, hardWriteActive),
  };
}
