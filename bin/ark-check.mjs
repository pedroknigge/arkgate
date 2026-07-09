#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
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
  collectForbiddenGlobalUses,
  ADOPTION_PLAN_FILENAME,
  buildArchitectureRecommendation,
  createElevenLayerConfig,
  enrichViolationWithFixClass,
  listPolicyPackIds,
  loadPolicyPackMeta,
  writeAdoptionPlan,
  classifyRemediation,
  detectPackageManager,
  detectWorkspaces,
  detectTsPackageRoots,
  resolveIncludeRoots,
  execCommandParts,
  execRunner,
  formatArchitectureRecommendationHuman,
  globToRegExp,
  installDevHint,
  isScanExcludedRelative,
  presentLockfiles,
  layerForFile,
  looksLikeIntent,
  patternSpecificity,
  resolveIntentLayer,
  resolveOperatingMode,
  shouldShowNewHereNudge,
  usableTypescript,
  typescriptUsabilityHint,
} from './ark-shared.mjs';

import {
  runInstallAgentGates,
  runMigrateCommands,
  loadTypeScript,
  collectAdoptionGaps,
  detectSkillGaps,
  detectCodexHomeGap,
  missingGates,
  staleRunnerGateFiles,
  brokenMcpGateFiles,
  readJson,
  readPackageJson,
  hasCheckArchitectureScript,
  hasArkWorkflow,
  checkArchitectureScriptSnippet,
  arkCheckCommand,
  arkPackageVersion,
  agentInstructions,
  packageManager,
  REQUIRED_GATE_FILES,
  codexPromptsDir,
} from './lib/agent-gates.mjs';
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
import {
  computeCoverage,
  runCoverage,
  runPlan,
  runDoctor,
  buildRemediationPlan,
} from './lib/doctor-plan.mjs';
import {
  baselineKey,
  readBaseline,
  summarizeViolations,
  violationEdge,
  writeBaseline,
  printViolation,
  printViolationBreakdown,
  CONCENTRATION_MIN_VIOLATIONS,
} from './lib/violations.mjs';
import {
  buildUnclassifiedSuggestions,
  suggestLayerForDir,
  suggestLayerForPath,
  detectBestFitModel,
  dirSegmentsFromGlob,
} from './lib/suggestions.mjs';
import {
  ARCHITECTURE_PRESETS,
  CANONICAL_LAYER_NAMES,
  denyUpward,
  presetWithOverlays,
  FRAMEWORK_INTERNAL_EXCLUDE,
} from './lib/presets.mjs';


function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    config: 'ark.config.json',
    manifest: undefined,
    printConfig: undefined,
    tsconfig: undefined,
    json: false,
    strictConfig: false,
    requireGates: false,
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
    version: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--strict-config') args.strictConfig = true;
    else if (arg === '--require-gates') args.requireGates = true;
    else if (arg === '--init') args.init = true;
    else if (arg === '--preset') args.preset = argv[++i];
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
    else if (arg === '--apply-policy-pack') args.applyPolicyPack = argv[++i];
    else if (arg === '--suggest-include') args.suggestInclude = true;
    else if (arg === '--adopt-contract') args.adoptContract = true;
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
    else if (arg === '--baseline' || arg === '--update-baseline') {
      if (arg === '--update-baseline') args.updateBaseline = true;
      // optional path value: consume the next arg only when it isn't another flag
      const next = argv[i + 1];
      args.baseline = next && !next.startsWith('-') ? argv[++i] : '.ark-baseline.json';
    }
    else if (arg === '--root') args.root = path.resolve(argv[++i]);
    else if (arg === '--config') args.config = argv[++i];
    else if (arg === '--manifest') args.manifest = argv[++i];
    else if (arg === '--print-config') args.printConfig = argv[++i];
    else if (arg === '--tsconfig') args.tsconfig = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--version' || arg === '-V') args.version = true;
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
    '       ark-check --root <project> --config <ark.config.json> [--manifest <ark.manifest.json>] [--tsconfig <tsconfig.json>] [--strict-config] [--require-gates] [--json] [--baseline [file]] [--report [file.html]] [--no-cache]',
    '       ark-check --coverage [--json]          per-layer file counts + full unclassified list (report only, exit 0)',
    '       ark-check --plan [--json]              classified remediation plan (mechanical-safe / judgment / deferred) + goal; report only',
    '       ark-check --recommend [--json] [--write-plan]  application-shape plan; --write-plan emits ark-adoption-plan.json',
    '       ark-check --list-policy-packs            enthusiast preset configs (hexagonal, layered, feature-sliced, monorepo, ui-surface)',
    '       ark-check --apply-policy-pack <id> [--force]  write ark.config.json from templates/policy-packs/ (uses preset factory)',
    '       ark-check --suggest-include [--json]   propose include roots (TS packages / workspaces)',
    '       ark-check --adopt-contract [--write]   expand include + UI patterns from ungoverned dirs (contract adopt)',
    '       ark-check --watch                      re-run the check when governed files change (debounced)',
    '       ark-check --report [file.html] [--beginner] [--reset-origin] [--no-archive]',
    '           HTML report + snapshots under .ark/reports/ (origin once, latest each run, history JSON)',
    '       ark-check --init [--preset hexagonal|layered|feature-sliced|monorepo] [--force]',
    '       ark-check --install-agent-gates [--tools claude,cursor,codex,grok] [--skills-only] [--codex-home] [--force]',
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
    '',
    '--require-gates fails the check when AGENTS.md, .mcp.json, or the generated CI',
    'workflow is missing, so "installed but never configured" is a red CI. Combine it',
    'with --strict-config to enforce gate presence and architecture in one run.',
    '',
    '--install-agent-gates writes AGENTS.md, .mcp.json, and the CI workflow for every',
    'project, plus tool-specific templates. Known tools: claude, cursor, codex, grok',
    '(full MCP/hook gates) and windsurf, cline, copilot, kiro, roo, continue, gemini',
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
    'claude+cursor+codex are written when nothing is detected.',
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
      (directory) => walk(path.join(root, srcDir, directory)).length > 0
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
    const outside = walk(args.root)
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

