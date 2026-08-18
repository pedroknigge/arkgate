#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import {
  arkCommand,
  buildArchitectureRecommendation,
  detectPackageManager,
  detectWorkspaces,
  evaluateStartShapeConfidenceGate,
  resolveIncludeRoots,
  detectTsPackageRoots,
  INIT_WIZARD_CHOICES,
  isValidArchetypeId,
  mapWizardChoiceToArchetype,
  packageInstallArgv,
  resolveArchetypePreset,
  resolveOperatingMode,
  shouldSkipArkgateInstall,
} from './ark-shared.mjs';
import { pinArkgateDevDependency, FALSE_GREEN_GAP_ID } from './lib/field-install.mjs';
import { validateHardWriteRequest } from './lib/enforcement-profiles.mjs';
import { applyStartPreview, planStart, renderStartPreview } from './lib/start-preview.mjs';
import { runUpgradeCommand } from './lib/upgrade-command.mjs';
import { detectActiveAgentHost } from './lib/skill-install.mjs';
import { loadArkConfigContract } from './lib/config-contract.mjs';
import { loadTypeScript } from './lib/typescript-host.mjs';
import {
  prepareChangeFromRoot,
  readChangeMapFile,
  readChangeSetFile,
  renderChangePreflight,
} from './lib/prepare-change.mjs';
import { runStatusCommand } from './lib/status-command.mjs';
import { runAgentProjectionCommand } from './lib/agent-projection-command.mjs';
import { setupUsage, setupUsageAll, upgradeUsage } from './lib/first-run-help.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arkCheck = path.join(here, 'ark-check.mjs');

/**
 * Day-zero architecture picture: freeze origin under `.ark/reports/` as soon as
 * `ark.config.json` exists — **before** agent docs, skills, CI templates, or cleanups.
 * Idempotent: origin is written only once (`--report` archive semantics).
 */
function freezeDayZeroOrigin(root) {
  const configPath = path.join(root, 'ark.config.json');
  if (!fs.existsSync(configPath)) {
    console.log(
      `  Skip origin freeze — no ark.config.json yet. After init: ${arkCommand(root, 'ark-check', '--report ark-report.html')}`
    );
    return;
  }
  const originJson = path.join(root, '.ark', 'reports', 'origin.json');
  const already = fs.existsSync(originJson);
  console.log(
    already
      ? 'Architecture origin already frozen (.ark/reports/origin.*) — leaving it untouched.'
      : 'Freezing day-zero architecture picture (origin) before agent docs / gates…'
  );
  runArkCheck(
    ['--root', root, '--config', 'ark.config.json', '--report', 'ark-report.html'],
    { cwd: root }
  );
}

function parseArgs(argv) {
  const args = {
    command: undefined,
    root: process.cwd(),
    config: 'ark.config.json',
    yes: false,
    force: false,
    strict: true,
    install: true,
    installExplicit: false,
    apply: false,
    acceptConflicts: false,
    refreshSkills: false,
    planDigest: undefined,
    json: false,
    internalApply: false,
    skipPackageManager: false,
    removeHost: undefined,
    requireWriteHook: undefined,
    expectedRoot: undefined,
    expectedProjectId: undefined,
    write: false,
    check: false,
    stdout: false,
    help: false,
    all: false,
    version: false,
  };

  const requireValue = (flag, index) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`Missing value for ${flag}. Run arkgate --help for usage.`);
    }
    return value;
  };

  // Scan from the first user token (index 2) so a leading flag like `ark --help` is
  // recognized: the command is the first NON-dash argument, not blindly argv[2].
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') args.root = path.resolve(requireValue(arg, i++));
    else if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--no-strict') args.strict = false;
    else if (arg === '--install') {
      args.install = true;
      args.installExplicit = true;
    }
    else if (arg === '--no-install') {
      args.install = false;
      args.installExplicit = true;
    }
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--accept-conflicts') args.acceptConflicts = true;
    else if (arg === '--refresh-skills') args.refreshSkills = true;
    else if (arg === '--plan-digest') args.planDigest = requireValue(arg, i++);
    else if (arg === '--json') args.json = true;
    else if (arg === '--internal-apply') args.internalApply = true;
    else if (arg === '--skip-package-manager') args.skipPackageManager = true;
    else if (arg === '--remove-host') args.removeHost = requireValue(arg, i++).trim().toLowerCase();
    else if (arg === '--preset') args.preset = requireValue(arg, i++);
    else if (arg === '--config') args.config = requireValue(arg, i++);
    else if (arg === '--changes') args.changes = requireValue(arg, i++);
    else if (arg === '--change-map') args.changeMap = requireValue(arg, i++);
    else if (arg === '--manifest') args.manifest = requireValue(arg, i++);
    else if (arg === '--tsconfig') args.tsconfig = requireValue(arg, i++);
    else if (arg === '--archetype') args.archetype = requireValue(arg, i++);
    else if (arg === '--tools') args.tools = requireValue(arg, i++);
    else if (arg === '--require-write-hook') {
      args.requireWriteHook = requireValue(arg, i++).trim().toLowerCase();
    }
    else if (arg === '--expected-root') args.expectedRoot = path.resolve(requireValue(arg, i++));
    else if (arg === '--expected-project-id') args.expectedProjectId = requireValue(arg, i++);
    else if (arg === '--vs') args.vs = requireValue(arg, i++);
    else if (arg === '--write') args.write = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--stdout') args.stdout = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.help = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--version' || arg === '-V') args.version = true;
    else if (!arg.startsWith('-') && args.command === undefined) args.command = arg;
    else throw new Error(`Unknown argument: ${arg}. Run arkgate --help for usage.`);
  }

  return args;
}

function cliVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

// packageInstallArgv is imported from ark-shared (workspace-aware -w / -W).

function runCommand(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit', encoding: 'utf8' });
  return result.status ?? 1;
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

async function resolveStartHost(args) {
  if (args.tools || args.removeHost) return args.tools;
  const active = detectActiveAgentHost();
  if (!isInteractiveTty() || args.yes) return active ?? undefined;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question(
        `Which agent should receive Ark's compact router? [${active ?? 'skip for now'}] `
      )
    )
      .trim()
      .toLowerCase();
    return answer || active || undefined;
  } finally {
    rl.close();
  }
}

/**
 * True when prompts should be skipped and guided defaults applied.
 * Agents typically have no TTY — never call readline on a null interface.
 */
export function shouldUseNonInteractiveDefaults(args, tty = isInteractiveTty()) {
  return Boolean(args?.yes || !tty);
}

async function askYesNo(rl, question, defaultYes = true) {
  if (!rl) {
    // Defensive: non-TTY callers must not reach here; return the default rather than throw.
    return defaultYes;
  }
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  const answer = (await rl.question(`${question}${suffix}`)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}

/**
 * Pin arkgate in package.json (and optionally run the package manager).
 * start calls this so CI/`npx` is not forced to rely on a stale global install.
 *
 * @param {string} root
 * @param {{ install?: boolean, runPackageManager?: boolean }} [opts]
 */
export function ensureProjectArkgateDependency(root, opts = {}) {
  const install = opts.install !== false;
  const runPm = opts.runPackageManager === true;
  if (!install) {
    return { pinned: { changed: false, reason: 'skipped-no-install' }, installStatus: null };
  }
  const pinned = pinArkgateDevDependency(root);
  let installStatus = null;
  // Only run the package manager after a successful pin change — avoid surprise
  // network on every start when arkgate is already listed.
  if (runPm && pinned.changed) {
    const [command, commandArgs] = packageInstallArgv(root, pinned.version);
    installStatus = runCommand(command, commandArgs, root);
  }
  return { pinned, installStatus };
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
  const nonInteractive = shouldUseNonInteractiveDefaults(args);
  const interactive = !nonInteractive;
  const rl = interactive
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    if (nonInteractive && !args.yes) {
      console.log(
        'Non-interactive session (no TTY) — using guided defaults (same as --yes). Pass flags to override.'
      );
    }

    let archetype = args.archetype;
    let preset = args.preset;

    if (interactive && !preset && !archetype) {
      archetype = await resolveArchetypeInteractive(rl, root);
    }

    if (!preset && archetype) {
      const resolved = resolveArchetypePreset(archetype);
      preset = resolved.preset;
      console.log(`Using archetype ${archetype} → preset ${preset} (${resolved.label})`);
    } else if (!preset && nonInteractive && !archetype) {
      // non-TTY / --yes without explicit shape: recommend → preset
      const rec = buildArchitectureRecommendation(root);
      preset = rec.preset;
      archetype = rec.archetype;
      console.log(`Auto-selected archetype ${archetype} → preset ${preset}`);
    }

    let shouldInit = !fs.existsSync(configPath);
    if (fs.existsSync(configPath)) {
      shouldInit = args.force
        ? true
        : nonInteractive
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

    // Origin first: contract-on-tree picture before AGENTS.md / skills / CI templates.
    console.log('');
    freezeDayZeroOrigin(root);

    const installGates =
      nonInteractive || (await askYesNo(rl, 'Configure agent and CI gate templates?', true));
    if (installGates) {
      const gateArgs = ['--root', root, '--install-agent-gates'];
      if (args.tools) gateArgs.push('--tools', args.tools);
      if (args.requireWriteHook) {
        gateArgs.push('--require-write-hook', args.requireWriteHook);
      }
      if (args.force) gateArgs.push('--force');
      const status = runArkCheck(gateArgs, { cwd: root });
      if (status !== 0) return status;
    }

    const runStrict =
      args.strict &&
      (nonInteractive || (await askYesNo(rl, 'Run strict architecture check now?', true)));
    if (runStrict) {
      const strictArgs = ['--root', root, '--config', 'ark.config.json', '--strict-merge'];
      if (args.requireWriteHook) {
        strictArgs.push('--require-write-hook', args.requireWriteHook);
      }
      return runArkCheck(strictArgs, { cwd: root });
    }

    console.log(
      `Ark init complete. Run \`${arkCommand(root, 'ark-check', '--root . --config ark.config.json --strict-merge')}\` before merging.`
    );
    if (archetype) {
      console.log(`Shape: ${archetype}. Plan: ${arkCommand(root, 'ark-check', '--recommend')}`);
    }
    console.log(
      `Day-zero origin: .ark/reports/origin.* (frozen once; later --report shows evolution vs origin).`
    );
    console.log(`Adoption health: ${arkCommand(root, 'ark-check', '--doctor')}`);
    return 0;
  } finally {
    rl?.close();
  }
}

// `ark start` — the guided entry point (co-pilot Phase G). One command takes a newcomer from
// "I have a project" to "governed, with a plan" in plain language, without knowing any skill
// names: look at the code → suggest a shape → set up one compact host router → show the plan. It only
// orchestrates existing steps (recommend → init → --plan) and frames each in outcome terms.
async function start(args) {
  if (!args.internalApply) {
    args.tools = await resolveStartHost(args);
    const preview = await planStart(args, {
      arkCheck,
      cliPath: fileURLToPath(import.meta.url),
      cliVersion,
      packageInstallArgv,
    });
    // NEW-START-LOW-CONFIDENCE-SHAPE: refuse apply on all apply paths when shape is weak.
    if (args.apply) {
      const gate = evaluateStartShapeConfidenceGate({
        confidence: preview.analysis?.confidence,
        projectedCoveragePercent: preview.projectedCoverage?.percent,
        totalFiles: preview.projectedCoverage?.totalFiles,
        explicitShape: Boolean(args.archetype || args.preset),
        force: Boolean(args.force),
      });
      if (!gate.ok) {
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: false,
                error: 'start-shape-confidence-gate',
                ...gate,
                preview,
              },
              null,
              2
            )
          );
        } else {
          console.error('Refusing ark start --apply: shape confidence / coverage gate failed.');
          for (const reason of gate.reasons ?? []) console.error(`  • ${reason}`);
          console.error('Choices:');
          for (const choice of gate.choices ?? []) console.error(`  • ${choice}`);
          renderStartPreview(preview);
        }
        return 2;
      }
    }
    if (args.json) console.log(JSON.stringify(preview, null, 2));
    else if (!args.apply) renderStartPreview(preview);
    else renderStartPreview(preview, { applying: true });
    if (!args.apply) return 0;
    applyStartPreview(args.root, preview);
    // DL-START-APPLY-MESSAGE: single honest summary (do not claim preview-no-write after apply).
    if (!args.json) {
      if (preview.changes.length === 0) {
        console.log('Start apply complete — nothing to change (already set up).');
      } else {
        console.log(`Applied ${preview.changes.length} start mutation(s).`);
      }
    }
    // After applying exact preview bytes, install the pinned package when requested
    // (preview itself never runs the package manager — field: start left pin without node_modules).
    if (
      args.install &&
      !args.skipPackageManager &&
      fs.existsSync(path.join(args.root, 'package.json'))
    ) {
      const skip = shouldSkipArkgateInstall(args.root, cliVersion());
      if (!skip.skip) {
        const [command, commandArgs] = packageInstallArgv(args.root, `^${cliVersion()}`);
        if (!args.json) console.log(`Installing package: ${command} ${commandArgs.join(' ')}`);
        // Keep stdout clean for --json consumers (package managers are chatty on stdout).
        const status = args.json
          ? (spawnSync(command, commandArgs, {
              cwd: args.root,
              stdio: ['ignore', 'pipe', 'pipe'],
              encoding: 'utf8',
            }).status ?? 1)
          : runCommand(command, commandArgs, args.root);
        if (status !== 0 && !args.json) {
          console.log(
            `Package manager exited ${status}. package.json is pinned; run the install command when online.`
          );
        }
      }
    }
    return 0;
  }
  const root = args.root;
  const nonInteractive = shouldUseNonInteractiveDefaults(args);
  const interactive = !nonInteractive;
  const rl = interactive
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    console.log("Let's set up Ark for your project.");
    console.log(
      "I'll walk the tree, create a compact host-specific guardrail setup, then show a plan."
    );
    console.log(
      'Nothing in your product code is changed — only Ark config, one active-host router, and a CI template.'
    );
    if (nonInteractive && !args.yes) {
      console.log(
        'Non-interactive session (no TTY) — using guided defaults (same as --yes). Pass flags to override.'
      );
    }

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
      const proceed =
        nonInteractive || (await askYesNo(rl, '\nSet Ark up for this shape?', true));
      if (!proceed) {
        archetype = interactive ? await resolveArchetypeInteractive(rl, root) : rec.archetype;
      }
    } else if (interactive) {
      archetype = await resolveArchetypeInteractive(rl, root);
    }

    // 2b) Pin arkgate as a project devDependency so CI/npx do not depend on a stale global.
    // Default install=true; only --no-install skips. (installExplicit tracks user override for copy.)
    if (args.install && fs.existsSync(path.join(root, 'package.json'))) {
      const { pinned, installStatus } = ensureProjectArkgateDependency(root, {
        install: true,
        runPackageManager: !args.skipPackageManager,
      });
      if (pinned.changed) {
        console.log(`  Pinned arkgate@${pinned.version} in package.json devDependencies.`);
        if (installStatus !== null && installStatus !== 0) {
          console.log(
            `  Package manager install exited ${installStatus} — package.json is still pinned; run install when online.`
          );
        }
      } else if (pinned.reason === 'already-present') {
        console.log(`  arkgate already in package.json (${pinned.version}).`);
      }
    } else if (!args.install) {
      console.log('  Skipping arkgate package pin (--no-install).');
    }

    // 3) Contract first (config only). Greenfield → shape preset; established repo → detection,
    // so the contract anchors to directories you already have instead of aspirational globs.
    console.log('');
    console.log('Setting up Ark contract…');
    const configPath = path.join(root, 'ark.config.json');
    if (!fs.existsSync(configPath)) {
      const initArgs = ['--root', root, '--init'];
      const preset = archetype ? resolveArchetypePreset(archetype).preset : undefined;
      const includeRoots = resolveIncludeRoots(root);
      const tsPackages = detectTsPackageRoots(root);
      const nestedTsPackages = tsPackages.filter((entry) => entry !== '.');
      const workspaces = detectWorkspaces(root);
      const looksLikeMonorepo =
        includeRoots.length > 0 ||
        nestedTsPackages.length > 0 ||
        workspaces.length > 0 ||
        fs.existsSync(path.join(root, 'rush.json')) ||
        fs.existsSync(path.join(root, 'pnpm-workspace.yaml')) ||
        fs.existsSync(path.join(root, 'lerna.json')) ||
        fs.existsSync(path.join(root, 'apps')) ||
        fs.existsSync(path.join(root, 'packages'));
      // SPA (Vite + root api/lib) wins over monorepo heuristics (NEW-SPA-DEFAULT-LAYOUT).
      if (rec?.preset === 'vite-vercel-spa' || preset === 'vite-vercel-spa') {
        initArgs.push('--preset', 'vite-vercel-spa');
        console.log('  Vite/Vercel SPA layout detected — include src,api,lib; api→Application; db clients→Persistence.');
      } else if (looksLikeMonorepo && (rec?.mature || includeRoots.length > 0 || tsPackages.length > 0)) {
        // Mature multi-package / nested-TS trees must NOT get a thin src/** starter (0 files).
        // UI-heavy TS packages (Remotion/Vite) prefer ui-surface patterns when recommend says so.
        const useUi =
          rec?.preset === 'feature-sliced' ||
          rec?.archetype === 'frontend-surface' ||
          (nestedTsPackages.length > 0 && includeRoots.length === 0 && !rec?.mature);
        initArgs.push('--preset', useUi && nestedTsPackages.length <= 3 ? 'ui-surface' : 'monorepo');
        const shown = includeRoots.length > 0 ? includeRoots : nestedTsPackages;
        console.log(
          shown.length > 0
            ? `  Multi-package / TS package layout detected — profile include: ${shown.join(', ')}.`
            : '  Multi-package layout detected — using monorepo profile.'
        );
      } else if (preset) {
        // Prefer recommended preset even on mature single-package trees (avoid vacuum hexagonal).
        initArgs.push('--preset', preset);
      }
      const status = runArkCheck(initArgs, { cwd: root });
      if (status !== 0) return status;
    } else {
      console.log('  Found an existing ark.config.json — keeping it.');
    }

    // 4) Compact start deliberately avoids reports/history and copied skills. A report can
    // be requested later, after the small host-specific setup is accepted.
    console.log('');
    console.log('Skipping day-zero report archive in compact start (run ark-check --report later if wanted).');

    // 5) Agent + CI gate templates for exactly one active host.
    console.log('');
    console.log('Installing agent and CI gate templates…');
    {
      const gateArgs = ['--root', root, '--install-agent-gates', '--compact'];
      if (args.tools) gateArgs.push('--tools', args.tools);
      if (args.requireWriteHook) {
        gateArgs.push('--require-write-hook', args.requireWriteHook);
      }
      if (args.force) gateArgs.push('--force');
      const status = runArkCheck(gateArgs, { cwd: root });
      if (status !== 0) return status;
    }

    // 6) Show the plan: what's safe to auto-fix vs what needs a decision.
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

    // 7) Plain-language wrap-up — one next step, status light only.
    // Modes are detected (Suggest/Adapt/Enforce), not user-picked settings.
    // Soft-block false-green using the same doctor adoption gap (no second detector).
    let falseGreenGap = null;
    try {
      const doc = JSON.parse(doctorCapture.stdout || '{}');
      falseGreenGap = (doc.doctor?.adoption?.gaps ?? []).find(
        (g) => g?.id === FALSE_GREEN_GAP_ID
      );
    } catch {
      falseGreenGap = null;
    }
    if (falseGreenGap && mode === 'enforce') {
      mode = 'adapt';
      planOk = false;
    }

    console.log('');
    if (falseGreenGap) {
      console.log('Done — status: ADAPT (contract may be a false green — do not stop at a clean plan).');
      console.log('What happens now:');
      console.log(`  • ${falseGreenGap.message}`);
      console.log(`  • Next: ${falseGreenGap.fix}`);
    } else if (mode === 'enforce' && planOk) {
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
    console.log(`  1. Status: ${arkCommand(root, 'arkgate-check', '--doctor')} — do primary next action #1`);
    if (falseGreenGap) {
      console.log('  2. Session 0 in your agent:  /ark-adopt — fix the architecture config first');
      console.log('     → reclassify I/O dirs out of Application; leftover design later via /ark-explore then /ark-autopilot.');
    } else {
      console.log('  2. Session 0 in your agent:  /ark-adopt');
      console.log('     → mark the path (greenfield or brownfield). Day-to-day new files: /ark-place.');
    }
    console.log(`  3. After edits:    ${arkCommand(root, 'arkgate-check', '--root . --config ark.config.json --strict-merge')}`);
    if (mode === 'adapt' && planOk && !falseGreenGap) {
      console.log(
        `  4. When green but cores still optional: ${arkCommand(root, 'arkgate-check', '--ratchet-cores')} → honest ENFORCE`
      );
    }
    console.log('');
    console.log('Optional later: leftover design → /ark-explore then /ark-autopilot; bump → arkgate upgrade.');
    return 0;
  } finally {
    rl?.close();
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (args.version) {
    console.log(cliVersion());
    return 0;
  }
  if (args.help && (args.command === 'upgrade' || args.command === 'update')) {
    console.log(upgradeUsage());
    return 0;
  }
  if (args.help || !args.command) {
    console.log(args.all ? setupUsageAll() : setupUsage());
    return 0;
  }

  if (args.requireWriteHook && !['start', 'init'].includes(args.command)) {
    console.error('--require-write-hook is supported by ark start and ark init.');
    return 2;
  }
  if (
    args.command !== 'preflight' &&
    (args.changes || args.changeMap || args.manifest || args.tsconfig ||
      args.config !== 'ark.config.json')
  ) {
    console.error(
      '--changes, --change-map, --config, --manifest, and --tsconfig are supported by ark preflight.'
    );
    return 2;
  }
  const enforcement = validateHardWriteRequest({
    root: args.root,
    host: args.requireWriteHook,
    tools: args.tools,
    force: args.force,
  });
  if (!enforcement.ok) {
    console.error(enforcement.error);
    return 2;
  }
  if (enforcement.host) {
    args.requireWriteHook = enforcement.host;
    if (!args.tools) args.tools = enforcement.tools.join(',');
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
      return runUpgradeCommand(args, {
        arkCheck,
        packageInstallArgv,
        runArkCheck,
        cliVersion: cliVersion(),
        rawArgv: process.argv.slice(2),
        shouldSkipArkgateInstall,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  if (args.command === 'preflight') {
    try {
      if (!args.changes) throw new Error('ark preflight requires --changes <change-set.json>.');
      const configPath = path.isAbsolute(args.config)
        ? args.config
        : path.join(args.root, args.config);
      const config = loadArkConfigContract(
        JSON.parse(fs.readFileSync(configPath, 'utf8')),
        configPath
      ).config;
      const changeMap = args.changeMap ? readChangeMapFile(args.root, args.changeMap) : undefined;
      const manifestPath = args.manifest
        ? path.resolve(args.root, args.manifest)
        : undefined;
      const manifest = manifestPath ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : undefined;
      const loadedTypeScript = await loadTypeScript(args.root);
      const result = prepareChangeFromRoot({
        root: args.root,
        config,
        configSource: configPath,
        changes: readChangeSetFile(args.root, args.changes),
        ts: loadedTypeScript.ts ?? undefined,
        tsconfig: args.tsconfig,
        manifest,
        ...(changeMap ? { changeMap: changeMap.input, changeMapSource: changeMap.source } : {}),
      });
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else renderChangePreflight(result);
      return result.valid ? 0 : 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  if (args.command === 'status') {
    return runStatusCommand({
      root: args.root,
      config: args.config,
      json: args.json,
      expectedRoot: args.expectedRoot,
      expectedProjectId: args.expectedProjectId,
      host: args.tools,
      arkgateVersion: cliVersion(),
      vs: args.vs,
    });
  }

  if (args.command === 'agents-md' || args.command === 'agent-projection') {
    return runAgentProjectionCommand({
      root: args.root,
      config: args.config,
      json: args.json,
      write: args.write,
      apply: args.apply,
      check: args.check,
      stdout: args.stdout,
      host: args.tools,
      arkgateVersion: cliVersion(),
    });
  }

  console.error(`Unknown command: ${args.command}`);
  console.error(setupUsage());
  return 2;
}

// Only run when executed as the CLI entry (not when imported by unit tests).
function entryPath(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}

const isMain = Boolean(process.argv[1]) && entryPath(process.argv[1]) === entryPath(fileURLToPath(import.meta.url));
if (isMain) {
  process.exitCode = await main();
}
