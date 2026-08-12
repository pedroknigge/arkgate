/**
 * Design-depth + adoption extras for the HTML showcase report.
 * Kept separate from html-report.mjs so the main renderer stays under LOC budget.
 * Does not import html-report.mjs (avoids a cycle).
 */
import {
  detectDesignSmells,
  summarizeDesignFitness,
  buildPatternBetsFromSmells,
} from './design-smells.mjs';
import { summarizePilotLoop } from './pilot-loop.mjs';
import { buildPostGreenNextAction } from './post-green-path.mjs';
import { loadGoldenPattern, summarizeGoldenPattern } from './golden-pattern.mjs';
import { collectAdoptionGaps } from './mcp-adoption.mjs';
import {
  buildCoverageHonesty,
  buildBaselineHonesty,
  buildWritePathHonesty,
  buildProductHonesty,
} from './enforcement-honesty.mjs';
import { summarizeRulesUnderContract } from './rules-under-contract.mjs';
import { readBaseline, baselineOccurrenceKeys } from './violations.mjs';
import { describePackageVersionDualTruth } from './field-install.mjs';
import { buildDoctorImprovementCompass } from './improvement-compass-doctor.mjs';
import { buildDeepModuleCoachAdvisory } from './deep-module-coach.mjs';
import { computePhysicalCohesion } from './physical-cohesion.mjs';
import { POST_GREEN_LEDE, operatingModeTitle } from './product-copy.mjs';

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Doctor-parity design depth + adoption for ark-check --report.
 * @param {string} root
 * @param {object} config
 * @param {string[]} files
 * @param {object} coverage
 * @param {object[]} activeViolations already baseline-filtered active findings
 * @param {{
 *   suppressedCount?: number,
 *   totalViolationCount?: number,
 *   frozenKeys?: number,
 *   activeCount?: number,
 *   activeBlockingCount?: number,
 *   baselineStale?: number | null,
 * }} [baselineSplit] same numbers doctor uses (do not recompute from active-only list)
 */