const SOURCE_FILE_NAME = /\.[cm]?[tj]sx?$/;

/** Unit/e2e test files are not architecture surface — agents and Nest put them next
 *  to production code (*.spec.ts). Counting them as ungoverned forces false
 *  CONFIG_UNCLASSIFIED_FILES under --strict-config on every starter. */
const TEST_FILE_NAME =
  /\.(spec|test)\.(tsx?|jsx?|mts|cts)$/i;

function isGovernableSourceFile(name) {
  return SOURCE_FILE_NAME.test(name) && !name.endsWith('.d.ts') && !TEST_FILE_NAME.test(name);
}

function isSkippedSourceDir(name) {
  return (
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'coverage' ||
    name === '__tests__' ||
    name === '__mocks__' ||
    name === 'e2e' ||
    // Top-level style Nest/Jest folders (not "testing" helpers inside src)
    name === 'test' ||
    name === 'tests'
  );
}

function walk(dir, files = []) {
  const stat = fs.statSync(dir, { throwIfNoEntry: false });
  if (!stat) return files;
  // An `include` entry may be a single file (e.g. a root-level "middleware.ts"),
  // not just a directory — govern it directly instead of trying to scandir it
  // (which threw ENOTDIR). The extension filter still applies.
  if (stat.isFile()) {
    if (isGovernableSourceFile(path.basename(dir))) files.push(dir);
    return files;
  }
  if (!stat.isDirectory()) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isSkippedSourceDir(entry.name)) continue;
      walk(full, files);
    } else if (isGovernableSourceFile(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Walk include roots then drop codegen / config.exclude (universal scan filter). */
function collectGovernedFiles(root, config) {
  const raw = (config.include ?? []).flatMap((entry) => walk(path.join(root, entry)));
  return raw.filter((abs) => {
    const rel = normalize(path.relative(root, abs));
    return !isScanExcludedRelative(rel, config);
  });
}

function normalize(value) {
  return value.split(path.sep).join('/');
}

function intentLayersFromManifest(manifest) {
  const layers = manifest?.architecture?.layers;
  if (!Array.isArray(layers)) return undefined;
  return layers
    .filter((layer) => Array.isArray(layer.prefixes) && layer.prefixes.length > 0)
    .map((layer) => ({ name: layer.name, prefixes: layer.prefixes }));
}

function layerForIntent(intent, layers, manifestIntentLayers) {
  // Use only layers that declare intent prefixes; fall back to the built-in defaults when
  // none do (mirrors the write-gate). resolveIntentLayer applies the library's exact
  // longest-prefix + trailing-dot semantics so CI and the MCP gate classify identically.
  const configured =
    manifestIntentLayers ??
    layers
      .filter((layer) => (layer.intentPrefixes ?? []).length > 0)
      .map((layer) => ({ name: layer.name, prefixes: layer.intentPrefixes }));
  const source =
    configured.length > 0
      ? configured
      : DEFAULT_INTENT_PREFIXES.map((entry) => ({ name: entry.layer, prefixes: entry.prefixes }));
  return resolveIntentLayer(intent, source);
}

function isBlocked(rules, from, to) {
  return rules.find((rule) => !rule.allowed && rule.from === from && rule.to === to);
}

function configWarning(ruleId, message, extra = {}) {
  return { ruleId, message, ...extra };
}

function collectConfigWarnings(root, config, files, rules, manifest) {
  const warnings = [];
  const layers = Array.isArray(config.layers) ? config.layers : [];
  const manifestLayers = Array.isArray(manifest?.architecture?.layers)
    ? manifest.architecture.layers
    : [];
  const knownLayers = new Set([
    ...layers.map((layer) => layer.name).filter(Boolean),
    ...manifestLayers.map((layer) => layer.name).filter(Boolean),
  ]);

  if (layers.length === 0) {
    warnings.push(
      configWarning(
        'CONFIG_NO_LAYERS',
        'No file layers are configured; ark-check cannot classify files for import-boundary enforcement.'
      )
    );
  }

  const seenLayers = new Set();
  const duplicateLayers = new Set();
  for (const layer of layers) {
    if (!layer.name) {
      warnings.push(
        configWarning('CONFIG_LAYER_WITHOUT_NAME', 'A configured layer is missing a name.')
      );
      continue;
    }
    if (seenLayers.has(layer.name)) duplicateLayers.add(layer.name);
    seenLayers.add(layer.name);

    if (
      layer.forbiddenGlobals !== undefined &&
      (!Array.isArray(layer.forbiddenGlobals) ||
        layer.forbiddenGlobals.some((entry) => typeof entry !== 'string'))
    ) {
      warnings.push(
        configWarning(
          'CONFIG_INVALID_FORBIDDEN_GLOBALS',
          `Layer "${layer.name}" has an invalid forbiddenGlobals value; expected an array of strings (e.g. ["fetch", "Date.now"]). The entry is ignored.`,
          { layer: layer.name }
        )
      );
    }

    const patterns = Array.isArray(layer.patterns) ? layer.patterns : [];
    if (patterns.length === 0) {
      warnings.push(
        configWarning(
          'CONFIG_LAYER_WITHOUT_PATTERNS',
          `Layer "${layer.name}" has no file patterns and will never classify files.`,
          { layer: layer.name }
        )
      );
      continue;
    }

    for (const pattern of patterns) {
      let re;
      try {
        re = globToRegExp(pattern);
      } catch (err) {
        warnings.push(
          configWarning(
            'CONFIG_INVALID_LAYER_PATTERN',
            `Layer "${layer.name}" has an invalid pattern "${pattern}": ${
              err instanceof Error ? err.message : String(err)
            }`,
            { layer: layer.name, pattern }
          )
        );
        continue;
      }

      const matched = files.some((file) => {
        const rel = normalize(path.relative(root, file));
        return re.test(rel);
      });
      if (!matched && !layer.optional) {
        // Advisory only under --strict-config: monorepo/Next presets ship many optional-looking
        // globs (e.g. src/layouts/**, app/**) that never match when include is ["frontend"].
        // Failing the release gate on dead preset globs caused false CI red while architecture
        // edges were clean (deer-flow host validation). Real safety is import violations +
        // CONFIG_UNCLASSIFIED_FILES / invalid patterns.
        warnings.push(
          configWarning(
            'CONFIG_LAYER_PATTERN_NO_MATCHES',
            `Layer "${layer.name}" pattern "${pattern}" matched no included files.`,
            { layer: layer.name, pattern, failsStrict: false }
          )
        );
      }
    }
  }

  for (const name of duplicateLayers) {
    warnings.push(
      configWarning(
        'CONFIG_DUPLICATE_LAYER',
        `Layer "${name}" is configured more than once.`,
        { layer: name }
      )
    );
  }

  if (knownLayers.size > 0) {
    for (const rule of rules ?? []) {
      if (rule.from && !knownLayers.has(rule.from)) {
        warnings.push(
          configWarning(
            'CONFIG_RULE_UNKNOWN_FROM_LAYER',
            `Rule references unknown source layer "${rule.from}".`,
            { fromLayer: rule.from, toLayer: rule.to }
          )
        );
      }
      if (rule.to && !knownLayers.has(rule.to)) {
        warnings.push(
          configWarning(
            'CONFIG_RULE_UNKNOWN_TO_LAYER',
            `Rule references unknown target layer "${rule.to}".`,
            { fromLayer: rule.from, toLayer: rule.to }
          )
        );
      }
    }
  }

  // Ambiguous overlap: a file matched by two different layers at the SAME top specificity.
  // layerForFile breaks the tie by declaration order, but the config is genuinely undecided
  // (unlike a facade split, where the surface pattern is strictly more specific and wins
  // cleanly). Surface the layer pairs so the author disambiguates instead of relying on order.
  const ambiguousPairs = new Set();
  if (layers.length > 1) {
    for (const file of files) {
      const rel = normalize(path.relative(root, file));
      let topScore = -1;
      let topLayers = [];
      for (const layer of layers) {
        for (const pattern of layer.patterns ?? []) {
          if (!globToRegExp(pattern).test(rel)) continue;
          const score = patternSpecificity(pattern);
          if (score > topScore) {
            topScore = score;
            topLayers = [layer.name];
          } else if (score === topScore && !topLayers.includes(layer.name)) {
            topLayers.push(layer.name);
          }
        }
      }
      if (topLayers.length > 1) {
        ambiguousPairs.add([...topLayers].sort().join(' + '));
      }
    }
  }
  if (ambiguousPairs.size > 0) {
    warnings.push(
      configWarning(
        'CONFIG_AMBIGUOUS_LAYERS',
        `Some files match multiple layers at equal specificity; classification falls back to declaration order. Disambiguate the overlapping patterns: ${[...ambiguousPairs].join(', ')}.`,
        { pairs: [...ambiguousPairs] }
      )
    );
  }

  const unclassified = files.filter((file) => !layerForFile(root, file, layers));
  if (unclassified.length > 0) {
    warnings.push(
      configWarning(
        'CONFIG_UNCLASSIFIED_FILES',
        `${unclassified.length} included source file(s) are not matched by any configured layer; ark-check will not enforce import rules for those source files.`,
        {
          count: unclassified.length,
          samples: unclassified.slice(0, 5).map((file) => normalize(path.relative(root, file))),
        }
      )
    );
  }

  return warnings;
}

function createModuleResolutionHost(ts) {
  const sys = ts?.sys;
  const fileExists = (f) => {
    if (sys?.fileExists) return sys.fileExists(f);
    return fs.existsSync(f);
  };
  const readFile = (f) => {
    if (sys?.readFile) return sys.readFile(f);
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return undefined;
    }
  };
  const directoryExists = (d) => {
    if (sys?.directoryExists) return sys.directoryExists(d);
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  };
  return {
    fileExists,
    readFile,
    directoryExists,
    getCurrentDirectory: () =>
      sys?.getCurrentDirectory ? sys.getCurrentDirectory() : process.cwd(),
    getDirectories: (d) => {
      if (sys?.getDirectories) return sys.getDirectories(d);
      try {
        return fs
          .readdirSync(d, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        return [];
      }
    },
    realpath: sys?.realpath ? (p) => sys.realpath(p) : undefined,
    useCaseSensitiveFileNames: sys?.useCaseSensitiveFileNames ?? true,
  };
}

function parseTsconfig(ts, configPath) {
  const host = createModuleResolutionHost(ts);
  const read = ts.readConfigFile(configPath, host.readFile);
  if (read.error) return {};
  // parseJsonConfigFileContent wants a ParseConfigHost-like object; our resolution host
  // is enough for option extraction.
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    {
      useCaseSensitiveFileNames: host.useCaseSensitiveFileNames,
      readDirectory: ts.sys?.readDirectory
        ? (...args) => ts.sys.readDirectory(...args)
        : () => [],
      fileExists: host.fileExists,
      readFile: host.readFile,
    },
    path.dirname(configPath)
  );
  return parsed.options;
}

/**
 * Compiler options for a given source file. With --tsconfig every file uses that one
 * config; otherwise each file uses the NEAREST tsconfig.json above it (like tsc does),
 * so monorepo packages with per-package path aliases resolve correctly under one --root.
 */
function createCompilerOptionsLookup(ts, root, tsconfigArg) {
  if (tsconfigArg) {
    const configPath = path.isAbsolute(tsconfigArg) ? tsconfigArg : path.join(root, tsconfigArg);
    const options = fs.existsSync(configPath) ? parseTsconfig(ts, configPath) : {};
    return () => options;
  }
  const byDir = new Map();
  const byConfig = new Map();
  return (file) => {
    const dir = path.dirname(file);
    if (byDir.has(dir)) return byDir.get(dir);
    const configPath = ts.findConfigFile(dir, ts.sys.fileExists, 'tsconfig.json');
    let options = {};
    if (configPath) {
      if (!byConfig.has(configPath)) byConfig.set(configPath, parseTsconfig(ts, configPath));
      options = byConfig.get(configPath);
    }
    byDir.set(dir, options);
    return options;
  };
}

/**
 * Per-file scan cache. A cache entry stores the parsed file's content-derived results:
 * content violations (forbidden globals, publish checks, intent references) and the list
 * of module-edge specifiers. Edges are NEVER cached as violations — they are re-resolved
 * against the live filesystem every run, because resolution depends on files and tsconfigs
 * outside the cached file. The whole cache is keyed by the config+manifest contents, so
 * any rule change invalidates everything.
 */
function scanCachePath(root) {
  return path.join(root, 'node_modules', '.cache', 'ark-check.json');
}

function scanCacheKey(root, args) {
  const read = (p) => {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return '';
    }
  };
  const configPath = path.isAbsolute(args.config) ? args.config : path.join(root, args.config);
  const manifestPath = args.manifest
    ? path.isAbsolute(args.manifest)
      ? args.manifest
      : path.join(root, args.manifest)
    : undefined;
  // Bump this schema tag whenever the cached scan shape changes, so a warm cache from an
  // older Ark can't feed stale entries to new logic. v2: typeOnly on edges. v3: per-file
  // exportsOnlyTypes (target-module type-only export detection for plan classifier).
  return crypto
    .createHash('sha1')
    .update(`ark-check-cache-v3\0${read(configPath)}\0${manifestPath ? read(manifestPath) : ''}`)
    .digest('hex');
}

