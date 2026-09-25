/**
 * X04 (R1/R2) — physicalCohesion: advisory sensor for mirrored concept
 * explosion, plus the proposed (never applied) reshape pilot card.
 *
 * ArkGate proves edges; this sensor sees SHAPE: one domain concept exploded
 * into large file clusters across parallel directory families (field origin:
 * the field corpus `projects` concept = 221 route files + 146 handlers + 124 repositories,
 * all invisible to every edge-based surface). Facts only — `notAScore`,
 * never a verdict/designFitness/patternBets input, never a gate.
 *
 * The signal is CONCENTRATION, not volume: React `use-*` hooks are hundreds
 * of files across hundreds of directories and healthy. Thresholds are fixed
 * constants calibrated on the field corpus (ADR 0010 D3), not tunables.
 * Concept extraction is name/path heuristic (ADR 0010 D2) — same discipline
 * as W01 layer roles: a miss costs a warning line, never a verdict.
 */
import path from 'node:path';
import { layerForRelativePath, sliceIdForPath } from '../ark-layer-match.mjs';

/** ADR 0010 D3 — corpus-calibrated, fixed. */
const CLUSTER_MIN = 40;
const MIRROR_MIN = 20;
const MIRROR_ANCHORS = 2;
const MAX_FINDINGS = 5;
const MAX_ANCHORS = 4;
const MAX_MOVE_SAMPLE = 5;

