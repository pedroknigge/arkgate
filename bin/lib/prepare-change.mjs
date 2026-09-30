import fs from 'node:fs';
import path from 'node:path';
import {
  loadArchitectureChangeMap,
  loadContract,
  preflightTrustedResolvedChange,
} from './analysis-engine.mjs';
import { createAdapterResult } from './adapter-contract.mjs';
import { isGovernableSourceFile } from './scan-files.mjs';
import {
  canonicalizeCandidateChanges,
  createResolverIngestCache,
  resolveCandidateFacts,
} from './resolved-candidate-facts.mjs';
import { effectiveAnalysisConfig } from './analysis-policy.mjs';
import { isScanExcludedRelative } from '../ark-shared.mjs';
import { classifyChangeSet, evaluateTeamGate } from './team-parliament.mjs';
import { arkRulesLoadFailed, loadEffectiveArkRulesFromDisk } from './effective-contract-load.mjs';
import {
  coverageOptionsFromConfig,
  invariantIdsFromCatalog,
  loadInvariantCoverageInputs,
} from './invariant-coverage-io.mjs';
import { catalogHasEnforcedInvariant } from './invariant-coverage.mjs';
import {
  declaredCoverageRootsPresent,
  declaredInvariantTestsPathPresent,
  scanDemandsInvariantTestsPath,
} from './invariant-tests-path.mjs';
import { loadArkRuleFileHints } from './arkrule-file-hints.mjs';

function candidatePath(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Every change requires a non-empty project-relative path.');
  }
  const portable = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.posix.isAbsolute(portable) || /^[A-Za-z]:\//.test(portable)) {
    throw new Error(`Change path must be project-relative: ${value}`);
  }
  const normalized = path.posix.normalize(portable);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('\0')) {
    throw new Error(`Change path escapes the project root: ${value}`);
  }
  return normalized;
}

function isIncluded(relativePath, include) {
  return (include ?? []).some((entry) => {
    const root = String(entry).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    return root === '.' || relativePath === root || relativePath.startsWith(`${root}/`);
  });
}

export function isCandidateSourceInScope(config, relativePath) {
  return (
    isGovernableSourceFile(path.basename(relativePath)) &&
    isIncluded(relativePath, config.include) &&
    !isScanExcludedRelative(relativePath, config)
  );
}

function assertGovernedSource(config, relativePath) {
  if (!isGovernableSourceFile(path.basename(relativePath))) {
    throw new Error(`Atomic preflight only accepts governed production source files: ${relativePath}`);
  }
  if (!isCandidateSourceInScope(config, relativePath)) {
    throw new Error(`Change path is outside the configured source scope: ${relativePath}`);
  }
}

