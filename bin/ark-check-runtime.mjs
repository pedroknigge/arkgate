#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __arkCheckCli = fileURLToPath(new URL('./ark-check.mjs', import.meta.url));

import {
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
  detectCodexRepoSkillGap,
  codexConcernIsActive,
  printSkillAndCodexGapHints,
  missingGates,
  staleRunnerGateFiles,
  brokenMcpGateFiles,
  readJson,
  hasCheckArchitectureScript,
  checkArchitectureScriptSnippet,
  arkCheckCommand,
  arkPackageVersion,
  compactRouterHost,
  REQUIRED_GATE_FILES,
  detectWritePathCapabilities,
} from './lib/agent-gates.mjs';
import { ciNotFailClosed } from './lib/gate-files.mjs';
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
import { computeDoctorAdvisories } from './lib/doctor-advisories.mjs';
import { buildReportDepthPayload } from './lib/html-report-depth.mjs';
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
  detectBestFitModel,
  dirSegmentsFromGlob,
} from './lib/suggestions.mjs';
import {
  ARCHITECTURE_PRESETS,
  APPLICATION_LIB_ORCHESTRATION_PATTERNS,
  COMPOSITION_ROOT_PATH_PATTERNS,
  DOMAIN_PATH_PATTERNS,
  NEXT_API_APPLICATION_PATTERNS,
  PERSISTENCE_PATH_PATTERNS,
  SHARED_KERNEL_PATH_PATTERNS,
  retrofitP0aApiApplicationPatterns,
  withDefaultArkRules,
  writeArkRulesTemplates,
} from './lib/presets.mjs';
import { loadArkConfigContract, parseArkConfigJson } from './lib/config-contract.mjs';
import { checkUsage, checkUsageAll, withSensorsPartialModeHonesty } from './lib/first-run-help.mjs';
import { createAdapterResult } from './lib/adapter-contract.mjs';
import {
  UNGOVERNED_PROBE_CAP,
  collectGovernedFiles,
  countUngovernedSourceFiles,
  normalize,
  walk,
} from './lib/scan-files.mjs';
import { configWarning } from './lib/config-warnings.mjs';
import { runArchitectureScan } from './lib/architecture-scan.mjs';
import {
  ANALYSIS_COMPLETENESS,
  analysisIncompleteStatement,
  emptyAnalysisRefusal,
} from './lib/analysis-completeness.mjs';
import { reportUnavailableAnalysis } from './lib/unavailable-analysis.mjs';
import { validateHardWriteRequest } from './lib/enforcement-profiles.mjs';
import {
  analyzePolicyTransition,
  discoverLocalBaseRef,
  normalizePolicyBaseRef,
} from './lib/policy-delta-io.mjs';
import {
  applyAgainstRatchet,
  bindTeamBaseRefs,
  contractSessionFrom,
  filterChangedGovernedFiles,
  runTeamPreflight,
  ungovernedDumpMessage,
} from './lib/team-parliament-io.mjs';
import { tryResidentDoctor } from './lib/resident-doctor-client.mjs';
import { createDesignDeltaCheck } from './lib/design-delta.mjs';
import {
  isMutatingCliCommand,
  resolveConfigPathWithinRoot,
  resolveEffectiveProjectRoot,
} from './lib/project-root.mjs';
import { demoteArkRuleTeethUnderClassificationFloor } from './lib/rules-under-contract.mjs';
import { parseArgs, resolveDesignDeltaBaseRef } from './lib/check-args.mjs';
import { detectConfig, proposeForUncovered } from './lib/check-config-detect.mjs';
import { runWatchMode } from './lib/check-watch.mjs';

/** Path shown to humans: project-relative when inside root, absolute otherwise (no `../../..`). */
function displayPathFromRoot(root, absPath) {
  const rel = path.relative(root, absPath);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return absPath;
  }
  return rel.split(path.sep).join('/');
}

