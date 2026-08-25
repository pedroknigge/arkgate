/**
 * Managed skill file IO shared by repo and Codex-home installation.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  isValidSemver,
  isVersionOlder,
  planSkillInstall,
  skillContentIdentity,
} from './skill-install.mjs';

export const HOME_SKILL_CATALOG = '.arkgate-catalog.json';
export const HOME_SKILL_PENDING_CATALOG = '.arkgate-catalog.pending.json';
const HOME_SKILL_LOCK = '.arkgate-install.lock';
const HOME_SKILL_CATALOG_SCHEMA = '1.0';
const HOME_SKILL_LOCK_STALE_MS = 5 * 60 * 1000;
const HOME_SKILL_LOCK_ATTEMPTS = 200;
const HOME_SKILL_LOCK_RETRY_MS = 25;
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  );
}

function rootContext(root) {
  const resolved = path.resolve(root);
  fs.mkdirSync(resolved, { recursive: true });
  const stat = fs.lstatSync(resolved);
  if (
    !stat.isDirectory() &&
    !(stat.isSymbolicLink() && fs.statSync(resolved).isDirectory())
  ) {
    throw new Error(`Managed skill root is not a directory: ${resolved}`);
  }
  return { path: resolved, real: fs.realpathSync(resolved) };
}

function targetWithinRoot(context, file) {
  const resolved = path.resolve(file);
  if (!isWithin(context.path, resolved) || resolved === context.path) {
    throw new Error(`Managed skill path escapes its catalog root: ${file}`);
  }
  return resolved;
}

function validateParents(context, file, create) {
  const resolved = targetWithinRoot(context, file);
  const rootStat = fs.lstatSync(context.path);
  if (
    !rootStat.isDirectory() &&
    !(rootStat.isSymbolicLink() && fs.statSync(context.path).isDirectory())
  ) {
    throw new Error(`Managed skill root is no longer a directory: ${context.path}`);
  }
  if (fs.realpathSync(context.path) !== context.real) {
    throw new Error(`Managed skill root changed during installation: ${context.path}`);
  }
  const relativeParent = path.relative(context.path, path.dirname(resolved));
  const segments = relativeParent === '' ? [] : relativeParent.split(path.sep);
  let cursor = context.path;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    let stat = fs.lstatSync(cursor, { throwIfNoEntry: false });
    if (!stat) {
      if (!create) return false;
      fs.mkdirSync(cursor);
      stat = fs.lstatSync(cursor);
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Managed skill parent must not be a symlink or junction: ${cursor}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Managed skill parent is not a directory: ${cursor}`);
    }
    const real = fs.realpathSync(cursor);
    if (!isWithin(context.real, real)) {
      throw new Error(`Managed skill parent resolves outside its catalog root: ${cursor}`);
    }
  }
  return true;
}

function sameFileState(left, right) {
  if (!left || !right) return false;
  if (
    left.dev !== undefined &&
    left.ino !== undefined &&
    (left.dev !== 0 || left.ino !== 0) &&
    (left.dev !== right.dev || left.ino !== right.ino)
  ) {
    return false;
  }
  return (
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function sameFileIdentity(left, right) {
  if (!left || !right) return false;
  if (left.dev !== undefined && left.ino !== undefined && (left.dev !== 0 || left.ino !== 0)) {
    return left.dev === right.dev && left.ino === right.ino;
  }
  return left.size === right.size && left.birthtimeMs === right.birthtimeMs;
}

function readSafeFile(context, file) {
  const resolved = targetWithinRoot(context, file);
  if (!validateParents(context, resolved, false)) return null;
  const before = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    throw new Error(`Managed target is not a single-link regular file: ${resolved}`);
  }
  let content;
  try {
    content = fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    throw new Error(`Existing managed target is unreadable (${resolved}): ${messageOf(error)}`);
  }
  validateParents(context, resolved, false);
  const after = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (
    !after ||
    !after.isFile() ||
    after.isSymbolicLink() ||
    after.nlink !== 1 ||
    !sameFileState(before, after)
  ) {
    throw new Error(`Managed target changed while it was being read: ${resolved}`);
  }
  return { content, stat: after };
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, 'r');
    fs.fsyncSync(descriptor);
  } catch {
    // Some filesystems/platforms do not support syncing directory handles.
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function cleanupOwnedTemp(context, file, createdStat) {
  try {
    const current = readSafeFile(context, file);
    if (current && sameFileIdentity(current.stat, createdStat)) {
      fs.unlinkSync(file);
    }
  } catch {
    // Never delete a temp path that no longer identifies as the file we created.
  }
}

function atomicReplaceFile(context, file, content, expectedContent) {
  const resolved = targetWithinRoot(context, file);
  validateParents(context, resolved, true);
  const observed = readSafeFile(context, resolved);
  if ((observed?.content ?? null) !== expectedContent) {
    throw new Error(`Managed target changed concurrently before write: ${resolved}`);
  }

  const token = randomUUID();
  const temp = path.join(
    path.dirname(resolved),
    `.${path.basename(resolved)}.arkgate-${token}.tmp`
  );
  let descriptor;
  let createdStat;
  try {
    validateParents(context, temp, false);
    descriptor = fs.openSync(temp, 'wx', observed ? observed.stat.mode & 0o777 : 0o666);
    createdStat = fs.fstatSync(descriptor);
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;

    const beforeReplace = readSafeFile(context, resolved);
    if ((beforeReplace?.content ?? null) !== expectedContent) {
      throw new Error(`Managed target changed concurrently during write: ${resolved}`);
    }
    const staged = readSafeFile(context, temp);
    if (staged?.content !== content) {
      throw new Error(`Atomic managed write staging verification failed: ${resolved}`);
    }
    validateParents(context, resolved, false);
    fs.renameSync(temp, resolved);
    fsyncDirectory(path.dirname(resolved));
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    cleanupOwnedTemp(context, temp, createdStat);
  }
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function parseLock(content) {
  try {
    const value = JSON.parse(content);
    if (
      typeof value?.token !== 'string' ||
      !UUID_PATTERN.test(value.token) ||
      !Number.isInteger(value.pid) ||
      value.pid <= 0 ||
      !Number.isFinite(value.createdAtMs) ||
      value.createdAtMs <= 0
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function restoreClaimedFile(context, claimed, original) {
  try {
    validateParents(context, claimed, false);
    validateParents(context, original, false);
    fs.linkSync(claimed, original);
    fs.unlinkSync(claimed);
    return true;
  } catch {
    return false;
  }
}

function removeOwnedTokenFile(context, file, token, parseMetadata, claimKind) {
  const claimed = `${file}.${claimKind}-${token}`;
  try {
    const current = readSafeFile(context, file);
    if (parseMetadata(current?.content)?.token !== token) return false;
    validateParents(context, file, false);
    const confirmed = readSafeFile(context, file);
    if (parseMetadata(confirmed?.content)?.token !== token) return false;
    validateParents(context, claimed, false);
    fs.renameSync(file, claimed);
    const moved = readSafeFile(context, claimed);
    if (parseMetadata(moved?.content)?.token !== token) {
      restoreClaimedFile(context, claimed, file);
      return false;
    }
    fs.unlinkSync(claimed);
    fsyncDirectory(path.dirname(file));
    return true;
  } catch {
    return false;
  }
}

function removeOwnedLock(context, file, token) {
  return removeOwnedTokenFile(context, file, token, parseLock, 'release');
}

function createOwnedLock(context, file) {
  const token = randomUUID();
  const content = `${JSON.stringify({
    token,
    pid: process.pid,
    createdAtMs: Date.now(),
  })}\n`;
  validateParents(context, file, true);
  let descriptor;
  let createdStat;
  try {
    descriptor = fs.openSync(file, 'wx', 0o600);
    createdStat = fs.fstatSync(descriptor);
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fsyncDirectory(path.dirname(file));
    return { file, token };
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (createdStat) {
      try {
        validateParents(context, file, false);
        const current = fs.lstatSync(file, { throwIfNoEntry: false });
        if (sameFileIdentity(createdStat, current)) fs.unlinkSync(file);
      } catch {
        // Preserve anything that no longer identifies as the inode we created.
      }
    }
    throw error;
  }
}

function recoverStaleLock(context, file) {
  const current = readSafeFile(context, file);
  if (!current) return true;
  const metadata = parseLock(current.content);
  const timestamp = metadata?.createdAtMs ?? current.stat.mtimeMs;
  if (Date.now() - timestamp <= HOME_SKILL_LOCK_STALE_MS) return false;
  if (metadata && processIsAlive(metadata.pid)) return false;

  const recoveryToken = randomUUID();
  const claimed = path.join(
    path.dirname(file),
    `${HOME_SKILL_LOCK}.recovery-${recoveryToken}`
  );
  validateParents(context, claimed, false);
  validateParents(context, file, false);
  const confirmed = readSafeFile(context, file);
  if (
    !confirmed ||
    confirmed.content !== current.content ||
    !sameFileState(confirmed.stat, current.stat)
  ) {
    return false;
  }
  try {
    fs.renameSync(file, claimed);
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
  const recovered = readSafeFile(context, claimed);
  if (
    !recovered ||
    recovered.content !== current.content ||
    !sameFileIdentity(recovered.stat, current.stat)
  ) {
    restoreClaimedFile(context, claimed, file);
    throw new Error(`Stale home skill lock changed during recovery: ${HOME_SKILL_LOCK}`);
  }
  const ownedContent = `${JSON.stringify({
    token: recoveryToken,
    pid: process.pid,
    createdAtMs: Date.now(),
  })}\n`;
  atomicReplaceFile(context, claimed, ownedContent, current.content);
  if (!removeOwnedLock(context, claimed, recoveryToken)) {
    throw new Error(`Could not release recovered home skill lock: ${HOME_SKILL_LOCK}`);
  }
  return true;
}

function acquireHomeLock(context) {
  const file = path.join(context.path, HOME_SKILL_LOCK);
  let lastConflict = null;
  for (let attempt = 0; attempt < HOME_SKILL_LOCK_ATTEMPTS; attempt += 1) {
    try {
      return createOwnedLock(context, file);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      lastConflict = error;
      if (recoverStaleLock(context, file)) continue;
      if (attempt + 1 < HOME_SKILL_LOCK_ATTEMPTS) {
        sleepSync(HOME_SKILL_LOCK_RETRY_MS);
      }
    }
  }
  throw new Error(
    `another home skill install is active (${HOME_SKILL_LOCK}); retry after it finishes` +
      (lastConflict?.message ? `: ${lastConflict.message}` : '')
  );
}

export function skillInstallNote(plan) {
  const scope = plan.scope === 'home' ? 'home-shared' : 'repo';
  const source = plan.sourceVersion ? `arkgate@${plan.sourceVersion}` : 'arkgate@unknown';
  const installed = plan.installedVersion ?? 'no stamp';
  if (plan.reason === 'content-current') {
    return `scope=${scope}; body current; installed=${installed}; source=${source}; no write`;
  }
  if (plan.reason === 'stamp-refresh') {
    return `scope=${scope}; stamp refresh; installed=${installed}; source=${source}`;
  }
  if (plan.reason === 'newer-home-version') {
    return `scope=${scope}; CONFLICT installed=${installed} newer than source=${source}; downgrade blocked`;
  }
  if (plan.reason === 'unknown-source-version') {
    return `scope=${scope}; CONFLICT installed=${installed}; source version unknown; overwrite blocked`;
  }
  if (plan.reason === 'existing-preserved') {
    return `scope=${scope}; CONFLICT body differs; installed=${installed}; source=${source}; preserved without --force`;
  }
  return `scope=${scope}; source=${source}; ${plan.reason === 'missing' ? 'missing' : 'body update'}`;
}

/**
 * @param {{
 *   root: string,
 *   file: string,
 *   relativePath: string,
 *   targetContent: string,
 *   packageVersion: string|null,
 *   force: boolean,
 *   scope: 'repo'|'home',
 * }} input
 */
