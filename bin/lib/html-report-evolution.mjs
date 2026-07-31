export function renderEvolutionSection({
  originSnapshot,
  currentSnapshot,
  originJustCreated,
  esc,
  formatDelta,
  historyMax,
}) {
  if (!currentSnapshot) return '';
  if (originJustCreated || !originSnapshot) {
    return `<div class="section card evolve">
        <h2>Origin baseline captured</h2>
        <p class="dim" style="margin:.2rem 0 0;font-size:.9rem">
          This is the <b>first</b> architecture snapshot for this project
          (<code>.ark/reports/origin.json</code> + <code>origin.html</code>).
          Future reports will show deltas against this starting point so you can prove evolution.
        </p>
      </div>`;
  }
  const scoreComparable =
    typeof originSnapshot.arkVersion === 'string' &&
    originSnapshot.arkVersion.length > 0 &&
    originSnapshot.arkVersion === currentSnapshot.arkVersion;
  const rows = [
    ['Ark score', originSnapshot.score, currentSnapshot.score, '', scoreComparable],
    ['Governed %', originSnapshot.governedPercent, currentSnapshot.governedPercent, 'pp', true],
    ['Files in scope', originSnapshot.totalFiles, currentSnapshot.totalFiles, '', true],
    ['Classified files', originSnapshot.classifiedFiles, currentSnapshot.classifiedFiles, '', true],
    ['Active violations', originSnapshot.activeViolations, currentSnapshot.activeViolations, '', true],
    ['Value violations', originSnapshot.valueViolations, currentSnapshot.valueViolations, '', true],
    ['Type-only violations', originSnapshot.typeOnlyViolations, currentSnapshot.typeOnlyViolations, '', true],
    ['Layers', originSnapshot.layerCount, currentSnapshot.layerCount, '', true],
    ['Deny rules', originSnapshot.denyRules, currentSnapshot.denyRules, '', true],
    ['Gates configured', originSnapshot.gatesOn, currentSnapshot.gatesOn, '', true],
  ];
  const originDate = (originSnapshot.generatedAt || '').slice(0, 10) || 'origin';
  const nowDate = (currentSnapshot.generatedAt || '').slice(0, 10) || 'now';
  const tr = rows
    .map(([label, from, to, unit, comparable]) => {
      const d =
        comparable && typeof from === 'number' && typeof to === 'number'
          ? to - from
          : null;
      const good =
        label.includes('violation') || label.includes('Violation')
          ? d != null && d <= 0
          : label.includes('Governed') ||
              label.includes('score') ||
              label.includes('Classified') ||
              label.includes('Gates')
            ? d != null && d >= 0
            : null;
      const cls =
        d == null || d === 0 ? 'flat' : good === true ? 'up' : good === false ? 'down' : 'flat';
      const delta =
        d == null
          ? '—'
          : unit === 'pp'
            ? formatDelta(Math.round(d * 10) / 10, { suffix: ' pp' })
            : formatDelta(d);
      return `<tr>
          <td>${esc(label)}</td>
          <td class="num">${from ?? '—'}</td>
          <td class="num">${to ?? '—'}</td>
          <td class="num delta ${cls}">${esc(delta)}</td>
        </tr>`;
    })
    .join('\n');
  const originLayers = originSnapshot.layerFiles || {};
  const currentLayers = currentSnapshot.layerFiles || {};
  const layerKeys = [
    ...new Set([...Object.keys(originLayers), ...Object.keys(currentLayers)]),
  ].sort();
  const layerTr = layerKeys
    .map((name) => {
      const from = originLayers[name] || 0;
      const to = currentLayers[name] || 0;
      const d = to - from;
      const cls = d === 0 ? 'flat' : d > 0 ? 'up' : 'down';
      return `<tr>
          <td class="ln">${esc(name)}</td>
          <td class="num">${from}</td>
          <td class="num">${to}</td>
          <td class="num delta ${cls}">${esc(formatDelta(d))}</td>
        </tr>`;
    })
    .join('\n');
  const scoreNote = scoreComparable
    ? ''
    : `<p class="dim" style="margin:-.35rem 0 .75rem;font-size:.88rem">
        Ark score is not comparable across Ark versions
        (<code>${esc(originSnapshot.arkVersion ?? 'unknown')}</code> →
        <code>${esc(currentSnapshot.arkVersion ?? 'unknown')}</code>); its Δ is shown as —.
        Raw coverage, files, violations, layers, rules, and gate metrics remain visible.
      </p>`;
  return `<div class="section card evolve">
      <h2>Evolution vs origin</h2>
      <p class="dim" style="margin:.15rem 0 .75rem;font-size:.88rem">
        Origin snapshot <code>${esc(originDate)}</code> → this report <code>${esc(nowDate)}</code>
        · frozen at <code>.ark/reports/origin.*</code> · reopen origin HTML anytime for the starting picture.
      </p>
      ${scoreNote}
      <table class="layers">
        <tr><th>Metric</th><th>Origin</th><th>Now</th><th>Δ</th></tr>
        ${tr}
      </table>
      <h3>Files per layer</h3>
      <table class="layers">
        <tr><th>Layer</th><th>Origin</th><th>Now</th><th>Δ</th></tr>
        ${layerTr || '<tr><td colspan="4" class="dim">No layer file data in snapshots.</td></tr>'}
      </table>
      <p class="legend">Green Δ = improvement for that metric (↑ coverage/score/gates, ↓ violations). Score Δ is comparable only within the same Ark version. History JSON under <code>.ark/reports/history/</code> (last ${historyMax}).</p>
    </div>`;
}
