import { createHash } from 'node:crypto';
import {
  TASK_ID_PATTERN,
  TASK_NOUN_PATTERN,
  TASK_SCENARIOS,
} from './task-materialize.mjs';

export const LEDGER_GENESIS_HASH = '0'.repeat(64);
export const REQUIRED_MUTATION_RANGES = Object.freeze({
  'analysis-completeness': 'bin/lib/analysis-completeness.mjs',
  'resolved-candidate-facts': 'bin/lib/resolved-candidate-facts.mjs',
  'managed-upgrade': 'bin/lib/managed-upgrade.mjs',
  'snapshot-invalidation': 'bin/lib/resident-hook.mjs',
});

const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ID = /^[a-z0-9][a-z0-9._-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ARMS = ['control', 'treatment'];
const GRADER_STAGES = ['integrity', 'architecture', 'typecheck', 'tests'];

export class CausalContractError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'CausalContractError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new CausalContractError(code, message, details);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertObject(value, at) {
  if (!isPlainObject(value)) fail('MANIFEST_INVALID', `${at} must be an object`);
}

function assertExactKeys(value, required, optional, at, code = 'MANIFEST_INVALID') {
  assertObject(value, at);
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0 || extra.length > 0) {
    fail(code, `${at} has an invalid shape`, { missing, extra });
  }
}

function assertString(value, at, pattern = undefined) {
  if (typeof value !== 'string' || value.length === 0 || (pattern && !pattern.test(value))) {
    fail('MANIFEST_INVALID', `${at} must be a non-empty string${pattern ? ' in the required format' : ''}`);
  }
}

function assertInteger(value, at, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    fail('MANIFEST_INVALID', `${at} must be an integer >= ${minimum}`);
  }
}

function assertFiniteNumber(value, at, { minimum = -Infinity, maximum = Infinity, exclusiveMinimum = false, exclusiveMaximum = false } = {}) {
  const aboveMinimum = exclusiveMinimum ? value > minimum : value >= minimum;
  const belowMaximum = exclusiveMaximum ? value < maximum : value <= maximum;
  if (typeof value !== 'number' || !Number.isFinite(value) || !aboveMinimum || !belowMaximum) {
    fail('MANIFEST_INVALID', `${at} is outside the accepted numeric range`);
  }
}

function assertArray(value, at, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) {
    fail('MANIFEST_INVALID', `${at} must be an array with at least ${minimum} item(s)`);
  }
}

function assertUnique(values, at, code = 'MANIFEST_INVALID') {
  if (new Set(values).size !== values.length) fail(code, `${at} contains duplicates`);
}

function assertId(value, at) {
  assertString(value, at, ID);
}

function assertSha256(value, at) {
  assertString(value, at, SHA256);
}

function assertGitSha(value, at) {
  assertString(value, at, GIT_SHA);
}

function assertSafeRelativePath(value, at) {
  assertString(value, at);
  const pieces = value.replaceAll('\\', '/').split('/');
  if (value.startsWith('/') || /^[a-z]:/i.test(value) || pieces.includes('..') || pieces.includes('.') || pieces.includes('')) {
    fail('MANIFEST_INVALID', `${at} must be a normalized relative path`);
  }
}

function assertArgv(value, at) {
  assertArray(value, at, 1);
  value.forEach((part, index) => assertString(part, `${at}[${index}]`));
}

function rawSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value, at = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail('NON_CANONICAL_JSON', `${at} contains a non-canonical number`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    const ownKeys = Reflect.ownKeys(value);
    if (
      keys.length !== value.length
      || keys.some((key, index) => key !== String(index))
      || ownKeys.length !== value.length + 1
      || ownKeys.some((key) => typeof key !== 'string' || (key !== 'length' && !keys.includes(key)))
    ) {
      fail('NON_CANONICAL_JSON', `${at} contains a sparse array or extra property`);
    }
    return value.map((item, index) => canonicalize(item, `${at}[${index}]`));
  }
  if (!isPlainObject(value)) fail('NON_CANONICAL_JSON', `${at} contains a non-JSON value`);

  const result = Object.create(null);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) fail('NON_CANONICAL_JSON', `${at} contains symbol keys`);
  for (const key of ownKeys.sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail('NON_CANONICAL_JSON', `${at}.${key} is not an enumerable data property`);
    }
    const item = descriptor.value;
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      fail('NON_CANONICAL_JSON', `${at}.${key} contains a non-JSON value`);
    }
    result[key] = canonicalize(item, `${at}.${key}`);
  }
  return result;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Canonical(value) {
  return rawSha256(canonicalJson(value));
}

export function orderRunsDeterministically(runs, orderSeed) {
  assertArray(runs, 'runs');
  assertString(orderSeed, 'orderSeed');
  return [...runs].sort((left, right) => {
    const leftKey = rawSha256(`${orderSeed}\0${left.cellId}`);
    const rightKey = rawSha256(`${orderSeed}\0${right.cellId}`);
    return leftKey.localeCompare(rightKey) || left.cellId.localeCompare(right.cellId);
  });
}

