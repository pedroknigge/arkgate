/**
 * AR12 — doctor/HTML "Rules under contract" counts (not a score).
 */
import { loadEffectiveArkRulesFromDisk } from './effective-contract-load.mjs';
import { evaluateInvariantCoverage } from './invariant-coverage.mjs';

export function summarizeRulesUnderContract(root, config) {
  if (!config?.arkRules || Object.keys(config.arkRules).length === 0) {
    return {
      active: false,
      structureRules: 0,
      invariants: 0,
      coveredInvariants: 0,
      uncoveredInvariants: 0,
      notAScore: true,
      note: 'No arkRules map — intra-layer ArkRules are opt-in.',
    };
  }
  try {
    const loaded = loadEffectiveArkRulesFromDisk(root, config);
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
    const coverage = evaluateInvariantCoverage({
      arkRules: loaded.arkRules,
      fileContents: {},
      testFiles: [],
      testGlobsMissing: true,
    });
    return {
      active: true,
      structureRules,
      invariants,
      coveredInvariants: coverage.coverage.filter((c) => c.covered).length,
      uncoveredInvariants: coverage.coverage.filter((c) => !c.covered).length,
      partialCoverage: coverage.partial,
      notAScore: true,
      note: 'Counts only — never a score. Green with uncovered residual must say so.',
    };
  } catch (error) {
    return {
      active: true,
      notAScore: true,
      note: error instanceof Error ? error.message : String(error),
    };
  }
}
