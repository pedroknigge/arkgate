#!/usr/bin/env node
/** Authoritative MCP and one-shot hook runtime, loaded by the lightweight launcher. */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildProcessPackageHonesty,
  readProjectInstalledArkgateVersion,
} from './lib/mcp-process-package.mjs';
import {
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_RULES,
  arkCommand,
  globToRegExp,
  layerForFile,
  shouldShowNewHereNudge,
  detectWorkspaces,
  detectTsPackageRoots,
  resolveIncludeRoots,
  isScanExcludedRelative,
} from './ark-shared.mjs';
import { effectiveCapabilityDeny, stableSerialize } from './lib/analysis-engine.mjs';
import { createImportTargetResolver } from './lib/import-resolve.mjs';
import { validateWithAutoPatch, resolveImportFileAbs } from './lib/auto-patch.mjs';
import { composePrepareWrite } from './lib/prepare-write.mjs';
import { loadArkConfigContract } from './lib/config-contract.mjs';
import { loadEffectiveArkRulesFromDisk } from './lib/effective-contract-load.mjs';
import {
  buildRulesInventory,
  inventoryToExtractionCard,
} from './lib/rules-inventory.mjs';
import { ARK_ANALYSIS_RESULT_SCHEMA, createAdapterResult } from './lib/adapter-contract.mjs';
import {
  ARK_PROJECT_IDENTITY_SCHEMA,
  PROJECT_BINDING_SCHEMA,
  PROJECT_EXPECTATION_SCHEMA,
  createProjectId,
  createProjectIdentity,
} from './lib/project-identity.mjs';
import { buildProjectStatusManifest } from './lib/status-command.mjs';
import { ARK_STATUS_MANIFEST_SCHEMA } from './lib/status-manifest.mjs';

function arkRulesCatalogForManifest(snapshot) {
  if (snapshot?.errors?.length || !snapshot?.arkRules) return {};
  const structure = (snapshot.arkRules.structure ?? []).map((r) => ({
    id: r.id,
    sensor: r.sensor,
    mode: r.mode,
    layer: r.provenance?.layer,
    sourceFile: r.provenance?.sourceFile,
  }));
  const invariants = (snapshot.arkRules.invariants ?? []).map((r) => ({
    id: r.id,
    description: r.description,
    aggregate: r.aggregate,
    mode: r.mode,
    layer: r.provenance?.layer,
    sourceFile: r.provenance?.sourceFile,
    coverage: r.coverage,
  }));
  if (structure.length === 0 && invariants.length === 0) return {};
  return { arkRulesCatalog: { structure, invariants } };
}
import { loadTypeScript } from './lib/typescript-host.mjs';
import { validateSnippetAnalysis } from './lib/snippet-analysis.mjs';
import { loadGoldenPattern, attachGoldenToPlacement } from './lib/golden-pattern.mjs';
import {
  isCandidateSourceInScope,
  prepareChangeFromRoot,
} from './lib/prepare-change.mjs';
import { detectWritePathCapabilities } from './lib/write-path-detect.mjs';
import { collectGovernedFiles, isGovernableSourceFile } from './lib/scan-files.mjs';
import { classifyChangeSet, evaluateTeamGate } from './lib/team-parliament.mjs';
import { contractSessionFrom } from './lib/team-parliament-io.mjs';
import {
  normalizeHookPayload,
  codexPatchWrites,
  proposedSource,
  emitHostAllow,
  formatWriteGateDeny,
} from './lib/mcp-hook-payload.mjs';
import {
  canonicalizeCandidateChanges,
  resolvedCompilerInputPaths,
  resolvedInputIdentities,
} from './lib/resolved-candidate-facts.mjs';
import {
  createResidentInputLedger,
  RESIDENT_HOOK_PROTOCOL_VERSION,
  residentDoctorEnvironment,
  residentEnvironmentIdentity,
  residentHookEndpoint,
  residentInvocationIdentity,
  startResidentHookServer,
} from './lib/resident-hook.mjs';
import { resolveArchitectureSnapshot } from './lib/architecture-scan.mjs';
import { runDoctor } from './lib/doctor-plan.mjs';
import {
  evaluateWriteDesignDelta,
  formatDesignDeltaBlock,
} from './lib/design-delta.mjs';

const arkCheckBin = fileURLToPath(new URL('./ark-check.mjs', import.meta.url));
const arkMcpLauncher = fileURLToPath(new URL('./ark-mcp.mjs', import.meta.url));

/**
 * W4 — opt-in hook repair payload.
 * True when CLI `--hook-repair` or env ARK_HOOK_REPAIR is 1/true/yes.
 * Default remains hard block with prose violations only (no machine-readable patch).
 */
function envTruthy(name) {
  const v = process.env[name];
  if (v == null || v === '') return false;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    config: 'ark.config.json',
    configExplicit: false,
    manifest: undefined,
    hook: false,
    /** When true with --hook: emit ARK_REPAIR_JSON / ARK_AUTOPATCH_JSON (never silent write). */
    hookRepair: false,
    failOnNewSmells: false,
    sessionContext: false,
    rootEnv: [],
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--hook') args.hook = true;
    else if (a === '--hook-repair') {
      args.hook = true;
      args.hookRepair = true;
    } else if (a === '--session-context') args.sessionContext = true;
    else if (a === '--fail-on-new-smells') args.failOnNewSmells = true;
    else if (a === '--root') args.root = path.resolve(argv[++i]);
    else if (a === '--root-env') {
      const names = String(argv[++i] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
      args.rootEnv.push(...names);
    } else if (a === '--config') {
      args.config = argv[++i];
      args.configExplicit = true;
    } else if (a === '--manifest') args.manifest = argv[++i];
    else if (a === '--tsconfig') args.tsconfig = argv[++i];
  }
  // Env can enable repair without rewriting host templates (ARK_HOOK_REPAIR=1).
  if (envTruthy('ARK_HOOK_REPAIR')) {
    args.hookRepair = true;
  }
  if (envTruthy('ARK_FAIL_ON_NEW_SMELLS')) args.failOnNewSmells = true;
  for (const name of args.rootEnv) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim() !== '') {
      args.root = path.resolve(value.trim());
      break;
    }
  }
  return args;
}

/**
 * Read a JSON file. Missing files return undefined unless `required` (so the caller can
 * fall back), but malformed JSON always throws — silently swallowing a syntax error would
 * turn the layer gate into a no-op that reports every write as valid.
 */
