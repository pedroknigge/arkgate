/**
 * Subcommands of `arkgate` / `ark` that hand their own flags to a sibling bin untouched:
 * `dashboard` (bin/ark-dashboard.mjs) and `mcp` (bin/ark-mcp.mjs).
 *
 * `mcp` exists because `npx arkgate@<version> <args>` always runs the bin named after the
 * package (`arkgate`), never `arkgate-mcp`. The MCP Registry descriptor (`server.json`) is
 * launched exactly that way, so `arkgate mcp --root . --config ark.config.json` must start the
 * stdio MCP server. `arkgate-mcp` / `ark-mcp` stay accepted as the first argument because
 * registry descriptors published before 4.8.24 pass that spelling.
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arkDashboard = path.join(here, '..', 'ark-dashboard.mjs');
const arkMcp = path.join(here, '..', 'ark-mcp.mjs');

/** First positional arguments that start the MCP server (stdio JSON-RPC). */
export const MCP_COMMANDS = Object.freeze(['mcp', 'arkgate-mcp', 'ark-mcp']);

/** First positional arguments whose remaining argv belongs to another executable. */
export function isPassthroughCommand(command) {
  return command === 'dashboard' || command === 'report' || MCP_COMMANDS.includes(command);
}

export function isMcpCommand(command) {
  return MCP_COMMANDS.includes(command);
}

export const dashboardHelp = `arkgate dashboard (alias ark dashboard) — observability TUI.
Usage: arkgate dashboard [--url <snapshot-url>] [--interval <ms>]
Polls an ArkRun inspector; it does not start the kernel.`;

export function withDashboardHelp(text, detailed) {
  const extra = detailed
    ? '  arkgate dashboard [--url <snapshot-url>] [--interval <ms>]\n  arkgate mcp [--root <project>] [--config <path>]\n  arkgate report  [--root <project>] [--json] [--title <text>] [--finding <ref>] [--submit] [--i-confirm-submit]\n'
    : '';
  const extraDesc = detailed
    ? '  dashboard  ANSI observability TUI (spawns ark-dashboard).\n  mcp        Stdio MCP server (same as arkgate-mcp; used by npx and the MCP Registry).\n  report     Draft an upstream GitHub issue for pedroknigge/arkgate. Create needs --submit plus confirm. --yes does not submit.\n'
    : '';
  if (detailed) {
    return text
      .replace('  arkgate agents-md [--root', `${extra}  arkgate agents-md [--root`)
      .replace('  agents-md Version-matched', `${extraDesc}  agents-md Version-matched`);
  }
  return text.replace(
    '  arkgate-check --doctor     status — one next step\n',
    '  arkgate-check --doctor     status — one next step\n  arkgate dashboard         observability TUI (inspector)\n  arkgate report            draft an upstream GitHub issue\n'
  );
}

export function runDashboard(passthroughArgs) {
  const result = spawnSync(process.execPath, [arkDashboard, ...passthroughArgs], {
    stdio: 'inherit',
    encoding: 'utf8',
  });
  return result.status ?? 1;
}

/**
 * Run bin/ark-mcp.mjs with the caller's stdio. Nothing is written to stdout here: stdout is
 * the JSON-RPC channel. Termination signals are forwarded so the host can stop the server.
 */
export function runMcp(passthroughArgs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [arkMcp, ...passthroughArgs], { stdio: 'inherit' });
    const forward = (signal) => {
      if (child.exitCode === null) child.kill(signal);
    };
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    for (const signal of signals) process.on(signal, forward);
    const done = (code) => {
      for (const signal of signals) process.off(signal, forward);
      resolve(code);
    };
    child.on('error', (error) => {
      process.stderr.write(`arkgate mcp: ${error.message}\n`);
      done(1);
    });
    child.on('exit', (code, signal) => done(code ?? (signal ? 1 : 0)));
  });
}
