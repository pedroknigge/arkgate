#!/usr/bin/env node
/** Z05 packed-candidate journey across every canonical gallery starter. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { layerForRelativePath } from '../bin/ark-layer-match.mjs';
import { GALLERY_STARTERS } from '../bin/ark-shared.mjs';
import {
  assertCondition,
  canonicalPath,
  commandEvidence,
  expectStatus,
  managerInstallArgs,
  parseJsonOutput,
  pathIsWithin,
  resolveCandidate,
  runConsumerNode,
  runManager,
  runManagerBinary,
  runRecordedStage,
} from './ts-compat-matrix.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT), '..');
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn']);
const CHECK_NAMES = Object.freeze([
  'prepare',
  'install',
  'package-import',
  'check',
  'doctor',
  'start-preview',
  'start-apply',
  'preflight-benign',
  'strict-merge',
  'preflight-violation',
  'non-mutation',
]);
const COPY_EXCLUDES = new Set([
  '.git',
  '.pnp.cjs',
  '.pnp.loader.mjs',
  '.yarn',
  'node_modules',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);
const SNAPSHOT_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.pnpm-store',
]);

function requireValue(tokens, index, flag) {
  const value = tokens[index + 1];
  if (value === undefined || value.startsWith('-')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(tokens) {
  const options = {
    packageManager: process.env.ARK_GALLERY_PACKAGE_MANAGER || 'npm',
    managerVersion: process.env.ARK_GALLERY_PACKAGE_MANAGER_VERSION || undefined,
    tarball: process.env.ARK_GALLERY_TARBALL || undefined,
    artifactDir: process.env.ARK_GALLERY_ARTIFACT_DIR || undefined,
    out: process.env.ARK_GALLERY_REPORT || undefined,
    help: false,
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--help' || token === '-h') options.help = true;
    else if (token === '--package-manager' || token === '--manager' || token === '--pm') {
      options.packageManager = requireValue(tokens, index, token);
      index += 1;
    } else if (token === '--manager-version' || token === '--pm-version') {
      options.managerVersion = requireValue(tokens, index, token);
      index += 1;
    } else if (token === '--tarball') {
      options.tarball = requireValue(tokens, index, token);
      index += 1;
    } else if (token === '--artifact-dir') {
      options.artifactDir = requireValue(tokens, index, token);
      index += 1;
    } else if (token === '--out') {
      options.out = requireValue(tokens, index, token);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${token}`);
    }
  }
  options.packageManager = String(options.packageManager).trim().toLowerCase();
  if (!PACKAGE_MANAGERS.has(options.packageManager)) {
    throw new Error(`unsupported package manager: ${options.packageManager}`);
  }
  if (Boolean(options.tarball) === Boolean(options.artifactDir) && !options.help) {
    throw new Error('provide exactly one of --tarball or --artifact-dir');
  }
  return options;
}

function usage() {
  return `Usage: node scripts/gallery-clean-room-matrix.mjs --tarball <file> [options]

Options:
  --package-manager <manager>   npm, pnpm, or yarn (default: npm)
  --manager-version <version>   Run the manager through Corepack at this exact version
  --tarball <file>              Install this packed ArkGate candidate
  --artifact-dir <directory>    Find one checksummed arkgate-*.tgz candidate here
  --out <file>                  Complete JSON report path
  --help                        Show this help
`;
}

function safeName(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/g, '_');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

export function copyStarter(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (COPY_EXCLUDES.has(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyStarter(from, to);
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
    else fs.copyFileSync(from, to);
  }
}

export function assertNoStarterManagerOverrides(source) {
  for (const entry of ['.npmrc', '.yarnrc.yml', '.yarn']) {
    assertCondition(
      !fs.existsSync(path.join(source, entry)),
      `${path.basename(source)} contains ${entry}; clean-room manager setup would ignore or overwrite it`
    );
  }
}

export function prepareStarterManifest(root, candidateTarball, packageManager, managerVersion) {
  const manifestPath = path.join(root, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.devDependencies ??= {};
  manifest.devDependencies.arkgate = pathToFileURL(path.resolve(candidateTarball)).href;
  if (managerVersion) manifest.packageManager = `${packageManager}@${managerVersion}`;
  writeJson(manifestPath, manifest);
  if (packageManager === 'pnpm') {
    writeText(path.join(root, '.npmrc'), 'node-linker=isolated\nshared-workspace-lockfile=false\n');
  }
  if (packageManager === 'yarn') {
    writeText(
      path.join(root, '.yarnrc.yml'),
      'nodeLinker: pnp\npnpMode: strict\nenableGlobalCache: false\nenableScripts: false\n'
    );
  }
  return manifest;
}

function fileHash(file) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

export function snapshotProject(root) {
  const snapshot = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && SNAPSHOT_EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      if (entry.isDirectory() && entry.name === 'cache' && path.basename(directory) === '.yarn') {
        continue;
      }
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isSymbolicLink()) snapshot[relative] = `link:${fs.readlinkSync(absolute)}`;
      else snapshot[relative] = fileHash(absolute);
    }
  };
  visit(root);
  return snapshot;
}

function changedPaths(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((file) => before[file] !== after[file])
    .sort();
}

export function governedSnapshotPaths(before, after, layers) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((file) => layerForRelativePath(file, layers))
    .sort();
}

export function assertSnapshotEqual(before, after, label) {
  const changed = changedPaths(before, after);
  assertCondition(changed.length === 0, `${label} changed project files: ${changed.join(', ')}`);
}

export function assertAppliedPreview(before, after, changes) {
  const expected = [...changes].map((change) => change.path).sort();
  const actual = changedPaths(before, after);
  assertCondition(
    JSON.stringify(actual) === JSON.stringify(expected),
    `ark start --apply changed ${actual.join(', ') || '<none>'}; preview named ${expected.join(', ')}`
  );
  for (const change of changes) {
    assertCondition(
      after[change.path] === change.afterHash,
      `${change.path} does not match its previewed afterHash`
    );
  }
}

export function assertPreflightConsumedChange(data, expectedPath) {
  assertCondition(data.mode === 'resolved-candidate-facts', 'preflight did not use resolved facts');
  assertCondition(
    data.baseCompleteness === 'complete' && data.candidateCompleteness === 'complete',
    'preflight facts were incomplete'
  );
  assertCondition(data.changes?.length === 1, 'preflight did not report exactly one change');
  const [change] = data.changes;
  assertCondition(
    change.path === expectedPath && change.operation === 'update',
    `preflight consumed ${change.path ?? '<unknown>'}, expected update ${expectedPath}`
  );
  assertCondition(
    change.beforeContentHash !== change.candidateContentHash,
    'preflight reported an unchanged candidate content hash'
  );
  assertCondition(data.baseFactsHash !== data.candidateFactsHash, 'preflight facts did not change');
  assertCondition(data.baseTreeHash !== data.candidateTreeHash, 'preflight tree did not change');
}

function sourceFiles(root, config) {
  const files = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        const layer = layerForRelativePath(relative, config.layers);
        if (layer) files.push({ path: relative, absolute, layer });
      }
    }
  };
  for (const include of config.include ?? []) visit(path.join(root, include));
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function buildBenignChange(root, config) {
  const source = sourceFiles(root, config)[0];
  assertCondition(source, 'starter has no governed source file for benign preflight');
  return {
    path: source.path,
    content: `${fs.readFileSync(source.absolute, 'utf8')}\nexport const arkGalleryCleanRoomProbe = true;\n`,
  };
}

function importSpecifier(from, target) {
  let specifier = path.relative(path.dirname(from), target).split(path.sep).join('/');
  specifier = specifier.replace(/\.[cm]?[jt]sx?$/, '');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  return specifier;
}

export function buildViolationChange(root, config) {
  const files = sourceFiles(root, config);
  const filesByLayer = new Map();
  for (const file of files) {
    const entries = filesByLayer.get(file.layer) ?? [];
    entries.push(file);
    filesByLayer.set(file.layer, entries);
  }
  for (const rule of config.rules ?? []) {
    if (rule.allowed !== false || rule.from === rule.to) continue;
    const from = filesByLayer.get(rule.from)?.[0];
    const target = filesByLayer.get(rule.to)?.[0];
    if (!from || !target) continue;
    const specifier = importSpecifier(from.path, target.path);
    return {
      change: {
        path: from.path,
        content: `${fs.readFileSync(from.absolute, 'utf8')}\nimport '${specifier}';\n`,
      },
      fromLayer: rule.from,
      toLayer: rule.to,
      target: target.path,
    };
  }
  throw new Error('starter has no populated denied cross-layer rule for the violation probe');
}

function writeImportProbe(root) {
  writeText(
    path.join(root, '.arkgate-gallery-import-probe.mjs'),
    `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const packagePath = require.resolve('arkgate/package.json');
const gate = await import('arkgate');
if (typeof gate.createAICodeGate !== 'function') throw new Error('missing root API');
process.stdout.write(JSON.stringify({ packagePath, api: 'createAICodeGate' }));
`
  );
}

function evidence(result) {
  return { command: commandEvidence(result) };
}

function markSkipped(cell, reason) {
  for (const name of CHECK_NAMES) {
    if (!cell.checks[name]) cell.checks[name] = { ok: false, skipped: true, reason };
  }
}

function runCell(options, candidate, workRoot, starter) {
  const root = path.join(workRoot, 'consumers', safeName(starter.archetype));
  const cell = {
    archetype: starter.archetype,
    directory: starter.directory,
    packageManager: options.packageManager,
    requestedManagerVersion: options.managerVersion ?? null,
    root,
    checks: {},
    errors: [],
    ok: false,
  };
  let preparedSnapshot;
  let appliedSnapshot;
  let preview;
  let active = true;
  const stage = (name, operation) => {
    if (!active) return false;
    active = runRecordedStage(cell, name, operation);
    return active;
  };

  stage('prepare', () => {
    const source = path.join(REPO_ROOT, starter.directory);
    assertNoStarterManagerOverrides(source);
    copyStarter(source, root);
    assertCondition(!pathIsWithin(REPO_ROOT, canonicalPath(root)), 'consumer must be outside checkout');
    const manifest = prepareStarterManifest(
      root,
      candidate.copied,
      options.packageManager,
      options.managerVersion
    );
    writeImportProbe(root);
    writeText(path.join(root, '.gallery-sentinel'), 'ArkGate Z05 unrelated-file sentinel\n');
    return { manifest };
  });

  stage('install', () => {
    const version = runManager(options, ['--version'], { cwd: root });
    expectStatus(version, 0, `${options.packageManager} --version`);
    const actualManagerVersion = version.stdout.trim();
    if (options.managerVersion) {
      assertCondition(
        actualManagerVersion === options.managerVersion,
        `${options.packageManager} reported ${actualManagerVersion}, expected ${options.managerVersion}`
      );
    }
    const install = runManager(options, managerInstallArgs(options.packageManager), {
      cwd: root,
      timeout: 240_000,
    });
    expectStatus(install, 0, `${options.packageManager} install`);
    preparedSnapshot = snapshotProject(root);
    return {
      actualManagerVersion,
      versionCommand: commandEvidence(version),
      installCommand: commandEvidence(install),
    };
  });

  stage('package-import', () => {
    const result = runConsumerNode(options, root, '.arkgate-gallery-import-probe.mjs');
    expectStatus(result, 0, 'package import probe');
    const data = parseJsonOutput(result.stdout, 'package import probe');
    const installedPackage = canonicalPath(data.packagePath);
    assertCondition(
      !pathIsWithin(canonicalPath(REPO_ROOT), installedPackage),
      `ArkGate resolved from checkout: ${data.packagePath}`
    );
    assertCondition(
      pathIsWithin(canonicalPath(root), installedPackage),
      `ArkGate did not resolve inside consumer: ${data.packagePath}`
    );
    return { packagePath: data.packagePath, api: data.api, ...evidence(result) };
  });

  stage('check', () => {
    const result = runManager(options, ['run', 'check'], { cwd: root });
    expectStatus(result, 0, 'documented check script');
    return evidence(result);
  });

  stage('doctor', () => {
    const result = runManagerBinary(options, root, 'ark-check', [
      '--root', root,
      '--config', 'ark.config.json',
      '--doctor',
      '--json',
      '--no-cache',
    ]);
    expectStatus(result, 0, 'ark-check --doctor');
    const data = parseJsonOutput(result.stdout, 'ark-check --doctor');
    assertCondition(data.ok === true, 'doctor reported ok false');
    assertCondition(data.doctor?.completeness === 'complete', 'doctor analysis was incomplete');
    assertCondition(data.doctor?.violations?.active === 0, 'doctor found active violations');
    return { completeness: data.doctor.completeness, ...evidence(result) };
  });

  stage('start-preview', () => {
    const before = snapshotProject(root);
    assertSnapshotEqual(preparedSnapshot, before, 'package import/check/doctor');
    const result = runManagerBinary(options, root, 'ark', [
      'start',
      '--root', root,
      '--tools', 'codex',
      '--yes',
      '--no-install',
      '--json',
    ]);
    expectStatus(result, 0, 'ark start preview');
    preview = parseJsonOutput(result.stdout, 'ark start preview');
    assertCondition(preview.readOnly === true, 'ark start preview was not read-only');
    assertCondition(preview.changes?.length > 0, 'ark start preview planned no gate files');
    assertSnapshotEqual(before, snapshotProject(root), 'ark start preview');
    return { changes: preview.changes.map(({ path: file, action }) => ({ path: file, action })), ...evidence(result) };
  });

  stage('start-apply', () => {
    const before = snapshotProject(root);
    const result = runManagerBinary(options, root, 'ark', [
      'start',
      '--root', root,
      '--tools', 'codex',
      '--yes',
      '--no-install',
      '--apply',
      '--json',
    ]);
    expectStatus(result, 0, 'ark start --apply');
    const after = snapshotProject(root);
    assertAppliedPreview(before, after, preview.changes);
    appliedSnapshot = after;
    return { appliedPaths: preview.changes.map((change) => change.path), ...evidence(result) };
  });

  stage('preflight-benign', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const changesPath = path.join(workRoot, 'changes', `${safeName(starter.archetype)}-benign.json`);
    const change = buildBenignChange(root, config);
    writeJson(changesPath, { changes: [change] });
    const result = runManagerBinary(options, root, 'ark', [
      'preflight',
      '--root', root,
      '--config', 'ark.config.json',
      '--changes', changesPath,
      '--json',
    ]);
    expectStatus(result, 0, 'benign atomic preflight');
    const data = parseJsonOutput(result.stdout, 'benign atomic preflight');
    assertCondition(data.valid === true && data.readOnly === true, 'benign preflight was not valid/read-only');
    assertPreflightConsumedChange(data, change.path);
    return { valid: data.valid, readOnly: data.readOnly, change: data.changes[0], ...evidence(result) };
  });

  stage('strict-merge', () => {
    const result = runManagerBinary(options, root, 'ark-check', [
      '--root', root,
      '--config', 'ark.config.json',
      '--strict-merge',
      '--json',
      '--no-cache',
    ]);
    expectStatus(result, 0, 'ark-check --strict-merge');
    const data = parseJsonOutput(result.stdout, 'ark-check --strict-merge');
    assertCondition(
      data.ok === true && data.valid === true && data.completeness === 'complete',
      'strict merge was not complete and green'
    );
    return { valid: data.valid, completeness: data.completeness, ...evidence(result) };
  });

  stage('preflight-violation', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const probe = buildViolationChange(root, config);
    const changesPath = path.join(workRoot, 'changes', `${safeName(starter.archetype)}-violation.json`);
    writeJson(changesPath, { changes: [probe.change] });
    const result = runManagerBinary(options, root, 'ark', [
      'preflight',
      '--root', root,
      '--config', 'ark.config.json',
      '--changes', changesPath,
      '--json',
    ]);
    expectStatus(result, 1, 'deliberate architecture violation');
    const data = parseJsonOutput(result.stdout, 'deliberate architecture violation');
    const ruleIds = (data.violations ?? []).map((violation) => violation.ruleId);
    assertCondition(data.valid === false && data.readOnly === true, 'violation preflight was green or writable');
    assertPreflightConsumedChange(data, probe.change.path);
    assertCondition(ruleIds.includes('LAYER_IMPORT_VIOLATION'), 'preflight missed LAYER_IMPORT_VIOLATION');
    return { ruleIds, fromLayer: probe.fromLayer, toLayer: probe.toLayer, ...evidence(result) };
  });

  stage('non-mutation', () => {
    const finalSnapshot = snapshotProject(root);
    assertSnapshotEqual(appliedSnapshot, finalSnapshot, 'check/doctor/preflight/strict journey');
    assertAppliedPreview(preparedSnapshot, finalSnapshot, preview.changes);
    for (const protectedPath of ['package.json', '.gallery-sentinel']) {
      assertCondition(
        preparedSnapshot[protectedPath] === finalSnapshot[protectedPath],
        `${protectedPath} changed after installation`
      );
    }
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    const protectedSourceFiles = governedSnapshotPaths(
      preparedSnapshot,
      finalSnapshot,
      config.layers
    );
    for (const file of protectedSourceFiles) {
      assertCondition(preparedSnapshot[file] === finalSnapshot[file], `source changed: ${file}`);
    }
    return { protectedSourceFiles: protectedSourceFiles.length };
  });

  if (!active) markSkipped(cell, 'an earlier clean-room stage failed');
  cell.ok = cell.errors.length === 0 && CHECK_NAMES.every((name) => cell.checks[name]?.ok);
  return cell;
}

export function galleryReportOk(report) {
  const expected = GALLERY_STARTERS.map((starter) => starter.archetype).sort();
  const actual = (report.cells ?? []).map((cell) => cell.archetype).sort();
  return (
    (report.errors ?? []).length === 0 &&
    JSON.stringify(actual) === JSON.stringify(expected) &&
    report.cells.every(
      (cell) => cell.ok && CHECK_NAMES.every((name) => cell.checks?.[name]?.ok === true)
    )
  );
}

function serializeError(error) {
  return error instanceof Error
    ? { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack.slice(-3000) } : {}) }
    : { name: 'Error', message: String(error) };
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`[gallery-clean-room] ${error instanceof Error ? error.message : String(error)}`);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const reportPath = path.resolve(
    options.out ?? path.join(os.tmpdir(), `ark-gallery-clean-room-${process.pid}.json`)
  );
  const workRoot = fs.mkdtempSync(path.join(canonicalPath(os.tmpdir()), 'ark-gallery-clean-room-'));
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    packageManager: options.packageManager,
    requestedManagerVersion: options.managerVersion ?? null,
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
    for (const starter of GALLERY_STARTERS) {
      console.log(`[gallery-clean-room] ${options.packageManager} ${starter.archetype}`);
      try {
        const cell = runCell(options, candidate, workRoot, starter);
        report.cells.push(cell);
        console.log(`[gallery-clean-room] ${cell.ok ? 'OK' : 'FAIL'} ${starter.archetype}`);
      } catch (error) {
        const serialized = serializeError(error);
        report.cells.push({
          archetype: starter.archetype,
          directory: starter.directory,
          packageManager: options.packageManager,
          checks: Object.fromEntries(
            CHECK_NAMES.map((name) => [name, { ok: false, skipped: true, reason: 'unexpected cell failure' }])
          ),
          errors: [{ check: 'unexpected', ...serialized }],
          ok: false,
        });
        report.errors.push({ archetype: starter.archetype, ...serialized });
      }
    }
  } catch (error) {
    const serialized = serializeError(error);
    report.errors.push({ check: 'candidate', ...serialized });
    report.cells = GALLERY_STARTERS.map((starter) => ({
      archetype: starter.archetype,
      directory: starter.directory,
      packageManager: options.packageManager,
      checks: Object.fromEntries(
        CHECK_NAMES.map((name) => [name, { ok: false, skipped: true, reason: 'candidate failed' }])
      ),
      errors: [{ check: 'candidate', ...serialized }],
      ok: false,
    }));
  } finally {
    report.finishedAt = new Date().toISOString();
    report.ok = galleryReportOk(report);
    try {
      writeJson(reportPath, report);
      console.log(`[gallery-clean-room] report ${reportPath}`);
    } catch (error) {
      console.error(`[gallery-clean-room] failed to write report: ${String(error)}`);
      report.ok = false;
    }
    fs.rmSync(workRoot, { recursive: true, force: true });
  }
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  await main();
}
