import fs from 'node:fs';
import path from 'node:path';
import { loadArchitectureChangeMap, loadContract, preflightChange } from './analysis-engine.mjs';
import { createAdapterResult } from './adapter-contract.mjs';
import { collectGovernedFiles, isGovernableSourceFile, normalize } from './scan-files.mjs';
import { isScanExcludedRelative, layerForRelativePath } from '../ark-shared.mjs';

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

function assertGovernedSource(config, relativePath) {
  if (!isGovernableSourceFile(path.basename(relativePath))) {
    throw new Error(`Atomic preflight only accepts governed production source files: ${relativePath}`);
  }
  if (!isIncluded(relativePath, config.include) || isScanExcludedRelative(relativePath, config)) {
    throw new Error(`Change path is outside the configured source scope: ${relativePath}`);
  }
  if (!layerForRelativePath(relativePath, config.layers)) {
    throw new Error(`Change path is not assigned to an architecture layer: ${relativePath}`);
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

export function normalizeChangeSet(input) {
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

function baseFilesForChange(root, config, changes) {
  const byPath = new Map(
    collectGovernedFiles(root, config).map((absolute) => [
      normalize(path.relative(root, absolute)),
      { path: normalize(path.relative(root, absolute)), content: fs.readFileSync(absolute, 'utf8') },
    ])
  );
  for (const change of changes) {
    if (byPath.has(change.path) || !isGovernableSourceFile(path.basename(change.path))) continue;
    const absolute = path.join(root, change.path);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    byPath.set(change.path, { path: change.path, content: fs.readFileSync(absolute, 'utf8') });
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function prepareChangeFromRoot({
  root,
  config,
  configSource,
  changes,
  changeMap,
  changeMapSource,
  compilerOptions,
}) {
  const normalizedChanges = normalizeChangeSet(changes);
  for (const change of normalizedChanges) {
    assertInsideProject(root, change.path);
    assertGovernedSource(config, change.path);
  }
  const contract = loadContract(config, configSource ?? path.join(root, 'ark.config.json'));
  const loadedChangeMap =
    changeMap === undefined
      ? undefined
      : loadArchitectureChangeMap(changeMap, contract.config, changeMapSource);
  const result = preflightChange({
    contract,
    files: baseFilesForChange(root, config, normalizedChanges),
    changes: normalizedChanges,
    ...(loadedChangeMap ? { changeMap: loadedChangeMap } : {}),
    ...(compilerOptions ? { compilerOptions } : {}),
  });
  const { diagnostics } = createAdapterResult({
    valid: result.valid,
    completeness: 'complete',
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
