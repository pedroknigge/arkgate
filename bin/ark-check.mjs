#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __arkCheckCli = fileURLToPath(import.meta.url);

import {
  DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_RULES,
  applyFrameworkLayoutOverlays,
  arkCommand,
  ADOPTION_PLAN_FILENAME,
  buildArchitectureRecommendation,
  createElevenLayerConfig,
  enrichViolationWithFixClass,
  listPolicyPackIds,
  loadPolicyPackMeta,
  writeAdoptionPlan,
  detectWorkspaces,
  detectTsPackageRoots,
  resolveIncludeRoots,
  formatArchitectureRecommendationHuman,
  installDevHint,
  layerForFile,
} from './ark-shared.mjs';

import {
  runInstallAgentGates,
  loadTypeScript,
  detectSkillGaps,
  detectCodexHomeGap,
  detectActiveAgentHost,
  missingGates,
  staleRunnerGateFiles,
  brokenMcpGateFiles,
  readJson,
  hasCheckArchitectureScript,
  checkArchitectureScriptSnippet,
  arkCheckCommand,
  arkPackageVersion,
  REQUIRED_GATE_FILES,
  codexPromptsDir,
  detectWritePathCapabilities,
} from './lib/agent-gates.mjs';
import { syncBaselineIntoCheckSurfaces } from './lib/field-install.mjs';
import {
  detectEnforcement,
  renderHtmlReport,
  renderBeginnerHtmlReport,
  archiveReportSnapshots,
  buildReportSnapshot,
  computeReportFitness,
  reportsDir,
  readJsonSafe,
} from './lib/html-report.mjs';
import { shouldOpenHtmlReport, openHtmlInBrowser } from './lib/open-html.mjs';
import {
  computeCoverage,
  runCoverage,
  runPlan,
  runDoctor,
} from './lib/doctor-plan.mjs';
import { runRatchetCores } from './lib/core-ratchet.mjs';
import {
  baselineKey,
  baselineOccurrenceKeys,
  readBaseline,
  summarizeViolations,
  writeBaseline,
  printViolation,
  printViolationBreakdown,
  CONCENTRATION_MIN_VIOLATIONS,
} from './lib/violations.mjs';
import {
  suggestLayerForDir,
  detectBestFitModel,
  dirSegmentsFromGlob,
} from './lib/suggestions.mjs';
import {
  ARCHITECTURE_PRESETS,
} from './lib/presets.mjs';

import {
  collectGovernedFiles,
  normalize,
  walk,
} from './lib/scan-files.mjs';
import {
  configWarning,
} from './lib/config-warnings.mjs';
import { runArchitectureScan } from './lib/architecture-scan.mjs';
import { validateHardWriteRequest } from './lib/enforcement-profiles.mjs';
import {
  isStructrailInvocation,
  resolveConfigIdentity,
} from './lib/product-identity.mjs';


function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    config: undefined,
    configExplicit: false,
    manifest: undefined,
    printConfig: undefined,
    tsconfig: undefined,
    json: false,
    strictConfig: false,
    requireGates: false,
    requireWriteHook: undefined,
    init: false,
    installAgentGates: false,
    tools: undefined,
    force: false,
    skillsOnly: false,
    baseline: undefined,
    updateBaseline: false,
    noCache: false,
    coverage: false,
    migrateCommands: false,
    doctor: false,
    plan: false,
    recommend: false,
    writePlan: false,
    listPolicyPacks: false,
    applyPolicyPack: undefined,
    watch: false,
    beginner: false,
    openReport: false,
    noOpenReport: false,
    version: false,
    help: false,
  };
  const requireValue = (flag, index) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`Missing value for ${flag}. Run ark-check --help for usage.`);
    }
    return value;
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--strict' || arg === '--strict-merge') {
      args.strictConfig = true;
      args.requireGates = true;
    }
    else if (arg === '--strict-config') args.strictConfig = true;
    else if (arg === '--require-gates') args.requireGates = true;
    else if (arg === '--require-write-hook') {
      args.requireWriteHook = requireValue(arg, i++).trim().toLowerCase();
    }
    else if (arg === '--init') args.init = true;
    else if (arg === '--preset') args.preset = requireValue(arg, i++);
    else if (arg === '--install-agent-gates') args.installAgentGates = true;
    else if (arg === '--tools') {
      // Consume the next arg only when it isn't another flag (same rule as --baseline),
      // so `--tools --force` can't silently eat --force as a "tool name".
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        i += 1;
        args.tools = next
          .split(',')
          .map((tool) => tool.trim().toLowerCase())
          .filter(Boolean);
      } else {
        args.tools = []; // flag without a value — rejected in runInstallAgentGates
      }
    }
    else if (arg === '--force') args.force = true;
    else if (arg === '--skills-only') args.skillsOnly = true;
    else if (arg === '--coverage') args.coverage = true;
    else if (arg === '--doctor') args.doctor = true;
    else if (arg === '--plan') args.plan = true;
    else if (arg === '--recommend') args.recommend = true;
    else if (arg === '--write-plan') args.writePlan = true;
    else if (arg === '--list-policy-packs') args.listPolicyPacks = true;
    else if (arg === '--apply-policy-pack') args.applyPolicyPack = requireValue(arg, i++);
    else if (arg === '--suggest-include') args.suggestInclude = true;
    else if (arg === '--adopt-contract') args.adoptContract = true;
    else if (arg === '--ratchet-cores') args.ratchetCores = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--watch') args.watch = true;
    else if (arg === '--beginner') args.beginner = true;
    else if (arg === '--codex-home') args.codexHome = true;
    else if (arg === '--migrate-commands') args.migrateCommands = true;
    else if (arg === '--no-cache') args.noCache = true;
    else if (arg === '--report') {
      const next = argv[i + 1];
      args.report = next && !next.startsWith('-') ? argv[++i] : 'ark-report.html';
    }
    else if (arg === '--reset-origin') args.resetOrigin = true;
    else if (arg === '--no-archive') args.noArchive = true;
    else if (arg === '--open') args.openReport = true;
    else if (arg === '--no-open') args.noOpenReport = true;
    else if (arg === '--baseline' || arg === '--update-baseline') {
      if (arg === '--update-baseline') args.updateBaseline = true;
      // optional path value: consume the next arg only when it isn't another flag
      const next = argv[i + 1];
      args.baseline = next && !next.startsWith('-') ? argv[++i] : '.ark-baseline.json';
    }
    else if (arg === '--root') args.root = path.resolve(requireValue(arg, i++));
    else if (arg === '--config') {
      args.config = requireValue(arg, i++);
      args.configExplicit = true;
    }
    else if (arg === '--manifest') args.manifest = requireValue(arg, i++);
    else if (arg === '--print-config') args.printConfig = requireValue(arg, i++);
    else if (arg === '--tsconfig') args.tsconfig = requireValue(arg, i++);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--version' || arg === '-V') args.version = true;
    else throw new Error(`Unknown argument: ${arg}. Run ark-check --help for usage.`);
  }
  return args;
}

/** Path shown to humans: project-relative when inside root, absolute otherwise (no `../../..`). */
function displayPathFromRoot(root, absPath) {
  const rel = path.relative(root, absPath);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return absPath;
  }
  return rel.split(path.sep).join('/');
}

