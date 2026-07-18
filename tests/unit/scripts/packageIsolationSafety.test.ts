import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withDistLock } from '../../helpers/distLock';

const root = process.cwd();

describe('Z01 package isolation cleanup', () => {
  it('preserves unrelated tarballs', () => {
    const nonce = randomUUID();
    const gateSentinel = path.join(root, `unrelated-gate-${nonce}.tgz`);
    const runtimeSentinel = path.join(root, `packages/runtime/unrelated-runtime-${nonce}.tgz`);
    fs.writeFileSync(gateSentinel, 'gate sentinel', { flag: 'wx' });
    fs.writeFileSync(runtimeSentinel, 'runtime sentinel', { flag: 'wx' });
    try {
      const result = withDistLock(() =>
        spawnSync(process.execPath, ['scripts/smoke-package-isolation.mjs'], {
          cwd: root,
          encoding: 'utf8',
        })
      );
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(fs.readFileSync(gateSentinel, 'utf8')).toBe('gate sentinel');
      expect(fs.readFileSync(runtimeSentinel, 'utf8')).toBe('runtime sentinel');
    } finally {
      fs.rmSync(gateSentinel, { force: true });
      fs.rmSync(runtimeSentinel, { force: true });
    }
  }, 120_000);
});
