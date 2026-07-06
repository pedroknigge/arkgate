#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const here = path.dirname(fileURLToPath(import.meta.url));
const arkCheck = path.join(here, 'ark-check.mjs');

function parseArgs(argv) {
  const args = {
    command: argv[2],
    root: process.cwd(),
    yes: false,
    force: false,
    strict: true,
    help: false,
  };

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') args.root = path.resolve(argv[++i]);
    else if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--no-strict') args.strict = false;
    else if (arg === '--preset') args.preset = argv[++i];
    else if (arg === '--tools') args.tools = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
  }

  return args;
}

function usage() {
  return `Usage:
  ark init [--root <project>] [--preset hexagonal|layered|feature-sliced|monorepo] [--tools <list>] [--yes] [--force] [--no-strict]

Commands:
  init   Configure Ark project enforcement with explicit prompts.

Options:
  --yes       Non-interactive defaults: create config if needed, install gate templates, run strict check.
  --force     Allow generated files to overwrite existing files.
  --no-strict Skip the final strict ark-check run.
  --preset    Start from a named architecture (hexagonal, layered, feature-sliced, monorepo) instead of detection.
              (Workspace monorepos are auto-detected even without --preset.)
  --tools     Comma-separated agents to gate (claude,cursor,codex,windsurf,cline,copilot,kiro,roo,continue,gemini).
              Omit to auto-detect from each tool's config dir, falling back to claude+cursor+codex.
`;
}

function runArkCheck(args, options = {}) {
  const result = spawnSync(process.execPath, [arkCheck, ...args], {
    cwd: options.cwd,
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
  });
  return result.status ?? 1;
}

async function askYesNo(rl, question, defaultYes = true) {
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  const answer = (await rl.question(`${question}${suffix}`)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}

async function init(args) {
  const root = args.root;
  const configPath = path.join(root, 'ark.config.json');
  const rl = args.yes
    ? null
    : readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    let shouldInit = !fs.existsSync(configPath);
    if (fs.existsSync(configPath)) {
      shouldInit = args.force
        ? true
        : args.yes
          ? false
          : await askYesNo(rl, 'ark.config.json already exists. Regenerate it?', false);
    }

    if (shouldInit) {
      const initArgs = ['--root', root, '--init'];
      if (args.preset) initArgs.push('--preset', args.preset);
      if (args.force) initArgs.push('--force');
      const status = runArkCheck(initArgs, { cwd: root });
      if (status !== 0) return status;
    } else {
      console.log('Skipped ark.config.json generation.');
    }

    const installGates = args.yes || await askYesNo(rl, 'Configure agent and CI gate templates?', true);
    if (installGates) {
      const gateArgs = ['--root', root, '--install-agent-gates'];
      if (args.tools) gateArgs.push('--tools', args.tools);
      if (args.force) gateArgs.push('--force');
      const status = runArkCheck(gateArgs, { cwd: root });
      if (status !== 0) return status;
    }

    const runStrict =
      args.strict && (args.yes || await askYesNo(rl, 'Run strict architecture check now?', true));
    if (runStrict) {
      return runArkCheck(
        ['--root', root, '--config', 'ark.config.json', '--strict-config'],
        { cwd: root }
      );
    }

    console.log('Ark init complete. Run `npx ark-check --root . --config ark.config.json --strict-config` before merging.');
    return 0;
  } finally {
    rl?.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.command) {
    console.log(usage());
    return 0;
  }

  if (args.command === 'init') {
    return init(args);
  }

  console.error(`Unknown command: ${args.command}`);
  console.error(usage());
  return 2;
}

process.exitCode = await main();