export function buildReportDepthPayload(
  root,
  config,
  files,
  coverage,
  activeViolations = [],
  baselineSplit = {}
) {
  // Blocking = failsStrict !== false only (type-only placement debt is non-blocking).
  // Prefer caller-supplied count for doctor parity; else derive from active list.
  const activeBlockingCount =
    typeof baselineSplit.activeBlockingCount === 'number'
      ? baselineSplit.activeBlockingCount
      : activeViolations.filter((v) => v?.failsStrict !== false).length;
  const designSmells = detectDesignSmells(root, config, files, coverage);
  const designFitness = summarizeDesignFitness(designSmells, {
    // Doctor parity: fitness uses blocking count, not raw active (incl. type-only).
    activeViolations: activeBlockingCount,
    governedPercent: coverage?.governed?.percent,
    totalFiles: coverage?.governed?.totalFiles,
  });
  const postGreenPath = buildPostGreenNextAction(designFitness);
  const patternBets = buildPatternBetsFromSmells(designSmells);
  const pilotLoop = summarizePilotLoop({
    designWeak: designFitness.designWeak,
    patternBets,
    designSmells,
  });
  const goldenPattern = summarizeGoldenPattern(loadGoldenPattern(root));
  const adoption = collectAdoptionGaps(root, config, coverage);
  const baseline = readBaseline(root, '.ark-baseline.json');
  // Prefer caller-supplied baseline split (doctor parity). Recomputing suppressed from an
  // already-filtered activeViolations list always yields 0 and hides dirty-freeze.
  const suppressed =
    typeof baselineSplit.suppressedCount === 'number'
      ? baselineSplit.suppressedCount
      : baseline.exists
        ? baselineOccurrenceKeys(activeViolations).filter((key) => baseline.keys.has(key)).length
        : 0;
  const frozenKeys =
    typeof baselineSplit.frozenKeys === 'number'
      ? baselineSplit.frozenKeys
      : baseline.exists
        ? baseline.keys.size
        : 0;
  const activeCount =
    typeof baselineSplit.activeCount === 'number'
      ? baselineSplit.activeCount
      : Math.max(0, activeViolations.length - suppressed);
  const totalViolations =
    typeof baselineSplit.totalViolationCount === 'number'
      ? baselineSplit.totalViolationCount
      : activeViolations.length + suppressed;
  const coverageHonesty = buildCoverageHonesty({
    percent: coverage?.governed?.percent,
    totalFiles: coverage?.governed?.totalFiles,
    emptyScope: coverage?.emptyScope === true || (coverage?.governed?.totalFiles ?? 0) === 0,
  });
  const baselineHonesty = buildBaselineHonesty({
    exists: baseline.exists || frozenKeys > 0,
    frozenKeys,
    activeViolations: activeCount,
    suppressed,
    totalViolations,
  });
  const writePath = adoption.writePath;
  const packageVersionTruth = describePackageVersionDualTruth(root);
  const hardWriteActive = writePath?.enforcementState?.localWrite?.hard === true;
  const packageInstalled = writePath?.enforcementState?.localWrite?.installed === true;
  const writePathHonesty = buildWritePathHonesty(writePath?.activeHost, hardWriteActive, {
    packageInstalled,
    packagePinCode: packageVersionTruth?.code,
    packagePinAbsent: packageVersionTruth?.code === 'PACKAGE_PIN_ABSENT',
    selfHost:
      packageVersionTruth?.selfHost === true ||
      packageVersionTruth?.code === 'PACKAGE_PIN_SELF_HOST',
  });
  const rulesUnderContract = summarizeRulesUnderContract(root, config, undefined, {
    governedPercent: coverage?.governed?.percent ?? null,
    populatedLayerCount: Array.isArray(coverage?.layers)
      ? coverage.layers.filter((row) => (row?.files ?? 0) > 0).length
      : null,
    classifiedFiles: coverage?.governed?.classifiedFiles ?? null,
  });
  // Single residual expression (parity with doctor): nextPilot || extractionCard.
  const residualPilot =
    pilotLoop?.nextPilot || pilotLoop?.extractionCard || null;
  const dualTruthNext =
    packageVersionTruth?.dualTruth === true
      ? `Bump package.json arkgate pin to ${packageVersionTruth.cliVersion || 'this CLI'} (or re-run install without --no-install)`
      : packageVersionTruth?.code === 'PACKAGE_PIN_ABSENT'
        ? 'Add arkgate to package.json and install so CI/npx resolve this CLI (PACKAGE_PIN_ABSENT)'
        : null;
  const productHonesty = buildProductHonesty({
    coverageHonesty,
    baselineHonesty,
    writePathHonesty,
    designWeak: designFitness.designWeak === true,
    designWeakLabel: designFitness.label,
    designSmellCount: designSmells.length,
    designSmellsWithOpenEdges: designSmells.length > 0 && activeBlockingCount > 0,
    packageVersionTruth,
    residualPilots: Boolean(residualPilot) && designFitness.designWeak === true,
    pilotTarget: residualPilot?.pilotTarget ?? residualPilot?.pilot ?? null,
    arkRulesMergeHonesty: rulesUnderContract?.mergePlanes
      ? { active: rulesUnderContract.active === true, ...rulesUnderContract.mergePlanes }
      : null,
    primaryNextAction: postGreenPath?.action ?? dualTruthNext,
    activeBlockingViolations: activeBlockingCount,
  });
  // Doctor parity: same physical-cohesion + baseline stale facts as runDoctor.
  const physicalCohesion = computePhysicalCohesion(root, files);
  const baselineStale =
    typeof baselineSplit.baselineStale === 'number' ? baselineSplit.baselineStale : null;
  // Improvement compass — same projection as doctor; notAScore; never a gate input.
  const improvementCompass = buildDoctorImprovementCompass({
    designSmells,
    violations: activeViolations,
    designWeak: designFitness.designWeak === true,
    physicalCohesion,
    rulesUnderContract,
    baselineExists: baseline.exists || frozenKeys > 0,
    baselineStale,
    frozenResidual: frozenKeys,
    dirtyBaselineRisk: productHonesty?.reasonIds?.includes?.('dirty-baseline') === true,
    ungovernedDirCount: coverage?.suggestions?.length ?? 0,
    emptyLayerCount: coverage?.emptyLayers?.length ?? 0,
    goldenPatternPresent: goldenPattern.present === true,
    arkRulesLoaded: rulesUnderContract?.active === true,
  });
  // Deep-module coach — same advisory as doctor; never a gate input.
  const deepModuleCoach = buildDeepModuleCoachAdvisory(root, {
    designSmells,
    physicalCohesion,
    improvementCompass,
    pilotLoop,
  });
  return {
    adoption,
    designDepth: {
      designFitness,
      designSmells,
      pilotLoop,
      postGreenPath,
      goldenPattern,
      // P0-B / P1-M — folded into designDepth so --report stays a single payload.
      productHonesty,
      mergePlanes: rulesUnderContract?.mergePlanes ?? null,
      improvementCompass,
      deepModuleCoach,
    },
  };
}

