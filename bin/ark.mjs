#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import {
  arkCommand,
  buildArchitectureRecommendation,
  detectPackageManager,
  INIT_WIZARD_CHOICES,
  isValidArchetypeId,
  mapWizardChoiceToArchetype,
  resolveArchetypePreset,
} from './ark-shared.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arkCheck = path.join(here, 'ark-check.mjs');

function parseArgs(argv) {
  const args = {
    command: undefined,
    root: process.cwd(),
    yes: false,
    force: false,
    strict: true,
    install: true,
    help: false,
  };

  // Scan from the first user token (index 2) so a leading flag like `ark --help` is
  // recognized: the command is the first NON-dash argument, not blindly argv[2].
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') args.root = path.resolve(argv[++i]);
    else if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--no-strict') args.strict = false;
    else if (arg === '--no-install') args.install = false;
    else if (arg === '--preset') args.preset = argv[++i];
    else if (arg === '--archetype') args.archetype = argv[++i];
    else if (arg === '--tools') args.tools = argv[++i];
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.help = true;
    else if (!arg.startsWith('-') && args.command === undefined) args.command = arg;
  }

  return args;
}

function usage() {
  return `Usage:
  ark init    [--root <project>] [--preset hexagonal|layered|feature-sliced|monorepo]
              [--archetype <playbook-id>] [--tools <list>] [--yes] [--force] [--no-strict]
  ark upgrade [--root <project>] [--no-install] [--no-strict]

Commands:
  init      Configure Ark project enforcement with explicit prompts.
  upgrade   One command to update Ark: bump the package to @latest, refresh gate
            templates + /ark-* skills (and Codex home prompts), migrate command
            runners to this project's package manager, then run the strict check.
            (alias: ark update)

Options:
  --yes        Non-interactive defaults: create config if needed, install gate templates, run strict check.
  --force      Allow generated files to overwrite existing files.
  --no-strict  Skip the final strict ark-check run.
  --no-install (upgrade) Refresh gates/skills only; don't reinstall the package.
  --preset     Start from a named architecture preset instead of detection.
  --archetype  Application shape from templates/architecture-playbook.json (maps to the matching preset).
               Valid ids: crud-product, api-backend, frontend-surface, library-sdk, cli-utility,
               worker-pipeline, event-coordinator, integration-bridge, multi-app-workspace, prototype-spike.
  --tools      Comma-separated agents to gate (claude,cursor,codex,windsurf,cline,copilot,kiro,roo,continue,gemini).
               Omit to auto-detect from each tool's config dir, falling back to claude+cursor+codex.

Interactive mode (TTY, no --yes): asks what application shape you are building and maps it to a preset.
`;
}

// The package-manager command that adds ark-runtime-kernel@latest as a dev dependency.
function packageInstallArgv(root) {
  const spec = 'ark-runtime-kernel@latest';
  const pm = detectPackageManager(root);
  if (pm === 'pnpm') return ['pnpm', ['add', '-D', spec]];
  if (pm === 'yarn') return ['yarn', ['add', '-D', spec]];
  return ['npm', ['install', '-D', spec]];
}

function runCommand(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit', encoding: 'utf8' });
  return result.status ?? 1;
}

// `ark upgrade`: the one command that replaces the "install @latest && install-agent-gates
// --skills-only --force && ... --codex-home --force && ... --migrate-commands && check" chain.
// Each step reruns ark-check as a fresh process, so the refresh runs from the freshly-installed
// version, not this (now-older) process.
async function upgrade(args) {
  const root = args.root;
  console.log('Ark upgrade — updating the package, gates, skills, and command runners.');

  if (args.install) {
    const [command, commandArgs] = packageInstallArgv(root);
    console.log(`\n1/4  Updating the package: ${command} ${commandArgs.join(' ')}`);
    const status = runCommand(command, commandArgs, root);
    if (status !== 0) {
      console.error(
        `\nPackage update failed (exit ${status}). Fix the install and re-run, or use ` +
          '`ark upgrade --no-install` to refresh gates/skills against the installed version.'
      );
      return status;
    }
  } else {
    console.log('\n1/4  Skipping package install (--no-install).');
  }

  console.log('\n2/4  Refreshing agent gates + /ark-* skills…');
  let status = runArkCheck(['--root', root, '--install-agent-gates'], { cwd: root });
  if (status !== 0) return status;

  // Codex loads slash-command prompts from ~/.codex/prompts, not the repo — refresh those too
  // when a Codex home exists, so nothing is left stale. Non-fatal: a permission error there
  // (e.g. a sandbox) shouldn't fail the whole upgrade.
  if (fs.existsSync(path.join(os.homedir(), '.codex'))) {
    console.log('\n     Refreshing Codex home prompts (~/.codex)…');
    runArkCheck(
      ['--root', root, '--install-agent-gates', '--skills-only', '--codex-home', '--force'],
      { cwd: root }
    );
  }

  console.log('\n3/4  Migrating command runners to this project’s package manager…');
  status = runArkCheck(['--root', root, '--install-agent-gates', '--migrate-commands'], { cwd: root });
  if (status !== 0) return status;

  if (!args.strict) {
    console.log('\n4/4  Skipping the strict check (--no-strict). Upgrade complete.');
    return 0;
  }
  console.log('\n4/4  Verifying architecture…');
  return runArkCheck(
    ['--root', root, '--config', 'ark.config.json', '--strict-config'],
    { cwd: root }
  );
}

