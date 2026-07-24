/**
 * X01 — advisory sections for the HTML report (report parity with doctor).
 *
 * The report is a RENDERING of doctor truth: every advisory surface the doctor
 * emits must have a section here, marked with `data-advisory="<key>"`. The
 * parity guard (reportParity.test.ts) enumerates the doctor's advisory keys
 * and fails when one has no section — that is the standing rule that keeps
 * this report from falling behind the product again.
 */
import { effectiveCapabilityDeny } from './analysis-engine.mjs';
import { graphBlindSpotsHtml } from './graph-blind.mjs';

// htmlEscape is injected by the caller (html-report.mjs) — importing it back
// would be a dependency cycle, and the repo's own gate blocks that. The
// fallback still escapes so a caller that forgets to inject cannot ship XSS.
let esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Layer badges for the layers table: purity walls next to forbidden globals. */
export function capabilityBadgesFor(layer, escape = esc) {
  const previous = esc;
  esc = escape;
  try {
    return badgesInner(layer);
  } finally {
    esc = previous;
  }
}

function badgesInner(layer) {
  const deny = effectiveCapabilityDeny(layer ?? {});
  if (deny.length === 0) return '';
  if (layer?.pure === true) {
    return '<span class="tag warn" title="pure: true — all seven effect capabilities denied (ADR 0009)">pure</span>';
  }
  return `<span class="tag warn" title="capabilities.deny (ADR 0009)">walls: ${deny.map(esc).join(', ')}</span>`;
}

function governanceWeightHtml(gw) {
  if (!gw || gw.weight === 'unknown') {
    return '<p class="muted">Governance weight: unknown (no governed files or layers).</p>';
  }
  const label = `${gw.weight} — ${gw.declaredLayers} layer(s), ${gw.rules} rule(s), ${gw.governedFiles} governed file(s)` +
    (gw.filesPerLayer != null ? ` (${gw.filesPerLayer} files/layer · ${gw.rulesPerLayer} rules/layer)` : '');
  return `
    <div data-advisory="governanceWeight">
      <p><b>Governance weight:</b> <span class="tag ${gw.weight === 'typical' ? 'ok' : 'warn'}">${esc(String(gw.weight))}</span> ${esc(label)}</p>
      <p class="muted">${esc(gw.note ?? '')} Facts, never a score or gate input (<code>notAScore</code>).</p>
    </div>`;
}

function ackLifecycleHtml(lc) {
  if (!lc) return '';
  const rows = [];
  if ((lc.expiredCount ?? 0) > 0) {
    const list = lc.expired ?? [];
    const edges = list
      .map((e) => `<code>${esc(e.edge)}</code> (review-by ${esc(e.reviewBy)})`)
      .join(' · ');
    const more = lc.expiredCount > list.length ? ` …(+${lc.expiredCount - list.length} more)` : '';
    rows.push(
      `<p><span class="tag warn">expired</span> ${lc.expiredCount} acknowledgment(s) past review-by — no longer applied, the smell is active again: ${edges}${more}</p>`
    );
  }
  if ((lc.malformed ?? 0) > 0) {
    rows.push(
      `<p><span class="tag warn">malformed</span> ${lc.malformed} acknowledgment(s) have a malformed review-by (expected YYYY-MM-DD) — ignored, not silently applied.</p>`
    );
  }
  if ((lc.undated ?? 0) > 0) {
    rows.push(
      `<p class="muted">${lc.undated} applied acknowledgment(s) have no review-by date — add one so migration acks cannot fossilize.</p>`
    );
  }
  if ((lc.staleCount ?? 0) > 0) {
    // Plain "+N more": doctor JSON caps its own list, so pointing there for
    // the remainder would over-promise (cross-model review finding).
    const edges = (lc.stale ?? []).slice(0, 4).map((s) => `<code>${esc(s.edge)}</code>`).join(' · ');
    const more = lc.staleCount > 4 ? ` …(+${lc.staleCount - 4} more)` : '';
    rows.push(
      `<p class="muted">${lc.staleCount} acknowledgment(s) match no detected edge — stale; fix the edge string or delete the entry: ${edges}${more}</p>`
    );
  }
  return rows.join('\n');
}

