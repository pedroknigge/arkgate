/**
 * Product honesty helpers — weak coverage, dirty baseline, soft write hosts.
 *
 * Pure / fail-closed: never invent hard write guarantees; never paint thin
 * coverage or a dirty freeze as "done." Advisory labels only.
 * Never invents a numeric architecture score.
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
 * Never hard:true without package install evidence (and pin when not self-host).
 *
 * @param {string|null|undefined} activeHost
 * @param {boolean} hardWriteActive
 * @param {{
 *   packageInstalled?: boolean,
 *   packagePinCode?: string | null,
 *   packagePinAbsent?: boolean,
 *   selfHost?: boolean,
 *   motherCli?: boolean,
 * }} [extras]
 */
export function buildWritePathHonesty(activeHost, hardWriteActive = false, extras = {}) {
  const host = typeof activeHost === 'string' ? activeHost.trim().toLowerCase() : '';
  const softWriteHost = SOFT_WRITE_HOSTS.has(host);
  const hardCapable = HARD_WRITE_HOSTS.has(host);
  const packageInstalled = extras.packageInstalled !== false;
  const selfHost = extras.selfHost === true;
  const motherCli =
    extras.motherCli === true ||
    process.env.ARK_MOTHER_CLI === '1' ||
    process.env.ARK_MOTHER_CLI === 'true';
  const pinCode = typeof extras.packagePinCode === 'string' ? extras.packagePinCode : null;
  const pinAbsent =
    extras.packagePinAbsent === true ||
    pinCode === 'PACKAGE_PIN_ABSENT';
  // Self-host / mother library tree: pin-absent is expected (package IS arkgate).
  const pinAbsentForUser = pinAbsent && !selfHost && !motherCli && pinCode !== 'PACKAGE_PIN_SELF_HOST';
  // Hard write requires package on disk; pin-absent consumers never get hard:true.
  const hardAllowed = packageInstalled && !pinAbsentForUser;
  const effectiveHard =
    Boolean(hardWriteActive) && hardCapable && !softWriteHost && hardAllowed;
  const message = doctorWritePathHonestyMessage(host, effectiveHard);

  /** @type {Record<string, unknown>} */
  const out = {
    advisory: true,
    activeHost: host || null,
    softWriteHost,
    hardWriteSupported: hardCapable,
    hardWriteActive: effectiveHard,
    hardWriteUnverified: hardCapable && !effectiveHard,
    hardMergeBoundary: 'required-ci-status (arkgate-check --strict-merge)',
    packageInstalled,
    packagePinAbsent: pinAbsentForUser,
    ...(pinCode ? { packagePinCode: pinCode } : {}),
    message:
      pinAbsentForUser
        ? `${message} Package pin absent (PACKAGE_PIN_ABSENT) — configured hooks ≠ installed enforcement until arkgate is pinned and in node_modules.`
        : !packageInstalled && hardCapable
          ? `${message} arkgate package not resolved from this project — hard write is not proven.`
          : message,
  };
  if (softWriteHost) {
    out.note =
      'Local write is advisory / best-effort — not a hard PreToolUse boundary. Required CI status is the hard merge boundary.';
  }
  if (pinAbsentForUser) {
    out.pinNote =
      'No arkgate pin in package.json; CI/npx may not resolve this CLI version. Ladder/state hard stays false until pin + install.';
  }
  return out;
}

