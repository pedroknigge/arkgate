import { createHash } from 'node:crypto';
import { verifyLedger } from './contract.mjs';

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
}

function assertTau(tauMs) {
  if (!Number.isFinite(tauMs) || tauMs <= 0) throw new TypeError('tauMs must be positive');
}

function restrictedTime(outcome, tauMs) {
  const value = outcome.restrictedTimeMs;
  if (!Number.isFinite(value) || value <= 0 || value > tauMs) {
    throw new TypeError('outcome.restrictedTimeMs must be within the preregistered cap');
  }
  return value;
}

function mean(values) {
  if (values.length === 0) throw new TypeError('cannot summarize an empty sample');
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function quantile(sortedValues, probability) {
  if (sortedValues.length === 0) throw new TypeError('cannot compute a quantile of an empty sample');
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function percentileLabel(probability) {
  const percent = probability * 100;
  return `p${Number.isInteger(percent) ? percent : String(percent).replace('.', '_')}`;
}

export function restrictedMeanTime(outcomes, tauMs) {
  assertTau(tauMs);
  if (!Array.isArray(outcomes) || outcomes.length === 0) throw new TypeError('outcomes must be a non-empty array');
  return mean(outcomes.map((outcome) => restrictedTime(outcome, tauMs)));
}

export function firstValidPercentile(outcomes, probability) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) throw new TypeError('outcomes must be a non-empty array');
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    throw new TypeError('probability must be between zero and one');
  }
  const requiredCompletions = Math.ceil(probability * outcomes.length);
  const firstValid = outcomes
    .filter((outcome) => outcome.outcome === 'first_valid')
    .map((outcome) => outcome.firstValidMs)
    .sort((left, right) => left - right);
  if (firstValid.length < requiredCompletions) {
    return Object.freeze({ status: 'not_reached', valueMs: null, requiredCompletions, completions: firstValid.length });
  }
  return Object.freeze({
    status: 'reached',
    valueMs: firstValid[requiredCompletions - 1],
    requiredCompletions,
    completions: firstValid.length,
  });
}

