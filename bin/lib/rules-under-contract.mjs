/**
 * AR12 — doctor/HTML "Rules under contract" (ArkRules plane — counts, never a score).
 * Uses real file I/O for coverage evidence (never empty-fileContents stub).
 * Summary includes per-layer + structure/invariant detail so showcase HTML /ark-explain
 * can teach what is under contract, not only aggregate numbers.
 */
import { loadEffectiveArkRulesFromDisk } from './effective-contract-load.mjs';
import { evaluateInvariantCoverage } from './invariant-coverage.mjs';
import {
  coverageOptionsFromConfig,
  invariantIdsFromCatalog,
  loadInvariantCoverageInputs,
} from './invariant-coverage-io.mjs';
import {
  EXTRA_MERGE_TEETH_GOVERNED_FLOOR,
  composeMergePlanesHonesty,
  demoteExtraPlaneTeethUnderClassificationFloor,
} from './extra-merge-teeth.mjs';

/**
 * Cap long catalogs in doctor JSON (and HTML, which consumes the same summary).
 * Covered is a sample; structure/uncovered are truncated with *Truncated counters.
 */
const COVERED_SAMPLE_MAX = 24;
const STRUCTURE_CATALOG_MAX = 40;
const UNCOVERED_CATALOG_MAX = 30;

export { EXTRA_MERGE_TEETH_GOVERNED_FLOOR };

/**
 * P1M / extraMergeTeeth: under the classification floor, demote enforced ArkRules
 * and ArkRun findings so merge matches doctor stamp (layer graph only).
 * Unknown classification (null/null) → do not demote (contract-only callers).
 *
 * @param {object[]} violations
 * @param {{ governedPercent?: number|null, populatedLayerCount?: number|null }} classification
 * @returns {object[]}
 */
export function demoteArkRuleTeethUnderClassificationFloor(violations, classification = {}) {
  return demoteExtraPlaneTeethUnderClassificationFloor(violations, classification);
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} config
 * @param {{ files?: Array<{ path: string }> }} [facts] optional facts for path set
 * @param {{
 *   governedPercent?: number | null,
 *   populatedLayerCount?: number | null,
 *   classifiedFiles?: number | null,
 * }} [classification] layer-plane coverage (when known)
 */
function arkRunMergeInput(config, residualCount = 0) {
  const extra = config?.arkRun;
  if (!extra || typeof extra !== 'object') {
    return { present: false, mode: null, residualCount: 0 };
  }
  return {
    present: true,
    mode: extra.mode === 'enforced' || extra.mode === 'advisory' ? extra.mode : null,
    residualCount: Number(residualCount) || 0,
  };
}