export function installSkillFile(input) {
  if (input.scope === 'home' && !isValidSemver(input.packageVersion)) {
    return {
      relativePath: input.relativePath,
      status: 'failed',
      message: 'Shared-home skill writes require a valid SemVer package version.',
    };
  }
  let context;
  let existingContent = null;
  try {
    context = rootContext(input.root);
    existingContent = readSafeFile(context, input.file)?.content ?? null;
  } catch (error) {
    return {
      relativePath: input.relativePath,
      status: 'failed',
      message: messageOf(error),
    };
  }
  const skillPlan = planSkillInstall({
    existingContent,
    targetContent: input.targetContent,
    packageVersion: input.packageVersion,
    force: input.force,
    scope: input.scope,
  });
  if (skillPlan.action === 'skip') {
    return { relativePath: input.relativePath, status: 'skipped', skillPlan };
  }
  try {
    atomicReplaceFile(context, input.file, input.targetContent, existingContent);
    return { relativePath: input.relativePath, status: 'written', skillPlan };
  } catch (error) {
    return {
      relativePath: input.relativePath,
      status: 'failed',
      skillPlan,
      message: messageOf(error),
    };
  }
}

export function installRepoSkillFile(root, relativePath, targetContent, packageVersion, force) {
  return installSkillFile({
    root,
    file: path.join(root, relativePath),
    relativePath,
    targetContent,
    packageVersion,
    force,
    scope: 'repo',
  });
}

