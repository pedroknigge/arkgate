/**
 * AR12 — doctor/HTML "Rules under contract" counts (not a score).
 * Uses real file I/O for coverage evidence (never empty-fileContents stub).
 */
import { loadEffectiveArkRulesFromDisk } from './effective-contract-load.mjs';
import { evaluateInvariantCoverage } from './invariant-coverage.mjs';
import { loadInvariantCoverageInputs } from './invariant-coverage-io.mjs';

/**
 * @param {string} root
 * @param {Record<string, unknown>} config
 * @param {{ files?: Array<{ path: string }> }} [facts] optional facts for path set
 */
export function summarizeRulesUnderContract(root, config, facts) {
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
    const coverageInputs =
      invariants > 0
        ? loadInvariantCoverageInputs(root, facts ?? { files: [] })
        : { fileContents: {}, testFiles: [], testGlobsMissing: false };
    const coverage = evaluateInvariantCoverage({
      arkRules: loaded.arkRules,
      fileContents: coverageInputs.fileContents,
      testFiles: coverageInputs.testFiles,
      testGlobsMissing: coverageInputs.testGlobsMissing,
    });
    return {
      active: true,
      structureRules,
      invariants,
      coveredInvariants: coverage.coverage.filter((c) => c.covered).length,
      uncoveredInvariants: coverage.coverage.filter((c) => !c.covered).length,
      partialCoverage: coverage.partial,
      testFilesScanned: coverageInputs.testFiles.length,
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
