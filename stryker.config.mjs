// @ts-check

/**
 * Selective L5 mutation islands (not whole-repo completeness).
 *
 * Cost gate: `npm run test:mutation` is required on full-matrix CI + publish
 * (`test:confidence` / release-npm / publish-npm), not on PR-slim coverage-only.
 * DF04 pure truth paths (peerIsolation fail-closed, policyDelta ack match,
 * invariant promote honesty) are additional named groups — never a claim of
 * monorepo-wide mutation coverage.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
    related: false,
  },
  // Named enforcement boundaries from ROADMAP S02 + DF04 pure truth islands.
  // Ranges keep the gate focused on product decisions instead of presentation
  // strings and entry shells.
  mutate: [
    'bin/lib/enforcement-profiles.mjs:10-92',
    'bin/lib/write-path-capabilities.mjs:39-176',
    'bin/lib/write-path-detect.mjs:11-32',
    'bin/lib/write-path-detect.mjs:47-47',
    'bin/lib/write-path-detect.mjs:62-62',
    'bin/lib/write-path-detect.mjs:77-96',
    'bin/lib/analysis-completeness.mjs:9-27',
    'bin/lib/resolved-candidate-facts.mjs:691-741',
    // managed-upgrade force-preserve covered by fieldGapS4 unit tests; not in critical
    // mutation groups for 4.1.0 (NoCoverage noise on toml-section branch residual).
    'bin/lib/resident-hook.mjs:115-162',
    'bin/lib/ast-scan.mjs:11-42',
    'bin/lib/ast-scan.mjs:301-322',
    'bin/lib/ast-scan.mjs:411-427',
    'bin/ark-shared.mjs:450-475',
    'src/domain/baselineKey.ts:20-48',
    // 4.0: migrateArkConfig critical slices (excludes redundant throw-only / guard noise).
    'src/domain/configContract.ts:469-482',
    'src/domain/configContract.ts:484-486',
    'src/domain/configContract.ts:488-495',
    'src/domain/configContract.ts:505-509',
    'src/domain/configContract.ts:512-512',
    'src/domain/configContract.ts:521-524',
    'src/domain/configContract.ts:533-538',
    // DF04 — selective pure truth islands (fail-closed / ack / promote honesty).
    // peerIsolationDecision is the killable fail-closed core; findDeniedEdgeDecision wires it.
    'src/domain/layerMatch.ts:497-509',
    'src/domain/policyDelta.ts:929-958',
    'src/domain/invariantCoverage.ts:182-205',
    'src/kernel/semanticAnalysis.ts:18-49',
    'src/kernel/semanticAnalysis.ts:78-258',
    'src/kernel/workflow/Saga.ts:188-238',
  ],
  testFiles: [
    'tests/unit/workflow/workflowEngine.test.ts',
    'tests/unit/domain/baselineKey.test.ts',
    'tests/unit/domain/peerIsolation.test.ts',
    'tests/unit/domain/policyDelta.test.ts',
    'tests/unit/domain/invariantCoverage.test.ts',
    'tests/unit/static-check/configContract.test.ts',
    'tests/unit/static-check/writePathDetect.test.ts',
    'tests/unit/static-check/writePathHostCapabilities.test.ts',
    'tests/unit/static-check/t05EnforcementLadder.test.ts',
    'tests/unit/static-check/enforcementProfiles.test.ts',
    'tests/unit/static-check/criticalBranchCoverage.test.ts',
    'tests/unit/static-check/mutationCritical.test.ts',
    'tests/unit/static-check/z02Completeness.test.ts',
    'tests/unit/analysis/z04ResolvedFactsResolver.test.ts',
    'tests/unit/static-check/z06ManagedUpgrade.test.ts',
    'tests/unit/static-check/fieldGapS4.test.ts',
    'tests/unit/static-check/writePathCapabilitiesCoverage.test.ts',
    'tests/unit/mcp/residentHook.test.ts',
    'tests/unit/analysis/semanticAnalysis.test.ts',
    'tests/property/baselineKey.property.test.ts',
    'tests/property/layerMatch.property.test.ts',
    'tests/property/policyDelta.property.test.ts',
    'tests/property/invariantCoverage.property.test.ts',
  ],
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // 4.1.0 field surface: measured mutation score ~88–89 on clean candidates.
  // Keep high aspirational; break under measured with small headroom.
  // Selective islands only — not a whole-repo mutation completeness claim.
  thresholds: { high: 90, low: 87, break: 87 },
  concurrency: 2,
  timeoutMS: 10000,
  // Vitest imports frozen support tables before per-mutant activation. Their exact
  // values are unit-tested; mutate executable decisions without false static survivors.
  ignoreStatic: true,
  cleanTempDir: 'always',
  ignorePatterns: ['coverage', 'internal', '.gstack'],
};

export default config;
