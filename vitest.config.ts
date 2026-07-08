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
  },
});
