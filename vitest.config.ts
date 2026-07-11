import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['tests/setup/isolateCodexHome.ts'],
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
        'bin/ark-check.mjs',
        'bin/ark-mcp.mjs',
        'bin/ark.mjs',
      ],
      thresholds: {
        statements: 80,
        branches: 85,
        functions: 85,
        lines: 80,
        'bin/lib/write-path-detect.mjs': {
          statements: 95,
          lines: 95,
          branches: 95,
          functions: 100,
        },
        'bin/lib/write-path-capabilities.mjs': {
          statements: 95,
          lines: 95,
          branches: 95,
          functions: 100,
        },
        'bin/lib/enforcement-profiles.mjs': {
          statements: 95,
          lines: 95,
          branches: 95,
          functions: 100,
        },
        'bin/lib/auto-patch.mjs': {
          statements: 95,
          lines: 95,
          branches: 95,
        },
        'bin/lib/prepare-write.mjs': {
          statements: 95,
          lines: 95,
          branches: 95,
        },
        'bin/lib/safety-diagnostics.mjs': {
          statements: 95,
          lines: 95,
          branches: 95,
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