function loadScanCache(root, key) {
  try {
    const data = JSON.parse(fs.readFileSync(scanCachePath(root), 'utf8'));
    return data.key === key && data.files && typeof data.files === 'object' ? data.files : undefined;
  } catch {
    return undefined;
  }
}

function saveScanCache(root, key, files) {
  try {
    const target = scanCachePath(root);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ key, files }));
  } catch {
    // cache is best-effort: read-only filesystems just re-parse every run
  }
}

/**
 * Fallback resolver for extensionless relative imports whose on-disk target uses an
 * extension `ts.resolveModuleName` won't resolve without a matching tsconfig
 * (notably `.mts`/`.cts`). Mirrors the classic candidate list.
 */
function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveRelativeFallback(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base, // only used when the specifier already carries an extension (isFile filters dirs)
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.mts'),
    path.join(base, 'index.cts'),
  ];
  // isFile (not existsSync) so a directory named like the specifier never shadows the
  // real module file — e.g. `./foo` must not resolve to a `foo/` directory before `foo.mts`.
  return candidates.find(isFile);
}

/**
 * Resolve any import specifier (relative, tsconfig path-alias, or package) to a source
 * file using TypeScript's module resolver, returning the resolved file (or undefined for
 * unresolved / declaration-only targets).
 *
 * ark-check governs one project rooted at --root. A resolved target is skipped when its
 * path RELATIVE TO ROOT either escapes the root (leading `..`) or contains a `node_modules`
 * segment. Using the root-relative path (not an absolute substring) means a project that
 * itself lives under a node_modules segment is still governed, while a broad catch-all
 * pattern (`**`) can't false-flag vendored deps or files outside the project. Monorepos can
 * run under a single --root (per-package tsconfigs are honored via the nearest-tsconfig
 * lookup); edges that resolve outside the root are still skipped.
 */
