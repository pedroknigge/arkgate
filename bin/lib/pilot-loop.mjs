/**
 * Q04 — productized pilot loop: extraction card → one pilot → re-doctor.
 *
 * Selects a single next pilot from patternBets / design smells, emits an
 * extraction-card payload, and compares residual after re-doctor on pilot paths.
 * Judgment only — never mechanical-safe; never multi-pilot batch apply.
 */
import {
  buildPatternBetsFromSmells,
  isNonProductionPilotPath,
} from './design-smells.mjs';

/** Stable product id for JSON / tests. */
export const PILOT_LOOP_ID = 'one-pilot-redoctor';

/** Smell priority when choosing the single next pilot (lower = earlier). */
const SMELL_PRIORITY = {
  'facade-sql-in-routes': 0,
  'io-under-application': 1,
  'handler-in-persistence': 2,
  'domain-logic-in-ui': 3,
  'god-module': 4,
  'soft-contract': 5,
  'mixed-pattern-cluster': 6,
};

const DEFAULT_DO_NOT = [
  'rewrite queries / touch schema / migrations',
  'weaken ark.config.json to silence the smell',
  'auto-apply as mechanical-safe or invent new mechanical-safe kinds',
  'big-bang the whole monorepo',
];

/**
 * Evidence entries that are real file paths (not layout: / layer: tokens).
 * @param {string[]} evidence
 * @returns {string[]}
 */
export function fileEvidencePaths(evidence = []) {
  return (evidence || []).filter(
    (e) =>
      typeof e === 'string' &&
      e.length > 0 &&
      !e.startsWith('layout:') &&
      !e.startsWith('layer:') &&
      !e.startsWith('rule:')
  );
}

function pilotFilesForBet(bet, preferredFiles) {
  const rawFiles = preferredFiles?.length
    ? preferredFiles
    : fileEvidencePaths(bet?.evidence);
  if (bet?.smellId !== 'god-module') return rawFiles;
  const files = rawFiles.filter((file) => !isNonProductionPilotPath(file));
  const excludedPilot =
    rawFiles.length === 0 &&
    typeof bet.pilot === 'string' &&
    isNonProductionPilotPath(bet.pilot);
  return (rawFiles.length > 0 && files.length === 0) || excludedPilot
    ? null
    : files;
}

/**
 * Score a pattern bet for "do this pilot first".
 * Prefers concrete src/ files and higher-impact smell ids.
 * @param {object} bet
 * @param {number} index
 */
function scoreBet(bet, index, files = fileEvidencePaths(bet?.evidence)) {
  const smellPri = SMELL_PRIORITY[bet?.smellId] ?? 50;
  // Higher score wins; concrete files dominate; then smell priority; stable by index.
  return files.length * 100 - smellPri * 10 - index;
}

/**
 * Build extraction-card fields from one pattern bet (P03/P05 vocabulary).
 * @param {object} bet
 * @param {string[]} [preferredFiles]
 */
export function extractionCardFromBet(bet, preferredFiles) {
  if (!bet || typeof bet !== 'object') return null;
  const files = pilotFilesForBet(bet, preferredFiles);
  if (files === null) return null;
  const evidence = files.length ? files : (bet.evidence || []).slice(0, 8);
  const pilotTarget =
    files[0] ||
    (typeof bet.pilot === 'string' ? bet.pilot : null) ||
    'src/**';

  return {
    id: PILOT_LOOP_ID,
    patternBetId: bet.id || `pattern-b:${bet.smellId || 'unknown'}`,
    smellId: bet.smellId || 'unknown',
    pilot: typeof bet.pilot === 'string' ? bet.pilot : pilotTarget,
    pilotTarget,
    evidence,
    move:
      typeof bet.fix === 'string' && bet.fix.trim()
        ? bet.fix.trim()
        : 'Apply one bounded extraction for this smell on pilot paths only',
    doNot: [...DEFAULT_DO_NOT],
    successSignal:
      typeof bet.successSignal === 'string'
        ? bet.successSignal
        : 'Smell evidence paths cleared on pilot without weakening the contract',
    killSwitch:
      typeof bet.killSwitch === 'string'
        ? bet.killSwitch
        : 'If pilot increases edge violations without design clarity, stop and re-map with /ark-explore',
    neverMechanicalSafe: true,
    class: 'judgment',
    loopStep: 'one-pilot',
    reDoctor: 'ark-check --doctor --json',
    rePlan: 'ark-check --plan --json',
    next:
      '/ark-autopilot (one cluster / one B pilot) | re-doctor after pilot',
  };
}