function validateToolchain(toolchain) {
  assertExactKeys(toolchain, ['os', 'nodeVersion', 'packageManagers', 'typescriptVersions'], [], 'toolchain');
  assertExactKeys(toolchain.os, ['platform', 'release', 'arch', 'image'], [], 'toolchain.os');
  for (const key of ['platform', 'release', 'arch', 'image']) assertString(toolchain.os[key], `toolchain.os.${key}`);
  assertString(toolchain.nodeVersion, 'toolchain.nodeVersion');
  assertArray(toolchain.packageManagers, 'toolchain.packageManagers', 1);
  const packageManagerKeys = [];
  toolchain.packageManagers.forEach((manager, index) => {
    assertExactKeys(manager, ['name', 'version'], [], `toolchain.packageManagers[${index}]`);
    if (!['npm', 'pnpm', 'yarn'].includes(manager.name)) fail('MANIFEST_INVALID', `unsupported package manager ${manager.name}`);
    assertString(manager.version, `toolchain.packageManagers[${index}].version`);
    packageManagerKeys.push(`${manager.name}@${manager.version}`);
  });
  assertUnique(packageManagerKeys, 'toolchain.packageManagers');
  assertArray(toolchain.typescriptVersions, 'toolchain.typescriptVersions', 1);
  toolchain.typescriptVersions.forEach((version, index) => assertString(version, `toolchain.typescriptVersions[${index}]`));
  assertUnique(toolchain.typescriptVersions, 'toolchain.typescriptVersions');
}

function validateDesign(design) {
  assertExactKeys(design, [
    'tauMs',
    'maxTurns',
    'sessionsPerArm',
    'bootstrapReplicates',
    'bootstrapSeed',
    'orderSeed',
    'confidenceLevel',
    'primaryMaxRatio',
    'primaryUpperBoundExclusive',
    'maxCompletionRegression',
    'percentiles',
    'exclusions',
  ], [], 'design');
  assertInteger(design.tauMs, 'design.tauMs', 32001);
  assertInteger(design.maxTurns, 'design.maxTurns', 1);
  assertInteger(design.sessionsPerArm, 'design.sessionsPerArm', 3);
  assertInteger(design.bootstrapReplicates, 'design.bootstrapReplicates', 50000);
  assertString(design.bootstrapSeed, 'design.bootstrapSeed');
  assertString(design.orderSeed, 'design.orderSeed');
  assertFiniteNumber(design.confidenceLevel, 'design.confidenceLevel', { minimum: 0, maximum: 1, exclusiveMinimum: true, exclusiveMaximum: true });
  assertFiniteNumber(design.primaryMaxRatio, 'design.primaryMaxRatio', { minimum: 0, maximum: 0.8, exclusiveMinimum: true });
  if (design.primaryUpperBoundExclusive !== 1) fail('MANIFEST_INVALID', 'design.primaryUpperBoundExclusive must remain 1');
  assertFiniteNumber(design.maxCompletionRegression, 'design.maxCompletionRegression', { minimum: 0, maximum: 0.05 });
  assertArray(design.percentiles, 'design.percentiles', 1);
  design.percentiles.forEach((percentile, index) => {
    assertFiniteNumber(percentile, `design.percentiles[${index}]`, { minimum: 0, maximum: 1, exclusiveMinimum: true, exclusiveMaximum: true });
  });
  assertUnique(design.percentiles, 'design.percentiles');
  assertArray(design.exclusions, 'design.exclusions');
  const exclusionIds = [];
  design.exclusions.forEach((exclusion, index) => {
    assertExactKeys(exclusion, ['id', 'rationale'], [], `design.exclusions[${index}]`);
    assertId(exclusion.id, `design.exclusions[${index}].id`);
    assertString(exclusion.rationale, `design.exclusions[${index}].rationale`);
    exclusionIds.push(exclusion.id);
  });
  assertUnique(exclusionIds, 'design.exclusions ids');
}