export function summarizeRulesUnderContract(root, config, facts, classification) {
  if (!config?.arkRules || Object.keys(config.arkRules).length === 0) {
    return {
      active: false,
      structureRules: 0,
      invariants: 0,
      coveredInvariants: 0,
      uncoveredInvariants: 0,
      mergePlanes: composeMergePlanesHonesty({
        classification,
        arkRules: { active: false },
        arkRun: arkRunMergeInput(config),
      }),
      notAScore: true,
      note: 'No arkRules map — intra-layer ArkRules are opt-in.',
    };
  }
  try {
    const loaded = loadEffectiveArkRulesFromDisk(root, config);
    if (loaded.errors?.length) {
      return {
        active: true,
        loadErrors: loaded.errors,
        notAScore: true,
        note: 'ArkRules references failed to load (fail closed on full check).',
      };
    }
    const structureRules = loaded.arkRules.structure?.length ?? 0;
    const invariants = loaded.arkRules.invariants?.length ?? 0;
    const coverageInputs =
      invariants > 0
        ? loadInvariantCoverageInputs(root, facts ?? { files: [] }, {
            invariantIds: invariantIdsFromCatalog(loaded.arkRules),
            ...coverageOptionsFromConfig(config),
          })
        : { fileContents: {}, testFiles: [], testGlobsMissing: false };
    const coverage = evaluateInvariantCoverage({
      arkRules: loaded.arkRules,
      fileContents: coverageInputs.fileContents,
      testFiles: coverageInputs.testFiles,
      testGlobsMissing: coverageInputs.testGlobsMissing,
      coverageBudgetExhausted: coverageInputs.coverageBudgetExhausted === true,
      ...(coverageInputs.stats ? { coverageStats: coverageInputs.stats } : {}),
    });
    const covById = new Map(
      (coverage.coverage ?? []).map((row) => [row.invariantId, row])
    );
    const byLayer = loaded.arkRules.byLayer ?? {};
    const layers = Object.keys(byLayer)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const part = byLayer[name] ?? {};
        const layerInvariants = part.invariants ?? [];
        let covered = 0;
        for (const inv of layerInvariants) {
          if (covById.get(inv.id)?.covered) covered += 1;
        }
        return {
          name,
          sourceFile: part.sourceFile ?? null,
          structureRules: (part.structure ?? []).length,
          invariants: layerInvariants.length,
          coveredInvariants: covered,
          uncoveredInvariants: layerInvariants.length - covered,
        };
      });

    const structureAll = (loaded.arkRules.structure ?? []).map((entry) => ({
      id: entry.id,
      sensor: entry.sensor,
      mode: entry.mode ?? 'advisory',
      layer: entry.provenance?.layer ?? null,
      description: entry.description ?? null,
      sourceFile: entry.provenance?.sourceFile ?? null,
    }));
    const structureTruncated = Math.max(0, structureAll.length - STRUCTURE_CATALOG_MAX);
    const structure = structureAll.slice(0, STRUCTURE_CATALOG_MAX);

    const uncoveredAll = (coverage.coverage ?? [])
      .filter((row) => !row.covered)
      .map((row) => ({
        id: row.invariantId,
        layer: row.layer ?? null,
        mode: row.mode ?? null,
        description: row.description ?? null,
        sourceFile: row.sourceFile ?? null,
      }));
    const uncoveredTruncated = Math.max(0, uncoveredAll.length - UNCOVERED_CATALOG_MAX);
    const uncovered = uncoveredAll.slice(0, UNCOVERED_CATALOG_MAX);

    const coveredAll = (coverage.coverage ?? [])
      .filter((row) => row.covered)
      .map((row) => ({
        id: row.invariantId,
        layer: row.layer ?? null,
        mode: row.mode ?? null,
        description: row.description ?? null,
      }));
    const coveredTruncated = Math.max(0, coveredAll.length - COVERED_SAMPLE_MAX);
    const coveredSample = coveredAll.slice(0, COVERED_SAMPLE_MAX);

    const structureEnforced = structureAll.filter((s) => s.mode === 'enforced').length;
    const structureAdvisory = structureAll.length - structureEnforced;
    const invariantEnforced = (loaded.arkRules.invariants ?? []).filter(
      (inv) => inv.mode === 'enforced'
    ).length;
    const invariantAdvisory = invariants - invariantEnforced;
    const coveredInvariants = coverage.coverage.filter((c) => c.covered).length;
    const uncoveredInvariants = coverage.coverage.filter((c) => !c.covered).length;
    const mergePlanes = composeMergePlanesHonesty({
      classification,
      arkRules: {
        active: true,
        structureEnforced,
        structureTotal: structureRules,
        structureAdvisory,
        invariantEnforced,
        invariantTotal: invariants,
        invariantAdvisory,
        covered: coveredInvariants,
        uncovered: uncoveredInvariants,
      },
      arkRun: arkRunMergeInput(config),
    });

    return {
      active: true,
      structureRules,
      invariants,
      coveredInvariants,
      uncoveredInvariants,
      partialCoverage: coverage.partial,
      testFilesScanned: coverageInputs.testFiles.length,
      layers,
      structure,
      structureTruncated,
      uncovered,
      uncoveredTruncated,
      coveredSample,
      coveredTruncated,
      mergePlanes,
      notAScore: true,
      note: 'ArkRules plane (intra-layer) — counts and catalog, never a score. Green with uncovered residual must say so. Structure sensors are heuristics; invariants are catalog+coverage evidence, not a business runtime.',
    };
  } catch (error) {
    return {
      active: true,
      notAScore: true,
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Showcase HTML for the ArkRules plane (used by html-report-advisories).
 * @param {ReturnType<typeof summarizeRulesUnderContract>|null|undefined} section
 * @param {(v: unknown) => string} esc
 */
export function formatRulesUnderContractHtml(section, esc) {
  if (!section || typeof section !== 'object') return '';
  const escape = typeof esc === 'function' ? esc : (v) => String(v);
  const note = section.note ? `<p class="muted">${escape(section.note)}</p>` : '';

  if (section.active === false) {
    return `
  <section class="section card" data-advisory="rulesUnderContract">
    <h2>Rules under contract <span class="muted">(ArkRules opt-in)</span></h2>
    <p class="dim" style="margin:.15rem 0 .55rem;font-size:.88rem">
      Intra-layer plane (structure sensors + domain invariants as data). Separate from inter-layer import edges.
      Absence of arkRules adds no extra merge teeth beyond the layer graph.
    </p>
    ${note}
  </section>`;
  }

  if (Array.isArray(section.loadErrors) && section.loadErrors.length) {
    const errs = section.loadErrors
      .slice(0, 8)
      .map((e) => `<li><code>${escape(e.path ?? '')}</code> — ${escape(e.message ?? e)}</li>`)
      .join('');
    return `
  <section class="section card" data-advisory="rulesUnderContract">
    <h2>Rules under contract <span class="muted">(load errors)</span></h2>
    ${note}
    <ul class="senior-list">${errs}</ul>
  </section>`;
  }

  const layers = Array.isArray(section.layers) ? section.layers : [];
  const structure = Array.isArray(section.structure) ? section.structure : [];
  const uncovered = Array.isArray(section.uncovered) ? section.uncovered : [];
  const coveredSample = Array.isArray(section.coveredSample) ? section.coveredSample : [];
  const coveredTruncated = Number(section.coveredTruncated) || 0;
  const structureTruncated = Number(section.structureTruncated) || 0;
  const uncoveredTruncated = Number(section.uncoveredTruncated) || 0;

  const layerRows = layers
    .map((row) => {
      const cov =
        row.invariants > 0
          ? `${row.coveredInvariants}/${row.invariants} inv covered`
          : 'no invariants';
      return `<tr>
        <td class="ln">${escape(row.name)}${
          row.sourceFile ? `<div class="tags"><span class="tag"><code>${escape(row.sourceFile)}</code></span></div>` : ''
        }</td>
        <td class="num">${Number(row.structureRules) || 0}</td>
        <td class="num">${Number(row.invariants) || 0}</td>
        <td>${escape(cov)}${
          row.uncoveredInvariants > 0
            ? ` <span class="tag warn">${row.uncoveredInvariants} uncovered</span>`
            : ''
        }</td>
      </tr>`;
    })
    .join('\n');

  const layerTable = layers.length
    ? `<table class="layers" style="margin-top:.55rem">
        <thead><tr><th>Layer</th><th>Structure</th><th>Invariants</th><th>Coverage</th></tr></thead>
        <tbody>${layerRows}</tbody>
      </table>`
    : '';

  // Doctor JSON already caps catalogs; slice again only if a caller passed untruncated arrays.
  const structureShown = structure.slice(0, STRUCTURE_CATALOG_MAX);
  const structureOverflow =
    structureTruncated > 0
      ? structureTruncated
      : Math.max(0, structure.length - STRUCTURE_CATALOG_MAX);
  const structureItems = structureShown
    .map((s) => {
      const mode = s.mode === 'enforced' ? 'enforced' : s.mode === 'advisory' ? 'advisory' : String(s.mode ?? '');
      const modeTag =
        mode === 'enforced'
          ? '<span class="tag">enforced</span>'
          : `<span class="tag warn">${escape(mode || 'mode?')}</span>`;
      return `<li>
        <code>${escape(s.id)}</code>
        ${modeTag}
        <span class="dim">· ${escape(s.layer || '?')} · sensor <code>${escape(s.sensor || '')}</code></span>
        ${s.description ? `<div class="msg">${escape(s.description)}</div>` : ''}
      </li>`;
    })
    .join('\n');
  const structureMore =
    structureOverflow > 0
      ? `<p class="muted">…(+${structureOverflow} more structure rule(s) in arkrules/*)</p>`
      : '';

  const uncoveredShown = uncovered.slice(0, UNCOVERED_CATALOG_MAX);
  const uncoveredOverflow =
    uncoveredTruncated > 0
      ? uncoveredTruncated
      : Math.max(0, uncovered.length - UNCOVERED_CATALOG_MAX);
  const uncoveredItems = uncoveredShown
    .map(
      (u) => `<li>
        <code>${escape(u.id)}</code>
        <span class="tag warn">uncovered</span>
        <span class="dim">· ${escape(u.layer || '?')}</span>
        ${u.description ? `<div class="msg">${escape(u.description)}</div>` : ''}
      </li>`
    )
    .join('\n');
  const uncoveredMore =
    uncoveredOverflow > 0
      ? `<p class="muted">…(+${uncoveredOverflow} more uncovered)</p>`
      : '';
  const uncoveredBlock =
    // Aggregate total (not the truncated array length) decides "all covered".
    Number(section.uncoveredInvariants) === 0 && uncovered.length === 0
      ? `<p class="clean-body" style="margin-top:.55rem">All catalogued invariants have coverage evidence (test/symbol scan) — residual inventory may still suggest new candidates via <code>--rules-inventory</code>.</p>`
      : `<h3 style="margin-top:.9rem;font-size:.95rem">Uncovered invariants</h3>
      <ul class="senior-list">${uncoveredItems}</ul>${uncoveredMore}`;

  const coveredItems = coveredSample
    .map(
      (c) => `<li>
        <code>${escape(c.id)}</code>
        <span class="tag">covered</span>
        <span class="dim">· ${escape(c.layer || '?')}</span>
        ${c.description ? `<div class="msg">${escape(c.description)}</div>` : ''}
      </li>`
    )
    .join('\n');
  const coveredBlock =
    coveredSample.length === 0
      ? ''
      : `<h3 style="margin-top:.9rem;font-size:.95rem">Covered invariants${
          coveredTruncated > 0 ? ` <span class="dim">(sample of ${coveredSample.length})</span>` : ''
        }</h3>
      <ul class="senior-list">${coveredItems}</ul>
      ${
        coveredTruncated > 0
          ? `<p class="muted">…(+${coveredTruncated} more covered — full catalog in <code>arkrules/*</code>)</p>`
          : ''
      }`;

  const mergePlanes = section.mergePlanes;
  const mergeHtml =
    mergePlanes && typeof mergePlanes === 'object'
      ? `<p class="muted" style="margin:.35rem 0 .55rem;font-size:.86rem">
          <b>Merge planes:</b> ${escape(mergePlanes.failMergeWhen || '')}
          ${mergePlanes.dualPlaneStamp ? `<br/>${escape(mergePlanes.dualPlaneStamp)}` : ''}
        </p>`
      : '';

  return `
  <section class="section card" data-advisory="rulesUnderContract">
    <h2>Rules under contract <span class="muted">(ArkRules — not a score)</span></h2>
    <p class="dim" style="margin:.15rem 0 .55rem;font-size:.88rem">
      <b>[ArkRules]</b> Intra-layer plane — separate from <b>[Layer]</b> import edges above.
      <b>Structure</b> = module-shape heuristics (not proof of Domain extraction).
      <b>Invariants</b> = named policies + coverage evidence (symbol/test), not a business runtime
      and not a fitness score.
    </p>
    ${mergeHtml}
    <div class="kpis" style="margin-bottom:.55rem">
      <div class="kpi"><b>${Number(section.structureRules) || 0}</b><span>Structure rules</span></div>
      <div class="kpi"><b>${Number(section.invariants) || 0}</b><span>Invariants</span></div>
      <div class="kpi"><b>${Number(section.coveredInvariants) || 0}</b><span>Covered</span></div>
      <div class="kpi"><b>${Number(section.uncoveredInvariants) || 0}</b><span>Uncovered</span></div>
    </div>
    ${layers.length ? `<p class="dim" style="margin:0 0 .35rem;font-size:.86rem">${layers.length} layer(s) with an <code>arkRules</code> map entry · tests scanned: ${Number(section.testFilesScanned) || 0}</p>` : ''}
    ${layerTable}
    ${
      structure.length
        ? `<h3 style="margin-top:.9rem;font-size:.95rem">Structure sensors</h3>
      <p class="muted" style="margin:.15rem 0 .4rem;font-size:.84rem">Heuristics of module shape. Enforced fails the check; it does not prove extraction to Domain.</p>
      <ul class="senior-list">${structureItems}</ul>${structureMore}`
        : '<p class="muted" style="margin-top:.55rem">No structure sensors in loaded ArkRules files.</p>'
    }
    ${uncoveredBlock}
    ${coveredBlock}
    ${
      coveredSample.length || uncovered.length
        ? `<p class="muted" style="margin-top:.65rem;font-size:.84rem">Covered = catalog evidence found (symbol and/or test title). Not a claim that business semantics are fully proven end-to-end.</p>`
        : ''
    }
    ${note}
  </section>`;
}