function usage() {
  return [
    'Usage: arkgate-check | ark-check  (identical bins; product name ArkGate)',
    '       ark-check --version',
    '       ark-check --root <project> --config <ark.config.json> [--manifest <ark.manifest.json>] [--tsconfig <tsconfig.json>] [--strict-merge | --strict | --strict-config] [--require-gates] [--require-write-hook <host>] [--json] [--baseline [file]] [--report [file.html]] [--no-cache]',
    '       ark-check --coverage [--json]          per-layer file counts + full unclassified list (report only, exit 0)',
    '       ark-check --plan [--json]              classified remediation plan (mechanical-safe / judgment / deferred) + goal; report only',
    '       ark-check --recommend [--json] [--write-plan]  application-shape plan; --write-plan emits ark-adoption-plan.json',
    '       ark-check --list-policy-packs            enthusiast packs (hexagonal, layered, feature-sliced, monorepo, ui-surface, vertical-slice, ddd-bounded-contexts)',
    '       ark-check --apply-policy-pack <id> [--force]  write ark.config.json from templates/policy-packs/ (uses preset factory)',
    '       ark-check --suggest-include [--json]   propose include roots (TS packages / workspaces)',
    '       ark-check --adopt-contract [--write]   expand include + UI patterns from ungoverned dirs (contract adopt)',
    '       ark-check --ratchet-cores              when raw graph is green (0 violations; baseline ignored), set optional:false on populated cores only (writes ark.config.json)',
    '       ark-check --watch                      re-run the check when governed files change (debounced)',
    '       ark-check --report [file.html] [--beginner] [--reset-origin] [--no-archive] [--open|--no-open]',
    '           HTML report + snapshots under .ark/reports/ (origin once, latest each run, history JSON)',
    '           Best-effort open in browser (local TTY). No-op if open fails. --no-open / ARK_NO_OPEN_REPORT=1 to skip; --open forces open.',
    '       ark-check --init [--preset hexagonal|layered|feature-sliced|monorepo|ui-surface|vertical-slice|ddd-bounded-contexts|clean-architecture|onion-architecture] [--force]',
    '       ark-check --install-agent-gates [--tools claude,cursor,codex,grok] [--require-write-hook <host>] [--skills-only] [--codex-home] [--force]',
    '       ark-check --update-baseline [file]     freeze current violations (default .ark-baseline.json)',
    '       ark-check --print-config eleven-layer',
    '',
    'Adopting Ark in an existing codebase? Run --update-baseline once to freeze existing',
    'violations, commit the baseline file, and gate CI with --baseline: only NEW violations',
    'fail the check, so the ratchet only moves toward zero.',
    '',
    '--init scans the project for the built-in layer directory conventions (src/domain,',
    'src/application, src/adapters/persistence, ...) and writes an ark.config.json covering',
    'only the layers that actually exist, with the default rules filtered to those layers.',
    'Undetected profile layers are printed as suggestions with their conventional',
    'directories. When nothing is detected, the full 11-layer starter profile is written',
    'instead (all layers optional, anchored at src/), so the strict check passes today and',
    'each layer starts being enforced as soon as its directory gains source files.',
    '',
    'Resolves relative, tsconfig path-alias, and package imports via the TypeScript',
    'module resolver, then checks each resolved cross-layer import against the rules.',
    'Path aliases resolve against the NEAREST tsconfig.json above each source file, so',
    'monorepo packages with per-package configs work under a single --root. Pass',
    '--tsconfig to force one config for every file. If no tsconfig is found, path',
    'aliases are unavailable but relative/package imports still resolve.',
    '',
    'Parsed files are cached in node_modules/.cache/ark-check.json (keyed by mtime+size',
    'and the config/manifest contents); import edges are always re-resolved against the',
    'live filesystem, so the cache can never hide a new violation. --no-cache disables it.',
    '',
    'Config shape:',
    '{',
    '  "include": ["src"],',
    '  // optional: "exclude": ["**/vendor/**"], "excludeGenerated": false  (default skips *.gen.ts / *.generated.ts)',
    '  "layers": [',
    '    { "name": "DomainModel", "patterns": ["src/domain/**"], "intentPrefixes": ["Domain."],',
    '      "forbiddenGlobals": ["fetch", "process", "Date.now", "Math.random"] }',
    '  ],',
    '  "rules": [{ "from": "DomainModel", "to": "PersistenceAdapters", "allowed": false }]',
    '}',
    '',
    'Config warnings are advisory by default and are included in JSON output.',
    'Use --strict-config to make config warnings fail the check.',
    'Use --strict-merge for the fail-closed CI profile: --strict-config + --require-gates',
    'plus the security diagnostics surfaced by doctor. --strict is a compatibility alias.',
    'This merge profile never depends on an editor/agent hook.',
    'Add --require-write-hook claude|grok to validate a hard local write boundary for that',
    'specific host. Cursor and Codex expose advisory MCP tools plus the shared CI check;',
    'merge blocking requires repository policy to make that status required.',
    '',
    '--require-gates fails the check when AGENTS.md, .mcp.json, or the generated CI',
    'workflow is missing, so "installed but never configured" is a red CI. Combine it',
    'with --strict-config to enforce gate presence and architecture in one run.',
    '',
    '--install-agent-gates writes AGENTS.md, .mcp.json, and the CI workflow for every',
    'project, plus tool-specific templates. Known tools: claude, cursor, codex, grok',
    '(Claude/Grok hard-write hooks; Cursor/Codex advisory MCP; shared CI check for all) and',
    'windsurf, cline, copilot, kiro, roo, continue, gemini',
    '(instruction-tier rule files derived from the same contract).',
    'It also installs the /ark-* skills shipped in templates/skills/ into each',
    'detected tool\'s command location (.claude/skills/, .cursor/commands/,',
    '.codex/prompts/, .grok/skills/, .windsurf/workflows/, .clinerules/workflows/,',
    '.github/prompts/).',
    'Kiro, Roo, Continue, and Gemini have no command mechanism and receive only their',
    'rule file. Existing files are never overwritten without --force, so re-running',
    'after an update only adds what is missing. --skills-only restricts the write to',
    'just the /ark-* skills (safe to --force-refresh — it leaves a customized AGENTS.md,',
    'settings, and CI workflow untouched).',
    'Pass --tools to pick which tool configs to write; otherwise they are auto-detected',
    'from their config directories (.claude/, .cursor/, .codex/, .grok/, .windsurf/,',
    '.clinerules/, .kiro/, .roo/, .continue/, .gemini/; copilot is explicit-only).',
    'claude+cursor+codex+grok are written when nothing is detected.',
    '',
    'Generate a starter 11-layer config:',
    '  ark-check --print-config eleven-layer > ark.config.json',
    '',
    'Install agent + CI enforcement templates:',
    '  ark-check --install-agent-gates',
  ].join('\n');
}

function readConfig(root, configPath) {
  const fullPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(root, configPath);
  if (!fs.existsSync(fullPath)) {
    return {
      include: ['src'],
      layers: [],
      rules: DEFAULT_RULES,
    };
  }
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return {
    include: raw.include ?? ['src'],
    layers: raw.layers ?? [],
    rules: raw.rules ?? DEFAULT_RULES,
    ...(raw.exclude ? { exclude: raw.exclude } : {}),
    ...(raw.excludeGenerated !== undefined ? { excludeGenerated: raw.excludeGenerated } : {}),
    ...(raw.cyclePolicy ? { cyclePolicy: raw.cyclePolicy } : {}),
    ...(raw.dynamicImportAllowlist
      ? { dynamicImportAllowlist: raw.dynamicImportAllowlist }
      : {}),
    ...(raw.safety ? { safety: raw.safety } : {}),
  };
}