function resolveImport(ts, specifier, containingFile, options, host, root) {
  const res = ts.resolveModuleName(specifier, containingFile, options, host);
  let file = res.resolvedModule?.resolvedFileName;
  if (!file && specifier.startsWith('.')) {
    file = resolveRelativeFallback(containingFile, specifier);
  }
  if (!file) return undefined;
  if (file.endsWith('.d.ts')) return undefined;
  const abs = path.resolve(file);
  const segments = path.relative(root, abs).split(path.sep);
  if (segments[0] === '..' || segments.includes('node_modules')) return undefined;
  return abs;
}

function lineOf(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function textOfModuleSpecifier(node) {
  return node.moduleSpecifier && typeof node.moduleSpecifier.text === 'string'
    ? node.moduleSpecifier.text
    : undefined;
}

// True when an import/export edge carries ONLY types (`import type …`, or a named import
// where every binding is `type`-qualified). Type-only edges are erased at compile time —
// they create no runtime coupling, only a design/type-placement dependency — so callers can
// rank them below real value imports in a burn-down. A side-effect import (`import "x"`) or
// any default/namespace/value binding is NOT type-only.
function isTypeOnlyModuleReference(ts, node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false; // side-effect import — runtime edge
    if (clause.isTypeOnly) return true; // `import type …`
    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named) && named.elements.length > 0) {
      return named.elements.every((element) => element.isTypeOnly);
    }
    return false; // default or namespace binding of a value
  }
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    const clause = node.exportClause;
    if (clause && ts.isNamedExports(clause) && clause.elements.length > 0) {
      return clause.elements.every((element) => element.isTypeOnly);
    }
    return false;
  }
  return false;
}

