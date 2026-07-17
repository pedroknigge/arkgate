/**
 * X04 (R1/R2) — physicalCohesion: advisory sensor for mirrored concept
 * explosion, plus the proposed (never applied) reshape pilot card.
 *
 * ArkGate proves edges; this sensor sees SHAPE: one domain concept exploded
 * into large file clusters across parallel directory families (field origin:
 * amarilla `projects` = 221 route files + 146 handlers + 124 repositories,
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

/** ADR 0010 D3 — corpus-calibrated, fixed. */
const CLUSTER_MIN = 40;
const MIRROR_MIN = 20;
const MIRROR_ANCHORS = 2;
const MAX_FINDINGS = 5;
const MAX_ANCHORS = 4;
const MAX_MOVE_SAMPLE = 5;

const FRAMEWORK_FILES = /^(route|page|layout|index|loading|error|template|default|not-found|middleware|actions?|handler)$/i;
const SKIP_SEGMENT = /^(\[.*\]|\(.*\)|src|app|api|lib|pages|components|utils|helpers|hooks|server|client|shared|common|__tests__)$/i;
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

/**
 * R2 — the proposed reshape pilot for the TOP finding (one at a time, Q04
 * discipline; ADR 0010 D4–D7). Proposal only: no apply path exists. Moves
 * target the smallest convention-free anchor; sampled `to` paths must fall
 * under the consolidated feature directory the agent will create via the
 * governed write path (T02 preflight validates every real move there).
 */
export function computeReshapePilot(cohesion, files, root) {
  const top = cohesion?.findings?.[0];
  if (!top) return null;
  // Recompute the FULL anchor map for the top concept: the finding's anchors
  // are display-filtered (>= MIRROR_MIN, capped), and pilot selection over
  // that trimmed list falsely reported "nothing to move" when the only
  // movable anchor sat below the display floor (cross-model review finding).
  const byAnchor = new Map();
  const relOf = (abs) => path.relative(root, abs).split(path.sep).join('/');
  for (const abs of Array.isArray(files) ? files : []) {
    const rel = relOf(abs);
    const r = classifyPhysical(rel);
    if (!r || r.concept !== top.concept) continue;
    byAnchor.set(r.anchor, (byAnchor.get(r.anchor) ?? 0) + 1);
  }
  const movable = [...byAnchor.entries()]
    .filter(([anchor]) => !CONVENTION_ANCHOR_RE.test(`${anchor}/`))
    .map(([anchor, count]) => ({ path: anchor, files: count }))
    .sort((a, b) => a.files - b.files || (a.path < b.path ? -1 : 1));
  if (movable.length === 0) {
    return {
      proposed: true,
      applied: false,
      neverMechanicalSafe: true,
      concept: top.concept,
      note: 'Every anchor for this concept is fixed by framework convention — nothing to move; consider the merge-card review instead.',
      nextPilot: null,
    };
  }
  // Smallest movable cluster worth piloting; if none reaches the floor, take
  // the largest movable anchor so the pilot still exists and stays honest.
  const pilotAnchor = movable.find((a) => a.files >= 10) ?? movable[movable.length - 1];
  const targetDir = `src/features/${top.concept}`;
  const rels = (Array.isArray(files) ? files : [])
    .map(relOf)
    .filter((rel) => {
      const r = classifyPhysical(rel);
      return r && r.concept === top.concept && r.anchor === pilotAnchor.path;
    })
    .sort();
  const moves = rels.slice(0, MAX_MOVE_SAMPLE).map((rel) => ({
    from: rel,
    to: `${targetDir}/${rel.split('/').at(-1)}`,
  }));
  return {
    proposed: true,
    applied: false,
    neverMechanicalSafe: true,
    concept: top.concept,
    nextPilot: {
      pilotTarget: `${top.concept} @ ${pilotAnchor.path} (${pilotAnchor.files} file(s))`,
      move: `Consolidate the ${top.concept} cluster from ${pilotAnchor.path} under ${targetDir}/ — one anchor only, moves proposed as an architecture change map and validated by the atomic preflight before any write.`,
      moveSample: moves,
      movesTotal: rels.length,
      successSignal: `re-run doctor: the ${top.concept} cluster count drops and the verdict stays green`,
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
