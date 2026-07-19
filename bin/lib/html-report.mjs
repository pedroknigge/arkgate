/**
 * Enforcement detection + HTML architecture reports (roadmap #11).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  arkCommand,
  detectPackageManager,
  enrichViolationWithFixClass,
  patternSpecificity,
  resolveOperatingMode,
} from '../ark-shared.mjs';
import { collectAdoptionGaps, arkCheckCommand } from './agent-gates.mjs';
import { CORE_LAYER_NAMES } from './core-layers.mjs';
import {
  renderBaselineSignalLegend,
  renderDesignCleanNote,
  renderDesignDepthStrip,
  renderWritePathAdoptionBlock,
} from './html-report-depth.mjs';
import { FIX_HINTS } from './violations.mjs';
import { capabilityBadgesFor, renderAdvisorySections } from './html-report-advisories.mjs';

export function detectEnforcement(root) {
  const has = (rel) => fs.existsSync(path.join(root, rel));
  const fileIncludes = (rel, needle) => {
    try {
      return fs.readFileSync(path.join(root, rel), 'utf8').includes(needle);
    } catch {
      return false;
    }
  };
  const workflowsMentionArk = () => {
    const dir = path.join(root, '.github', 'workflows');
    if (!fs.existsSync(dir)) return null;
    const hit = fs
      .readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .find((f) => fileIncludes(path.join('.github', 'workflows', f), 'ark-check'));
    return hit ? `.github/workflows/${hit}` : null;
  };
  const eslintFile = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs', '.eslintrc.json', '.eslintrc.cjs'].find(
    (f) => has(f) && (fileIncludes(f, 'arkgate') || fileIncludes(f, 'ark-runtime-kernel'))
  );
  const writeGateFile =
    ((fileIncludes('.claude/settings.json', 'arkgate-mcp') ||
      fileIncludes('.claude/settings.json', 'ark-mcp')) &&
      '.claude/settings.json') ||
    (has('.cursor/mcp.json') && '.cursor/mcp.json') ||
    (fileIncludes('.grok/hooks/ark-write-gate.json', 'arkgate-mcp') &&
      '.grok/hooks/ark-write-gate.json') ||
    null;
  return [
    { name: 'Write gate', where: writeGateFile, what: 'configured local gate; active blocking depends on observed host/runtime evidence' },
    { name: 'ESLint', where: eslintFile || null, what: 'flags violations in your editor' },
    { name: 'CI check', where: workflowsMentionArk(), what: 'runs Ark; merge blocking requires provider-confirmed required status' },
    { name: 'Baseline', where: has('.ark-baseline.json') ? '.ark-baseline.json' : null, what: 'old violations frozen; new ones fail' },
  ].map((e) => ({ ...e, on: !!e.where }));
}

export function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * KPI tile with plain-language hint (visible micro-copy + native tooltip).
 * Helps newcomers read the showcase without memorizing Ark jargon.
 *
 * @param {string|number} value
 * @param {string} label short metric name
 * @param {string} hint one-sentence meaning
 */
export function metricKpi(value, label, hint) {
  const v = htmlEscape(String(value));
  const l = htmlEscape(label);
  const h = htmlEscape(hint);
  return `<div class="kpi" title="${h}" aria-label="${l}: ${v}. ${h}">
        <b>${v}</b>
        <span>${l}</span>
        <em class="kpi-hint">${h}</em>
      </div>`;
}

/** Baseline policy signal → human meaning (adoption card). */
export function baselineSignalHint(signal) {
  switch (String(signal || '')) {
    case 'keep-empty':
      return 'Baseline file exists and freezes 0 keys — every violation is active (honest green).';
    case 'active-ratchet':
      return 'Baseline freezes known debt keys; new distinct violations still fail the check.';
    case 'absent':
      return 'No .ark-baseline.json — all findings are active (or you have not adopted a freeze file).';
    default:
      return 'How frozen debt is handled relative to active architecture violations.';
  }
}

/** Operating mode badge tooltip. */
export function modeBadgeHint(mode) {
  switch (String(mode || '').toLowerCase()) {
    case 'enforce':
      return 'Contract matches the tree: cores are required where populated, coverage is honest, gates can hold the line.';
    case 'adapt':
      return 'Contract is live but still aligning (optional cores with files, empty cores, or presentation-bag false green).';
    case 'suggest':
      return 'Starter shape — expand layers and raise governed coverage as the codebase grows.';
    default:
      return 'Operating mode for co-pilot surfaces (suggest · adapt · enforce).';
  }
}

/** Directory for origin / latest / history architecture report snapshots. */
const ARK_REPORTS_DIR = path.join('.ark', 'reports');
const ARK_REPORT_HISTORY_MAX = 20;

export function reportsDir(root) {
  return path.join(root, ARK_REPORTS_DIR);
}

/**
 * Compact metrics snapshot — machine-readable so future reports can diff against origin.
 * Intentionally small (not the full HTML). Layer file counts included for evolution.
 */
export function buildReportSnapshot({
  root,
  config,
  coverage,
  violations,
  ok,
  suppressed,
  version,
  fileCountByLayer,
  enforcement,
  score,
  mode,
}) {
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  const counts = {};
  if (fileCountByLayer instanceof Map) {
    for (const [name, n] of fileCountByLayer) counts[name] = n;
  }
  const gatesOn = (enforcement || []).filter((e) => e.on).length;
  return {
    version: 1,
    kind: 'ark-architecture-snapshot',
    generatedAt: new Date().toISOString(),
    arkVersion: version ?? null,
    project: (() => {
      try {
        return readJsonSafe(path.join(root, 'package.json'))?.name || path.basename(root);
      } catch {
        return path.basename(root);
      }
    })(),
    ok: Boolean(ok),
    mode: mode ?? null,
    score: score ?? null,
    governedPercent: coverage?.governed?.percent ?? null,
    classifiedFiles: coverage?.governed?.classifiedFiles ?? 0,
    totalFiles: coverage?.governed?.totalFiles ?? 0,
    unclassifiedFiles: coverage?.unclassified?.count ?? 0,
    layerCount: layers.length,
    denyRules: rules.filter((r) => r.allowed === false).length,
    allowRules: rules.filter((r) => r.allowed === true).length,
    activeViolations: Array.isArray(violations) ? violations.length : 0,
    typeOnlyViolations: Array.isArray(violations)
      ? violations.filter((v) => v.typeOnly).length
      : 0,
    valueViolations: Array.isArray(violations)
      ? violations.filter((v) => !v.typeOnly).length
      : 0,
    suppressed: suppressed ?? 0,
    gatesOn,
    gatesTotal: (enforcement || []).length,
    layerFiles: counts,
  };
}

export function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function deltaField(current, origin, key) {
  const a = current?.[key];
  const b = origin?.[key];
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return a - b;
}

/**
 * Persist origin (once), latest, optional history; return { origin, createdOrigin }.
 */
