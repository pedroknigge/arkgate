/**
 * HTML for the doctor ArkRun advisory (report parity: data-advisory="arkRun").
 */
export function formatArkRunHtml(section, esc) {
  if (!section || typeof section !== 'object' || section.notAScore !== true) return '';
  const escape = typeof esc === 'function' ? esc : (v) => String(v);
  const note = section.note ? `<p class="muted">${escape(section.note)}</p>` : '';
  if (section.active !== true) {
    return `
  <section class="section card" data-advisory="arkRun">
    <h2>ArkRun <span class="muted">(opt-in extra — not a score)</span></h2>
    <p class="dim" style="margin:.15rem 0 .55rem;font-size:.88rem">
      Kernel usage + complete declarations. Absence is silent — Layers and ArkRules verdicts stay the same.
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
      : '<p class="muted">Residual: none on this scan (not a score — green extras ≠ finished kernel wiring).</p>';
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
  return `
  <section class="section card" data-advisory="arkRun">
    <h2>ArkRun <span class="muted">(not a score)</span></h2>
    <p class="dim" style="margin:.15rem 0 .55rem;font-size:.88rem">
      <b>[ArkRun]</b> Kernel usage + declarations — separate from <b>[Layer]</b> imports and <b>[ArkRules]</b> shape.
      Advisory never flips <code>valid</code>. Enforced extra teeth only when the layer plane is classified.
    </p>
    ${merge}
    <div class="kpis" style="margin-bottom:.55rem">
      <div class="kpi"><b>${escape(section.mode || '—')}</b><span>Mode</span></div>
      <div class="kpi"><b>${Number(residual.count) || 0}</b><span>Residual ids</span></div>
      <div class="kpi"><b>${Number(section.compositionRoots) || 0}</b><span>Composition roots</span></div>
      <div class="kpi"><b>${Number(section.managedLayers) || 0}</b><span>Managed layers</span></div>
    </div>
    <p>${teeth} · <code>notAScore</code></p>
    ${residualHtml}
    ${note}
  </section>`;
}
