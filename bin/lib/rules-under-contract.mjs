/**
 * AR12 — doctor/HTML "Rules under contract" (ArkRules plane — counts, never a score).
 * Uses real file I/O for coverage evidence (never empty-fileContents stub).
 * Summary includes per-layer + structure/invariant detail so showcase HTML /ark-explain
 * can teach what is under contract, not only aggregate numbers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEffectiveArkRulesFromDisk } from './effective-contract-load.mjs';
import { buildRulesInventory, inventoryToExtractionCard } from './rules-inventory.mjs';
import { collectGovernedFiles } from './scan-files.mjs';
import { readBaseline } from './violations.mjs';
import { evaluateInvariantCoverage, formatCoverageDiscards } from './invariant-coverage.mjs';
import {
  coverageOptionsFromConfig,
  invariantIdsFromCatalog,
  loadInvariantCoverageInputs,
} from './invariant-coverage-io.mjs';
import {
  composeMergePlanesHonesty,
  demoteExtraPlaneTeethUnderClassificationFloor,
} from './extra-merge-teeth.mjs';
import { collectEmptyInvariantCatalogFindings } from './arkrules-sensors.mjs';
import { layerForFile, layerForRelativePath } from '../ark-layer-match.mjs';
import {
  ARKRULES_EMPTY_CATALOG_NEXT,
  ARKRULES_FIRST_CONTACT_NEXT,
  ARKRULES_ONE_BREATH,
} from './product-copy.mjs';

export { ARKRULES_EMPTY_CATALOG_NEXT, ARKRULES_FIRST_CONTACT_NEXT, ARKRULES_ONE_BREATH };

/**
 * Cap long catalogs in doctor JSON (and HTML, which consumes the same summary).
 * Covered is a sample; structure/uncovered are truncated with *Truncated counters.
 */
const COVERED_SAMPLE_MAX = 24;
const STRUCTURE_CATALOG_MAX = 40;
const UNCOVERED_CATALOG_MAX = 30;

/** Doctor walk often hands absolute paths; layer globs are project-relative. */
function projectRelativePath(root, filePath) {
  const posix = String(filePath).replace(/\\/g, '/');
  if (path.isAbsolute(posix) && typeof root === 'string' && root.length > 0) {
    const relative = path.relative(root, posix).replace(/\\/g, '/');
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative;
    }
  }
  return posix.replace(/^\.\//, '');
}

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

function arkOrderMergeInput(config, residualCount = 0) {
  const extra = config?.arkOrder;
  if (!extra || typeof extra !== 'object') {
    return { present: false, mode: null, residualCount: 0 };
  }
  return {
    present: true,
    mode: extra.mode === 'enforced' || extra.mode === 'advisory' ? extra.mode : null,
    residualCount: Number(residualCount) || 0,
  };
}

