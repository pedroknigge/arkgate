/**
 * Y01 — explicit verdict memory for X04 reshape pilots.
 *
 * Decisions bind to a concept plus its complete, sorted anchor set. Counts,
 * move samples, and change-map hashes are deliberately excluded: evidence may
 * drift without overturning an adopter's verdict, while a changed physical
 * layout makes the old record stale. Advisory only; mirror facts stay intact.
 */
import fs from 'node:fs';
import path from 'node:path';
import { classifyPhysical, computeReshapePilot } from './physical-cohesion.mjs';

export const RESHAPE_DECISIONS_PATH = '.ark/reshape-decisions.json';

const MAX_DECISION_BYTES = 64 * 1024;
const MAX_DECISIONS = 200;
const MAX_LIFECYCLE_ITEMS = 12;
const MAX_ANCHOR_EVIDENCE = 20;
const VERDICTS = new Set(['accepted', 'deferred', 'rejected']);

function normalizeAnchor(raw) {
  const portable = String(raw).trim().replace(/\\/g, '/');
  if (portable === '.') return '.';
  if (!portable || portable.startsWith('/') || /^[A-Za-z]:\//.test(portable) || portable.includes('\0')) {
    return null;
  }
  const segments = portable.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

function targetKey(concept, anchors) {
  return JSON.stringify([concept, anchors]);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function lifecycleStatus(decision, today) {
  const reviewBy = decision.reviewBy;
  if (reviewBy === undefined) return 'undated';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewBy)) return 'malformed';
  const date = new Date(`${reviewBy}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== reviewBy) {
    return 'malformed';
  }
  return typeof today === 'string' && reviewBy < today ? 'expired' : 'current';
}

/** Bounded, fail-loud loader. A broken file never suppresses a pilot. */
export function loadReshapeDecisions(root) {
  const relPath = RESHAPE_DECISIONS_PATH;
  const abs = path.join(root, relPath);
  let stats;
  try {
    stats = fs.statSync(abs);
  } catch {
    return { path: relPath, exists: false, decisions: [] };
  }
  const invalid = (error) => ({ path: relPath, exists: true, invalid: true, error, decisions: [] });
  if (!stats.isFile()) return invalid('not a regular file');
  if (stats.size > MAX_DECISION_BYTES) {
    return invalid(`larger than ${MAX_DECISION_BYTES} bytes`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'unreadable JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return invalid('expected an object with decisions[]');
  }
  const unknownTop = Object.keys(parsed).filter((key) => !['schemaVersion', 'decisions'].includes(key));
  if (unknownTop.length > 0) return invalid(`unknown field: ${unknownTop[0]}`);
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== '1') {
    return invalid('schemaVersion must be "1" when present');
  }
  if (!Array.isArray(parsed.decisions)) return invalid('expected { decisions: [...] }');
  if (parsed.decisions.length > MAX_DECISIONS) {
    return invalid(`more than ${MAX_DECISIONS} entries`);
  }

  const decisions = [];
  const seen = new Set();
  for (const entry of parsed.decisions) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return invalid('every decision must be an object');
    }
    const unknown = Object.keys(entry).filter((key) =>
      !['concept', 'anchors', 'verdict', 'reason', 'reviewBy'].includes(key)
    );
    if (unknown.length > 0) return invalid(`decision has unknown field: ${unknown[0]}`);
    const concept = typeof entry.concept === 'string' ? entry.concept.trim() : '';
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    if (!concept || !reason || !VERDICTS.has(entry.verdict)) {
      return invalid('every decision needs concept, verdict (accepted/deferred/rejected), and reason');
    }
    if (entry.reviewBy !== undefined && typeof entry.reviewBy !== 'string') {
      return invalid('reviewBy must be a string when present');
    }
    if (!Array.isArray(entry.anchors) || entry.anchors.length === 0) {
      return invalid('every decision needs a non-empty anchors array');
    }
    if (entry.anchors.some((anchor) => typeof anchor !== 'string')) {
      return invalid('every decision anchor must be a string');
    }
    const anchors = entry.anchors.map(normalizeAnchor);
    if (anchors.some((anchor) => anchor === null)) {
      return invalid('anchors must be canonical project-relative paths');
    }
    anchors.sort();
    if (new Set(anchors).size !== anchors.length) return invalid('decision anchors must be unique');
    const key = targetKey(concept, anchors);
    if (seen.has(key)) return invalid('duplicate decision target');
    seen.add(key);
    decisions.push({
      concept,
      anchors,
      verdict: entry.verdict,
      reason,
      ...(entry.reviewBy !== undefined ? { reviewBy: entry.reviewBy } : {}),
    });
  }
  decisions.sort(
    (left, right) =>
      compareText(left.concept, right.concept) ||
      compareText(targetKey(left.concept, left.anchors), targetKey(right.concept, right.anchors))
  );
  return { path: relPath, exists: true, decisions };
}

function anchorsByConcept(root, files) {
  const result = new Map();
  const resolvedRoot = path.resolve(root);
  for (const file of Array.isArray(files) ? files : []) {
    const abs = path.isAbsolute(file) ? path.resolve(file) : path.resolve(root, file);
    const rel = path.relative(resolvedRoot, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    const classified = classifyPhysical(rel);
    if (!classified) continue;
    if (!result.has(classified.concept)) result.set(classified.concept, new Set());
    result.get(classified.concept).add(classified.anchor);
  }
  return new Map([...result].map(([concept, anchors]) => [concept, [...anchors].sort()]));
}

/** Pure lifecycle/staleness resolution; callers inject `today` in tests. */
export function analyzeReshapeDecisions(
  root,
  files,
  state = { path: RESHAPE_DECISIONS_PATH, exists: false, decisions: [] },
  today = null
) {
  const anchorSets = anchorsByConcept(root, files);
  const current = [];
  const expired = [];
  const malformed = [];
  const stale = [];
  for (const decision of state.invalid ? [] : state.decisions ?? []) {
    const currentAnchors = anchorSets.get(decision.concept) ?? [];
    if (!sameStrings(decision.anchors, currentAnchors)) {
      stale.push({
        ...decision,
        currentAnchorCount: currentAnchors.length,
        currentAnchors: currentAnchors.slice(0, MAX_ANCHOR_EVIDENCE),
      });
      continue;
    }
    const status = lifecycleStatus(decision, today);
    if (status === 'expired') expired.push(decision);
    else if (status === 'malformed') malformed.push(decision);
    else {
      current.push({
        ...decision,
        lifecycle: status,
        suppressesPilot: decision.verdict === 'deferred' || decision.verdict === 'rejected',
      });
    }
  }
  const summary = {
    advisory: true,
    explicitOnly: true,
    neverChangesFacts: true,
    decisionFile: {
      path: state.path ?? RESHAPE_DECISIONS_PATH,
      present: state.exists === true,
      invalid: state.invalid === true,
      ...(state.invalid ? { error: state.error ?? 'invalid' } : {}),
    },
    currentCount: current.length,
    current: current.slice(0, MAX_LIFECYCLE_ITEMS),
    lifecycle: {
      undated: current.filter((decision) => decision.lifecycle === 'undated').length,
      malformedCount: malformed.length,
      malformed: malformed.slice(0, MAX_LIFECYCLE_ITEMS),
      expiredCount: expired.length,
      expired: expired.slice(0, MAX_LIFECYCLE_ITEMS),
      staleCount: stale.length,
      stale: stale.slice(0, MAX_LIFECYCLE_ITEMS),
    },
  };
  return { summary, current, anchorSets };
}

/** Filesystem/clock wrapper for doctor and report callers. */
export function computeReshapeDecisionMemory(root, files, today = new Date().toISOString().slice(0, 10)) {
  return analyzeReshapeDecisions(root, files, loadReshapeDecisions(root), today);
}

/** Select one actionable finding while respecting explicit current verdicts. */
export function computeDecisionAwareReshapePilot(cohesion, files, root, analysis) {
  const findings = Array.isArray(cohesion?.findings) ? cohesion.findings : [];
  if (findings.length === 0) return null;
  const currentByTarget = new Map(
    analysis.current.map((decision) => [targetKey(decision.concept, decision.anchors), decision])
  );
  for (const finding of findings) {
    const anchors = analysis.anchorSets.get(finding.concept) ?? [];
    const decision = currentByTarget.get(targetKey(finding.concept, anchors));
    if (decision?.suppressesPilot) continue;
    const pilot = computeReshapePilot({ ...cohesion, findings: [finding] }, files, root);
    if (!pilot?.nextPilot) return pilot;
    return {
      ...pilot,
      ...(decision ? { decision } : {}),
      nextPilot: {
        ...pilot.nextPilot,
        decisionTarget: { concept: finding.concept, anchors },
        decisionFile: RESHAPE_DECISIONS_PATH,
      },
    };
  }
  return {
    proposed: false,
    applied: false,
    neverMechanicalSafe: true,
    nextPilot: null,
    suppressedByDecision: true,
    note: 'Every displayed reshape target has an explicit current rejected/deferred decision; mirror facts remain visible.',
  };
}

/** Human doctor section; lifecycle stays visible even after the sensor quiets. */
export function printReshapeDecisionsSection(memory, io) {
  const lifecycle = memory?.lifecycle;
  const hasContent =
    memory?.decisionFile?.invalid ||
    memory?.currentCount > 0 ||
    lifecycle?.expiredCount > 0 ||
    lifecycle?.malformedCount > 0 ||
    lifecycle?.staleCount > 0;
  if (!hasContent) return;
  console.log('');
  console.log(io.color.bold('Reshape decisions (advisory)'));
  if (memory.decisionFile.invalid) {
    io.line(io.warn, `${memory.decisionFile.path} is present but invalid — decisions are ignored.`);
  }
  for (const decision of memory.current.slice(0, 5)) {
    const review = decision.reviewBy ? ` · review-by ${decision.reviewBy}` : '';
    io.line(' ', `[${decision.concept}] ${decision.verdict}${review} — ${decision.reason}`);
  }
  if (memory.currentCount > memory.current.slice(0, 5).length) {
    io.line(' ', io.color.dim(`…(+${memory.currentCount - 5} more current decision(s))`));
  }
  if (lifecycle.expiredCount > 0) {
    io.line(io.warn, `${lifecycle.expiredCount} reshape decision(s) expired — pilot pressure is active again.`);
  }
  if (lifecycle.malformedCount > 0) {
    io.line(io.warn, `${lifecycle.malformedCount} reshape decision(s) have malformed review-by dates — ignored.`);
  }
  if (lifecycle.staleCount > 0) {
    io.line(io.warn, `${lifecycle.staleCount} reshape decision(s) have a changed anchor set — stale; update or delete them.`);
  }
  if (lifecycle.undated > 0) {
    io.line(' ', io.color.dim(`${lifecycle.undated} current decision(s) have no review-by date.`));
  }
  io.line(' ', io.color.dim('explicit verdicts affect pilot pressure only; physical facts and the gate verdict are unchanged'));
}