/**
 * One coherent anti-false-green product surface (P0-B / FG01).
 * finished is true only when residual honesty sensors are clear AND the graph
 * + mode are green — never when blocking violations, adapt/suggest residual,
 * missing baseline with debt, design residual, dual-truth, weak coverage,
 * pin-absent, or residual pilots remain.
 *
 * activeBlockingViolations must be failsStrict !== false counts only
 * (type-only placement debt must NOT force active-blocking-violations).
 *
 * Adapt/suggest policy (documented): unfinished when mode is adapt/suggest
 * unless whole-tree green AND zero design smells AND zero blocking — contract
 * and tree still disagree while operating outside enforce.
 * Never invents a numeric architecture score.
 *
 * @param {{
 *   coverageHonesty?: ReturnType<typeof buildCoverageHonesty>,
 *   baselineHonesty?: ReturnType<typeof buildBaselineHonesty>,
 *   writePathHonesty?: ReturnType<typeof buildWritePathHonesty>,
 *   designWeak?: boolean,
 *   designWeakLabel?: string | null,
 *   designSmellCount?: number,
 *   designSmellsWithOpenEdges?: boolean,
 *   packageVersionTruth?: {
 *     dualTruth?: boolean,
 *     note?: string,
 *     code?: string,
 *     cliVersion?: string | null,
 *   } | null,
 *   residualPilots?: boolean,
 *   pilotTarget?: string | null,
 *   arkRulesMergeHonesty?: Record<string, unknown> | null,
 *   primaryNextAction?: string | null,
 *   operatingMode?: string | null,
 *   activeBlockingViolations?: number | null,
 * }} input
 */