function validateRepositories(manifest) {
  assertArray(manifest.repositories, 'repositories', 6);
  const ids = [];
  const toolchains = new Set(manifest.toolchain.packageManagers.map((manager) => `${manager.name}@${manager.version}`));
  const typescriptVersions = new Set(manifest.toolchain.typescriptVersions);
  manifest.repositories.forEach((repository, index) => {
    const at = `repositories[${index}]`;
    assertExactKeys(repository, [
      'id', 'url', 'sha', 'treeSha', 'license', 'lockfile', 'packageManager', 'typescriptVersion', 'commands', 'commonPatch',
    ], [], at);
    assertId(repository.id, `${at}.id`);
    assertString(repository.url, `${at}.url`);
    assertGitSha(repository.sha, `${at}.sha`);
    assertGitSha(repository.treeSha, `${at}.treeSha`);
    assertString(repository.license, `${at}.license`);
    assertExactKeys(repository.lockfile, ['path', 'sha256', 'synthetic'], [], `${at}.lockfile`);
    assertSafeRelativePath(repository.lockfile.path, `${at}.lockfile.path`);
    assertSha256(repository.lockfile.sha256, `${at}.lockfile.sha256`);
    if (typeof repository.lockfile.synthetic !== 'boolean') fail('MANIFEST_INVALID', `${at}.lockfile.synthetic must be boolean`);
    assertExactKeys(repository.packageManager, ['name', 'version'], [], `${at}.packageManager`);
    assertString(repository.packageManager.name, `${at}.packageManager.name`);
    assertString(repository.packageManager.version, `${at}.packageManager.version`);
    if (!toolchains.has(`${repository.packageManager.name}@${repository.packageManager.version}`)) {
      fail('MANIFEST_DRIFT', `${repository.id} package manager is absent from the pinned toolchain`);
    }
    assertString(repository.typescriptVersion, `${at}.typescriptVersion`);
    if (!typescriptVersions.has(repository.typescriptVersion)) {
      fail('MANIFEST_DRIFT', `${repository.id} TypeScript version is absent from the pinned toolchain`);
    }
    assertExactKeys(repository.commands, ['install', 'typecheck', 'tests'], [], `${at}.commands`);
    assertArray(repository.commands.install, `${at}.commands.install`, 1);
    repository.commands.install.forEach((command, commandIndex) => {
      assertArgv(command, `${at}.commands.install[${commandIndex}]`);
    });
    for (const command of ['typecheck', 'tests']) assertArgv(repository.commands[command], `${at}.commands.${command}`);
    if (repository.commonPatch !== null) {
      assertExactKeys(repository.commonPatch, ['path', 'sha256', 'rationale'], [], `${at}.commonPatch`);
      assertSafeRelativePath(repository.commonPatch.path, `${at}.commonPatch.path`);
      assertSha256(repository.commonPatch.sha256, `${at}.commonPatch.sha256`);
      assertString(repository.commonPatch.rationale, `${at}.commonPatch.rationale`);
    }
    ids.push(repository.id);
  });
  assertUnique(ids, 'repository ids');
  return new Map(manifest.repositories.map((repository) => [repository.id, repository]));
}

function validateTasks(manifest, repositories) {
  assertArray(manifest.tasks, 'tasks', 24);
  const ids = [];
  const repositoriesWithTasks = new Set();
  manifest.tasks.forEach((task, index) => {
    const at = `tasks[${index}]`;
    assertExactKeys(task, [
      'id',
      'repositoryId',
      'scenario',
      'noun',
      'prompt',
      'promptSha256',
      'fixtureSha256',
      'oracleSha256',
      'architectureConfigSha256',
      'acceptanceSha256',
    ], [], at);
    assertString(task.id, `${at}.id`, TASK_ID_PATTERN);
    assertId(task.repositoryId, `${at}.repositoryId`);
    if (!TASK_SCENARIOS.includes(task.scenario)) fail('MANIFEST_INVALID', `${at}.scenario is unsupported`);
    assertString(task.noun, `${at}.noun`, TASK_NOUN_PATTERN);
    if (!repositories.has(task.repositoryId)) fail('MANIFEST_INVALID', `${task.id} references unknown repository ${task.repositoryId}`);
    assertString(task.prompt, `${at}.prompt`);
    assertSha256(task.promptSha256, `${at}.promptSha256`);
    if (rawSha256(task.prompt) !== task.promptSha256) fail('MANIFEST_DRIFT', `${task.id} prompt digest does not match its text`);
    for (const key of ['fixtureSha256', 'oracleSha256', 'architectureConfigSha256', 'acceptanceSha256']) {
      assertSha256(task[key], `${at}.${key}`);
    }
    ids.push(task.id);
    repositoriesWithTasks.add(task.repositoryId);
  });
  assertUnique(ids, 'task ids');
  for (const repositoryId of repositories.keys()) {
    if (!repositoriesWithTasks.has(repositoryId)) fail('MANIFEST_INVALID', `${repositoryId} has no held-out task`);
  }
  return new Map(manifest.tasks.map((task) => [task.id, task]));
}