/** Shared fitness numbers for HTML report + machine-readable snapshots. */
export function computeReportFitness({ coverage, violations, ok, enforcement, config }) {
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  const deniedCount = rules.filter((r) => r.allowed === false).length;
  const gatesOn = (enforcement || []).filter((e) => e.on).length;
  const governedPercent = coverage?.governed?.percent ?? null;
  const totalFiles = coverage?.governed?.totalFiles ?? 0;
  const classifiedFiles = coverage?.governed?.classifiedFiles ?? 0;
  const emptyLayers = (coverage?.layers ?? [])
    .filter((r) => (r.files ?? 0) === 0)
    .map((r) => r.name);
  const presentationRow = (coverage?.layers ?? []).find(
    (r) => r.name === 'PresentationAdapters'
  );
  // Same honesty gate as doctor (`mcp-adoption` coreOptional): only the four cores
  // matter. Secondary optional layers with files must not force ADAPT on the HTML report.
  const coreOptionalWithFiles = (config?.layers ?? []).filter((layer) => {
    if (!CORE_LAYER_NAMES.has(layer.name)) return false;
    if (layer.optional !== true) return false;
    const row = (coverage?.layers ?? []).find((r) => r.name === layer.name);
    return (row?.files ?? 0) > 0;
  }).length;
  const mode = resolveOperatingMode({
    governedPercent: totalFiles === 0 ? 0 : governedPercent,
    planMet:
      ok &&
      (violations?.length ?? 0) === 0 &&
      totalFiles > 0 &&
      (governedPercent == null || governedPercent >= 50),
    mature: totalFiles >= 150,
    totalFiles,
    emptyLayers,
    coreOptionalWithFiles,
    presentationShare:
      totalFiles > 0 && presentationRow ? presentationRow.files / totalFiles : null,
  });
  const modeLabel = { suggest: 'SUGGEST', adapt: 'ADAPT', enforce: 'ENFORCE' }[mode] || String(mode).toUpperCase();
  const modeBlurb = {
    suggest: 'Starter shape — expand layers as the codebase grows.',
    adapt: 'Contract is live; raise governed coverage or match real folders.',
    enforce: 'Contract governs the tree. Gates can honestly hold the line.',
  }[mode];
  const scoreCoverage = governedPercent == null ? 50 : governedPercent;
  const scoreClean =
    (violations?.length ?? 0) === 0
      ? 100
      : Math.max(0, 100 - Math.min(100, violations.length * 4));
  const scoreGates = enforcement?.length
    ? Math.round((gatesOn / enforcement.length) * 100)
    : 40;
  const scoreRules = layers.length
    ? Math.min(
        100,
        Math.round((deniedCount / Math.max(1, layers.length * (layers.length - 1))) * 120)
      )
    : 0;
  const score = Math.round(
    scoreCoverage * 0.4 + scoreClean * 0.3 + scoreGates * 0.2 + scoreRules * 0.1
  );
  const scoreTone = score >= 90 ? 'elite' : score >= 70 ? 'strong' : score >= 50 ? 'ok' : 'weak';
  const scoreCaption =
    score >= 90
      ? 'World-class architecture fitness'
      : score >= 70
        ? 'Solid architecture discipline'
        : score >= 50
          ? 'Useful guardrails — room to grow'
          : 'Early stage — keep adopting layers';
  return {
    governedPercent,
    totalFiles,
    classifiedFiles,
    mode,
    modeLabel,
    modeBlurb,
    score,
    scoreCoverage,
    scoreClean,
    scoreGates,
    scoreRules,
    scoreTone,
    scoreCaption,
    gatesOn,
    deniedCount,
  };
}

export function formatDelta(n, opts = {}) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n === 0) return '0';
  const sign = n > 0 ? '+' : '';
  const suffix = opts.suffix ?? '';
  return `${sign}${n}${suffix}`;
}

export function archiveReportSnapshots(root, { html, snapshot, resetOrigin = false, noArchive = false }) {
  const dir = reportsDir(root);
  const historyDir = path.join(dir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  const originJson = path.join(dir, 'origin.json');
  const originHtml = path.join(dir, 'origin.html');
  const latestJson = path.join(dir, 'latest.json');
  const latestHtml = path.join(dir, 'latest.html');

  let origin = readJsonSafe(originJson);
  let createdOrigin = false;
  if (!origin || resetOrigin) {
    fs.writeFileSync(originJson, `${JSON.stringify(snapshot, null, 2)}\n`);
    fs.writeFileSync(originHtml, html);
    origin = snapshot;
    createdOrigin = true;
  }

  fs.writeFileSync(latestJson, `${JSON.stringify(snapshot, null, 2)}\n`);
  fs.writeFileSync(latestHtml, html);

  if (!noArchive) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(historyDir, `${stamp}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
    // Cap history: keep newest ARK_REPORT_HISTORY_MAX JSON files.
    try {
      const files = fs
        .readdirSync(historyDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, t: fs.statSync(path.join(historyDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      for (const old of files.slice(ARK_REPORT_HISTORY_MAX)) {
        fs.unlinkSync(path.join(historyDir, old.f));
      }
    } catch {
      /* ignore prune errors */
    }
  }

  // Ensure .ark/ is gitignored when a .gitignore exists.
  const gitignore = path.join(root, '.gitignore');
  if (fs.existsSync(gitignore)) {
    const text = fs.readFileSync(gitignore, 'utf8');
    const hasArk =
      text.split('\n').some((line) => {
        const t = line.trim();
        return t === '.ark/' || t === '.ark' || t === '/.ark/' || t === '**/.ark/';
      });
    if (!hasArk) {
      const suffix = text.endsWith('\n') || text.length === 0 ? '' : '\n';
      fs.writeFileSync(
        gitignore,
        `${text}${suffix}\n# Ark generated reports / local state\n.ark/\n`
      );
    }
  }

  return { origin, createdOrigin, dir, originJson, latestHtml };
}

