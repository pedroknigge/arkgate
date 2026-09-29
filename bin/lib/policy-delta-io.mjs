import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { analyzePolicyDelta, stableSerialize } from './analysis-engine.mjs';
import { loadArkConfigContract } from './config-contract.mjs';
import {
  directoryArkRulesReader,
  loadEffectiveArkRules,
  loadEffectiveArkRulesFromDisk,
  objectArkRulesReader,
} from './effective-contract-load.mjs';
import {
  coverageOptionsFromConfig,
  invariantIdsFromCatalog,
  loadInvariantCoverageInputs,
} from './invariant-coverage-io.mjs';
import { evaluateInvariantCoverage } from './invariant-coverage.mjs';
import { attachPolicyAdrNote } from './adr-path.mjs';

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON (${filePath}): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** Kill hung git instead of stalling CI. */
export const SPAWN_TIMEOUT_MS = 8000;

function runGit(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: SPAWN_TIMEOUT_MS,
  });
}

function safeRef(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(value) &&
    !value.includes('..')
  );
}

export function normalizePolicyBaseRef(value) {
  const ref = typeof value === 'string' ? value.trim() : '';
  return /^0{40,64}$/.test(ref) ? '' : ref;
}

function repositoryRoot(root) {
  const result = runGit(root, ['rev-parse', '--show-toplevel']);
  return result.status === 0 ? result.stdout.trim() : null;
}

export function discoverLocalBaseRef(root) {
  const top = repositoryRoot(root);
  if (!top) return null;
  const remoteHead = runGit(top, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  const candidates = [
    remoteHead.status === 0 ? remoteHead.stdout.trim() : null,
    'origin/main',
    'origin/master',
  ].filter(Boolean);
  const current = runGit(top, ['branch', '--show-current']);
  const currentBranch = current.status === 0 ? current.stdout.trim() : '';

  for (const candidate of candidates) {
    if (!safeRef(candidate)) continue;
    const exists = runGit(top, ['rev-parse', '--verify', `${candidate}^{commit}`]);
    if (exists.status !== 0) continue;
    if (currentBranch && candidate === `origin/${currentBranch}`) return null;
    const mergeBase = runGit(top, ['merge-base', 'HEAD', candidate]);
    if (mergeBase.status === 0 && safeRef(mergeBase.stdout.trim())) return mergeBase.stdout.trim();
  }
  return null;
}

function configPathInRepository(root, configPath, top) {
  const requested = path.isAbsolute(configPath) ? configPath : path.resolve(root, configPath);
  const absolute = fs.realpathSync(requested);
  const canonicalTop = fs.realpathSync(top);
  const relative = path.relative(canonicalTop, absolute).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`Policy config must be inside the Git repository: ${absolute}`);
  }
  return relative;
}

/**
 * ArkRules files at the base ref, relative to the project root inside the repository.
 * A path absent at the ref (added by the candidate) reads as `missing`.
 */
function baseRefArkRulesReader(root, top, ref) {
  const prefix = path
    .relative(fs.realpathSync(top), fs.realpathSync(root))
    .split(path.sep)
    .join('/');
  const spec = (rel) => `${ref}:${prefix ? `${prefix}/` : ''}${rel}`;
  return {
    readArkRulesFile: (rel) => {
      const shown = runGit(top, ['show', spec(rel)]);
      if (shown.status === 0) return { ok: true, content: shown.stdout };
      const exists = runGit(top, ['cat-file', '-e', spec(rel)]);
      return {
        ok: false,
        missing: exists.status !== 0 && !shown.error,
        message: `Cannot read policy base ArkRules ${spec(rel)}: ${
          shown.stderr?.trim() || shown.error?.message || 'git show failed'
        }`,
      };
    },
  };
}