/**
 * True when a module is a pure type-surface file: only type/interface exports and
 * type-only imports. Conservative false (→ judgment) when:
 * - any top-level runtime statement (value decls, expression stmts, side-effect imports)
 * - ambiguous `export { X }` without type keyword, export *, default/export=
 * Used so static value-syntax `import { T }` of a pure-type module can be mechanical-safe
 * (convert to `import type`). Never trust this for require()/import() edges.
 */
function sourceFileExportsOnlyTypes(ts, sourceFile) {
  let sawTypeExport = false;
  const hasExportModifier = (node) =>
    Array.isArray(node.modifiers) &&
    node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const stmt of sourceFile.statements) {
    // Type-only imports OK; value or side-effect imports mean runtime load of deps.
    if (ts.isImportDeclaration(stmt)) {
      if (!isTypeOnlyModuleReference(ts, stmt)) return false;
      continue;
    }
    if (typeof ts.isImportEqualsDeclaration === 'function' && ts.isImportEqualsDeclaration(stmt)) {
      return false;
    }
    if (ts.isExportDeclaration(stmt)) {
      if (stmt.isTypeOnly) {
        sawTypeExport = true;
        continue;
      }
      // export * from '…' can re-export values — not provably type-only.
      if (!stmt.exportClause) return false;
      if (ts.isNamespaceExport(stmt.exportClause)) return false;
      if (ts.isNamedExports(stmt.exportClause)) {
        if (stmt.exportClause.elements.length === 0) return false;
        for (const el of stmt.exportClause.elements) {
          if (!el.isTypeOnly) return false; // bare `export { X }` — ambiguous without checker
        }
        sawTypeExport = true;
        continue;
      }
      return false;
    }
    if (ts.isExportAssignment(stmt)) return false; // export = / export default expr
    if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) {
      if (hasExportModifier(stmt)) sawTypeExport = true;
      continue;
    }
    // Any other top-level statement (const/fn/class/enum, console.log, if, …) is runtime.
    return false;
  }
  return sawTypeExport;
}

function propertyName(ts, node) {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

function objectProperty(ts, node, name) {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  return node.properties.find((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return false;
    }
    return propertyName(ts, property.name) === name;
  });
}

function objectHasProperty(ts, node, name) {
  return objectProperty(ts, node, name) !== undefined;
}

function objectPropertyValue(ts, node, name) {
  const property = objectProperty(ts, node, name);
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined;
}

function objectHasMetadataSource(ts, node) {
  const metadata = objectPropertyValue(ts, node, 'metadata');
  return objectHasProperty(ts, metadata, 'source');
}

