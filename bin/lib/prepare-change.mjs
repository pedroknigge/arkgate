import fs from 'node:fs';
import path from 'node:path';
import { loadContract, preflightChange } from './analysis-engine.mjs';
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

export function prepareChangeFromRoot({ root, config, configSource, changes, compilerOptions }) {
  const normalizedChanges = normalizeChangeSet(changes);
  for (const change of normalizedChanges) {
    assertInsideProject(root, change.path);
    assertGovernedSource(config, change.path);
  }
  const result = preflightChange({
    contract: loadContract(config, configSource ?? path.join(root, 'ark.config.json')),
    files: baseFilesForChange(root, config, normalizedChanges),
    changes: normalizedChanges,
    ...(compilerOptions ? { compilerOptions } : {}),
  });
  return {
    ...createAdapterResult({
      valid: result.valid,
      violations: result.violations,
      warnings: result.warnings,
    }),
    ...result,
  };
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
