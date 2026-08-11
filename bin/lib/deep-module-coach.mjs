/**
 * Deep-module coach advisory (Tooling) — hot paths + deepening candidates.
 *
 * Advisory only (`notAScore`). Never feeds valid / strict-merge / goal.met /
 * completeness green. Hot paths use a bounded git log heuristic; incomplete or
 * missing history → status `unavailable`, empty paths (never invent).
 * Deepening candidates come only from existing smells / cohesion / compass /
 * pilot evidence via Domain pure projection.
 */
import { spawnSync } from 'node:child_process';
import {
  buildDeepeningCandidates,
  ARK_DEEPENING_COACH_SCHEMA_VERSION,
  DEEPENING_CANDIDATE_CAP,
} from './deepening-coach.mjs';

export { buildDeepeningCandidates, ARK_DEEPENING_COACH_SCHEMA_VERSION, DEEPENING_CANDIDATE_CAP };

/** Recent-window commit cap for hot-path heuristic (budget). */
export const HOT_PATH_COMMIT_LIMIT = 200;
/** Max listed hot paths. */
export const HOT_PATH_LIST_CAP = 8;
/** Minimum change hits before a path is “elevated”. */
export const HOT_PATH_MIN_HITS = 3;

/**
 * Best-effort recent-churn paths from git history.
 * @param {string} root
 * @param {{ runGit?: Function, commitLimit?: number, minHits?: number, listCap?: number }} [opts]
 */
export function computeHotPathAdvisory(root, opts = {}) {
  const commitLimit = Number(opts.commitLimit) > 0 ? Number(opts.commitLimit) : HOT_PATH_COMMIT_LIMIT;
  const minHits = Number(opts.minHits) > 0 ? Number(opts.minHits) : HOT_PATH_MIN_HITS;
  const listCap = Number(opts.listCap) > 0 ? Number(opts.listCap) : HOT_PATH_LIST_CAP;
  const runGit =
    typeof opts.runGit === 'function'
      ? opts.runGit
      : (args) =>
          spawnSync('git', ['-C', root, ...args], {
            encoding: 'utf8',
            maxBuffer: 8 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
          });

  const emptyUnavailable = (reason) => ({
    available: false,
    status: 'unavailable',
    reason,
    paths: [],
    notAScore: true,
  });

  try {
    const head = runGit(['rev-parse', '--verify', 'HEAD']);
    if (!head || head.status !== 0) {
      return emptyUnavailable('git history incomplete or missing (no HEAD)');
    }

    const log = runGit([
      'log',
      '-n',
      String(commitLimit),
      '--name-only',
      '--pretty=format:',
      '--diff-filter=AMR',
    ]);
    if (!log || log.status !== 0) {
      return emptyUnavailable('git log unavailable for hot-path heuristic');
    }

    const counts = new Map();
    const text = typeof log.stdout === 'string' ? log.stdout : '';
    for (const line of text.split('\n')) {
      const raw = line.trim().replace(/\\/g, '/');
      if (!raw || raw.startsWith('.git/')) continue;
      // Prefer product source; still allow other paths if they dominate.
      counts.set(raw, (counts.get(raw) || 0) + 1);
    }

    if (counts.size === 0) {
      return {
        available: true,
        status: 'ok',
        reason: null,
        paths: [],
        notAScore: true,
        window: { commitLimit, minHits },
      };
    }

    const ranked = [...counts.entries()]
      .filter(([, n]) => n >= minHits)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, listCap)
      .map(([path, changeCount]) => ({ path, changeCount }));

    return {
      available: true,
      status: 'ok',
      reason: null,
      paths: ranked,
      notAScore: true,
      window: { commitLimit, minHits },
    };
  } catch {
    return emptyUnavailable('git history incomplete or missing');
  }
}

/**
 * Full deep-module coach advisory for doctor / report.
 * @param {string} root
 * @param {{
 *   designSmells?: object[],
 *   physicalCohesion?: object | null,
 *   improvementCompass?: object | null,
 *   pilotLoop?: object | null,
 *   runGit?: Function,
 * }} [input]
 */
export function buildDeepModuleCoachAdvisory(root, input = {}) {
  const deepening = buildDeepeningCandidates({
    designSmells: input.designSmells,
    physicalCohesion: input.physicalCohesion,
    improvementCompass: input.improvementCompass,
    pilotLoop: input.pilotLoop,
  });
  const hotPaths = computeHotPathAdvisory(root, {
    runGit: input.runGit,
  });

  return {
    schemaVersion: ARK_DEEPENING_COACH_SCHEMA_VERSION,
    notAScore: true,
    hotPaths,
    deepeningCandidates: deepening.candidates,
  };
}

/**
 * Human doctor section (never a score bar). Always one short block when coach is present.
 * @param {ReturnType<typeof buildDeepModuleCoachAdvisory>} coach
 * @param {{ line: Function, warn: string, ok: string, color: { bold: Function, dim: Function } }} io
 */
export function printDeepModuleCoachSection(coach, io) {
  if (!coach || coach.notAScore !== true) return;
  const { line, warn, ok, color } = io;
  const hot = coach.hotPaths || { status: 'unavailable', paths: [], reason: 'missing' };
  const candidates = Array.isArray(coach.deepeningCandidates) ? coach.deepeningCandidates : [];
  const paths = Array.isArray(hot.paths) ? hot.paths : [];

  console.log('');
  console.log(color.bold('Deep-module coach (advisory — not a score)'));

  if (hot.status === 'unavailable') {
    line(ok, color.dim(`Hot paths: unavailable — ${hot.reason || 'no git history'}; never invented.`));
  } else if (paths.length > 0) {
    line(warn, `Hot paths (recent churn heuristic, top ${paths.length}):`);
    for (const row of paths.slice(0, HOT_PATH_LIST_CAP)) {
      line(' ', color.dim(`${row.path} · ${row.changeCount} recent change(s)`));
    }
  } else {
    line(ok, color.dim('Hot paths: none above churn threshold (advisory only).'));
  }

  if (candidates.length === 0) {
    line(ok, color.dim('Deepening candidates: none from existing evidence.'));
  } else {
    line(warn, `Deepening candidates (${candidates.length}, from existing residual only):`);
    for (const c of candidates.slice(0, DEEPENING_CANDIDATE_CAP)) {
      line(' ', `${c.target} — ${c.friction}`);
      if (c.intent) line(' ', color.dim(`intent: ${c.intent}`));
      if (c.benefit) line(' ', color.dim(`benefit: ${c.benefit}`));
    }
  }
  line(ok, color.dim('Never changes gate verdicts. Prefer deep modules; test at the public interface.'));
}
