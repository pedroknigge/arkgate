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
        .map(
          (s) => `
      <div class="finding">
        <p><span class="tag warn">${esc(s.id)}</span> ${esc(s.outcome ?? s.message ?? '')}</p>
        <p class="muted">${esc(s.message ?? '')}</p>
        <p class="muted">evidence: <code>${(s.evidence ?? []).slice(0, 6).map(esc).join('</code> · <code>')}</code></p>
        <p class="muted">fix: ${esc(s.fix ?? '')}</p>
      </div>`
        )
        .join('\n');
  return `
  <section data-advisory="contractHealth">
    <h2>Contract health <span class="muted">(advisory — meta-lint of the contract itself; never changes the verdict)</span></h2>
    ${invalid}
    ${body}
    ${ackNote}
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
    ? '<p class="muted">Idle — no <code>pure: true</code> layer opted in. Declare a pure layer to scan module-scope mutable state.</p>'
    : findings.length === 0
      ? '<p class="muted">Active and clean — no module-scope <code>let</code>/<code>var</code> in pure layers.</p>'
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
    <h2>Ambient state <span class="muted">(advisory — opt-in via pure layers; no strict mode exists)</span></h2>
    ${body}
  </section>`;
}

/**
 * Render every doctor advisory as report sections. Keys must cover everything
 * `computeDoctorAdvisories` returns — the parity guard enforces it.
 * @param escape injected HTML escaper (dependency points html-report → here only)
 */
export function renderAdvisorySections(advisories, escape) {
  if (!advisories || typeof advisories !== 'object') return '';
  if (typeof escape === 'function') esc = escape;
  return [contractHealthHtml(advisories.contractHealth), ambientStateHtml(advisories.ambientState)]
    .filter(Boolean)
    .join('\n');
}