export function buildProductHonesty(input = {}) {
  const reasons = [];
  const cov = input.coverageHonesty;
  const base = input.baselineHonesty;
  const write = input.writePathHonesty;
  const designWeak = input.designWeak === true;
  const dualTruth = input.packageVersionTruth?.dualTruth === true;
  const pinCode = input.packageVersionTruth?.code || write?.packagePinCode || null;
  const pinAbsent =
    write?.packagePinAbsent === true ||
    pinCode === 'PACKAGE_PIN_ABSENT';
  const residualPilots = input.residualPilots === true;
  const operatingMode =
    typeof input.operatingMode === 'string' ? input.operatingMode.trim().toLowerCase() : null;
  // Prefer explicit blocking count; never treat raw violation totals (incl. type-only) as blocking.
  const activeBlocking = Number.isFinite(Number(input.activeBlockingViolations))
    ? Math.max(0, Number(input.activeBlockingViolations))
    : Number(base?.activeViolations) || 0;
  const smellCount = Number(input.designSmellCount) || 0;
  const designSmellsOpenEdges =
    input.designSmellsWithOpenEdges === true || (smellCount > 0 && activeBlocking > 0);
  const wholeTreeGovernedEarly = cov?.wholeTreeGoverned === true;

  if (cov?.status === 'empty-scope' || cov?.worseThanNoGate) {
    reasons.push({
      id: 'coverage-weak-or-empty',
      message: cov.message,
    });
  } else if (cov?.greenIsNotEnforcement) {
    reasons.push({
      id: 'coverage-partial',
      message: cov.message,
    });
  }

  // FG01 / P0B-FINISHED-WITH-OPEN-DEBT — red graph is never "finished".
  if (activeBlocking > 0) {
    reasons.push({
      id: 'active-blocking-violations',
      message: `${activeBlocking} active blocking violation(s) remain — not finished; green edges only after debt is cleared or honestly baselined.`,
    });
  }

  if (base?.status === 'missing-with-debt') {
    reasons.push({
      id: 'baseline-missing-with-debt',
      message:
        base.message ||
        'No baseline while violations exist — freeze only real debt after the contract is honest.',
    });
  }

  if (base?.dirtyBaselineRisk) {
    reasons.push({
      id: 'dirty-freeze',
      message: base.message,
    });
  }

  if (designWeak) {
    reasons.push({
      id: 'design-weak',
      message:
        input.designWeakLabel ||
        'ENFORCE · design-weak: edges may be clean, but design residual remains — not elegant, not finished.',
    });
  } else if (designSmellsOpenEdges) {
    // DL-DESIGN-SMELLS-VS-WEAK — smells + open edges ⇒ unfinished (not "elegant true").
    reasons.push({
      id: 'design-smells-open-edges',
      message:
        'Design smells present alongside open edge debt — not elegant, not finished. Fix edges first; Shape residual after green.',
    });
  }

  if (dualTruth) {
    reasons.push({
      id: 'package-version-dual-truth',
      message:
        input.packageVersionTruth?.note ||
        'CLI version and package.json pin disagree — upgrade truth is dual until the pin catches up.',
    });
  } else if (pinAbsent) {
    reasons.push({
      id: 'package-pin-absent',
      message:
        input.packageVersionTruth?.note ||
        write?.pinNote ||
        'No arkgate pin in package.json (PACKAGE_PIN_ABSENT) — configured gates ≠ installed enforcement until pin + install.',
    });
  }

  if (residualPilots) {
    reasons.push({
      id: 'residual-pilot',
      message: input.pilotTarget
        ? `Residual pilot remains (${input.pilotTarget}) — one Shape/extraction card at a time; not whole-tree done.`
        : 'Residual pilot pressure remains — one Shape/extraction card at a time; not whole-tree done.',
    });
  }

  if (write?.softWriteHost) {
    reasons.push({
      id: 'soft-write-host',
      message: write.message || 'Local write is advisory; required CI status is the hard merge boundary.',
    });
  }

  // Mode adapt/suggest (FG-FINISHED-ADAPT-DEBT): prefer unfinished unless the tree is
  // whole-tree green AND zero design smells AND zero blocking violations.
  // Type-only placement debt alone must not keep adapt unfinished via active-blocking.
  if (operatingMode === 'adapt' || operatingMode === 'suggest') {
    const adaptClear =
      wholeTreeGovernedEarly &&
      activeBlocking === 0 &&
      smellCount === 0 &&
      !designWeak &&
      !designSmellsOpenEdges;
    if (!adaptClear) {
      reasons.push({
        id: operatingMode === 'adapt' ? 'mode-adapt-with-debt' : 'mode-suggest-with-debt',
        message:
          operatingMode === 'adapt'
            ? 'Operating mode is ADAPT — not finished until whole-tree green, zero blocking, and zero design smells (contract and tree still disagree).'
            : 'Operating mode is SUGGEST — not finished until whole-tree green, zero blocking, and zero design smells (contract is not yet the control plane).',
      });
    }
  }

  if (input.arkRulesMergeHonesty?.active === true && input.arkRulesMergeHonesty?.extraMergeTeeth === false) {
    // Informational only when no enforced arkrule plane — does not alone make unfinished.
  }

  const unfinished = reasons.length > 0;
  const wholeTreeGoverned = wholeTreeGovernedEarly;
  const coverageIncomplete =
    cov?.status === 'empty-scope' ||
    cov?.worseThanNoGate === true ||
    cov?.greenIsNotEnforcement === true ||
    !wholeTreeGoverned;

  const primary =
    reasons.find((r) => r.id === 'active-blocking-violations') ||
    reasons.find((r) => r.id === 'mode-adapt-with-debt') ||
    reasons.find((r) => r.id === 'mode-suggest-with-debt') ||
    reasons.find((r) => r.id === 'design-weak') ||
    reasons.find((r) => r.id === 'design-smells-open-edges') ||
    reasons.find((r) => r.id === 'coverage-weak-or-empty') ||
    reasons.find((r) => r.id === 'dirty-freeze') ||
    reasons.find((r) => r.id === 'package-version-dual-truth') ||
    reasons.find((r) => r.id === 'package-pin-absent') ||
    reasons.find((r) => r.id === 'baseline-missing-with-debt') ||
    reasons.find((r) => r.id === 'residual-pilot') ||
    reasons[0];

  const primaryMessage = unfinished
    ? primary?.message ||
      'Not finished: residual honesty signals remain (violations, mode, coverage, freeze, design, package pin, or pilots).'
    : wholeTreeGoverned
      ? 'No residual honesty blockers on this slice — still not a numeric architecture score; re-doctor after material change.'
      : 'No residual honesty blockers flagged — green is only as wide as the governed slice.';

  // P0B-HEADLINE: dual-truth / pin-only unfinished must not claim "not whole-tree"
  // when the governed tree is already 100%.
  let headline;
  if (!unfinished) {
    headline = 'Honesty clear on residual signals';
  } else if (coverageIncomplete) {
    headline = 'Not finished / not whole-tree guarantee';
  } else {
    headline = 'Not finished';
  }

  // Prefer caller next action; dual-truth / pin-absent get install/pin path when empty.
  let primaryNextAction = input.primaryNextAction || null;
  if (!primaryNextAction && dualTruth) {
    const ver = input.packageVersionTruth?.cliVersion;
    primaryNextAction = ver
      ? `Bump package.json arkgate pin to ${ver} (or re-run install without --no-install)`
      : 'Bump package.json arkgate pin to match this CLI (or re-run install without --no-install)';
  } else if (!primaryNextAction && pinAbsent) {
    primaryNextAction =
      'Add arkgate to package.json and install so CI/npx resolve this CLI (PACKAGE_PIN_ABSENT)';
  }

  return {
    finished: !unfinished && wholeTreeGoverned && !designWeak && activeBlocking === 0,
    elegant: !designWeak && !base?.dirtyBaselineRisk && !designSmellsOpenEdges && activeBlocking === 0,
    wholeTreeGuarantee:
      wholeTreeGoverned &&
      !designWeak &&
      !base?.dirtyBaselineRisk &&
      !cov?.greenIsNotEnforcement &&
      activeBlocking === 0,
    unfinished,
    notAScore: true,
    reasonIds: reasons.map((r) => r.id),
    reasons,
    primaryMessage,
    primaryNextAction,
    headline,
  };
}