function validateRuns(manifest, tasks) {
  const expectedCount = manifest.tasks.length * manifest.design.sessionsPerArm * ARMS.length;
  assertArray(manifest.runs, 'runs');
  if (manifest.runs.length !== expectedCount) {
    fail('MANIFEST_PAIR_INCOMPLETE', `runs must contain exactly ${expectedCount} preregistered cells`);
  }

  const cellIds = [];
  const sessionUuids = [];
  const workspaceIds = [];
  const orders = [];
  const pairs = new Map();
  const pairIds = new Map();
  manifest.runs.forEach((run, index) => {
    const at = `runs[${index}]`;
    assertExactKeys(run, [
      'cellId', 'pairId', 'repositoryId', 'taskId', 'replicate', 'arm', 'sessionUuid', 'order', 'workspaceId',
    ], [], at);
    for (const key of ['cellId', 'pairId', 'repositoryId', 'taskId', 'workspaceId']) assertId(run[key], `${at}.${key}`);
    if (!ARMS.includes(run.arm)) fail('MANIFEST_INVALID', `${at}.arm must be control or treatment`);
    assertInteger(run.replicate, `${at}.replicate`, 1);
    assertInteger(run.order, `${at}.order`, 1);
    assertString(run.sessionUuid, `${at}.sessionUuid`, UUID);
    const task = tasks.get(run.taskId);
    if (!task || task.repositoryId !== run.repositoryId) {
      fail('MANIFEST_INVALID', `${run.cellId} does not match its task/repository pin`);
    }
    if (run.replicate > manifest.design.sessionsPerArm) {
      fail('MANIFEST_PAIR_INCOMPLETE', `${run.cellId} exceeds sessionsPerArm`);
    }
    const key = `${run.taskId}\0${run.replicate}`;
    const pair = pairs.get(key) ?? { pairId: run.pairId, arms: new Set() };
    if (pair.pairId !== run.pairId || pair.arms.has(run.arm)) {
      fail('MANIFEST_PAIR_INCOMPLETE', `${run.cellId} has a mismatched or duplicate pair arm`);
    }
    pair.arms.add(run.arm);
    pairs.set(key, pair);
    const priorPairKey = pairIds.get(run.pairId);
    if (priorPairKey !== undefined && priorPairKey !== key) {
      fail('MANIFEST_WORKSPACE_OVERLAP', `${run.pairId} is shared by independent task pairs`);
    }
    pairIds.set(run.pairId, key);
    cellIds.push(run.cellId);
    sessionUuids.push(run.sessionUuid);
    workspaceIds.push(run.workspaceId);
    orders.push(run.order);
  });
  assertUnique(cellIds, 'run cell ids');
  assertUnique(sessionUuids, 'run session UUIDs', 'MANIFEST_UUID_DUPLICATE');
  assertUnique(workspaceIds, 'run workspace ids', 'MANIFEST_WORKSPACE_OVERLAP');
  assertUnique(orders, 'run order', 'MANIFEST_ORDER_INVALID');
  const expectedOrders = Array.from({ length: expectedCount }, (_, index) => index + 1);
  if (orders.some((order, index) => order !== expectedOrders[index])) {
    fail('MANIFEST_ORDER_INVALID', 'runs must be stored in contiguous execution order');
  }
  const deterministicOrder = orderRunsDeterministically(manifest.runs, manifest.design.orderSeed);
  if (deterministicOrder.some((run, index) => run.cellId !== manifest.runs[index].cellId)) {
    fail('MANIFEST_ORDER_INVALID', 'run order does not match the preregistered order seed');
  }
  for (const task of manifest.tasks) {
    for (let replicate = 1; replicate <= manifest.design.sessionsPerArm; replicate += 1) {
      const pair = pairs.get(`${task.id}\0${replicate}`);
      if (!pair || ARMS.some((arm) => !pair.arms.has(arm))) {
        fail('MANIFEST_PAIR_INCOMPLETE', `${task.id} replicate ${replicate} is not paired across both arms`);
      }
    }
  }
}

function validateMutation(mutation) {
  assertExactKeys(mutation, ['runner', 'configSha256', 'ranges'], [], 'mutation');
  assertString(mutation.runner, 'mutation.runner');
  assertSha256(mutation.configSha256, 'mutation.configSha256');
  assertArray(mutation.ranges, 'mutation.ranges', Object.keys(REQUIRED_MUTATION_RANGES).length);
  const ids = [];
  const byFile = new Map();
  mutation.ranges.forEach((range, index) => {
    const at = `mutation.ranges[${index}]`;
    assertExactKeys(range, ['id', 'file', 'startLine', 'endLine', 'sourceSha256'], [], at);
    assertId(range.id, `${at}.id`);
    assertSafeRelativePath(range.file, `${at}.file`);
    assertInteger(range.startLine, `${at}.startLine`, 1);
    assertInteger(range.endLine, `${at}.endLine`, range.startLine);
    assertSha256(range.sourceSha256, `${at}.sourceSha256`);
    const existing = byFile.get(range.file) ?? [];
    if (existing.some((other) => range.startLine <= other.endLine && other.startLine <= range.endLine)) {
      fail('MANIFEST_INVALID', `${range.id} overlaps another mutation range in ${range.file}`);
    }
    existing.push(range);
    byFile.set(range.file, existing);
    ids.push(range.id);
  });
  assertUnique(ids, 'mutation range ids');
  for (const [id, file] of Object.entries(REQUIRED_MUTATION_RANGES)) {
    const range = mutation.ranges.find((candidate) => candidate.id === id);
    if (!range || range.file !== file) fail('MANIFEST_INVALID', `mutation range ${id} must cover ${file}`);
  }
}

