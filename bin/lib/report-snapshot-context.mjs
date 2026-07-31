import { execFileSync } from 'node:child_process';

/** Best-effort, shell-free Git/worktree evidence for report snapshots. */
export function captureGitSnapshot(root) {
  const run = (args) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  try {
    const headSha = run(['rev-parse', '--verify', 'HEAD']);
    let branch = null;
    try {
      branch = run(['symbolic-ref', '--quiet', '--short', 'HEAD']) || null;
    } catch {
      // Detached HEAD is valid release/report evidence.
    }
    let dirty = null;
    try {
      dirty = run(['status', '--porcelain=v1', '--untracked-files=normal']).length > 0;
    } catch {
      // Keep the commit identity even when worktree state is unavailable.
    }
    return { available: true, headSha, branch, dirty };
  } catch {
    return { available: false, headSha: null, branch: null, dirty: null };
  }
}