function readJson(file, { required } = {}) {
  if (!fs.existsSync(file)) {
    if (required) throw new Error(`File not found: ${file}`);
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readArkConfig(file, { required } = {}) {
  const raw = readJson(file, { required });
  return raw === undefined ? undefined : loadArkConfigContract(raw, file).config;
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeWindowsDriveLetter(candidate) {
  if (process.platform !== 'win32' || !/^[A-Za-z]:[\\/]/.test(candidate)) {
    return candidate;
  }
  return `${candidate[0].toUpperCase()}${candidate.slice(1)}`;
}

function canonicalPathIncludingMissing(candidate) {
  const absolute = normalizeWindowsDriveLetter(path.resolve(candidate));
  let existing = absolute;
  const missing = [];
  while (!fs.existsSync(existing)) {
    try {
      if (fs.lstatSync(existing).isSymbolicLink()) {
        const error = new Error(
          `PROJECT_ROOT_MISMATCH: cannot canonicalize dangling symlink ${existing}.`
        );
        error.code = 'PROJECT_ROOT_MISMATCH';
        throw error;
      }
    } catch (error) {
      if (error?.code === 'PROJECT_ROOT_MISMATCH') throw error;
    }
    const parent = path.dirname(existing);
    if (parent === existing) return absolute;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return normalizeWindowsDriveLetter(path.join(fs.realpathSync(existing), ...missing));
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function resolveContainedProjectPath(root, maybePath, label) {
  if (!maybePath) return undefined;
  const requested = path.isAbsolute(maybePath)
    ? maybePath
    : path.resolve(root, maybePath);
  const canonical = canonicalPathIncludingMissing(requested);
  if (!pathIsWithin(root, canonical)) {
    const error = new Error(
      `PROJECT_ROOT_MISMATCH: ${label} resolves outside the configured ArkGate root ` +
        `(${canonical} is not inside ${root}).`
    );
    error.code = 'PROJECT_ROOT_MISMATCH';
    throw error;
  }
  return canonical;
}

function inferLayer(filePath, config, root) {
  if (!filePath) return undefined;
  return layerForFile(root, filePath, config.layers);
}

async function loadArk() {
  const url = new URL('../dist/index.js', import.meta.url);
  if (!fs.existsSync(url)) {
    throw new Error(
      'ark-mcp requires the built library at dist/index.js, and this install does not have it. ' +
        'The npm tarball ships dist/; a git install (git+https://…/arkgate) ships only the ' +
        'committed sources, so arkgate/arkgate-check work but ark-mcp and every "import arkgate*" ' +
        'do not. Install from npm (npm i arkgate); building is only possible in a clone of the ' +
        'repository, not in this node_modules copy, which ships no devDependencies. ' +
        'See docs/package-surface.md, "Installing from git".'
    );
  }
  try {
    return await import('../dist/index.js');
  } catch (err) {
    throw new Error(
      `ark-mcp failed to load dist/index.js — it exists but will not import, so this is a ` +
        `broken or partial build rather than a git install (rebuild with "npm run build" in a ` +
        `clone of the repository): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/** Inputs whose candidate contents are not modeled by the source-only virtual overlay. */
function isResolvedAnalysisInput(relativePath, args, compilerInputs = new Set()) {
  const relative = String(relativePath).replace(/\\/g, '/');
  try {
    const candidate = resolvedInputIdentities(args.root, [relative]);
    const known = resolvedInputIdentities(args.root, [
      args.config, args.manifest, args.tsconfig, ...compilerInputs,
    ]);
    if ([...candidate].some((identity) => known.has(identity))) return true;
  } catch {
    return true;
  }

  const basename = path.posix.basename(relative);
  if (basename === 'package.json') return true;
  if (/^(?:tsconfig|jsconfig)(?:\.[^/]+)?\.jsonc?$/i.test(basename)) return true;
  if (
    ['pnpm-workspace.yaml', 'pnpm-workspace.yml', 'lerna.json', 'nx.json'].includes(basename)
  ) {
    return true;
  }
  return /(?:^|\/)configs?\/[^/]+\.jsonc?$/i.test(relative);
}

function hookEnforcement(root, host, operation, completePatch = false) {
  return detectWritePathCapabilities(root, host, {
    boundary: 'pre-tool',
    operation,
    completePatch,
  }).enforcementLadder;
}

function extraMergeTeethClassification(root, config) {
  const files = collectGovernedFiles(root, config);
  const layers = config.layers ?? [];
  let classified = 0;
  const populated = new Set();
  for (const abs of files) {
    const layer = layerForFile(root, abs, layers);
    if (layer) {
      classified += 1;
      populated.add(layer);
    }
  }
  return {
    governedPercent: files.length > 0 ? Math.round((classified / files.length) * 100) : 0,
    populatedLayerCount: populated.size,
  };
}

function arkRunSnippetContext({ root, config, filePath, layer, relFile, classification }) {
  const extra = config?.arkRun;
  if (!extra) return { layer, filePath };
  const relative =
    relFile ||
    (typeof filePath === 'string'
      ? path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/')
      : undefined);
  return {
    layer,
    filePath,
    relFile: relative,
    arkRun: extra,
    layers: config.layers ?? [],
    classification: classification ?? extraMergeTeethClassification(root, config),
  };
}

function designDeltaViolations(delta) {
  return (delta?.changes ?? []).map((change) => ({
    ruleId: 'DESIGN_SMELL_REGRESSION',
    file: change.evidence.path,
    line: change.evidence.line,
    target: change.fingerprint,
    message:
      `[${change.smellId}] ${change.evidence.symbol ?? change.evidence.path} is a ` +
      `${change.classification} supported design smell (${change.evidence.kind}).`,
    suggestion: change.repairHint,
  }));
}

/**
 * One-shot PreToolUse gate (Claude Code + Grok Build hook contracts): payload on stdin,
 * exit 2 + violations on stderr to block, exit 0 to allow. Grok also receives a deny
 * decision JSON on stdout. Gate plumbing problems (no stdin, malformed JSON, non-file
 * tools, non-source files) never block the agent.
 */
function runHook(gate, config, args, ts, hookInput) {
  let payload;
  try {
    payload = JSON.parse(hookInput ?? fs.readFileSync(0, 'utf8'));
  } catch {
    return;
  }

  runHookPayload(payload, gate, config, args, ts);
}

function processHookOutput() {
  return {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
    status: (value) => {
      process.exitCode = value;
    },
  };
}

function runHookPayload(payload, gate, config, args, ts, attemptContext, output = processHookOutput()) {
  const { toolName, toolInput, grokStyle, antigravityStyle, cursorStyle, operation } =
    normalizeHookPayload(
      payload,
      attemptContext?.grokHookEvent ?? Boolean(process.env.GROK_HOOK_EVENT)
    );
  if (toolName === 'ApplyPatch') {
    // Current Codex CLI/Desktop hook schema uses tool_input.command. Keep the
    // historical fields for older clients and existing integration fixtures.
    const patch =
      toolInput.command ?? toolInput.patch ?? toolInput.input ?? toolInput.content;
    const parsedPatch = codexPatchWrites(patch, args.root);
    // Codex ApplyPatch is only preflighted when Ark can reconstruct every file operation.
    // An incomplete reconstruction must not be mislabeled as atomic or hard enforcement.
    if (!parsedPatch.complete) {
      emitHostAllow(output, { antigravityStyle, cursorStyle });
      return;
    }
    const patchWrites = parsedPatch.writes;
    const patchChangeSet = classifyChangeSet(patchWrites.map((change) => String(change.path)));
    const patchLawGate = evaluateTeamGate({
      changeSet: patchChangeSet,
      contractSession: contractSessionFrom({}),
    });
    if (patchLawGate.deny && patchChangeSet.mixed) {
      const message = patchLawGate.message;
      output.stderr(`Ark architecture gate: ${message}\n`);
      if (grokStyle) {
        output.stdout(`${JSON.stringify({ decision: 'deny', reason: message })}\n`);
      }
      output.status(2);
      return;
    }
    const sourceWrites = patchWrites.filter((change) =>
      isGovernableSourceFile(path.basename(String(change.path)))
    );
    let compilerInputs = new Set();
    const nonSourceWrites = patchWrites.filter(
      (change) => !isGovernableSourceFile(path.basename(String(change.path)))
    );
    if (sourceWrites.length > 0 && nonSourceWrites.length > 0) {
      try {
        compilerInputs = new Set(
          resolvedCompilerInputPaths({
            root: args.root,
            config,
            ts,
            tsconfig: args.tsconfig,
            changes: sourceWrites.map(({ path: relativePath, content, delete: deleted }) =>
              deleted
                ? { path: relativePath, delete: true }
                : { path: relativePath, content }
            ),
          })
        );
      } catch {
        // Without a trustworthy closure, no mixed source/non-source candidate may borrow
        // the source-only resolved verdict.
        compilerInputs = new Set(
          nonSourceWrites.map((change) => String(change.path).replace(/\\/g, '/'))
        );
      }
    }
    const analysisInputWrites = patchWrites.filter((change) =>
      isResolvedAnalysisInput(change.path, args, compilerInputs)
    );
    let canonicalizationError;
    let canonicalSourceWrites = [];
    try {
      canonicalSourceWrites = canonicalizeCandidateChanges({
        root: args.root,
        config,
        changes: sourceWrites,
      });
    } catch (error) {
      canonicalizationError = error;
    }
    const governedWrites = canonicalSourceWrites.filter((change) =>
      isCandidateSourceInScope(config, change.path)
    );
    const changes = governedWrites.map(({ path: relativePath, content, delete: deleted }) =>
      deleted ? { path: relativePath, delete: true } : { path: relativePath, content }
    );
    let result;
    try {
      if (canonicalizationError) throw canonicalizationError;
      if (sourceWrites.length > 0 && analysisInputWrites.length > 0) {
        throw new Error(
          `Complete patch changes resolved-analysis input(s) ${analysisInputWrites
            .map((change) => change.path)
            .sort()
            .join(', ')}; source-only virtual preflight cannot model those contents.`
        );
      }
      if (changes.length === 0) {
        emitHostAllow(output, { antigravityStyle, cursorStyle });
        return;
      }
      result = prepareChangeFromRoot({
        root: args.root,
        config,
        configSource: path.isAbsolute(args.config)
          ? args.config
          : path.join(args.root, args.config),
        changes,
        overlayChanges: sourceWrites.map(({ path: relativePath, content, delete: deleted }) =>
          deleted ? { path: relativePath, delete: true } : { path: relativePath, content }
        ),
        ts,
        tsconfig: args.tsconfig,
        manifest: args.projectManifest,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const adapterResult = createAdapterResult({
        valid: false,
        completeness: 'unavailable',
        mode: 'resolved-candidate-facts',
        violations: [
          {
            ruleId: 'ATOMIC_PREFLIGHT_UNAVAILABLE',
            file: '<change-set>',
            message,
            nextAction: 'Fix the complete patch or analysis environment, then preflight the same patch again.',
          },
        ],
      });
      output.stderr(
        `Ark architecture gate could not preflight this complete ${toolName}: ${message}\n`
      );
      if (args.hookRepair) {
        output.stderr(
          `ARK_REPAIR_JSON:${JSON.stringify({
            ...adapterResult,
            repair: true,
            decision: 'deny',
            enforcement: hookEnforcement(args.root, 'codex', 'apply_patch', true),
            autoPatch: null,
          })}\n`
        );
      }
      if (grokStyle) {
        output.stdout(
          `${JSON.stringify({ decision: 'deny', reason: message, analysis: adapterResult })}\n`
        );
      }
      output.status(2);
      return;
    }
    const designDelta = args.failOnNewSmells
      ? evaluateWriteDesignDelta({ root: args.root, config, changes, ts })
      : null;
    if (result.valid && (designDelta?.valid ?? true)) {
      emitHostAllow(output, { antigravityStyle, cursorStyle });
      return;
    }
    const first = result.diagnostics[0];
    const message = formatWriteGateDeny({
      file: `${changes.length} file(s)`,
      reason: first?.message || `this ${toolName} breaks the architecture layers`,
      ruleId: first?.ruleId,
      nextAction: first?.nextAction,
      extraLines: [
        ...result.diagnostics.slice(1).map((d) => `[${d.ruleId}] ${d.message}`),
        ...(designDelta && !designDelta.valid
          ? formatDesignDeltaBlock(designDelta).split('\n').slice(1)
          : []),
        'No project file was written. Fix the complete patch and retry.',
      ],
    });
    output.stderr(`${message}\n`);
    if (args.hookRepair) {
      output.stderr(
          `ARK_REPAIR_JSON:${JSON.stringify({
            ...result,
            valid: false,
            ...(designDelta ? { designDelta } : {}),
            repair: true,
            decision: 'deny',
          enforcement: hookEnforcement(args.root, 'codex', 'apply_patch', true),
          autoPatch: null,
        })}\n`
      );
    }
    output.status(2);
    return;
  }
  const filePath = toolInput.file_path;
  if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
    // Non-file tools: fail-open. Antigravity still needs an explicit allow decision.
    emitHostAllow(output, { antigravityStyle, cursorStyle });
    return;
  }
  if (typeof filePath !== 'string' || !SOURCE_FILE.test(filePath) || filePath.endsWith('.d.ts')) {
    emitHostAllow(output, { antigravityStyle, cursorStyle });
    return;
  }
  const rel = path.relative(args.root, path.resolve(filePath));
  const segments = rel.split(path.sep);
  if (segments[0] === '..' || segments.includes('node_modules')) {
    emitHostAllow(output, { antigravityStyle, cursorStyle });
    return;
  }
  const normalizedRel = rel.split(path.sep).join('/');
  if (isScanExcludedRelative(normalizedRel, config)) {
    emitHostAllow(output, { antigravityStyle, cursorStyle });
    return;
  }

  const source = proposedSource(toolName, toolInput);
  if (typeof source !== 'string') {
    emitHostAllow(output, { antigravityStyle, cursorStyle });
    return;
  }

  const layer = inferLayer(filePath, config, args.root);
  const validateOnce = (src) =>
    validateSnippetAnalysis({
      gate,
      ts,
      source: src,
      context: arkRunSnippetContext({
        root: args.root,
        config,
        filePath,
        layer,
        relFile: normalizedRel,
      }),
    });
  // W1: one validation pass (+ optional autoPatch). Original write still blocked when
  // invalid; hosts must apply autoPatch explicitly (never silent write).
  const result = ts
    ? validateWithAutoPatch({
        source,
        filePath,
        root: args.root,
        ts,
        validate: validateOnce,
        resolveTargetAbs: resolveImportFileAbs,
      })
    : (() => {
        const once = validateOnce(source);
        return {
          valid: Boolean(once.valid),
          completeness: once.completeness,
          completenessReasons: once.completenessReasons,
          violations: once.violations ?? [],
          autoPatch: null,
        };
      })();
  const designDelta = args.failOnNewSmells && layer
    ? evaluateWriteDesignDelta({
        root: args.root,
        config,
        changes: [{ path: normalizedRel, content: source }],
        ts,
      })
    : null;
  if (result.valid && (designDelta?.valid ?? true)) {
    emitHostAllow(output, { antigravityStyle, cursorStyle });
    return;
  }

  // Ratchet semantics (same philosophy as ark-check --baseline): an edit is blocked only
  // when it ADDS violations relative to the file's current on-disk state. Otherwise a
  // pre-existing violation — frozen in a baseline or predating Ark adoption — would make
  // every subsequent edit to that file un-writable while CI passes. Same-file keys ignore
  // line numbers (edits shift them); simpler than full baselineKey (no file/layer fields
  // needed — this file is fixed).
  const violationKey = (violation) => `${violation.ruleId}|${violation.target ?? violation.message}`;
  let existingCounts = new Map();
  try {
    const current = fs.readFileSync(filePath, 'utf8');
    for (const violation of validateOnce(current).violations) {
      if (String(violation.ruleId ?? violation.code).startsWith('ANALYSIS_')) continue;
      const key = violationKey(violation);
      existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
    }
  } catch {
    // New file: nothing pre-exists, every violation is new.
  }
  const newViolations = (result.violations ?? []).filter((violation) => {
    const rule = String(violation.ruleId ?? violation.code);
    // Incremental mid-edit parse errors are normal for agents — do not deny solely on them.
    if (rule === 'ANALYSIS_PARSE_INCOMPLETE') return false;
    if (rule.startsWith('ANALYSIS_')) return true;
    const key = violationKey(violation);
    const remaining = existingCounts.get(key) ?? 0;
    if (remaining === 0) return true;
    existingCounts.set(key, remaining - 1);
    return false;
  });
  if (newViolations.length === 0 && (designDelta?.valid ?? true)) {
    emitHostAllow(output, { antigravityStyle, cursorStyle });
    return;
  }
  const combinedViolations = [...newViolations, ...designDeltaViolations(designDelta)];
  const adapterResult = createAdapterResult({
    valid: false,
    completeness: result.completeness,
    completenessReasons: result.completenessReasons,
    violations: combinedViolations.map((violation) => ({
      ...violation,
      file: violation.file ?? normalizedRel,
    })),
  });

  const firstDiagnostic = adapterResult.diagnostics[0];
  const suggestions = [
    ...new Set(combinedViolations.map((violation) => violation.suggestion).filter(Boolean)),
  ];
  const autoPatch = result.autoPatch;
  // W4: structured repair payload is opt-in (--hook-repair / ARK_HOOK_REPAIR).
  // Default remains hard block with prose only — hosts that cannot re-inject stay clean.
  const repair = Boolean(args.hookRepair);
  const message = formatWriteGateDeny({
    file: rel,
    reason: firstDiagnostic?.message || (layer ? `${layer} write breaks the layers` : 'this write breaks the layers'),
    ruleId: firstDiagnostic?.ruleId,
    nextAction: firstDiagnostic?.nextAction,
    extraLines: [
      ...adapterResult.diagnostics.slice(1).map(
        (diagnostic) =>
          `[${diagnostic.ruleId}] ${diagnostic.message}${diagnostic.location.line ? ` (line ${diagnostic.location.line})` : ''}`
      ),
      ...(suggestions.length > 0 ? suggestions.map((s) => `Fix: ${s}`) : []),
      ...(autoPatch && repair
        ? [
            `autoPatch available (${autoPatch.remediationKind}, confidence ${autoPatch.confidence}): ` +
              'apply the patched source from ARK_AUTOPATCH_JSON / ARK_REPAIR_JSON on stderr' +
              (grokStyle ? ' (or autoPatch in the deny JSON on stdout)' : '') +
              ' instead of re-drafting. Gate still denies this write (never silent apply).',
          ]
        : []),
      ...(autoPatch && !repair
        ? [
            `Mechanical-safe autoPatch is available (${autoPatch.remediationKind}). ` +
              'Enable repair payload with ARK_HOOK_REPAIR=1 or --hook-repair to receive ' +
              'machine-readable source (still hard-blocks; host re-injects).',
          ]
        : []),
    ],
  });
  output.stderr(message + '\n');

  if (repair) {
    // Structured envelope for any host that can re-inject. Never writes the file.
    const repairPayload = {
      ...adapterResult,
      ...(designDelta ? { designDelta } : {}),
      repair: true,
      decision: 'deny',
      filePath: normalizedRel,
      enforcement: hookEnforcement(
        args.root,
        attemptContext?.host ??
          (antigravityStyle
            ? 'antigravity'
            : cursorStyle
              ? 'cursor'
              : grokStyle
                ? 'grok'
                : 'claude'),
        attemptContext?.operation ??
          operation ??
          (antigravityStyle
            ? toolName === 'Edit'
              ? 'replace_file_content'
              : toolName === 'MultiEdit'
                ? 'multi_replace_file_content'
                : 'write_to_file'
            : cursorStyle
              ? toolName === 'Edit'
                ? 'StrReplace'
                : 'Write'
              : grokStyle
                ? toolName === 'Edit'
                  ? 'search_replace'
                  : 'write'
                : toolName),
        toolName === 'Write' || Boolean(attemptContext?.completePatch)
      ),
      ...(layer ? { layer } : {}),
      ...(autoPatch
        ? {
            autoPatch: {
              ...autoPatch,
            },
          }
        : { autoPatch: null }),
    };
    output.stderr(`ARK_REPAIR_JSON:${JSON.stringify(repairPayload)}\n`);
    if (autoPatch) {
      output.stderr(`ARK_AUTOPATCH_JSON:${JSON.stringify(autoPatch)}\n`);
    }
  }

  // Grok Build honors { decision: "deny" } on stdout (exit 2 alone is also deny).
  // autoPatch in stdout only when repair mode is on (same opt-in as stderr).
  if (grokStyle) {
    output.stdout(
      JSON.stringify({
        decision: 'deny',
        reason: message,
        analysis: adapterResult,
        ...(designDelta ? { designDelta } : {}),
        ...(repair && autoPatch ? { autoPatch } : {}),
        ...(repair ? { repair: true } : {}),
      }) + '\n'
    );
  }
  // Cursor preToolUse: permission deny + agent_message (exit 2 also blocks).
  if (cursorStyle) {
    output.stdout(
      JSON.stringify({
        permission: 'deny',
        agent_message: message,
        user_message: `ArkGate blocked write to ${rel}`,
      }) + '\n'
    );
  }
  output.status(2);
}

function residentCompilerInputs(ts, args) {
  if (!ts?.readConfigFile || !ts?.parseJsonConfigFileContent) return [];
  const explicit = args.tsconfig
    ? path.isAbsolute(args.tsconfig)
      ? path.resolve(args.tsconfig)
      : path.resolve(args.root, args.tsconfig)
    : undefined;
  const top = explicit ?? ts.findConfigFile?.(args.root, ts.sys?.fileExists, 'tsconfig.json');
  if (!top) return [];
  const inputs = new Set();
  const readFile = (fileName) => {
    const absolute = path.resolve(fileName);
    inputs.add(absolute);
    try {
      return fs.readFileSync(absolute, 'utf8');
    } catch {
      return undefined;
    }
  };
  try {
    const read = ts.readConfigFile(top, readFile);
    if (!read.error) {
      ts.parseJsonConfigFileContent(
        read.config,
        {
          useCaseSensitiveFileNames: ts.sys?.useCaseSensitiveFileNames ?? true,
          readDirectory: () => [],
          fileExists: ts.sys?.fileExists ?? fs.existsSync,
          readFile,
        },
        path.dirname(top),
        undefined,
        top
      );
    }
  } catch {
    // The current one-shot runtime remains the fail-closed authority on malformed input.
  }
  return [...inputs];
}

function residentHookInputs(ts, args) {
  const configPath = path.isAbsolute(args.config)
    ? args.config
    : path.join(args.root, args.config);
  const manifestPath = args.manifest
    ? path.isAbsolute(args.manifest)
      ? args.manifest
      : path.join(args.root, args.manifest)
    : undefined;
  return [
    configPath,
    ...(manifestPath ? [manifestPath] : []),
    ...residentCompilerInputs(ts, args),
    ...[
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'yarn.lock',
      '.yarnrc.yml',
    ].map((relative) => path.join(args.root, relative)),
  ];
}

function captureResidentHook(payload, gate, config, args, ts, request) {
  let stdout = '';
  let stderr = '';
  let status = 0;
  const requestArgs = {
    ...args,
    root: request.root,
    config: request.config,
    manifest: request.manifest ?? undefined,
    tsconfig: request.tsconfig ?? undefined,
  };
  runHookPayload(
    payload,
    gate,
    config,
    {
      ...requestArgs,
      hookRepair: request.hookRepair === true,
      failOnNewSmells: request.failOnNewSmells === true,
    },
    ts,
    { grokHookEvent: request.grokHookEvent === true },
    {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
      status: (value) => {
        status = value;
      },
    }
  );
  return { stdout, stderr, status };
}

function sameResidentInvocation(request, args, kind) {
  return (
    request?.protocolVersion === RESIDENT_HOOK_PROTOCOL_VERSION &&
    request?.kind === kind &&
    typeof request.root === 'string' &&
    JSON.stringify(residentInvocationIdentity(request)) ===
      JSON.stringify(residentInvocationIdentity(args))
  );
}

function snapshotInputPaths(inputs) {
  if (inputs instanceof Map) return [...inputs.keys()];
  return [...(inputs ?? [])]
    .map((entry) => (typeof entry === 'string' ? entry : entry?.path))
    .filter((entry) => typeof entry === 'string');
}

function collectDoctorProject(root, config) {
  const directories = [];
  const files = collectGovernedFiles(root, config, {
    onDirectory: (lexical, real) => directories.push(lexical, real),
  });
  return { files, paths: [...files, ...directories] };
}

function createResidentDoctorSession(args, config, ts) {
  const rules = args.projectManifest?.architecture?.rules ?? config.rules;
  const before = collectDoctorProject(args.root, config);
  const beforeLedger = createResidentInputLedger(before.paths);
  const snapshot = resolveArchitectureSnapshot({
    root: args.root,
    config,
    manifest: args.projectManifest,
    rules,
    files: before.files,
    ts,
    args,
  });
  const after = collectDoctorProject(args.root, config);
  if (!beforeLedger.matches(after.paths)) return null;
  const resolutionInputs = snapshotInputPaths(snapshot.inputs);
  const ledger = createResidentInputLedger([...after.paths, ...resolutionInputs]);
  if (!ledger.matches([...after.paths, ...resolutionInputs])) return null;
  return { root: args.root, files: after.files, ledger, resolutionInputs, rules, snapshot };
}

function verifyResidentDoctorSession(session) {
  return session.ledger.matches();
}

function renderResidentDoctor(session, args, config, ts) {
  let stdout = '';
  const files = session.files.map((file) =>
    path.resolve(args.root, path.relative(session.root, file))
  );
  runDoctor(args.root, config, files, session.rules, session.snapshot.result.violations, true, {
    configPath: path.isAbsolute(args.config) ? args.config : path.join(args.root, args.config),
    configMissing: !fs.existsSync(
      path.isAbsolute(args.config) ? args.config : path.join(args.root, args.config)
    ),
    safety: session.snapshot.result.safety,
    ts,
    parseHealth: session.snapshot.result.parseHealth,
    completeness: session.snapshot.result.completeness,
    writeJson: (value) => {
      stdout += `${value}\n`;
    },
  });
  const result = session.snapshot.result;
  return {
    protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION,
    fallback: false,
    mode: 'resident-warm',
    resultCache: false,
    snapshotReuse: true,
    analysisIdentity: {
      policyHash: result.policyHash,
      resolverIdentity: result.resolverIdentity,
      factsHash: result.factsHash,
      candidateTreeHash: result.candidateTreeHash,
    },
    status: 0,
    stdout,
    stderr: '',
  };
}

async function startResidentHookControl({ args, gate, config, ts, loadedTypeScript, version }) {
  if (process.env.ARK_RESIDENT_HOOK !== '1') return null;
  const endpoint = residentHookEndpoint({
    root: args.root,
    config: args.config,
    manifest: args.manifest,
    tsconfig: args.tsconfig,
    launcher: arkMcpLauncher,
  });
  const identityPaths = [
    ...residentHookInputs(ts, args),
    ...(loadedTypeScript?.resolvedPath ? [loadedTypeScript.resolvedPath] : []),
  ];
  const identityTokens = [
    version,
    loadedTypeScript?.source ?? 'unavailable',
    loadedTypeScript?.version ?? 'unknown',
    loadedTypeScript?.resolvedPath ?? 'unresolved',
  ];
  const initialIdentity = residentEnvironmentIdentity(identityPaths, identityTokens);
  let doctorSession;
  let doctorRefresh;
  const refreshDoctor = () => {
    if (!doctorRefresh) {
      doctorRefresh = Promise.resolve()
        .then(() => createResidentDoctorSession(args, config, ts))
        .then((session) => {
          doctorSession = session ?? undefined;
          return doctorSession;
        })
        .catch(() => undefined)
        .finally(() => {
          doctorRefresh = undefined;
        });
    }
    return doctorRefresh;
  };
  return startResidentHookServer({
    endpoint,
    async handle(request) {
      const currentIdentity = residentEnvironmentIdentity(identityPaths, identityTokens);
      if (currentIdentity !== initialIdentity) {
        return { protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION, fallback: true };
      }
      if (sameResidentInvocation(request, args, 'hook')) {
        const result = captureResidentHook(request.payload, gate, config, args, ts, request);
        return {
          protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION,
          fallback: false,
          mode: 'resident-warm',
          resultCache: false,
          environmentIdentity: initialIdentity,
          ...result,
        };
      }
      if (
        !sameResidentInvocation(request, args, 'doctor') ||
        JSON.stringify(request.environment) !== JSON.stringify(residentDoctorEnvironment())
      ) {
        return { protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION, fallback: true };
      }
      let verified = doctorSession ? verifyResidentDoctorSession(doctorSession) : false;
      if (!verified) {
        doctorSession = undefined;
        await refreshDoctor();
        verified = doctorSession ? verifyResidentDoctorSession(doctorSession) : false;
      }
      if (!doctorSession || !verified) {
        return { protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION, fallback: true };
      }
      const response = renderResidentDoctor(
        doctorSession,
        {
          ...args,
          root: request.root,
          config: request.config,
          manifest: request.manifest ?? undefined,
          tsconfig: request.tsconfig ?? undefined,
        },
        config,
        ts
      );
      if (!verifyResidentDoctorSession(doctorSession)) {
        doctorSession = undefined;
        return { protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION, fallback: true };
      }
      return response;
    },
  });
}

function runArkCheckJsonFromRoot(root, config, extraArgs, manifest, tsconfig) {
  const manifestArgs = manifest ? ['--manifest', manifest] : [];
  const tsconfigArgs = tsconfig ? ['--tsconfig', tsconfig] : [];
  const result = spawnSync(
    process.execPath,
    [
      arkCheckBin,
      '--root',
      root,
      '--config',
      config,
      ...manifestArgs,
      ...tsconfigArgs,
      '--json',
      ...extraArgs,
    ],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 }
  );
  if (result.error) {
    return {
      data: null,
      raw: `ark-check failed to execute: ${result.error.message}`,
    };
  }
  const stdout = result.stdout ?? '';
  try {
    return { data: JSON.parse(stdout), raw: stdout };
  } catch {
    return { data: null, raw: stdout || result.stderr || 'ark-check produced no output' };
  }
}

/**
 * One-shot SessionStart context: a compact summary of the contract on stdout so the
 * agent starts the session already knowing the architecture. Advisory — never blocks
 * and never exits non-zero for missing optional inputs (e.g. no baseline file).
 */
function printSessionContext(config, profile, forbiddenGlobals, args, configPath) {
  const lines = ['Ark architecture contract governs this project (ark.config.json is authoritative).'];

  const configLayers = Array.isArray(config.layers) ? config.layers : [];
  if (configLayers.length > 0) {
    lines.push('Layers:');
    for (const layer of configLayers) {
      const globals = forbiddenGlobals[layer.name];
      const globalsNote = globals ? ` — forbidden globals: ${globals.join(', ')}` : '';
      lines.push(`  - ${layer.name}: ${(layer.patterns ?? []).join(', ')}${globalsNote}`);
    }
  } else {
    lines.push(
      `Layers: none configured — the default 11-layer profile applies to intent references.`
    );
  }

  const denied = (profile.rules ?? []).filter((rule) => !rule.allowed).length;
  lines.push(
    `Rules: ${denied} denied layer edge(s). Full contract: project-bound ark_manifest MCP tool.`
  );

  // Advisory output: a malformed baseline must not abort the summary.
  let baseline;
  try {
    baseline = readJson(path.join(args.root, '.ark-baseline.json'));
  } catch {
    baseline = undefined;
  }
  if (Array.isArray(baseline?.violations)) {
    lines.push(
      `Baseline: ${baseline.violations.length} frozen violation(s) — only NEW violations fail; do not add to them.`
    );
  }

  lines.push(
    `After edits run: ${arkCommand(args.root, 'ark-check', '--root . --config ark.config.json --strict-config')}`
  );
  lines.push('If Ark reports violations, fix the architecture instead of weakening the gate.');

  const { data: coverage } = runArkCheckJsonFromRoot(args.root, args.config, ['--coverage'], undefined);
  const governedPercent = coverage?.coverage?.governed?.percent ?? coverage?.governed?.percent;
  if (shouldShowNewHereNudge(args.root, configPath, governedPercent, false)) {
    lines.push('');
    lines.push('New to Ark? /ark-adopt or: arkgate-check --doctor');
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

export async function runArkMcp({ hookInput } = {}) {
  const processStartedAt = new Date().toISOString();
  const runtimeId = randomUUID();
  const args = parseArgs(process.argv);
  const requestedRoot = args.root;
  const resolvedRoot = canonicalPathIncludingMissing(requestedRoot);
  // MCP identity and file containment use the canonical workspace. Hook payloads,
  // however, carry paths in the caller's spelling (macOS commonly aliases /var to
  // /private/var); keep that spelling so same-workspace writes are not mistaken for
  // out-of-root paths.
  if (!args.hook && !args.sessionContext) args.root = resolvedRoot;
  const configPath = resolveContainedProjectPath(resolvedRoot, args.config, 'ark.config.json');

  // SessionStart contract injection is only meaningful in Ark-governed projects. Bail
  // out silently (before loading dist) when there is no config, so the hook is safe
  // even if a user installs it in their GLOBAL settings instead of per-project.
  if (args.sessionContext && !(configPath && fs.existsSync(configPath))) {
    return;
  }

  const ark = await loadArk();
  const loadedTypeScript = await loadTypeScript(args.root);
  const ts = loadedTypeScript.ts ?? undefined;

  const config =
    (configPath ? readArkConfig(configPath, { required: args.configExplicit }) : undefined) ??
    loadArkConfigContract(
      { include: ['src'], layers: [], rules: DEFAULT_RULES },
      configPath ?? 'ark.config.json'
    ).config;
  if (!config.layers || config.layers.length === 0) {
    process.stderr.write(
      '[ark-mcp] warning: no layers configured — file→layer inference from config patterns ' +
        'is unavailable, so layer-reference checks run only when the caller passes an explicit ' +
        '"layer" (checked against the default 11-layer profile).\n'
    );
  }

  const manifestPath = resolveContainedProjectPath(resolvedRoot, args.manifest, 'project manifest');
  const projectManifest = manifestPath ? readJson(manifestPath, { required: true }) : undefined;
  if (args.tsconfig) {
    args.tsconfig = resolveContainedProjectPath(resolvedRoot, args.tsconfig, 'TypeScript config');
  }
  args.projectManifest = projectManifest;

  const intents = Array.isArray(projectManifest?.intents)
    ? projectManifest.intents.map((i) => (typeof i === 'string' ? i : i?.name)).filter(Boolean)
    : [];

  // Build the enforcement profile with the SAME semantics ark-check (CI) applies to the
  // config, so the write-path gate and CI can't disagree:
  //   - rules: config.rules ?? DEFAULT_RULES  (ark-check readConfig substitutes DEFAULT_RULES)
  //   - intent prefixes: the config layers that declare intentPrefixes; when none do, fall
  //     back to DEFAULT_INTENT_PREFIXES (mirrors ark-check's layerForIntent fallback).
  // Only layers WITH prefixes enter the profile, so no layer has empty prefixes (which would
  // also make it unresolvable). A project with no layers at all gets the 11-layer default.
  const configLayers = Array.isArray(config.layers) ? config.layers : [];
  const manifestLayers = Array.isArray(projectManifest?.architecture?.layers)
    ? projectManifest.architecture.layers
    : [];
  const usedProjectConfig = configLayers.length > 0;
  let profile;
  if (manifestLayers.length > 0) {
    profile = ark.createArchitectureProfile({
      name: projectManifest.architecture.profile ?? 'manifest',
      layers: manifestLayers.map((layer) => ({
        name: layer.name,
        prefixes: layer.prefixes,
      })),
      rules: projectManifest.architecture.rules ?? DEFAULT_RULES,
    });
  } else if (!usedProjectConfig) {
    profile = ark.elevenLayerProfile;
  } else {
    const layersWithPrefixes = configLayers.filter(
      (layer) => (layer.intentPrefixes ?? []).length > 0
    );
    const profileLayers =
      layersWithPrefixes.length > 0
        ? layersWithPrefixes.map((layer) => ({ name: layer.name, prefixes: layer.intentPrefixes }))
        : DEFAULT_INTENT_PREFIXES.map((d) => ({ name: d.layer, prefixes: d.prefixes }));
    profile = ark.createArchitectureProfile({
      name: 'ark.config',
      layers: profileLayers,
      rules: config.rules ?? DEFAULT_RULES,
    });
  }

  // Layer → forbidden ambient globals, straight from ark.config.json. Enforced by the
  // gate only when the target file's layer is known (same data ark-check enforces in CI).
  const forbiddenGlobals = Object.fromEntries(
    configLayers
      .filter(
        (layer) =>
          layer.name &&
          Array.isArray(layer.forbiddenGlobals) &&
          layer.forbiddenGlobals.some((entry) => typeof entry === 'string')
      )
      .map((layer) => [
        layer.name,
        layer.forbiddenGlobals.filter((entry) => typeof entry === 'string'),
      ])
  );

  // Layer → effective capability deny set (U04 walls). Same opt-in surface the
  // CLI enforces; the gate applies it whenever the target file's layer is known.
  const capabilityWalls = Object.fromEntries(
    configLayers
      .map((layer) => [layer.name, effectiveCapabilityDeny(layer)])
      .filter(([name, deny]) => name && deny.length > 0)
  );

  // Layers explicitly flagged as infrastructure in ark.config.json may import
  // infrastructure — the built-in infra-import heuristics skip them (in addition
  // to layers whose name conventionally signals an infra role). Lets a project
  // with an unconventionally-named infra layer opt in without renaming.
  const infrastructureLayers = configLayers
    .filter((layer) => layer.name && layer.mayImportInfrastructure === true)
    .map((layer) => layer.name);

  const gate = ark.createAICodeGate({
    architectureProfile: profile,
    intents,
    enforceIntentAllowlist: intents.length > 0,
    typescript: ts,
    forbiddenGlobals,
    capabilityWalls,
    infrastructureLayers,
    // Contract-first: one resolve step yields layer + relPath for rules + peerIsolation.
    resolveImportTarget: createImportTargetResolver(ts, args.root, config),
    architectureLayers: configLayers.map((layer) => ({
      name: layer.name,
      patterns: layer.patterns,
    })),
    allowNonLiteralDynamicImport: (filePath) => {
      if (!filePath || !Array.isArray(config.dynamicImportAllowlist)) return false;
      const rel = path.relative(args.root, path.resolve(args.root, filePath)).split(path.sep).join('/');
      return config.dynamicImportAllowlist.some((pattern) => {
        if (typeof pattern !== 'string') return false;
        try {
          return globToRegExp(pattern).test(rel);
        } catch {
          return false;
        }
      });
    },
  });

  if (args.hook) {
    runHook(gate, config, args, ts, hookInput);
    return;
  }

  if (args.sessionContext) {
    printSessionContext(config, profile, forbiddenGlobals, args, configPath);
    return;
  }

  const effectiveArkRulesSnapshot = (() => {
    try {
      const loaded = loadEffectiveArkRulesFromDisk(args.root, config);
      return {
        arkRules: loaded.arkRules ?? null,
        warnings: loaded.warnings ?? [],
        errors: loaded.errors ?? [],
      };
    } catch (error) {
      return {
        arkRules: null,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  })();

  const residentHookControl = await startResidentHookControl({
    args,
    gate,
    config,
    ts,
    loadedTypeScript,
    version: ark.version,
  });
  if (residentHookControl) process.once('exit', residentHookControl.cleanup);

  const SERVER_INFO = { name: 'arkgate', version: ark.version };
  const DEFAULT_PROTOCOL = '2024-11-05';
  const projectIdentity = createProjectIdentity({
    projectId: createProjectId(resolvedRoot, configPath, sha256Hex),
    resolvedRoot,
    resolvedConfigPath: configPath,
    arkgateVersion: ark.version,
    contractHash: `sha256:${sha256Hex(
      stableSerialize({
        config,
        projectManifest: projectManifest ?? null,
        arkRules: effectiveArkRulesSnapshot,
      })
    )}`,
    contractSource: projectManifest
      ? 'manifest'
      : fs.existsSync(configPath)
        ? 'project'
        : 'default-profile',
    runtimeId,
    processStartedAt,
  });
  const projectIdentityOutputSchema = {
    type: ARK_PROJECT_IDENTITY_SCHEMA.type,
    additionalProperties: ARK_PROJECT_IDENTITY_SCHEMA.additionalProperties,
    required: ARK_PROJECT_IDENTITY_SCHEMA.required,
    properties: ARK_PROJECT_IDENTITY_SCHEMA.properties,
  };
  const verificationOutputSchema = {
    anyOf: [{ type: 'boolean' }, { const: 'unverified' }],
  };
  const checkVerdictOutputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['identity', 'completeness', 'graph', 'coverage', 'gates', 'overallOk'],
    properties: {
      identity: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'ok'],
        properties: {
          status: { enum: ['matched', 'unverified', 'mismatch'] },
          ok: { type: 'boolean' },
        },
      },
      completeness: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'ok'],
        properties: {
          status: { type: 'string', minLength: 1 },
          ok: { type: 'boolean' },
        },
      },
      graph: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'violations'],
        properties: {
          ok: { type: 'boolean' },
          violations: { type: ['integer', 'null'], minimum: 0 },
        },
      },
      coverage: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'governedPercent', 'unclassified', 'emptyScope'],
        properties: {
          ok: { type: 'boolean' },
          governedPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
          unclassified: { type: ['integer', 'null'], minimum: 0 },
          emptyScope: { type: ['boolean', 'null'] },
        },
      },
      gates: {
        type: 'object',
        additionalProperties: false,
        required: [
          'ok',
          'localWriteActive',
          'advisoryMcpActive',
          'advisoryMcpRuntimeObserved',
          'ciMergeActive',
        ],
        properties: {
          ok: { type: 'boolean' },
          localWriteActive: verificationOutputSchema,
          advisoryMcpActive: { const: true },
          advisoryMcpRuntimeObserved: { const: true },
          ciMergeActive: verificationOutputSchema,
        },
      },
      overallOk: { type: 'boolean' },
    },
  };
  const analysisResultWithProjectSchema = {
    type: ARK_ANALYSIS_RESULT_SCHEMA.type,
    additionalProperties: ARK_ANALYSIS_RESULT_SCHEMA.additionalProperties,
    allOf: ARK_ANALYSIS_RESULT_SCHEMA.allOf,
    required: [
      ...(ARK_ANALYSIS_RESULT_SCHEMA.required ?? []),
      'projectIdentity',
      'binding',
      'authoritative',
    ],
    properties: {
      ...ARK_ANALYSIS_RESULT_SCHEMA.properties,
      projectIdentity: projectIdentityOutputSchema,
      binding: PROJECT_BINDING_SCHEMA,
      authoritative: { type: 'boolean' },
      verdict: checkVerdictOutputSchema,
    },
  };
  const projectBindingErrorSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'error', 'projectIdentity', 'binding', 'authoritative'],
    properties: {
      ok: { const: false },
      error: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', minLength: 1 },
          message: { type: 'string', minLength: 1 },
        },
      },
      projectIdentity: projectIdentityOutputSchema,
      binding: PROJECT_BINDING_SCHEMA,
      authoritative: { type: 'boolean' },
    },
  };
  const projectAwareAnalysisResultSchema = {
    oneOf: [analysisResultWithProjectSchema, projectBindingErrorSchema],
  };

  function unverifiedBinding() {
    return {
      status: 'unverified',
      authoritative: false,
      message:
        'No project expectation was supplied. Call ark_identity with project.expectedRoot ' +
        'before treating MCP evidence as authoritative.',
    };
  }

  function mismatchBinding(code, message, expectation = {}) {
    return {
      status: 'mismatch',
      authoritative: false,
      ...(expectation.expectedRoot ? { expectedRoot: expectation.expectedRoot } : {}),
      ...(expectation.expectedProjectId
        ? { expectedProjectId: expectation.expectedProjectId }
        : {}),
      code,
      message,
    };
  }

  function nestedProjectConfig(expectedRoot) {
    let current = expectedRoot;
    while (pathIsWithin(resolvedRoot, current) && current !== resolvedRoot) {
      const candidate = path.join(current, 'ark.config.json');
      if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return undefined;
  }

  function bindingForExpectation(expectation) {
    if (expectation === undefined) return unverifiedBinding();
    if (!expectation || typeof expectation !== 'object' || Array.isArray(expectation)) {
      return mismatchBinding(
        'INVALID_PROJECT_EXPECTATION',
        'project must be an object containing expectedRoot and/or expectedProjectId.'
      );
    }
    const rawExpectedRoot = expectation.expectedRoot;
    const rawExpectedProjectId = expectation.expectedProjectId;
    if (
      rawExpectedRoot !== undefined &&
      (typeof rawExpectedRoot !== 'string' ||
        rawExpectedRoot.trim() === '' ||
        !path.isAbsolute(rawExpectedRoot))
    ) {
      return mismatchBinding(
        'INVALID_PROJECT_EXPECTATION',
        'project.expectedRoot must be a non-empty absolute path.'
      );
    }
    if (
      rawExpectedProjectId !== undefined &&
      (typeof rawExpectedProjectId !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(rawExpectedProjectId))
    ) {
      return mismatchBinding(
        'INVALID_PROJECT_EXPECTATION',
        'project.expectedProjectId must be a sha256:<64 lowercase hex> identity.'
      );
    }
    if (rawExpectedRoot === undefined && rawExpectedProjectId === undefined) {
      return unverifiedBinding();
    }
    if (rawExpectedRoot === undefined) {
      if (rawExpectedProjectId !== projectIdentity.projectId) {
        return mismatchBinding(
          'PROJECT_ID_MISMATCH',
          `Expected project id ${rawExpectedProjectId}, but this MCP is bound to ` +
            `${projectIdentity.projectId}.`,
          { expectedProjectId: rawExpectedProjectId }
        );
      }
      return {
        status: 'unverified',
        authoritative: false,
        expectedProjectId: rawExpectedProjectId,
        message:
          'project.expectedProjectId matched, but expectedRoot is required for an ' +
          'authoritative workspace binding.',
      };
    }

    let expectedRoot;
    try {
      expectedRoot = canonicalPathIncludingMissing(rawExpectedRoot);
    } catch (error) {
      return mismatchBinding(
        'PROJECT_ROOT_MISMATCH',
        error instanceof Error ? error.message : String(error),
        { expectedRoot: rawExpectedRoot, expectedProjectId: rawExpectedProjectId }
      );
    }
    if (!pathIsWithin(resolvedRoot, expectedRoot)) {
      return mismatchBinding(
        'PROJECT_ROOT_MISMATCH',
        `Expected workspace ${expectedRoot}, but this ArkGate MCP is bound to ${resolvedRoot}.`,
        { expectedRoot, expectedProjectId: rawExpectedProjectId }
      );
    }
    const nestedConfig = nestedProjectConfig(expectedRoot);
    if (nestedConfig && nestedConfig !== configPath) {
      return mismatchBinding(
        'PROJECT_ROOT_MISMATCH',
        `Expected workspace ${expectedRoot} belongs to a nested ArkGate project at ` +
          `${nestedConfig}, but this MCP is bound to ${configPath}.`,
        { expectedRoot, expectedProjectId: rawExpectedProjectId }
      );
    }

    if (
      rawExpectedProjectId !== undefined &&
      rawExpectedProjectId !== projectIdentity.projectId
    ) {
      return mismatchBinding(
        'PROJECT_ID_MISMATCH',
        `Expected project id ${rawExpectedProjectId}, but this MCP is bound to ` +
          `${projectIdentity.projectId}.`,
        { expectedRoot, expectedProjectId: rawExpectedProjectId }
      );
    }
    if (expectedRoot !== resolvedRoot && rawExpectedProjectId === undefined) {
      return {
        status: 'unverified',
        authoritative: false,
        expectedRoot,
        message:
          `Expected workspace ${expectedRoot} is inside this MCP project, but an exact project ` +
          'root is required for the initial authoritative handshake. Call ark_identity at the ' +
          `project root ${resolvedRoot}, then reuse its projectIdentity.projectId for descendant calls.`,
      };
    }
    return {
      status: 'matched',
      authoritative: true,
      ...(expectedRoot ? { expectedRoot } : {}),
      ...(rawExpectedProjectId ? { expectedProjectId: rawExpectedProjectId } : {}),
    };
  }

  function bindingForToolPaths(toolName, toolArguments, currentBinding) {
    if (currentBinding.status === 'mismatch') return currentBinding;
    const candidates = [];
    if (['validate_code', 'ark_place', 'ark_prepare_write'].includes(toolName)) {
      candidates.push(toolArguments?.filePath);
    }
    if (toolName === 'ark_prepare_change') {
      for (const change of toolArguments?.changes ?? []) candidates.push(change?.path);
      for (const file of toolArguments?.changeMap?.files ?? []) candidates.push(file?.path);
    }
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || candidate === '') continue;
      const absolute = path.isAbsolute(candidate)
        ? candidate
        : path.resolve(resolvedRoot, candidate);
      let canonical;
      try {
        canonical = canonicalPathIncludingMissing(absolute);
      } catch (error) {
        return mismatchBinding(
          'PROJECT_ROOT_MISMATCH',
          error instanceof Error ? error.message : String(error),
          {
            expectedRoot: currentBinding.expectedRoot,
            expectedProjectId: currentBinding.expectedProjectId,
          }
        );
      }
      if (!pathIsWithin(resolvedRoot, canonical)) {
        return mismatchBinding(
          'PROJECT_ROOT_MISMATCH',
          `Tool ${toolName} received ${canonical}, which is outside the MCP project root ` +
            `${resolvedRoot}.`,
          {
            expectedRoot: currentBinding.expectedRoot,
            expectedProjectId: currentBinding.expectedProjectId,
          }
        );
      }
    }
    return currentBinding;
  }

  /**
   * FX06 — process package vs project install honesty (multi-project field truth).
   * Process arkgateVersion is startup-loaded; after consumer `npm i arkgate@newer`,
   * long-lived MCP can report a stale process version until restart.
   * Algorithm lives in bin/lib/mcp-process-package.mjs for unit coverage.
   */
  function processPackageHonesty() {
    return buildProcessPackageHonesty({
      processVersion: typeof ark.version === 'string' ? ark.version : null,
      root: resolvedRoot,
    });
  }

  function contextFor(binding) {
    const processPackage = processPackageHonesty();
    return {
      projectIdentity,
      binding,
      // A correctly bound project is still non-authoritative when this long-lived
      // process loaded a different package version than the project now resolves.
      authoritative: binding.authoritative && !processPackage.processStale,
      processPackage,
    };
  }

  function withProjectContext(result, binding) {
    const context = contextFor(binding);
    const content = Array.isArray(result?.content)
      ? result.content.map((block) => {
          if (block?.type !== 'text' || typeof block.text !== 'string') return block;
          let body;
          try {
            body = JSON.parse(block.text);
          } catch {
            body = result?.isError
              ? {
                  ok: false,
                  error: {
                    code: 'ARK_TOOL_ERROR',
                    message: block.text,
                  },
                }
              : { ok: true, result: block.text };
          }
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            body = { ok: !result?.isError, result: body };
          }
          return {
            ...block,
            text: JSON.stringify({ ...body, ...context }, null, 2),
          };
        })
      : [{ type: 'text', text: JSON.stringify(context, null, 2) }];
    let structuredContent =
      result?.structuredContent &&
      typeof result.structuredContent === 'object' &&
      !Array.isArray(result.structuredContent)
        ? { ...result.structuredContent, ...context }
        : undefined;
    if (!structuredContent && content[0]?.type === 'text') {
      try {
        const parsed = JSON.parse(content[0].text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          structuredContent = parsed;
        }
      } catch {
        /* withProjectContext always renders text blocks as JSON above */
      }
    }
    return {
      ...result,
      ...context,
      content,
      ...(structuredContent ? { structuredContent } : {}),
    };
  }

  function bindingFailureResult(binding) {
    return withProjectContext(
      {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: {
                code: binding.code,
                message: binding.message,
              },
            }),
          },
        ],
        isError: true,
      },
      binding
    );
  }

  function staleProcessFailureResult(binding) {
    const processPackage = processPackageHonesty();
    return withProjectContext(
      {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: {
                code: 'PROCESS_PACKAGE_STALE',
                message: processPackage.nextAction,
              },
            }),
          },
        ],
        isError: true,
      },
      binding
    );
  }

  const TOOLS = [
    {
      name: 'ark_identity',
      description:
        'First call. Prove this MCP process is the right project: pass project.expectedRoot ' +
        '(exact absolute root) and reuse the returned projectId. Do this before any other Ark tool. ' +
        'A missing/unmatched root or processPackage.processStale means restart/retarget the host ' +
        'and use the project-local CLI until identity and package versions align.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'ark_manifest',
      description:
        'Return the machine-readable architecture contract with an authoritative project ' +
        'binding when project.expectedRoot matches this MCP project. Prefer this tool over ' +
        'the ark://manifest compatibility resource, whose standard MCP read shape cannot ' +
        'carry a portable project expectation.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'validate_code',
      description:
        "Validate a source snippet about to be written against Ark's architecture " +
        '(forbidden infra imports, unknown intents, and layer-reference violations). ' +
        'Bind to PreToolUse on Write/Edit to block architecturally-invalid generated code. ' +
        'Returns { valid, violations, autoPatch? }. autoPatch (when present) is a ' +
        'mechanical-safe rewrite of the source (import type conversion) that re-validates green; ' +
        'hosts may apply it instead of re-drafting. isError is true when valid is false.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Full source text about to be written.' },
          layer: {
            type: 'string',
            description:
              'Architecture layer of the target file (e.g. DomainModel). If omitted, ' +
              'inferred from filePath via ark.config.json layer patterns.',
          },
          filePath: {
            type: 'string',
            description: 'Target file path (used to infer layer and for messages).',
          },
        },
        required: ['source'],
      },
      outputSchema: projectAwareAnalysisResultSchema,
    },
    {
      name: 'ark_check',
      description:
        'Scan the project for architecture findings (layer-import violations, forbidden globals, ' +
        'cycles, config warnings). Returns pass/fail/incomplete plus evidence — not a yes/no ' +
        'architecture score. Same engine as arkgate-check. Applies the baseline when one exists. ' +
        'isError when the scan fails. Prefer after ark_identity.',
      inputSchema: {
        type: 'object',
        properties: {
          strict: {
            type: 'boolean',
            description: 'Fail on config warnings too (--strict-config). Default true.',
          },
          baseline: {
            type: 'boolean',
            description:
              'Suppress pre-frozen violations via .ark-baseline.json. Default: auto (on when the file exists).',
          },
        },
      },
      outputSchema: projectAwareAnalysisResultSchema,
    },
    {
      name: 'ark_policy_delta',
      description:
        'Classify a complete ark.config.json transition as strengthening, neutral, ' +
        'judgment-required, or weakening. Pass the previous baseConfig and optional ' +
        'candidateConfig (defaults to this project contract). Weakening and judgment-required ' +
        'results set isError unless acknowledgement exactly matches both policy hashes and all ' +
        'blocking finding ids. Read-only; never edits the contract.',
      inputSchema: {
        type: 'object',
        properties: {
          baseConfig: {
            type: 'object',
            description: 'Previous complete ark.config.json object.',
          },
          candidateConfig: {
            type: 'object',
            description: 'Candidate complete config; defaults to the current project contract.',
          },
          acknowledgement: {
            type: 'object',
            description:
              'Optional schemaVersion/basePolicyHash/candidatePolicyHash/findingIds/reason object.',
          },
        },
        required: ['baseConfig'],
      },
    },
    {
      name: 'ark_coverage',
      description:
        'Report what each layer actually governs: per-layer file counts, the FULL list of ' +
        'unclassified (ungoverned) files, layers whose patterns match nothing, and layers ' +
        'with no rule edge. Use this to audit config coverage instead of hand-rolling ' +
        'find/readdir. Report only — never an error.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'ark_place',
      description:
        'Place a file in the architecture: filePath is required (fail-closed without it — never invents components/*.tsx or defaults to Presentation). ' +
        'Returns layer, mayImport / mustNotImport, forbiddenGlobals, and goldenPattern ' +
        '(load-bearing for NEW code when .ark/golden-pattern.json exists — adopt generates it). ' +
        'Call BEFORE writing a new file. ' +
        'Prefer ark_prepare_write when you already have the source snippet (place+validate+autoPatch in one call).',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path (relative to project root or absolute) of the file to place.',
          },
          description: {
            type: 'string',
            description:
              'What you are building. Does not invent a path — pass filePath. Without filePath the tool fail-closes.',
          },
        },
      },
    },
    {
      name: 'ark_prepare_write',
      description:
        'Prepare a write against the architecture contract: place (filePath and/or description) + ' +
        'constrain (layer, mayImport, mustNotImport, forbiddenGlobals) + validate source + optional ' +
        'mechanical-safe autoPatch + judgmentBrief when judgment is needed + contentHash for host commit. ' +
        'Also returns the versioned new/worsened designDelta for the proposed full file. ' +
        'Composes ark_place + write-gate — call BEFORE Write/Edit when you have the snippet. ' +
        'Returns { filePath, layer, valid, violations?, autoPatch?, judgmentBrief?, contentHash, ... }.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Full source text about to be written.' },
          filePath: {
            type: 'string',
            description: 'Target path (preferred). Used for layer inference and autoPatch resolution.',
          },
          description: {
            type: 'string',
            description: 'When filePath omitted: propose a conventional path from this description.',
          },
          layer: {
            type: 'string',
            description: 'Optional explicit layer override (otherwise inferred from filePath).',
          },
        },
        required: ['source'],
      },
    },
    {
      name: 'ark_prepare_change',
      description:
        'Validate one complete governed-source create/update/delete batch as an atomic in-memory candidate. ' +
        'Catches cross-file forbidden edges and cycles before any host write, and returns ' +
        'per-file content hashes plus base/candidate tree and policy hashes. Never writes files.',
      inputSchema: {
        type: 'object',
        properties: {
          changes: {
            type: 'array',
            description:
              'Full candidate batch. Each item is {path, content} for create/update or {path, delete:true}.',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
                delete: { type: 'boolean' },
              },
              required: ['path'],
            },
          },
          changeMap: {
            type: 'object',
            description:
              'Optional strict schema 1.0 architecture change map. Omit it to use ordinary atomic preflight.',
          },
        },
        required: ['changes'],
      },
    },
    {
      name: 'ark_recommend',
      description:
        'Score this repository against templates/architecture-playbook.json and return the ' +
        'tool-agnostic application shape to adopt (archetype, preset, phased layer plan, ' +
        'analogy, anti-patterns). Same structured output as ark-check --recommend --json. ' +
        'Call BEFORE generating project structure on greenfield or early-adoption repos.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'ark_suggest_include',
      description:
        'Propose ark.config.json include roots from workspaces and nested TypeScript packages ' +
        '(polyglot-safe). Same idea as ark-check --suggest-include. Use when coverage is empty ' +
        'or the contract misses package roots.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'ark_rules_inventory',
      description:
        'Deterministic brownfield rules inventory (AR13): validation-in-controller, magic constants, ' +
        'anemic entities, mutation-without-guard. Returns honest counts (inventoried/under-contract/frozen) ' +
        '— never a numeric score. Same plane as ark-check --rules-inventory.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'ark_status',
      description:
        'Unified session/project status manifest (ACS03): project identity binding, honest write-path ' +
        'activation, last-check summary, ArkRules residual counts, and primary next action. Same ' +
        'envelope as `ark status --json`. Never prompts; never a numeric score. Prefer after ' +
        'ark_identity so project.expectedRoot is bound.',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          status: ARK_STATUS_MANIFEST_SCHEMA,
          projectIdentity: projectIdentityOutputSchema,
          binding: PROJECT_BINDING_SCHEMA,
          authoritative: { type: 'boolean' },
        },
      },
    },
  ];

  for (const tool of TOOLS) {
    tool.inputSchema = {
      ...tool.inputSchema,
      properties: {
        ...(tool.inputSchema.properties ?? {}),
        project: PROJECT_EXPECTATION_SCHEMA,
      },
    };
  }

  const RESOURCES = [
    {
      uri: 'ark://manifest',
      name: 'Ark architectural contract',
      description:
        'Compatibility-only architecture contract resource. Standard MCP resource reads cannot ' +
        'portably carry a project expectation, so this surface is always unverified and ' +
        'non-authoritative. Use the ark_manifest tool for bound contract evidence.',
      mimeType: 'application/json',
    },
  ];

  // Layers from the 11-layer profile that this project has NOT declared, with their
  // conventional directories: tells the agent where a new kind of code (a saga, a job,
  // a read model, ...) belongs BEFORE it improvises a location the gate can't govern.
  // A default layer is dropped when the project already claims any of its intent
  // prefixes under another name (e.g. a `core` layer owning `Domain.`) — suggesting
  // DomainModel there would tell the agent to create a second layer for the same
  // prefix, making longest-prefix resolution ambiguous.
  function suggestedLayers() {
    const activeNames = new Set([
      ...configLayers.map((layer) => layer.name),
      ...profile.layers.map((layer) => layer.name),
    ]);
    const claimedPrefixes = new Set(
      profile.layers.flatMap((layer) =>
        (layer.prefixes ?? []).map((p) => (p.endsWith('.') ? p : `${p}.`))
      )
    );
    return DEFAULT_INTENT_PREFIXES.filter(
      (entry) =>
        !activeNames.has(entry.layer) &&
        !entry.prefixes.some((p) => claimedPrefixes.has(p.endsWith('.') ? p : `${p}.`))
    ).map((entry) => ({
      layer: entry.layer,
      intentPrefixes: entry.prefixes,
      conventionalDirectories: DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? [],
    }));
  }

  function manifestText(binding = unverifiedBinding()) {
    const context = contextFor(binding);
    if (projectManifest) {
      return JSON.stringify(
        {
          ...projectManifest,
          source: projectManifest.source ?? 'manifest',
          ...context,
        },
        null,
        2
      );
    }
    const suggestions = suggestedLayers();
    const contractLayers = usedProjectConfig
      ? configLayers.map((layer) => ({
          ...layer,
          prefixes: Array.isArray(layer.intentPrefixes) ? layer.intentPrefixes : [],
        }))
      : profile.layers;
    return JSON.stringify(
      {
        source: profile === ark.elevenLayerProfile ? 'strictDefaultElevenLayerProfile' : 'project',
        name: profile.name,
        // File placement contract: every configured layer, including layers that do not
        // own intent prefixes (e.g. Tooling / FrameworkAdapters).
        layers: contractLayers,
        // Runtime/intent resolution profile kept explicit so consumers never have to infer
        // why a prefix-less file layer is absent from intent resolution.
        intentLayers: profile.layers,
        rules: profile.rules,
        ...(Object.keys(forbiddenGlobals).length > 0 ? { forbiddenGlobals } : {}),
        ...(Array.isArray(config.dynamicImportAllowlist)
          ? { dynamicImportAllowlist: config.dynamicImportAllowlist }
          : {}),
        ...(config.safety && typeof config.safety === 'object'
          ? { safety: config.safety }
          : {}),
        // AR09 — expose ArkRules references + catalog when configured (ADR 0014).
        ...(config.arkRules && typeof config.arkRules === 'object'
          ? { arkRules: config.arkRules }
          : {}),
        ...arkRulesCatalogForManifest(effectiveArkRulesSnapshot),
        ...(suggestions.length > 0
          ? {
              suggestedLayers: suggestions,
              suggestedLayersNote:
                'Layers from the default 11-layer profile this project has not declared. ' +
                'When creating a NEW kind of code that fits one of these, place it in a ' +
                'conventional directory and add the layer to ark.config.json instead of ' +
                'inventing an ungoverned location.',
            }
          : {}),
        ...context,
      },
      null,
      2
    );
  }

  function runIdentityTool() {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            instruction:
              'Reuse projectIdentity.projectId with project.expectedRoot on subsequent calls.',
          }),
        },
      ],
      isError: false,
    };
  }

  function runManifestTool(_params, binding) {
    return {
      content: [{ type: 'text', text: manifestText(binding) }],
      isError: false,
    };
  }

  function runValidate(params) {
    const source = params?.arguments?.source;
    if (typeof source !== 'string') {
      return { content: [{ type: 'text', text: 'Missing required "source" argument.' }], isError: true };
    }
    const filePath = params.arguments.filePath;
    const layer = params.arguments.layer ?? inferLayer(filePath, config, args.root);
    const validateOnce = (src) =>
      validateSnippetAnalysis({
        gate,
        ts,
        source: src,
        context: arkRunSnippetContext({
          root: args.root,
          config,
          filePath,
          layer,
        }),
      });
    // W1: attempt mechanical-safe single-file autoPatch (import type), re-validate or discard.
    const result = validateWithAutoPatch({
      source,
      filePath,
      root: args.root,
      ts,
      validate: validateOnce,
      resolveTargetAbs: resolveImportFileAbs,
    });
    const adapterResult = createAdapterResult({
      valid: result.valid,
      completeness: result.completeness,
      completenessReasons: result.completenessReasons,
      violations: result.violations,
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...adapterResult,
              valid: adapterResult.valid,
              violations: result.violations,
              ...(result.autoPatch ? { autoPatch: result.autoPatch } : {}),
              layer,
            },
            null,
            2
          ),
        },
      ],
      structuredContent: adapterResult,
      isError: !adapterResult.valid,
    };
  }

  // ark_check / ark_coverage reuse the canonical CLI engine (TS resolver, baseline,
  // Tarjan cycle detection) by shelling out to the sibling ark-check.mjs with --json —
  // no second copy of the check logic to drift. These are occasional agent queries, not
  // a hot path, so the per-call spawn cost is irrelevant.
  function runArkCheckJson(extraArgs) {
    return runArkCheckJsonFromRoot(
      args.root,
      args.config,
      extraArgs,
      args.manifest,
      args.tsconfig
    );
  }

  function runCheckTool(params, binding) {
    const strict = params?.arguments?.strict !== false; // default true
    const baselineArg = params?.arguments?.baseline;
    const baselineExists = fs.existsSync(path.join(args.root, '.ark-baseline.json'));
    const useBaseline = baselineArg === undefined ? baselineExists : Boolean(baselineArg);
    const extra = [];
    if (strict) extra.push('--strict-config');
    if (useBaseline) extra.push('--baseline');
    const { data, raw } = runArkCheckJson(extra);
    if (!data) {
      return { content: [{ type: 'text', text: `ark-check produced no JSON:\n${raw}` }], isError: true };
    }
    const { data: coverageData } = runArkCheckJson(['--coverage']);
    const coverage = coverageData?.coverage;
    const coverageOk = Boolean(
      coverage &&
        coverage.emptyScope === false &&
        coverage.governed?.percent === 100 &&
        coverage.unclassified?.count === 0
    );
    let writePath;
    try {
      writePath = detectWritePathCapabilities(args.root, 'unknown');
    } catch {
      writePath = undefined;
    }
    const localWriteActive = writePath?.enforcementState?.localWrite?.active ?? 'unverified';
    const ciMergeActive = writePath?.enforcementState?.ciMerge?.active ?? 'unverified';
    const gatesOk = localWriteActive === true && ciMergeActive === true;
    const verdict = {
      identity: {
        status: binding.status,
        ok: binding.status === 'matched',
      },
      completeness: {
        status: data.completeness ?? 'unavailable',
        ok: data.completeness === 'complete',
      },
      graph: {
        ok: data.valid === true,
        violations: Array.isArray(data.violations) ? data.violations.length : null,
      },
      coverage: {
        ok: coverageOk,
        governedPercent: coverage?.governed?.percent ?? null,
        unclassified: coverage?.unclassified?.count ?? null,
        emptyScope: coverage?.emptyScope ?? null,
      },
      gates: {
        ok: gatesOk,
        localWriteActive,
        advisoryMcpActive: true,
        advisoryMcpRuntimeObserved: true,
        ciMergeActive,
      },
      overallOk: Boolean(
        binding.status === 'matched' &&
          data.ok === true &&
          data.completeness === 'complete' &&
          data.valid === true &&
          coverageOk &&
          gatesOk
      ),
    };
    const payload = { ...data, verdict };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: {
        schemaVersion: data.schemaVersion,
        mode: data.mode,
        valid: data.valid,
        completeness: data.completeness,
        completenessReasons: data.completenessReasons,
        diagnostics: data.diagnostics,
        ...(data.policyHash ? { policyHash: data.policyHash } : {}),
        ...(data.resolverIdentity ? { resolverIdentity: data.resolverIdentity } : {}),
        ...(data.factsHash ? { factsHash: data.factsHash } : {}),
        ...(data.candidateTreeHash ? { candidateTreeHash: data.candidateTreeHash } : {}),
        verdict,
      },
      isError: data.ok === false,
    };
  }

  function runCoverageTool() {
    const { data, raw } = runArkCheckJson(['--coverage']);
    if (!data) {
      return {
        content: [{ type: 'text', text: `ark-check --coverage produced no JSON:\n${raw}` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: false };
  }

  function runPolicyDeltaTool(params) {
    const baseConfig = params?.arguments?.baseConfig;
    if (!baseConfig || typeof baseConfig !== 'object' || Array.isArray(baseConfig)) {
      return {
        content: [{ type: 'text', text: 'ark_policy_delta requires baseConfig (object).' }],
        isError: true,
      };
    }
    try {
      const result = ark.analyzePolicyDelta({
        baseConfig,
        candidateConfig: params?.arguments?.candidateConfig ?? config,
        acknowledgement: params?.arguments?.acknowledgement,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: !result.valid,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  }

  function runRecommendTool() {
    const { data, raw } = runArkCheckJson(['--recommend']);
    if (!data) {
      return {
        content: [{ type: 'text', text: `ark-check --recommend produced no JSON:\n${raw}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      isError: data.ok === false,
    };
  }

  // Deterministic placement guidance (in-process; no TS resolver needed): which layer a
  // path falls in, and — from the same rules ark-check enforces (default allow, explicit
  // `allowed:false` denies) — which layers it may and must not import.
  // Q03: when present, attach optional `.ark/golden-pattern.json` (advisory for NEW code only).
  function placeResult(filePath, description) {
    const golden = loadGoldenPattern(args.root);
    const withGolden = (placement) => attachGoldenToPlacement(placement, golden);

    if (typeof filePath !== 'string' || !filePath.trim()) {
      return {
        error:
          'ark_place requires filePath. Fail-closed: will not invent a path (never default to Presentation or components/*.tsx). ' +
          'Example: { "filePath": "src/lib/repositories/orders-repository.ts" }.',
        failClosed: true,
      };
    }
    const layerName = inferLayer(filePath, config, args.root);
    if (!layerName) {
      const noLayers = configLayers.length === 0;
      return withGolden({
        filePath,
        layer: null,
        governed: noLayers,
        message: noLayers
          ? 'This project declares no path-based layers in ark.config.json, so a ' +
            'layer cannot be inferred from the path. The gate still enforces the ' +
            'default 11-layer profile by intent-name prefix — call ark_manifest ' +
            'for the layers and validate the actual snippet with validate_code.'
          : 'No layer pattern matches this path — code here is UNGOVERNED (no import ' +
            'rules enforced). Place it under a directory a layer in ark.config.json ' +
            'matches, or add a layer. See suggestedLayers for conventional homes.',
        suggestedLayers: suggestedLayers(),
      });
    }
    const layerMeta = configLayers.find((layer) => layer.name === layerName);
    const rules = config.rules ?? DEFAULT_RULES;
    const otherNames = configLayers.map((layer) => layer.name).filter((name) => name !== layerName);
    const mustNotImport = otherNames.filter((to) =>
      rules.some((rule) => !rule.allowed && rule.from === layerName && rule.to === to)
    );
    const mayImport = otherNames.filter((name) => !mustNotImport.includes(name));
    return withGolden({
      filePath,
      layer: layerName,
      governed: true,
      description: layerMeta?.description,
      forbiddenGlobals: layerMeta?.forbiddenGlobals ?? [],
      ...(layerMeta?.mayImportInfrastructure ? { mayImportInfrastructure: true } : {}),
      mayImport,
      mustNotImport,
      note:
        'mayImport = layers with no explicit deny (default is allow). Respect ' +
        'forbiddenGlobals, then verify the actual snippet with validate_code or ark_prepare_write.',
    });
  }

  function runPlace(params) {
    const placement = placeResult(params?.arguments?.filePath, params?.arguments?.description);
    if (placement.error) {
      return {
        content: [{ type: 'text', text: `ark_place: ${placement.error}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(placement, null, 2) }],
      isError: false,
    };
  }

  /**
   * W2: place + constrain + validate + autoPatch + judgmentBrief + contentHash.
   * Composes ark_place + write-boundary gate — not a second contract.
   */
  function runPrepareWrite(params) {
    const source = params?.arguments?.source;
    const filePath = params?.arguments?.filePath;
    const description = params?.arguments?.description;
    if (typeof source !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: 'ark_prepare_write requires "source" (string). Optional: filePath, description.',
          },
        ],
        isError: true,
      };
    }
    const placement = placeResult(filePath, description);
    if (placement.error) {
      return {
        content: [{ type: 'text', text: `ark_prepare_write: ${placement.error}` }],
        isError: true,
      };
    }
    const layer =
      placement.layer ||
      params?.arguments?.layer ||
      inferLayer(placement.filePath, config, args.root);
    const validateOnce = (src) =>
      validateSnippetAnalysis({
        gate,
        ts,
        source: src,
        context: arkRunSnippetContext({
          root: args.root,
          config,
          filePath: placement.filePath,
          layer,
        }),
      });
    const result = composePrepareWrite({
      source,
      placement: { ...placement, layer },
      root: args.root,
      ts,
      validate: validateOnce,
      resolveTargetAbs: resolveImportFileAbs,
    });
    if (!result.ok) {
      return {
        content: [{ type: 'text', text: result.error || 'prepare_write failed' }],
        isError: true,
      };
    }
    const designDelta = ts && placement.governed
      ? evaluateWriteDesignDelta({
          root: args.root,
          config,
          changes: [{ path: placement.filePath, content: source }],
          ts,
        })
      : null;
    const prepared = designDelta
      ? {
          ...result,
          edgeValid: result.lexicalValid ?? result.valid,
          valid: result.valid && designDelta.valid,
          designDelta,
        }
      : result;
    return {
      content: [{ type: 'text', text: JSON.stringify(prepared, null, 2) }],
      // Align with validate_code / --hook: proposed source still invalid → isError.
      // autoPatch is additive recovery guidance in the body, never soft-success.
      isError: !prepared.valid,
    };
  }

  function runPrepareChange(params) {
    try {
      const result = prepareChangeFromRoot({
        root: args.root,
        config,
        configSource: configPath,
        changes: params?.arguments?.changes,
        changeMap: params?.arguments?.changeMap,
        changeMapSource: 'ark_prepare_change.changeMap',
        ts,
        tsconfig: args.tsconfig,
        manifest: projectManifest,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: !result.valid,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  }

  function runStatusTool(_params, binding) {
    try {
      const status = buildProjectStatusManifest({
        root: args.root,
        config: path.basename(configPath) === 'ark.config.json' ? 'ark.config.json' : configPath,
        expectedRoot: binding?.expectedRoot ?? _params?.arguments?.project?.expectedRoot,
        expectedProjectId:
          binding?.expectedProjectId ?? _params?.arguments?.project?.expectedProjectId,
        arkgateVersion: ark.version,
      });
      // Prefer MCP binding status when the tool framework already evaluated expectation.
      if (binding && typeof binding.status === 'string') {
        status.projectIdentity.binding = binding.status;
        status.projectIdentity.authoritative = binding.authoritative === true;
        if (binding.code) status.projectIdentity.code = binding.code;
        if (binding.message) status.projectIdentity.message = binding.message;
        if (binding.status === 'mismatch') {
          status.nextAction = {
            id: 'rebind-project-identity',
            summary:
              binding.message ||
              'Project expectation does not match this MCP process — re-run ark_identity with the correct root.',
          };
        }
      }
      const payload = {
        ok: binding?.status !== 'mismatch',
        status,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: binding?.status === 'mismatch',
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  }

  function runRulesInventoryTool() {
    try {
      const governed = collectGovernedFiles(args.root, config);
      const fileContents = {};
      const fileLayers = {};
      for (const file of governed.slice(0, 400)) {
        const rel = path.relative(args.root, file).split(path.sep).join('/');
        try {
          fileContents[rel] = fs.readFileSync(file, 'utf8');
          const layer = layerForFile(args.root, file, config.layers);
          if (layer) fileLayers[rel] = layer;
        } catch {
          /* skip */
        }
      }
      const contracted = [];
      for (const rule of effectiveArkRulesSnapshot.arkRules?.structure ?? []) {
        contracted.push(rule.id);
      }
      for (const inv of effectiveArkRulesSnapshot.arkRules?.invariants ?? []) {
        contracted.push(inv.id);
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
        ok: true,
        rulesInventory: inventory,
        rulesMigration: {
          inventoried: inventory.inventoried,
          underContract: inventory.underContract,
          frozen: inventory.frozen,
          notAScore: true,
        },
        nextPilot,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  }

  function runSuggestIncludeTool() {
    try {
      const workspaces = detectWorkspaces(args.root);
      const tsPackages = detectTsPackageRoots(args.root);
      const suggestedInclude = resolveIncludeRoots(args.root);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ok: true,
                workspaces,
                tsPackages,
                suggestedInclude:
                  suggestedInclude.length > 0
                    ? suggestedInclude
                    : tsPackages.length > 0
                      ? tsPackages
                      : ['src'],
                next: 'npx ark-check --adopt-contract --write',
              },
              null,
              2
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  }

  const TOOL_HANDLERS = {
    ark_identity: runIdentityTool,
    ark_manifest: runManifestTool,
    validate_code: runValidate,
    ark_check: runCheckTool,
    ark_policy_delta: runPolicyDeltaTool,
    ark_coverage: runCoverageTool,
    ark_place: runPlace,
    ark_prepare_write: runPrepareWrite,
    ark_prepare_change: runPrepareChange,
    ark_recommend: runRecommendTool,
    ark_suggest_include: runSuggestIncludeTool,
    ark_rules_inventory: runRulesInventoryTool,
    ark_status: runStatusTool,
  };

  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message, binding = unverifiedBinding()) =>
    send({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data: contextFor(binding),
      },
    });

  function handle(msg) {
    const { id, method, params } = msg;

    // Notifications carry no id and MUST never receive a response (JSON-RPC 2.0).
    // The only notification we care about is notifications/initialized (a no-op here).
    if (!('id' in msg)) return;

    switch (method) {
      case 'initialize':
        {
          const binding = bindingForExpectation(params?.project);
        reply(id, {
          protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL,
          capabilities: { tools: {}, resources: {} },
          serverInfo: SERVER_INFO,
          ...contextFor(binding),
        });
        }
        return;
      case 'ping':
        reply(id, {});
        return;
      case 'tools/list':
        reply(id, { tools: TOOLS, ...contextFor(unverifiedBinding()) });
        return;
      case 'tools/call': {
        const handler = TOOL_HANDLERS[params?.name];
        if (!handler) {
          fail(
            id,
            -32602,
            `Unknown tool: ${params?.name}`,
            bindingForExpectation(params?.arguments?.project)
          );
          return;
        }
        let binding = bindingForExpectation(params?.arguments?.project);
        binding = bindingForToolPaths(params?.name, params?.arguments, binding);
        if (binding.status === 'mismatch') {
          reply(id, bindingFailureResult(binding));
          return;
        }
        // Keep ark_identity available so the host can diagnose the stale process,
        // but fail every project tool closed until the MCP server restarts on the
        // version installed for this root.
        if (params?.name !== 'ark_identity' && processPackageHonesty().processStale) {
          reply(id, staleProcessFailureResult(binding));
          return;
        }
        try {
          reply(id, withProjectContext(handler(params, binding), binding));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          reply(
            id,
            withProjectContext(
              {
                content: [{ type: 'text', text: message }],
                isError: true,
              },
              binding
            )
          );
        }
        return;
      }
      case 'resources/list':
        reply(id, { resources: RESOURCES, ...contextFor(unverifiedBinding()) });
        return;
      case 'resources/read':
        {
        // MCP resources/read has a standard `{ uri }` request shape. Some clients may
        // forward extension fields, but treating those as a binding would make project
        // safety host-dependent. Keep this compatibility resource non-authoritative and
        // require the project-aware ark_manifest tool for trusted contract evidence.
        const binding = unverifiedBinding();
        if (params?.uri !== 'ark://manifest') {
          fail(id, -32602, `Unknown resource: ${params?.uri}`, binding);
          return;
        }
        reply(id, {
          contents: [
            {
              uri: 'ark://manifest',
              mimeType: 'application/json',
              text: manifestText(binding),
            },
          ],
          ...contextFor(binding),
        });
        }
        return;
      default:
        fail(id, -32601, `Method not found: ${method}`);
    }
  }

  const rl = readline.createInterface({ input: process.stdin });
  rl.once('close', () => residentHookControl?.cleanup());
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      fail(null, -32700, 'Parse error');
      return;
    }
    try {
      handle(msg);
    } catch (err) {
      fail(msg?.id ?? null, -32603, err instanceof Error ? err.message : String(err));
    }
  });
}