function stringLiteralText(ts, node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function isPublishCall(ts, node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === 'publish';
  }
  return ts.isIdentifier(expression) && expression.text === 'publish';
}

function looksLikeIntentCreatorExpression(ts, node) {
  if (!node) return false;
  if (ts.isIdentifier(node)) {
    return /^[A-Z]/.test(node.text);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return looksLikeIntentCreatorExpression(ts, node.name);
  }
  return false;
}

function isArkPublishCandidate(ts, node) {
  if (!ts.isCallExpression(node)) return false;
  const firstArg = node.arguments[0];
  const rawIntent = stringLiteralText(ts, firstArg);
  return (
    (rawIntent !== undefined && looksLikeIntent(rawIntent)) ||
    objectHasProperty(ts, firstArg, 'intent') ||
    looksLikeIntentCreatorExpression(ts, firstArg)
  );
}

function publishSourceLiteral(ts, node) {
  if (!ts.isCallExpression(node)) return undefined;
  const [firstArg, secondArg, thirdArg] = node.arguments;
  const rawMetadata = objectPropertyValue(ts, firstArg, 'metadata');
  return (
    stringLiteralText(ts, objectPropertyValue(ts, rawMetadata, 'source')) ??
    stringLiteralText(ts, objectPropertyValue(ts, secondArg, 'source')) ??
    stringLiteralText(ts, objectPropertyValue(ts, thirdArg, 'source'))
  );
}

function publishHasSource(ts, node) {
  if (!ts.isCallExpression(node)) return false;
  const [firstArg, secondArg, thirdArg] = node.arguments;
  return (
    objectHasMetadataSource(ts, firstArg) ||
    objectHasProperty(ts, secondArg, 'source') ||
    objectHasProperty(ts, thirdArg, 'source')
  );
}
const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const color = {
  red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

function detectCycles(graph) {
  let index = 0;
  const indices = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];

  // ponytail: recursive Tarjan; make it iterative only if a real repo blows the stack.
  const strongconnect = (v) => {
    indices.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of [...(graph.get(v) ?? [])].sort()) {
      if (!graph.has(w)) continue;
      if (!indices.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) components.push(comp.sort());
    }
  };

  for (const v of [...graph.keys()].sort()) {
    if (!indices.has(v)) strongconnect(v);
  }

  return components
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((members) => ({
      ruleId: 'CIRCULAR_DEPENDENCY',
      file: members[0],
      line: 1,
      target: members.join(' → '),
      message: `Circular dependency among ${members.length} files: ${members.join(' → ')} → ${members[0]}.`,
      // Graph is value/runtime edges only (type-only imports omitted).
      cycleKind: 'value',
    }));
}


function moduleSpecifierFromCall(ts, node) {
  if (!ts.isCallExpression(node)) return undefined;

  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const first = node.arguments[0];
    const value = stringLiteralText(ts, first);
    return value ? { value, kind: 'dynamic-import' } : undefined;
  }

  if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
    const first = node.arguments[0];
    const value = stringLiteralText(ts, first);
    return value ? { value, kind: 'require' } : undefined;
  }

  return undefined;
}