// `proxy` = Next.js 16 network-boundary rename of middleware (still framework-owned).
const FRAMEWORK_FILES = /^(route|page|layout|index|loading|error|template|default|not-found|middleware|proxy|actions?|handler)$/i;
const SKIP_SEGMENT = /^(\[.*\]|\(.*\)|src|app|apps|api|lib|libs|pages|packages|modules|components|utils|helpers|hooks|server|client|shared|common|__tests__|tests?|e2e|examples?|dist|build)$/i;
const NOISE_TOKEN = /^(use|api|get|set|app|lib|the|new)$/;
/** ADR 0010 D7 — framework-owned anchors never move. */
const CONVENTION_ANCHOR_RE = /(^|\/)(app|pages)(\/|$)/;
const EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function nameTokens(name) {
  return (String(name).match(/[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/g) ?? []).map((t) => t.toLowerCase());
}

function firstMeaningful(tokens) {
  for (const t of tokens) {
    if (t.length >= 3 && !NOISE_TOKEN.test(t)) return t;
  }
  return null;
}

/**
 * Deterministic concept + anchor for one repo-relative file (ADR 0010 D2).
 * Non-framework files: first meaningful basename token, anchored at their
 * directory. Framework files (route.ts, page.tsx, …): the TOPMOST meaningful
 * path segment is the concept; the anchor is the path above it — the subtree
 * that mirrors. Returns null when nothing meaningful is found.
 */
export function classifyPhysical(rel) {
  const norm = String(rel).split(path.sep).join('/');
  if (!EXT_RE.test(norm)) return null;
  const segs = norm.split('/');
  const base = segs.at(-1).replace(EXT_RE, '');
  if (!FRAMEWORK_FILES.test(base)) {
    const concept = firstMeaningful(nameTokens(base));
    return concept ? { concept, anchor: segs.slice(0, -1).join('/') || '.' } : null;
  }
  for (let i = 0; i < segs.length - 1; i++) {
    if (SKIP_SEGMENT.test(segs[i])) continue;
    const concept = firstMeaningful(nameTokens(segs[i]));
    if (concept) return { concept, anchor: segs.slice(0, i).join('/') || '.' };
  }
  return null;
}

/**
 * Compute the physicalCohesion advisory over the governed file list.
 * @param {string} root
 * @param {string[]} files absolute governed file paths
 */
export function computePhysicalCohesion(root, files) {
  const clusters = new Map(); // concept -> Map(anchor -> count)
  let analyzed = 0;
  for (const abs of Array.isArray(files) ? files : []) {
    const rel = path.relative(root, abs);
    if (rel.startsWith('..')) continue;
    const r = classifyPhysical(rel);
    if (!r) continue;
    analyzed += 1;
    if (!clusters.has(r.concept)) clusters.set(r.concept, new Map());
    const m = clusters.get(r.concept);
    m.set(r.anchor, (m.get(r.anchor) ?? 0) + 1);
  }

  const findings = [];
  for (const [concept, m] of clusters) {
    const anchors = [...m.entries()]
      .map(([anchor, count]) => ({
        path: anchor,
        files: count,
        fixedByConvention: CONVENTION_ANCHOR_RE.test(`${anchor}/`),
      }))
      .sort((a, b) => b.files - a.files || (a.path < b.path ? -1 : 1));
    const maxCluster = anchors[0].files;
    const bigAnchors = anchors.filter((a) => a.files >= MIRROR_MIN);
    const mirrored = bigAnchors.length >= MIRROR_ANCHORS;
    if (maxCluster < CLUSTER_MIN && !mirrored) continue;
    const total = anchors.reduce((n, a) => n + a.files, 0);
    findings.push({
      concept,
      files: total,
      maxCluster,
      mirrored,
      anchors: anchors.filter((a) => a.files >= MIRROR_MIN).slice(0, MAX_ANCHORS),
      anchorCount: anchors.length,
    });
  }
  findings.sort((a, b) => b.maxCluster - a.maxCluster || (a.concept < b.concept ? -1 : 1));
  const kept = findings.slice(0, MAX_FINDINGS);

  return {
    advisory: true,
    notAScore: true,
    analyzedFiles: analyzed,
    findingCount: findings.length,
    truncated: Math.max(0, findings.length - kept.length),
    findings: kept,
    label:
      findings.length > 0
        ? `Physical cohesion: ${findings.length} concept(s) exploded across large mirrored clusters — advisory; the gate verdict is unchanged`
        : 'Physical cohesion: no mirrored concept explosion detected',
  };
}

function governedDestinationDir(anchor, concept) {
  return !anchor || anchor === '.' ? concept : `${anchor}/${concept}`;
}

function anchorIsConsolidationSubtree(anchor, concept) {
  return String(anchor).split('/').some((part) => part === concept);
}

function declaredSliceFolders(rules) {
  const out = [];
  const seen = new Set();
  for (const rule of Array.isArray(rules) ? rules : []) {
    const folders = Array.isArray(rule?.sliceFolders) ? rule.sliceFolders : [];
    for (const folder of folders) {
      if (typeof folder !== 'string' || folder.length === 0 || seen.has(folder.toLowerCase())) continue;
      seen.add(folder.toLowerCase());
      out.push(folder);
    }
  }
  return out;
}

function destinationKeepsLayerAndSlice(fromRel, toRel, layers, sliceFolders) {
  return layerForRelativePath(fromRel, layers) === layerForRelativePath(toRel, layers)
    && sliceIdForPath(fromRel, sliceFolders) === sliceIdForPath(toRel, sliceFolders);
}

function withheldPilot(concept, note) {
  return { proposed: true, applied: false, neverMechanicalSafe: true, concept, note, nextPilot: null };
}

/**
 * R2 — proposed reshape pilot (ADR 0010 D4–D7). `to` is `concept/` under the
 * source anchor and is kept only when the generated layer and slice matchers
 * agree. Tooling does not import Kernel preflight. Withheld when every
 * candidate fails.
 */
export function computeReshapePilot(cohesion, files, root, contract) {
  const top = cohesion?.findings?.[0];
  if (!top) return null;
  const layers = contract?.layers;
  const sliceFolders = declaredSliceFolders(contract?.rules);
  // Full anchor map: the finding's anchors are display-filtered (>= MIRROR_MIN).
  const byAnchor = new Map();
  const relOf = (abs) => path.relative(root, abs).split(path.sep).join('/');
  const fileList = Array.isArray(files) ? files : [];
  for (const abs of fileList) {
    const rel = relOf(abs);
    const ranked = classifyPhysical(rel);
    if (!ranked || ranked.concept !== top.concept) continue;
    byAnchor.set(ranked.anchor, (byAnchor.get(ranked.anchor) ?? 0) + 1);
  }
  const movable = [...byAnchor.entries()]
    .filter(([anchor]) => !CONVENTION_ANCHOR_RE.test(`${anchor}/`) && !anchorIsConsolidationSubtree(anchor, top.concept))
    .map(([anchor, count]) => ({ path: anchor, files: count }))
    .sort((a, b) => a.files - b.files || (a.path < b.path ? -1 : 1));
  if (movable.length === 0) {
    return withheldPilot(top.concept, 'Every remaining anchor for this concept is fixed by framework convention or already consolidated — nothing to move; consider the merge-card review instead.');
  }
  const legalAnchors = [];
  for (const anchor of movable) {
    const targetDir = governedDestinationDir(anchor.path, top.concept);
    const legal = fileList.map(relOf).filter((rel) => {
      const ranked = classifyPhysical(rel);
      if (!ranked || ranked.concept !== top.concept || ranked.anchor !== anchor.path) return false;
      const to = `${targetDir}/${rel.split('/').at(-1)}`;
      return destinationKeepsLayerAndSlice(rel, to, layers, sliceFolders);
    }).sort().map((rel) => ({ from: rel, to: `${targetDir}/${rel.split('/').at(-1)}` }));
    if (legal.length > 0) legalAnchors.push({ ...anchor, targetDir, legal });
  }
  if (legalAnchors.length === 0) {
    return withheldPilot(top.concept, 'No governed destination keeps the layer and the slice.');
  }
  // Smallest cluster of at least 10 files; otherwise the largest movable anchor.
  const pilotAnchor = legalAnchors.find((a) => a.files >= 10) ?? legalAnchors.at(-1);
  return {
    proposed: true,
    applied: false,
    neverMechanicalSafe: true,
    concept: top.concept,
    nextPilot: {
      pilotTarget: `${top.concept} @ ${pilotAnchor.path} (${pilotAnchor.legal.length} file(s))`,
      move: `Consolidate the ${top.concept} cluster from ${pilotAnchor.path} under ${pilotAnchor.targetDir}/ — one anchor only, same layer and slice, moves proposed as an architecture change map and validated by the atomic preflight before any write.`,
      moveSample: pilotAnchor.legal.slice(0, MAX_MOVE_SAMPLE),
      movesTotal: pilotAnchor.legal.length,
      successSignal: `re-run doctor: the ${top.concept} cluster count drops, layer and slice id unchanged, card still proposed`,
      killSwitch: 'revert this move set; nothing else was touched',
      doNot: [
        'never move files under app/ or pages/ — fixed by framework convention',
        'one pilot at a time; re-doctor before the next card exists',
        'merges are judgment cards only — never mechanical, never a codemod',
        'never weaken the contract to make a reshape pass',
      ],
    },
  };
}

/**
 * Doctor human section (advisory). Silent when there is nothing to say.
 * @param {{ line: (mark: string, text: string) => void, warn: string, color: { bold: (s: string) => string, dim: (s: string) => string } }} io
 */
export function printPhysicalCohesionSection(cohesion, pilot, io) {
  if (!cohesion || cohesion.findingCount === 0) return;
  console.log('');
  console.log(io.color.bold('Physical cohesion (advisory)'));
  for (const f of cohesion.findings) {
    const anchors = f.anchors
      .map((a) => `${a.path} (${a.files}${a.fixedByConvention ? ', fixed by convention' : ''})`)
      .join(' · ');
    io.line(io.warn, `[${f.concept}] ${f.files} file(s) in ${f.anchorCount} anchor(s): ${anchors}`);
  }
  if (cohesion.truncated > 0) {
    io.line(' ', io.color.dim(`…(+${cohesion.truncated} more concept(s) in doctor JSON)`));
  }
  if (pilot?.nextPilot) {
    io.line(' ', io.color.dim(`next pilot: ${pilot.nextPilot.pilotTarget} — proposed only, run it via /ark-loop`));
  }
  io.line(' ', io.color.dim('advisory only — facts, not a score; the gate verdict and design fitness are unchanged'));
}
