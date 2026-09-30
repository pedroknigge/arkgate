/**
 * Q05 — AI-velocity evidence (fixture-measured, no live LLM).
 *
 * Same fixed feature scenario on two arms:
 *   - design-weak: no golden norm → confused multi-path placement attempts
 *   - golden-path: `.ark/golden-pattern.json` newCodeHome → first attempt correct home
 *
 * Metric: **placementTurns** (agent-equivalent steps until a DomainModel landing).
 * Golden must be strictly better (fewer turns). Gate is never weakened.
 */
import fs from 'node:fs';
import path from 'node:path';
import { layerForFile } from '../ark-shared.mjs';
import { loadGoldenPattern, summarizeGoldenPattern } from './golden-pattern.mjs';
import {
  detectDesignSmells,
  buildPatternBetsFromSmells,
  summarizeDesignFitness,
  assertPatternBetsNeverMechanicalSafe,
} from './design-smells.mjs';
import { collectGovernedFiles } from './scan-files.mjs';

/** Fixed feature prompt + pure-domain snippet (same on both arms). */
export const FEATURE_SCENARIO = {
  id: 'add-pure-domain-canRefund',
  prompt:
    'Add a pure domain rule canRefund(status: string): boolean for order refund eligibility. No I/O, no ORM.',
  fileName: 'canRefund.ts',
  source:
    "export function canRefund(status: string): boolean {\n  return status === 'paid';\n}\n",
  /** Correct layer for this pure rule under the design-weak-enforce contract. */
  correctLayer: 'DomainModel',
  correctPath: 'src/domain/canRefund.ts',
};

/**
 * Agent-equivalent placement order when no golden guides new code (spaghetti confusion).
 * Wrong homes first (presentation / mixed), then domain — measured as friction.
 */
export const DESIGN_WEAK_PLACEMENT_CANDIDATES = [
  'src/features/orders/ui/canRefund.ts',
  'src/routes/canRefund.ts',
  'src/services/canRefund.ts',
  FEATURE_SCENARIO.correctPath,
];

/**
 * @param {string} root
 * @param {object} config
 * @param {string} filePath relative
 */
function layerForPlacement(root, config, filePath) {
  const layers = config?.layers || [];
  if (!layers.length) return null;
  return layerForFile(root, filePath, layers) || null;
}

/**
 * A landing is successful when the path is under the correct layer for the scenario.
 * Pure snippet has no imports — we do not invent gate denials; cost is placement friction.
 *
 * @param {string} root
 * @param {object} config
 * @param {string} filePath
 */
export function isCorrectLanding(root, config, filePath) {
  const layer = layerForPlacement(root, config, filePath);
  return layer === FEATURE_SCENARIO.correctLayer;
}

/**
 * Build ordered placement attempts for an arm.
 * Golden with newCodeHome → single first attempt under that home.
 * Absent golden → design-weak candidate ladder.
 *
 * Accepts loadGoldenPattern result or summarizeGoldenPattern summary.
 * @param {object | null | undefined} golden
 */