function readConfig(root, configPath) {
  const fullPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(root, configPath);
  if (!fs.existsSync(fullPath)) {
    return loadArkConfigContract(
      { include: ['src'], layers: [], rules: DEFAULT_RULES },
      fullPath
    ).config;
  }
  return parseArkConfigJson(fs.readFileSync(fullPath, 'utf8'), fullPath).config;
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
  // Contain --config writes under project root (S0 security).
  const contained = resolveConfigPathWithinRoot(args.root, args.config);
  if (!contained.ok) {
    console.error(contained.error);
    process.exitCode = 2;
    return;
  }
  const configPath = contained.configPath;

  if (fs.existsSync(configPath) && !args.force) {
    console.error(
      `${configPath} already exists. Re-run with --force to overwrite, or use /ark-adopt to evolve it.`
    );
    process.exitCode = 2;
    return;
  }

  try {
    const { pack, config } = buildConfigFromPolicyPack(args.applyPolicyPack, args.root);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    writeArkRulesTemplates(args.root, config, { force: args.force === true });
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

const MATURE_LAYER_RULES = Object.freeze([
  { from: 'SharedKernel', to: 'DomainModel', allowed: false },
  { from: 'SharedKernel', to: 'ApplicationOrchestration', allowed: false },
  { from: 'SharedKernel', to: 'PresentationAdapters', allowed: false },
  { from: 'SharedKernel', to: 'PersistenceAdapters', allowed: false },
  { from: 'SharedKernel', to: 'CompositionRoot', allowed: false },
  { from: 'DomainModel', to: 'CompositionRoot', allowed: false },
  { from: 'PresentationAdapters', to: 'CompositionRoot', allowed: false },
  { from: 'PersistenceAdapters', to: 'CompositionRoot', allowed: false },
]);

function ensureMatureAdoptionLayers(layers, byLayer) {
  const names = new Set(layers.map((layer) => layer.name));
  const next = [...layers];
  if (!names.has('SharedKernel')) {
    next.push({
      name: 'SharedKernel',
      patterns: [...(byLayer.get('SharedKernel') ?? SHARED_KERNEL_PATH_PATTERNS)],
      reserved: true,
      allowEmpty: true,
      description: 'Shared types and constants. Persistence and Presentation may import this; it imports nothing else.',
    });
  }
  if (!names.has('CompositionRoot')) {
    next.push({
      name: 'CompositionRoot',
      patterns: [...(byLayer.get('CompositionRoot') ?? COMPOSITION_ROOT_PATH_PATTERNS)],
      reserved: true,
      allowEmpty: true,
      description: 'DI / bootstrap wiring. May import Domain and Persistence; Domain must not import this.',
    });
  }
  return next;
}

function writeAdoptGoldenPattern(root) {
  const dir = path.join(root, '.ark');
  const dest = path.join(dir, 'golden-pattern.json');
  if (fs.existsSync(dest)) return { wrote: false, path: '.ark/golden-pattern.json' };
  fs.mkdirSync(dir, { recursive: true });
  const golden = {
    schemaVersion: '1',
    name: 'feature-folders',
    norm:
      'New modules live under src/<feature>/{domain,application,composition,infrastructure}. ' +
      'Types and constants go to SharedKernel. Wiring goes to CompositionRoot. ' +
      'Presentation never imports Domain. Persistence never imports Application.',
    newCodeHome: 'src',
    examplePath: 'src/example/domain/model.ts',
  };
  fs.writeFileSync(dest, `${JSON.stringify(golden, null, 2)}\n`);
  return { wrote: true, path: '.ark/golden-pattern.json' };
}

/**
 * Contract-adopt: expand include + layer patterns from ungoverned proposals.
 * Read-only unless --write. Does not weaken rules or baseline violations.
 * Never maps bare lib/** solely to Presentation (NEW-ADOPT-LIB-AS-PRESENTATION).
 */
function runAdoptContract(args) {
  const root = args.root;
  // Contain --config writes under project root (S0 security). Refuse escape even
  // before --write so dry-run + write share one path and cannot probe outside root.
  const contained = resolveConfigPathWithinRoot(root, args.config);
  if (!contained.ok) {
    console.error(contained.error);
    process.exitCode = 2;
    return;
  }
  const configPath = contained.configPath;
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
  // SPA / Vercel: include root api + lib when present (NEW-SPA-DEFAULT-LAYOUT).
  const spaExtras = ['api', 'lib'].filter((d) => fs.existsSync(path.join(root, d)));
  const nextInclude = [
    ...new Set([
      ...(config.include || []),
      ...(suggestedInclude.length > 0 ? suggestedInclude : tsPackages),
      ...spaExtras,
    ]),
  ].filter(Boolean);
  const files = collectGovernedFiles(root, { ...config, include: nextInclude.length ? nextInclude : config.include });
  const cov = computeCoverage(root, { ...config, include: nextInclude.length ? nextInclude : config.include }, files, config.rules || []);
  // UI-only patterns — never bare **/lib/** (data clients are Persistence).
  const uiPatterns = [
    '**/components/**',
    '**/hooks/**',
    '**/routes/**',
    '**/app/**',
    '**/pages/**',
  ];
  const persistencePatterns = [
    ...PERSISTENCE_PATH_PATTERNS,
  ];
  const applicationPatterns = [
    ...NEXT_API_APPLICATION_PATTERNS,
    ...APPLICATION_LIB_ORCHESTRATION_PATTERNS,
    'api/**',
  ];
  const domainPatterns = [...DOMAIN_PATH_PATTERNS, 'src/**/domain/**'];
  const sharedKernelPatterns = [...SHARED_KERNEL_PATH_PATTERNS];
  const compositionRootPatterns = [...COMPOSITION_ROOT_PATH_PATTERNS];

  // Build pattern additions from unclassified suggestions (path-aware).
  const byLayer = new Map([
    ['PresentationAdapters', [...uiPatterns]],
    ['PersistenceAdapters', [...persistencePatterns]],
    ['ApplicationOrchestration', [...applicationPatterns]],
    ['DomainModel', [...domainPatterns]],
    ['SharedKernel', [...sharedKernelPatterns]],
    ['CompositionRoot', [...compositionRootPatterns]],
  ]);
  for (const suggestion of cov.suggestions ?? []) {
    if (suggestion.unrecognized || !suggestion.layer) continue;
    const dir = String(suggestion.dir || '');
    // Never dump bare lib/ into Presentation or Application.
    if (dir === 'lib' || dir === 'src/lib' || dir.endsWith('/lib')) {
      continue;
    }
    if (
      suggestion.layer === 'PresentationAdapters' &&
      (dir === 'lib' || dir.endsWith('/lib'))
    ) {
      continue;
    }
    let layerName = suggestion.layer;
    if (/(^|\/)(types|constants|shared)(\/|$)/i.test(dir)) layerName = 'SharedKernel';
    else if (/(^|\/)(composition|factories|bootstrap)(\/|$)/i.test(dir)) layerName = 'CompositionRoot';
    else if (/(^|\/)domain(\/|$)/i.test(dir)) layerName = 'DomainModel';
    const list = byLayer.get(layerName) ?? [];
    const glob = suggestion.dir === '.' ? null : `${suggestion.dir}/**`;
    if (glob && !list.includes(glob) && glob !== 'src/lib/**' && glob !== 'lib/**') {
      list.push(glob);
    }
    byLayer.set(layerName, list);
  }

  const stripLibVacuum = (patterns) =>
    (patterns || []).filter((p) => p !== '**/lib/**' && p !== 'lib/**' && p !== 'src/lib/**');

  let layers = (config.layers || []).map((layer) => {
    const extras = byLayer.get(layer.name);
    const cleaned = stripLibVacuum(layer.patterns || []);
    if (!extras?.length) return { ...layer, patterns: cleaned };
    const patterns = [...new Set([...cleaned, ...extras])];
    return { ...layer, patterns };
  });
  layers = ensureMatureAdoptionLayers(layers, byLayer);
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
      persistencePatterns,
      applicationPatterns,
      domainPatterns,
      sharedKernelPatterns,
      compositionRootPatterns,
      proposedLayers: ['SharedKernel', 'CompositionRoot', 'DomainModel'],
      goldenPattern: '.ark/golden-pattern.json',
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
    const existingRules = Array.isArray(config.rules) ? config.rules : [];
    const rules = [...existingRules];
    for (const rule of MATURE_LAYER_RULES) {
      if (!rules.some((r) => r.from === rule.from && r.to === rule.to && r.allowed === rule.allowed)) {
        rules.push(rule);
      }
    }
    const next = {
      ...config,
      include: proposal.after.include,
      layers,
      rules,
    };
    fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
    proposal.golden = writeAdoptGoldenPattern(root);
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
  console.log(`  persistence patterns += (data clients / db / auth — never bare lib→Presentation)`);
  console.log(`  application patterns += Next/Vercel API shells (never bare src/lib/**)`);
  console.log(`  shared kernel += types/constants; composition root += wiring`);
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

/**
 * Literal path drift (LPD) — repo paths that live inside strings, comments and
 * docstrings, and no longer resolve.
 *
 * `tsc` resolves imports, not strings, and ESLint does not either, so this
 * whole class compiles green. Report only by default (house convention:
 * plan-by-default, `--write` to mutate) and only the ANCHORED findings are ever
 * written — an unanchored one has no destination to propose.
 */
async function runPathDrift(args) {
  const root = args.root;
  const { scanLiteralPathDrift, writeLiteralPathDrift } = await import(
    './lib/literal-path-drift-io.mjs'
  );
  let config;
  try {
    config = readConfig(root, args.config);
  } catch {
    // The scan reads text, not the contract's rules: a contract too broken to
    // parse must not hide the drift. `include` only widens the roots.
    config = { include: ['src'] };
  }
  const baseRef = resolveDesignDeltaBaseRef(root, args.baseRef);
  const report = scanLiteralPathDrift(root, config, { baseRef, tsconfig: args.tsconfig });
  const written = args.write ? writeLiteralPathDrift(root, report.anchored) : null;
  // After a write the findings that were applied no longer exist on disk, so
  // reporting them as findings would describe a tree that is already gone.
  const remainingAnchored = written
    ? report.anchored.filter((finding) => !wasApplied(finding, written))
    : report.anchored;
  // Both sinks describe the tree as it now stands: after a write the applied
  // findings are gone from disk, and printing them as findings would contradict
  // the "wrote ..." lines directly underneath.
  const shown = { ...report, anchored: remainingAnchored };

  // The unanchored sweep is opt-in (`--all`). On a repo that WRITES about paths
  // it produced 4085 candidates out of 9536 literals, almost all of them
  // illustrative paths in prose and help text — that is ArkGate's inability to
  // resolve a string reported as a fact about the user's code, the same defect
  // class as the coverage budget. The count is always printed, so opting out of
  // the list is never opting out of knowing.
  const payload = {
    ...report,
    anchored: remainingAnchored,
    unanchoredCount: report.unanchoredCount,
    unanchored: args.all ? report.unanchored : [],
    unanchoredListed: args.all,
  };
  if (args.json) {
    console.log(JSON.stringify({ pathDrift: payload, ...(written ? { written } : {}) }, null, 2));
  } else {
    printPathDrift(root, args, shown, written);
  }
  // Anchored drift is a fact about the tree: the source is gone and a rename
  // says where it went. Unanchored drift is advisory — ArkGate cannot tell a
  // dead reference from one it simply cannot resolve.
  // Three outcomes, and CI must be able to tell them apart from the exit code
  // alone — a tick the terminal withholds is no use to a pipeline that only
  // reads the status:
  //   0  anchored mode ran and found nothing left
  //   1  anchored drift remains
  //   2  anchored mode could not run (no usable base ref) — this run proved
  //      nothing, and exiting 0 here would be the false green one level down.
  if (!report.renameSet.available) process.exitCode = 2;
  else process.exitCode = remainingAnchored.length > 0 ? 1 : 0;
}

/**
 * True when THIS finding was one of the replacements written.
 *
 * Matched by identity, not by file: a file holding two findings where only one
 * still matched its token must keep the other one in the remaining set.
 */
function wasApplied(finding, written) {
  const entry = written.written.find((row) => row.file === finding.file);
  if (!entry) return false;
  return (entry.appliedFindings ?? []).some(
    (applied) =>
      applied.line === finding.line &&
      applied.column === finding.column &&
      applied.token === finding.token
  );
}

/**
 * A path from git or from the filesystem is raw bytes, and it is about to be
 * printed to a terminal. A control character there can repaint or erase the
 * findings above it.
 */
function renderPath(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, (ch) =>
    `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

function printPathDrift(root, args, report, written) {
  console.log(color.bold('Literal path drift'));
  console.log(
    color.dim(
      `  scanned ${report.scannedFiles} text file(s), ${report.candidates} path-shaped literal(s)`
    )
  );
  if (!report.renameSet.available) {
    console.log(
      color.yellow(
        `  No rename set (${report.renameSet.reason}) — anchored mode is OFF, so nothing below carries a suggested replacement. Pass --base-ref <git-ref> to enable it.`
      )
    );
  } else {
    console.log(
      color.dim(
        `  rename set vs ${report.baseRef}: ${report.renameSet.renames} rename(s), ${report.anchorsConsidered} usable anchor(s)`
      )
    );
  }
  if (report.ambiguousAnchors.length > 0) {
    console.log(
      color.dim(
        `  ${report.ambiguousAnchors.length} rename source(s) map to more than one destination and anchor nothing (e.g. ${renderPath(report.ambiguousAnchors[0])})`
      )
    );
  }
  const discarded = report.scan.discarded;
  const dropped = Object.values(discarded).reduce((sum, n) => sum + n, 0);
  if (dropped > 0) {
    console.log(
      color.dim(
        `  not read: ${discarded.generated} generated, ${discarded.oversize} oversize, ${discarded.budget} past the ${report.scan.maxFiles}-file budget, ${discarded.byteBudget} past the ${Math.round(report.scan.maxTotalBytes / (1024 * 1024))}MB total budget, ${discarded.unreadable} unreadable, ${discarded.depthLimited} past the depth limit, ${discarded.symlink} symlinked file(s), ${discarded.symlinkDir} symlinked director(ies)`
      )
    );
  }

  for (const finding of report.anchored) {
    console.log(
      `${color.red('\u2716')} ${finding.ruleId} ${renderPath(finding.file)}:${finding.line} [${finding.form}]`
    );
    console.log(
      finding.suggestedToken === null
        ? `  ${renderPath(finding.token)} -> ${renderPath(finding.suggestedTarget)} (outside the alias root of this literal — rewrite by hand)`
        : `  ${renderPath(finding.token)} -> ${renderPath(finding.suggestedToken)}`
    );
  }
  if (report.unanchoredCount > 0) {
    if (args.all) {
      for (const finding of report.unanchored) {
        console.log(
          `${color.yellow('warning')} ${finding.ruleId} ${renderPath(finding.file)}:${finding.line} [${finding.form}] ${renderPath(finding.token)}`
        );
      }
    }
    console.log(
      color.yellow(
        `  ${report.unanchoredCount} unanchored candidate(s)${args.all ? ` listed above${report.truncated.unanchored ? ` (first ${report.unanchored.length}; the list is capped at ${report.findingCap}, the count is not)` : ''}` : ' not listed (--all)'} — literals that look like a repo path and do not resolve. Advisory only: with no rename to anchor them ArkGate cannot tell a dead reference from an illustrative one, so read them, do not gate on them.`
      )
    );
  }

  if (written) {
    for (const entry of written.written) {
      console.log(color.green(`  wrote ${renderPath(entry.file)} (${entry.applied})`));
    }
    for (const entry of written.skipped) {
      console.log(color.yellow(`  skipped ${renderPath(entry.file)}: ${entry.reason} (${entry.count})`));
    }
  }

  if (report.anchored.length === 0) {
    if (!report.renameSet.available) {
      // No tick. A green mark over a check that never ran is the false green
      // this whole patch exists to remove.
      console.log(
        color.yellow(
          '\u25CB Anchored mode did not run — no rename set. This says nothing about drift.'
        )
      );
    } else {
      console.log(color.green('\u2714 No anchored literal path drift.'));
      console.log(
        color.dim(
          '  Every literal explained by the rename set resolves. This is a text match over strings and comments: it proves no scanned literal is stale against those renames, not that every path in the repo is live.'
        )
      );
    }
  }
  if (!written && report.anchored.length > 0) {
    const writable = report.anchored.filter((finding) => finding.suggestedToken !== null).length;
    const byHand = report.anchored.length - writable;
    console.log(
      color.dim(
        `  Report only. Re-run with --write to apply ${writable} of the ${report.anchored.length} anchored replacement(s)${byHand > 0 ? `; ${byHand} must be rewritten by hand` : ''}. Unanchored findings are never written.`
      )
    );
  }
}

/**
 * Additive P0-A contract retrofit: inject high-spec app/api → Application when missing.
 * Does not remove existing patterns or weaken rules (DL-P0A-RETROFIT).
 */
function runMigrateContract(args) {
  const root = args.root;
  // Contain --config writes under project root (S0 security).
  const contained = resolveConfigPathWithinRoot(root, args.config);
  if (!contained.ok) {
    console.error(contained.error);
    process.exitCode = 2;
    return;
  }
  const configPath = contained.configPath;
  if (!fs.existsSync(configPath)) {
    console.error(`No ${args.config} — nothing to migrate. Run ark start / ark-check --init first.`);
    process.exitCode = 2;
    return;
  }
  let config;
  try {
    config = readConfig(root, args.config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  const result = retrofitP0aApiApplicationPatterns(config);
  const proposal = {
    ok: true,
    changed: result.changed,
    injected: result.injected,
    targetLayer: result.targetLayer,
    wrote: false,
  };

  if (args.write && result.changed) {
    fs.writeFileSync(configPath, `${JSON.stringify(result.config, null, 2)}\n`);
    proposal.wrote = true;
  }

  if (args.json) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }
  console.log(color.bold('Contract migrate (P0-A API → Application, additive)'));
  if (!result.changed) {
    console.log(color.dim('  No changes — Application already has high-spec app/api patterns (or no Application layer).'));
    return;
  }
  console.log(`  target layer: ${result.targetLayer}`);
  console.log(`  injecting: ${result.injected.join(', ')}`);
  if (proposal.wrote) {
    console.log(color.green(`  wrote ${path.relative(root, configPath) || args.config}`));
    console.log(color.dim(`  Next: ${arkCommand(root, 'ark-check', '--coverage')} — API routes should classify as Application`));
  } else {
    console.log(color.dim('  Dry-run only. Re-run with --write to apply.'));
  }
}



function runInit(args) {
  const contained = resolveConfigPathWithinRoot(args.root, args.config);
  if (!contained.ok) {
    console.error(contained.error);
    process.exitCode = 2;
    return;
  }
  const configPath = contained.configPath;

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
    const arkrulesWritten = writeArkRulesTemplates(args.root, finalConfig, {
      force: args.force === true,
    });
    if (arkrulesWritten.length > 0) {
      console.log(`Wrote ArkRules templates: ${arkrulesWritten.join(', ')}`);
    }
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
  const finalConfig = withDefaultArkRules(
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
          })
  );

  fs.writeFileSync(configPath, `${JSON.stringify(finalConfig, null, 2)}\n`);
  writeArkRulesTemplates(args.root, finalConfig, { force: args.force === true });

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
        console.log('Proposed layer for each (from the 11-layer profile + presets — apply via /ark-adopt):');
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

/**
 * Monorepo honesty: when cwd/--root has no ark.config.json, walk parents (bounded).
 * Stamps configRoot / configWalkedUp. Mutates args.root only for read paths, or
 * when --follow-config-root is set on writes (never rewrite parent monorepo by default).
 * Skip for pure meta commands that never load a project contract.
 */
function applyConfigRootWalkUp(args) {
  if (
    args.version ||
    args.help ||
    args.printConfig ||
    args.listPolicyPacks
  ) {
    return args;
  }
  const writeMode = isMutatingCliCommand(args);
  // The root the caller asked for, before any walk-up adopts the config's directory.
  // An empty analysis must be able to say which of the two it actually walked.
  args.requestedRoot = path.resolve(args.root);
  const effective = resolveEffectiveProjectRoot(args.root, {
    configName: args.config,
    writeMode,
    followConfigRoot: args.followConfigRoot === true,
  });
  args.configRoot = effective.configRoot;
  args.configFound = effective.configFound;
  args.writeRoot = effective.writeRoot;
  if (effective.walkedUp && effective.root !== path.resolve(args.root)) {
    // Read paths (or write + --follow-config-root): adopt discovered config root.
    args.root = effective.root;
    args.configWalkedUp = true;
  } else if (effective.walkedUp) {
    // Write path without opt-in: keep explicit --root/cwd; surface discovery only.
    args.configWalkedUp = true;
  } else {
    args.configWalkedUp = false;
  }
  return args;
}

async function main() {
  const args = applyConfigRootWalkUp(parseArgs(process.argv));
  if (await tryResidentDoctor(args)) return;
  if (args.version) {
    console.log(arkPackageVersion());
    process.exit(0);
  }
  if (args.help) {
    console.log(args.all ? checkUsageAll() : checkUsage());
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

  if (args.migrateContract) {
    runMigrateContract(args);
    return;
  }

  if (args.pathDrift) {
    await runPathDrift(args);
    return;
  }

  if (args.sensors) {
    const { runSensors } = await import('./lib/sensor-promote-cli.mjs');
    await withSensorsPartialModeHonesty(args, () => runSensors(args, readConfig));
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

  // Empty analysis is a refusal: on zero governed files every later gate reports on
  // nothing. It outranks --require-gates, so the caller hears the real reason instead
  // of "Ark gates are not installed" in whatever directory the contract happened to
  // live in — but it is evaluated LAZILY, so the cheap exits (a --changed run whose
  // diff touches no product path, --require-gates with the gates present) still pay
  // nothing for a filesystem walk they never needed.
  //
  // Report modes are exempt: --plan, --coverage and --doctor are how a user sees and
  // fixes an empty scope (they already carry the `empty-scope` adoption gap), so
  // refusing there would remove the only surface that explains the refusal.
  const root = args.root;
  const verdictPath = !args.plan && !args.coverage && !args.doctor;
  let configCache = null;
  const loadConfig = () => (configCache ??= readConfig(root, args.config));
  let governedCache = null;
  const loadGovernedFiles = () => (governedCache ??= collectGovernedFiles(root, loadConfig()));
  const emptyAnalysisRefusalNow = () => {
    const governedCount = loadGovernedFiles().length;
    return emptyAnalysisRefusal({
      governedFileCount: governedCount,
      // Probed only when nothing is governed, and never through the contract's own
      // exclude: the config under suspicion must not get to answer the question about
      // itself (`exclude: ["**"]` would otherwise read as greenfield and pass).
      ungovernedSourceCount: governedCount === 0 ? countUngovernedSourceFiles(root) : 0,
      ungovernedSourceCap: UNGOVERNED_PROBE_CAP,
      root,
      requestedRoot: args.requestedRoot,
      configPath: path.isAbsolute(args.config) ? args.config : path.join(root, args.config),
      configWalkedUp: args.configWalkedUp === true,
    });
  };
  const reportEmptyAnalysis = (refusal) => {
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: refusal.ruleId,
            completeness: ANALYSIS_COMPLETENESS.unavailable,
            message: refusal.message,
            nextAction: refusal.nextAction,
          },
          null,
          2
        )
      );
    } else {
      console.error(`${color.red('\u2716')} ${refusal.ruleId} ${refusal.message}`);
      console.error(`Next: ${refusal.nextAction}`);
    }
    process.exitCode = 1;
  };

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
      // "Gates not installed" is the wrong reason for a run that would have analyzed
      // nothing: it sends the user to `ark init` for a problem they do not have. Only
      // here do we pay for the walk — with the gates present we fall through and the
      // verdict path below checks at its usual point. A contract that cannot even be
      // read is not evidence of an empty analysis, so that throw falls back to the
      // gate report instead of masking it.
      let refusal = null;
      if (verdictPath) {
        try {
          refusal = emptyAnalysisRefusalNow();
        } catch {
          refusal = null;
        }
      }
      if (refusal) {
        reportEmptyAnalysis(refusal);
        return;
      }
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
    if (args.requireGates) {
      const ci = ciNotFailClosed(args.root);
      if (ci) {
        const payload = {
          ok: false,
          error: ci.error,
          message: ci.message,
          workflowFile: ci.workflowFile,
          nextAction: ci.nextAction,
          ...(writeRequest?.host ? { writeHost: writeRequest.host } : {}),
        };
        if (args.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.error(`${color.red('\u2716')} ${ci.error} ${ci.message}`);
          console.error(`Next: ${ci.nextAction}`);
        }
        process.exitCode = 1;
        return;
      }
    }
    // Gates present. This is a precondition, not a standalone report: stay quiet
    // in --json mode so the architecture check below owns the single JSON output.
    // When --require-gates is the only intent (no config/architecture run needed),
    // callers still get a clear signal from the exit code and the human-mode line.
    if (!args.json) {
      if (args.requireGates) {
        const compactHost = compactRouterHost(args.root);
        console.log(
          'Ark gate artifacts found on disk (merge profile; runtime activation not implied): ' +
            (compactHost
              ? `AGENTS.md, compact host registration (${compactHost})`
              : REQUIRED_GATE_FILES.join(', '))
        );
      }
      if (writeRequest?.host) {
        console.log(`Ark hard-write hook present for ${writeRequest.host}.`);
      }
    }
  }

  const bound = bindTeamBaseRefs(args, root);
  Object.assign(args, bound.args);
  const config = loadConfig();
  const policyDelta = analyzePolicyTransition({
    root,
    configPath: args.config,
    candidateConfig: config,
    strictMerge: args.strictMerge || args.contractDiff,
    basePath: args.policyBase,
    baseRef: args.policyBaseRef,
    acknowledgementPath: args.policyAck,
  });
  const preflight = runTeamPreflight({
    root,
    args,
    config,
    policyDelta,
    teamBase: bound.teamBase,
  });
  const teamParliament = preflight.teamParliament;
  const changedPaths = preflight.changedPaths;
  if (preflight.halt) {
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            ok: preflight.halt.exitCode === 0,
            ...(preflight.halt.cheap ? { cheap: true } : {}),
            teamParliament: preflight.halt.teamParliament,
            ...(policyDelta ? { policyDelta } : {}),
          },
          null,
          2
        )
      );
    } else if (preflight.halt.exitCode === 0) {
      console.log('✔ Ark check passed (no governed source or constitution files in the diff).');
    } else {
      console.error(preflight.halt.message);
      const blocking = policyDelta?.findings?.find(
        (finding) =>
          finding.classification === 'weakening' || finding.classification === 'judgment-required'
      );
      if (blocking?.nextAction) console.error(`Next: ${blocking.nextAction}`);
    }
    process.exitCode = preflight.halt.exitCode;
    return;
  }
  const manifest = readManifest(root, args.manifest);
  const rules = manifest?.architecture?.rules ?? config.rules;
  const allGovernedFiles = loadGovernedFiles();
  if (verdictPath) {
    const refusal = emptyAnalysisRefusalNow();
    if (refusal) {
      reportEmptyAnalysis(refusal);
      return;
    }
  }
  if (args.failUngoverned && teamParliament?.changeSet?.productPaths?.length) {
    const governedRel = new Set(
      allGovernedFiles.map((abs) => normalize(path.relative(root, abs)))
    );
    const dumped = teamParliament.changeSet.productPaths.filter((rel) => !governedRel.has(rel));
    if (dumped.length > 0) {
      const message = ungovernedDumpMessage(dumped);
      if (args.json) {
        console.log(JSON.stringify({ ok: false, teamParliament: { ...teamParliament, ungoverned: dumped }, message }, null, 2));
      } else {
        console.error(message);
      }
      process.exitCode = 1;
      return;
    }
  }
  const files = args.changed
    ? filterChangedGovernedFiles(allGovernedFiles, root, changedPaths, normalize)
    : allGovernedFiles;

  // --coverage is a pure glob/report view (no TypeScript resolver), so serve it BEFORE the
  // TS import: the report must work — and exit 0 — even when typescript isn't installed.
  if (args.coverage) {
    runCoverage(root, config, files, rules, args.json);
    return;
  }

  const loaded = await loadTypeScript(root);
  if (!loaded?.ts) {
    const nextAction =
      'Reinstall or upgrade arkgate to restore its exact typescript-ark-host@6.0.3 fallback; ' +
      `alternatively install an API-compatible host with ${installDevHint(root, 'typescript@6.0.3')} — ` +
      'see docs/typescript-support.md';
    reportUnavailableAnalysis({
      root, config, rules, files, args, createResult: createAdapterResult, nextAction,
      message: loaded?.reason ?? 'ArkGate could not load an API-compatible TypeScript host.',
    });
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

  const {
    violations: rawViolations, warnings, safety, parseHealth, completeness, completenessReasons,
    mode, policyHash, resolverIdentity, factsHash, candidateTreeHash,
  } = runArchitectureScan({
    root,
    config,
    manifest,
    rules,
    files,
    ts,
    args,
  });

  // Align merge with extraMergeTeeth stamp: demote enforced ArkRules under classification floor.
  const preCov = computeCoverage(root, config, files, rules);
  const populatedLayerCount = Array.isArray(preCov.layers)
    ? preCov.layers.filter((row) => (row?.files ?? 0) > 0).length
    : 0;
  const violations = demoteArkRuleTeethUnderClassificationFloor(rawViolations, {
    governedPercent: preCov.governed?.percent ?? null,
    populatedLayerCount,
  });

  // --promote reuses the analysis that just ran rather than running its own:
  // the advisory findings it counts are already in `violations` + `warnings`,
  // stamped with the rule that produced them. Placed before the design-delta
  // check so a preview does not pay for a base-ref diff it never reads.
  if (args.promote) {
    // The floor the merge gate itself applies: below it every enforced
    // extra-plane finding is demoted to a warning, so a promotion made here
    // buys a label and not a tooth. `violations` above was already demoted by
    // it; the preview has to know, or it sells teeth the gate then removes.
    const { extraMergeTeethAllowed } = await import('./lib/extra-merge-teeth.mjs');
    const teethDemotedByFloor = !extraMergeTeethAllowed({
      governedPercent: preCov.governed?.percent ?? null,
      populatedLayerCount,
    });
    const { runPromote } = await import('./lib/sensor-promote-cli.mjs');
    await runPromote(root, config, args, {
      files,
      all: [...violations, ...(warnings ?? [])],
      completeness,
      completenessReasons,
      teethDemotedByFloor,
    });
    return;
  }

  const createdPathsOnly = Boolean(args.strictMerge && !args.failOnNewSmells);
  const designCheck = createDesignDeltaCheck({
    enabled: args.failOnNewSmells || args.strictMerge,
    createdPathsOnly,
    missingBase: createdPathsOnly ? 'skip' : 'fail-closed',
    root,
    config,
    configPath: args.config,
    baseRef: resolveDesignDeltaBaseRef(root, args.baseRef),
    ts,
  });
  const designDelta = designCheck.result;

  if (args.doctor) {
    runDoctor(root, config, files, rules, violations, args.json, {
      configPath: path.isAbsolute(args.config) ? args.config : path.join(root, args.config),
      configMissing: !fs.existsSync(path.isAbsolute(args.config) ? args.config : path.join(root, args.config)),
      configRoot: args.configRoot ?? root,
      configWalkedUp: args.configWalkedUp === true,
      safety, designDelta,
      ts, parseHealth, completeness,
      all: args.all === true,
    });
    if (designDelta) process.exitCode = !designDelta.complete ? 2 : designDelta.valid ? 0 : 1; return;
  }

  if (args.ratchetCores) {
    runRatchetCores(root, config, files, rules, violations, args, { displayPathFromRoot });
    return;
  }

  if (args.updateBaseline) {
    if (!contractSessionFrom(args)) {
      console.error('Growing the baseline requires --contract-session. Freeze in a law-only PR.');
      process.exitCode = 1;
      return;
    }
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
      console.error('first (/ark-adopt), then re-run. To freeze anyway: --update-baseline --force.');
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
  if (args.against) {
    const ratcheted = applyAgainstRatchet({
      violations,
      againstRef: args.against,
      root,
      changed: args.changed,
      changedPaths,
      occurrenceKeys: baselineOccurrenceKeys(violations),
    });
    activeViolations = ratcheted.activeViolations;
    suppressed = ratcheted.suppressed;
  } else if (args.baseline) {
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
  // P1-type: type-only placement debt on the violations list also has failsStrict:false —
  // keep reporting them (doctor typeOnly counts) but do not block merge/exit.
  const strictWarnings = warnings.filter((w) => w.failsStrict !== false);
  const blockingViolations = activeViolations.filter((v) => v.failsStrict !== false);
  const { edgeValid: edgeOk, observedOk } = designCheck.combineEdges({
    activeViolationCount: blockingViolations.length,
    strictConfig: args.strictConfig,
    strictWarningCount: strictWarnings.length,
    policyValid: policyDelta?.valid ?? true,
  });
  const analysisComplete = completeness === ANALYSIS_COMPLETENESS.complete;
  const ok = observedOk && analysisComplete;

  if (args.plan) {
    const cov = computeCoverage(root, config, files, rules);
    // Plan goal.met uses blocking (value) edges; type-only placement debt stays in steps via full list.
    const plan = runPlan(root, activeViolations, args.json, cov.governed.percent, cov.governed.totalFiles, {
      config,
      files,
      coverage: cov,
      completeness,
      completenessReasons,
      blockingViolationCount: blockingViolations.length,
    });
    if (args.strictMerge) process.exitCode = ok && plan.goal.met ? 0 : 1;
    return;
  }

  if (args.rulesInventory) {
    const { buildRulesInventory, inventoryToExtractionCard } = await import('./lib/rules-inventory.mjs');
    const fileContents = {};
    const fileLayers = {};
    for (const file of files.slice(0, 400)) {
      const rel = normalize(path.relative(root, file));
      try {
        fileContents[rel] = fs.readFileSync(file, 'utf8');
        const layer = layerForFile(root, file, config.layers);
        if (layer) fileLayers[rel] = layer;
      } catch {
        /* skip unreadable */
      }
    }
    const contracted = [];
    if (config.arkRules) {
      try {
        const { loadEffectiveArkRulesFromDisk } = await import('./lib/effective-contract-load.mjs');
        const loaded = loadEffectiveArkRulesFromDisk(root, config);
        for (const rule of loaded.arkRules.structure ?? []) contracted.push(rule.id);
        for (const inv of loaded.arkRules.invariants ?? []) contracted.push(inv.id);
      } catch {
        /* advisory inventory still useful */
      }
    }
    const inventory = buildRulesInventory({
      fileContents,
      fileLayers,
      layerContexts: (config.layers ?? []).map((layer) => ({
        name: layer.name,
        intentPrefixes: layer.intentPrefixes ?? [],
      })),
      contractedRuleIds: contracted,
    });
    const nextPilot =
      inventory.candidates[0] != null
        ? inventoryToExtractionCard(inventory.candidates[0])
        : null;
    const payload = {
      rulesInventory: inventory,
      rulesMigration: {
        inventoried: inventory.inventoried,
        underContract: inventory.underContract,
        frozen: inventory.frozen,
        notAScore: true,
      },
      nextPilot: nextPilot,
    };
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(
        `Rules inventory: ${inventory.inventoried} inventoried, ${inventory.underContract} under contract, ${inventory.frozen} frozen (not a score).`
      );
      for (const c of inventory.candidates.slice(0, 12)) {
        console.log(`  - [${c.confidence}] ${c.kind} @ ${c.file}:${c.line} — ${c.message}`);
      }
      if (nextPilot) {
        console.log(`Next extraction pilot: ${nextPilot.pilot} → ${nextPilot.pilotTarget}`);
      }
    }
    process.exitCode = 0;
    return;
  }

  const skillGaps = detectSkillGaps(root);
  const codexHomeGap = detectCodexHomeGap(root);
  const codexRepoSkillGap = detectCodexRepoSkillGap(root);
  const codexSessionActive = codexConcernIsActive();

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
    // Origin is read before archive so the HTML can show "just created" vs deltas.
    const existingOrigin = args.resetOrigin
      ? null
      : readJsonSafe(path.join(reportsDir(root), 'origin.json'));
    // Pass the same baseline split as doctor so productHonesty dirty-freeze matches.
    const reportBaseline = readBaseline(root, args.baseline || '.ark-baseline.json');
    // Doctor parity for improvement compass: stale keys = baseline keys not in current occurrence set.
    // Only when analysis is complete — partial scans under-count current keys and inflate false stale residual
    // (same gate as doctor-plan: baselineStale: analysisComplete ? staleBaseline : null).
    const reportOccurrenceKeys = baselineOccurrenceKeys(violations);
    const reportCurrentKeys = new Set(reportOccurrenceKeys);
    const reportBaselineStale = reportBaseline.exists
      ? [...reportBaseline.keys].filter((key) => !reportCurrentKeys.has(key)).length
      : 0;
    const { adoption: adoptionForReport, designDepth } = buildReportDepthPayload(
      root,
      config,
      files,
      coverage,
      activeViolations,
      {
        suppressedCount: suppressed.length,
        totalViolationCount: violations.length,
        frozenKeys: reportBaseline.exists ? reportBaseline.keys.size : 0,
        activeCount: activeViolations.length,
        activeBlockingCount: blockingViolations.length,
        baselineStale: analysisComplete ? reportBaselineStale : null,
      }
    );
    // DF02 — thin status compass on report snapshot so `ark status` residual ⊆ doctor.
    const reportCompass =
      designDepth?.improvementCompass && designDepth.improvementCompass.notAScore === true
        ? {
            schemaVersion: '1.0',
            notAScore: true,
            mode: analysisComplete ? 'full' : 'subset',
            topResidual: Array.isArray(designDepth.improvementCompass.topResidual)
              ? designDepth.improvementCompass.topResidual
              : [],
            factsSource: 'report-snapshot',
            ...(analysisComplete
              ? {}
              : {
                  reasonCode: 'FACTS_PARTIAL',
                  reason:
                    'Report analysis was incomplete — status compass is a subset; re-run doctor/report for full residual.',
                }),
          }
        : null;
    const currentSnapshot = {
      ...buildReportSnapshot({
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
        improvementCompass: reportCompass,
        arkRun: designDepth?.arkRun ?? null,
      }),
      leftoverDesignWork: designDepth?.designFitness?.designWeak === true,
    };
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
      adoption: adoptionForReport,
      designDepth,
      advisories: {
        ...computeDoctorAdvisories(
          root,
          config,
          coverage,
          rules,
          files,
          ts,
          parseHealth,
          undefined,
          activeViolations
        ),
        // Doctor parity: always emit improvement compass when doctor would (reportParity).
        ...(designDepth?.improvementCompass
          ? { improvementCompass: designDepth.improvementCompass }
          : {}),
        // Doctor parity: deep-module coach advisory (hot paths + deepening; notAScore).
        ...(designDepth?.deepModuleCoach
          ? { deepModuleCoach: designDepth.deepModuleCoach }
          : {}),
        ...(designDepth?.arkRun ? { arkRun: designDepth.arkRun } : {}),
      },
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
    const adapterResult = createAdapterResult({
      valid: observedOk,
      completeness,
      completenessReasons,
      mode,
      policyHash,
      resolverIdentity,
      factsHash,
      candidateTreeHash,
      violations: activeViolations.map(enrichViolationWithFixClass),
      warnings,
    });
    console.log(JSON.stringify({
      ...adapterResult,
      ok,
      violations: activeViolations.map(enrichViolationWithFixClass),
      suppressedViolations: suppressed.length,
      staleBaselineKeys,
      warnings,
      ...(activeViolations.length > 0 ? { summary: summarizeViolations(activeViolations) } : {}),
      ...(skillGaps.length > 0 ? { skillGaps } : {}),
      ...(codexHomeGap
        ? {
            codexHomeGap: {
              ...codexHomeGap,
              deferred: !codexSessionActive,
            },
          }
        : {}),
      ...(codexRepoSkillGap ? { codexRepoSkillGap } : {}), ...(policyDelta ? { policyDelta } : {}), ...(designDelta ? { edgeValid: edgeOk, designDelta } : {}),
      ...(teamParliament ? { teamParliament } : {}),
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
    if (policyDelta && !policyDelta.valid) {
      for (const finding of policyDelta.findings.filter(
        ({ classification }) =>
          classification === 'weakening' || classification === 'judgment-required'
      )) {
        console.error(
          `${color.red('policy')} ${finding.classification} ${finding.path}: ${finding.message}`
        );
        console.error(`  Next: ${finding.nextAction}`);
      }
      console.error(
        `Policy transition blocked (${policyDelta.basePolicyHash} → ${policyDelta.candidatePolicyHash}). ` +
          'Provide --policy-ack with the exact hashes, finding ids, and a non-empty reason.'
      );
    }
    if (designCheck.failureText()) console.error(designCheck.failureText());
    if (!analysisComplete) {
      console.error(color.yellow(analysisIncompleteStatement(completeness)));
    } else if (blockingViolations.length === 0 && (policyDelta?.valid ?? true)) {
      const placementDebt = activeViolations.filter((v) => v.failsStrict === false);
      const advisoryOnly = warnings.length > 0 && strictWarnings.length === 0;
      if (placementDebt.length > 0) {
        console.log(
          `${color.green('✔')} Ark check passed with ${placementDebt.length} type-only placement debt (non-blocking; prefer SharedTypes / owning layer).${baselineNote}`
        );
      } else if (warnings.length === 0) {
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
      // `--plan` is where the design bets live and a green run never named it.
      // Not on the strict-config branch above (it printed a failure), not on
      // `--changed` (a partial scan would print one slice's count as the tree's),
      // not on `--watch` (a line that repeats every save is a line nobody reads).
      if (!(args.strictConfig && strictWarnings.length > 0) && !args.changed && !args.watch) {
        const { greenPlanPointer } = await import('./lib/design-smells.mjs');
        const pointer = greenPlanPointer({
          root, config, files, coverage: preCov,
          blockingViolations: blockingViolations.length,
          suppressedCount: suppressed.length,
          planCommand: arkCommand(root, 'ark-check', '--plan'),
        });
        if (pointer) console.log(color.dim(pointer));
      }
    } else {
      console.error(
        blockingViolations.length > 0
          ? `${color.red('✖')} ${blockingViolations.length} violation(s).${baselineNote}`
          : `${color.red('✖')} Policy transition rejected.${baselineNote}`
      );
    }

    // On a large violation set, print the ranked edge breakdown so the wall of failures reads
    // as an ordered burn-down (and flags a concentrated edge as a likely contract bug).
    if (blockingViolations.length >= CONCENTRATION_MIN_VIOLATIONS) {
      printViolationBreakdown(summarizeViolations(blockingViolations), { toStderr: true });
    }

    printSkillAndCodexGapHints(root, {
      skillGaps,
      codexHomeGap,
      codexRepoSkillGap,
      codexSessionActive,
      color,
    });

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
  }

  if (args.watch) {
    await runWatchMode(args, {
      cliPath: __arkCheckCli,
      loadConfig: readConfig,
      dim: color.dim,
    });
    return;
  }

  process.exitCode = designCheck.exitCode(observedOk && (!args.strictMerge || analysisComplete) ? 0 : 1);
}

main().catch((error) => {
  console.error(
    process.env.ARK_DEBUG_STACK === '1' && error instanceof Error
      ? error.stack
      : error instanceof Error
        ? error.message
        : String(error)
  );
  process.exitCode = 2;
});