function assertInsideProject(root, relativePath) {
  const canonicalRoot = fs.realpathSync(root);
  let existing = path.join(root, relativePath);
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const canonicalExisting = fs.realpathSync(existing);
  const relative = path.relative(canonicalRoot, canonicalExisting);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Change path resolves outside the project root: ${relativePath}`);
  }
}

function normalizeChangeSet(input) {
  if (!Array.isArray(input)) throw new Error('changes must be an array.');
  return input.map((change, index) => {
    if (!change || typeof change !== 'object' || Array.isArray(change)) {
      throw new Error(`changes[${index}] must be an object.`);
    }
    const normalizedPath = candidatePath(change.path);
    if (change.delete === true && change.content === undefined) {
      return { path: normalizedPath, delete: true };
    }
    if (typeof change.content === 'string' && change.delete === undefined) {
      return { path: normalizedPath, content: change.content };
    }
    throw new Error(
      `changes[${index}] must contain either content (string) or delete: true, but not both.`
    );
  });
}

function overlayContents(contents, overlay) {
  const out = { ...(contents ?? {}) };
  for (const change of overlay) {
    if (change.delete === true) delete out[change.path];
    else out[change.path] = change.content;
  }
  return out;
}

/**
 * ArkRules engine inputs for base (disk) and candidate (disk + in-memory overlay):
 * invariant coverage contents and structural file hints, loaded exactly the way
 * architecture-scan loads them for ark-check. Undefined when ArkRules is off.
 */
function arkRulesAnalysisInputs({ root, config, arkRules, baseFacts, candidateFacts, overlay }) {
  const structure = arkRules?.structure ?? [];
  const invariants = arkRules?.invariants ?? [];
  if (structure.length === 0 && invariants.length === 0) return {};
  const adopted = scanDemandsInvariantTestsPath(root, {});
  const shared = {
    ...(adopted ? { adopted: true } : {}),
    ...(adopted && declaredInvariantTestsPathPresent(root, config.coverage) === false
      ? { invariantTestsPathPresent: false }
      : {}),
    ...(catalogHasEnforcedInvariant(invariants) &&
    declaredCoverageRootsPresent(root, config.coverage) === false
      ? { coverageRootsPresent: false }
      : {}),
  };
  const baseCoverage =
    invariants.length > 0
      ? loadInvariantCoverageInputs(root, baseFacts, {
          invariantIds: invariantIdsFromCatalog(arkRules),
          ...coverageOptionsFromConfig(config),
        })
      : undefined;
  const candidateCoverage = baseCoverage
    ? {
        ...baseCoverage,
        fileContents: overlayContents(baseCoverage.fileContents, overlay),
        testFiles: (baseCoverage.testFiles ?? []).filter(
          (file) => !overlay.some((change) => change.delete === true && change.path === file)
        ),
      }
    : undefined;
  const baseHints = loadArkRuleFileHints(root, baseFacts, arkRules, baseCoverage?.fileContents);
  // Candidate hints must read the overlay, never the stale on-disk text of a changed file.
  const candidateHints = loadArkRuleFileHints(
    root,
    candidateFacts,
    arkRules,
    overlayContents(candidateCoverage?.fileContents ?? {}, overlay)
  );
  return {
    baseAnalysisInputs: {
      ...shared,
      ...(baseCoverage ? { coverageInputs: baseCoverage } : {}),
      ...(baseHints ? { fileHints: baseHints } : {}),
    },
    candidateAnalysisInputs: {
      ...shared,
      ...(candidateCoverage ? { coverageInputs: candidateCoverage } : {}),
      ...(candidateHints ? { fileHints: candidateHints } : {}),
    },
  };
}

export function prepareChangeFromRoot({
  root,
  config,
  configSource,
  changes,
  changeMap,
  changeMapSource,
  ts,
  tsconfig,
  manifest,
  overlayChanges,
}) {
  const normalizedChanges = normalizeChangeSet(changes);
  const normalizedOverlayChanges =
    overlayChanges === undefined ? normalizedChanges : normalizeChangeSet(overlayChanges);
  const lawGate = evaluateTeamGate({
    changeSet: classifyChangeSet(normalizedChanges.map((change) => change.path)),
    contractSession:
      process.env.ARK_CONTRACT_SESSION === '1' || process.env.ARK_CONTRACT_SESSION === 'true',
  });
  if (lawGate.deny && lawGate.reasonId === 'mixed-law-and-product') {
    throw new Error(lawGate.message);
  }
  const effectiveConfig = effectiveAnalysisConfig(config, manifest);
  for (const change of normalizedChanges) {
    assertInsideProject(root, change.path);
  }
  const contractSource = configSource ?? path.join(root, 'ark.config.json');
  // Same Effective Contract as ark-check: ArkRules ride policyHash and the verdict,
  // and a broken reference fails closed instead of silently dropping the catalog.
  const arkRulesLoad = loadEffectiveArkRulesFromDisk(root, effectiveConfig);
  if (arkRulesLoad.errors.length > 0) {
    throw arkRulesLoadFailed(contractSource, arkRulesLoad.errors);
  }
  const contract = loadContract(effectiveConfig, contractSource, {
    arkRules: arkRulesLoad.arkRules,
  });
  const loadedChangeMap =
    changeMap === undefined
      ? undefined
      : loadArchitectureChangeMap(changeMap, contract.config, changeMapSource);
  const canonicalChanges = canonicalizeCandidateChanges({
    root,
    config: contract.config,
    changes: normalizedChanges,
  });
  for (const change of canonicalChanges) assertGovernedSource(effectiveConfig, change.path);
  // Files the overlay does not touch are parsed once for both trees.
  const ingestCache = createResolverIngestCache(contract.config);
  const baseFacts = resolveCandidateFacts({
    root,
    config: contract.config,
    ts,
    ingestCache,
    ...(tsconfig ? { tsconfig } : {}),
  });
  const candidateFacts = resolveCandidateFacts({
    root,
    config: contract.config,
    ts,
    ingestCache,
    changes: normalizedOverlayChanges,
    ...(tsconfig ? { tsconfig } : {}),
  });
  ingestCache.records.clear();
  const { baseAnalysisInputs, candidateAnalysisInputs } = arkRulesAnalysisInputs({
    root,
    config: effectiveConfig,
    arkRules: arkRulesLoad.arkRules,
    baseFacts,
    candidateFacts,
    overlay: canonicalizeCandidateChanges({
      root,
      config: contract.config,
      changes: normalizedOverlayChanges,
    }),
  });
  // Both fact sets were created (validated, frozen) by this bundle instance just
  // above: skip re-validating two whole-project copies of each.
  const result = preflightTrustedResolvedChange({
    contract,
    baseFacts,
    candidateFacts,
    changes: canonicalChanges,
    ...(baseAnalysisInputs ? { baseAnalysisInputs } : {}),
    ...(candidateAnalysisInputs ? { candidateAnalysisInputs } : {}),
    ...(loadedChangeMap ? { changeMap: loadedChangeMap } : {}),
  });
  const completeness =
    result.baseCompleteness === 'unavailable' || result.candidateCompleteness === 'unavailable'
      ? 'unavailable'
      : result.baseCompleteness === 'partial' || result.candidateCompleteness === 'partial'
        ? 'partial'
        : 'complete';
  const { diagnostics } = createAdapterResult({
    valid: result.valid,
    completeness,
    violations: result.violations,
    warnings: result.warnings,
  });
  return { ...result, diagnostics };
}

export function renderChangePreflight(result) {
  const convergence = result.convergence;
  if (result.valid) {
    console.log(`✔ Atomic preflight passed for ${result.changes.length} change(s).`);
    console.log(`  candidate ${result.candidateTreeHash} · policy ${result.policyHash}`);
  } else {
    const structuralFindings = convergence
      ? convergence.summary.missing + convergence.summary.contradictory + convergence.summary.unplanned
      : 0;
    console.error(
      `Atomic preflight rejected ${result.violations.length + structuralFindings} finding(s):`
    );
    for (const finding of result.diagnostics.filter(({ severity }) => severity === 'error')) {
      console.error(
        `  - ${finding.ruleId} ${finding.location.file}:${finding.location.line} — ${finding.message}`
      );
      console.error(`    Next action: ${finding.nextAction}`);
    }
    for (const finding of convergence?.findings ?? []) {
      if (finding.classification !== 'satisfied') {
        console.error(`  - ${finding.id} — ${finding.message}`);
        console.error(`    Next action: ${finding.nextAction}`);
      }
    }
    console.error('No project file was written. Fix the complete change set and preflight again.');
  }
  if (convergence) {
    const { satisfied, missing, contradictory, unplanned } = convergence.summary;
    const write = convergence.structurallyConverged ? console.log : console.error;
    write(
      `Structural convergence: ${convergence.structurallyConverged ? 'passed' : 'failed'} · satisfied ${satisfied} · missing ${missing} · contradictory ${contradictory} · unplanned ${unplanned}.`
    );
    write('Behavioral completion: not evaluated; run the feature acceptance tests separately.');
  }
}

export function readChangeSetFile(root, requestPath) {
  const absolute = path.isAbsolute(requestPath) ? requestPath : path.join(root, requestPath);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(
      `Cannot read atomic change set ${absolute}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return Array.isArray(parsed) ? parsed : parsed?.changes;
}

export function readChangeMapFile(root, requestPath) {
  const absolute = path.isAbsolute(requestPath) ? requestPath : path.join(root, requestPath);
  try {
    return { source: absolute, input: JSON.parse(fs.readFileSync(absolute, 'utf8')) };
  } catch (error) {
    throw new Error(
      `Cannot read architecture change map ${absolute}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