/**
 * One-shot doctor honesty bundle (coverage + baseline + write path + product surface).
 * Keeps doctor-plan.mjs under its module budget.
 */
export function computeDoctorEnforcementHonesty({
  governedPercent,
  totalFiles,
  emptyScope,
  baselineExists,
  frozenKeys,
  activeViolations,
  /** failsStrict !== false count only — type-only must not force active-blocking. */
  activeBlockingViolations,
  suppressed,
  totalViolations,
  activeHost,
  hardWriteActive,
  designWeak,
  designWeakLabel,
  designSmellCount,
  designSmellsWithOpenEdges,
  packageVersionTruth,
  residualPilots,
  pilotTarget,
  arkRulesMergeHonesty,
  primaryNextAction,
  operatingMode,
  packageInstalled,
  selfHost,
  motherCli,
} = {}) {
  const coverageHonesty = buildCoverageHonesty({
    percent: governedPercent,
    totalFiles,
    emptyScope,
  });
  const baselineHonesty = buildBaselineHonesty({
    exists: baselineExists,
    frozenKeys,
    activeViolations,
    suppressed,
    totalViolations,
  });
  const writePathHonesty = buildWritePathHonesty(activeHost, hardWriteActive, {
    packageInstalled,
    packagePinCode: packageVersionTruth?.code,
    packagePinAbsent: packageVersionTruth?.code === 'PACKAGE_PIN_ABSENT',
    selfHost,
    motherCli,
  });
  // Prefer explicit blocking count; fall back to activeViolations only when callers
  // already pass blocking-only totals (legacy tests). Type-only must not invent debt.
  const blockingForHonesty = Number.isFinite(Number(activeBlockingViolations))
    ? Math.max(0, Number(activeBlockingViolations))
    : Number(activeViolations) || 0;
  const productHonesty = buildProductHonesty({
    coverageHonesty,
    baselineHonesty,
    writePathHonesty,
    designWeak,
    designWeakLabel,
    designSmellCount,
    designSmellsWithOpenEdges,
    packageVersionTruth,
    residualPilots,
    pilotTarget,
    arkRulesMergeHonesty,
    primaryNextAction,
    operatingMode,
    activeBlockingViolations: blockingForHonesty,
  });
  return {
    coverageHonesty,
    baselineHonesty,
    writePathHonesty,
    productHonesty,
  };
}