function failedCatalog(directory, message, displayPath = HOME_SKILL_CATALOG) {
  return [{
    relativePath: path.join(directory, displayPath),
    displayPath,
    status: 'failed',
    message,
  }];
}

function readHomeCatalog(context) {
  const file = path.join(context.path, HOME_SKILL_CATALOG);
  const current = readSafeFile(context, file);
  if (!current) return { file, value: null, content: null };
  let value;
  try {
    value = JSON.parse(current.content);
  } catch {
    throw new Error(
      `${HOME_SKILL_CATALOG} is unreadable or invalid JSON; no home skills changed. ` +
        'Repair it or move it aside after verifying no newer ArkGate catalog is active.'
    );
  }
  const valid =
    value?.schemaVersion === HOME_SKILL_CATALOG_SCHEMA &&
    isValidSemver(value.packageVersion) &&
    Array.isArray(value.skills);
  if (!valid) {
    throw new Error(
      `${HOME_SKILL_CATALOG} has an unsupported shape; no home skills changed. ` +
        'Expected schemaVersion, packageVersion, and managed skill identities.'
    );
  }
  const seen = new Set();
  for (const skill of value.skills) {
    if (
      !skill ||
      typeof skill.name !== 'string' ||
      !/^ark-[a-z0-9-]+$/.test(skill.name) ||
      typeof skill.contentIdentity !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(skill.contentIdentity) ||
      seen.has(skill.name)
    ) {
      throw new Error(
        `${HOME_SKILL_CATALOG} has invalid managed skill identities; no home skills changed.`
      );
    }
    seen.add(skill.name);
  }
  return { file, value, content: current.content };
}

