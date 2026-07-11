/**
 * Open a local HTML file in the default browser (macOS / Windows / Linux).
 * Used after ark-check --report writes a showcase/beginner report.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveEnvironmentValue } from './product-identity.mjs';

/**
 * Whether report generation should open the browser.
 * Default: yes for interactive local TTY; never in CI/Vitest unless forced.
 *
 * @param {{ force?: boolean, noOpen?: boolean, env?: NodeJS.ProcessEnv, isTty?: boolean }} [opts]
 */
export function shouldOpenHtmlReport(opts = {}) {
  const env = opts.env ?? process.env;
  if (opts.noOpen) return false;
  if (opts.force) return true;
  const off = resolveEnvironmentValue(
    env,
    'STRUCTRAIL_NO_OPEN_REPORT',
    'ARK_NO_OPEN_REPORT'
  ).value;
  if (off === '1' || off === 'true' || off === 'yes') return false;
  if (env.CI === 'true' || env.CI === '1') return false;
  if (env.GITHUB_ACTIONS === 'true') return false;
  if (env.VITEST) return false;
  const tty = opts.isTty ?? Boolean(process.stdout.isTTY);
  return tty;
}

/**
 * Launch the OS default browser for a local file path (non-blocking).
 * Errors are swallowed — report generation must not fail if the browser cannot open.
 *
 * @param {string} filePath
 * @param {{ platform?: NodeJS.Platform, spawn?: typeof spawn }} [opts]
 * @returns {{ ok: boolean, command?: string, reason?: string }}
 */
export function openHtmlInBrowser(filePath, opts = {}) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    return { ok: false, reason: 'missing-file' };
  }
  const platform = opts.platform ?? process.platform;
  const spawnFn = opts.spawn ?? spawn;

  /** @type {string} */
  let command;
  /** @type {string[]} */
  let args;
  if (platform === 'darwin') {
    command = 'open';
    args = [abs];
  } else if (platform === 'win32') {
    // `start` is a cmd built-in; empty title arg is required when the path has spaces.
    command = 'cmd';
    args = ['/c', 'start', '', abs];
  } else {
    command = 'xdg-open';
    args = [abs];
  }

  try {
    const child = spawnFn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => {
      /* browser missing (e.g. headless Linux) — ignore */
    });
    child.unref();
    return { ok: true, command };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
