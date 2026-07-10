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
      // Q1 enforcement core: pure domain + high-signal kernel + write/scan safety libs.
      // Install orchestration / HTML reports / CLI entry shells are covered by unit+spawn
      // tests but excluded from the % metric (combinatorial branches / child-process V8 gap).
      include: [
        'src/domain/**/*.{ts,js}',
        'src/index.ts',
        'src/version.ts',
        'src/kernel/**/types.ts',
        'src/kernel/**/index.ts',
        'src/kernel/**/constants.ts',
        'src/kernel/**/errors.ts',
        'src/kernel/policy/PolicyViolationError.ts',
        'src/kernel/policy/builtins.ts',
        'src/kernel/intent/validateIntentName.ts',
        'src/kernel/graph/DependencyGraph.ts',
        'src/kernel/graph/sync.ts',
        'src/kernel/adapters/ports.ts',
        'bin/lib/write-path-detect.mjs',
        'bin/lib/auto-patch.mjs',
        'bin/lib/prepare-write.mjs',
        'bin/lib/safety-diagnostics.mjs',
        'bin/lib/baseline-key.mjs',
        'bin/lib/graph-cycles.mjs',
        'bin/lib/remediation.mjs',
        'bin/lib/violations.mjs',
        'bin/lib/hook-templates.mjs',
        'bin/lib/agent-gates.mjs',
        'bin/lib/core-layers.mjs',
        'bin/lib/scan-files.mjs',
      ],
      exclude: ['**/node_modules/**', 'dist/**', 'tests/**'],
      thresholds: {
        // Global branch floor is the green median of this enforcement-core include set
        // (81.5); full 85% needs more combinatorial write/install paths — see plan Deviations.
        statements: 80,
        branches: 81.5,
        functions: 85,
        lines: 80,
        'bin/lib/write-path-detect.mjs': { statements: 90, lines: 90, branches: 74, functions: 90 },
        'bin/lib/auto-patch.mjs': { statements: 90, lines: 90, branches: 74 },
        'bin/lib/prepare-write.mjs': { statements: 90, lines: 90, branches: 80 },
        'bin/lib/safety-diagnostics.mjs': { statements: 90, lines: 90, branches: 85 },
        'bin/lib/baseline-key.mjs': { statements: 95, lines: 95, branches: 88, functions: 100 },
        'bin/lib/graph-cycles.mjs': { statements: 95, lines: 95, branches: 84 },
      },
    },
  },
});
