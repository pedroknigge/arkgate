/**
 * Q04 — productized pilot loop: extraction card → one pilot → re-doctor.
 *
 * Selects a single next pilot from patternBets / design smells, emits an
 * extraction-card payload, and compares residual after re-doctor on pilot paths.
 * Judgment only — never mechanical-safe; never multi-pilot batch apply.
 */
import { buildPatternBetsFromSmells } from './design-smells.mjs';

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

/**
 * Score a pattern bet for "do this pilot first".
 * Prefers concrete src/ files and higher-impact smell ids.
 * @param {object} bet
 * @param {number} index
 */
function scoreBet(bet, index) {
  const files = fileEvidencePaths(bet?.evidence);
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
  const files = preferredFiles?.length
    ? preferredFiles
    : fileEvidencePaths(bet.evidence);
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
      '/ark-fix (one cluster) | /ark-autopilot (user ok on B) | re-doctor after pilot',
  };
}

/**
 * Select **one** next pilot from pattern bets (or build bets from smells).
 * @param {object[] | null | undefined} patternBets
 * @param {{ designSmells?: object[] }} [options]
 * @returns {null | ReturnType<typeof extractionCardFromBet>}
 */
export function selectNextPilot(patternBets, options = {}) {
  let bets = Array.isArray(patternBets) ? [...patternBets] : [];
  if (bets.length === 0 && Array.isArray(options.designSmells) && options.designSmells.length) {
    bets = buildPatternBetsFromSmells(options.designSmells);
  }
  if (bets.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < bets.length; i++) {
    const bet = bets[i];
    if (!bet || bet.neverMechanicalSafe === false) continue;
    // Skip anything that claims mechanical-safe (honesty).
    if (bet.class === 'mechanical-safe') continue;
    const files = fileEvidencePaths(bet.evidence);
    const sc = scoreBet(bet, i);
    if (sc > bestScore) {
      bestScore = sc;
      best = { bet, files };
    }
  }
  if (!best) return null;
  return extractionCardFromBet(best.bet, best.files);
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
 * Doctor/plan JSON summary of the active pilot loop step.
 * @param {{
 *   designWeak?: boolean,
 *   patternBets?: object[],
 *   designSmells?: object[],
 * }} opts
 */
export function summarizePilotLoop(opts = {}) {
  const designWeak = opts.designWeak === true;
  if (!designWeak) {
    return {
      active: false,
      id: PILOT_LOOP_ID,
      reason: 'not-design-weak',
      oneAtATime: true,
      neverMechanicalSafe: true,
    };
  }

  const nextPilot = selectNextPilot(opts.patternBets, {
    designSmells: opts.designSmells,
  });
  if (!nextPilot) {
    return {
      active: false,
      id: PILOT_LOOP_ID,
      reason: 'no-pattern-bets',
      oneAtATime: true,
      neverMechanicalSafe: true,
    };
  }

  const remaining = Array.isArray(opts.patternBets) ? opts.patternBets.length : 0;

  return {
    active: true,
    id: PILOT_LOOP_ID,
    oneAtATime: true,
    neverMechanicalSafe: true,
    remainingBets: remaining,
    nextPilot,
    instruction:
      'Apply ONE pilot from nextPilot (extraction card), then re-doctor. ' +
      'Do not multi-pilot batch. patternBets never mechanical-safe. ' +
      'Success = reduced smell evidence on pilot paths; residual outside pilot may remain.',
    cardText: formatExtractionCard(nextPilot),
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
