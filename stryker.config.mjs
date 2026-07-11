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
    'bin/lib/write-path-capabilities.mjs:39-176',
    'bin/lib/write-path-detect.mjs:11-32',
    'bin/lib/write-path-detect.mjs:47-47',
    'bin/lib/write-path-detect.mjs:62-62',
    'bin/lib/write-path-detect.mjs:77-96',
    'bin/lib/ast-scan.mjs:11-42',
    'bin/lib/ast-scan.mjs:301-322',
    'bin/lib/ast-scan.mjs:411-427',
    'bin/ark-shared.mjs:415-440',
    'src/domain/baselineKey.ts:20-48',
    'src/kernel/workflow/Saga.ts:188-238',
  ],
  testFiles: [
    'tests/unit/workflow/workflowEngine.test.ts',
    'tests/unit/domain/baselineKey.test.ts',
    'tests/unit/static-check/writePathDetect.test.ts',
    'tests/unit/static-check/writePathHostCapabilities.test.ts',
    'tests/unit/static-check/criticalBranchCoverage.test.ts',
    'tests/unit/static-check/mutationCritical.test.ts',
  ],
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 90, low: 90, break: 90 },
  concurrency: 2,
  timeoutMS: 10000,
  cleanTempDir: 'always',
  ignorePatterns: ['coverage', 'internal', '.gstack'],
};

export default config;