function contractHealthHtml(health) {
  if (!health) return '';
  const smells = Array.isArray(health.smells) ? health.smells : [];
  const acked = health.acknowledged ?? 0;
  const ackNote = acked > 0
    ? `<p class="muted">Acknowledged edges applied: <b>${acked}</b> (${esc(health.ackFile?.path ?? '.ark/contract-smell-acks.json')}) — deliberate loops recorded with a reason; review them when their migrations finish.</p>`
    : '';
  const invalid = health.ackFile?.invalid
    ? `<p class="tag warn">Acknowledgment sidecar present but invalid — acks are ignored, never silently applied.</p>`
    : '';
  const body = smells.length === 0
    ? `<p class="muted">No contract smells detected — no explicitly bidirectional allows, peripheral-into-core allows, lateral adapter allows, or dead rules beyond what is acknowledged.</p>`
    : smells
        .map((s) => {
          const evidence = Array.isArray(s.evidence) ? s.evidence : [];
          // X07 — the cap must announce itself: a 12-edge smell showing 6
          // codes with no marker reads as the whole story.
          const more = evidence.length > 6
            ? ` <span class="muted">…(+${evidence.length - 6} more in doctor JSON)</span>`
            : '';
          return `
      <div class="finding">
        <p><span class="tag warn">${esc(s.id)}</span> ${esc(s.outcome ?? s.message ?? '')}</p>
        <p class="muted">${esc(s.message ?? '')}</p>
        <p class="muted">evidence: <code>${evidence.slice(0, 6).map(esc).join('</code> · <code>')}</code>${more}</p>
        <p class="muted">fix: ${esc(s.fix ?? '')}</p>
      </div>`;
        })
        .join('\n');
  return `
  <section data-advisory="contractHealth">
    <h2>Contract health <span class="muted">(advisory — meta-lint of the contract itself; never changes the verdict)</span></h2>
    ${invalid}
    ${body}
    ${ackNote}
    ${ackLifecycleHtml(health.ackLifecycle)}
    ${governanceWeightHtml(health.governanceWeight)}
  </section>`;
}

function ambientStateHtml(state) {
  if (!state) return '';
  if (state.available === false) {
    return `
  <section data-advisory="ambientState">
    <h2>Ambient state <span class="muted">(advisory)</span></h2>
    <p class="muted">${esc(state.note ?? 'Sensor unavailable in this run.')}</p>
  </section>`;
  }
  const findings = Array.isArray(state.findings) ? state.findings : [];
  const body = !state.active
    ? '<p class="muted">Idle — no <code>pure: true</code> layer opted in. Advisory only; blocker-grade ambient diagnostics remain parked (Y07). Declare a pure layer to scan module-scope mutable state.</p>'
    : findings.length === 0
      ? '<p class="muted">Active and clean under the MVP envelope — still advisory; not a Y07 blocker-grade pass. No module-scope <code>let</code>/<code>var</code> in pure layers.</p>'
      : `<ul>${findings
          .slice(0, 10)
          .map(
            (f) => `<li><code>${esc(f.file)}:${f.line}</code> — <b>${esc(f.name)}</b> <span class="tag warn">${esc(f.kind)}</span></li>`
          )
          .join('')}</ul>` +
        (state.findingCount > 10 ? `<p class="muted">…(+${state.findingCount - 10} more in doctor JSON)</p>` : '') +
        (state.acknowledged > 0 ? `<p class="muted">acknowledged module state: ${state.acknowledged}</p>` : '');
  return `
  <section data-advisory="ambientState">
    <h2>Ambient state <span class="muted">(advisory — opt-in via pure layers; blocker-grade Y07 parked)</span></h2>
    ${body}
  </section>`;
}

function reshapeDecisionsHtml(memory) {
  if (!memory) return '';
  const lifecycle = memory.lifecycle ?? {};
  const rows = [];
  if (memory.decisionFile?.invalid) {
    rows.push(
      `<p><span class="tag warn">invalid</span> ${esc(memory.decisionFile.path)} is ignored; no reshape decision suppresses a pilot.</p>`
    );
  }
  for (const decision of memory.current ?? []) {
    const tag = decision.verdict === 'accepted' ? 'ok' : 'warn';
    const review = decision.reviewBy ? ` · review-by ${esc(decision.reviewBy)}` : '';
    rows.push(
      `<p><span class="tag ${tag}">${esc(decision.verdict)}</span> <b>${esc(decision.concept)}</b>${review} — ${esc(decision.reason)}${decision.suppressesPilot ? ' Pilot pressure suppressed; mirror facts remain visible.' : ' Pilot remains available.'}</p>`
    );
  }
  if ((memory.currentCount ?? 0) > (memory.current?.length ?? 0)) {
    rows.push(`<p class="muted">…(+${memory.currentCount - memory.current.length} more current decision(s))</p>`);
  }
  if ((lifecycle.expiredCount ?? 0) > 0) {
    rows.push(`<p><span class="tag warn">expired</span> ${lifecycle.expiredCount} decision(s) no longer apply; pilot pressure is active again.</p>`);
  }
  if ((lifecycle.malformedCount ?? 0) > 0) {
    rows.push(`<p><span class="tag warn">malformed</span> ${lifecycle.malformedCount} review-by date(s) are invalid; those decisions are ignored.</p>`);
  }
  if ((lifecycle.staleCount ?? 0) > 0) {
    const stale = (lifecycle.stale ?? [])
      .slice(0, 4)
      .map((decision) => `<code>${esc(decision.concept)}</code>`)
      .join(' · ');
    const more = lifecycle.staleCount > 4 ? ` …(+${lifecycle.staleCount - 4} more)` : '';
    rows.push(`<p><span class="tag warn">stale</span> ${lifecycle.staleCount} decision(s) have a changed anchor set and no longer apply: ${stale}${more}</p>`);
  }
  if ((lifecycle.undated ?? 0) > 0) {
    rows.push(`<p class="muted">${lifecycle.undated} current decision(s) have no review-by date.</p>`);
  }
  if (rows.length === 0) return '';
  return `<div data-advisory="reshapeDecisions"><h3>Reshape decisions <span class="muted">(explicit; pilot pressure only)</span></h3>${rows.join('\n')}</div>`;
}