function rulesBySlice(arkRules) {
  const groups = new Map();
  const rows = [...(arkRules?.structure ?? []), ...(arkRules?.invariants ?? [])];
  for (const entry of rows) {
    const childId = entry?.provenance?.childId;
    const sourceFile = entry?.provenance?.sourceFile;
    if (typeof childId !== 'string' || typeof sourceFile !== 'string') continue;
    const key = `${childId}\0${sourceFile}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        slice: childId,
        layer: entry.provenance?.layer ?? null,
        sourceFile,
        ids: [],
        appliesTo: [],
      };
      groups.set(key, group);
    }
    if (typeof entry.id === 'string' && !group.ids.includes(entry.id)) group.ids.push(entry.id);
    for (const pattern of entry.appliesTo ?? []) {
      if (typeof pattern === 'string' && !group.appliesTo.includes(pattern)) group.appliesTo.push(pattern);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      ids: [...group.ids].sort(),
      appliesTo: [...group.appliesTo].sort(),
    }))
    .sort((left, right) => left.slice.localeCompare(right.slice) || left.sourceFile.localeCompare(right.sourceFile));
}

/** ADR 0012 D2 drift: arkrules/*.json no arkRules entry references (advisory). */
function unreferencedArkRulesFiles(loaded) {
  const files = (loaded?.warnings ?? []).map((w) => w.path).filter(Boolean);
  return files.length > 0 ? { unreferencedFiles: files } : {};
}

/**
 * @param {{ rulesMigration?: boolean }} [options] rulesMigration:false skips the
 *   migration counts (the inventory payload computes them itself).
 */
function governedPathsFromFacts(root, facts) {
  const rows = facts?.files;
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  const base = String(root).replace(/\\/g, '/').replace(/\/+$/, '');
  const prefix = `${base}/`;
  const out = [];
  for (const entry of rows) {
    const raw = typeof entry === 'string' ? entry : entry?.path;
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const norm = raw.replace(/\\/g, '/');
    const rel = norm.startsWith(prefix)
      ? norm.slice(prefix.length)
      : norm.replace(/^\.\//, '');
    if (!rel || rel.startsWith('..') || rel.startsWith('/')) continue;
    out.push(rel);
  }
  return out.length > 0 ? out : undefined;
}

export function summarizeRulesUnderContract(root, config, facts, classification, options = {}) {
  const governedFiles = governedPathsFromFacts(root, facts);
  const loadOpts = governedFiles ? { files: governedFiles } : {};
  if (!config?.arkRules || Object.keys(config.arkRules).length === 0) {
    let drift = {};
    try {
      drift = unreferencedArkRulesFiles(loadEffectiveArkRulesFromDisk(root, config, loadOpts));
    } catch {
      drift = {};
    }
    return {
      ...drift,
      active: false,
      structureRules: 0,
      invariants: 0,
      coveredInvariants: 0,
      uncoveredInvariants: 0,
      mergePlanes: composeMergePlanesHonesty({
        classification,
        arkRules: { active: false },
        arkRun: arkRunMergeInput(config),
        arkOrder: arkOrderMergeInput(config),
      }),
      notAScore: true,
      note: 'No arkRules map — intra-layer ArkRules are opt-in.',
    };
  }
  try {
    const loaded = loadEffectiveArkRulesFromDisk(root, config, loadOpts);
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
      // Stats shape the green doctor line (discard counts), not only a failing
      // sentence. Roots stay out: this caller drops violations.
      ...(coverageInputs.stats ? { coverageStats: coverageInputs.stats } : {}),
      coverageBudgetExhausted: coverageInputs.coverageBudgetExhausted === true,
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
          ...(Array.isArray(part.sourceFiles) ? { sourceFiles: [...part.sourceFiles] } : {}),
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

    const symbolEvidence = (coverage.coverage ?? [])
      .filter((row) => typeof row.symbolEvidenceFile === 'string' && row.symbolEvidenceFile.length > 0)
      .map((row) => ({ id: row.invariantId, file: projectRelativePath(root, row.symbolEvidenceFile) }));
    const coveredAll = (coverage.coverage ?? [])
      .filter((row) => row.covered)
      .map((row) => ({
        id: row.invariantId,
        layer: row.layer ?? null,
        mode: row.mode ?? null,
        description: row.description ?? null,
        ...(typeof row.symbolEvidenceFile === 'string' && row.symbolEvidenceFile.length > 0
          ? { symbolEvidenceFile: projectRelativePath(root, row.symbolEvidenceFile) }
          : {}),
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
    const catalogFiles = Array.isArray(facts?.files)
      ? facts.files
          .map((entry) => {
            const raw = typeof entry?.path === 'string' ? entry.path : '';
            if (!raw) return null;
            const relative = projectRelativePath(root, raw);
            return {
              path: relative,
              layer: layerForRelativePath(relative, config.layers ?? []),
            };
          })
          .filter(Boolean)
      : [];
    const emptyCatalogFinding = collectEmptyInvariantCatalogFindings({
      arkRulesActive: true,
      arkRules: loaded.arkRules,
      layers: config.layers ?? [],
      files: catalogFiles,
    })[0];
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
      arkOrder: arkOrderMergeInput(config),
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
      ...(rulesBySlice(loaded.arkRules).length > 0 ? { bySlice: rulesBySlice(loaded.arkRules) } : {}),
      structure,
      structureTruncated,
      uncovered,
      uncoveredTruncated,
      coveredSample,
      coveredTruncated,
      symbolEvidence,
      ...unreferencedArkRulesFiles(loaded),
      // AR15: inventoried / under contract / frozen — same helper as --rules-inventory.
      ...(options.rulesMigration === false
        ? {}
        : {
            rulesMigration: buildRulesMigration({ root, config, arkRules: loaded.arkRules })
              .rulesMigration,
          }),
      ...(coverageInputs.stats ? { coverageStats: coverageInputs.stats } : {}),
      mergePlanes,
      notAScore: true,
      note: 'ArkRules plane (intra-layer) — counts and catalog, never a score. Green with uncovered residual must say so. Structure sensors are heuristics; invariants are catalog+coverage evidence, not a business runtime.',
      ...(emptyCatalogFinding
        ? {
            emptyInvariantCatalog: true,
            catalogFillPath: emptyCatalogFinding.arkruleSource,
            catalogFillLayer: emptyCatalogFinding.fromLayer,
            catalogFailsStrict: emptyCatalogFinding.failsStrict === true,
          }
        : { emptyInvariantCatalog: false }),
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
 * Symbol witness paths and discard counts. Printed on green runs too —
 * a passing check used to hide both. Depth and byte caps stay internal;
 * only the counts already in the failure sentence are shown.
 * @param {ReturnType<typeof summarizeRulesUnderContract>|null|undefined} section
 * @returns {string[]}
 */
export function formatArkRulesEvidenceLines(section) {
  if (!section || typeof section !== 'object') return [];
  const lines = [];
  const evidence = Array.isArray(section.symbolEvidence) ? section.symbolEvidence : [];
  for (const row of evidence) {
    if (typeof row?.file !== 'string' || row.file.length === 0) continue;
    const id = typeof row.id === 'string' && row.id.length > 0 ? row.id : 'invariant';
    lines.push(`ArkRules: ${id} symbol ${row.file}`);
  }
  const discard = formatCoverageDiscards(section.coverageStats);
  if (discard) lines.push(`ArkRules:${discard}`);
  return lines;
}

/**
 * Compact / details doctor lines. Empty when the map is off — absence is silent.
 * @param {ReturnType<typeof summarizeRulesUnderContract>|null|undefined} section
 * @returns {string[]}
 */
function unreferencedFilesLine(section) {
  const files = Array.isArray(section?.unreferencedFiles) ? section.unreferencedFiles : [];
  if (files.length === 0) return [];
  const shown = files.slice(0, 3).join(', ');
  const more = files.length > 3 ? ` (+${files.length - 3} more)` : '';
  return [
    `ArkRules: ${shown}${more} not referenced by arkRules — nothing in it is enforced (ARKRULE_FILE_UNREFERENCED, advisory).`,
  ];
}

export function formatArkRulesDoctorLines(section) {
  if (!section || typeof section !== 'object') return [];
  if (section.active !== true) return unreferencedFilesLine(section);

  if (Array.isArray(section.loadErrors) && section.loadErrors.length > 0) {
    const first = section.loadErrors[0];
    const detail =
      typeof first?.message === 'string' && first.message.length > 0
        ? first.message
        : 'Fix the path in arkRules.';
    return [
      ARKRULES_ONE_BREATH,
      `ArkRules: the rules file failed to load — a full check will refuse. ${detail}`,
    ];
  }

  const structure = Number(section.structureRules) || 0;
  const invariants = Number(section.invariants) || 0;
  const uncovered = Number(section.uncoveredInvariants) || 0;
  const enforced =
    (Number(section.mergePlanes?.structureSensors?.enforced) || 0) +
    (Number(section.mergePlanes?.invariants?.enforced) || 0);
  const teeth =
    enforced > 0
      ? 'some enforced'
      : 'advisory only — does not fail the merge';
  const lines = [
    ARKRULES_ONE_BREATH,
    `ArkRules: on · structure=${structure} · invariants=${invariants} · uncovered=${uncovered} · ${teeth} · not a score`,
  ];
  if (section.emptyInvariantCatalog === true) {
    const fill =
      typeof section.catalogFillPath === 'string' && section.catalogFillPath.length > 0
        ? section.catalogFillPath
        : 'arkrules/<Domain>.json';
    const layer =
      typeof section.catalogFillLayer === 'string' && section.catalogFillLayer.length > 0
        ? section.catalogFillLayer
        : 'Domain';
    lines.push(
      `ArkRules: ${layer} has code, but invariants[] is empty — add 1–2 short phrases in ${fill}.`
    );
    lines.push(ARKRULES_EMPTY_CATALOG_NEXT);
  } else if (uncovered > 0) lines.push(ARKRULES_FIRST_CONTACT_NEXT);
  else if (typeof section.note === 'string' && /failed/i.test(section.note)) {
    lines.push(`ArkRules: ${section.note}`);
  }
  lines.push(...formatArkRulesEvidenceLines(section));
  if (section.rulesMigration) {
    lines.push(`ArkRules migration: ${formatRulesMigrationCounts(section.rulesMigration)}.`);
  }
  lines.push(...unreferencedFilesLine(section));
  return lines;
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
  const emptyCatalogBlock =
    section.emptyInvariantCatalog === true
      ? `<p class="tag warn" style="margin-top:.55rem">Domain has code, but <code>invariants[]</code> is empty — that is not done.
        Add 1–2 short phrases in <code>${escape(section.catalogFillPath || 'arkrules/<Domain>.json')}</code>.
        ${
          section.catalogFailsStrict === true
            ? 'A domain structure rule is already enforced, so <code>--strict-merge</code> can refuse.'
            : 'Advisory — does not fail the merge until a domain structure rule is enforced.'
        }</p>`
      : '';
  const uncoveredBlock =
    emptyCatalogBlock ||
    // Aggregate total (not the truncated array length) decides "all covered".
    (Number(section.uncoveredInvariants) === 0 && uncovered.length === 0
      ? `<p class="clean-body" style="margin-top:.55rem">All catalogued invariants have coverage evidence (test/symbol scan) — residual inventory may still suggest new candidates via <code>--rules-inventory</code>.</p>`
      : `<h3 style="margin-top:.9rem;font-size:.95rem">Uncovered invariants</h3>
      <ul class="senior-list">${uncoveredItems}</ul>${uncoveredMore}`);

  const coveredItems = coveredSample
    .map(
      (c) => `<li>
        <code>${escape(c.id)}</code>
        <span class="tag">covered</span>
        <span class="dim">· ${escape(c.layer || '?')}</span>
        ${c.symbolEvidenceFile ? `<span class="dim">· ${escape(c.symbolEvidenceFile)}</span>` : ''}
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
      section.rulesMigration
        ? `<p class="muted" style="margin-top:.35rem;font-size:.84rem">Rules migration: ${escape(formatRulesMigrationCounts(section.rulesMigration))}</p>`
        : ''
    }
    ${
      formatArkRulesEvidenceLines(section)
        .map((line) => `<p class="muted" style="margin-top:.35rem;font-size:.84rem">${escape(line)}</p>`)
        .join('')
    }
    ${
      coveredSample.length || uncovered.length
        ? `<p class="muted" style="margin-top:.65rem;font-size:.84rem">Covered = catalog evidence found (symbol and/or test title). Not a claim that business semantics are fully proven end-to-end.</p>`
        : ''
    }
    ${note}
  </section>`;
}

const RULES_INVENTORY_MAX_FILES = 400;

/**
 * Brownfield rules migration (AR13/AR15): one code path for `--rules-inventory`,
 * MCP `ark_rules_inventory`, doctor, and the HTML report. Honest counts, never a score:
 * - inventoried: candidates the heuristic inventory found (first 400 governed files);
 * - underContract: candidates whose suggested ArkRule is declared — structure
 *   suggestions by (layer, sensor), invariant suggestions by id;
 * - frozen: ArkRules-plane keys (`ARKRULE_*` / `INVARIANT_*`) in .ark-baseline.json.
 * @param {{ root: string, config: Record<string, any>, files?: string[], arkRules?: any }} input
 *   `files` defaults to the governed walk; `arkRules` to the catalog on disk.
 */
function buildRulesMigration({ root, config, files, arkRules }) {
  const governed = Array.isArray(files) ? files : collectGovernedFiles(root, config);
  const fileContents = {};
  const fileLayers = {};
  for (const file of governed.slice(0, RULES_INVENTORY_MAX_FILES)) {
    const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);
    const rel = path.relative(root, absolute).split(path.sep).join('/');
    try {
      fileContents[rel] = fs.readFileSync(absolute, 'utf8');
      const layer = layerForFile(root, absolute, config.layers);
      if (layer) fileLayers[rel] = layer;
    } catch {
      /* skip unreadable */
    }
  }
  let catalog = arkRules;
  if (catalog === undefined && config?.arkRules) {
    try {
      const loaded = loadEffectiveArkRulesFromDisk(root, config, {
        files: governed.map((file) => {
          const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);
          return path.relative(root, absolute).split(path.sep).join('/');
        }),
      });
      catalog = loaded.errors.length > 0 ? null : loaded.arkRules;
    } catch {
      catalog = null; // the advisory inventory is still useful
    }
  }
  const contractedRuleIds = [];
  const contractedStructure = [];
  for (const rule of catalog?.structure ?? []) {
    contractedRuleIds.push(rule.id);
    const layer = rule.provenance?.layer ?? rule.layer;
    if (layer && rule.sensor) contractedStructure.push({ layer, sensor: rule.sensor });
  }
  for (const inv of catalog?.invariants ?? []) contractedRuleIds.push(inv.id);
  let frozenKeys = [];
  try {
    frozenKeys = [...readBaseline(root, '.ark-baseline.json').keys];
  } catch {
    frozenKeys = []; // an unreadable baseline freezes nothing
  }
  const inventory = buildRulesInventory({
    fileContents,
    fileLayers,
    layerContexts: (config.layers ?? []).map((layer) => ({
      name: layer.name,
      intentPrefixes: layer.intentPrefixes ?? [],
    })),
    contractedRuleIds,
    contractedStructure,
    frozenKeys,
  });
  return {
    inventory,
    rulesMigration: {
      inventoried: inventory.inventoried,
      underContract: inventory.underContract,
      frozen: inventory.frozen,
      notAScore: true,
    },
    nextPilot:
      inventory.candidates[0] != null ? inventoryToExtractionCard(inventory.candidates[0]) : null,
  };
}

/** `N inventoried, N under contract, N frozen (not a score)` — shared CLI/doctor wording. */
export function formatRulesMigrationCounts(rulesMigration) {
  if (!rulesMigration || typeof rulesMigration !== 'object') return '';
  return `${rulesMigration.inventoried} inventoried, ${rulesMigration.underContract} under contract, ${rulesMigration.frozen} frozen (not a score)`;
}

/**
 * Full `--rules-inventory` / `ark_rules_inventory` payload (same keys on both surfaces).
 * @param {string} root
 * @param {Record<string, any>} config
 * @param {string[]} [files] governed files (absolute or root-relative)
 */
export function buildRulesInventoryPayload(root, config, files) {
  const governed = Array.isArray(files) ? files : collectGovernedFiles(root, config);
  const migration = buildRulesMigration({ root, config, files: governed });
  let evidenceLines = [];
  let coverageEvidence = null;
  if (config?.arkRules && Object.keys(config.arkRules).length > 0) {
    try {
      const section = summarizeRulesUnderContract(
        root,
        config,
        {
          files: governed.map((file) => ({
            path: path.relative(root, path.resolve(root, file)).split(path.sep).join('/'),
          })),
        },
        undefined,
        { rulesMigration: false }
      );
      evidenceLines = formatArkRulesEvidenceLines(section);
      if (section.active === true) {
        coverageEvidence = {
          symbolEvidence: section.symbolEvidence ?? [],
          discarded: section.coverageStats?.discarded ?? null,
        };
      }
    } catch {
      /* inventory still useful when coverage cannot be read */
    }
  }
  return {
    payload: {
      rulesInventory: migration.inventory,
      rulesMigration: migration.rulesMigration,
      nextPilot: migration.nextPilot,
      ...(coverageEvidence ? { coverageEvidence } : {}),
    },
    evidenceLines,
  };
}