/** Write-path mode → human meaning (active host projection). */
export function writePathModeHint(mode) {
  switch (String(mode || '')) {
    case 'repair':
      return 'Hard write hook with repair payload — best co-pilot path for the active host.';
    case 'reject-only':
      return 'Hard write boundary without repair payload; edits can be blocked without guided re-entry.';
    case 'mcp-only':
      return 'Advisory MCP only — prepare-write/autoPatch available, no hard PreToolUse for this host.';
    case 'none':
      return 'No hard write boundary or advisory MCP for the active host (or host is unknown in this process).';
    default:
      return 'Session write-path capability for the active agent host.';
  }
}

/**
 * Configured hosts from writePath inventory (hard or advisory evidence on disk).
 * @param {object|null|undefined} writePath
 * @returns {string[]}
 */
export function inventoryConfiguredHosts(writePath) {
  const hosts = writePath?.inventory?.hosts;
  if (!hosts || typeof hosts !== 'object') return [];
  return Object.entries(hosts)
    .filter(([, rec]) => rec && rec.configured)
    .map(([name]) => name);
}

/**
 * Compact write-path line for the Adoption card.
 * @param {object|null|undefined} writePath
 */
export function renderWritePathAdoptionBlock(writePath) {
  if (!writePath || typeof writePath !== 'object') return '';
  const mode = writePath.mode || 'none';
  const host = writePath.activeHost || 'unknown';
  const inv = inventoryConfiguredHosts(writePath);
  const invLine =
    inv.length > 0
      ? `Inventory on disk: ${inv.map((h) => esc(h)).join(', ')}.`
      : 'No host write gates found on disk yet.';
  const unknownNote =
    host === 'unknown' && inv.length > 0
      ? ' Session host unknown (shell/CI) — inventory is still real; set ARK_ACTIVE_HOST or run from an agent for session-accurate mode.'
      : '';
  const gapNote = writePath.gap
    ? ` Gap: <b>${esc(writePath.gap.id)}</b> — ${esc(writePath.gap.message || '')}`
    : '';
  const state = writePath.enforcementState;
  const value = (entry) => entry === true ? 'yes' : entry === false ? 'no' : String(entry);
  const boundary = (label, entry) => entry
    ? `<li><b>${esc(label)}</b> — supported ${esc(value(entry.supported))}; analyzed ${esc(value(entry.analyzed))}; configured ${esc(value(entry.configured))}; installed ${esc(value(entry.installed))}; runtime observed ${esc(value(entry.runtimeObserved))}; operation ${esc(entry.operation ?? 'none')}; operation covered ${esc(value(entry.operationCoverage))}; active ${esc(value(entry.active))}; bypassable ${esc(value(entry.bypassable))}; required ${esc(value(entry.required))}; hard ${esc(value(entry.hard))}</li>`
    : '';
  const stateHtml = state
    ? `<ul class="senior-list" style="margin:.45rem 0 0">${boundary('Local write', state.localWrite)}${boundary('Advisory MCP', state.advisoryMcp)}${boundary('CI merge', state.ciMerge)}</ul>`
    : '';
  // invLine / gapNote already include escaped user content; only plain strings go through esc().
  return `<div class="write-path-block" title="${esc(writePathModeHint(mode))}">
      <p class="dim" style="margin:.65rem 0 .2rem;font-size:.84rem">
        <b>Write path</b> · active host <code>${esc(host)}</code>
        · mode <code>${esc(mode)}</code>
        ${writePath.hookRepair ? '· repair ✓' : writePath.hookPresent ? '· reject-only' : ''}
        ${writePath.mcpPresent ? '· MCP ✓' : ''}
      </p>
      <p class="kpi-hint" style="max-width:none;margin:0">
        ${esc(writePathModeHint(mode))} ${invLine}${esc(unknownNote)}${gapNote}
      </p>
      ${stateHtml}
    </div>`;
}

/** Fixed legend for baseline policy signals. */
export function renderBaselineSignalLegend() {
  return `<details class="baseline-legend" style="margin-top:.75rem">
      <summary>Baseline policy signals (legend)</summary>
      <ul class="senior-list" style="margin-top:.4rem">
        <li><b>keep-empty</b> — ${esc(baselineLegendBody('keep-empty'))}</li>
        <li><b>active-ratchet</b> — ${esc(baselineLegendBody('active-ratchet'))}</li>
        <li><b>absent</b> — ${esc(baselineLegendBody('absent'))}</li>
      </ul>
    </details>`;
}