function validateManifestShape(manifest) {
  assertExactKeys(manifest, [
    'schemaVersion',
    'experimentId',
    'frozenAt',
    'candidate',
    'toolchain',
    'agent',
    'grader',
    'design',
    'arms',
    'repositories',
    'tasks',
    'runs',
    'mutation',
  ], ['$schema'], 'manifest');
  if (manifest.$schema !== undefined) assertString(manifest.$schema, 'manifest.$schema');
  if (manifest.schemaVersion !== 1) fail('MANIFEST_INVALID', 'schemaVersion must be 1');
  assertId(manifest.experimentId, 'experimentId');
  assertString(manifest.frozenAt, 'frozenAt');
  if (Number.isNaN(Date.parse(manifest.frozenAt)) || new Date(manifest.frozenAt).toISOString() !== manifest.frozenAt) {
    fail('MANIFEST_INVALID', 'frozenAt must be a canonical ISO-8601 timestamp');
  }

  assertExactKeys(manifest.candidate, ['sourceRepository', 'sourceSha', 'tarballUrl', 'tarballSha256'], [], 'candidate');
  assertString(manifest.candidate.sourceRepository, 'candidate.sourceRepository');
  assertGitSha(manifest.candidate.sourceSha, 'candidate.sourceSha');
  assertString(manifest.candidate.tarballUrl, 'candidate.tarballUrl');
  assertSha256(manifest.candidate.tarballSha256, 'candidate.tarballSha256');
  validateToolchain(manifest.toolchain);

  assertExactKeys(manifest.agent, [
    'provider',
    'name',
    'binary',
    'binarySha256',
    'cliVersion',
    'model',
    'configSha256',
    'environment',
    'invocationFlags',
    'modelSeed',
  ], [], 'agent');
  for (const key of ['provider', 'name', 'binary', 'cliVersion', 'model']) assertString(manifest.agent[key], `agent.${key}`);
  assertSha256(manifest.agent.binarySha256, 'agent.binarySha256');
  assertSha256(manifest.agent.configSha256, 'agent.configSha256');
  assertExactKeys(manifest.agent.environment, [
    'GROK_DISABLE_AUTOUPDATER', 'HOME', 'GROK_HOME', 'LANG', 'NO_COLOR', 'TZ',
  ], [], 'agent.environment');
  for (const [name, value] of Object.entries(manifest.agent.environment)) {
    assertString(value, `agent.environment.${name}`);
  }
  assertArray(manifest.agent.invocationFlags, 'agent.invocationFlags');
  manifest.agent.invocationFlags.forEach((flag, index) => assertString(flag, `agent.invocationFlags[${index}]`));
  assertUnique(manifest.agent.invocationFlags, 'agent.invocationFlags');
  if (manifest.agent.invocationFlags.some((flag) => /(^|[-_])seed($|[=_-])/i.test(flag))) {
    fail('MANIFEST_INVALID', 'agent invocation flags must not fabricate a model seed');
  }
  if (manifest.agent.modelSeed !== null) fail('MANIFEST_INVALID', 'agent.modelSeed must be null because the selected CLI exposes no model seed');

  assertExactKeys(manifest.grader, ['id', 'version', 'sha256', 'typeScriptHost', 'stages'], [], 'grader');
  assertId(manifest.grader.id, 'grader.id');
  assertString(manifest.grader.version, 'grader.version');
  assertSha256(manifest.grader.sha256, 'grader.sha256');
  assertExactKeys(manifest.grader.typeScriptHost, ['version', 'entrypoint', 'sha256'], [], 'grader.typeScriptHost');
  assertString(manifest.grader.typeScriptHost.version, 'grader.typeScriptHost.version');
  assertSafeRelativePath(manifest.grader.typeScriptHost.entrypoint, 'grader.typeScriptHost.entrypoint');
  assertSha256(manifest.grader.typeScriptHost.sha256, 'grader.typeScriptHost.sha256');
  if (canonicalJson(manifest.grader.stages) !== canonicalJson(GRADER_STAGES)) {
    fail('MANIFEST_INVALID', `grader.stages must be ${GRADER_STAGES.join(', ')}`);
  }
  validateDesign(manifest.design);

  assertExactKeys(manifest.arms, ARMS, [], 'arms');
  assertExactKeys(manifest.arms.control, ['arkgateEnabled', 'setupCommands'], [], 'arms.control');
  if (manifest.arms.control.arkgateEnabled !== false || !Array.isArray(manifest.arms.control.setupCommands) || manifest.arms.control.setupCommands.length !== 0) {
    fail('MANIFEST_INVALID', 'control must have ArkGate disabled and no intervention setup');
  }
  assertExactKeys(manifest.arms.treatment, ['arkgateEnabled', 'setupCommands'], [], 'arms.treatment');
  if (manifest.arms.treatment.arkgateEnabled !== true) fail('MANIFEST_INVALID', 'treatment must have ArkGate enabled');
  assertArray(manifest.arms.treatment.setupCommands, 'arms.treatment.setupCommands', 1);
  manifest.arms.treatment.setupCommands.forEach((command, index) => assertArgv(command, `arms.treatment.setupCommands[${index}]`));

  const repositories = validateRepositories(manifest);
  const tasks = validateTasks(manifest, repositories);
  validateRuns(manifest, tasks);
  validateMutation(manifest.mutation);
}

export function validateAndFreezeManifest(input) {
  const normalized = JSON.parse(canonicalJson(input));
  validateManifestShape(normalized);
  return deepFreeze(normalized);
}

export function freezeManifest(input) {
  const manifest = validateAndFreezeManifest(input);
  const canonical = canonicalJson(manifest);
  return Object.freeze({ manifest, canonical, sha256: rawSha256(canonical) });
}

export function manifestSha256(input) {
  return freezeManifest(input).sha256;
}

function findRun(manifest, cellId) {
  const run = manifest.runs.find((candidate) => candidate.cellId === cellId);
  if (!run) fail('LEDGER_DRIFT', `unknown cell ${cellId}`);
  return run;
}