function seededRandom(seed) {
  if (typeof seed !== 'string' || seed.length === 0) throw new TypeError('bootstrap seed must be a non-empty string');
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(values, random) {
  return values[Math.floor(random() * values.length)];
}

function hierarchy(pairs) {
  const repositories = new Map();
  for (const pair of pairs) {
    const tasks = repositories.get(pair.repositoryId) ?? new Map();
    const replicates = tasks.get(pair.taskId) ?? [];
    replicates.push(pair);
    tasks.set(pair.taskId, replicates);
    repositories.set(pair.repositoryId, tasks);
  }
  return repositories;
}

function resampleHierarchy(repositories, random) {
  const repositoryIds = [...repositories.keys()];
  const sampledPairs = [];
  for (let repositoryIndex = 0; repositoryIndex < repositoryIds.length; repositoryIndex += 1) {
    const repositoryId = sample(repositoryIds, random);
    const tasks = repositories.get(repositoryId);
    const taskIds = [...tasks.keys()];
    for (let taskIndex = 0; taskIndex < taskIds.length; taskIndex += 1) {
      const taskId = sample(taskIds, random);
      const replicates = tasks.get(taskId);
      for (let replicateIndex = 0; replicateIndex < replicates.length; replicateIndex += 1) {
        sampledPairs.push(sample(replicates, random));
      }
    }
  }
  return sampledPairs;
}

function pairedRatio(pairs, tauMs) {
  const control = pairs.map((pair) => restrictedTime(pair.control, tauMs));
  const treatment = pairs.map((pair) => restrictedTime(pair.treatment, tauMs));
  return mean(treatment) / mean(control);
}

export function hierarchicalPairedBootstrap({ pairs, tauMs, replicates, seed, confidenceLevel = 0.95 }) {
  assertTau(tauMs);
  assertPositiveInteger(replicates, 'bootstrap replicates');
  if (!Array.isArray(pairs) || pairs.length === 0) throw new TypeError('pairs must be a non-empty array');
  if (!Number.isFinite(confidenceLevel) || confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new TypeError('confidenceLevel must be between zero and one');
  }
  const repositories = hierarchy(pairs);
  if (repositories.size === 0) throw new TypeError('pairs contain no repositories');
  const random = seededRandom(seed);
  const ratios = new Array(replicates);
  for (let index = 0; index < replicates; index += 1) {
    ratios[index] = pairedRatio(resampleHierarchy(repositories, random), tauMs);
  }
  ratios.sort((left, right) => left - right);
  const tail = (1 - confidenceLevel) / 2;
  return Object.freeze({
    method: 'hierarchical-paired-bootstrap:repository->task->replicate',
    replicates,
    seed,
    confidenceLevel,
    lower: quantile(ratios, tail),
    upper: quantile(ratios, 1 - tail),
  });
}

function buildPairs(manifest, terminals) {
  const pairs = new Map();
  for (const run of manifest.runs) {
    const pair = pairs.get(run.pairId) ?? {
      pairId: run.pairId,
      repositoryId: run.repositoryId,
      taskId: run.taskId,
      replicate: run.replicate,
    };
    pair[run.arm] = terminals[run.cellId];
    pairs.set(run.pairId, pair);
  }
  return [...pairs.values()];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function summarizeUsage(outcomes) {
  const reported = outcomes.filter((outcome) => outcome.usage !== null).map((outcome) => outcome.usage);
  return {
    reportedCells: reported.length,
    unreportedCells: outcomes.length - reported.length,
    inputTokens: sum(reported.map((usage) => usage.inputTokens)),
    cacheReadInputTokens: sum(reported.map((usage) => usage.cacheReadInputTokens)),
    outputTokens: sum(reported.map((usage) => usage.outputTokens)),
    totalTokens: sum(reported.map((usage) => usage.totalTokens)),
    costUsd: reported.length === outcomes.length && reported.every((usage) => usage.costUsd !== null)
      ? sum(reported.map((usage) => usage.costUsd))
      : null,
    costIsPartial: reported.some((usage) => usage.costIsPartial) || reported.length !== outcomes.length,
    usageIsIncomplete: reported.some((usage) => usage.usageIsIncomplete) || reported.length !== outcomes.length,
  };
}

function summarizeArm(outcomes, design) {
  const completed = outcomes.filter((outcome) => outcome.mergeGateCompleted).length;
  return {
    cells: outcomes.length,
    completed,
    censored: outcomes.length - completed,
    completionRate: completed / outcomes.length,
    rmstMs: restrictedMeanTime(outcomes, design.tauMs),
    firstValidPercentiles: Object.fromEntries(
      design.percentiles.map((probability) => [percentileLabel(probability), firstValidPercentile(outcomes, probability)])
    ),
    turns: {
      total: sum(outcomes.map((outcome) => outcome.turns)),
      mean: mean(outcomes.map((outcome) => outcome.turns)),
    },
    usage: summarizeUsage(outcomes),
    escapes: sum(outcomes.map((outcome) => outcome.escapes)),
    falseBlocks: sum(outcomes.map((outcome) => outcome.falseBlocks)),
    bypasses: sum(outcomes.map((outcome) => outcome.bypasses)),
    manualDecisions: sum(outcomes.map((outcome) => outcome.manualDecisions.length)),
    finalCiState: {
      green: outcomes.filter((outcome) => outcome.finalCiState === 'green').length,
      red: outcomes.filter((outcome) => outcome.finalCiState === 'red').length,
      notRun: outcomes.filter((outcome) => outcome.finalCiState === 'not_run').length,
    },
  };
}

export function analyzeExperiment({ manifest, ledgerEntries, bootstrapReplicates = undefined, bootstrapSeed = undefined }) {
  const evidence = verifyLedger({ manifest, entries: ledgerEntries });
  const design = evidence.manifest.design;
  const replicates = bootstrapReplicates ?? design.bootstrapReplicates;
  const seed = bootstrapSeed ?? design.bootstrapSeed;
  assertPositiveInteger(replicates, 'bootstrapReplicates');
  if (typeof seed !== 'string' || seed.length === 0) throw new TypeError('bootstrapSeed must be a non-empty string');

  const pairs = buildPairs(evidence.manifest, evidence.terminals);
  const byArm = {
    control: evidence.manifest.runs.filter((run) => run.arm === 'control').map((run) => evidence.terminals[run.cellId]),
    treatment: evidence.manifest.runs.filter((run) => run.arm === 'treatment').map((run) => evidence.terminals[run.cellId]),
  };
  const arms = {
    control: summarizeArm(byArm.control, design),
    treatment: summarizeArm(byArm.treatment, design),
  };
  const ratio = arms.treatment.rmstMs / arms.control.rmstMs;
  const interval = hierarchicalPairedBootstrap({
    pairs,
    tauMs: design.tauMs,
    replicates,
    seed,
    confidenceLevel: design.confidenceLevel,
  });
  const completionDelta = arms.treatment.completionRate - arms.control.completionRate;
  const primaryPass = ratio <= design.primaryMaxRatio && interval.upper < design.primaryUpperBoundExclusive;
  const completionPass = completionDelta >= -design.maxCompletionRegression;

  return Object.freeze({
    schemaVersion: 1,
    experimentId: evidence.manifest.experimentId,
    manifestSha256: evidence.manifestSha256,
    ledgerTerminalHash: evidence.terminalHash,
    denominator: {
      repositories: evidence.manifest.repositories.length,
      tasks: evidence.manifest.tasks.length,
      pairs: pairs.length,
      cells: evidence.manifest.runs.length,
    },
    cells: evidence.manifest.runs.map((run) => ({
      cellId: run.cellId,
      pairId: run.pairId,
      repositoryId: run.repositoryId,
      taskId: run.taskId,
      replicate: run.replicate,
      arm: run.arm,
      terminal: evidence.terminals[run.cellId],
    })),
    arms,
    primary: {
      estimand: 'restricted-mean-time-to-first-common-green',
      censoring: 'unsuccessful cells retained at tau',
      tauMs: design.tauMs,
      controlRmstMs: arms.control.rmstMs,
      treatmentRmstMs: arms.treatment.rmstMs,
      treatmentToControlRatio: ratio,
      maximumRatio: design.primaryMaxRatio,
      confidenceInterval: interval,
      upperBoundExclusive: design.primaryUpperBoundExclusive,
      passed: primaryPass,
    },
    completion: {
      controlRate: arms.control.completionRate,
      treatmentRate: arms.treatment.completionRate,
      delta: completionDelta,
      minimumDelta: -design.maxCompletionRegression,
      passed: completionPass,
    },
    mutation: {
      reportSha256: evidence.mutation.reportSha256,
      groups: evidence.mutation.groups,
      zeroNoCoverage: true,
    },
    acceptance: {
      primary: primaryPass,
      completion: completionPass,
      passed: primaryPass && completionPass,
    },
  });
}