/**
 * Viable pattern bets, best pilot first (same rank as the historical selector).
 * Mechanical-safe claims and non-production god-module paths are dropped.
 * @param {object[] | null | undefined} patternBets
 * @param {object[] | null | undefined} [designSmells]
 */
function rankedPatternBets(patternBets, designSmells) {
  let bets = Array.isArray(patternBets) ? [...patternBets] : [];
  if (bets.length === 0 && Array.isArray(designSmells) && designSmells.length) {
    bets = buildPatternBetsFromSmells(designSmells);
  }
  const ranked = [];
  for (let i = 0; i < bets.length; i++) {
    const bet = bets[i];
    if (!bet || bet.neverMechanicalSafe === false) continue;
    if (bet.class === 'mechanical-safe') continue;
    const files = pilotFilesForBet(bet);
    if (files === null) continue;
    ranked.push({ bet, files, score: scoreBet(bet, i, files) });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * Select **one** next pilot from pattern bets (or build bets from smells).
 * @param {object[] | null | undefined} patternBets
 * @param {{ designSmells?: object[] }} [options]
 * @returns {null | ReturnType<typeof extractionCardFromBet>}
 */
export function selectNextPilot(patternBets, options = {}) {
  const ranked = rankedPatternBets(patternBets, options.designSmells);
  if (ranked.length === 0) return null;
  return extractionCardFromBet(ranked[0].bet, ranked[0].files);
}

/**
 * Human-readable extraction card block (P05 template parity).
 * @param {ReturnType<typeof extractionCardFromBet>} card
 * @returns {string | null}
 */
export function formatExtractionCard(card) {
  if (!card) return null;
  const doNot = (card.doNot || DEFAULT_DO_NOT).map((d) => `  - ${d}`).join('\n');
  return [
    '### Extraction card',
    `Pilot: ${card.pilotTarget || card.pilot}`,
    `Smell: ${card.smellId}`,
    `Move: ${card.move}`,
    'Do not:',
    doNot,
    `Success: ${card.successSignal}`,
    `Kill-switch: ${card.killSwitch}`,
    `Next: ${card.next}`,
    '(Q04 pilot loop: one pilot at a time → re-doctor; never mechanical-safe)',
  ].join('\n');
}

/**
 * One proposed pilot. The loop does not know designWeak or which sensor
 * produced the card — only this list.
 *
 * @typedef {'pattern-bet' | 'reshape'} PilotSource
 * @typedef {{
 *   source: PilotSource,
 *   target: string,
 *   move: string,
 *   moveSample: Array<string | { from: string, to: string }>,
 *   successSignal: string,
 *   killSwitch: string,
 *   bet?: object,
 *   files?: string[],
 *   doNot?: string[],
 * }} PilotCandidate
 */

/**
 * @param {object} bet
 * @param {string[]} files
 * @returns {PilotCandidate}
 */
function candidateFromBet(bet, files) {
  const target =
    (files && files[0]) ||
    (typeof bet.pilot === 'string' ? bet.pilot : null) ||
    'src/**';
  return {
    source: 'pattern-bet',
    target,
    move:
      typeof bet.fix === 'string' && bet.fix.trim()
        ? bet.fix.trim()
        : 'Apply one bounded extraction for this smell on pilot paths only',
    moveSample: files || [],
    successSignal:
      typeof bet.successSignal === 'string'
        ? bet.successSignal
        : 'Smell evidence paths cleared on pilot without weakening the contract',
    killSwitch:
      typeof bet.killSwitch === 'string'
        ? bet.killSwitch
        : 'If pilot increases edge violations without design clarity, stop and re-map with /ark-explore',
    bet,
    files,
  };
}

/**
 * @param {PilotCandidate} candidate
 * @returns {null | ReturnType<typeof extractionCardFromBet>}
 */
function extractionCardFromCandidate(candidate) {
  if (!candidate || typeof candidate.target !== 'string' || candidate.target.length === 0) {
    return null;
  }
  if (candidate.source === 'pattern-bet' && candidate.bet) {
    return extractionCardFromBet(candidate.bet, candidate.files);
  }
  const sample = Array.isArray(candidate.moveSample) ? candidate.moveSample : [];
  const evidence = sample
    .map((entry) => (typeof entry === 'string' ? entry : entry?.from))
    .filter((entry) => typeof entry === 'string' && entry.length > 0)
    .slice(0, 8);
  const reshape = candidate.source === 'reshape';
  return {
    id: PILOT_LOOP_ID,
    patternBetId: reshape ? `reshape:${candidate.target}` : `pattern-b:${candidate.target}`,
    smellId: reshape ? 'physical-cohesion' : 'unknown',
    pilot: candidate.target,
    pilotTarget: candidate.target,
    evidence,
    move: candidate.move,
    doNot:
      Array.isArray(candidate.doNot) && candidate.doNot.length
        ? [...candidate.doNot]
        : [...DEFAULT_DO_NOT],
    successSignal: candidate.successSignal,
    killSwitch: candidate.killSwitch,
    neverMechanicalSafe: true,
    class: 'judgment',
    loopStep: 'one-pilot',
    reDoctor: 'ark-check --doctor --json',
    rePlan: 'ark-check --plan --json',
    next: reshape
      ? '/ark-loop (one reshape pilot) | re-doctor after pilot'
      : '/ark-autopilot (one cluster / one B pilot) | re-doctor after pilot',
  };
}

/**
 * Normalize design-weak pattern bets and a proposed reshape pilot into one list.
 * Pattern bets stay in selector rank (best first) and are omitted unless
 * design fitness is design-weak, so that path keeps today's card. A reshape
 * card is appended when physical cohesion proposes one. Doctor builds this
 * list after advisories, so the loop never depends on call order.
 *
 * @param {{
 *   designWeak?: boolean,
 *   patternBets?: object[],
 *   designSmells?: object[],
 * }} [designFitness]
 * @param {{
 *   physicalCohesion?: {
 *     reshapePilot?: { proposed?: boolean, nextPilot?: object | null },
 *   },
 * }} [advisories]
 * @returns {PilotCandidate[]}
 */
export function collectPilotCandidates(designFitness = {}, advisories = {}) {
  /** @type {PilotCandidate[]} */
  const candidates = [];
  if (designFitness?.designWeak === true) {
    for (const ranked of rankedPatternBets(designFitness.patternBets, designFitness.designSmells)) {
      candidates.push(candidateFromBet(ranked.bet, ranked.files));
    }
  }
  const reshape = advisories?.physicalCohesion?.reshapePilot;
  const card = reshape?.proposed === true ? reshape.nextPilot : null;
  if (card && typeof card.pilotTarget === 'string' && card.pilotTarget.length > 0) {
    candidates.push({
      source: 'reshape',
      target: card.pilotTarget,
      move:
        typeof card.move === 'string' && card.move.trim()
          ? card.move.trim()
          : 'Consolidate one anchor only, then re-doctor before the next card',
      moveSample: Array.isArray(card.moveSample) ? card.moveSample : [],
      successSignal:
        typeof card.successSignal === 'string'
          ? card.successSignal
          : 're-run doctor: the cluster count drops, layer and slice id unchanged, card still proposed',
      killSwitch:
        typeof card.killSwitch === 'string'
          ? card.killSwitch
          : 'revert this move set; nothing else was touched',
      ...(Array.isArray(card.doNot) ? { doNot: card.doNot } : {}),
    });
  }
  return candidates;
}

/**
 * Doctor/plan JSON summary. Active iff `candidates.length > 0`.
 * Activates exactly one candidate (ADR 0010 one-pilot rule). The rest stay
 * queued. No designWeak parameter.
 *
 * @param {PilotCandidate[]} [candidates]
 */
export function summarizePilotLoop(candidates = []) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(
    (candidate) => candidate && typeof candidate.target === 'string' && candidate.target.length > 0
  );
  // Same forbid bits as DESIGN_WEAK_HONESTY_FLAGS (both auto-apply aliases).
  const forbid = {
    multiPilotBatchForbidden: true,
    autoApplyForbidden: true,
    autoApplyPlanBForbidden: true,
  };

  if (list.length === 0) {
    return {
      active: false,
      id: PILOT_LOOP_ID,
      reason: 'no-pilot-candidates',
      oneAtATime: true,
      neverMechanicalSafe: true,
      ...forbid,
    };
  }

  // One pilot, not the list. Later candidates wait for a re-doctor.
  const extractionCard = extractionCardFromCandidate(list[0]);
  if (!extractionCard) {
    return {
      active: false,
      id: PILOT_LOOP_ID,
      reason: 'no-pilot-candidates',
      oneAtATime: true,
      neverMechanicalSafe: true,
      ...forbid,
    };
  }

  const queued = list.length - 1;
  return {
    active: true,
    id: PILOT_LOOP_ID,
    oneAtATime: true,
    neverMechanicalSafe: true,
    ...forbid,
    source: list[0].source,
    remainingBets: list.length,
    queuedBets: queued,
    ...(queued > 0
      ? {
          queueNote: `${queued} additional pilot candidate(s) stay queued — run the single nextPilot only, then re-doctor before selecting another.`,
        }
      : {}),
    nextPilot: extractionCard,
    extractionCard,
    instruction:
      'Apply ONE pilot from nextPilot (extraction card), then re-doctor. ' +
      'Do not multi-pilot batch. patternBets never mechanical-safe. ' +
      'Never silent auto-apply of plan B. ' +
      'Success = reduced smell evidence on pilot paths; residual outside pilot may remain.',
    cardText: formatExtractionCard(extractionCard),
  };
}

/**
 * Compare design-smell residual on the pilot after a single change.
 * Drives real before/after smell arrays (from detectDesignSmells).
 *
 * @param {{
 *   beforeSmells: object[],
 *   afterSmells: object[],
 *   nextPilot: { smellId: string, evidence?: string[], pilotTarget?: string, pilot?: string },
 * }} args
 */
export function comparePilotResidual({ beforeSmells, afterSmells, nextPilot }) {
  const smellId = nextPilot?.smellId;
  const pilotFiles = fileEvidencePaths(nextPilot?.evidence || []);
  if (nextPilot?.pilotTarget && !pilotFiles.includes(nextPilot.pilotTarget)) {
    if (
      typeof nextPilot.pilotTarget === 'string' &&
      !nextPilot.pilotTarget.startsWith('layout:') &&
      !nextPilot.pilotTarget.includes('**')
    ) {
      pilotFiles.push(nextPilot.pilotTarget);
    }
  }

  const beforeSmell = (beforeSmells || []).find((s) => s.id === smellId);
  const afterSmell = (afterSmells || []).find((s) => s.id === smellId);

  const beforeAll = fileEvidencePaths(beforeSmell?.evidence);
  const afterAll = fileEvidencePaths(afterSmell?.evidence);

  // Evidence on the pilot file set (exact path match).
  const beforeOnPilot = pilotFiles.length
    ? pilotFiles.filter((p) => beforeAll.includes(p))
    : beforeAll;
  const afterOnPilot = pilotFiles.length
    ? pilotFiles.filter((p) => afterAll.includes(p))
    : afterAll;

  const pilotSmellCleared = !afterSmell;
  const reduced =
    afterOnPilot.length < beforeOnPilot.length ||
    (pilotSmellCleared && beforeOnPilot.length > 0);

  return {
    smellId,
    pilotFiles,
    beforeEvidenceCount: beforeOnPilot.length,
    afterEvidenceCount: afterOnPilot.length,
    beforeEvidence: beforeOnPilot,
    afterEvidence: afterOnPilot,
    beforeSmellPresent: Boolean(beforeSmell),
    afterSmellPresent: Boolean(afterSmell),
    pilotSmellCleared,
    reduced,
    // Global residual may remain — honest Shape work.
    beforeSmellCount: (beforeSmells || []).length,
    afterSmellCount: (afterSmells || []).length,
  };
}
