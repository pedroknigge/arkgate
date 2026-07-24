#!/usr/bin/env node
/**
 * Exercise the packed ArkGate candidate in isolated TypeScript consumer projects.
 *
 * The checkout only orchestrates this harness. Product commands always resolve from
 * the candidate tarball installed into an os.tmpdir() project.
 *
 * Convenient local form (packs the current candidate through npm prepack):
 *   node scripts/ts-compat-matrix.mjs 7.0.2
 *
 * CI form:
 *   node scripts/ts-compat-matrix.mjs \
 *     --artifact-dir "$RUNNER_TEMP/release-artifacts/gate" \
 *     --package-manager yarn --manager-version 4.17.1 \
 *     --typescript 5.9.3,6.0.3,7.0.2 --out "$RUNNER_TEMP/ts-compat/report.json"
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT), '..');
const FIXTURE = path.join(REPO_ROOT, 'tests/fixtures/ts-consumer');
const DEFAULT_TYPESCRIPT_VERSIONS = Object.freeze(['5.9.3', '6.0.3', '7.0.2']);
const FALLBACK_TYPESCRIPT_VERSION = '6.0.3';
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn']);
const CHECK_NAMES = Object.freeze([
  'prepare',
  'install',
  'resolution',
  'esm',
  'cjs-schema',
  'types',
  'plan',
  'strict',
  'hook',
  'mcp',
  'parse-partial',
]);

function requireFlagValue(tokens, index, flag) {
  const value = tokens[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function splitVersions(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseArguments(tokens) {
  const options = {
    packageManager: process.env.ARK_TS_PACKAGE_MANAGER || 'npm',
    managerVersion: process.env.ARK_TS_PACKAGE_MANAGER_VERSION || undefined,
    tarball: process.env.ARK_TS_TARBALL || undefined,
    artifactDir: process.env.ARK_TS_ARTIFACT_DIR || undefined,
    out: process.env.ARK_TS_REPORT || undefined,
    typescriptVersions: [],
    help: false,
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--help' || token === '-h') {
      options.help = true;
    } else if (token === '--package-manager' || token === '--manager' || token === '--pm') {
      options.packageManager = requireFlagValue(tokens, index, token);
      index += 1;
    } else if (token === '--manager-version' || token === '--pm-version') {
      options.managerVersion = requireFlagValue(tokens, index, token);
      index += 1;
    } else if (token === '--typescript' || token === '--ts') {
      options.typescriptVersions.push(...splitVersions(requireFlagValue(tokens, index, token)));
      index += 1;
    } else if (token === '--tarball') {
      options.tarball = requireFlagValue(tokens, index, token);
      index += 1;
    } else if (token === '--artifact-dir') {
      options.artifactDir = requireFlagValue(tokens, index, token);
      index += 1;
    } else if (token === '--out' || token === '--report') {
      options.out = requireFlagValue(tokens, index, token);
      index += 1;
    } else if (!token.startsWith('-')) {
      // Backward-compatible local invocation: `...mjs 7.0.2`.
      options.typescriptVersions.push(...splitVersions(token));
    } else {
      throw new Error(`unknown argument: ${token}`);
    }
  }

  options.packageManager = String(options.packageManager).trim().toLowerCase();
  if (!PACKAGE_MANAGERS.has(options.packageManager)) {
    throw new Error(`unsupported package manager: ${options.packageManager}`);
  }
  if (options.tarball && options.artifactDir) {
    throw new Error('use only one of --tarball or --artifact-dir');
  }
  if (options.typescriptVersions.length === 0) {
    options.typescriptVersions = [...DEFAULT_TYPESCRIPT_VERSIONS];
  }
  options.typescriptVersions = [...new Set(options.typescriptVersions)];
  if (options.typescriptVersions.some((version) => !/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version))) {
    throw new Error('TypeScript versions must be package versions, not package specs');
  }
  return options;
}

function usage() {
  return `Usage: node scripts/ts-compat-matrix.mjs [typescript-version]

Options:
  --typescript <v[,v...]>       TypeScript cell(s); defaults to 5.9.3,6.0.3,7.0.2
  --package-manager <manager>   npm, pnpm, or yarn (default: npm)
  --manager-version <version>   Run the manager through corepack at this exact version
  --tarball <file>              Install this packed ArkGate candidate
  --artifact-dir <directory>    Find one arkgate-*.tgz candidate and optional checksum here
  --out <file>                  Complete JSON report path (defaults under os.tmpdir())
  --help                        Show this help
`;
}

export function pathIsWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

export function expectedTypeScriptHost(typescriptVersion) {
  const major = Number.parseInt(String(typescriptVersion).split('.')[0], 10);
  if (major >= 7) {
    return {
      source: 'arkgate-fallback',
      version: FALLBACK_TYPESCRIPT_VERSION,
      debugLine:
        `[ark-check] TypeScript ${FALLBACK_TYPESCRIPT_VERSION} ` +
        'via arkgate-fallback (fallback)',
    };
  }
  return {
    source: 'project',
    version: typescriptVersion,
    debugLine: `[ark-check] TypeScript ${typescriptVersion} via project`,
  };
}

export function canonicalPath(candidate) {
  try {
    return fs.realpathSync(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function safeName(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/g, '_');
}

function majorVersion(value) {
  return Number.parseInt(String(value).split('.')[0], 10);
}

function installMode(packageManager, typescriptVersion) {
  if (packageManager !== 'yarn') return 'manager-default';
  return majorVersion(typescriptVersion) >= 7 ? 'yarn-node-modules' : 'yarn-pnp-strict';
}

function tail(value, max = 3000) {
  const text = String(value ?? '');
  return text.length <= max ? text : text.slice(-max);
}

function sanitizedEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of [
    'NODE_PATH',
    'NODE_OPTIONS',
    'ARK_POLICY_BASE_REF',
    'GITHUB_BASE_REF',
  ]) {
    delete env[key];
  }
  env.ARK_NO_OPEN_REPORT = '1';
  env.FORCE_COLOR = '0';
  env.NO_COLOR = '1';
  env.NPM_CONFIG_AUDIT = 'false';
  env.NPM_CONFIG_FUND = 'false';
  return env;
}

function commandText(command, args) {
  return [command, ...args].join(' ');
}

export function runCommand(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    env: sanitizedEnv(options.env),
    maxBuffer: 16 * 1024 * 1024,
    timeout: options.timeout ?? 120_000,
    stdio: 'pipe',
  });
  return {
    command: commandText(command, args),
    status: result.status,
    signal: result.signal,
    error: result.error?.message,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs: Date.now() - started,
  };
}

export function commandEvidence(result) {
  return {
    command: result.command,
    status: result.status,
    durationMs: result.durationMs,
    ...(result.signal ? { signal: result.signal } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.stdout ? { stdoutTail: tail(result.stdout) } : {}),
    ...(result.stderr ? { stderrTail: tail(result.stderr) } : {}),
  };
}

function recordCommand(cell, stage, label, result) {
  cell.commandEvidence ??= {};
  cell.commandEvidence[stage] ??= {};
  cell.commandEvidence[stage][label] = commandEvidence(result);
  return result;
}

export function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function expectStatus(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(
      `${label} exited ${result.status ?? result.signal ?? 'without status'}, expected ${expected}\n` +
        `${tail(result.stdout)}\n${tail(result.stderr)}`
    );
  }
}

export function parseJsonOutput(stdout, label) {
  const text = String(stdout).trim();
  try {
    return JSON.parse(text);
  } catch {
    // Package-manager wrappers may print lifecycle logs before the final JSON. Walk
    // possible array/object starts from the end so an earlier "[CJS]" log cannot win.
    for (const [open, close] of [
      ['[', ']'],
      ['{', '}'],
    ]) {
      const last = text.lastIndexOf(close);
      for (let first = text.lastIndexOf(open, last); first >= 0; first = text.lastIndexOf(open, first - 1)) {
        try {
          return JSON.parse(text.slice(first, last + 1));
        } catch {
          // Try the preceding opening delimiter.
        }
      }
    }
  }
  throw new Error(`${label} did not emit one JSON object: ${tail(text)}`);
}

export function managerInvocation(packageManager, managerVersion, args) {
  if (!PACKAGE_MANAGERS.has(packageManager)) {
    throw new Error(`unsupported package manager: ${packageManager}`);
  }
  return managerVersion
    ? { command: 'corepack', args: [`${packageManager}@${managerVersion}`, ...args] }
    : { command: packageManager, args: [...args] };
}

export function managerInstallArgs(packageManager) {
  if (packageManager === 'npm') {
    return ['install', '--ignore-scripts', '--no-audit', '--no-fund'];
  }
  if (packageManager === 'pnpm') {
    return ['install', '--ignore-scripts', '--no-frozen-lockfile'];
  }
  return ['install', '--mode=skip-build', '--no-immutable'];
}

export function managerBinaryArgs(packageManager, binary, args) {
  if (packageManager === 'npm') return ['exec', '--yes=false', '--', binary, ...args];
  if (packageManager === 'pnpm') return ['exec', binary, ...args];
  return [binary, ...args];
}

export function runManager(options, args, commandOptions = {}) {
  const invocation = managerInvocation(
    options.packageManager,
    options.managerVersion,
    args
  );
  return runCommand(invocation.command, invocation.args, commandOptions);
}

export function runManagerBinary(options, cwd, binary, args, commandOptions = {}) {
  return runManager(options, managerBinaryArgs(options.packageManager, binary, args), {
    cwd,
    ...commandOptions,
  });
}

export function runConsumerNode(options, cwd, script) {
  if (options.packageManager === 'yarn') {
    return runManager(options, ['node', script], { cwd });
  }
  return runCommand(process.execPath, [script], { cwd });
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function findGateTarballs(root, depth = 0) {
  if (depth > 3 || !fs.existsSync(root)) return [];
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...findGateTarballs(absolute, depth + 1));
    } else if (/^arkgate-[0-9].*\.tgz$/.test(entry.name)) {
      results.push(absolute);
    }
  }
  return results.sort();
}

export function verifyChecksumIfPresent(tarball, required = false) {
  const sidecar = `${tarball}.sha256`;
  const digest = sha256(tarball);
  if (!fs.existsSync(sidecar)) {
    assertCondition(!required, `candidate checksum sidecar missing: ${sidecar}`);
    return { digest, verified: false };
  }
  const expected = fs.readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0];
  assertCondition(expected === digest, `candidate checksum mismatch: ${tarball}`);
  return { digest, verified: true };
}

function createLocalCandidate(workRoot) {
  const packs = path.join(workRoot, 'local-pack');
  fs.mkdirSync(packs);
  const packed = runCommand(
    'npm',
    ['pack', '--json', '--pack-destination', packs],
    { cwd: REPO_ROOT, timeout: 240_000 }
  );
  expectStatus(packed, 0, 'npm pack');
  const report = parseJsonOutput(packed.stdout, 'npm pack');
  assertCondition(Array.isArray(report) && report.length === 1, 'npm pack returned no candidate');
  const tarball = path.join(packs, report[0].filename);
  assertCondition(fs.existsSync(tarball), `packed candidate missing: ${tarball}`);
  return tarball;
}

export function resolveCandidate(options, workRoot) {
  let source;
  if (options.tarball) {
    source = path.resolve(options.tarball);
  } else if (options.artifactDir) {
    const candidates = findGateTarballs(path.resolve(options.artifactDir));
    assertCondition(
      candidates.length === 1,
      `expected exactly one arkgate-*.tgz in ${options.artifactDir}, found ${candidates.length}`
    );
    source = candidates[0];
  } else {
    source = createLocalCandidate(workRoot);
  }
  assertCondition(fs.existsSync(source) && fs.statSync(source).isFile(), `candidate missing: ${source}`);
  const checksum = verifyChecksumIfPresent(source, Boolean(options.artifactDir));
  const candidateDir = path.join(workRoot, 'candidate');
  fs.mkdirSync(candidateDir);
  const copied = path.join(candidateDir, path.basename(source));
  fs.copyFileSync(source, copied);
  assertCondition(!pathIsWithin(REPO_ROOT, copied), 'candidate copy must live outside the checkout');
  return { source, copied, ...checksum };
}

function runPackedMissingHostCheck(candidateTarball, workRoot) {
  const root = path.join(workRoot, 'missing-host');
  const extracted = path.join(root, 'extracted');
  const project = path.join(root, 'project');
  fs.mkdirSync(extracted, { recursive: true });
  fs.cpSync(FIXTURE, project, { recursive: true });
  const unpack = runCommand('tar', ['-xzf', candidateTarball, '-C', extracted], { cwd: root });
  expectStatus(unpack, 0, 'extract packed missing-host candidate');
  const check = path.join(extracted, 'package', 'bin', 'ark-check.mjs');
  assertCondition(fs.existsSync(check), `packed ark-check missing after extraction: ${check}`);
  const common = ['--root', project, '--config', 'ark.config.json', '--json', '--no-cache'];
  const planRun = runCommand(process.execPath, [check, ...common, '--plan'], { cwd: project });
  expectStatus(planRun, 2, 'packed missing-host plan');
  const plan = parseJsonOutput(planRun.stdout, 'packed missing-host plan');
  assertCondition(plan.ok === false, 'packed missing-host plan reported ok true');
  assertCondition(
    plan.plan?.completeness === 'unavailable' && plan.plan?.goal?.met === false,
    'packed missing-host plan reported complete or goal.met true'
  );

  const checkRun = runCommand(process.execPath, [check, ...common], { cwd: project });
  expectStatus(checkRun, 2, 'packed missing-host full check');
  const result = parseJsonOutput(checkRun.stdout, 'packed missing-host full check');
  assertCondition(
    result.valid === false && result.ok === false && result.completeness === 'unavailable',
    'packed missing-host full check emitted a green or complete verdict'
  );
  assertCondition(
    result.diagnostics?.some(
      (item) =>
        item.ruleId === 'ANALYSIS_HOST_UNAVAILABLE' &&
        item.nextAction?.includes('typescript-ark-host@6.0.3')
    ),
    'packed missing-host full check omitted deterministic fallback remediation'
  );
  return {
    ok: true,
    completeness: result.completeness,
    goalMet: plan.plan.goal.met,
    valid: result.valid,
    extractCommand: commandEvidence(unpack),
    planCommand: commandEvidence(planRun),
    checkCommand: commandEvidence(checkRun),
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

export function prepareConsumerProject({
  root,
  candidateTarball,
  typescriptVersion,
  packageManager,
  managerVersion,
}) {
  fs.cpSync(FIXTURE, root, { recursive: true });
  const manifest = {
    name: `ark-ts-compat-${safeName(packageManager)}-${safeName(typescriptVersion)}`,
    private: true,
    type: 'module',
    ...(managerVersion ? { packageManager: `${packageManager}@${managerVersion}` } : {}),
    devDependencies: {
      arkgate: pathToFileURL(path.resolve(candidateTarball)).href,
      typescript: typescriptVersion,
    },
  };
  writeJson(path.join(root, 'package.json'), manifest);

  if (packageManager === 'pnpm') {
    writeText(
      path.join(root, '.npmrc'),
      'node-linker=isolated\nshared-workspace-lockfile=false\n'
    );
  }
  if (packageManager === 'yarn') {
    writeText(
      path.join(root, '.yarnrc.yml'),
      majorVersion(typescriptVersion) >= 7
        ? 'nodeLinker: node-modules\nenableGlobalCache: false\nenableScripts: false\n'
        : 'nodeLinker: pnp\npnpMode: strict\nenableGlobalCache: false\nenableScripts: false\n'
    );
  }

  writeText(
    path.join(root, 'AGENTS.md'),
    '# ArkGate Enforcement\n\nRun `ark-check --strict-merge` before merging.\n'
  );
  writeJson(path.join(root, '.mcp.json'), {
    mcpServers: { ark: { command: 'ark-mcp', args: ['--root', '.'] } },
  });
  writeText(
    path.join(root, '.github/workflows/ark-check.yml'),
    'name: ArkGate\non: [push]\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ark-check --strict-merge\n'
  );

  writeText(
    path.join(root, 'resolution-probe.cjs'),
    `const arkgatePackage = require.resolve('arkgate/package.json');
const typescriptPackage = require.resolve('typescript/package.json');
const arkgate = require('arkgate/package.json');
const typescript = require('typescript/package.json');
process.stdout.write(JSON.stringify({
  arkgatePackage,
  typescriptPackage,
  arkgateVersion: arkgate.version,
  typescriptVersion: typescript.version
}));
`
  );
  writeText(
    path.join(root, 'esm-smoke.mjs'),
    `import * as gate from 'arkgate';
import * as eslint from 'arkgate/eslint';
const result = gate.createAdapterResult({
  valid: true,
  completeness: 'complete',
  mode: 'resolved-candidate-facts',
  policyHash: 'smoke-policy',
  resolverIdentity: 'smoke-resolver@1',
  factsHash: 'smoke-facts',
  candidateTreeHash: 'smoke-tree',
});
if (typeof gate.createAICodeGate !== 'function') throw new Error('missing ESM gate export');
if (!eslint.default && !eslint.rules) throw new Error('missing ESM eslint export');
if (result.completeness !== 'complete') throw new Error('missing ESM completeness');
if (result.mode !== 'resolved-candidate-facts') throw new Error('missing ESM analysis mode');
process.stdout.write(JSON.stringify({ schemaVersion: result.schemaVersion }));
`
  );
  writeText(
    path.join(root, 'cjs-schema-smoke.cjs'),
    `const fs = require('node:fs');
const gate = require('arkgate');
const eslint = require('arkgate/eslint');
const schemaPath = require.resolve('arkgate/schema/ark.analysis-result.schema.json');
const factsSchemaPath = require.resolve('arkgate/schema/ark.resolved-candidate-facts.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const factsSchema = JSON.parse(fs.readFileSync(factsSchemaPath, 'utf8'));
if (typeof gate.createAICodeGate !== 'function') throw new Error('missing CJS gate export');
if (!eslint.default && !eslint.rules) throw new Error('missing CJS eslint export');
if (!schema.required.includes('completeness')) throw new Error('schema omits completeness');
if (!schema.required.includes('mode')) throw new Error('schema omits analysis mode');
if (!schema.required.includes('completenessReasons')) throw new Error('schema omits completeness reasons');
if (!schema.properties.completeness.enum.includes('complete')) throw new Error('schema enum drift');
if (schema.properties.schemaVersion.const !== '1.4') throw new Error('schema version drift');
const factsVersions = factsSchema.properties.schemaVersion.enum ?? [
  factsSchema.properties.schemaVersion.const,
];
if (!factsVersions.includes('1.1') || !factsVersions.includes('1.0')) {
  throw new Error('facts schema drift');
}
if (schema.allOf?.[0]?.then?.properties?.valid?.const !== false) {
  throw new Error('schema permits an incomplete green verdict');
}
process.stdout.write(JSON.stringify({ schemaPath, factsSchemaPath, schemaVersion: schema.properties.schemaVersion.const }));
`
  );
  writeText(
    path.join(root, 'package-smoke.ts'),
    `import eslintPlugin from 'arkgate/eslint';
import {
  createAdapterResult,
  createAICodeGate,
  analyzeResolvedProject,
  preflightResolvedChange,
  type AdapterResult,
  type AnalysisCompleteness,
  type AnalysisMode,
  type ResolvedCandidateFacts,
} from 'arkgate';

const completeness: AnalysisCompleteness = 'complete';
const mode: AnalysisMode = 'resolved-candidate-facts';
const result: AdapterResult = createAdapterResult({
  valid: true,
  completeness,
  mode,
  policyHash: 'smoke-policy',
  resolverIdentity: 'smoke-resolver@1',
  factsHash: 'smoke-facts',
  candidateTreeHash: 'smoke-tree',
});
const legacyResult: AdapterResult = {
  schemaVersion: '1.0',
  valid: false,
  diagnostics: [],
};
const v11Result: AdapterResult = {
  schemaVersion: '1.1',
  valid: false,
  diagnostics: [],
};
// @ts-expect-error Partial analysis is fail-closed in the public 1.2 result type.
const partialGreen: AdapterResult = {
  schemaVersion: '1.2',
  completeness: 'partial',
  valid: true,
  diagnostics: [],
};
void eslintPlugin;
void createAICodeGate;
void analyzeResolvedProject;
void preflightResolvedChange;
void (undefined as unknown as ResolvedCandidateFacts);
void result;
void mode;
void legacyResult;
void v11Result;
void partialGreen;
`
  );
  writeJson(path.join(root, 'tsconfig.package-smoke.json'), {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: [],
    },
    include: ['package-smoke.ts'],
  });
  return manifest;
}

function serializeError(error) {
  return error instanceof Error
    ? { name: error.name, message: error.message, ...(error.stack ? { stack: tail(error.stack) } : {}) }
    : { name: 'Error', message: String(error) };
}

export function runRecordedStage(cell, name, operation) {
  try {
    const details = operation() ?? {};
    cell.checks[name] = { ok: true, ...details };
    return true;
  } catch (error) {
    const serialized = serializeError(error);
    cell.checks[name] = { ok: false, error: serialized };
    cell.errors.push({ check: name, ...serialized });
    return false;
  }
}

function markSkippedChecks(cell, reason) {
  for (const name of CHECK_NAMES) {
    if (!cell.checks[name]) cell.checks[name] = { ok: false, skipped: true, reason };
  }
}

function runCell(options, candidate, workRoot, typescriptVersion) {
  const root = fs.mkdtempSync(
    path.join(workRoot, `cell-${safeName(options.packageManager)}-${safeName(typescriptVersion)}-`)
  );
  const cell = {
    node: process.version,
    packageManager: options.packageManager,
    requestedManagerVersion: options.managerVersion ?? null,
    requestedTypescriptVersion: typescriptVersion,
    installMode: installMode(options.packageManager, typescriptVersion),
    root,
    checks: {},
    errors: [],
    ok: false,
  };

  const prepared = runRecordedStage(cell, 'prepare', () => ({
    manifest: prepareConsumerProject({
      root,
      candidateTarball: candidate.copied,
      typescriptVersion,
      packageManager: options.packageManager,
      managerVersion: options.managerVersion,
    }),
  }));
  if (!prepared) {
    markSkippedChecks(cell, 'consumer preparation failed');
    return cell;
  }

  const installed = runRecordedStage(cell, 'install', () => {
    const versionRun = runManager(options, ['--version'], { cwd: root });
    recordCommand(cell, 'install', 'version', versionRun);
    expectStatus(versionRun, 0, `${options.packageManager} --version`);
    const actualManagerVersion = versionRun.stdout.trim();
    if (options.managerVersion) {
      assertCondition(
        actualManagerVersion === options.managerVersion,
        `${options.packageManager} reported ${actualManagerVersion}, expected ${options.managerVersion}`
      );
    }
    const installRun = runManager(options, managerInstallArgs(options.packageManager), {
      cwd: root,
      timeout: 240_000,
    });
    recordCommand(cell, 'install', 'install', installRun);
    expectStatus(installRun, 0, `${options.packageManager} install`);
    cell.actualManagerVersion = actualManagerVersion;
    return {
      actualManagerVersion: cell.actualManagerVersion,
      installMode: cell.installMode,
      versionCommand: commandEvidence(versionRun),
      installCommand: commandEvidence(installRun),
    };
  });
  if (!installed) {
    markSkippedChecks(cell, 'consumer installation failed');
    return cell;
  }

  runRecordedStage(cell, 'resolution', () => {
    const run = runConsumerNode(options, root, 'resolution-probe.cjs');
    recordCommand(cell, 'resolution', 'package', run);
    expectStatus(run, 0, 'package resolution probe');
    const data = parseJsonOutput(run.stdout, 'package resolution probe');
    const canonicalPackage = canonicalPath(data.arkgatePackage);
    const canonicalCheckout = canonicalPath(REPO_ROOT);
    const canonicalConsumer = canonicalPath(root);
    assertCondition(
      !pathIsWithin(canonicalCheckout, canonicalPackage),
      `installed ArkGate resolved from checkout: ${data.arkgatePackage}`
    );
    assertCondition(
      pathIsWithin(canonicalConsumer, canonicalPackage),
      `installed ArkGate did not resolve inside the consumer: ${data.arkgatePackage}`
    );
    assertCondition(
      data.typescriptVersion === typescriptVersion,
      `installed TypeScript ${data.typescriptVersion}, expected ${typescriptVersion}`
    );
    if (options.packageManager === 'yarn') {
      if (cell.installMode === 'yarn-pnp-strict') {
        assertCondition(fs.existsSync(path.join(root, '.pnp.cjs')), 'Yarn PnP loader is missing');
        assertCondition(!fs.existsSync(path.join(root, 'node_modules')), 'Yarn PnP cell created node_modules');
      } else {
        assertCondition(
          fs.existsSync(path.join(root, 'node_modules')),
          'Yarn TS7 node-modules linker did not create node_modules'
        );
      }
    }

    const tscRun = runManagerBinary(options, root, 'tsc', ['--version']);
    recordCommand(cell, 'resolution', 'tsc', tscRun);
    expectStatus(tscRun, 0, 'project tsc binary resolution probe');
    const binaryTypescriptVersion = tscRun.stdout.trim().replace(/^Version\s+/, '');
    assertCondition(
      binaryTypescriptVersion === typescriptVersion,
      `project tsc binary reported ${binaryTypescriptVersion}, expected ${typescriptVersion}`
    );

    const expectedHost = expectedTypeScriptHost(typescriptVersion);
    const hostRun = runManagerBinary(
      options,
      root,
      'ark-check',
      ['--root', root, '--config', 'ark.config.json', '--plan', '--no-cache'],
      { env: { ARK_DEBUG_TS: '1' } }
    );
    recordCommand(cell, 'resolution', 'host', hostRun);
    expectStatus(hostRun, 0, 'TypeScript host resolution probe');
    const hostOutput = `${hostRun.stdout}\n${hostRun.stderr}`;
    const hostDebugLine = hostOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line === expectedHost.debugLine);
    assertCondition(
      hostDebugLine,
      `TypeScript host evidence did not contain "${expectedHost.debugLine}"`
    );
    const rejectedProjectHost = majorVersion(typescriptVersion) >= 7;
    if (rejectedProjectHost) {
      assertCondition(
        /not API-compatible.*version-only/s.test(hostOutput),
        'TS7 cell did not prove that the project host was rejected before fallback'
      );
    }

    cell.arkgateVersion = data.arkgateVersion;
    cell.actualTypescriptVersion = data.typescriptVersion;
    return {
      ...data,
      binaryTypescriptVersion,
      hostEvidence: { ...expectedHost, observedDebugLine: hostDebugLine, rejectedProjectHost },
      command: commandEvidence(run),
      tscCommand: commandEvidence(tscRun),
      hostCommand: commandEvidence(hostRun),
    };
  });

  runRecordedStage(cell, 'esm', () => {
    const run = runConsumerNode(options, root, 'esm-smoke.mjs');
    recordCommand(cell, 'esm', 'smoke', run);
    expectStatus(run, 0, 'ESM smoke');
    return { result: parseJsonOutput(run.stdout, 'ESM smoke'), command: commandEvidence(run) };
  });

  runRecordedStage(cell, 'cjs-schema', () => {
    const run = runConsumerNode(options, root, 'cjs-schema-smoke.cjs');
    recordCommand(cell, 'cjs-schema', 'smoke', run);
    expectStatus(run, 0, 'CJS/schema smoke');
    return {
      result: parseJsonOutput(run.stdout, 'CJS/schema smoke'),
      command: commandEvidence(run),
    };
  });

  runRecordedStage(cell, 'types', () => {
    const run = runManagerBinary(options, root, 'tsc', [
      '-p',
      'tsconfig.package-smoke.json',
      '--pretty',
      'false',
    ]);
    recordCommand(cell, 'types', 'tsc', run);
    expectStatus(run, 0, 'published types smoke');
    return { typeResolutionMode: 'package-manager-native', command: commandEvidence(run) };
  });

  runRecordedStage(cell, 'plan', () => {
    const run = runManagerBinary(options, root, 'ark-check', [
      '--root',
      root,
      '--config',
      'ark.config.json',
      '--plan',
      '--json',
      '--no-cache',
    ]);
    recordCommand(cell, 'plan', 'ark-check', run);
    expectStatus(run, 0, 'ark-check --plan');
    const data = parseJsonOutput(run.stdout, 'ark-check --plan');
    const bad = data.plan?.steps?.find((step) => step.file === 'src/domain/bad.ts');
    assertCondition(data.plan?.completeness === 'complete', 'plan analysis was not complete');
    assertCondition(data.plan?.goal?.met === false, 'violating plan reported goal.met true');
    assertCondition(data.ok === false, 'violating plan reported ok true');
    assertCondition(bad?.class === 'mechanical-safe', 'known type-only violation was not planned');
    return {
      completeness: data.plan.completeness,
      goalMet: data.plan.goal.met,
      violationClass: bad.class,
      command: commandEvidence(run),
    };
  });

  runRecordedStage(cell, 'strict', () => {
    const run = runManagerBinary(options, root, 'ark-check', [
      '--root',
      root,
      '--config',
      'ark.config.json',
      '--strict-merge',
      '--json',
      '--no-cache',
    ]);
    recordCommand(cell, 'strict', 'ark-check', run);
    expectStatus(run, 1, 'ark-check --strict-merge');
    const data = parseJsonOutput(run.stdout, 'ark-check --strict-merge');
    const diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics : [];
    assertCondition(data.completeness === 'complete', 'strict analysis was not complete');
    assertCondition(data.ok === false && data.valid === false, 'violating strict check was green');
    assertCondition(
      diagnostics.some((item) => item.ruleId === 'LAYER_IMPORT_VIOLATION'),
      'strict check missed the known layer violation'
    );
    return {
      completeness: data.completeness,
      ruleIds: diagnostics.map((item) => item.ruleId),
      command: commandEvidence(run),
    };
  });

  runRecordedStage(cell, 'hook', () => {
    const payload = {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/domain/network.ts'),
        content: "export async function load() { return fetch('https://example.com'); }\n",
      },
    };
    const run = runManagerBinary(
      options,
      root,
      'ark-mcp',
      ['--hook', '--root', root, '--config', 'ark.config.json'],
      { input: JSON.stringify(payload) }
    );
    recordCommand(cell, 'hook', 'forbidden', run);
    expectStatus(run, 2, 'ark-mcp --hook');
    assertCondition(
      /FORBIDDEN_GLOBAL|fetch/i.test(`${run.stdout}\n${run.stderr}`),
      'hook did not explain the forbidden fetch'
    );
    const parsePayload = {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/domain/parse-invalid-hook.ts'),
        content: 'export const broken = ;\n',
      },
    };
    const parseRun = runManagerBinary(
      options,
      root,
      'ark-mcp',
      ['--hook', '--hook-repair', '--root', root, '--config', 'ark.config.json'],
      { input: JSON.stringify(parsePayload) }
    );
    recordCommand(cell, 'hook', 'parse', parseRun);
    expectStatus(parseRun, 2, 'parse-incomplete ark-mcp --hook');
    const repairLine = parseRun.stderr
      .split(/\r?\n/)
      .find((line) => line.startsWith('ARK_REPAIR_JSON:'));
    assertCondition(repairLine, 'parse-incomplete hook omitted ARK_REPAIR_JSON');
    const repair = JSON.parse(repairLine.slice('ARK_REPAIR_JSON:'.length));
    assertCondition(
      repair.valid === false && repair.completeness === 'partial',
      'parse-incomplete hook emitted a green or complete repair verdict'
    );
    assertCondition(
      repair.diagnostics?.some((item) => item.ruleId === 'ANALYSIS_PARSE_INCOMPLETE'),
      'parse-incomplete hook omitted its analysis diagnostic'
    );
    return {
      command: commandEvidence(run),
      parseCommand: commandEvidence(parseRun),
      parseCompleteness: repair.completeness,
    };
  });

  runRecordedStage(cell, 'mcp', () => {
    const input = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'arkgate-compat-harness', version: '1' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'validate_code',
          arguments: {
            source: "export async function load() { return fetch('https://example.com'); }\n",
            layer: 'DomainModel',
            filePath: 'src/domain/mcp-network.ts',
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'validate_code',
          arguments: {
            source: 'export const broken = ;\n',
            layer: 'DomainModel',
            filePath: 'src/domain/mcp-parse-invalid.ts',
          },
        },
      },
    ]
      .map((message) => JSON.stringify(message))
      .join('\n');
    const run = runManagerBinary(
      options,
      root,
      'ark-mcp',
      ['--root', root, '--config', 'ark.config.json'],
      { input: `${input}\n`, timeout: 30_000 }
    );
    recordCommand(cell, 'mcp', 'stdio', run);
    expectStatus(run, 0, 'ark-mcp stdio');
    const messages = run.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const initialized = messages.find((message) => message.id === 1);
    const tools = messages.find((message) => message.id === 2)?.result?.tools ?? [];
    const validation = messages.find((message) => message.id === 3)?.result;
    const parseValidation = messages.find((message) => message.id === 4)?.result;
    assertCondition(initialized?.result?.serverInfo?.name === 'arkgate', 'MCP initialize failed');
    assertCondition(
      tools.some((tool) => tool.name === 'validate_code'),
      'MCP tools/list omitted validate_code'
    );
    assertCondition(validation?.isError === true, 'MCP validate_code accepted forbidden fetch');
    assertCondition(
      validation?.structuredContent?.mode === 'lexical-compatibility' &&
        validation?.structuredContent?.valid === false &&
        validation?.structuredContent?.completeness === 'partial' &&
        validation?.structuredContent?.completenessReasons?.some(
          (reason) => reason.code === 'LEXICAL_EVIDENCE_INCOMPLETE'
        ),
      'MCP validation did not report explicit partial lexical evidence'
    );
    assertCondition(
      validation?.structuredContent?.diagnostics?.some(
        (diagnostic) => diagnostic.ruleId === 'FORBIDDEN_GLOBAL'
      ),
      'MCP validation omitted the forbidden-global diagnostic'
    );
    assertCondition(parseValidation?.isError === true, 'MCP accepted parse-invalid source');
    assertCondition(
      parseValidation?.structuredContent?.valid === false &&
        parseValidation?.structuredContent?.completeness === 'partial',
      'MCP parse-invalid validation emitted a green or complete verdict'
    );
    assertCondition(
      parseValidation?.structuredContent?.diagnostics?.some(
        (diagnostic) => diagnostic.ruleId === 'ANALYSIS_PARSE_INCOMPLETE'
      ),
      'MCP parse-invalid validation omitted its analysis diagnostic'
    );
    return {
      server: initialized.result.serverInfo,
      toolCount: tools.length,
      validationCompleteness: validation.structuredContent.completeness,
      parseCompleteness: parseValidation.structuredContent.completeness,
      command: commandEvidence(run),
    };
  });

  runRecordedStage(cell, 'parse-partial', () => {
    const badFile = path.join(root, 'src/domain/bad.ts');
    const invalidFile = path.join(root, 'src/domain/parse-invalid.ts');
    const originalBad = fs.readFileSync(badFile, 'utf8');
    try {
      fs.writeFileSync(badFile, 'export const repaired = true;\n');
      fs.writeFileSync(invalidFile, 'export const broken = ;\n');
      const run = runManagerBinary(options, root, 'ark-check', [
        '--root',
        root,
        '--config',
        'ark.config.json',
        '--strict-merge',
        '--json',
        '--no-cache',
      ]);
      recordCommand(cell, 'parse-partial', 'ark-check', run);
      expectStatus(run, 1, 'parse-incomplete strict merge');
      const data = parseJsonOutput(run.stdout, 'parse-incomplete strict merge');
      assertCondition(data.completeness === 'partial', 'parse-invalid analysis was not partial');
      assertCondition(data.ok !== true, 'parse-invalid strict merge reported ok true');
      assertCondition(data.valid === false, 'parse-invalid strict merge reported valid true');
      return {
        completeness: data.completeness,
        reportedOk: data.ok,
        valid: data.valid,
        command: commandEvidence(run),
      };
    } finally {
      fs.writeFileSync(badFile, originalBad);
      fs.rmSync(invalidFile, { force: true });
    }
  });

  cell.ok = cell.errors.length === 0 && CHECK_NAMES.every((name) => cell.checks[name]?.ok);
  return cell;
}

function writeReport(file, report) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`[ts-compat-matrix] ${error instanceof Error ? error.message : String(error)}`);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const reportPath = path.resolve(
    options.out ?? path.join(os.tmpdir(), `ark-ts-compat-report-${process.pid}.json`)
  );
  const workRoot = fs.mkdtempSync(path.join(canonicalPath(os.tmpdir()), 'ark-ts-compat-'));
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    packageManager: options.packageManager,
    requestedManagerVersion: options.managerVersion ?? null,
    requestedTypescriptVersions: options.typescriptVersions,
    cells: [],
    errors: [],
    ok: false,
  };

  try {
    const candidate = resolveCandidate(options, workRoot);
    report.candidate = {
      source: candidate.source,
      sha256: candidate.digest,
      checksumVerified: candidate.verified,
    };
    report.candidateChecks = {
      missingHost: runPackedMissingHostCheck(candidate.copied, workRoot),
    };
    console.log(
      `[ts-compat-matrix] candidate ${path.basename(candidate.source)} sha256=${candidate.digest}`
    );

    for (const typescriptVersion of options.typescriptVersions) {
      console.log(
        `[ts-compat-matrix] ${process.version} ${options.packageManager}${
          options.managerVersion ? `@${options.managerVersion}` : ''
        } typescript@${typescriptVersion}`
      );
      try {
        const cell = runCell(options, candidate, workRoot, typescriptVersion);
        report.cells.push(cell);
        console.log(
          `[ts-compat-matrix] ${cell.ok ? 'OK' : 'FAIL'} typescript@${typescriptVersion}`
        );
      } catch (error) {
        const serialized = serializeError(error);
        report.cells.push({
          node: process.version,
          packageManager: options.packageManager,
          requestedManagerVersion: options.managerVersion ?? null,
          requestedTypescriptVersion: typescriptVersion,
          checks: Object.fromEntries(
            CHECK_NAMES.map((name) => [
              name,
              { ok: false, skipped: true, reason: 'unexpected cell failure' },
            ])
          ),
          errors: [{ check: 'unexpected', ...serialized }],
          ok: false,
        });
        report.errors.push({ typescriptVersion, ...serialized });
      }
    }
  } catch (error) {
    const serialized = serializeError(error);
    report.errors.push({ check: 'candidate', ...serialized });
    for (const typescriptVersion of options.typescriptVersions) {
      report.cells.push({
        node: process.version,
        packageManager: options.packageManager,
        requestedManagerVersion: options.managerVersion ?? null,
        requestedTypescriptVersion: typescriptVersion,
        checks: Object.fromEntries(
          CHECK_NAMES.map((name) => [name, { ok: false, skipped: true, reason: 'candidate failed' }])
        ),
        errors: [{ check: 'candidate', ...serialized }],
        ok: false,
      });
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    report.ok =
      report.errors.length === 0 &&
      report.cells.length === options.typescriptVersions.length &&
      report.cells.every((cell) => cell.ok);
    try {
      writeReport(reportPath, report);
      console.log(`[ts-compat-matrix] report ${reportPath}`);
    } catch (error) {
      console.error(`[ts-compat-matrix] failed to write report: ${String(error)}`);
      report.ok = false;
    }
    fs.rmSync(workRoot, { recursive: true, force: true });
  }

  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  await main();
}