function baselineLegendBody(signal) {
  switch (signal) {
    case 'keep-empty':
      return '`.ark-baseline.json` exists with 0 frozen keys; every violation is active (honest green).';
    case 'active-ratchet':
      return 'Known debt keys are frozen; new distinct violations still fail the check.';
    case 'absent':
      return 'No baseline file — all findings are active (or freeze not adopted).';
    default:
      return '';
  }
}

/**
 * Design-weak / Shape residual strip for the showcase report.
 * Null HTML when there is nothing useful to show.
 *
 * @param {{
 *   designFitness?: object|null,
 *   designSmells?: object[],
 *   pilotLoop?: object|null,
 *   postGreenPath?: object|null,
 *   goldenPattern?: object|null,
 *   mode?: string,
 * }} depth
 */
/**
 * P0-B — prominent anti-false-green honesty card (never a score).
 * @param {object|null|undefined} productHonesty
 * @param {object|null|undefined} [mergePlanes]
 */
export function renderProductHonestyCard(productHonesty, mergePlanes = null) {
  if (!productHonesty || typeof productHonesty !== 'object') return '';
  const unfinished = productHonesty.unfinished === true;
  const envResiduals = Array.isArray(productHonesty.environmentResidualIds)
    ? productHonesty.environmentResidualIds
    : [];
  const envOnly = !unfinished && envResiduals.length > 0;
  const headline = productHonesty.headline || (unfinished ? 'Not finished' : 'Honesty clear');
  const primary = productHonesty.primaryMessage || '';
  // Avoid repeating the same status label in title and body (past-issue pattern).
  let body = primary;
  if (primary && headline) {
    const h = String(headline).trim();
    const p = String(primary).trim();
    if (p === h) {
      body = unfinished
        ? 'Residual honesty signals remain — not a whole-tree guarantee and not a score.'
        : envOnly
          ? 'Architecture residual clear; host/environment residual remains (advisory write) — not a score.'
          : 'No residual honesty blockers on this slice — still not a numeric architecture score.';
    } else if (p.toLowerCase().startsWith(h.toLowerCase())) {
      const stripped = p.slice(h.length).replace(/^[\s—–:-]+/, '').trim();
      body = stripped || p;
    }
  }
  const reasons = Array.isArray(productHonesty.reasonIds) ? productHonesty.reasonIds : [];
  const reasonHtml =
    reasons.length > 0
      ? `<p class="dim" style="margin:.35rem 0 0;font-size:.86rem">signals: ${reasons
          .map((id) => `<code>${esc(id)}</code>`)
          .join(' · ')} · <code>notAScore</code></p>`
      : '';
  const mergeHtml =
    mergePlanes?.failMergeWhen
      ? `<p class="dim" style="margin:.35rem 0 0;font-size:.86rem">merge planes: ${esc(mergePlanes.failMergeWhen)}</p>`
      : '';
  const dual =
    mergePlanes?.dualPlaneStamp
      ? `<p class="dim" style="margin:.25rem 0 0;font-size:.84rem">${esc(mergePlanes.dualPlaneStamp)}</p>`
      : '';
  const subtitle = unfinished
    ? 'architecture residual'
    : envOnly
      ? 'environment residual (advisory write)'
      : 'no residual honesty blockers';
  return `<div class="section card design-strip ${unfinished ? 'is-weak' : 'is-clean'}" id="product-honesty" data-product-honesty="1">
    <div class="design-head">
      <span class="badge design" title="Product honesty — not a score">${esc(headline)}</span>
      <span class="dim" style="font-size:.86rem">${esc(subtitle)}</span>
    </div>
    <p style="margin:.45rem 0 0">${esc(body)}</p>
    ${reasonHtml}
    ${mergeHtml}
    ${dual}
  </div>`;
}