// Simplified onboarding report: compact diagram, placement table, short violation list.
export function renderBeginnerHtmlReport({ root, config, violations, ok, version, configPath, generatedAt }) {
  const layers = Array.isArray(config.layers) ? config.layers : [];
  const esc = htmlEscape;
  const project = (() => {
    try {
      return readJsonSafe(path.join(root, 'package.json'))?.name || path.basename(root);
    } catch {
      return path.basename(root);
    }
  })();
  const status = ok ? 'PASS' : 'FAIL';
  const phase1 = layers.slice(0, 4);
  const diagram = phase1
    .map((layer, index) => `${index + 1}. ${layer.name}`)
    .join('  →  ') || 'Add layers in ark.config.json';

  const placementRows = layers
    .map((layer) => {
      const purpose = layer.description || 'See ark.config.json';
      const folders = (layer.patterns || []).join(', ') || '—';
      return `<tr><td><strong>${esc(layer.name)}</strong></td><td>${esc(purpose)}</td><td><code>${esc(folders)}</code></td></tr>`;
    })
    .join('\n');

  const violationRows = violations.length
    ? violations
        .slice(0, 12)
        .map((v) => {
          const enriched = enrichViolationWithFixClass(v);
          return `<li><code>${esc(v.file)}:${v.line}</code> — ${esc(enriched.enthusiastHint ?? v.message)}</li>`;
        })
        .join('\n')
    : '<li class="dim">No active violations — architecture matches the contract.</li>';

  const meta = [version ? `ark-check v${esc(version)}` : '', generatedAt ? esc(generatedAt) : '']
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ark beginner guide — ${esc(project)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; max-width: 720px; }
  h1 { font-size: 1.4rem; }
  .badge { padding: .2em .6em; border-radius: 999px; font-weight: 700; font-size: .85rem; }
  .PASS { background: #dcfce7; color: #166534; }
  .FAIL { background: #fee2e2; color: #991b1b; }
  .diagram { background: #f4f4f5; padding: 1rem; border-radius: 8px; font-family: monospace; margin: 1rem 0; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
  th { font-size: .75rem; text-transform: uppercase; color: #71717a; }
  ul { padding-left: 1.2rem; }
  .dim { color: #71717a; }
  footer { margin-top: 2rem; font-size: .85rem; color: #71717a; }
</style></head>
<body>
  <h1>${esc(project)} <span class="badge ${status}">${status}</span></h1>
  <p class="dim">Beginner architecture guide · ${meta}</p>
  <h2>How layers flow (inner → outer)</h2>
  <div class="diagram">${esc(diagram)}</div>
  <p>Business rules live in inner layers; UI and databases live in outer adapter layers. Inner code must not import outer code.</p>
  <h2>Where code goes</h2>
  <table>
    <tr><th>Layer</th><th>Purpose</th><th>Typical folders</th></tr>
    ${placementRows || '<tr><td colspan="3">No layers configured.</td></tr>'}
  </table>
  <h2>What to fix first</h2>
  <ul>${violationRows}</ul>
  <h2>Next steps</h2>
  <p><code>${arkCheckCommand(root)}</code></p>
  <p><code>${arkCommand(root, 'ark-check', '--recommend')}</code></p>
  <footer>Generated by ark-check --report --beginner. Config: ${esc(configPath)}</footer>
</body></html>`;
}

/**
 * Showcase HTML architecture report — the visual product of `/ark-explain` + ark-check.
 * Self-contained (no CDN), print-friendly, works offline. Designed to look great on a
 * fully governed repo (100% coverage, clean gates) and still be useful when debt remains.
 */
export function renderHtmlReport({
  root,
  config,
  exampleByLayer,
  fileCountByLayer,
  coverage,
  violations,
  ok,
  suppressed,
  version,
  configPath,
  generatedAt,
  skillGaps = [],
  originSnapshot = null,
  currentSnapshot = null,
  originJustCreated = false,
  adoption = null,
  /** Optional design-depth (doctor parity): designFitness, designSmells, pilotLoop, postGreenPath, goldenPattern */
  designDepth = null,
  /** Doctor advisory parity (X01): contractHealth (+governanceWeight), ambientState — guarded by reportParity.test.ts */
  advisories = null,
}) {
  const layers = Array.isArray(config.layers) ? config.layers : [];
  const rules = Array.isArray(config.rules) ? config.rules : [];
  const esc = htmlEscape;
  const project = (() => {
    try {
      return readJsonSafe(path.join(root, 'package.json'))?.name || path.basename(root);
    } catch {
      return path.basename(root);
    }
  })();

  const findRule = (from, to) => rules.find((r) => r.from === from && r.to === to);
  const deniedOut = (name) => rules.filter((r) => r.from === name && r.allowed === false).length;
  // Innermost first: more outbound denies → deeper (pure core).
  const ordered = [...layers].sort(
    (a, b) => deniedOut(b.name) - deniedOut(a.name) || a.name.localeCompare(b.name)
  );

  const deniedCount = rules.filter((r) => r.allowed === false).length;
  const allowedCount = rules.filter((r) => r.allowed === true).length;
  const guarded = layers.filter(
    (l) => Array.isArray(l.forbiddenGlobals) && l.forbiddenGlobals.length
  ).length;
  const enforcement = detectEnforcement(root);
  const gatesOn = enforcement.filter((e) => e.on).length;
  const status = ok ? 'PASS' : 'FAIL';

  const fitness = computeReportFitness({
    coverage,
    violations,
    ok,
    enforcement,
    config,
  });
  const {
    governedPercent,
    totalFiles,
    classifiedFiles,
    mode,
    modeLabel,
    modeBlurb,
    score,
    scoreCoverage,
    scoreClean,
    scoreGates,
    scoreRules,
    scoreTone,
    scoreCaption,
  } = fitness;

  const adoptionView = adoption || collectAdoptionGaps(root, config, coverage);
  const depth = designDepth && typeof designDepth === 'object' ? designDepth : {};
  const designFitness = depth.designFitness ?? null;
  const designSmells = Array.isArray(depth.designSmells) ? depth.designSmells : [];
  const designWeakBadge =
    designFitness?.designWeak === true
      ? ` <span class="badge design" title="Edges can be green while lived design residual remains (Shape). Not a FAIL.">design-weak</span>`
      : '';
  const designStripHtml =
    renderDesignDepthStrip({
      designFitness,
      designSmells,
      pilotLoop: depth.pilotLoop,
      postGreenPath: depth.postGreenPath,
      goldenPattern: depth.goldenPattern,
      mode,
    }) ||
    renderDesignCleanNote({
      designFitness,
      ok,
      mode,
    });
  const writePathHtml = renderWritePathAdoptionBlock(adoptionView.writePath);
  const baselineLegendHtml = renderBaselineSignalLegend();

  // ── Senior diagnostics (coupling, purity, contract density) ──────────────
  const layerNames = ordered.map((l) => l.name);
  const pairCount = Math.max(1, layers.length * Math.max(0, layers.length - 1));
  const denyRatio = Math.round((deniedCount / pairCount) * 1000) / 10;
  const fanOut = new Map(layerNames.map((n) => [n, 0]));
  const fanIn = new Map(layerNames.map((n) => [n, 0]));
  for (const from of layerNames) {
    for (const to of layerNames) {
      if (from === to) continue;
      const rule = findRule(from, to);
      const denied = rule && rule.allowed === false;
      if (!denied) {
        fanOut.set(from, (fanOut.get(from) || 0) + 1);
        fanIn.set(to, (fanIn.get(to) || 0) + 1);
      }
    }
  }
  const couplingRows = ordered
    .map((layer) => {
      const fo = fanOut.get(layer.name) || 0;
      const fi = fanIn.get(layer.name) || 0;
      const files = (fileCountByLayer instanceof Map ? fileCountByLayer.get(layer.name) : 0) || 0;
      const density = files > 0 ? Math.round((fo / files) * 100) / 100 : fo;
      return { name: layer.name, fo, fi, files, density, denyOut: deniedOut(layer.name) };
    })
    .sort((a, b) => b.fo - a.fo || b.fi - a.fi);

  const purityLayers = ordered.filter(
    (l) => Array.isArray(l.forbiddenGlobals) && l.forbiddenGlobals.length
  );
  const infraLayers = ordered.filter((l) => l.mayImportInfrastructure);
  const excludeLayers = ordered.filter((l) => Array.isArray(l.exclude) && l.exclude.length);
  const intentMap = ordered
    .filter((l) => Array.isArray(l.intentPrefixes) && l.intentPrefixes.length)
    .map((l) => ({ name: l.name, prefixes: l.intentPrefixes }));

  const emptyLayers = coverage?.emptyLayers ?? [];
  const layersWithoutRules = coverage?.layersWithoutRules ?? [];
  const unclassifiedCount = coverage?.unclassified?.count ?? 0;
  const includeRoots = Array.isArray(config.include) ? config.include : [];

  const typeOnlyN = violations.filter((v) => v.typeOnly).length;
  const valueN = violations.length - typeOnlyN;
  const byEdge = new Map();
  for (const v of violations) {
    if (!v.fromLayer || !v.toLayer) continue;
    const key = `${v.fromLayer} → ${v.toLayer}`;
    byEdge.set(key, (byEdge.get(key) || 0) + 1);
  }
  const topEdges = [...byEdge.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  let packageManagerLabel = 'npm';
  try {
    packageManagerLabel = detectPackageManager(root);
  } catch {
    /* ignore */
  }

  const baselinePath = path.join(root, '.ark-baseline.json');
  let baselineKeys = 0;
  if (fs.existsSync(baselinePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      baselineKeys = Array.isArray(raw?.violations)
        ? raw.violations.length
        : Array.isArray(raw)
          ? raw.length
          : typeof raw === 'object' && raw
            ? Object.keys(raw).length
            : 0;
    } catch {
      baselineKeys = suppressed || 0;
    }
  }

  // Pattern specificity hotspots: very broad globs (**/ or bare *) vs file-precise.
  const broadPatterns = [];
  const precisePatterns = [];
  for (const layer of ordered) {
    for (const pattern of layer.patterns || []) {
      const p = String(pattern);
      const scoreP = patternSpecificity(p);
      if (p.includes('**') && p.split('/').filter(Boolean).length <= 2) {
        broadPatterns.push({ layer: layer.name, pattern: p, score: scoreP });
      }
      if (!p.includes('*') || /\.[a-zA-Z0-9]+$/.test(p.replace(/\*$/, ''))) {
        if (p.includes('.') && !p.endsWith('/**')) {
          precisePatterns.push({ layer: layer.name, pattern: p, score: scoreP });
        }
      }
    }
  }
  broadPatterns.sort((a, b) => a.score - b.score);
  precisePatterns.sort((a, b) => b.score - a.score);

  const counts = fileCountByLayer instanceof Map ? fileCountByLayer : new Map();
  const maxFiles = Math.max(1, ...ordered.map((l) => counts.get(l.name) || 0));

  // Concentric “onion” SVG — outer entrypoints, pure core in the center.
  const palette = [
    '#38bdf8',
    '#818cf8',
    '#a78bfa',
    '#e879f9',
    '#fb7185',
    '#fb923c',
    '#fbbf24',
    '#a3e635',
    '#34d399',
    '#2dd4bf',
    '#22d3ee',
    '#60a5fa',
  ];
  // ordered is inner→outer; reverse for drawing outer rings first
  const outerFirst = [...ordered].reverse();
  const n = outerFirst.length || 1;
  const cx = 200;
  const cy = 200;
  const rMax = 185;
  const rMin = 28;
  const rings = outerFirst
    .map((layer, i) => {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const rOuter = rMax - t0 * (rMax - rMin);
      const rInner = rMax - t1 * (rMax - rMin);
      const color = palette[i % palette.length];
      const files = counts.get(layer.name) || 0;
      // Donut sector as full ring (annulus) via two arcs
      const ringPath = (() => {
        if (rInner <= 0.5) {
          return `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.2"/>`;
        }
        return `<circle cx="${cx}" cy="${cy}" r="${(rOuter + rInner) / 2}" fill="none" stroke="${color}" stroke-width="${Math.max(6, rOuter - rInner - 2)}" stroke-opacity="0.85"/>`;
      })();
      const labelR = (rOuter + rInner) / 2;
      const labelY = cy - labelR + (i === n - 1 ? 0 : 0);
      // Labels stacked on the right of the diagram for readability
      return { layer, color, files, ringPath, labelR, i };
    })
    .map((item, idx, arr) => {
      const legendY = 28 + idx * 22;
      return `${item.ringPath}
        <circle cx="430" cy="${legendY}" r="5" fill="${item.color}"/>
        <text x="442" y="${legendY + 4}" class="svg-lbl">${esc(item.layer.name)} · ${item.files}</text>`;
    })
    .join('\n');
  const coreLabel =
    ordered.length > 0
      ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="svg-core">${esc(ordered[0].name)}</text>`
      : '';
  const onionSvg = `<svg viewBox="0 0 560 400" class="onion" role="img" aria-label="Architecture layers from outer adapters to inner core">
    <rect x="0" y="0" width="560" height="400" fill="transparent"/>
    ${rings}
    ${coreLabel}
    <text x="${cx}" y="388" text-anchor="middle" class="svg-cap">outer adapters → pure core</text>
  </svg>`;

  // Coverage bars
  const barRows = ordered
    .map((layer) => {
      const files = counts.get(layer.name) || 0;
      const pct = Math.round((files / maxFiles) * 100);
      const example = exampleByLayer?.get?.(layer.name);
      return `<div class="bar-row">
        <div class="bar-name">${esc(layer.name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-n">${files}</div>
        <div class="bar-ex">${example ? `<code>${esc(example)}</code>` : '<span class="dim">—</span>'}</div>
      </div>`;
    })
    .join('\n');

  const layerRows = ordered
    .map((layer) => {
      const tags = [
        Array.isArray(layer.forbiddenGlobals) && layer.forbiddenGlobals.length
          ? `<span class="tag warn">no ${layer.forbiddenGlobals.map(esc).join(', ')}</span>`
          : '',
        capabilityBadgesFor(layer, esc),
        layer.mayImportInfrastructure ? '<span class="tag">may import infra</span>' : '',
        Array.isArray(layer.intentPrefixes) && layer.intentPrefixes.length
          ? `<span class="tag">${layer.intentPrefixes.map(esc).join(' ')}</span>`
          : '',
        layer.optional ? '<span class="tag dim-tag">optional</span>' : '',
      ].join(' ');
      const example = exampleByLayer?.get?.(layer.name);
      const files = counts.get(layer.name) || 0;
      return `<tr>
        <td class="ln">${esc(layer.name)}<div class="tags">${tags}</div></td>
        <td>${layer.description ? esc(layer.description) : '<span class="dim">—</span>'}</td>
        <td class="num">${files}</td>
        <td><code class="pat">${(layer.patterns || []).map(esc).join('<br>') || '—'}</code></td>
        <td>${example ? `<code>${esc(example)}</code>` : '<span class="dim">no files yet</span>'}</td>
      </tr>`;
    })
    .join('\n');

  const flowRows = ordered
    .map((layer) => {
      const targets = ordered
        .filter((other) => other.name !== layer.name)
        .filter((other) => {
          const rule = findRule(layer.name, other.name);
          return !(rule && rule.allowed === false);
        })
        .map((other) => `<span class="chip ok">${esc(other.name)}</span>`)
        .join('');
      return `<div class="flow"><span class="flow-name">${esc(layer.name)}</span>
        <span class="flow-arrow">may import →</span>
        <span class="flow-targets">${targets || '<span class="dim">nothing (pure core)</span>'}</span></div>`;
    })
    .join('\n');

  const matrixHead = ordered.map((l) => `<th class="rot"><span>${esc(l.name)}</span></th>`).join('');
  const matrixBody = ordered
    .map((from) => {
      const cells = ordered
        .map((to) => {
          if (from.name === to.name) return '<td class="self">·</td>';
          const rule = findRule(from.name, to.name);
          if (!rule) return '<td class="implicit" title="no rule (implicitly allowed)">·</td>';
          return rule.allowed
            ? '<td class="allow" title="allowed">✓</td>'
            : `<td class="deny" title="${esc(rule.message || 'denied')}">✕</td>`;
        })
        .join('');
      return `<tr><th class="rowlbl">${esc(from.name)}</th>${cells}</tr>`;
    })
    .join('\n');

  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.ruleId)) byRule.set(v.ruleId, []);
    byRule.get(v.ruleId).push(v);
  }
  const violationBlocks = violations.length
    ? [...byRule.entries()]
        .map(([ruleId, items]) => {
          const hint = FIX_HINTS[ruleId];
          const rows = items
            .map((v) => {
              const edge =
                v.fromLayer && v.toLayer ? `${esc(v.fromLayer)} → ${esc(v.toLayer)}` : '';
              const enriched = enrichViolationWithFixClass(v);
              return `<li>
                <code>${esc(v.file)}:${v.line}</code>
                ${edge ? `<span class="edge">${edge}${v.target ? ` <span class="dim">(${esc(v.target)})</span>` : ''}</span>` : ''}
                <div class="msg">${esc(enriched.enthusiastHint || v.message)}</div>
              </li>`;
            })
            .join('\n');
          return `<div class="vgroup">
            <div class="vghead"><span class="rule">${esc(ruleId)}</span> <span class="dim">${items.length}</span></div>
            <ul class="vitems">${rows}</ul>
            ${hint ? `<div class="fix">fix: ${esc(hint)}</div>` : ''}
          </div>`;
        })
        .join('\n')
    : `<div class="clean hero-clean">
        <div class="clean-title">Architecture matches the contract</div>
        <div class="clean-body">No active violations${suppressed ? ` · ${suppressed} frozen by baseline` : ''}. This is what “honest green” looks like when coverage is real.</div>
      </div>`;

  const enforcementRows = enforcement
    .map(
      (e) =>
        `<div class="gate ${e.on ? 'on' : 'off'}">
          <span class="dot"></span>
          <div><b>${esc(e.name)}</b><div class="gdesc">${esc(e.what)}</div>
          ${e.where ? `<code>${esc(e.where)}</code>` : '<span class="dim">not configured</span>'}</div>
        </div>`
    )
    .join('\n');

  const skillsNote =
    skillGaps.length === 0
      ? '<div class="pill good">Agent skills current for detected tools</div>'
      : `<div class="pill warn">${skillGaps.length} skill gap(s) — run ark upgrade / --install-agent-gates</div>`;

  const meta = [
    version ? `ark-check v${esc(version)}` : '',
    generatedAt ? esc(generatedAt) : '',
    configPath ? `config: ${esc(configPath)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const govLabel =
    governedPercent == null ? '—' : `${governedPercent}% (${classifiedFiles}/${totalFiles})`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ark · ${esc(project)}</title>
<style>
  :root {
    --bg: #07090d; --panel: #10141b; --panel2: #161b24; --ink: #eef1f5; --dim: #8b93a0;
    --line: #243041; --green: #34d399; --red: #f87171; --accent: #38bdf8; --gold: #fbbf24;
    --violet: #a78bfa; --radius: 14px;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f4f6f9; --panel: #fff; --panel2: #f8fafc; --ink: #0f172a; --dim: #64748b;
      --line: #e2e8f0; --green: #059669; --red: #dc2626; --accent: #0284c7; --gold: #d97706;
      --violet: #7c3aed;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 0 4rem;
    background:
      radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 60%),
      radial-gradient(900px 500px at 100% 0%, color-mix(in srgb, var(--violet) 14%, transparent), transparent 55%),
      var(--bg);
    color: var(--ink);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 2rem 1.25rem; }
  .hero {
    display: grid; grid-template-columns: 1.4fr 0.9fr; gap: 1.25rem; align-items: stretch;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 820px) { .hero { grid-template-columns: 1fr; } }
  .card {
    background: linear-gradient(180deg, color-mix(in srgb, var(--panel) 92%, #fff 4%), var(--panel));
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 1.15rem 1.25rem; box-shadow: 0 20px 50px rgba(0,0,0,.18);
  }
  h1 { font-size: 1.65rem; margin: 0 0 .35rem; letter-spacing: -0.02em; }
  h2 { font-size: 1.05rem; margin: 0 0 .35rem; letter-spacing: -0.01em; }
  h3 { font-size: .92rem; margin: 1rem 0 .4rem; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
  .lede { color: var(--dim); margin: 0 0 1rem; max-width: 42rem; }
  .meta { color: var(--dim); font-size: .8rem; margin: .75rem 0 0; }
  .badge, .pill {
    display: inline-flex; align-items: center; gap: .35rem;
    padding: .2em .65em; border-radius: 999px; font-weight: 700; font-size: .78rem;
    letter-spacing: .03em; border: 1px solid transparent;
  }
  .PASS { background: color-mix(in srgb, var(--green) 18%, transparent); color: var(--green); border-color: color-mix(in srgb, var(--green) 35%, transparent); }
  .FAIL { background: color-mix(in srgb, var(--red) 18%, transparent); color: var(--red); border-color: color-mix(in srgb, var(--red) 35%, transparent); }
  .mode { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
  .pill.good { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green); }
  .pill.warn { background: color-mix(in srgb, var(--gold) 16%, transparent); color: var(--gold); }
  .score-card { display: flex; flex-direction: column; justify-content: center; text-align: center; min-height: 100%; }
  .score-ring {
    --p: ${score};
    width: 148px; height: 148px; margin: .25rem auto 0.85rem;
    border-radius: 50%;
    background:
      radial-gradient(var(--panel) 58%, transparent 59%),
      conic-gradient(var(--accent) calc(var(--p) * 1%), var(--line) 0);
    display: grid; place-items: center;
  }
  .score-ring.elite { background:
      radial-gradient(var(--panel) 58%, transparent 59%),
      conic-gradient(var(--green) calc(var(--p) * 1%), var(--line) 0); }
  .score-ring.strong { background:
      radial-gradient(var(--panel) 58%, transparent 59%),
      conic-gradient(var(--accent) calc(var(--p) * 1%), var(--line) 0); }
  .score-ring.ok { background:
      radial-gradient(var(--panel) 58%, transparent 59%),
      conic-gradient(var(--gold) calc(var(--p) * 1%), var(--line) 0); }
  .score-ring.weak { background:
      radial-gradient(var(--panel) 58%, transparent 59%),
      conic-gradient(var(--red) calc(var(--p) * 1%), var(--line) 0); }
  .score-n { font-size: 2.1rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
  .score-cap { color: var(--dim); font-size: .85rem; margin: 0; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: .65rem; margin: 1rem 0 0; }
  @media (max-width: 720px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
  .kpi { background: var(--panel2); border: 1px solid var(--line); border-radius: 12px; padding: .7rem .8rem; cursor: help; }
  .kpi b { display: block; font-size: 1.25rem; letter-spacing: -0.02em; }
  .kpi span { color: var(--dim); font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; }
  .kpi-hint {
    display: block; margin-top: .4rem; color: var(--dim); font-size: .68rem; font-style: normal;
    font-weight: 450; line-height: 1.35; letter-spacing: 0; text-transform: none; max-width: 16rem;
  }
  .score-parts span { cursor: help; border-bottom: 1px dotted color-mix(in srgb, var(--dim) 55%, transparent); }
  .badge[title] { cursor: help; }
  .badge.design {
    background: color-mix(in srgb, var(--gold) 18%, transparent); color: var(--gold);
    border-color: color-mix(in srgb, var(--gold) 40%, transparent);
  }
  .badge.design-ok {
    background: color-mix(in srgb, var(--green) 16%, transparent); color: var(--green);
    border-color: color-mix(in srgb, var(--green) 35%, transparent);
  }
  .design-strip { border-left: 3px solid var(--gold); }
  .design-strip.is-clean { border-left-color: var(--green); }
  .design-strip.has-smells { border-left-color: var(--gold); }
  .design-head { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
  .pilot-card {
    margin-top: .35rem; padding: .75rem .9rem; border-radius: 12px;
    background: var(--panel2); border: 1px solid var(--line);
  }
  .write-path-block { margin-top: .15rem; }
  .baseline-legend summary { cursor: pointer; color: var(--dim); font-size: .84rem; }
  .section { margin-top: 1.35rem; }
  .grid-2 { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 1rem; }
  @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
  .onion { width: 100%; height: auto; display: block; }
  .svg-lbl { fill: var(--dim); font-size: 11px; font-family: ui-sans-serif, system-ui, sans-serif; }
  .svg-core { fill: var(--ink); font-size: 11px; font-weight: 700; font-family: ui-sans-serif, system-ui, sans-serif; }
  .svg-cap { fill: var(--dim); font-size: 11px; font-family: ui-sans-serif, system-ui, sans-serif; }
  .bar-row { display: grid; grid-template-columns: 10.5rem 1fr 2.2rem minmax(0, 1fr); gap: .55rem; align-items: center; padding: .28rem 0; border-bottom: 1px solid var(--line); }
  .bar-name { font-weight: 600; font-size: .86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-track { height: 8px; background: var(--line); border-radius: 99px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--violet)); border-radius: 99px; }
  .bar-n { text-align: right; font-variant-numeric: tabular-nums; color: var(--dim); font-size: .85rem; }
  .bar-ex { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dim { color: var(--dim); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .84em; }
  code.pat { font-size: .78em; color: var(--dim); }
  table { width: 100%; border-collapse: collapse; }
  .layers td, .layers th { text-align: left; padding: .65rem .55rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  .layers th { color: var(--dim); font-weight: 600; font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; }
  .ln { font-weight: 650; }
  .num { font-variant-numeric: tabular-nums; font-weight: 650; }
  .tags { margin-top: .3rem; display: flex; flex-wrap: wrap; gap: .25rem; }
  .tag { display: inline-block; padding: .08em .45em; border: 1px solid var(--line); border-radius: 6px; font-size: .68rem; color: var(--dim); }
  .tag.warn { border-color: color-mix(in srgb, var(--gold) 40%, var(--line)); color: var(--gold); }
  .dim-tag { opacity: .75; }
  .flow { display: flex; gap: .5rem; align-items: baseline; padding: .45rem 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .flow-name { font-weight: 650; min-width: 12rem; }
  .flow-arrow { color: var(--dim); font-size: .8rem; }
  .flow-targets { display: flex; flex-wrap: wrap; gap: .3rem; }
  .chip { display: inline-block; padding: .12em .5em; border: 1px solid var(--line); border-radius: 6px; font-size: .76rem; color: var(--dim); background: var(--panel2); }
  .chip.ok { color: var(--ink); border-color: color-mix(in srgb, var(--accent) 30%, var(--line)); }
  details { margin-top: .85rem; }
  summary { cursor: pointer; color: var(--accent); font-size: .9rem; }
  /* Matrix must NOT inherit global table{width:100%} — that bloated the label column
     and shoved every cell to the right. Keep it compact and left-aligned. */
  .matrix-scroll {
    overflow-x: auto; margin-top: .75rem; max-width: 100%;
    text-align: left; -webkit-overflow-scrolling: touch;
  }
  .matrix {
    width: max-content; max-width: none; border-collapse: collapse;
    font-size: .8rem; margin: 0; table-layout: fixed;
  }
  .matrix th, .matrix td { border: 1px solid var(--line); }
  .matrix td {
    width: 2.05rem; min-width: 2.05rem; max-width: 2.05rem;
    height: 2.05rem; text-align: center; font-weight: 700; padding: 0;
  }
  .matrix .rowlbl {
    text-align: left; padding: 0 .75rem 0 .35rem; color: var(--dim);
    font-weight: 600; white-space: nowrap; width: auto; min-width: 9.5rem;
    max-width: none; position: sticky; left: 0; z-index: 1;
    background: var(--panel); box-shadow: 4px 0 8px -4px rgba(0,0,0,.25);
  }
  .matrix thead th:first-child,
  .matrix tr th.rowlbl { background: var(--panel); }
  .matrix .corner {
    position: sticky; left: 0; z-index: 2; background: var(--panel);
    min-width: 9.5rem; box-shadow: 4px 0 8px -4px rgba(0,0,0,.25);
  }
  .matrix .rot {
    height: 9.5rem; vertical-align: bottom; padding: .2rem .15rem;
    width: 2.05rem; min-width: 2.05rem; max-width: 2.05rem;
  }
  .matrix .rot span {
    writing-mode: vertical-rl; transform: rotate(180deg); color: var(--dim);
    font-weight: 600; white-space: nowrap; display: inline-block; max-height: 9rem;
    overflow: hidden; text-overflow: ellipsis;
  }
  .allow { color: var(--green); background: color-mix(in srgb, var(--green) 12%, transparent); }
  .deny { color: var(--red); background: color-mix(in srgb, var(--red) 12%, transparent); }
  .implicit { color: var(--dim); }
  .self { color: var(--line); }
  .legend { color: var(--dim); font-size: .8rem; margin: .55rem 0 0; }
  .gates { display: grid; grid-template-columns: repeat(2, 1fr); gap: .65rem; }
  @media (max-width: 700px) { .gates { grid-template-columns: 1fr; } }
  .gate { display: flex; gap: .65rem; align-items: flex-start; padding: .75rem .8rem; border-radius: 12px; border: 1px solid var(--line); background: var(--panel2); }
  .gate .dot { width: .65rem; height: .65rem; border-radius: 50%; margin-top: .35rem; background: var(--line); flex: 0 0 auto; }
  .gate.on .dot { background: var(--green); box-shadow: 0 0 0 4px color-mix(in srgb, var(--green) 20%, transparent); }
  .gate.off { opacity: .72; }
  .gdesc { color: var(--dim); font-size: .85rem; margin: .1rem 0 .25rem; }
  .vgroup { background: var(--panel2); border: 1px solid var(--line); border-left: 3px solid var(--red); border-radius: 10px; padding: .75rem .9rem; margin-bottom: .6rem; }
  .vghead { display: flex; gap: .5rem; align-items: baseline; }
  .rule { font-weight: 700; font-size: .8rem; color: var(--red); }
  .vitems { list-style: none; padding: 0; margin: .4rem 0 0; }
  .vitems li { padding: .35rem 0; border-top: 1px solid var(--line); }
  .vitems li:first-child { border-top: none; }
  .edge { color: var(--accent); font-weight: 650; margin-left: .35rem; }
  .fix { margin-top: .4rem; color: var(--dim); font-size: .86rem; }
  .clean, .hero-clean { background: var(--panel2); border: 1px solid var(--line); border-left: 3px solid var(--green); border-radius: 12px; padding: 1rem 1.1rem; }
  .clean-title { font-weight: 750; color: var(--green); margin-bottom: .25rem; }
  .clean-body { color: var(--dim); }
  .cmds { display: grid; gap: .35rem; background: var(--panel2); border: 1px solid var(--line); border-radius: 12px; padding: .9rem 1rem; }
  .cmds code { display: block; padding: .15rem 0; overflow-x: auto; }
  footer { margin-top: 2.25rem; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--dim); font-size: .8rem; }
  .brand { display: inline-flex; align-items: center; gap: .4rem; color: var(--dim); font-size: .78rem; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; margin-bottom: .55rem; }
  .brand i { width: .55rem; height: .55rem; border-radius: 2px; background: linear-gradient(135deg, var(--accent), var(--violet)); display: inline-block; }
  .senior h3 { margin-top: 1.25rem; }
  .senior-list { margin: .2rem 0 0; padding-left: 1.1rem; color: var(--ink); }
  .senior-list li { margin: .2rem 0; }
  .senior-list .edge { margin-left: 0; }
  .delta.up { color: var(--green); font-weight: 700; }
  .delta.down { color: var(--red); font-weight: 700; }
  .delta.flat { color: var(--dim); }
  .evolve { border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); }
  @media print {
    body { background: #fff; color: #111; padding: 0; }
    .card, .kpi, .gate, .cmds, .clean, .vgroup { box-shadow: none; break-inside: avoid; }
    details { open: true; }
  }
</style></head>
<body><div class="wrap">
  <div class="hero">
    <div class="card">
      <div class="brand"><i></i> Ark architecture report</div>
      <h1>${esc(project)} <span class="badge ${status}" title="${status === 'PASS' ? 'Architecture check is green: 0 active violations against the contract.' : 'Architecture check failed: active violations remain (or the scan could not complete cleanly).'}">${status}</span> <span class="badge mode" title="${esc(modeBadgeHint(mode))}">${esc(modeLabel)}</span>${designWeakBadge}</h1>
      <p class="lede">${esc(modeBlurb)}${designFitness?.designWeak ? ' Design residual remains (see strip below) — not a FAIL.' : ''} One machine-readable contract · write gate · CI · optional runtime.</p>
      <div class="kpis">
        ${metricKpi(
          govLabel,
          'Governed',
          'Share of scanned files assigned to a contract layer. 100% means every in-scope file has a home.'
        )}
        ${metricKpi(
          layers.length,
          'Layers',
          'How many architecture layers the contract defines (cores + optional product layers).'
        )}
        ${metricKpi(
          `${gatesOn}/${enforcement.length}`,
          'Gates configured',
          'Write hook, CI workflow, ESLint plugin, and baseline file — how many enforcement surfaces are present, not proof that each is active or required.'
        )}
        ${metricKpi(
          `${violations.length}${suppressed ? ` · ${suppressed}Δ` : ''}`,
          `Violations${suppressed ? ' · frozen' : ''}`,
          suppressed
            ? 'Active contract breaks right now; Δ = keys frozen in baseline (not failing until ratchet).'
            : 'Active contract breaks (layer imports, purity, etc.). Zero means edges match the rules.'
        )}
      </div>
      <p class="meta">${meta}</p>
      ${skillsNote}
    </div>
    <div class="card score-card" title="Human fitness signal only — not a CI gate. Weighted blend of coverage, cleanliness, live gates, and rule density.">
      <div class="score-ring ${scoreTone}"><div><div class="score-n">${score}</div><div class="dim" style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase">Ark score</div></div></div>
      <p class="score-cap">${esc(scoreCaption)}</p>
      <p class="meta score-parts" style="margin-top:.65rem">
        <span title="0.4 weight — governed file percent (or 50 if coverage unknown).">${esc(`Coverage ${scoreCoverage}`)}</span>
        · <span title="0.3 weight — 100 with zero active violations; drops as violations pile up.">${esc(`Clean ${scoreClean}`)}</span>
        · <span title="0.2 weight — share of enforcement points that are present on disk (hook, CI, ESLint, baseline).">${esc(`Gates ${scoreGates}`)}</span>
        · <span title="0.1 weight — how dense the deny matrix is relative to layer pairs (stricter inward architecture scores higher).">${esc(`Rules ${scoreRules}`)}</span>
      </p>
    </div>
  </div>

  ${designStripHtml}

  <div class="section card" id="adoption">
    <h2>Adoption</h2>
    <p class="dim" style="margin:.15rem 0 .75rem;font-size:.88rem">
      Co-pilot completeness — separate from the 0–100 fitness score above. Hosts, MCP health, origin snapshot, core optionality, baseline policy.
    </p>
    <div class="kpis" style="margin-bottom:.75rem">
      ${metricKpi(
        adoptionView.gaps.length === 0 ? 'OK' : adoptionView.gaps.length,
        adoptionView.gaps.length === 0 ? 'No adoption gaps' : 'Adoption gap(s)',
        adoptionView.gaps.length === 0
          ? 'Hosts, MCP argv, origin snapshot, and core optionality look complete for co-pilot use.'
          : 'Install or fix the listed gaps so agents get write gates, MCP, and honest cores.'
      )}
      ${metricKpi(
        adoptionView.originReport.present ? 'yes' : 'no',
        'Origin report',
        'First architecture snapshot under .ark/reports/origin.* — future reports show evolution deltas against it.'
      )}
      ${metricKpi(
        adoptionView.baseline.signal,
        'Baseline policy',
        baselineSignalHint(adoptionView.baseline.signal)
      )}
      ${metricKpi(
        adoptionView.mcp.ok ? 'ok' : 'fix',
        'Repo MCP argv',
        adoptionView.mcp.ok
          ? 'Repo MCP config points at a single ark/arkgate MCP bin (no dual-bin conflict).'
          : 'Broken MCP argv: more than one of ark-mcp/arkgate-mcp — migrate with --install-agent-gates --migrate-commands.'
      )}
    </div>
    ${
      adoptionView.gaps.length
        ? `<ul class="senior-list">${adoptionView.gaps
            .map(
              (g) =>
                `<li><b>${esc(g.id)}</b> — ${esc(g.message)}${
                  g.fix ? `<br/><code>${esc(g.fix)}</code>` : ''
                }</li>`
            )
            .join('')}</ul>`
        : '<p class="clean-body">No adoption gaps detected for hosts, MCP, core optionality, or origin.</p>'
    }
    ${
      adoptionView.coreOptional.length
        ? `<p class="dim" style="margin-top:.65rem">Optional-but-populated cores: <code>${adoptionView.coreOptional
            .map((c) => `${esc(c.layer)} (${c.files})`)
            .join('</code>, <code>')}</code></p>`
        : ''
    }
    ${
      adoptionView.hosts.length
        ? `<p class="dim" style="margin-top:.4rem">Hosts: ${adoptionView.hosts
            .map((h) => `${esc(h.host)}${h.complete ? ' ✓' : ' incomplete'}`)
            .join(' · ')}</p>`
        : ''
    }
    ${writePathHtml}
    ${baselineLegendHtml}
  </div>

  <div class="section grid-2">
    <div class="card">
      <h2>Architecture map</h2>
      <p class="dim" style="margin:.15rem 0 0.75rem;font-size:.88rem">Outer rings = entrypoints & adapters. Center = purest core.</p>
      ${onionSvg}
    </div>
    <div class="card">
      <h2>Files per layer</h2>
      <p class="dim" style="margin:.15rem 0 0.75rem;font-size:.88rem">${classifiedFiles} classified · ${totalFiles} in scope${coverage?.unclassified?.count ? ` · ${coverage.unclassified.count} unclassified` : ''}</p>
      ${barRows || '<p class="dim">No layer file counts.</p>'}
    </div>
  </div>

  <div class="section card">
    <h2>Layers</h2>
    <p class="dim" style="margin:.15rem 0 .75rem;font-size:.88rem">Innermost (most restricted) → outermost (entrypoints). Forbidden globals protect pure cores.</p>
    <table class="layers">
      <tr><th>Layer</th><th>Purpose</th><th>Files</th><th>Patterns</th><th>Example</th></tr>
      ${layerRows || '<tr><td colspan="5" class="dim">No layers configured.</td></tr>'}
    </table>
  </div>

  <div class="section card">
    <h2>Dependency direction</h2>
    <p class="dim" style="margin:.15rem 0 .75rem;font-size:.88rem">Inner layers stay ignorant of outer ones. Each row lists what it may import.</p>
    ${flowRows || '<p class="dim">No layers configured.</p>'}
    <details open>
      <summary>Full matrix (precise ✓ / ✕ grid)</summary>
      <div class="matrix-scroll"><table class="matrix">
        <thead><tr><th class="corner"></th>${matrixHead}</tr></thead>
        <tbody>${matrixBody}</tbody>
      </table></div>
      <p class="legend">Row imports column (left → top). ✓ allowed · ✕ denied · · = no explicit rule / self. Denied edges: ${deniedCount} · explicit allows: ${allowedCount} · purity-guarded layers: ${guarded}</p>
    </details>
  </div>

  <div class="section card">
    <h2>Violations</h2>
    ${violationBlocks}
  </div>

  ${renderAdvisorySections(advisories, esc)}

  <div class="section card">
    <h2>Enforcement points</h2>
    <p class="dim" style="margin:.15rem 0 .85rem;font-size:.88rem">Write-time · merge-time · editor · ratchet. Same contract everywhere.</p>
    <div class="gates">${enforcementRows}</div>
  </div>

  ${(() => {
    if (!currentSnapshot) return '';
    // First report: originSnapshot is null at render time (written to disk just after).
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
    const rows = [
      ['Ark score', originSnapshot.score, currentSnapshot.score, ''],
      ['Governed %', originSnapshot.governedPercent, currentSnapshot.governedPercent, 'pp'],
      ['Files in scope', originSnapshot.totalFiles, currentSnapshot.totalFiles, ''],
      ['Classified files', originSnapshot.classifiedFiles, currentSnapshot.classifiedFiles, ''],
      ['Active violations', originSnapshot.activeViolations, currentSnapshot.activeViolations, ''],
      ['Value violations', originSnapshot.valueViolations, currentSnapshot.valueViolations, ''],
      ['Type-only violations', originSnapshot.typeOnlyViolations, currentSnapshot.typeOnlyViolations, ''],
      ['Layers', originSnapshot.layerCount, currentSnapshot.layerCount, ''],
      ['Deny rules', originSnapshot.denyRules, currentSnapshot.denyRules, ''],
      ['Gates configured', originSnapshot.gatesOn, currentSnapshot.gatesOn, ''],
    ];
    const originDate = (originSnapshot.generatedAt || '').slice(0, 10) || 'origin';
    const nowDate = (currentSnapshot.generatedAt || '').slice(0, 10) || 'now';
    const tr = rows
      .map(([label, from, to, unit]) => {
        const d =
          typeof from === 'number' && typeof to === 'number' ? to - from : null;
        const good =
          label.includes('violation') || label.includes('Violation')
            ? d != null && d <= 0
            : label.includes('Governed') || label.includes('score') || label.includes('Classified') || label.includes('Gates')
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
    // Layer file deltas
    const originLayers = originSnapshot.layerFiles || {};
    const currentLayers = currentSnapshot.layerFiles || {};
    const layerKeys = [...new Set([...Object.keys(originLayers), ...Object.keys(currentLayers)])].sort();
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
    return `<div class="section card evolve">
      <h2>Evolution vs origin</h2>
      <p class="dim" style="margin:.15rem 0 .75rem;font-size:.88rem">
        Origin snapshot <code>${esc(originDate)}</code> → this report <code>${esc(nowDate)}</code>
        · frozen at <code>.ark/reports/origin.*</code> · reopen origin HTML anytime for the starting picture.
      </p>
      <table class="layers">
        <tr><th>Metric</th><th>Origin</th><th>Now</th><th>Δ</th></tr>
        ${tr}
      </table>
      <h3>Files per layer</h3>
      <table class="layers">
        <tr><th>Layer</th><th>Origin</th><th>Now</th><th>Δ</th></tr>
        ${layerTr || '<tr><td colspan="4" class="dim">No layer file data in snapshots.</td></tr>'}
      </table>
      <p class="legend">Green Δ = improvement for that metric (↑ coverage/score/gates, ↓ violations). History JSON under <code>.ark/reports/history/</code> (last ${ARK_REPORT_HISTORY_MAX}).</p>
    </div>`;
  })()}

  <div class="section card senior">
    <h2>Senior diagnostics</h2>
    <p class="dim" style="margin:.15rem 0 .85rem;font-size:.88rem">
      Coupling, purity surface, contract density, and config forensics — for tech leads reviewing the fitness of the gate itself.
    </p>

    <h3>Contract density</h3>
    <div class="kpis" style="margin-top:.35rem">
      ${metricKpi(
        `${denyRatio}%`,
        'Edges denied',
        'Denied directed layer pairs ÷ all possible pairs. Higher = stricter inward dependency rules.'
      )}
      ${metricKpi(
        deniedCount,
        'Deny rules',
        'Explicit allowed:false rules in ark.config.json (row may not import column).'
      )}
      ${metricKpi(
        allowedCount,
        'Explicit allows',
        'Explicit allowed:true edges. Most opens are implicit (no rule) unless you document them.'
      )}
      ${metricKpi(
        pairCount,
        'Directed pairs',
        'layers × (layers − 1) — every ordered from→to pair the matrix can constrain.'
      )}
    </div>
    <p class="dim" style="margin:.55rem 0 0;font-size:.84rem">
      Deny ratio = denied ÷ (layers × (layers−1)). High ratio = strict inward architecture.
      Package manager detected: <code>${esc(packageManagerLabel)}</code>
      · include roots: <code>${includeRoots.map(esc).join('</code>, <code>') || '—'}</code>
      ${emptyLayers.length ? ` · empty layers: <code>${emptyLayers.map(esc).join(', ')}</code>` : ''}
      ${layersWithoutRules.length ? ` · layers with no rule edge: <code>${layersWithoutRules.map(esc).join(', ')}</code>` : ''}
      ${unclassifiedCount ? ` · unclassified files: <b>${unclassifiedCount}</b>` : ''}
    </p>

    <h3>Layer coupling (allowed import graph)</h3>
    <p class="dim" style="margin:.1rem 0 .55rem;font-size:.84rem">
      Fan-out = layers this layer may import · Fan-in = layers that may import it · based on non-denied edges (implicit allow counts as open).
    </p>
    <table class="layers">
      <tr><th>Layer</th><th>Files</th><th>Fan-out</th><th>Fan-in</th><th>Deny-out</th><th>FO/files</th></tr>
      ${couplingRows
        .map(
          (r) => `<tr>
          <td class="ln">${esc(r.name)}</td>
          <td class="num">${r.files}</td>
          <td class="num">${r.fo}</td>
          <td class="num">${r.fi}</td>
          <td class="num">${r.denyOut}</td>
          <td class="num">${r.density}</td>
        </tr>`
        )
        .join('\n')}
    </table>
    <p class="legend">High fan-out on a large presentation layer is normal. High fan-out on a “domain” layer is a smell — the core is leaking outward privileges.</p>

    <h3>Purity &amp; infrastructure surface</h3>
    <div class="grid-2" style="margin-top:.5rem">
      <div>
        <div class="pill ${purityLayers.length ? 'good' : 'warn'}" style="margin-bottom:.55rem">
          ${purityLayers.length} purity-guarded layer(s)
        </div>
        ${
          purityLayers.length
            ? `<ul class="senior-list">${purityLayers
                .map(
                  (l) =>
                    `<li><b>${esc(l.name)}</b> forbids <code>${(l.forbiddenGlobals || []).map(esc).join('</code>, <code>')}</code></li>`
                )
                .join('')}</ul>`
            : '<p class="dim">No <code>forbiddenGlobals</code> — ambient I/O can still leak into pure cores.</p>'
        }
      </div>
      <div>
        <div class="pill ${infraLayers.length ? 'good' : 'warn'}" style="margin-bottom:.55rem">
          ${infraLayers.length} infra-capable layer(s)
        </div>
        ${
          infraLayers.length
            ? `<ul class="senior-list">${infraLayers
                .map((l) => `<li><b>${esc(l.name)}</b> <span class="tag">mayImportInfrastructure</span></li>`)
                .join('')}</ul>`
            : '<p class="dim">No layer opts into infrastructure imports via <code>mayImportInfrastructure</code> (write-gate heuristic still applies to ungoverned targets).</p>'
        }
        ${
          excludeLayers.length
            ? `<p class="dim" style="margin-top:.65rem">Exclude globs (facade / kernel carve-outs):</p>
               <ul class="senior-list">${excludeLayers
                 .map(
                   (l) =>
                     `<li><b>${esc(l.name)}</b> · <code>${(l.exclude || []).map(esc).join('</code>, <code>')}</code></li>`
                 )
                 .join('')}</ul>`
            : ''
        }
      </div>
    </div>

    <h3>Intent prefixes</h3>
    ${
      intentMap.length
        ? `<table class="layers"><tr><th>Layer</th><th>Prefixes</th></tr>
          ${intentMap
            .map(
              (row) =>
                `<tr><td class="ln">${esc(row.name)}</td><td><code>${row.prefixes.map(esc).join('</code> <code>')}</code></td></tr>`
            )
            .join('\n')}</table>`
        : '<p class="dim">No <code>intentPrefixes</code> on layers — runtime intent governance and string-intent checks have less to bind to.</p>'
    }

    <h3>Layer balance (educational)</h3>
    ${
      adoptionView.layerBalance
        ? `<p class="dim" style="margin:.1rem 0 .55rem;font-size:.88rem">${esc(adoptionView.layerBalance.educational)}</p>
           <p class="meta">PresentationAdapters ${adoptionView.layerBalance.presentationFiles} · DomainModel ${adoptionView.layerBalance.domainFiles} · total ${adoptionView.layerBalance.totalFiles}</p>`
        : '<p class="dim" style="margin:.1rem 0 .55rem;font-size:.88rem">No presentation-heavy / thin-domain imbalance flagged (educational only when Presentation ≥50% and Domain &lt;10% of files).</p>'
    }

    <h3>Pattern forensics</h3>
    <div class="grid-2" style="margin-top:.45rem">
      <div>
        <p class="dim" style="margin:0 0 .4rem;font-size:.84rem">Broadest globs (watch for over-governance / false layer hits)</p>
        ${
          broadPatterns.length
            ? `<ul class="senior-list">${broadPatterns
                .slice(0, 8)
                .map(
                  (p) =>
                    `<li><b>${esc(p.layer)}</b> · <code>${esc(p.pattern)}</code> <span class="dim">spec ${p.score}</span></li>`
                )
                .join('')}</ul>`
            : '<p class="dim">No ultra-broad patterns detected.</p>'
        }
      </div>
      <div>
        <p class="dim" style="margin:0 0 .4rem;font-size:.84rem">Most precise patterns (file-level overlays, facades)</p>
        ${
          precisePatterns.length
            ? `<ul class="senior-list">${precisePatterns
                .slice(0, 8)
                .map(
                  (p) =>
                    `<li><b>${esc(p.layer)}</b> · <code>${esc(p.pattern)}</code> <span class="dim">spec ${p.score}</span></li>`
                )
                .join('')}</ul>`
            : '<p class="dim">No file-level patterns — only directory globs.</p>'
        }
      </div>
    </div>

    <h3>Debt &amp; violation taxonomy</h3>
    <div class="kpis" style="margin-top:.35rem">
      ${metricKpi(
        violations.length,
        'Active',
        'Violations that fail the check right now (not frozen by baseline).'
      )}
      ${metricKpi(
        valueN,
        'Value edges',
        'Runtime import edges that cross a deny rule (stronger debt than type-only).'
      )}
      ${metricKpi(
        typeOnlyN,
        'Type-only',
        'Type-only imports across a deny edge — often mechanical-safe to rewrite as import type.'
      )}
      ${metricKpi(
        suppressed || baselineKeys,
        'Baseline keys',
        'Distinct frozen debt keys in .ark-baseline.json (or suppressed count for this run).'
      )}
    </div>
    ${
      topEdges.length
        ? `<p class="dim" style="margin:.55rem 0 .35rem;font-size:.84rem">Hottest active edges</p>
           <ul class="senior-list">${topEdges
             .map(([edge, n]) => `<li><span class="edge">${esc(edge)}</span> · <b>${n}</b></li>`)
             .join('')}</ul>`
        : '<p class="dim" style="margin-top:.55rem">No active edge concentration — either clean or all debt is baselined.</p>'
    }

    <details style="margin-top:1rem">
      <summary>Score model (transparent)</summary>
      <p class="legend">
        Ark score = 0.4×coverage + 0.3×clean + 0.2×gates + 0.1×rule-density.
        Coverage=${scoreCoverage}, clean=${scoreClean}, gates=${scoreGates}, rules=${scoreRules} → <b>${score}</b>.
        This is a fitness signal for humans, not a CI gate.
      </p>
      <ul class="senior-list" style="margin-top:.45rem">
        <li><b>Coverage</b> — % of in-scope files that match a layer pattern.</li>
        <li><b>Clean</b> — 100 with zero active violations; falls as breaks accumulate.</li>
        <li><b>Gates</b> — share of write / CI / ESLint / baseline enforcement points present.</li>
        <li><b>Rules</b> — deny-matrix density (more inward denies → higher component).</li>
        <li><b>PASS / FAIL</b> — binary edge honesty (active violations), independent of the 0–100 score.</li>
        <li><b>SUGGEST / ADAPT / ENFORCE</b> — whether the contract is honest enough to protect the tree (not a skill grade).</li>
      </ul>
    </details>
  </div>

  <div class="section card">
    <h2>Commands worth memorizing</h2>
    <div class="cmds">
      <code>${arkCheckCommand(root)}</code>
      <code>${arkCommand(root, 'ark-check', '--coverage')}</code>
      <code>${arkCommand(root, 'ark-check', '--plan')}</code>
      <code>${arkCommand(root, 'ark-check', '--doctor')}</code>
      <code>${arkCommand(root, 'ark-check', '--report ark-report.html')}</code>
      <code>/ark-place "&lt;what you're building&gt;"</code>
      <code>/ark-explain</code>
    </div>
  </div>

  <footer>
    Generated by ${meta || 'ark-check'} · visual twin of <code>/ark-explain</code>.
    Regenerate with <code>ark-check --report</code>; add the file to <code>.gitignore</code> rather than committing it.
  </footer>
</div></body></html>
`;
}
