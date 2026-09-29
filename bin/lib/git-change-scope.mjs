/**
 * Git plumbing for diff-scoped checks (`--changed`, `--local`, `--against`, `--persona`).
 *
 * Every path this module returns or reads is relative to the Ark ROOT (the `-C` directory),
 * never to the repository top level, so a package inside a monorepo sees its own files:
 *   - `git diff --relative` strips the package prefix and drops paths outside the root;
 *   - `git ls-files --others` is already cwd-relative;
 *   - `<ref>:./<path>` makes `git show` resolve from the root instead of the top level.
 * Output is NUL-separated (`-z`) so core.quotePath never C-quotes a non-ASCII name.
 * Every listing is checked: a failed or truncated call is an error, never an empty diff.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** Kill hung git instead of stalling CI. */
export const SPAWN_TIMEOUT_MS = 8000;
/** Same ceiling as design-delta: a large untracked tree must not overflow the default 1 MiB. */
export const GIT_MAX_BUFFER = 64 * 1024 * 1024;

/** Refs tried, in order, when no `--base` / `--against` is given. */
export const TEAM_BASE_CANDIDATES = Object.freeze([
  'origin/dev',
  'origin/main',
  'origin/master',
  'dev',
  'main',
  'master',
]);

export function runGit(cwd, args) {
  return spawnSync('git', ['-C', cwd, '-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: SPAWN_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
  });
}

export function safeGitRef(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(value) &&
    !value.includes('..')
  );
}

export function discoverTeamBaseRef(root, preferred) {
  if (safeGitRef(preferred)) return preferred;
  for (const candidate of TEAM_BASE_CANDIDATES) {
    const exists = runGit(root, ['rev-parse', '--verify', `${candidate}^{commit}`]);
    if (exists.status === 0) return candidate;
  }
  return null;
}

function gitFailure(label, result) {
  if (result.error) return `git ${label} failed: ${result.error.code || result.error.message}`;
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim();
    return `git ${label} failed${detail ? `: ${detail}` : ` (status ${result.status})`}`;
  }
  return null;
}

/**
 * Root-relative paths changed vs `baseRef` (committed since the merge base, staged,
 * unstaged, untracked). Fails closed: any git failure returns `ok: false`.
 */
export function listChangedPaths(root, baseRef) {
  if (!safeGitRef(baseRef)) {
    return { ok: false, paths: [], error: 'Invalid or missing git base ref.' };
  }
  const verify = runGit(root, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
  if (verify.status !== 0) {
    return { ok: false, paths: [], error: `Cannot resolve git ref ${baseRef}.` };
  }
  const calls = [
    [`diff ${baseRef}...HEAD`, ['diff', '--relative', '--name-only', '-z', `${baseRef}...HEAD`]],
    ['diff (unstaged)', ['diff', '--relative', '--name-only', '-z']],
    ['diff --cached', ['diff', '--relative', '--name-only', '-z', '--cached']],
    ['ls-files --others', ['ls-files', '-z', '--others', '--exclude-standard']],
  ];
  const paths = [];
  for (const [label, gitArgs] of calls) {
    const result = runGit(root, gitArgs);
    const failure = gitFailure(label, result);
    if (failure) return { ok: false, paths: [], error: failure };
    paths.push(...String(result.stdout).split('\0'));
  }
  return { ok: true, paths: [...new Set(paths.filter(Boolean))].sort(), error: null };
}

/** Root-relative form of `relPath` for a `<ref>:./<path>` spec; null when outside the root. */
export function rootRelativeGitPath(root, relPath) {
  if (typeof relPath !== 'string' || !relPath) return null;
  const rel = path.isAbsolute(relPath) ? path.relative(path.resolve(root), relPath) : relPath;
  const normalized = path.posix.normalize(rel.split(path.sep).join('/'));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized.replace(/^\.\//, '');
}

/** File text at `baseRef`, resolved relative to the Ark root (not the repo top level). */
export function gitShowText(root, baseRef, relPath) {
  const rel = rootRelativeGitPath(root, relPath);
  if (!safeGitRef(baseRef) || !rel) return null;
  const shown = runGit(root, ['show', `${baseRef}:./${rel}`]);
  if (shown.error || shown.status !== 0) return null;
  return shown.stdout;
}
