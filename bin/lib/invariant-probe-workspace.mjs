/**
 * Temporary copy for the invariant probe — Tooling (ADR 0039).
 *
 * Every mutant is applied to a copy under the OS temp directory, never to the
 * user's tree. Layout:
 *
 *   <tmp>/arkgate-probe-XXXXXX/
 *     .arkgate-probe-owner   ownership marker (the stale sweep only touches these)
 *     project/               the copy (node_modules is a real dir of links)
 *     home/  tmp/            HOME and TMPDIR for the runner
 *
 * Cleanup runs in `finally` and on SIGINT / SIGTERM. The next run removes
 * stale `arkgate-probe-*` directories older than 24 hours, but only when the
 * owner marker is a regular file inside a real directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROBE_DIR_PREFIX = 'arkgate-probe-';
export const PROBE_OWNER_MARKER = '.arkgate-probe-owner';
const PROBE_MAX_FILES = 20_000;
const PROBE_MAX_BYTES = 256 * 1024 * 1024;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Never copied. `node_modules` is linked instead (see linkFarm). */
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', 'out']);
const EXCLUDED_PATHS = new Set(['.ark/reports']);
/** Runner caches inside node_modules: never linked, so a cache write lands in the copy. */
const UNLINKED_MODULE_ENTRIES = new Set(['.vite', '.vitest', '.cache']);

/** Walk the tree the copy would hold, without copying. */
function planCopy(root, maxFiles, maxBytes) {
  const entries = [];
  let bytes = 0;
  let files = 0;
  const over = () => files > maxFiles || bytes > maxBytes;
  const visit = (rel) => {
    if (over()) return;
    const abs = rel ? path.join(root, rel) : root;
    let children;
    try {
      children = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const child of children) {
      const childRel = rel ? `${rel}/${child.name}` : child.name;
      if (EXCLUDED_PATHS.has(childRel)) continue;
      if (child.isDirectory()) {
        if (child.name === 'node_modules') {
          entries.push({ rel: childRel, kind: 'modules' });
          continue;
        }
        if (EXCLUDED_DIRS.has(child.name)) continue;
        entries.push({ rel: childRel, kind: 'dir' });
        visit(childRel);
      } else if (child.isSymbolicLink()) {
        if (child.name === 'node_modules') entries.push({ rel: childRel, kind: 'modules' });
        else entries.push({ rel: childRel, kind: 'link' });
      } else if (child.isFile()) {
        files += 1;
        try {
          bytes += fs.statSync(path.join(root, childRel)).size;
        } catch {
          /* vanished mid-walk: not copied */
        }
        entries.push({ rel: childRel, kind: 'file' });
      }
      if (over()) return;
    }
  };
  visit('');
  return { entries, files, bytes };
}

/** `node_modules` in the copy: a real directory holding one link per top-level entry. */
function linkFarm(sourceModules, targetModules) {
  fs.mkdirSync(targetModules, { recursive: true });
  let names = [];
  try {
    names = fs.readdirSync(sourceModules);
  } catch {
    return;
  }
  for (const name of names) {
    if (UNLINKED_MODULE_ENTRIES.has(name)) continue;
    let real;
    try {
      real = fs.realpathSync(path.join(sourceModules, name));
    } catch {
      continue;
    }
    try {
      fs.symlinkSync(real, path.join(targetModules, name), process.platform === 'win32' ? 'junction' : undefined);
    } catch {
      /* a name that cannot be linked is left out; the runner reports what is missing */
    }
  }
}

/**
 * Remove stale probe directories: older than 24 hours AND carrying the owner
 * marker. Anything else under the temp root is never touched.
 */
export function sweepStaleProbeWorkspaces({ tmpRoot = os.tmpdir(), now = Date.now(), maxAgeMs = STALE_AFTER_MS } = {}) {
  const removed = [];
  let names = [];
  try {
    names = fs.readdirSync(tmpRoot);
  } catch {
    return { removed };
  }
  for (const name of names) {
    if (!name.startsWith(PROBE_DIR_PREFIX)) continue;
    const dir = path.join(tmpRoot, name);
    try {
      const dirStat = fs.lstatSync(dir);
      if (!dirStat.isDirectory()) continue;
      const markerStat = fs.lstatSync(path.join(dir, PROBE_OWNER_MARKER));
      if (!markerStat.isFile()) continue;
      if (now - markerStat.mtimeMs < maxAgeMs) continue;
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    } catch {
      /* no marker, or unreadable: not ours to remove */
    }
  }
  return { removed };
}

/**
 * Copy `root` into a fresh marked workspace.
 * @returns {{ ok: true, dir: string, project: string, home: string, tmp: string, cleanup: () => void,
 *             files: number, bytes: number }
 *          | { ok: false, reasonCode: 'PROBE_TREE_TOO_LARGE', files: number, bytes: number }}
 */
export function createProbeWorkspace(
  root,
  { tmpRoot = os.tmpdir(), onSignalCleanup, maxFiles = PROBE_MAX_FILES, maxBytes = PROBE_MAX_BYTES } = {}
) {
  const plan = planCopy(root, maxFiles, maxBytes);
  if (plan.files > maxFiles || plan.bytes > maxBytes) {
    return { ok: false, reasonCode: 'PROBE_TREE_TOO_LARGE', files: plan.files, bytes: plan.bytes };
  }
  const dir = fs.mkdtempSync(path.join(tmpRoot, PROBE_DIR_PREFIX));
  fs.writeFileSync(
    path.join(dir, PROBE_OWNER_MARKER),
    `${JSON.stringify({ owner: 'arkgate-probe', pid: process.pid })}\n`
  );
  const project = path.join(dir, 'project');
  const home = path.join(dir, 'home');
  const tmp = path.join(dir, 'tmp');
  for (const sub of [project, home, tmp]) fs.mkdirSync(sub);
  let cleaned = false;
  const signals = ['SIGINT', 'SIGTERM'];
  const onSignal = (signal) => {
    cleanup();
    onSignalCleanup?.(signal);
    process.kill(process.pid, signal);
  };
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    for (const signal of signals) process.removeListener(signal, onSignal);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const signal of signals) process.once(signal, onSignal);
  try {
    for (const entry of plan.entries) {
      const source = path.join(root, entry.rel);
      const target = path.join(project, entry.rel);
      if (entry.kind === 'dir') fs.mkdirSync(target, { recursive: true });
      else if (entry.kind === 'modules') linkFarm(source, target);
      else if (entry.kind === 'link') fs.symlinkSync(fs.readlinkSync(source), target);
      else fs.copyFileSync(source, target);
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  return { ok: true, dir, project, home, tmp, cleanup, files: plan.files, bytes: plan.bytes };
}