function fingerprintCell(frozen, cellId, frozenHash = sha256Canonical(frozen)) {
  const run = findRun(frozen, cellId);
  return sha256Canonical({ manifestSha256: frozenHash, run });
}

export function cellFingerprint(input, cellId) {
  const frozen = validateAndFreezeManifest(input);
  return fingerprintCell(frozen, cellId);
}

function fingerprintMutation(frozen, frozenHash = sha256Canonical(frozen)) {
  return sha256Canonical({ manifestSha256: frozenHash, mutation: frozen.mutation });
}

export function mutationFingerprint(input) {
  const frozen = validateAndFreezeManifest(input);
  return fingerprintMutation(frozen);
}

export function validateTerminalForRun(inputManifest, cellId, inputTerminal) {
  const manifest = validateAndFreezeManifest(inputManifest);
  const run = findRun(manifest, cellId);
  const terminal = JSON.parse(canonicalJson(inputTerminal));
  validateTerminal(terminal, manifest.design, run.arm, `terminal[${cellId}]`);
  return deepFreeze(terminal);
}

export function computeLedgerEntryHash(entry) {
  assertObject(entry, 'ledger entry');
  const unsigned = { ...entry };
  delete unsigned.entryHash;
  return sha256Canonical(unsigned);
}

export function sealLedgerEntry(payload, previousHash = LEDGER_GENESIS_HASH) {
  assertObject(payload, 'ledger payload');
  assertSha256(previousHash, 'previousHash');
  if (Object.hasOwn(payload, 'entryHash') || Object.hasOwn(payload, 'previousHash')) {
    fail('LEDGER_INVALID', 'ledger payload must not predeclare hash-chain fields');
  }
  const entry = { ...JSON.parse(canonicalJson(payload)), previousHash };
  entry.entryHash = computeLedgerEntryHash(entry);
  return deepFreeze(JSON.parse(canonicalJson(entry)));
}

function assertLedgerExactKeys(entry, required, at) {
  assertExactKeys(entry, required, [], at, 'LEDGER_INVALID');
}

function assertLedgerSha256(value, at) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('LEDGER_INVALID', `${at} must be a lowercase SHA-256 digest`);
  }
}

function validateUsage(usage, at) {
  if (usage === null) return;
  assertLedgerExactKeys(usage, [
    'inputTokens', 'cacheReadInputTokens', 'outputTokens', 'totalTokens', 'costUsd', 'costIsPartial', 'usageIsIncomplete',
  ], at);
  for (const key of ['inputTokens', 'cacheReadInputTokens', 'outputTokens', 'totalTokens']) assertInteger(usage[key], `${at}.${key}`, 0);
  if (usage.totalTokens !== usage.inputTokens + usage.cacheReadInputTokens + usage.outputTokens) {
    fail('LEDGER_INVALID', `${at}.totalTokens does not match its components`);
  }
  if (usage.costUsd !== null) assertFiniteNumber(usage.costUsd, `${at}.costUsd`, { minimum: 0 });
  if (typeof usage.costIsPartial !== 'boolean' || typeof usage.usageIsIncomplete !== 'boolean') {
    fail('LEDGER_INVALID', `${at} completeness flags must be boolean`);
  }
  if ((usage.costIsPartial || usage.usageIsIncomplete) && usage.costUsd !== null) {
    fail('LEDGER_INVALID', `${at}.costUsd must be null when spend or usage is incomplete`);
  }
}

