import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // This is a CLI test suite: most tests spawn `node bin/*.mjs` via synchronous execFileSync.
    // With many parallel worker forks all blocked in a child process at once, the reporter RPC
    // can't get an ACK in the default window on a slow CI runner → "Timeout calling
    // onTaskUpdate" even though every test passes. Run in a single fork (one worker↔main RPC
    // channel, no cross-fork contention) with generous timeouts. Slower, but deterministic.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    coverage: {
      // Ratchet upward only (Trust Q1 global 80/85 is further sessions). Floors stay ≤ green medians.
      // Prior floor before this goal: 46 / 73 / 70 / 46. Enforcement-critical modules have floors.
      thresholds: {
        statements: 46.5,
        branches: 73.6,
        functions: 70.5,
        lines: 46.5,
        'bin/lib/write-path-detect.mjs': {
          statements: 90,
          lines: 90,
          branches: 70,
          functions: 90,
        },
        'bin/lib/auto-patch.mjs': {
          statements: 90,
          lines: 90,
        },
        'bin/lib/prepare-write.mjs': {
          statements: 90,
          lines: 90,
        },
      },
    },
  },
});