/**
 * Infer an ark.config.json from the directories that actually exist in the project,
 * using the same layer→directory conventions as the eleven-layer template. A directory
 * only counts when it contains at least one source file, so an empty scaffold dir can't
 * produce a layer whose pattern matches nothing (which --strict-config would fail).
 */
function detectConfig(root) {
  const srcDir = fs.existsSync(path.join(root, 'src')) ? 'src' : '.';
  const layers = [];

  for (const entry of DEFAULT_INTENT_PREFIXES) {
    const directories = (DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? []).filter(
      (directory) => walk(path.join(root, srcDir, directory), [], { root }).length > 0
    );
    if (directories.length === 0) continue;
    layers.push({
      name: entry.layer,
      patterns: directories.map((directory) => `${normalize(path.join(srcDir, directory))}/**`),
      intentPrefixes: entry.prefixes,
      ...(entry.layer === 'DomainModel'
        ? { forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS }
        : {}),
    });
  }

  const names = new Set(layers.map((layer) => layer.name));
  const rules = DEFAULT_RULES.filter((rule) => names.has(rule.from) && names.has(rule.to));

  return { srcDir, config: { include: [srcDir], layers, rules } };
}

/** Top-level directories under srcDir not covered by any detected layer pattern. */
function uncoveredDirectories(root, srcDir, layers) {
  const base = path.join(root, srcDir);
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        entry.name !== 'dist' &&
        !entry.name.startsWith('.')
    )
    .map((entry) => entry.name)
    .filter((name) => {
      const prefix = `${normalize(path.join(srcDir, name))}/`;
      return !layers.some((layer) =>
        layer.patterns.some((pattern) => pattern.startsWith(prefix))
      );
    });
}

// detectWorkspaces: shared implementation in ark-shared.mjs (npm/pnpm/rush/lerna +
// conventional multi-package roots).

// Deny every "upward" edge for an ordered layer list (index 0 = outermost/top,
// which may import everything below it). Inner/lower layers must not import outer
// ones — the shared shape behind linear layered and feature-sliced layouts.

