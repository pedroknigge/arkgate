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
 * @param {object[]} activeViolations
 */
export function buildReportDepthPayload(root, config, files, coverage, activeViolations = []) {
  const designSmells = detectDesignSmells(root, config, files, coverage);
  const designFitness = summarizeDesignFitness(designSmells, {
    activeViolations: activeViolations.length,
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
  return {
    adoption,
    designDepth: {
      designFitness,
      designSmells,
      pilotLoop,
      postGreenPath,
      goldenPattern,
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
export function renderDesignDepthStrip(depth = {}) {
  const fitness = depth.designFitness;
  const smells = Array.isArray(depth.designSmells) ? depth.designSmells : [];
  const designWeak = fitness?.designWeak === true;
  if (!designWeak && smells.length === 0) return '';

  const mode = String(depth.mode || '').toLowerCase();
  const title = designWeak
    ? mode === 'enforce'
      ? 'ENFORCE · design-weak'
      : `${(mode || 'edges').toUpperCase()} · design-weak`
    : 'Design smells (edges still open)';
  const lede = designWeak
    ? 'Contract edges are clean, but lived design residual remains. This does not fail PASS — it blocks “healthy finished” until Shape work lands.'
    : 'Design smells exist alongside open edge debt. Fix edges first; treat smells as Shape residual after green.';

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
          Judgment only — never mechanical-safe · never multi-pilot batch
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
        <span class="dim" style="font-size:.86rem">No design-weak residual detected</span>
      </div>
      <p class="dim" style="margin:.45rem 0 0;font-size:.88rem">
        Edges and deterministic design sensors agree. Keep placing new code on the golden path;
        re-run doctor after large refactors.
      </p>
    </div>`;
}