function runArkCheck(args, options = {}) {
  const result = spawnSync(process.execPath, [arkCheck, ...args], {
    cwd: options.cwd,
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
  });
  return result.status ?? 1;
}

function isInteractiveTty() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function askYesNo(rl, question, defaultYes = true) {
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  const answer = (await rl.question(`${question}${suffix}`)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}

async function resolveArchetypeInteractive(rl, root) {
  console.log('');
  console.log('What are you building? (application shape — not a framework name)');
  for (const choice of INIT_WIZARD_CHOICES) {
    console.log(`  ${choice.key}. ${choice.label}`);
  }
  const answer = (await rl.question('Choose 1–8 [8]: ')).trim() || '8';
  const mapped = mapWizardChoiceToArchetype(answer);
  if (!mapped) {
    console.log('Unrecognized choice — analyzing the repo instead.');
    return resolveArchetypeFromRecommend(root);
  }
  if (mapped === 'auto') {
    return resolveArchetypeFromRecommend(root);
  }
  return mapped;
}

function resolveArchetypeFromRecommend(root) {
  const rec = buildArchitectureRecommendation(root);
  console.log(`Suggested shape: ${rec.archetype} — ${rec.label} (confidence ${rec.confidence})`);
  return rec.archetype;
}

function resolveInitPreset(args) {
  if (args.preset) return { preset: args.preset, archetype: args.archetype };
  if (args.archetype) {
    if (!isValidArchetypeId(args.archetype)) {
      throw new Error(
        `Unknown archetype "${args.archetype}". Run ark-check --recommend to see a suggested shape.`
      );
    }
    const resolved = resolveArchetypePreset(args.archetype);
    return { preset: resolved.preset, archetype: resolved.archetype, label: resolved.label };
  }
  return null;
}

async function init(args) {
  const root = args.root;
  const configPath = path.join(root, 'ark.config.json');
  const interactive = !args.yes && isInteractiveTty();
  const rl = interactive
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    let archetype = args.archetype;
    let preset = args.preset;

    if (interactive && !preset && !archetype) {
      archetype = await resolveArchetypeInteractive(rl, root);
    }

    if (!preset && archetype) {
      const resolved = resolveArchetypePreset(archetype);
      preset = resolved.preset;
      console.log(`Using archetype ${archetype} → preset ${preset} (${resolved.label})`);
    } else if (!preset && !interactive && !args.yes) {
      // non-TTY without --yes/--preset/--archetype: fall back to detection init
    } else if (!preset && args.yes && !archetype) {
      const rec = buildArchitectureRecommendation(root);
      preset = rec.preset;
      archetype = rec.archetype;
      console.log(`Auto-selected archetype ${archetype} → preset ${preset}`);
    }

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
      if (preset) initArgs.push('--preset', preset);
      if (args.force) initArgs.push('--force');
      const status = runArkCheck(initArgs, { cwd: root });
      if (status !== 0) return status;
    } else {
      console.log('Skipped ark.config.json generation.');
    }

    const installGates = args.yes || (await askYesNo(rl, 'Configure agent and CI gate templates?', true));
    if (installGates) {
      const gateArgs = ['--root', root, '--install-agent-gates'];
      if (args.tools) gateArgs.push('--tools', args.tools);
      if (args.force) gateArgs.push('--force');
      const status = runArkCheck(gateArgs, { cwd: root });
      if (status !== 0) return status;
    }

    const runStrict =
      args.strict && (args.yes || (await askYesNo(rl, 'Run strict architecture check now?', true)));
    if (runStrict) {
      return runArkCheck(
        ['--root', root, '--config', 'ark.config.json', '--strict-config'],
        { cwd: root }
      );
    }

    console.log(
      `Ark init complete. Run \`${arkCommand(root, 'ark-check', '--root . --config ark.config.json --strict-config')}\` before merging.`
    );
    if (archetype) {
      console.log(`Shape: ${archetype}. Plan: ${arkCommand(root, 'ark-check', '--recommend')}`);
    }
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
    try {
      return await init(args);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  if (args.command === 'upgrade' || args.command === 'update') {
    try {
      return await upgrade(args);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  console.error(`Unknown command: ${args.command}`);
  console.error(usage());
  return 2;
}

process.exitCode = await main();