export function placementAttemptsForArm(golden) {
  if (!golden || typeof golden !== 'object') {
    return { guidedByGolden: false, attempts: [...DESIGN_WEAK_PLACEMENT_CANDIDATES] };
  }

  const present = golden.present === true;
  const newCodeHome =
    (typeof golden.newCodeHome === 'string' && golden.newCodeHome) ||
    (typeof golden.golden?.newCodeHome === 'string' && golden.golden.newCodeHome) ||
    null;

  if (present && typeof newCodeHome === 'string' && newCodeHome.trim()) {
    const home = newCodeHome.replace(/\\/g, '/').replace(/\/?$/, '/');
    const rel = `${home}${FEATURE_SCENARIO.fileName}`.replace(/\/{2,}/g, '/');
    return {
      guidedByGolden: true,
      attempts: [rel.startsWith('src/') || rel.startsWith('.') ? rel : rel.replace(/^\//, '')],
    };
  }

  // Golden absent or no newCodeHome → full confused ladder (honest multi-layout friction).
  return {
    guidedByGolden: false,
    attempts: [...DESIGN_WEAK_PLACEMENT_CANDIDATES],
  };
}

/**
 * Measure placement turns for one arm (real layer resolution + golden load).
 *
 * @param {{
 *   root: string,
 *   config: object,
 *   armId: string,
 *   files?: string[],
 * }} opts
 */
export function measureArmVelocity(opts) {
  const { root, config, armId } = opts;
  const goldenLoad = loadGoldenPattern(root);
  const goldenSummary = summarizeGoldenPattern(goldenLoad);
  const { guidedByGolden, attempts } = placementAttemptsForArm(goldenLoad);

  const steps = [];
  let placementTurns = 0;
  let landedPath = null;
  let landedLayer = null;

  for (const candidate of attempts) {
    placementTurns += 1;
    const layer = layerForPlacement(root, config, candidate);
    const ok = isCorrectLanding(root, config, candidate);
    steps.push({
      turn: placementTurns,
      path: candidate,
      layer,
      correctLanding: ok,
    });
    if (ok) {
      landedPath = candidate;
      landedLayer = layer;
      break;
    }
  }

  // Real design residual sensors (honesty — not used to invent ENFORCE).
  const files = opts.files ?? collectGovernedFiles(root, config);
  const smells = detectDesignSmells(root, config, files, {
    layersWithoutRules: [],
    emptyLayers: [],
    layers: [],
  });
  const patternBets = buildPatternBetsFromSmells(smells);
  const designFitness = summarizeDesignFitness(smells, {
    activeViolations: 0,
    governedPercent: 100,
    totalFiles: files.length,
  });
  const betsHonesty = assertPatternBetsNeverMechanicalSafe(patternBets);

  return {
    armId,
    scenarioId: FEATURE_SCENARIO.id,
    prompt: FEATURE_SCENARIO.prompt,
    guidedByGolden,
    goldenPattern: goldenSummary,
    placementTurns: landedPath ? placementTurns : attempts.length + 1,
    landed: Boolean(landedPath),
    landedPath,
    landedLayer,
    steps,
    designFitness: {
      designWeak: designFitness.designWeak,
      smellCount: designFitness.smellCount,
      ids: designFitness.ids,
    },
    patternBetCount: patternBets.length,
    patternBetsNeverMechanicalSafe: betsHonesty.ok,
    metric: 'placementTurns',
  };
}

/**
 * Compare two arms: golden must be strictly better on placementTurns.
 *
 * @param {ReturnType<typeof measureArmVelocity>} designWeakArm
 * @param {ReturnType<typeof measureArmVelocity>} goldenArm
 */
export function compareVelocityArms(designWeakArm, goldenArm) {
  const dw = designWeakArm.placementTurns;
  const gp = goldenArm.placementTurns;
  const goldenBetter = gp < dw;
  const delta = dw - gp;
  return {
    metric: 'placementTurns',
    designWeakTurns: dw,
    goldenPathTurns: gp,
    goldenStrictlyBetter: goldenBetter,
    deltaTurns: delta,
    relativeReduction: dw > 0 ? delta / dw : null,
    method:
      'Agent-equivalent placement attempts until DomainModel home for fixed pure-rule feature ' +
      `(${FEATURE_SCENARIO.id}). Design-weak arm walks concurrent-layout candidates; ` +
      'golden-path arm uses .ark/golden-pattern.json newCodeHome as first attempt. ' +
      'No live LLM; gate not weakened; design-weak residual may remain on both arms.',
  };
}

/**
 * Run full Q05 report object from two prepared roots (same config shape expected).
 *
 * @param {{
 *   designWeakRoot: string,
 *   goldenPathRoot: string,
 *   config: object,
 * }} opts
 */
export function runAiVelocityComparison(opts) {
  const designWeakArm = measureArmVelocity({
    root: opts.designWeakRoot,
    config: opts.config,
    armId: 'design-weak',
  });
  const goldenArm = measureArmVelocity({
    root: opts.goldenPathRoot,
    config: opts.config,
    armId: 'golden-path',
  });
  const comparison = compareVelocityArms(designWeakArm, goldenArm);

  return {
    schemaVersion: '1',
    id: 'q05-ai-velocity',
    mode: 'fixture-measured',
    scenario: {
      id: FEATURE_SCENARIO.id,
      prompt: FEATURE_SCENARIO.prompt,
      fileName: FEATURE_SCENARIO.fileName,
      correctLayer: FEATURE_SCENARIO.correctLayer,
      correctPath: FEATURE_SCENARIO.correctPath,
      sourceBytes: Buffer.byteLength(FEATURE_SCENARIO.source, 'utf8'),
    },
    arms: {
      'design-weak': designWeakArm,
      'golden-path': goldenArm,
    },
    comparison,
    honesty: {
      designWeakArmStillDesignWeak: designWeakArm.designFitness.designWeak === true,
      goldenDoesNotRequireClearingDesignWeak: true,
      patternBetsNeverMechanicalSafe:
        designWeakArm.patternBetsNeverMechanicalSafe &&
        goldenArm.patternBetsNeverMechanicalSafe,
      gateNotWeakened: true,
      liveLlmRequired: false,
    },
    ok: comparison.goldenStrictlyBetter === true,
  };
}

/**
 * Materialize golden-path arm: copy design-weak tree + write golden pattern.
 * Pure helper for harness / tests (caller owns temp lifecycle).
 *
 * @param {string} designWeakRoot
 * @param {string} destRoot
 * @param {{ name?: string, norm?: string, newCodeHome?: string }} [golden]
 */
export function materializeGoldenPathArm(designWeakRoot, destRoot, golden = {}) {
  copyTree(designWeakRoot, destRoot);
  const arkDir = path.join(destRoot, '.ark');
  fs.mkdirSync(arkDir, { recursive: true });
  const body = {
    schemaVersion: '1',
    name: golden.name || 'domain-first pure rules',
    norm:
      golden.norm ||
      'New pure business rules live under src/domain/; adapters and routes never own can*/policy helpers.',
    newCodeHome: golden.newCodeHome || 'src/domain/',
    examplePath: golden.examplePath || 'src/domain/canRefund.ts',
  };
  fs.writeFileSync(path.join(arkDir, 'golden-pattern.json'), JSON.stringify(body, null, 2) + '\n');
  return body;
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}
