/**
 * Gallery starter structrail.config.json must match preset factories (no silent drift).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '../../..');
const SCRIPT = path.join(REPO, 'scripts/check-gallery-starters.mjs');

describe('gallery starter config sync', () => {
  it('check-gallery-starters exits 0 against factories', () => {
    const r = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      cwd: REPO,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});
