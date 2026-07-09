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
  detectWorkspaces,
  resolveIncludeRoots,
  detectTsPackageRoots,
  INIT_WIZARD_CHOICES,
  isValidArchetypeId,
  mapWizardChoiceToArchetype,
  resolveArchetypePreset,
  resolveOperatingMode,
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
  ark start   [--root <project>] [--yes]
  ark init    [--root <project>] [--preset hexagonal|layered|feature-sliced|monorepo|ui-surface|vertical-slice|ddd-bounded-contexts|clean-architecture|onion-architecture]
              [--archetype <playbook-id>] [--tools <list>] [--yes] [--force] [--no-strict]
  ark upgrade [--root <project>] [--no-install] [--no-strict]

Commands:
  start     New here? The guided setup. Looks at your project, suggests a shape in
            plain language, sets up the guardrails, and shows a plan — no code changed.
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
               worker-pipeline, event-coordinator, integration-bridge, multi-app-workspace, prototype-spike,
               vertical-slice-product, ddd-bounded-contexts.
  --tools      Comma-separated agents to gate (claude,cursor,codex,windsurf,cline,copilot,kiro,roo,continue,gemini).
               Omit to auto-detect from each tool's config dir, falling back to claude+cursor+codex.

Interactive mode (TTY, no --yes): asks what application shape you are building and maps it to a preset.
`;
}

// The package-manager command that adds arkgate@latest as a dev dependency.
function packageInstallArgv(root) {
  const spec = 'arkgate@latest';
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

  // Codex loads slash-command prompts from $CODEX_HOME/prompts, not the repo — refresh those
  // when a Codex home exists. --force rewrites temp/upgrade MCP roots to this project + arkgate-mcp.
  // Non-fatal: a permission error (e.g. sandbox) shouldn't fail the whole upgrade.
  const codexHomeBase = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  if (fs.existsSync(codexHomeBase)) {
    console.log(`\n     Refreshing Codex home (${codexHomeBase})…`);
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
    console.log(
      `Freeze day-one architecture snapshot: ${arkCommand(root, 'ark-check', '--report ark-report.html')} (writes .ark/reports/origin.* once).`
    );
    console.log(`Adoption health: ${arkCommand(root, 'ark-check', '--doctor')}`);
    return 0;
  } finally {
    rl?.close();
  }
}

// `ark start` — the guided entry point (co-pilot Phase G). One command takes a newcomer from
// "I have a project" to "governed, with a plan" in plain language, without knowing any skill
// names: look at the code → suggest a shape → set up the guardrails → show the plan. It only
// orchestrates existing steps (recommend → init → --plan) and frames each in outcome terms.
async function start(args) {
  const root = args.root;
  const interactive = !args.yes && isInteractiveTty();
  const rl = interactive
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    console.log("Let's set up Ark for your project.");
    console.log(
      "I'll look at your code, suggest a shape, set up the guardrails, and show you a plan."
    );
    console.log('Nothing in your code is changed — this only adds Ark configuration.');

    // 1) Look at the project.
    let rec;
    try {
      rec = buildArchitectureRecommendation(root);
    } catch {
      rec = undefined;
    }

    // 2) Suggest a shape, in plain language, and confirm.
    let archetype = rec?.archetype;
    if (rec) {
      console.log('');
      console.log(`Your project looks like: ${rec.label}.`);
      if (rec.analogy) console.log(`In plain terms — ${rec.analogy}`);
      if (rec.mature) {
        console.log('');
        console.log(
          `This is an established codebase (${rec.signals?.sourceFileCount} files), so Ark will ADOPT it:`
        );
        console.log('match the contract to how your code is already organized, and flag only genuine issues.');
      }
      const proceed = args.yes || (await askYesNo(rl, '\nSet Ark up for this shape?', true));
      if (!proceed) {
        archetype = interactive ? await resolveArchetypeInteractive(rl, root) : rec.archetype;
      }
    } else if (interactive) {
      archetype = await resolveArchetypeInteractive(rl, root);
    }

    // 3) Set up config + gates. Greenfield → the shape's preset; an established repo → detection,
    // so the contract anchors to the directories you already have instead of aspirational globs.
    console.log('');
    console.log('Setting up Ark…');
    const configPath = path.join(root, 'ark.config.json');
    if (!fs.existsSync(configPath)) {
      const initArgs = ['--root', root, '--init'];
      const preset = archetype ? resolveArchetypePreset(archetype).preset : undefined;
      const includeRoots = resolveIncludeRoots(root);
      const tsPackages = detectTsPackageRoots(root);
      const workspaces = detectWorkspaces(root);
      const looksLikeMonorepo =
        includeRoots.length > 0 ||
        tsPackages.length > 0 ||
        workspaces.length > 0 ||
        fs.existsSync(path.join(root, 'rush.json')) ||
        fs.existsSync(path.join(root, 'pnpm-workspace.yaml')) ||
        fs.existsSync(path.join(root, 'lerna.json')) ||
        fs.existsSync(path.join(root, 'apps')) ||
        fs.existsSync(path.join(root, 'packages'));
      // Mature multi-package / nested-TS trees must NOT get a thin src/** starter (0 files).
      if (looksLikeMonorepo && (rec?.mature || includeRoots.length > 0 || tsPackages.length > 0)) {
        // UI-heavy TS packages (Remotion/Vite) prefer ui-surface patterns when recommend says so.
        const useUi =
          rec?.preset === 'feature-sliced' ||
          rec?.archetype === 'frontend-surface' ||
          (tsPackages.length > 0 && includeRoots.length === 0 && !rec?.mature);
        initArgs.push('--preset', useUi && tsPackages.length <= 3 ? 'ui-surface' : 'monorepo');
        const shown = includeRoots.length > 0 ? includeRoots : tsPackages;
        console.log(
          shown.length > 0
            ? `  Multi-package / TS package layout detected — profile include: ${shown.join(', ')}.`
            : '  Multi-package layout detected — using monorepo profile.'
        );
      } else if (!rec?.mature && preset) {
        initArgs.push('--preset', preset);
      }
      const status = runArkCheck(initArgs, { cwd: root });
      if (status !== 0) return status;
    } else {
      console.log('  Found an existing ark.config.json — keeping it.');
    }
    {
      const gateArgs = ['--root', root, '--install-agent-gates'];
      if (args.tools) gateArgs.push('--tools', args.tools);
      if (args.force) gateArgs.push('--force');
      runArkCheck(gateArgs, { cwd: root });
    }

    // 4) Show the plan: what's safe to auto-fix vs what needs a decision.
    console.log('');
    console.log('Your architecture plan:');
    runArkCheck(['--root', root, '--config', 'ark.config.json', '--plan'], { cwd: root });

    // Capture plan + doctor JSON for an honest wrap-up. Mode MUST match --doctor
    // (emptyLayers, core-optional, presentation bag) — never claim ENFORCE from plan alone.
    const planCapture = spawnSync(
      process.execPath,
      [arkCheck, '--root', root, '--config', 'ark.config.json', '--plan', '--json'],
      { cwd: root, encoding: 'utf8' }
    );
    const doctorCapture = spawnSync(
      process.execPath,
      [arkCheck, '--root', root, '--config', 'ark.config.json', '--doctor', '--json'],
      { cwd: root, encoding: 'utf8' }
    );
    let planOk = true;
    let governedPercent = null;
    let mode = 'adapt'; // conservative default — never default to enforce
    try {
      const parsed = JSON.parse(planCapture.stdout || '{}');
      planOk = parsed.ok === true && parsed.plan?.goal?.met === true;
      governedPercent = parsed.plan?.goal?.governedPercent ?? null;
      const totalFiles = parsed.plan?.goal?.totalFiles ?? null;

      let doctorMode = null;
      try {
        const doc = JSON.parse(doctorCapture.stdout || '{}');
        doctorMode = doc.doctor?.operatingMode ?? null;
        // Prefer doctor's mode (includes emptyLayers + coreOptional + presentation-bag honesty).
        if (doctorMode === 'suggest' || doctorMode === 'adapt' || doctorMode === 'enforce') {
          mode = doctorMode;
        } else {
          // Fallback: recompute with honesty inputs from doctor payload when present.
          const emptyLayers = doc.doctor?.emptyLayers ?? [];
          const coreOptionalWithFiles = Array.isArray(doc.doctor?.adoption?.coreOptional)
            ? doc.doctor.adoption.coreOptional.length
            : 0;
          const total = totalFiles || doc.doctor?.governed?.totalFiles || 0;
          const presentationShare =
            total > 0 && typeof doc.doctor?.governed?.percent === 'number'
              ? null // presentationShare only from coverage layers when available
              : null;
          mode = resolveOperatingMode({
            governedPercent: totalFiles === 0 ? 0 : governedPercent,
            planMet: parsed.plan?.goal?.met === true,
            mature: Boolean(rec?.mature),
            totalFiles: totalFiles ?? total,
            emptyLayers,
            coreOptionalWithFiles,
            presentationShare,
          });
        }
      } catch {
        mode = resolveOperatingMode({
          governedPercent: totalFiles === 0 ? 0 : governedPercent,
          planMet: parsed.plan?.goal?.met === true,
          mature: Boolean(rec?.mature),
          totalFiles,
        });
      }

      // Fresh greenfield with good coverage but no real tree yet → suggest, not enforce theatre.
      if (mode === 'enforce' && rec && !rec.mature && (governedPercent ?? 0) < 80) {
        mode = 'suggest';
      }
      // Empty scope from plan JSON is always adapt.
      if (parsed.plan?.goal?.emptyScope || totalFiles === 0) {
        mode = 'adapt';
        planOk = false;
      }
      // Never claim ENFORCE wrap-up if doctor would not (double-lock).
      if (mode === 'enforce' && doctorMode && doctorMode !== 'enforce') {
        mode = doctorMode;
      }
    } catch {
      // If capture fails, stay conservative: don't claim full enforcement.
      mode = 'adapt';
      planOk = false;
    }

    // 5) Plain-language wrap-up — one next step, status light only.
    // Modes are detected (Suggest/Adapt/Enforce), not user-picked settings.
    console.log('');
    if (mode === 'enforce' && planOk) {
      console.log('Done — status: ENFORCE (gates can honestly protect you).');
      console.log('What happens now:');
      console.log('  • Every edit is checked (in CI and, if wired, at write time).');
    } else if (mode === 'suggest') {
      console.log('Done — status: SUGGEST (starting shape installed; expand as you grow).');
      console.log('What happens now:');
      if (governedPercent != null) {
        console.log(`  • Ark governs ~${governedPercent}% of in-scope files — low is normal on a fresh scaffold.`);
      }
    } else {
      console.log('Done — status: ADAPT (contract still aligning with your real layout).');
      console.log('What happens now:');
      if (governedPercent != null) {
        console.log(
          `  • Governed ~${governedPercent}% — a "clean" plan with low coverage checks almost nothing.`
        );
      }
    }
    console.log('');
    console.log('Next (the only flow you need):');
    console.log('  1. In your agent:  /ark-autopilot');
    console.log('     → origin report, adoption, plan, safe fixes, leave gates on.');
    console.log(`  2. Status anytime: ${arkCommand(root, 'ark-check', '--doctor')}`);
    console.log(`  3. After edits:    ${arkCommand(root, 'ark-check', '--root . --config ark.config.json --strict-config')}`);
    if (mode === 'adapt' && planOk) {
      console.log(
        `  4. When green but cores still optional: ${arkCommand(root, 'ark-check', '--ratchet-cores')} → honest ENFORCE`
      );
    }
    console.log('');
    console.log('Optional later: --plan · --coverage · /ark-fix · /ark-place · ark upgrade');

    // 6) First architecture report — freezes an origin snapshot under .ark/reports/
    // so later --report runs can show evolution. Idempotent: origin is written only once.
    console.log('');
    console.log('Capturing architecture report (origin snapshot on first run)…');
    runArkCheck(
      ['--root', root, '--config', 'ark.config.json', '--report', 'ark-report.html'],
      { cwd: root }
    );
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

  if (args.command === 'start') {
    try {
      return await start(args);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
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