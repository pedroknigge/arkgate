/**
 * HTML for the doctor ArkOrder advisory (report parity: data-advisory="arkOrder").
 */
import { ARKORDER_ONE_BREATH } from './ark-order-doctor.mjs';

export function formatArkOrderHtml(section, esc) {
  if (!section || typeof section !== 'object' || section.notAScore !== true) return '';
  const escape = typeof esc === 'function' ? esc : (v) => String(v);
  const note = section.note ? `<p class="muted">${escape(section.note)}</p>` : '';
  if (section.active !== true) {
    return `
  <section class="section card" data-advisory="arkOrder">
    <h2>ArkOrder <span class="muted">(opt-in extra — not a score)</span></h2>
    <p class="dim" style="margin:.15rem 0 .55rem;font-size:.88rem">
      ${ARKORDER_ONE_BREATH}
      Off until you turn it on — Layers stay the same.
    </p>
    ${note}
  </section>`;
  }
  const residual = section.residual && typeof section.residual === 'object' ? section.residual : { count: 0, ruleIds: [] };
  const ids = Array.isArray(residual.ruleIds) ? residual.ruleIds : [];
  const residualHtml =
    residual.count > 0
      ? `<p><span class="tag warn">residual</span> ${ids
          .map((id) => `<code>${escape(id)}</code>`)
          .join(' · ')}${
          residual.count > ids.length ? ` <span class="muted">(+${residual.count - ids.length} more)</span>` : ''
        }</p>`
      : '<p class="muted">Residual: none on this scan (not a score — green extras ≠ a frozen billing plan).</p>';
  const teeth = section.extraMergeTeeth === true
    ? '<span class="tag">extra merge teeth armed</span>'
    : '<span class="tag warn">extra merge teeth not armed</span>';
  const mergeSentence =
    section.mergePlanes && typeof section.mergePlanes.failMergeWhen === 'string'
      ? section.mergePlanes.failMergeWhen
      : section.failMergeWhen;
  const merge =
    mergeSentence
      ? `<p class="muted" style="margin:.35rem 0 .55rem;font-size:.86rem"><b>Merge planes:</b> ${escape(mergeSentence)}</p>`
      : '';
  const keys = Array.isArray(section.xiKeys) && section.xiKeys.length > 0
    ? section.xiKeys.map((key) => `<code>${escape(key)}</code>`).join(' · ')
    : '<span class="muted">(none named — field-write sensor silent)</span>';
  return `
  <section class="section card" data-advisory="arkOrder">
    <h2>ArkOrder <span class="muted">(not a score)</span></h2>
    <p class="dim" style="margin:.15rem 0 .55rem;font-size:.88rem">
      <b>[ArkOrder]</b> ${ARKORDER_ONE_BREATH}
      Separate from <b>[Layer]</b> imports, <b>[ArkRules]</b> shape, and <b>[ArkRun]</b> travel.
    </p>
    ${merge}
    <div class="kpis" style="margin-bottom:.55rem">
      <div class="kpi"><b>${escape(section.mode || '—')}</b><span>Mode</span></div>
      <div class="kpi"><b>${Number(residual.count) || 0}</b><span>Residual ids</span></div>
      <div class="kpi"><b>${Number(section.planeRoots) || 0}</b><span>Plane roots</span></div>
      <div class="kpi"><b>${Number(section.managedLayers) || 0}</b><span>Managed layers</span></div>
    </div>
    <p>${teeth} · <code>notAScore</code></p>
    <p class="dim" style="margin:.35rem 0 .55rem;font-size:.86rem">xiKeys: ${keys}</p>
    ${residualHtml}
    ${note}
  </section>`;
}