// --coverage: a standalone visibility report (never changes the exit code). Answers
// "which files does each layer actually govern, and what is slipping through?" — the
// data the /ark-coverage skill otherwise has to hand-roll with find/readdir walks.
// Pure coverage computation (glob-only, no TypeScript): the object both `--coverage` and
// `--doctor` render. `governed` is the headline honesty number — the share of in-scope code
// Ark actually enforces rules on; `suggestions` proposes a layer for each ungoverned dir.

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

  if (args.requireGates) {
    const missing = missingGates(args.root);
    if (missing.length > 0) {
      const payload = {
        ok: false,
        error: 'missing-gates',
        missing,
      };
      if (args.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.error('Ark gates are not installed. Missing:');
        for (const relativePath of missing) {
          console.error(`  - ${relativePath}`);
        }
        console.error(`\nRun \`${arkCommand(args.root, 'ark', 'init')}\` (or \`ark-check --install-agent-gates\`) to configure enforcement.`);
      }
      process.exitCode = 1;
      return;
    }
    // Gates present. This is a precondition, not a standalone report: stay quiet
    // in --json mode so the architecture check below owns the single JSON output.
    // When --require-gates is the only intent (no config/architecture run needed),
    // callers still get a clear signal from the exit code and the human-mode line.
    if (!args.json) {
      console.log('Ark gates present: ' + REQUIRED_GATE_FILES.join(', '));
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

  const manifestIntentLayers = intentLayersFromManifest(manifest);
  const compilerOptionsFor = createCompilerOptionsLookup(ts, root, args.tsconfig);
  const moduleHost = createModuleResolutionHost(ts);

  const violations = [];
  const warnings = collectConfigWarnings(root, config, files, rules, manifest);
  const cacheKey = args.noCache ? undefined : scanCacheKey(root, args);
  const cachedFiles = cacheKey ? loadScanCache(root, cacheKey) : undefined;
  const nextCacheFiles = {};

  // Parses one file and returns its cacheable scan result: violations derived purely from
  // the file's content (+config/manifest, hashed into the cache key) and the module-edge
  // specifiers found, which the driver loop below resolves fresh on every run.
  function scanSourceFile(file, sourceLayer) {
    const source = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const violations = [];
    const edges = [];

    const layerConfig = config.layers.find((layer) => layer.name === sourceLayer);
    const forbiddenGlobals = Array.isArray(layerConfig?.forbiddenGlobals)
      ? layerConfig.forbiddenGlobals.filter((entry) => typeof entry === 'string')
      : [];
    for (const use of collectForbiddenGlobalUses(ts, sourceFile, forbiddenGlobals)) {
      violations.push({
        ruleId: 'FORBIDDEN_GLOBAL',
        file: normalize(path.relative(root, file)),
        line: lineOf(sourceFile, use.node.getStart(sourceFile)),
        fromLayer: sourceLayer,
        target: use.name,
        message: `${sourceLayer} must not use the ambient global "${use.name}".`,
      });
    }

    const checkModuleEdge = (specifier, node, kind, typeOnly = false) => {
      edges.push({ specifier, line: lineOf(sourceFile, node.getStart(sourceFile)), kind, typeOnly });
    };

    const visit = (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = textOfModuleSpecifier(node);
        if (specifier) {
          checkModuleEdge(
            specifier,
            node,
            ts.isImportDeclaration(node) ? 'import' : 'export',
            isTypeOnlyModuleReference(ts, node)
          );
        }
      }

      if (ts.isCallExpression(node)) {
        const moduleCall = moduleSpecifierFromCall(ts, node);
        if (moduleCall) {
          checkModuleEdge(moduleCall.value, node, moduleCall.kind);
        }

        if (isPublishCall(ts, node)) {
          const firstArg = node.arguments[0];
          const rawIntent = stringLiteralText(ts, firstArg);
          if (
            (rawIntent && looksLikeIntent(rawIntent)) ||
            objectHasProperty(ts, firstArg, 'intent')
          ) {
            violations.push({
              ruleId: 'RAW_EVENT_PUBLISH',
              file: normalize(path.relative(root, file)),
              line: lineOf(sourceFile, node.getStart(sourceFile)),
              message:
                'Publish through a registered intent creator; raw event objects or intent strings bypass Ark contracts and tooling.',
            });
          }

          if (isArkPublishCandidate(ts, node) && !publishHasSource(ts, node)) {
            violations.push({
              ruleId: 'PUBLISH_MISSING_SOURCE',
              file: normalize(path.relative(root, file)),
              line: lineOf(sourceFile, node.getStart(sourceFile)),
              fromLayer: sourceLayer,
              message: 'Strict Ark publish calls must include metadata.source.',
            });
          }

          const sourceIntent = publishSourceLiteral(ts, node);
          if (sourceIntent && looksLikeIntent(sourceIntent)) {
            const sourceIntentLayer = layerForIntent(
              sourceIntent,
              config.layers,
              manifestIntentLayers
            );
            if (sourceIntentLayer && sourceIntentLayer !== sourceLayer) {
              violations.push({
                ruleId: 'PUBLISH_SOURCE_LAYER_MISMATCH',
                file: normalize(path.relative(root, file)),
                line: lineOf(sourceFile, node.getStart(sourceFile)),
                fromLayer: sourceLayer,
                toLayer: sourceIntentLayer,
                target: sourceIntent,
                message:
                  `Publish source "${sourceIntent}" resolves to ${sourceIntentLayer}, but the publishing file is classified as ${sourceLayer}.`,
              });
            }
          }
        }
      }

      if (ts.isStringLiteralLike(node) && looksLikeIntent(node.text)) {
        const targetLayer = layerForIntent(node.text, config.layers, manifestIntentLayers);
        const rule = targetLayer ? isBlocked(rules, sourceLayer, targetLayer) : undefined;
        if (rule) {
          violations.push({
            ruleId: 'LAYER_INTENT_REFERENCE_VIOLATION',
            file: normalize(path.relative(root, file)),
            line: lineOf(sourceFile, node.getStart(sourceFile)),
            fromLayer: sourceLayer,
            toLayer: targetLayer,
            target: node.text,
            message:
              rule.message ??
              `${sourceLayer} must not reference ${targetLayer} intent ${node.text}.`,
          });
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return {
      contentViolations: violations,
      edges,
      exportsOnlyTypes: sourceFileExportsOnlyTypes(ts, sourceFile),
    };
  }

  // Pass 1: scan every governed file into nextCacheFiles (needs complete map before
  // targetTypeOnlyExports can be resolved for import edges).
  const importGraph = new Map();
  const scanned = []; // { file, sourceLayer, relFile, entry }
  for (const file of files) {
    const sourceLayer = layerForFile(root, file, config.layers);
    if (!sourceLayer) continue;
    const relFile = normalize(path.relative(root, file));
    if (!importGraph.has(relFile)) importGraph.set(relFile, new Set());
    const stat = fs.statSync(file);
    const fileKey = `${stat.mtimeMs}:${stat.size}`;
    const cached = cachedFiles?.[relFile];
    const entry =
      cached && cached.fileKey === fileKey
        ? cached
        : { fileKey, ...scanSourceFile(file, sourceLayer) };
    nextCacheFiles[relFile] = entry;
    scanned.push({ file, sourceLayer, relFile, entry });
  }

  // Pass 2: content violations + layer edges (with target type-export surface).
  for (const { file, sourceLayer, relFile, entry } of scanned) {
    violations.push(...entry.contentViolations);
    for (const edge of entry.edges) {
      const target = resolveImport(ts, edge.specifier, file, compilerOptionsFor(file), moduleHost, root);
      const targetLayer = target ? layerForFile(root, target, config.layers) : undefined;
      if (target && targetLayer) {
        const relTarget = normalize(path.relative(root, target));
        // Cycle graph is runtime coupling only. Type-only imports are erased by TS and
        // must not form CIRCULAR_DEPENDENCY (e.g. codegen `import type` back-edges).
        if (relTarget !== relFile && !edge.typeOnly) {
          importGraph.get(relFile).add(relTarget);
        }
      }
      const rule = targetLayer ? isBlocked(rules, sourceLayer, targetLayer) : undefined;
      if (rule) {
        const relTarget = normalize(path.relative(root, target));
        // After pass 1 every in-scope target is in nextCacheFiles. Missing → not type-only.
        // targetTypeOnlyExports only for static import/export declarations — never require()
        // or dynamic import(), which always load the module at runtime (side effects matter).
        const targetCached = nextCacheFiles[relTarget];
        const staticEdge = edge.kind === 'import' || edge.kind === 'export';
        const targetTypeOnlyExports =
          staticEdge && Boolean(targetCached?.exportsOnlyTypes) && !edge.typeOnly;
        // Importer is itself a pure type-surface file (no runtime body) — enables
        // pure-type-file-relocate classification when the edge is type-only.
        const sourcePureTypeModule = Boolean(entry.exportsOnlyTypes);
        violations.push({
          ruleId: 'LAYER_IMPORT_VIOLATION',
          file: relFile,
          line: edge.line,
          fromLayer: sourceLayer,
          toLayer: targetLayer,
          target: relTarget,
          ...(edge.typeOnly ? { typeOnly: true } : {}),
          ...(targetTypeOnlyExports ? { targetTypeOnlyExports: true } : {}),
          ...(sourcePureTypeModule ? { sourcePureTypeModule: true } : {}),
          ...(edge.kind ? { edgeKind: edge.kind } : {}),
          message: rule.message ?? `${sourceLayer} must not ${edge.kind} ${targetLayer}.`,
        });
      }
    }
  }

  if (cacheKey) saveScanCache(root, cacheKey, nextCacheFiles);

  // cyclePolicy: strict (default) | soft (advisory only, never fails --strict-config) | off
  const cyclePolicy = String(config.cyclePolicy || 'strict').toLowerCase();
  if (cyclePolicy !== 'off') {
    const cycles = detectCycles(importGraph);
    if (cyclePolicy === 'soft' || cyclePolicy === 'framework-soft') {
      for (const c of cycles) {
        // failsStrict: false — soft cycles must NOT trip --strict-config / check:architecture.
        // Only CONFIG_* (and similar) warnings fail under --strict-config.
        warnings.push({
          ruleId: 'CIRCULAR_DEPENDENCY',
          message: `${c.message} (soft cycle policy — advisory only; set cyclePolicy: "strict" to fail the check)`,
          file: c.file,
          target: c.target,
          failsStrict: false,
        });
      }
    } else {
      violations.push(...cycles);
    }
  }

  if (args.doctor) {
    runDoctor(root, config, files, rules, violations, args.json, {
      configPath: path.isAbsolute(args.config) ? args.config : path.join(root, args.config),
      configMissing: !fs.existsSync(path.isAbsolute(args.config) ? args.config : path.join(root, args.config)),
    });
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
    const { fullPath, count } = writeBaseline(root, args.baseline, violations);
    console.log(`Wrote ${fullPath} with ${count} frozen violation key(s).`);
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
      suppressed = violations.filter((violation) => baseline.keys.has(baselineKey(violation)));
      activeViolations = violations.filter(
        (violation) => !baseline.keys.has(baselineKey(violation))
      );
      const currentKeys = new Set(violations.map(baselineKey));
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
  }

  if (args.json) {
    console.log(JSON.stringify({
      ok,
      violations: activeViolations.map(enrichViolationWithFixClass),
      suppressedViolations: suppressed.length,
      staleBaselineKeys,
      warnings,
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
      console.log(
        color.dim(
          `/ark-* skills in ${codexPromptsDir()} are behind this Ark (${parts.join(', ')}). ` +
            `Codex loads them from there, not the repo. Refresh: ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --codex-home --force')}`
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

  for (const entry of config.include ?? []) {
    const target = path.join(args.root, entry);
    if (!fs.existsSync(target)) continue;
    try {
      fs.watch(target, { recursive: true }, rerun);
    } catch {
      fs.watch(target, rerun);
    }
  }

  console.log(color.dim('Watching governed paths for changes… (Ctrl+C to stop)'));
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