function parsePendingCatalog(content) {
  try {
    const value = JSON.parse(content);
    const keys =
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(value).sort()
        : [];
    if (
      keys.join(',') !== 'packageVersion,schemaVersion,token' ||
      value.schemaVersion !== HOME_SKILL_CATALOG_SCHEMA ||
      !isValidSemver(value.packageVersion) ||
      typeof value.token !== 'string' ||
      !UUID_PATTERN.test(value.token)
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function readPendingCatalog(context) {
  const file = path.join(context.path, HOME_SKILL_PENDING_CATALOG);
  const current = readSafeFile(context, file);
  if (!current) return { file, value: null, content: null };
  const value = parsePendingCatalog(current.content);
  if (!value) {
    throw new Error(
      `${HOME_SKILL_PENDING_CATALOG} is unreadable or invalid; no home skills changed. ` +
        'Repair it only after verifying the newest ArkGate version that may have started an install.'
    );
  }
  return { file, value, content: current.content };
}

function newestInstalledVersion(context, catalogVersion, pendingVersion) {
  let newest = null;
  for (const version of [catalogVersion, pendingVersion]) {
    if (isValidSemver(version) && (!newest || isVersionOlder(newest, version))) {
      newest = version;
    }
  }
  const entries = fs.readdirSync(context.path, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^ark-[a-z0-9-]+$/.test(entry.name)) continue;
    const current = readSafeFile(
      context,
      path.join(context.path, entry.name, 'SKILL.md')
    );
    const version = current?.content.match(/^arkVersion:\s*(.+)$/m)?.[1]?.trim() ?? null;
    if (
      isValidSemver(version) &&
      (!newest || isVersionOlder(newest, version))
    ) {
      newest = version;
    }
  }
  return newest;
}

function pendingCatalogContent(packageVersion, token) {
  return `${JSON.stringify({
    schemaVersion: HOME_SKILL_CATALOG_SCHEMA,
    packageVersion,
    token,
  }, null, 2)}\n`;
}

function removeOwnedPendingCatalog(context, file, token) {
  try {
    if (!readSafeFile(context, file)) return true;
  } catch {
    return false;
  }
  return removeOwnedTokenFile(
    context,
    file,
    token,
    parsePendingCatalog,
    'commit'
  );
}

function catalogContent(packageVersion, entries) {
  return `${JSON.stringify({
    schemaVersion: HOME_SKILL_CATALOG_SCHEMA,
    packageVersion,
    skills: entries.sort((left, right) => left.name.localeCompare(right.name)),
  }, null, 2)}\n`;
}

function retireManagedHomeSkills(context, priorEntries, targetNames, force) {
  const results = [];
  const retainedEntries = [];
  for (const entry of priorEntries) {
    if (targetNames.has(entry.name)) continue;
    const file = path.join(context.path, entry.name, 'SKILL.md');
    let current;
    try {
      current = readSafeFile(context, file);
    } catch (error) {
      results.push({
        relativePath: file,
        displayPath: `${entry.name}/SKILL.md`,
        status: 'failed',
        message: messageOf(error),
      });
      continue;
    }
    if (!current) continue;
    if (skillContentIdentity(current.content) !== entry.contentIdentity) {
      results.push({
        relativePath: file,
        displayPath: `${entry.name}/SKILL.md`,
        status: 'skipped',
        note: 'scope=home-shared; retired but customized; preserved and ownership released',
      });
      continue;
    }
    if (!force) {
      retainedEntries.push(entry);
      results.push({
        relativePath: file,
        displayPath: `${entry.name}/SKILL.md`,
        status: 'skipped',
        note: 'scope=home-shared; retired Ark-owned skill preserved without --force',
      });
      continue;
    }
    try {
      const confirmed = readSafeFile(context, file);
      if (
        !confirmed ||
        skillContentIdentity(confirmed.content) !== entry.contentIdentity
      ) {
        throw new Error(`Retired managed skill changed before removal: ${file}`);
      }
      validateParents(context, file, false);
      fs.unlinkSync(file);
      try {
        const parent = path.dirname(file);
        validateParents(context, path.join(parent, '.arkgate-parent-check'), false);
        const parentStat = fs.lstatSync(parent);
        if (!parentStat.isSymbolicLink() && parentStat.isDirectory()) fs.rmdirSync(parent);
      } catch {
        // Keep a non-empty directory and any user-owned sibling files.
      }
      results.push({
        relativePath: file,
        displayPath: `${entry.name}/SKILL.md`,
        status: 'removed',
        note: 'scope=home-shared; retired Ark-owned skill removed',
      });
    } catch (error) {
      results.push({
        relativePath: file,
        displayPath: `${entry.name}/SKILL.md`,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { results, retainedEntries };
}

function installHomeSkillCatalog({ directory, skills, packageVersion, force }) {
  if (!isValidSemver(packageVersion)) {
    return failedCatalog(
      directory,
      'ArkGate package version is unavailable or not valid SemVer; refusing to mutate the shared home catalog.'
    );
  }
  const seenNames = new Set();
  let validSkills = Array.isArray(skills);
  if (validSkills) {
    for (const entry of skills) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        !/^ark-[a-z0-9-]+$/.test(entry[0]) ||
        typeof entry[1] !== 'string' ||
        seenNames.has(entry[0])
      ) {
        validSkills = false;
        break;
      }
      seenNames.add(entry[0]);
    }
  }
  if (!validSkills) {
    return failedCatalog(
      directory,
      'Home skill input contains an invalid or duplicate managed skill name; no home skills changed.'
    );
  }
  let context;
  try {
    context = rootContext(directory);
  } catch (error) {
    return failedCatalog(directory, messageOf(error));
  }
  let lock;
  try {
    lock = acquireHomeLock(context);
  } catch (error) {
    return failedCatalog(directory, messageOf(error));
  }
  try {
    const catalog = readHomeCatalog(context);
    let pending;
    try {
      pending = readPendingCatalog(context);
    } catch (error) {
      return failedCatalog(
        directory,
        messageOf(error),
        HOME_SKILL_PENDING_CATALOG
      );
    }
    const installedVersion = newestInstalledVersion(
      context,
      catalog.value?.packageVersion ?? null,
      pending.value?.packageVersion ?? null
    );
    if (installedVersion && isVersionOlder(packageVersion, installedVersion)) {
      return [{
        relativePath: catalog.file,
        displayPath: HOME_SKILL_CATALOG,
        status: 'skipped',
        note:
          `scope=home-shared; CONFLICT catalog=${installedVersion} newer than ` +
          `source=arkgate@${packageVersion}; entire home update and retirements blocked`,
      }];
    }

    const pendingToken = randomUUID();
    const nextPendingContent = pendingCatalogContent(packageVersion, pendingToken);
    try {
      atomicReplaceFile(
        context,
        pending.file,
        nextPendingContent,
        pending.content
      );
    } catch (error) {
      return [{
        relativePath: pending.file,
        displayPath: HOME_SKILL_PENDING_CATALOG,
        status: 'failed',
        message:
          `${messageOf(error)}; no home skills changed because the durable ` +
          'catalog journal could not be committed.',
      }];
    }

    const installed = skills.map(([name, targetContent]) => ({
      ...installSkillFile({
        root: context.path,
        file: path.join(context.path, name, 'SKILL.md'),
        relativePath: path.join(context.path, name, 'SKILL.md'),
        targetContent,
        packageVersion,
        force,
        scope: 'home',
      }),
      name,
      targetContent,
      displayPath: `${name}/SKILL.md`,
    }));
    if (installed.some((result) => result.status === 'failed')) return installed;

    const targetNames = new Set(skills.map(([name]) => name));
    const retired = retireManagedHomeSkills(
      context,
      catalog.value?.skills ?? [],
      targetNames,
      force
    );
    if (retired.results.some((result) => result.status === 'failed')) {
      return [...installed, ...retired.results];
    }

    const managedEntries = installed
      .filter(
        (result) =>
          result.status === 'written' || result.skillPlan?.reason === 'content-current'
      )
      .map((result) => ({
        name: result.name,
        contentIdentity: skillContentIdentity(result.targetContent),
      }))
      .concat(retired.retainedEntries);
    const nextContent = catalogContent(packageVersion, managedEntries);
    const catalogResult =
      nextContent === catalog.content
        ? {
            relativePath: catalog.file,
            displayPath: HOME_SKILL_CATALOG,
            status: 'skipped',
            note: `scope=home-shared; catalog current at arkgate@${packageVersion}; no write`,
          }
        : (() => {
            try {
              atomicReplaceFile(context, catalog.file, nextContent, catalog.content);
              return {
                relativePath: catalog.file,
                displayPath: HOME_SKILL_CATALOG,
                status: 'written',
                note: `scope=home-shared; catalog advanced to arkgate@${packageVersion}`,
              };
            } catch (error) {
              return {
                relativePath: catalog.file,
                displayPath: HOME_SKILL_CATALOG,
                status: 'failed',
                message: messageOf(error),
              };
            }
          })();
    const results = [...installed, ...retired.results, catalogResult];
    if (catalogResult.status === 'failed') return results;
    if (!removeOwnedPendingCatalog(context, pending.file, pendingToken)) {
      return [
        ...results,
        {
          relativePath: pending.file,
          displayPath: HOME_SKILL_PENDING_CATALOG,
          status: 'failed',
          message:
            'The shared catalog committed, but its durable journal changed or could not be ' +
            'removed; it was preserved for a safe same-or-newer retry.',
        },
      ];
    }
    return results;
  } catch (error) {
    return failedCatalog(directory, messageOf(error));
  } finally {
    if (lock) removeOwnedLock(context, lock.file, lock.token);
  }
}

export function installSkillCatalog(input) {
  if (input.scope === 'home') return installHomeSkillCatalog(input);
  return input.skills.map(([name, targetContent]) => ({
    ...installSkillFile({
      root: input.directory,
      file: path.join(input.directory, name, 'SKILL.md'),
      relativePath: path.join(input.directory, name, 'SKILL.md'),
      targetContent,
      packageVersion: input.packageVersion,
      force: input.force,
      scope: input.scope,
    }),
    displayPath: `${name}/SKILL.md`,
  }));
}

export function skillInstallLine(result) {
  const marker =
    result.status === 'written'
      ? 'wrote'
      : result.status === 'removed'
        ? 'removed'
        : result.status === 'failed'
          ? 'FAILED'
          : 'skipped';
  const detail =
    result.status === 'failed'
      ? ` (${result.message})`
      : `  (${result.note ?? skillInstallNote(result.skillPlan)})`;
  return `  ${marker.padEnd(7)} ${result.displayPath}${detail}`;
}
