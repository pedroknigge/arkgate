import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const lockDir = path.join(process.cwd(), '.ark-build-lock');
// Above the longest declared hold (pack-restore's build-then-pack, 240s): a
// waiter that steals the lock mid-build runs a second `clean-gate-dist && tsup`
// over the same dist/, and the original holder's finally then deletes the
// thief's lock.
const STALE_MS = 300_000;

/**
 * Serialize operations that rebuild or read the shared dist/ across vitest worker
 * processes: the MCP suite's `npm run build` and the pack-restore test's own
 * build-then-pack otherwise race and flake. mkdir is atomic, so whoever
 * creates the directory owns the lock; a lock older than STALE_MS is treated as
 * left behind by a crashed worker and stolen.
 */
export function withDistLock<T>(fn: () => T): T {
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch {
      try {
        if (Date.now() - fs.statSync(lockDir).mtimeMs > STALE_MS) {
          fs.rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue; // lock vanished between attempts — retry immediately
      }
      execSync('sleep 0.1'); // shell sleep; swap for Atomics.wait if it shows up in profiles
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}
