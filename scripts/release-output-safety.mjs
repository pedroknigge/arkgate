import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const RELEASE_OUTPUT_MARKER = '.arkgate-release-artifacts.json';

const ownership = Object.freeze({
  schemaVersion: 1,
  owner: 'arkgate.release-artifacts',
});

function fail(reason) {
  throw new Error(`Unsafe release output: ${reason}`);
}

function isSameOrParent(candidate, target) {
  const relative = path.relative(candidate, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isStrictChild(candidate, target) {
  return candidate !== target && isSameOrParent(candidate, target);
}

function nearestExistingParent(target) {
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function hasOwnershipMarker(output) {
  const marker = path.join(output, RELEASE_OUTPUT_MARKER);
  if (!fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink()) return false;
  try {
    const value = JSON.parse(fs.readFileSync(marker, 'utf8'));
    return value?.schemaVersion === ownership.schemaVersion && value?.owner === ownership.owner;
  } catch {
    return false;
  }
}

export function defaultReleaseOutput(repositoryRoot) {
  const legacyOutput = path.join(path.resolve(repositoryRoot), 'release', 'artifacts');
  if (!fs.existsSync(legacyOutput) || hasOwnershipMarker(legacyOutput)) return legacyOutput;
  return path.join(legacyOutput, 'arkgate-owned');
}

export function validateReleaseOutput(output, repositoryRoot) {
  if (typeof output !== 'string' || output.trim() === '') fail('missing --out path');
  const resolvedOutput = path.resolve(output);
  const lexicalRoot = path.resolve(repositoryRoot);
  const lexicalTemp = path.resolve(os.tmpdir());
  const resolvedRoot = fs.realpathSync(repositoryRoot);
  const resolvedTemp = fs.realpathSync(os.tmpdir());
  const filesystemRoot = path.parse(resolvedRoot).root;

  if (resolvedOutput === filesystemRoot || isSameOrParent(resolvedOutput, lexicalRoot)) {
    fail(`${resolvedOutput} is the repository root, one of its ancestors, or the filesystem root`);
  }

  let canonicalOutput;
  if (fs.existsSync(resolvedOutput)) {
    const stat = fs.lstatSync(resolvedOutput);
    if (stat.isSymbolicLink()) fail(`${resolvedOutput} is a symbolic link`);
    if (!stat.isDirectory()) fail(`${resolvedOutput} is not a directory`);
    canonicalOutput = fs.realpathSync(resolvedOutput);
    if (!hasOwnershipMarker(resolvedOutput)) {
      fail(`${resolvedOutput} already exists and is not owned by ArkGate`);
    }
  } else {
    const existingParent = nearestExistingParent(resolvedOutput);
    const parentStat = fs.lstatSync(existingParent);
    if (parentStat.isSymbolicLink()) fail(`${existingParent} is a symbolic link`);
    const realParent = fs.realpathSync(existingParent);
    canonicalOutput = path.resolve(
      realParent,
      path.relative(existingParent, resolvedOutput)
    );
  }

  if (isStrictChild(lexicalRoot, resolvedOutput)) {
    if (!isStrictChild(resolvedRoot, canonicalOutput)) {
      fail(`${resolvedOutput} escapes the repository boundary through a symbolic link`);
    }
  } else if (
    isStrictChild(lexicalTemp, resolvedOutput) ||
    isStrictChild(resolvedTemp, resolvedOutput)
  ) {
    if (!isStrictChild(resolvedTemp, canonicalOutput)) {
      fail(`${resolvedOutput} escapes the temporary-directory boundary through a symbolic link`);
    }
  } else {
    fail(`${resolvedOutput} must be inside the repository or the system temporary directory`);
  }

  return canonicalOutput;
}

export function prepareReleaseOutput(output, repositoryRoot) {
  const resolvedOutput = validateReleaseOutput(output, repositoryRoot);
  if (!fs.existsSync(resolvedOutput)) {
    fs.mkdirSync(resolvedOutput, { recursive: true });
    fs.writeFileSync(
      path.join(resolvedOutput, RELEASE_OUTPUT_MARKER),
      `${JSON.stringify(ownership, null, 2)}\n`,
      { flag: 'wx' }
    );
  } else {
    validateReleaseOutput(resolvedOutput, repositoryRoot);
  }
  const canonicalOutput = fs.realpathSync(resolvedOutput);
  for (const entry of ['gate', 'runtime', 'report.json']) {
    fs.rmSync(path.join(canonicalOutput, entry), { recursive: true, force: true });
  }
  return canonicalOutput;
}
