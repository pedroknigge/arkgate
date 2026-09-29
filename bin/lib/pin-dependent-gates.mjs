/**
 * Generated gate files whose Ark command only resolves through a local arkgate pin.
 *
 * `npx ark-check`, `pnpm exec arkgate-mcp` and `yarn ark-check` reach arkgate's bins only
 * when package.json declares arkgate. Without that pin the same line asks npm for a package
 * named `ark-check` (404) or runs a stale global copy. The pinned form
 * (`npx -y -p arkgate@<exact>`) does not depend on the pin and is not reported.
 */
import fs from 'node:fs';
import path from 'node:path';
import { npxArkgatePrefixLength } from './package-manager.mjs';

const ARK_BIN = /^(?:arkgate-check|arkgate-mcp|arkgate|ark-check|ark-mcp|ark)$/;
const LOCAL_RUNNER_TEXT =
  /(?:^|[\s"'`;&|(])(?:npx|pnpm(?:\s+--config\.verify-deps-before-run=false)?\s+exec|yarn)\s+(?:arkgate-check|arkgate-mcp|arkgate|ark-check|ark-mcp|ark)(?=[\s"'`;&|)]|$)/m;
const TOML_SERVER = /command\s*=\s*"([^"]*)"\s*\r?\nargs\s*=\s*\[([^\]]*)\]/g;

/** Host hooks, package scripts, and MCP registrations Ark generates. */
export const PIN_DEPENDENT_CANDIDATES = [
  '.claude/settings.json',
  '.codex/hooks.json',
  '.cursor/hooks.json',
  '.grok/hooks/ark-write-gate.json',
  '.agents/hooks.json',
  '.mcp.json',
  '.cursor/mcp.json',
  '.agents/mcp_config.json',
  'opencode.json',
  '.codex/config.toml',
  '.grok/config.toml',
  'package.json',
];

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** True when this argv runs an Ark bin through a runner that needs the local pin. */
export function argvDependsOnArkgatePin(command, args) {
  if (typeof command !== 'string' || !Array.isArray(args)) return false;
  const runner = path.basename(command.trim().replace(/\\/g, '/')).replace(/\.(?:cmd|exe)$/i, '');
  if (runner === 'npx') return npxArkgatePrefixLength(args) === 0 && ARK_BIN.test(args[0] ?? '');
  if (runner === 'yarn') return ARK_BIN.test(args[0] ?? '');
  if (runner === 'pnpm') {
    const exec = args.indexOf('exec');
    return exec >= 0 && ARK_BIN.test(args[exec + 1] ?? '');
  }
  return false;
}

function jsonServersDependOnPin(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return false;
  }
  const servers = [json?.mcpServers?.ark, json?.servers?.ark].filter(
    (server) => server && typeof server === 'object'
  );
  if (servers.some((server) => argvDependsOnArkgatePin(server.command, server.args ?? []))) {
    return true;
  }
  const argv = json?.mcp?.ark?.command;
  return Array.isArray(argv) && argvDependsOnArkgatePin(argv[0], argv.slice(1));
}

function tomlServersDependOnPin(text) {
  for (const match of text.matchAll(TOML_SERVER)) {
    const args = [...match[2].matchAll(/"([^"]*)"/g)].map((entry) => entry[1]);
    if (argvDependsOnArkgatePin(match[1], args)) return true;
  }
  return false;
}

function fileDependsOnPin(relativePath, text) {
  if (LOCAL_RUNNER_TEXT.test(text)) return true;
  if (relativePath.endsWith('.toml')) return tomlServersDependOnPin(text);
  if (relativePath.endsWith('.json')) return jsonServersDependOnPin(text);
  return false;
}

function workflowFiles(root) {
  const dir = path.join(root, '.github', 'workflows');
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => /\.ya?ml$/i.test(name))
      .sort()
      .map((name) => `.github/workflows/${name}`);
  } catch {
    return [];
  }
}

/** Project-relative generated files whose Ark command needs arkgate in package.json. */
export function pinDependentGateFiles(root) {
  const found = [];
  for (const rel of [...PIN_DEPENDENT_CANDIDATES, ...workflowFiles(root)]) {
    const text = readText(path.join(root, rel));
    if (text && fileDependsOnPin(rel, text)) found.push(rel);
  }
  return found;
}

/**
 * Attach `dependentGateFiles` to a PACKAGE_PIN_ABSENT truth so doctor can lead with the pin
 * when a generated file would 404 without it. Other codes pass through unchanged.
 */
export function withPinDependentGateFiles(root, truth) {
  if (truth?.code !== 'PACKAGE_PIN_ABSENT') return truth;
  return { ...truth, dependentGateFiles: pinDependentGateFiles(root) };
}
