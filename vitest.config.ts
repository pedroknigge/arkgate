import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Fixture trees under tests/fixtures are dogfood samples, not the product unit suite.
    exclude: ['node_modules', 'dist', 'tests/fixtures/**'],
    setupFiles: ['tests/setup/isolateCodexHome.ts'],
    // This is a CLI test suite: most tests spawn `node bin/*.mjs` via synchronous execFileSync.
    // With many parallel worker forks all blocked in a child process at once, the reporter RPC
    // can't get an ACK in the default window on a slow CI runner → "Timeout calling
    // onTaskUpdate" even though every test passes. Vitest 4 replaced `poolOptions.forks.singleFork`
    // with one worker and isolation off (the old single-fork behavior): one worker↔main RPC
    // channel, no cross-fork contention, generous timeouts. Slower, but deterministic.
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 60000,
    coverage: {
      // Full product surface under unit test (libs + domain/kernel).
      // Only process-entry shells excluded: V8 does not attribute spawn child coverage.
      include: [
        'src/**/*.{ts,js,mjs}',
        'bin/lib/**/*.mjs',
        'bin/ark-shared.mjs',
      ],
      exclude: [
        '**/node_modules/**',
        'dist/**',
        'eval/**',
        'examples/**',
        'tests/**',
        'scripts/**',
        // Generated from the canonical Kernel engine; drift and parity tests still execute it.
        'bin/lib/analysis-engine.mjs',
        // Generated from Domain pure (deepeningCoach.ts); unit tests cover the canonical source.
        'bin/lib/deepening-coach.mjs',
        // Generated from Domain arkOrder* / configExtras; unit tests cover the canonical TS.
        'bin/lib/config-extras.mjs',
        'bin/lib/ark-order-error.mjs',
        'bin/lib/ark-order-facts.mjs',
        'bin/lib/ark-order-invariants.mjs',
        'bin/lib/ark-order-sensors.mjs',
        'bin/lib/ark-order-types.mjs',
        'bin/ark-check.mjs',
        'bin/ark-mcp.mjs',
        'bin/ark-mcp-runtime.mjs',
        'bin/ark.mjs',
      ],
      thresholds: {
        // 4.1.0 field gap (start gate, monorepo walk-up, type-edge honesty, packageInstalled):
        // measured clean candidate ~79.95% statements/lines, ~82.3% branches, ~77.0% functions.
        // Recalibrate floors with modest headroom under measured (same honesty as 4.0.x).
        // 4.5.7 Cursor hard-write honesty (inventory repair-payload false → reject-only):
        // Linux CI measures ~81.97% branches; keep modest headroom under that floor.
        // 4.6.7 CLI extracts: Linux CI measures 81.36% branches (16321). Recalibrate.
        // 4.8.10 Amarilla sensors: Linux CI measures 81.17% branches (16949/20880).
        // Vitest 4.1 V8 remap is AST-aware (v8-to-istanbul removed). Same suite,
        // larger branch denominator: 73.63% branches (21235/28839). Floor tracks
        // that measurement; tests were not removed.
        statements: 79.5,
        branches: 73.2,
        // AL compact doctor + gitDirPresent: Linux CI measures 76.47% functions
        // (1775/2321) with tests green. Keep modest headroom under that floor.
        functions: 76.4,
        lines: 79.5,
        'bin/lib/write-path-detect.mjs': {
          // Vitest 4 remap: 69.56% statements (32/46), 69.04% lines (29/42).
          statements: 69,
          lines: 68.5,
          branches: 70,
          functions: 55,
        },
        'bin/lib/write-path-capabilities.mjs': {
          statements: 55,
          lines: 55,
          branches: 50,
          functions: 50,
        },
        'bin/lib/enforcement-profiles.mjs': {
          statements: 85,
          lines: 85,
          branches: 70,
          functions: 55,
        },
        'bin/lib/auto-patch.mjs': {
          statements: 95,
          lines: 95,
          branches: 95,
        },
        'bin/lib/prepare-write.mjs': {
          statements: 95,
          lines: 95,
          // Vitest 4 remap: 94.44% branches (51/54).
          branches: 94,
        },
        'bin/lib/safety-diagnostics.mjs': {
          statements: 95,
          lines: 95,
          // Vitest 4 remap: 93.65% branches (118/126).
          branches: 93,
        },
        'bin/lib/baseline-key.mjs': {
          statements: 100,
          lines: 100,
          branches: 95,
          functions: 100,
        },
        'bin/lib/graph-cycles.mjs': {
          statements: 100,
          lines: 100,
          branches: 95,
        },
      },
    },
  },
});
