// @ts-check

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
    related: false,
  },
  // Named enforcement boundaries from ROADMAP S02. Ranges keep the initial gate
  // focused on product decisions instead of presentation-only strings and entry shells.
  mutate: [
    'bin/lib/enforcement-profiles.mjs:10-92',
    'bin/lib/write-path-capabilities.mjs:39-176',
    'bin/lib/write-path-detect.mjs:11-32',
    'bin/lib/write-path-detect.mjs:47-47',
    'bin/lib/write-path-detect.mjs:62-62',
    'bin/lib/write-path-detect.mjs:77-96',
    'bin/lib/analysis-completeness.mjs:9-27',
    'bin/lib/resolved-candidate-facts.mjs:684-728',
    'bin/lib/managed-upgrade.mjs:233-255',
    'bin/lib/resident-hook.mjs:115-162',
    'bin/lib/ast-scan.mjs:11-42',
    'bin/lib/ast-scan.mjs:301-322',
    'bin/lib/ast-scan.mjs:411-427',
    'bin/ark-shared.mjs:450-475',
    'src/domain/baselineKey.ts:20-48',
    // 4.0: migrateArkConfig critical slices (excludes redundant throw-only / guard noise).
    'src/domain/configContract.ts:393-406',
    'src/domain/configContract.ts:408-410',
    'src/domain/configContract.ts:412-419',
    'src/domain/configContract.ts:429-433',
    'src/domain/configContract.ts:436-436',
    'src/domain/configContract.ts:445-448',
    'src/domain/configContract.ts:457-466',
    'src/kernel/semanticAnalysis.ts:18-49',
    'src/kernel/semanticAnalysis.ts:78-258',
    'src/kernel/workflow/Saga.ts:188-238',
  ],
  testFiles: [
    'tests/unit/workflow/workflowEngine.test.ts',
    'tests/unit/domain/baselineKey.test.ts',
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
    'tests/unit/mcp/residentHook.test.ts',
    'tests/unit/analysis/semanticAnalysis.test.ts',
    'tests/property/baselineKey.property.test.ts',
  ],
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 90, low: 90, break: 90 },
  concurrency: 2,
  timeoutMS: 10000,
  // Vitest imports frozen support tables before per-mutant activation. Their exact
  // values are unit-tested; mutate executable decisions without false static survivors.
  ignoreStatic: true,
  cleanTempDir: 'always',
  ignorePatterns: ['coverage', 'internal', '.gstack'],
};

export default config;