export function renderDesignDepthStrip(depth = {}) {
  const fitness = depth.designFitness;
  const smells = Array.isArray(depth.designSmells) ? depth.designSmells : [];
  const designWeak = fitness?.designWeak === true;
  if (!designWeak && smells.length === 0) return '';

  const mode = String(depth.mode || '').toLowerCase();
  const title = designWeak
    ? operatingModeTitle(mode || 'enforce', true)
    : 'Design smells (imports still open)';
  const lede = designWeak
    ? POST_GREEN_LEDE
    : 'Design smells exist alongside open import-rule debt. Fix imports first; treat smells as leftover design work after green.';

  const smellItems = smells
    .slice(0, 6)
    .map((s) => {
      const outcome = s.outcome || s.message || s.id;
      const evidence = (s.evidence || [])
        .filter((e) => typeof e === 'string' && !e.startsWith('layer:') && !e.startsWith('layout:'))
        .slice(0, 3);
      const ev =
        evidence.length > 0
          ? ` <span class="dim">· ${evidence.map((e) => `<code>${esc(e)}</code>`).join(' ')}</span>`
          : '';
      return `<li><b>${esc(s.id)}</b> — ${esc(outcome)}${ev}</li>`;
    })
    .join('');

  const pilot = depth.pilotLoop?.active && depth.pilotLoop?.nextPilot ? depth.pilotLoop.nextPilot : null;
  const pilotHtml = pilot
    ? `<div class="pilot-card">
        <h3 style="margin-top:.85rem">Next pilot (one at a time)</h3>
        <p class="dim" style="margin:.15rem 0 .4rem;font-size:.86rem">
          Judgment only — never auto-applied · never multi-pilot batch
        </p>
        <ul class="senior-list">
          <li><b>Smell</b> · <code>${esc(pilot.smellId || pilot.id || '—')}</code></li>
          <li><b>Target</b> · <code>${esc(pilot.pilotTarget || pilot.pilot || '—')}</code></li>
          ${
            pilot.move || pilot.fix
              ? `<li><b>Move</b> · ${esc(pilot.move || pilot.fix)}</li>`
              : ''
          }
          ${
            pilot.successSignal
              ? `<li><b>Success</b> · ${esc(pilot.successSignal)}</li>`
              : ''
          }
          ${
            pilot.killSwitch
              ? `<li><b>Kill-switch</b> · ${esc(pilot.killSwitch)}</li>`
              : ''
          }
        </ul>
      </div>`
    : '';

  const next =
    depth.postGreenPath?.short ||
    depth.postGreenPath?.action ||
    (designWeak
      ? '/ark-explore shape-focus → dual-plan B, then /ark-autopilot only with OK'
      : null);
  const nextHtml = next
    ? `<p class="meta" style="margin-top:.75rem"><b>Primary next</b> · ${esc(next)}</p>`
    : '';

  const golden = depth.goldenPattern;
  const goldenHtml =
    golden && golden.present !== false && (golden.name || golden.norm)
      ? `<p class="dim" style="margin-top:.5rem;font-size:.84rem">
          Golden pattern (advisory for <b>new</b> code only):
          <code>${esc(golden.name || 'pattern')}</code>
          ${golden.norm ? ` — ${esc(golden.norm)}` : ''}
          ${golden.examplePath ? ` · e.g. <code>${esc(golden.examplePath)}</code>` : ''}
        </p>`
      : designWeak
        ? `<p class="dim" style="margin-top:.5rem;font-size:.84rem">
            No <code>.ark/golden-pattern.json</code> yet — optional; helps agents place <b>new</b> code only.
          </p>`
        : '';

  return `<div class="section card design-strip ${designWeak ? 'is-weak' : 'has-smells'}" id="design-depth">
      <div class="design-head">
        <span class="badge design" title="Shape residual — separate from PASS/FAIL edge honesty">${esc(title)}</span>
        <span class="dim" style="font-size:.86rem">${designWeak ? 'Edges clean · residual remains' : 'Smells + open edges'}</span>
      </div>
      <p class="dim" style="margin:.55rem 0 .5rem;font-size:.9rem">${esc(lede)}</p>
      ${smellItems ? `<ul class="senior-list">${smellItems}</ul>` : ''}
      ${pilotHtml}
      ${nextHtml}
      ${goldenHtml}
    </div>`;
}

/**
 * Optional clean-depth note when edges + design are both healthy.
 * Requires designFitness from a real sensor run (object). Null/undefined means
 * depth was not computed — do not claim “OK” from missing data.
 * @param {{ designFitness?: object|null, ok?: boolean, mode?: string }} depth
 */
export function renderDesignCleanNote(depth = {}) {
  if (!depth.ok) return '';
  // Sensors never ran (callers that omit designDepth) → no strip.
  if (depth.designFitness == null || typeof depth.designFitness !== 'object') return '';
  if (depth.designFitness.designWeak) return '';
  if ((depth.designFitness.smellCount ?? 0) > 0) return '';
  if (String(depth.mode || '').toLowerCase() !== 'enforce') return '';
  return `<div class="section card design-strip is-clean" id="design-depth">
      <div class="design-head">
        <span class="badge design-ok" title="No deterministic design smells with clean edges">Design depth · OK</span>
        <span class="dim" style="font-size:.86rem">No leftover design work detected</span>
      </div>
      <p class="dim" style="margin:.45rem 0 0;font-size:.88rem">
        Edges and deterministic design sensors agree. Keep placing new code on the golden path;
        re-run doctor after large refactors.
      </p>
    </div>`;
}