function validateTerminal(terminal, design, arm, at) {
  const { tauMs, maxTurns } = design;
  assertLedgerExactKeys(terminal, [
    'outcome',
    'firstValidMs',
    'censoredAtMs',
    'observedElapsedMs',
    'restrictedTimeMs',
    'startedAtMs',
    'finishedAtMs',
    'censorReason',
    'mergeGateCompleted',
    'finalCiState',
    'grader',
    'turns',
    'usage',
    'escapes',
    'falseBlocks',
    'bypasses',
    'manualDecisions',
    'transcriptSha256',
    'graderReportSha256',
    'sourceTreeBeforeSha256',
    'sourceTreeAfterSha256',
    'interventionBeforeSha256',
    'interventionAfterSha256',
  ], at);
  if (!['first_valid', 'censored'].includes(terminal.outcome)) fail('LEDGER_INVALID', `${at}.outcome is invalid`);
  assertFiniteNumber(terminal.observedElapsedMs, `${at}.observedElapsedMs`, { minimum: 0, maximum: tauMs });
  assertFiniteNumber(terminal.restrictedTimeMs, `${at}.restrictedTimeMs`, { minimum: 0, maximum: tauMs });
  assertInteger(terminal.startedAtMs, `${at}.startedAtMs`, 0);
  assertInteger(terminal.finishedAtMs, `${at}.finishedAtMs`, terminal.startedAtMs);
  if (terminal.finishedAtMs - terminal.startedAtMs !== terminal.observedElapsedMs) {
    fail('LEDGER_INVALID', `${at} wall-clock interval does not match observedElapsedMs`);
  }
  if (typeof terminal.mergeGateCompleted !== 'boolean') fail('LEDGER_INVALID', `${at}.mergeGateCompleted must be boolean`);
  if (!['green', 'red', 'not_run'].includes(terminal.finalCiState)) fail('LEDGER_INVALID', `${at}.finalCiState is invalid`);
  assertLedgerExactKeys(terminal.grader, GRADER_STAGES, `${at}.grader`);
  for (const stage of GRADER_STAGES) {
    if (!['pass', 'fail', 'not_run'].includes(terminal.grader[stage])) fail('LEDGER_INVALID', `${at}.grader.${stage} is invalid`);
  }
  assertInteger(terminal.turns, `${at}.turns`, 0);
  if (terminal.turns > maxTurns) fail('LEDGER_INVALID', `${at}.turns exceeds the preregistered maximum`);
  validateUsage(terminal.usage, `${at}.usage`);
  for (const key of ['escapes', 'falseBlocks', 'bypasses']) assertInteger(terminal[key], `${at}.${key}`, 0);
  assertArray(terminal.manualDecisions, `${at}.manualDecisions`);
  terminal.manualDecisions.forEach((decision, index) => assertString(decision, `${at}.manualDecisions[${index}]`));
  for (const key of ['transcriptSha256', 'graderReportSha256', 'sourceTreeBeforeSha256', 'sourceTreeAfterSha256']) {
    assertLedgerSha256(terminal[key], `${at}.${key}`);
  }
  if (arm === 'control') {
    if (terminal.interventionBeforeSha256 !== null || terminal.interventionAfterSha256 !== null) {
      fail('LEDGER_INVALID', `${at} control cells cannot claim intervention artifacts`);
    }
  } else {
    assertLedgerSha256(terminal.interventionBeforeSha256, `${at}.interventionBeforeSha256`);
    assertLedgerSha256(terminal.interventionAfterSha256, `${at}.interventionAfterSha256`);
  }

  const allStagesPass = GRADER_STAGES.every((stage) => terminal.grader[stage] === 'pass');
  if (terminal.outcome === 'first_valid') {
    assertFiniteNumber(terminal.firstValidMs, `${at}.firstValidMs`, { minimum: 0, maximum: tauMs, exclusiveMinimum: true });
    if (terminal.censoredAtMs !== null || terminal.censorReason !== null || !allStagesPass) {
      fail('LEDGER_INVALID', `${at} first-valid outcome is inconsistent with its grader/censor fields`);
    }
    if (
      terminal.restrictedTimeMs !== terminal.firstValidMs
      || !terminal.mergeGateCompleted
      || terminal.finalCiState !== 'green'
      || terminal.observedElapsedMs < terminal.firstValidMs
    ) {
      fail('LEDGER_INVALID', `${at} first-valid outcome must finish protected green`);
    }
  } else {
    if (
      terminal.firstValidMs !== null
      || terminal.censoredAtMs !== tauMs
      || terminal.restrictedTimeMs !== tauMs
      || typeof terminal.censorReason !== 'string'
      || terminal.censorReason.length === 0
    ) {
      fail('LEDGER_INVALID', `${at} censored outcome must retain the preregistered cap and reason`);
    }
    const completedAfterCap = terminal.censorReason === 'cap_reached' && allStagesPass;
    if (completedAfterCap) {
      if (!terminal.mergeGateCompleted || terminal.finalCiState !== 'green') {
        fail('LEDGER_INVALID', `${at} cap-censored green must retain its completed merge-gate state`);
      }
    } else if (allStagesPass || terminal.mergeGateCompleted || terminal.finalCiState === 'green') {
      fail('LEDGER_INVALID', `${at} censored non-green outcome cannot claim a completed green`);
    }
  }
}

function validateMutationEntry(entry, manifest, manifestHash, at) {
  assertLedgerExactKeys(entry, [
    'schemaVersion', 'sequence', 'previousHash', 'entryHash', 'manifestSha256', 'kind', 'mutationFingerprint', 'reportSha256', 'groups',
  ], at);
  if (entry.mutationFingerprint !== fingerprintMutation(manifest, manifestHash)) fail('LEDGER_DRIFT', 'mutation fingerprint does not match the manifest');
  assertSha256(entry.reportSha256, `${at}.reportSha256`);
  assertArray(entry.groups, `${at}.groups`);
  if (entry.groups.length !== manifest.mutation.ranges.length) fail('LEDGER_INCOMPLETE', 'mutation proof does not cover every declared range');
  const groupIds = [];
  entry.groups.forEach((group, index) => {
    const groupAt = `${at}.groups[${index}]`;
    assertLedgerExactKeys(group, ['id', 'file', 'startLine', 'endLine', 'totalMutants', 'statuses'], groupAt);
    assertId(group.id, `${groupAt}.id`);
    assertSafeRelativePath(group.file, `${groupAt}.file`);
    assertInteger(group.startLine, `${groupAt}.startLine`, 1);
    assertInteger(group.endLine, `${groupAt}.endLine`, group.startLine);
    assertInteger(group.totalMutants, `${groupAt}.totalMutants`, 1);
    assertLedgerExactKeys(group.statuses, ['killed', 'survived', 'timedOut', 'noCoverage', 'other'], `${groupAt}.statuses`);
    for (const value of Object.values(group.statuses)) assertInteger(value, `${groupAt}.statuses`, 0);
    if (Object.values(group.statuses).reduce((sum, value) => sum + value, 0) !== group.totalMutants) {
      fail('LEDGER_INVALID', `${groupAt} status counts do not equal totalMutants`);
    }
    if (group.statuses.noCoverage !== 0) {
      fail('MUTATION_NO_COVERAGE', `${group.id} contains ${group.statuses.noCoverage} NoCoverage mutant(s)`);
    }
    const expected = manifest.mutation.ranges.find((range) => range.id === group.id);
    if (!expected || group.file !== expected.file || group.startLine !== expected.startLine || group.endLine !== expected.endLine) {
      fail('LEDGER_DRIFT', `${group.id} mutation range drifted from the manifest`);
    }
    groupIds.push(group.id);
  });
  assertUnique(groupIds, 'mutation proof group ids', 'LEDGER_INCOMPLETE');
}