function proposeForUncovered(root, srcDir, layers) {
  const proposals = [];
  for (const top of uncoveredDirectories(root, srcDir, layers)) {
    const direct = suggestLayerForDir(top);
    if (direct) {
      proposals.push({ dir: `${srcDir}/${top}`, ...direct });
      continue;
    }
    let children = [];
    try {
      children = fs
        .readdirSync(path.join(root, srcDir, top), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.'))
        .map((e) => e.name);
    } catch {
      /* not a readable directory — treat as unrecognized below */
    }
    if (children.length > 0) {
      // Descend: propose per child so a mixed `lib/` yields lib/repositories → Persistence
      // AND flags lib/db as unrecognized, instead of dropping the parts Ark can't place.
      for (const child of children) {
        const hit = suggestLayerForDir(child);
        proposals.push(
          hit
            ? { dir: `${srcDir}/${top}/${child}`, ...hit }
            : { dir: `${srcDir}/${top}/${child}`, unrecognized: true }
        );
      }
    } else {
      proposals.push({ dir: `${srcDir}/${top}`, unrecognized: true });
    }
  }
  return proposals;
}

function printInitNextSteps(root) {
  console.log('');
  console.log('Next steps:');
  console.log(`  1. CI gate:        ${arkCheckCommand(root)}`);
  console.log(`  2. AI write gate:  ${arkCommand(root, 'ark-mcp', '--root . --config ark.config.json')}`);
  console.log('     (bind its validate_code tool to your agent\'s pre-write hook — see README)');
  if (!hasCheckArchitectureScript(root)) {
    console.log('  3. Add the package.json alias if you want `run check:architecture`:');
    console.log(`     ${checkArchitectureScriptSnippet(root)}`);
  }
}

function buildConfigFromPolicyPack(packId, root) {
  const pack = loadPolicyPackMeta(packId);
  const factory = ARCHITECTURE_PRESETS[pack.preset];
  if (!factory) {
    throw new Error(
      `Policy pack "${packId}" references unknown preset "${pack.preset}".`
    );
  }
  const workspaces =
    pack.preset === 'monorepo' || pack.preset === 'ui-surface'
      ? resolveIncludeRoots(root)
      : [];
  const config = factory(workspaces, root);
  if (pack.layerDescriptions) {
    for (const layer of config.layers) {
      const enthusiast = pack.layerDescriptions[layer.name];
      if (enthusiast) layer.description = enthusiast;
    }
  }
  return { pack, config };
}

function runListPolicyPacks(args) {
  const ids = listPolicyPackIds();
  if (args.json) {
    const packs = ids.map((id) => {
      const meta = loadPolicyPackMeta(id);
      return {
        id: meta.id,
        preset: meta.preset,
        variant: meta.variant,
        label: meta.label,
        summary: meta.summary,
        phases: meta.phases,
      };
    });
    console.log(JSON.stringify({ ok: true, packs }, null, 2));
    return;
  }
  console.log('Enthusiast policy packs (apply with --apply-policy-pack <id>):');
  for (const id of ids) {
    const meta = loadPolicyPackMeta(id);
    console.log(`  ${meta.id} — ${meta.label} (preset: ${meta.preset})`);
    if (meta.summary) console.log(`    ${meta.summary}`);
  }
}

function runApplyPolicyPack(args) {
  const configPath = path.isAbsolute(args.config)
    ? args.config
    : path.join(args.root, args.config);

  if (fs.existsSync(configPath) && !args.force) {
    console.error(
      `${configPath} already exists. Re-run with --force to overwrite, or use /ark-contract to evolve it.`
    );
    process.exitCode = 2;
    return;
  }

  try {
    const { pack, config } = buildConfigFromPolicyPack(args.applyPolicyPack, args.root);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            pack: pack.id,
            preset: pack.preset,
            configPath,
            phases: pack.phases,
          },
          null,
          2
        )
      );
    } else {
      console.log(`Wrote ${configPath} (${pack.label})`);
      console.log(`Preset: ${pack.preset}. Phase 1: ${(pack.phases?.['1'] ?? []).join(', ')}`);
      console.log(`Verify: ${arkCommand(args.root, 'ark-check', '--root . --config ark.config.json --strict-config')}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.json) {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      console.error(message);
    }
    process.exitCode = 2;
  }
}

// A repo this size is not greenfield; a "starter" contract needs judgment `ark init` can't apply.
const BROWNFIELD_FILE_THRESHOLD = 150;
// Below this, the starter governs too thin a slice to be the real contract.
const THIN_COVERAGE_PERCENT = 50;

// `ark init` scaffolds a starter contract from conventional directory names (preset wildcards
// or convention detection). On a MATURE repo that pattern breaks down two ways: (1) most code
// lives in directories that don't match DDD names, so the starter governs a thin slice and a
// green check really means "unchecked"; (2) a broad glob like `src/**/domain/**` can swallow
// framework internals (e.g. src/kernel/domain) and fire domain-purity rules on them — 17
// violations that are a contract mismatch, not real debt. Both are exactly what the adoption
// flow (/ark-adopt) exists to resolve with structure-aware judgment. Detect the case and route
// there instead of leaving the user with a thin or false-red gate. Returns true if it warned.
function maybeWarnBrownfield(root, config) {
  let files;
  try {
    files = collectGovernedFiles(root, config);
  } catch {
    return false;
  }
  if (files.length < BROWNFIELD_FILE_THRESHOLD) return false;
  const cov = computeCoverage(root, config, files, config.rules ?? []);
  if (cov.governed.percent >= THIN_COVERAGE_PERCENT) return false;
  console.log('');
  console.log(
    `Heads up — this looks like an existing codebase (${files.length} source files), and this`
  );
  console.log(
    `starter contract governs only ${cov.governed.percent}% of it (${cov.governed.classifiedFiles}/${files.length} files).`
  );
  console.log('`ark init` scaffolds from conventional directory names; on a mature repo that is');
  console.log('usually a thin slice, and a broad domain glob can mis-flag framework internals as');
  console.log('impure domain code (a contract mismatch, not real debt). For a contract aligned to');
  console.log('your actual structure — governing more, with only genuine debt frozen — run adoption:');
  console.log(`  ${arkCommand(root, 'ark-check', '--recommend --write-plan')}   # plan + ark-adoption-plan.json`);
  console.log('  then run /ark-adopt in your agent   # re-scope layers to reality, freeze real debt only');
  console.log(`Inspect what is governed right now: ${arkCommand(root, 'ark-check', '--coverage')}`);
  return true;
}

/** Propose include roots (workspaces + nested TS packages) — contract-adopt primitive. */
function runSuggestInclude(args) {
  const root = args.root;
  const workspaces = detectWorkspaces(root);
  const tsPackages = detectTsPackageRoots(root);
  const include = resolveIncludeRoots(root);
  const payload = {
    ok: true,
    workspaces,
    tsPackages,
    suggestedInclude: include.length > 0 ? include : tsPackages.length > 0 ? tsPackages : ['src'],
    note:
      include.length === 0 && tsPackages.length === 0
        ? 'No TS packages or workspaces found — default suggestion is src/ (create it or pass include by hand).'
        : 'Use these paths as ark.config.json "include". Prefer --adopt-contract --write to expand patterns too.',
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(color.bold('Suggested include roots'));
  console.log(`  workspaces: ${workspaces.join(', ') || '(none)'}`);
  console.log(`  tsPackages: ${tsPackages.join(', ') || '(none)'}`);
  console.log(`  suggestedInclude: ${payload.suggestedInclude.join(', ')}`);
  console.log(color.dim(payload.note));
}

/**
 * Contract-adopt: expand include + presentation patterns from ungoverned proposals.
 * Read-only unless --write. Does not weaken rules or baseline violations.
 */
function runAdoptContract(args) {
  const root = args.root;
  const configPath = path.isAbsolute(args.config)
    ? args.config
    : path.join(root, args.config);
  let config;
  try {
    config = fs.existsSync(configPath)
      ? readConfig(root, args.config)
      : {
          include: ['src'],
          layers: ARCHITECTURE_PRESETS['ui-surface']([], root).layers,
          rules: ARCHITECTURE_PRESETS['ui-surface']([], root).rules,
        };
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }
  const suggestedInclude = resolveIncludeRoots(root);
  const tsPackages = detectTsPackageRoots(root);
  const nextInclude = [
    ...new Set([
      ...(config.include || []),
      ...(suggestedInclude.length > 0 ? suggestedInclude : tsPackages),
    ]),
  ].filter(Boolean);
  const files = collectGovernedFiles(root, { ...config, include: nextInclude.length ? nextInclude : config.include });
  const cov = computeCoverage(root, { ...config, include: nextInclude.length ? nextInclude : config.include }, files, config.rules || []);
  const uiPatterns = [
    '**/components/**',
    '**/hooks/**',
    '**/lib/**',
    '**/routes/**',
    '**/app/**',
    '**/pages/**',
  ];
  const layers = (config.layers || []).map((layer) => {
    if (layer.name !== 'PresentationAdapters') return layer;
    const patterns = [...new Set([...(layer.patterns || []), ...uiPatterns])];
    return { ...layer, patterns };
  });
  // If no PresentationAdapters layer, leave layers as-is (don't invent full profile).
  const proposal = {
    ok: true,
    before: {
      include: config.include || [],
      governedPercent: null,
      totalFiles: null,
    },
    after: {
      include: nextInclude.length > 0 ? nextInclude : config.include,
      presentationPatterns: uiPatterns,
      totalFiles: cov.totalFiles,
      governedPercent: cov.governed.percent,
      unclassified: cov.unclassified.count,
    },
    wrote: false,
  };
  // Compute before coverage for honesty.
  try {
    const beforeFiles = collectGovernedFiles(root, config);
    const beforeCov = computeCoverage(root, config, beforeFiles, config.rules || []);
    proposal.before.totalFiles = beforeCov.totalFiles;
    proposal.before.governedPercent = beforeCov.governed.percent;
  } catch {
    /* ignore */
  }

  if (args.write) {
    const next = {
      ...config,
      include: proposal.after.include,
      layers,
    };
    fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
    proposal.wrote = true;
  }

  if (args.json) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }
  console.log(color.bold('Contract adopt (coverage first)'));
  console.log(
    `  before: include=[${(proposal.before.include || []).join(', ')}] governed=${proposal.before.governedPercent ?? '?'}% files=${proposal.before.totalFiles ?? '?'}`
  );
  console.log(
    `  after:  include=[${(proposal.after.include || []).join(', ')}] governed=${proposal.after.governedPercent}% files=${proposal.after.totalFiles} unclassified=${proposal.after.unclassified}`
  );
  console.log(`  presentation patterns += ${uiPatterns.join(', ')}`);
  if (proposal.wrote) {
    console.log(color.green(`  wrote ${path.relative(root, configPath) || args.config}`));
    console.log(color.dim(`  Next: ${arkCommand(root, 'ark-check', '--coverage')} then --plan`));
  } else {
    console.log(color.dim('  Dry-run only. Re-run with --write to apply (does not weaken rules).'));
  }
  if ((proposal.after.totalFiles ?? 0) === 0) {
    console.log(
      color.yellow(
        '  Empty scope remains — no TS packages found. Point include at your package roots manually.'
      )
    );
    process.exitCode = 1;
  }
}

function runInit(args) {
  const configPath = path.isAbsolute(args.config)
    ? args.config
    : path.join(args.root, args.config);

  if (fs.existsSync(configPath) && !args.force) {
    console.error(`${configPath} already exists. Re-run with --force to overwrite it.`);
    process.exitCode = 2;
    return;
  }

  if (args.preset) {
    const factory = ARCHITECTURE_PRESETS[args.preset];
    if (!factory) {
      console.error(
        `Unknown preset "${args.preset}". Valid presets: ${Object.keys(ARCHITECTURE_PRESETS).join(', ')}.`
      );
      process.exitCode = 2;
      return;
    }
    const finalConfig = factory(
      args.preset === 'monorepo' || args.preset === 'ui-surface'
        ? resolveIncludeRoots(args.root)
        : detectWorkspaces(args.root),
      args.root
    );
    fs.writeFileSync(configPath, `${JSON.stringify(finalConfig, null, 2)}\n`);
    console.log(`Wrote ${configPath} (${args.preset} preset)`);
    if (finalConfig.frameworkOverlay) {
      console.log(
        `Framework layout overlay applied: ${finalConfig.frameworkOverlay} (filename conventions merged into layer globs).`
      );
    }
    console.log('');
    console.log('Layers (every layer optional, so the strict check passes before the directories exist):');
    for (const layer of finalConfig.layers) {
      console.log(`  ${layer.name}: ${layer.patterns.join(', ')}`);
    }
    if (args.preset === 'monorepo') {
      console.log('');
      console.log(`include: ${finalConfig.include.join(', ')} — patterns match by directory name in any`);
      console.log(`package; adjust to your naming, then verify: ${arkCommand(args.root, 'ark-check', '--coverage')}`);
    }
    maybeWarnBrownfield(args.root, finalConfig);
    printInitNextSteps(args.root);
    return;
  }

  const { srcDir, config } = detectConfig(args.root);
  const greenfield = config.layers.length === 0;
  // When no conventional src/ layout is found, a `workspaces` declaration means this is a
  // monorepo — the src/** 11-layer starter would match nothing there, so use the
  // cross-package monorepo profile anchored at the real workspace roots instead.
  const includeRoots = greenfield ? resolveIncludeRoots(args.root) : [];
  const tsPackages = greenfield ? detectTsPackageRoots(args.root) : [];
  // Prefer monorepo/ui when nested TS packages exist without a conventional src layout.
  const mode = !greenfield
    ? 'detected'
    : includeRoots.length > 0 || tsPackages.length > 0
      ? 'monorepo'
      : 'greenfield';
  // Greenfield: anchor the starter profile at src/ (the convention a fresh project will
  // scaffold under) even when src/ doesn't exist yet — the layers are optional, so the
  // check passes today and governance switches on the moment src/domain/ etc. appear.
  // Detected configs also get framework overlays so Nest/Next flat files are classified.
  const finalConfig =
    mode === 'detected'
      ? applyFrameworkLayoutOverlays(config, args.root)
      : mode === 'monorepo'
        ? ARCHITECTURE_PRESETS.monorepo(
            includeRoots.length > 0 ? includeRoots : tsPackages,
            args.root
          )
        : createElevenLayerConfig({
            rootDir: srcDir === '.' ? 'src' : srcDir,
            root: args.root,
          });

  fs.writeFileSync(configPath, `${JSON.stringify(finalConfig, null, 2)}\n`);

  console.log(`Wrote ${configPath}`);
  console.log('');
  if (mode === 'monorepo') {
    const roots = finalConfig.include?.join(', ') || '(none)';
    console.log(`Multi-package / TS package surface detected (include: ${roots}). Generated a`);
    console.log('cross-package profile matching domain/application/presentation/persistence dirs');
    console.log('in any package. Every layer is optional, so the strict check passes now and each');
    console.log('switches on as matching directories gain files. Adjust patterns to your naming:');
    for (const layer of finalConfig.layers) {
      console.log(`  ${layer.name}: ${layer.patterns.join(', ')}`);
    }
    console.log('');
    console.log(`Verify what each layer actually governs: ${arkCommand(args.root, 'ark-check', '--coverage')}`);
  } else if (mode === 'greenfield') {
    console.log('No conventional layer directories found — generated the full 11-layer starter');
    console.log('profile instead. Every layer is marked optional, so the strict check passes now');
    console.log('and each layer starts being enforced as soon as its directory gains source files:');
    for (const layer of finalConfig.layers) {
      console.log(`  ${layer.name}: ${layer.patterns.join(', ')}`);
    }
    // The starter profile only governs src/. Existing source elsewhere would make the
    // gate silently green, so surface it instead of pretending the project is covered.
    const outside = walk(args.root, [], { root: args.root })
      .map((file) => normalize(path.relative(args.root, file)))
      .filter((rel) => !rel.startsWith('src/') && !rel.split('/').some((s) => s.startsWith('.')));
    if (outside.length > 0) {
      console.log('');
      console.log(`WARNING: ${outside.length} source file(s) live outside src/ and are NOT governed`);
      console.log(`by this config (e.g. ${outside.slice(0, 3).join(', ')}).`);
      console.log('Move them under src/, or edit the "include" and layer patterns to match your layout.');
    }
  } else {
    console.log('Detected layers:');
    for (const layer of finalConfig.layers) {
      console.log(`  ${layer.name}: ${layer.patterns.join(', ')}`);
    }
    const detected = new Set(finalConfig.layers.map((layer) => layer.name));
    const suggested = DEFAULT_INTENT_PREFIXES.filter((entry) => !detected.has(entry.layer));
    if (suggested.length > 0) {
      console.log('');
      console.log('Suggested layers from the 11-layer profile (not detected — conventional');
      console.log('directories shown; create one and re-run --init, or add the layer by hand):');
      for (const entry of suggested) {
        const dirs = (DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? [])
          .map((directory) => `${srcDir}/${directory}`)
          .join(', ');
        console.log(`  ${entry.layer}: ${dirs}`);
      }
    }
    const proposals = proposeForUncovered(args.root, srcDir, finalConfig.layers);
    if (proposals.length > 0) {
      const recognized = proposals.filter((p) => !p.unrecognized);
      const unrecognized = proposals.filter((p) => p.unrecognized);
      console.log('');
      console.log('Ungoverned directories — Ark enforces NOTHING here until they are classified.');
      console.log('A green check ignores this code; it is not "clean", it is unchecked.');
      if (recognized.length > 0) {
        console.log('');
        console.log('Proposed layer for each (from the 11-layer profile + presets — apply via /ark-contract):');
        for (const p of recognized) {
          const alt = p.alternatives?.length ? ` (or ${p.alternatives.join(' / ')} — confirm)` : '';
          console.log(`  ${p.dir}/ → ${p.layer}${alt}`);
        }
      }
      if (unrecognized.length > 0) {
        console.log('');
        console.log(`Not recognized — you decide the layer: ${unrecognized.map((p) => p.dir).join(', ')}`);
      }
      const fit = detectBestFitModel(
        [
          ...finalConfig.layers.flatMap((l) => (l.patterns ?? []).map((p) => dirSegmentsFromGlob(p).pop())),
          ...proposals.map((p) => p.dir.split('/').pop()),
        ].filter(Boolean)
      );
      if (fit) {
        console.log('');
        console.log(`Closest starter model: ${fit.name} — \`ark init --preset ${fit.name} --force\` to start from its rule set.`);
      }
    }
  }
  maybeWarnBrownfield(args.root, finalConfig);
  printInitNextSteps(args.root);
}

function readManifest(root, manifestPath) {
  if (!manifestPath) return undefined;
  const fullPath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.join(root, manifestPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Manifest not found: ${fullPath}`);
  }
  return readJson(fullPath);
}

const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const color = {
  red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

async function main() {
  const args = parseArgs(process.argv);
  if (args.version) {
    console.log(arkPackageVersion());
    process.exit(0);
  }
  if (args.help) {
    console.log(usage());
    return;
  }

  const configIdentity = resolveConfigIdentity({
    root: args.root,
    requested: args.config,
    explicit: args.configExplicit,
    primary: isStructrailInvocation(),
  });
  if (configIdentity.error) {
    const payload = {
      ok: false,
      error: configIdentity.error,
      message: configIdentity.message,
      paths: configIdentity.paths,
    };
    if (args.json) console.log(JSON.stringify(payload, null, 2));
    else console.error(configIdentity.message);
    process.exitCode = 2;
    return;
  }
  args.config = configIdentity.config;
  args.identityDeprecations = configIdentity.deprecations;
  if (!args.json) {
    for (const deprecation of args.identityDeprecations) {
      console.error(`warning ${deprecation.code} ${deprecation.message}`);
    }
  }
  if (args.init) {
    runInit(args);
    return;
  }
  if (args.installAgentGates) {
    runInstallAgentGates(args);
    return;
  }
  if (args.printConfig) {
    if (args.printConfig !== 'eleven-layer') {
      console.error(`Unknown config profile: ${args.printConfig}`);
      process.exitCode = 2;
      return;
    }
    console.log(JSON.stringify(createElevenLayerConfig(), null, 2));
    return;
  }

  if (args.listPolicyPacks) {
    runListPolicyPacks(args);
    return;
  }

  if (args.applyPolicyPack) {
    runApplyPolicyPack(args);
    return;
  }

  if (args.suggestInclude) {
    runSuggestInclude(args);
    return;
  }

  if (args.adoptContract) {
    runAdoptContract(args);
    return;
  }

  if (args.recommend) {
    try {
      const recommendation = buildArchitectureRecommendation(args.root);
      let planWritten;
      if (args.writePlan) {
        const result = writeAdoptionPlan(args.root, recommendation);
        planWritten = result.path;
      }
      if (args.json) {
        console.log(
          JSON.stringify(
            {
              ...recommendation,
              ...(planWritten
                ? { adoptionPlanPath: path.relative(args.root, planWritten) || ADOPTION_PLAN_FILENAME }
                : {}),
            },
            null,
            2
          )
        );
      } else {
        console.log(formatArchitectureRecommendationHuman(recommendation));
        if (planWritten) {
          console.log('');
          console.log(`Wrote ${path.relative(args.root, planWritten) || ADOPTION_PLAN_FILENAME}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (args.json) {
        console.log(JSON.stringify({ ok: false, error: message }, null, 2));
      } else {
        console.error(`ark-check --recommend failed: ${message}`);
      }
      process.exitCode = 2;
    }
    return;
  }

  if (args.requireGates || args.requireWriteHook) {
    let writeRequest = null;
    if (args.requireWriteHook) {
      writeRequest = validateHardWriteRequest({
        root: args.root,
        host: args.requireWriteHook,
        tools: [args.requireWriteHook],
        force: true,
      });
      if (!writeRequest.ok) {
        const payload = {
          ok: false,
          error: 'unsupported-enforcement-profile',
          message: writeRequest.error,
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(writeRequest.error);
        process.exitCode = 2;
        return;
      }
    }

    const missing = args.requireGates ? missingGates(args.root) : [];
    if (
      writeRequest?.host &&
      !detectWritePathCapabilities(args.root, writeRequest.host).capabilities['hard-write']
    ) {
      missing.push(`${writeRequest.host} hard-write hook`);
    }
    if (missing.length > 0) {
      const payload = {
        ok: false,
        error: 'missing-gates',
        missing,
        ...(writeRequest?.host ? { writeHost: writeRequest.host } : {}),
      };
      if (args.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.error('Ark gates are not installed. Missing:');
        for (const relativePath of missing) {
          console.error(`  - ${relativePath}`);
        }
        const installArgs = writeRequest?.host
          ? `--install-agent-gates --tools ${writeRequest.host} --require-write-hook ${writeRequest.host}`
          : '--install-agent-gates';
        console.error(
          `\nRun \`${arkCommand(args.root, 'ark', 'init')}\` (or \`${arkCommand(args.root, 'ark-check', installArgs)}\`) to configure enforcement.`
        );
      }
      process.exitCode = 1;
      return;
    }
    // Gates present. This is a precondition, not a standalone report: stay quiet
    // in --json mode so the architecture check below owns the single JSON output.
    // When --require-gates is the only intent (no config/architecture run needed),
    // callers still get a clear signal from the exit code and the human-mode line.
    if (!args.json) {
      if (args.requireGates) {
        console.log('Ark gates present (merge profile): ' + REQUIRED_GATE_FILES.join(', '));
      }
      if (writeRequest?.host) {
        console.log(`Ark hard-write hook present for ${writeRequest.host}.`);
      }
    }
  }

  const root = args.root;
  const config = readConfig(root, args.config);
  const manifest = readManifest(root, args.manifest);
  const rules = manifest?.architecture?.rules ?? config.rules;
  const files = collectGovernedFiles(root, config);

  // --coverage is a pure glob/report view (no TypeScript resolver), so serve it BEFORE the
  // TS import: the report must work — and exit 0 — even when typescript isn't installed.
  if (args.coverage) {
    runCoverage(root, config, files, rules, args.json);
    return;
  }

  // Resolve TypeScript from the project first, then Ark's own install, then bare import.
  // --plan can still run honestly (coverage + empty violations) when TS is missing.
  // Early TypeScript 7 native builds may load but lack a JS `sys` host — we fall back.
  const loaded = await loadTypeScript(root);
  if (!loaded?.ts) {
    if (args.plan) {
      const cov = computeCoverage(root, config, files, rules);
      if (!args.json) {
        console.log(
          color.yellow(
            `TypeScript not found — plan shows coverage honesty only (no import graph). Install with: ${installDevHint(root, 'typescript')} (supported: 5.x–7.x; see docs/typescript-support.md)`
          )
        );
      }
      runPlan(root, [], args.json, cov.governed.percent, cov.governed.totalFiles);
      return;
    }
    console.error(
      `ark-check requires a JS-API TypeScript (5.x–7.x with ts.sys). Install with: ${installDevHint(root, 'typescript')} — see docs/typescript-support.md`
    );
    process.exitCode = 2;
    return;
  }
  const { ts } = loaded;
  if (loaded.fallbackReason && !args.json) {
    console.log(color.yellow(loaded.fallbackReason));
  }
  if (process.env.ARK_DEBUG_TS === '1' && !args.json) {
    console.log(
      color.dim(
        `[ark-check] TypeScript ${loaded.version ?? '?'} via ${loaded.source}` +
          (loaded.fallbackReason ? ' (fallback)' : '')
      )
    );
  }

  const { violations, warnings, safety } = runArchitectureScan({
    root,
    config,
    manifest,
    rules,
    files,
    ts,
    args,
  });

  if (args.doctor) {
    runDoctor(root, config, files, rules, violations, args.json, {
      configPath: path.isAbsolute(args.config) ? args.config : path.join(root, args.config),
      configMissing: !fs.existsSync(path.isAbsolute(args.config) ? args.config : path.join(root, args.config)),
      safety,
    });
    return;
  }

  if (args.ratchetCores) {
    runRatchetCores(root, config, files, rules, violations, args, { displayPathFromRoot });
    return;
  }

  if (args.updateBaseline) {
    const summary = summarizeViolations(violations);
    // Bloquear y avisar: a lopsided freeze buries a likely contract bug as "debt". Refuse it
    // (unless --force), diagnose, and point at the contract fix instead of the baseline.
    if (summary.concentrated && !args.force) {
      console.error(
        `Refusing to freeze ${summary.total} violations: ${Math.round(summary.dominantShare * 100)}% are a single edge (${summary.dominant}).`
      );
      printViolationBreakdown(summary, { toStderr: true });
      console.error('');
      console.error('Freezing this would bury a likely CONTRACT bug as "debt". Fix the contract');
      console.error('first (/ark-contract), then re-run. To freeze anyway: --update-baseline --force.');
      process.exitCode = 2;
      return;
    }
    const baselineName = args.baseline || '.ark-baseline.json';
    const fullBaselinePath = path.isAbsolute(baselineName)
      ? baselineName
      : path.join(root, baselineName);
    // Zero debt: do not leave an empty baseline file (unclear policy — "is ratchet on?").
    // Delete any existing empty/orphan baseline so doctor/CI stay honest.
    if (violations.length === 0) {
      if (fs.existsSync(fullBaselinePath)) {
        fs.unlinkSync(fullBaselinePath);
        console.log(
          `No violations to freeze — removed empty baseline ${fullBaselinePath} (zero debt; no ratchet file needed).`
        );
      } else {
        console.log('No violations to freeze — baseline not written (zero debt).');
      }
      console.log('Gate with: ark-check --root . --config ark.config.json --strict-config');
      return;
    }
    const { fullPath, count } = writeBaseline(root, baselineName, violations);
    console.log(`Wrote ${fullPath} with ${count} frozen violation key(s).`);
    // Keep existing package.json scripts + CI workflows on the ratchet without a
    // full --force reinstall (field log: baseline after start left CI without --baseline).
    const baselineRel = path.isAbsolute(baselineName)
      ? path.relative(root, baselineName).split(path.sep).join('/')
      : String(baselineName).replace(/^\.\/+/, '');
    const sync = syncBaselineIntoCheckSurfaces(root, {
      baselineRel: baselineRel || '.ark-baseline.json',
    });
    if (sync.changed.length > 0) {
      console.log(
        `Synced --baseline into: ${sync.changed.map((c) => c.file).join(', ')}`
      );
    } else {
      console.log(
        'No existing check scripts/workflows needed a --baseline patch (add check:architecture or re-run --install-agent-gates).'
      );
    }
    console.log('Commit it and gate CI with: ark-check --baseline (only NEW violations fail).');
    if (summary.total > 0) printViolationBreakdown(summary);
    return;
  }

  let suppressed = [];
  let activeViolations = violations;
  let staleBaselineKeys = 0;
  if (args.baseline) {
    const baseline = readBaseline(root, args.baseline);
    if (baseline.exists) {
      const occurrenceKeys = baselineOccurrenceKeys(violations);
      suppressed = violations.filter((_, index) => baseline.keys.has(occurrenceKeys[index]));
      activeViolations = violations.filter((_, index) => !baseline.keys.has(occurrenceKeys[index]));
      const currentKeys = new Set(occurrenceKeys);
      staleBaselineKeys = [...baseline.keys].filter((key) => !currentKeys.has(key)).length;
    } else {
      warnings.push(
        configWarning(
          'BASELINE_NOT_FOUND',
          `Baseline file not found: ${baseline.fullPath}. Generate it with: ark-check --update-baseline`
        )
      );
    }
  }

  // Soft/advisory warnings (failsStrict === false) never fail --strict-config.
  const strictWarnings = warnings.filter((w) => w.failsStrict !== false);
  const ok =
    activeViolations.length === 0 && (!args.strictConfig || strictWarnings.length === 0);

  if (args.plan) {
    const cov = computeCoverage(root, config, files, rules);
    runPlan(root, activeViolations, args.json, cov.governed.percent, cov.governed.totalFiles);
    return;
  }

  const skillGaps = detectSkillGaps(root);
  const codexHomeGap = detectCodexHomeGap(root);

  if (args.report) {
    const exampleByLayer = new Map();
    const fileCountByLayer = new Map();
    for (const file of files) {
      const layer = layerForFile(root, file, config.layers);
      if (!layer) continue;
      fileCountByLayer.set(layer, (fileCountByLayer.get(layer) || 0) + 1);
      if (!exampleByLayer.has(layer)) {
        exampleByLayer.set(layer, normalize(path.relative(root, file)));
      }
    }
    const coverage = computeCoverage(root, config, files, rules);
    const enforcementForReport = detectEnforcement(root);
    const fitness = computeReportFitness({
      coverage,
      violations: activeViolations,
      ok,
      enforcement: enforcementForReport,
      config,
    });
    const currentSnapshot = buildReportSnapshot({
      root,
      config,
      coverage,
      violations: activeViolations,
      ok,
      suppressed: suppressed.length,
      version: arkPackageVersion(),
      fileCountByLayer,
      enforcement: enforcementForReport,
      score: fitness.score,
      mode: fitness.mode,
    });
    // Origin is read before archive so the HTML can show "just created" vs deltas.
    const existingOrigin = args.resetOrigin
      ? null
      : readJsonSafe(path.join(reportsDir(root), 'origin.json'));
    const reportPayload = {
      root,
      config,
      exampleByLayer,
      fileCountByLayer,
      coverage,
      violations: activeViolations,
      ok,
      suppressed: suppressed.length,
      version: arkPackageVersion(),
      configPath: args.config,
      generatedAt: new Date().toISOString().slice(0, 10),
      skillGaps,
      originSnapshot: existingOrigin,
      currentSnapshot,
      originJustCreated: !existingOrigin,
    };
    const html = args.beginner
      ? renderBeginnerHtmlReport(reportPayload)
      : renderHtmlReport(reportPayload);
    const reportPath = path.isAbsolute(args.report) ? args.report : path.join(root, args.report);
    fs.writeFileSync(reportPath, html);

    const archive = archiveReportSnapshots(root, {
      html,
      snapshot: currentSnapshot,
      resetOrigin: Boolean(args.resetOrigin),
      noArchive: Boolean(args.noArchive),
    });
    if (!args.json) {
      console.log(`${color.green('✎')} Wrote HTML report: ${displayPathFromRoot(root, reportPath)}`);
      if (archive.createdOrigin) {
        console.log(
          `${color.green('✎')} Origin snapshot saved (first report): ${displayPathFromRoot(root, archive.originJson)}`
        );
        console.log(
          color.dim('  Future reports will show evolution vs this starting point (.ark/reports/).')
        );
      } else {
        console.log(
          color.dim(
            `  Snapshots: .ark/reports/latest.* (origin frozen${args.resetOrigin ? ' — reset this run' : ''})`
          )
        );
      }
      // Nudge .gitignore for loose report files (origin/latest already under .ark/).
      const gitignore = path.join(root, '.gitignore');
      const base = path.basename(reportPath);
      if (!path.isAbsolute(args.report) && fs.existsSync(gitignore)) {
        const ignored = fs
          .readFileSync(gitignore, 'utf8')
          .split('\n')
          .some(
            (line) =>
              line.trim() === base ||
              line.trim() === `/${base}` ||
              line.trim() === args.report ||
              line.trim() === '.ark/' ||
              line.trim() === '.ark'
          );
        if (!ignored) {
          console.log(
            color.dim(`  (generated artifact — prefer .ark/reports/; add "${base}" or ".ark/" to .gitignore)`)
          );
        }
      }
    }

    // Best-effort: open the report in the default browser. If it opens, fine;
    // if not (headless, no GUI, spawn error), do nothing — never fail the check.
    // Skipped in CI / Vitest / ARK_NO_OPEN_REPORT; --open / --no-open override.
    if (
      shouldOpenHtmlReport({
        force: Boolean(args.openReport),
        noOpen: Boolean(args.noOpenReport) || Boolean(args.json),
      })
    ) {
      openHtmlInBrowser(reportPath);
    }
  }

  if (args.json) {
    console.log(JSON.stringify({
      ok,
      violations: activeViolations.map(enrichViolationWithFixClass),
      suppressedViolations: suppressed.length,
      staleBaselineKeys,
      warnings,
      ...(args.identityDeprecations.length > 0
        ? { deprecations: args.identityDeprecations }
        : {}),
      ...(activeViolations.length > 0 ? { summary: summarizeViolations(activeViolations) } : {}),
      ...(skillGaps.length > 0 ? { skillGaps } : {}),
      ...(codexHomeGap ? { codexHomeGap } : {}),
    }, null, 2));
  } else {
    for (const warning of warnings) {
      console.error(`${color.yellow('warning')} ${warning.ruleId} ${warning.message}`);
    }
    for (const violation of activeViolations) {
      printViolation(violation);
    }

    const baselineNote =
      suppressed.length > 0 ? ` (${suppressed.length} suppressed by baseline)` : '';
    if (staleBaselineKeys > 0) {
      console.error(
        color.dim(
          `${staleBaselineKeys} baseline entr(y/ies) no longer occur — tighten the ratchet with: ark-check --update-baseline`
        )
      );
    }
    if (activeViolations.length === 0) {
      const advisoryOnly = warnings.length > 0 && strictWarnings.length === 0;
      if (warnings.length === 0) {
        console.log(`${color.green('✔')} Ark check passed.${baselineNote}`);
      } else if (args.strictConfig && strictWarnings.length > 0) {
        console.error(
          `${color.red('✖')} Ark check failed with ${strictWarnings.length} config warning(s).${baselineNote}`
        );
      } else if (advisoryOnly) {
        console.log(
          `${color.green('✔')} Ark check passed with ${warnings.length} advisory warning(s).${baselineNote}`
        );
      } else {
        console.log(
          `${color.green('✔')} Ark check passed with ${warnings.length} config warning(s).${baselineNote}`
        );
      }
    } else {
      console.error(
        `${color.red('✖')} ${activeViolations.length} violation(s).${baselineNote}`
      );
    }

    // On a large violation set, print the ranked edge breakdown so the wall of failures reads
    // as an ordered burn-down (and flags a concentrated edge as a likely contract bug).
    if (activeViolations.length >= CONCENTRATION_MIN_VIOLATIONS) {
      printViolationBreakdown(summarizeViolations(activeViolations), { toStderr: true });
    }

    if (skillGaps.length > 0) {
      const missingTotal = skillGaps.reduce((sum, gap) => sum + gap.missing, 0);
      const staleTotal = skillGaps.reduce((sum, gap) => sum + gap.stale, 0);
      const tools = skillGaps.map((gap) => gap.tool).join(', ');
      if (missingTotal > 0) {
        console.log(
          color.dim(
            `${missingTotal} /ark-* skill(s) not installed for ${tools} (this Ark version ships them). ` +
              `Install: ${arkCommand(root, 'ark-check', '--install-agent-gates')}`
          )
        );
      }
      if (staleTotal > 0) {
        // Stale skills already exist, so refreshing needs --force. --skills-only
        // scopes the overwrite to the canonical skills, leaving a customized
        // AGENTS.md / settings / CI untouched (a bare --force would clobber them).
        console.log(
          color.dim(
            `${staleTotal} /ark-* skill(s) outdated for ${tools} (this Ark ships newer versions). ` +
              `Refresh: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --force')}`
          )
        );
      }
    }

    const staleRunners = staleRunnerGateFiles(root);
    if (staleRunners.length > 0) {
      console.log(
        color.dim(
          `Ark commands in ${staleRunners.join(', ')} use a runner that doesn't match this repo's ` +
            `package manager. Fix (no clobber): ${arkCommand(root, 'ark-check', '--install-agent-gates --migrate-commands')}`
        )
      );
    }

    const brokenMcp = brokenMcpGateFiles(root);
    if (brokenMcp.length > 0) {
      console.log(
        color.yellow(
          `Broken MCP argv in ${brokenMcp.join(', ')}: more than one of ark-mcp/arkgate-mcp in args ` +
            `(stdio hosts get a double binary name). Fix: ${arkCommand(root, 'ark-check', '--install-agent-gates --migrate-commands')}`
        )
      );
    }

    if (codexHomeGap) {
      const parts = [];
      if (codexHomeGap.missing > 0) parts.push(`${codexHomeGap.missing} missing`);
      if (codexHomeGap.stale > 0) parts.push(`${codexHomeGap.stale} outdated`);
      // Advisory always; when session host is known and not Codex, say so so
      // /ark-upgrade does not chase home prompts as Incomplete.
      const activeHost = detectActiveAgentHost();
      const deferredNote =
        activeHost != null && activeHost !== 'codex'
          ? ' Deferred unless you use Codex — not a blocker for Grok/Claude/Cursor. '
          : ' ';
      console.log(
        color.dim(
          `/ark-* skills in ${codexPromptsDir()} are behind this Ark (${parts.join(', ')}).` +
            deferredNote +
            `Codex loads them from $CODEX_HOME/prompts, not the repo. ` +
            `When using Codex: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --codex-home --force')}`
        )
      );
    }
  }

  if (args.watch) {
    await runWatchMode(args);
    return;
  }

  process.exitCode = ok ? 0 : 1;
}

async function runWatchMode(args) {
  const argv = process.argv.slice(2).filter((token) => token !== '--watch');
  let debounce;
  let polling = false;
  const rerun = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const result = spawnSync(process.execPath, [__arkCheckCli, ...argv], {
        cwd: args.root,
        stdio: 'inherit',
        env: process.env,
      });
      process.exitCode = result.status ?? 1;
    }, 300);
  };

  let config;
  try {
    config = readConfig(args.root, args.config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  const startPollingFallback = (error) => {
    if (polling) return;
    polling = true;
    console.error(
      `warning native recursive watch failed (${error?.code ?? 'unknown'}); ` +
        'falling back to file polling.'
    );
    for (const file of collectGovernedFiles(args.root, config)) {
      fs.watchFile(file, { interval: 250 }, (current, previous) => {
        if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) rerun();
      });
    }
    // The native watcher may fail after the triggering edit. Scan once immediately so the
    // transition to polling cannot swallow that change.
    rerun();
  };

  for (const entry of config.include ?? []) {
    const target = path.join(args.root, entry);
    if (!fs.existsSync(target)) continue;
    try {
      const watcher = fs.watch(target, { recursive: true }, rerun);
      watcher.on('error', (error) => {
        watcher.close();
        startPollingFallback(error);
      });
    } catch (error) {
      startPollingFallback(error);
    }
  }

  console.log(color.dim('Watching governed paths for changes… (Ctrl+C to stop)'));
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
