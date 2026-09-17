/**
 * First-screen `ark-check --help` must name the local / pre-push fast path.
 * Encyclopedia text stays behind `--help --all` (issue #204).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkUsage } from '../../../bin/lib/first-run-help.mjs';

const repoRoot = path.resolve('.');
const arkCheck = path.join(repoRoot, 'bin/ark-check.mjs');

describe('ark-check short --help (issue #204)', () => {
  it('names --changed --base <ref> as the local / pre-push path', () => {
    const short = checkUsage();
    expect(short).toContain('Write. Check. Ship.');
    expect(short).toMatch(/When the agent writes a bad import/);
    expect(short).toContain('arkgate-check --local --base <ref>');
    expect(short).toContain('optional local / multi-worktree cheap check');
    expect(short).toContain('arkgate-check --changed --base <ref>');
    expect(short).toContain('local / pre-push: checks touched files only');
    expect(short).not.toMatch(/Team parliament/i);

    const spawned = spawnSync('node', [arkCheck, '--help'], { encoding: 'utf8' });
    expect(spawned.status).toBe(0);
    expect(spawned.stdout).toContain('arkgate-check --local --base <ref>');
    expect(spawned.stdout).toContain('arkgate-check --changed --base <ref>');
    expect(spawned.stdout).toContain('local / pre-push: checks touched files only');
    expect(spawned.stdout).not.toMatch(/Team parliament/i);
  });
});