export function verifyLedger({ manifest: inputManifest, entries: inputEntries }) {
  const manifest = validateAndFreezeManifest(inputManifest);
  const manifestHash = sha256Canonical(manifest);
  if (!Array.isArray(inputEntries)) fail('LEDGER_INVALID', 'entries must be an array');
  const entries = JSON.parse(canonicalJson(inputEntries));
  const expectedEntryCount = manifest.runs.length + 1;
  if (entries.length !== expectedEntryCount) {
    fail('LEDGER_INCOMPLETE', `ledger has ${entries.length} entries; expected ${expectedEntryCount}`);
  }
  const preregisteredUuids = entries.slice(0, manifest.runs.length).map((entry) => entry.sessionUuid);
  assertUnique(preregisteredUuids, 'ledger session UUIDs', 'LEDGER_UUID_DUPLICATE');

  let previousHash = LEDGER_GENESIS_HASH;
  let previousFinishedAtMs = -Infinity;
  const terminals = new Map();
  const ledgerUuids = [];
  let mutationEntry;
  entries.forEach((entry, index) => {
    const at = `entries[${index}]`;
    assertObject(entry, at);
    if (entry.schemaVersion !== 1) fail('LEDGER_INVALID', `${at}.schemaVersion must be 1`);
    if (entry.sequence !== index + 1) fail('LEDGER_ORDER_INVALID', `${at}.sequence is not contiguous`);
    if (entry.previousHash !== previousHash || entry.entryHash !== computeLedgerEntryHash(entry)) {
      fail('LEDGER_HASH_BROKEN', `${at} breaks the append-only hash chain`);
    }
    if (entry.manifestSha256 !== manifestHash) fail('LEDGER_DRIFT', `${at} references a different manifest`);
    assertSha256(entry.previousHash, `${at}.previousHash`);
    assertSha256(entry.entryHash, `${at}.entryHash`);
    previousHash = entry.entryHash;

    if (index < manifest.runs.length) {
      assertLedgerExactKeys(entry, [
        'schemaVersion',
        'sequence',
        'previousHash',
        'entryHash',
        'manifestSha256',
        'kind',
        'cellId',
        'sessionUuid',
        'cellFingerprint',
        'terminal',
      ], at);
      if (entry.kind !== 'cell_terminal') fail('LEDGER_ORDER_INVALID', `${at} must be a cell terminal`);
      const expectedRun = manifest.runs[index];
      if (entry.cellId !== expectedRun.cellId || entry.sessionUuid !== expectedRun.sessionUuid) {
        fail('LEDGER_ORDER_INVALID', `${at} does not match preregistered execution order`);
      }
      if (entry.cellFingerprint !== fingerprintCell(manifest, entry.cellId, manifestHash)) {
        fail('LEDGER_DRIFT', `${entry.cellId} fingerprint does not match its pinned inputs`);
      }
      if (terminals.has(entry.cellId)) fail('LEDGER_INCOMPLETE', `duplicate terminal for ${entry.cellId}`);
      validateTerminal(entry.terminal, manifest.design, expectedRun.arm, `${at}.terminal`);
      if (entry.terminal.startedAtMs < previousFinishedAtMs) {
        fail('LEDGER_WORKSPACE_OVERLAP', `${entry.cellId} overlaps the preceding preregistered run`);
      }
      previousFinishedAtMs = entry.terminal.finishedAtMs;
      terminals.set(entry.cellId, deepFreeze(entry.terminal));
      ledgerUuids.push(entry.sessionUuid);
    } else {
      if (entry.kind !== 'mutation_terminal') fail('LEDGER_ORDER_INVALID', 'the final ledger entry must be mutation proof');
      validateMutationEntry(entry, manifest, manifestHash, at);
      mutationEntry = deepFreeze(entry);
    }
  });
  assertUnique(ledgerUuids, 'ledger session UUIDs', 'LEDGER_UUID_DUPLICATE');
  if (terminals.size !== manifest.runs.length || !mutationEntry) fail('LEDGER_INCOMPLETE', 'ledger is missing terminal evidence');

  return deepFreeze({
    manifest,
    manifestSha256: manifestHash,
    terminalHash: previousHash,
    terminals: Object.fromEntries(terminals),
    mutation: mutationEntry,
  });
}
