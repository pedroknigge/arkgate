/**
 * ark-check --watch loop (polling fallback when fs.watch is unavailable).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function watchFingerprint(target) {
  const pending = [target];
  const entries = [];
  while (pending.length > 0) {
    const current = pending.pop();
    let stat;
    try {
      stat = fs.statSync(current);
    } catch {
      continue;
    }
    entries.push(`${current}:${stat.mtimeMs}:${stat.size}`);
    if (!stat.isDirectory()) continue;
    try {
      for (const name of fs.readdirSync(current)) pending.push(path.join(current, name));
    } catch {
      // A concurrent delete is represented by the next fingerprint.
    }
  }
  return entries.sort().join('|');
}

function watchByPolling(target, onChange) {
  let previous = watchFingerprint(target);
  setInterval(() => {
    const current = watchFingerprint(target);
    if (current === previous) return;
    previous = current;
    onChange();
  }, 250);
}

export async function runWatchMode(args, { cliPath, loadConfig, dim }) {
  const argv = process.argv.slice(2).filter((token) => token !== '--watch');
  let debounce;
  const rerun = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const result = spawnSync(process.execPath, [cliPath, ...argv], {
        cwd: args.root,
        stdio: 'inherit',
        env: process.env,
      });
      process.exitCode = result.status ?? 1;
    }, 300);
  };

  let config;
  try {
    config = loadConfig(args.root, args.config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  for (const entry of config.include ?? []) {
    const target = path.join(args.root, entry);
    if (!fs.existsSync(target)) continue;
    try {
      const watcher = fs.watch(target, { recursive: true }, rerun);
      watcher.on('error', () => {
        watcher.close();
        watchByPolling(target, rerun);
      });
    } catch {
      watchByPolling(target, rerun);
    }
  }

  console.log(dim('Watching governed paths for changes… (Ctrl+C to stop)'));
  await new Promise(() => {});
}
