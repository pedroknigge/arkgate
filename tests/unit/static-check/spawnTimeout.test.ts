import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPAWN_TIMEOUT_MS as policyTimeout } from '../../../bin/lib/policy-delta-io.mjs';
import { SPAWN_TIMEOUT_MS as teamTimeout } from '../../../bin/lib/team-parliament-io.mjs';
import {
  reportGithubCiRuntime,
  SPAWN_TIMEOUT_MS as ghTimeout,
} from '../../../bin/lib/github-enforcement.mjs';
import {
  computeHotPathAdvisory,
  SPAWN_TIMEOUT_MS as coachTimeout,
} from '../../../bin/lib/deep-module-coach.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TIMED_OUT = { status: null, error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' };

describe('git/gh spawnSync timeout', () => {
  it('uses the shared 8000ms bound on git/gh helpers', () => {
    expect(policyTimeout).toBe(8000);
    expect(teamTimeout).toBe(8000);
    expect(ghTimeout).toBe(8000);
    expect(coachTimeout).toBe(8000);
    const files = [
      'bin/lib/policy-delta-io.mjs',
      'bin/lib/team-parliament-io.mjs',
      'bin/lib/github-enforcement.mjs',
      'bin/lib/deep-module-coach.mjs',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
      expect(src, rel).toMatch(/timeout:\s*SPAWN_TIMEOUT_MS/);
    }
  });

  it('treats a timed-out git/gh child as unavailable, not observed green', () => {
    const hot = computeHotPathAdvisory('/tmp/repo', {
      runGit: () => TIMED_OUT,
    });
    expect(hot.available).toBe(false);
    expect(hot.status).toBe('unavailable');
    expect(hot.paths).toEqual([]);

    const timedOutVersion = reportGithubCiRuntime({
      run: () => TIMED_OUT,
    });
    expect(timedOutVersion.runtimeObserved).toBe(false);
    expect(timedOutVersion.reason).toBe('gh-cli-unavailable');

    const timedOutList = reportGithubCiRuntime({
      run: (_bin: string, args: string[]) => {
        if (args[0] === '--version') return { status: 0, stdout: 'gh 9\n', stderr: '' };
        return TIMED_OUT;
      },
    });
    expect(timedOutList.runtimeObserved).toBe(false);
    expect(timedOutList.latestCiRun).toBeNull();
    expect(timedOutList.reason).toBe('ci-runtime-unverified');
  });
});