export function resolvePolicyBaseConfig({
  root,
  configPath,
  basePath,
  baseRef,
  env = process.env,
}) {
  if (basePath) {
    const absolute = path.isAbsolute(basePath) ? basePath : path.resolve(root, basePath);
    const config = readJsonFile(absolute, 'Policy base');
    // A base config FILE carries its ArkRules next to it (same relative paths as the
    // project), never from the candidate working tree: that would compare the
    // candidate catalog with itself and hide every demotion/deletion.
    return {
      config,
      source: absolute,
      ref: null,
      readArkRulesFile: directoryArkRulesReader(fs.realpathSync(path.dirname(absolute))),
    };
  }

  const envRef = normalizePolicyBaseRef(env.ARK_POLICY_BASE_REF);
  const githubBase = typeof env.GITHUB_BASE_REF === 'string' ? env.GITHUB_BASE_REF.trim() : '';
  const requestedRef = baseRef || envRef || (githubBase ? `origin/${githubBase}` : '');
  const ref = requestedRef || discoverLocalBaseRef(root);
  if (!ref) return null;
  if (!safeRef(ref)) throw new Error(`Unsafe policy base ref: ${ref}`);

  const top = repositoryRoot(root);
  if (!top) {
    // GitHub and ARK_POLICY_BASE_REF describe the process workspace, which may
    // be different from an explicitly checked nested/temporary project root.
    // Only the CLI flag is an unambiguous request to resolve this exact root.
    if (baseRef) throw new Error(`Cannot resolve policy base ref outside a Git repository: ${ref}`);
    return null;
  }
  const relativeConfig = configPathInRepository(root, configPath, top);
  const result = runGit(top, ['show', `${ref}:${relativeConfig}`]);
  if (result.status !== 0) {
    const refExists = runGit(top, ['rev-parse', '--verify', `${ref}^{commit}`]);
    // A newly adopted contract has no predecessor to weaken. CI-provided and
    // auto-discovered bases may therefore omit the config; an explicit CLI ref
    // remains fail-closed because the caller asked to compare that exact input.
    if (refExists.status === 0 && !baseRef) return null;
    if (requestedRef) {
      throw new Error(
        `Cannot read policy base ${ref}:${relativeConfig}: ${result.stderr.trim() || 'git show failed'}`
      );
    }
    return null;
  }
  try {
    return {
      config: JSON.parse(result.stdout),
      source: `git:${ref}:${relativeConfig}`,
      ref,
      ...baseRefArkRulesReader(root, top, ref),
    };
  } catch (error) {
    throw new Error(
      `Policy base ${ref}:${relativeConfig} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function readPolicyAcknowledgement(root, acknowledgementPath) {
  if (!acknowledgementPath) return undefined;
  const absolute = path.isAbsolute(acknowledgementPath)
    ? acknowledgementPath
    : path.resolve(root, acknowledgementPath);
  return readJsonFile(absolute, 'Policy acknowledgement');
}

/**
 * Effective ArkRules of the policy base. A path the base config references but the
 * base ref does not contain yet counts as an empty layer (git refs only). Any other
 * failure is fail-closed: silently dropping the base catalog would make every
 * ArkRule demotion or deletion classify as neutral.
 */
export function loadBaseArkRules(base) {
  const loaded = loadEffectiveArkRules(base.config, base.readArkRulesFile, {
    missingAsEmpty: base.ref != null,
  });
  if (loaded.errors.length > 0) {
    const message = loaded.errors.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n');
    const remedy =
      base.ref == null
        ? `\nA --policy-base file reads its ArkRules next to it: copy the base catalog to the same relative paths under ${path.dirname(base.source)}, or compare against a git ref with --policy-base-ref.`
        : '';
    throw new Error(
      `Policy base ArkRules could not be loaded (${base.source}); ArkRules transitions cannot be classified:\n${message}${remedy}`
    );
  }
  return loaded.arkRules;
}

function hasArkRulesMap(config) {
  const refs = config?.arkRules;
  return Boolean(refs && typeof refs === 'object' && Object.keys(refs).length > 0);
}

function loadedOrThrow(loaded, label) {
  if (loaded.errors.length === 0) return loaded.arkRules;
  const message = loaded.errors.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n');
  throw new Error(`${label} ArkRules could not be loaded:\n${message}`);
}

function normalizedArkRulesMap(config) {
  let normalized = config;
  try {
    normalized = loadArkConfigContract(config, 'candidateConfig').config;
  } catch {
    // An invalid candidate is reported by analyzePolicyDelta; compare it as given.
  }
  return stableSerialize(hasArkRulesMap(normalized) ? normalized.arkRules : null);
}

/**
 * True when a supplied `candidateConfig` names the same ArkRules catalog files as the
 * loaded project config, so the candidate catalog is the one on disk. Both sides are
 * normalised first: the project config in memory carries loader defaults (`$schema`,
 * upgraded `schemaVersion`), so passing `ark.config.json` verbatim must still match.
 */
export function candidateArkRulesMatchProject(candidateConfig, projectConfig) {
  if (candidateConfig === undefined) return true;
  if (!candidateConfig || typeof candidateConfig !== 'object' || Array.isArray(candidateConfig)) {
    return false;
  }
  return normalizedArkRulesMap(candidateConfig) === normalizedArkRulesMap(projectConfig);
}

/**
 * MCP `ark_policy_delta`: Effective ArkRules for both sides of a config transition.
 * Base ArkRules must be SUPPLIED as data (`baseArkRuleFiles`, keyed by the project-
 * relative paths in `baseConfig.arkRules`) whenever the base config maps any: the
 * server only sees the candidate working tree, and reading the base catalog from it
 * would classify every ArkRule demotion or deletion as neutral. The candidate comes
 * from `candidateArkRuleFiles`, or from disk when the candidate is the project config.
 */
export function resolvePolicyDeltaArkRules({
  root,
  baseConfig,
  candidateConfig,
  candidateIsProjectConfig,
  baseArkRuleFiles,
  candidateArkRuleFiles,
}) {
  let baseArkRules;
  if (hasArkRulesMap(baseConfig)) {
    if (!baseArkRuleFiles || typeof baseArkRuleFiles !== 'object') {
      throw new Error(
        'baseConfig maps arkRules, so the ArkRules transition cannot be classified without the base catalog: ' +
          'pass baseArkRuleFiles as { "<path from baseConfig.arkRules>": <ArkRules file JSON> }.'
      );
    }
    baseArkRules = loadedOrThrow(
      loadEffectiveArkRules(baseConfig, objectArkRulesReader(baseArkRuleFiles)),
      'Base'
    );
  } else {
    baseArkRules = loadEffectiveArkRules(baseConfig, () => ({ ok: false, message: '' })).arkRules;
  }

  let candidateArkRules;
  if (candidateArkRuleFiles && typeof candidateArkRuleFiles === 'object') {
    candidateArkRules = loadedOrThrow(
      loadEffectiveArkRules(candidateConfig, objectArkRulesReader(candidateArkRuleFiles)),
      'Candidate'
    );
  } else if (candidateIsProjectConfig) {
    candidateArkRules = loadedOrThrow(
      loadEffectiveArkRulesFromDisk(root, candidateConfig),
      'Candidate'
    );
  } else if (hasArkRulesMap(candidateConfig)) {
    throw new Error(
      'candidateConfig maps different arkRules files than the project contract: pass candidateArkRuleFiles ' +
        'as { "<path from candidateConfig.arkRules>": <ArkRules file JSON> }.'
    );
  } else {
    candidateArkRules = loadEffectiveArkRules(candidateConfig, () => ({ ok: false, message: '' }))
      .arkRules;
  }
  return { baseArkRules, candidateArkRules };
}

export function analyzePolicyTransition({
  root,
  configPath,
  candidateConfig,
  strictMerge,
  basePath,
  baseRef,
  acknowledgementPath,
}) {
  if (!strictMerge && !basePath && !baseRef && !acknowledgementPath) return undefined;
  const base = resolvePolicyBaseConfig({ root, configPath, basePath, baseRef });
  if (!base && (basePath || baseRef || acknowledgementPath)) {
    throw new Error('Policy delta was requested but no policy base could be resolved.');
  }
  if (!base) return undefined;

  // AR02/AR11: load Effective ArkRules so mode edits inside arkrules/*.json classify,
  // and attach candidate coverage so covered advisory→enforced can auto-allow.
  // Base ArkRules come from the SAME source as the base config (git ref or the
  // base file's directory), never from the candidate working tree.
  const baseArkRules = loadBaseArkRules(base);
  const candidateLoad = loadEffectiveArkRulesFromDisk(root, candidateConfig);
  if (candidateLoad.errors.length > 0) {
    const message = candidateLoad.errors
      .map((issue) => `- ${issue.path}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid candidate Effective Contract:\n${message}`);
  }
  const candidateArkRules = candidateLoad.arkRules;

  let candidateInvariantCoverage;
  if ((candidateArkRules?.invariants?.length ?? 0) > 0) {
    const coverageInputs = loadInvariantCoverageInputs(root, { files: [] }, {
      invariantIds: invariantIdsFromCatalog(candidateArkRules),
      ...coverageOptionsFromConfig(candidateConfig),
    });
    const evaluated = evaluateInvariantCoverage({
      arkRules: candidateArkRules,
      fileContents: coverageInputs.fileContents,
      testFiles: coverageInputs.testFiles,
      testGlobsMissing: coverageInputs.testGlobsMissing,
      // No coverageStats / coverageRoots: this caller reads coverage ROWS and
      // drops the violations, and both only shape violation messages. Passing
      // them would look like wiring while changing nothing observable here.
      coverageBudgetExhausted: coverageInputs.coverageBudgetExhausted === true,
    });
    candidateInvariantCoverage = evaluated.coverage;
  }

  const acknowledgement = readPolicyAcknowledgement(root, acknowledgementPath);
  return attachPolicyAdrNote(
    analyzePolicyDelta({
      baseConfig: base.config,
      candidateConfig,
      acknowledgement,
      baseSource: base.source,
      candidateSource: path.isAbsolute(configPath) ? configPath : path.join(root, configPath),
      baseArkRules,
      candidateArkRules,
      ...(candidateInvariantCoverage ? { candidateInvariantCoverage } : {}),
    }),
    {
      root,
      acknowledgement,
      failClosed: Boolean(strictMerge || acknowledgementPath),
    }
  );
}