function physicalCohesionHtml(pc) {
  if (!pc) return '';
  const findings = Array.isArray(pc.findings) ? pc.findings : [];
  const body = findings.length === 0
    ? '<p class="muted">No mirrored concept explosion detected — no concept clusters over the calibrated thresholds (ADR 0010).</p>'
    : findings
        .map((f) => {
          const anchors = (f.anchors ?? [])
            .map((a) => `<code>${esc(a.path)}</code> (${a.files}${a.fixedByConvention ? ', fixed by convention' : ''})`)
            .join(' · ');
          return `<p><span class="tag warn">${esc(f.concept)}</span> ${f.files} file(s) across ${f.anchorCount} anchor(s)${f.mirrored ? ' — mirrored' : ''}: ${anchors}</p>`;
        })
        .join('\n') +
      (pc.truncated > 0 ? `<p class="muted">…(+${pc.truncated} more concept(s) in doctor JSON)</p>` : '');
  const pilot = pc.reshapePilot?.nextPilot
    ? `<p class="muted">next pilot (proposed, never applied): ${esc(pc.reshapePilot.nextPilot.pilotTarget)} — one pilot at a time via /ark-loop; merges are judgment cards only.</p>`
    : '';
  return `
  <section data-advisory="physicalCohesion">
    <h2>Physical cohesion <span class="muted">(advisory — facts, not a score; the verdict is unchanged)</span></h2>
    ${body}
    ${reshapeDecisionsHtml(pc.reshapeDecisions)}
    ${pilot}
  </section>`;
}

function parseHealthHtml(health) {
  if (!health) return '';
  const files = Array.isArray(health.files) ? health.files : [];
  const body = health.available === false
    ? '<p class="muted">Parse health was not available for this rendering — no clean claim is made.</p>'
    : health.affectedFiles === 0
    ? `<p class="muted">No parse diagnostics found across ${health.scannedFiles ?? 0} governed file(s) scanned.</p>`
    : `<p><span class="tag warn">${health.affectedFiles} affected</span> ${health.diagnosticCount} parse diagnostic(s) across ${health.scannedFiles} governed file(s).</p>` +
      `<ul>${files.map((f) => `<li><code>${esc(f.file)}</code> — ${f.diagnosticCount} parse diagnostic(s)</li>`).join('')}</ul>` +
      (health.truncated > 0 ? `<p class="muted">…(+${health.truncated} more affected file(s); doctor list capped)</p>` : '');
  return `
  <section data-advisory="parseHealth">
    <h2>Parse health <span class="muted">(completeness evidence — affected syntax makes analysis partial)</span></h2>
    ${body}
  </section>`;
}

/**
 * Render every doctor advisory as report sections. Keys must cover everything
 * `computeDoctorAdvisories` returns — the parity guard enforces it.
 * @param escape injected HTML escaper (dependency points html-report → here only)
 */
function rulesUnderContractHtml(section) {
  if (!section || typeof section !== 'object') return '';
  const note = section.note ? `<p class="muted">${esc(section.note)}</p>` : '';
  if (section.active === false) {
    return `
  <section data-advisory="rulesUnderContract">
    <h2>Rules under contract <span class="muted">(ArkRules opt-in)</span></h2>
    ${note}
  </section>`;
  }
  return `
  <section data-advisory="rulesUnderContract">
    <h2>Rules under contract <span class="muted">(counts — not a score)</span></h2>
    <ul>
      <li>Structure rules: <strong>${Number(section.structureRules) || 0}</strong></li>
      <li>Invariants: <strong>${Number(section.invariants) || 0}</strong></li>
      <li>Covered invariants: <strong>${Number(section.coveredInvariants) || 0}</strong></li>
      <li>Uncovered invariants: <strong>${Number(section.uncoveredInvariants) || 0}</strong></li>
    </ul>
    ${note}
  </section>`;
}

export function renderAdvisorySections(advisories, escape) {
  if (!advisories || typeof advisories !== 'object') return '';
  if (typeof escape === 'function') esc = escape;
  return [
    contractHealthHtml(advisories.contractHealth),
    ambientStateHtml(advisories.ambientState),
    physicalCohesionHtml(advisories.physicalCohesion),
    parseHealthHtml(advisories.parseHealth),
    graphBlindSpotsHtml(advisories.graphBlindSpots, esc),
    rulesUnderContractHtml(advisories.rulesUnderContract),
  ]
    .filter(Boolean)
    .join('\n');
}
