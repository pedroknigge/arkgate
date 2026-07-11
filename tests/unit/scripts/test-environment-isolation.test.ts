import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('test environment isolation', () => {
  it('redirects Codex writes away from the developer home', () => {
    const isolatedHome = process.env.ARK_VITEST_CODEX_HOME;
    expect(isolatedHome).toBeTruthy();
    expect(process.env.CODEX_HOME).toBe(isolatedHome);
    expect(path.resolve(isolatedHome!)).not.toBe(path.resolve(os.homedir(), '.codex'));
  });
});
