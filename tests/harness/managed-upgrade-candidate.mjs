#!/usr/bin/env node
/** Z06 clean-room managed-upgrade journey against one exact packed candidate. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertCondition,
  canonicalPath,
  commandEvidence,
  expectStatus,
  managerInstallArgs,
  parseJsonOutput,
  pathIsWithin,
  resolveCandidate,
  runCommand,
  runRecordedStage,
} from '../../scripts/ts-compat-matrix.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT), '../..');
const LEGACY_UPGRADE_SKILL = fs.readFileSync(
  path.join(REPO_ROOT, 'tests/fixtures/managed-upgrade/ark-upgrade-3.7.0.md'),
  'utf8'
);
const LEGACY_UPGRADE_IDENTITY =
  'sha256:a5783e492e97fb82cac18bf934071dadeeb3d1ecca2d7bed02ce4328abc5de7d';

export const MANAGED_UPGRADE_HOSTS = Object.freeze([
  'claude',
  'cursor',
  'codex',
  'grok',
  'windsurf',
  'cline',
  'copilot',
  'kiro',
  'roo',
  'continue',
  'gemini',
]);

export const MANAGED_UPGRADE_CHECKS = Object.freeze([
  'prepare',
  'install',
  'installed-bin',
  'current-assets',
  'old-version-body',
  'initial-apply',
  'customization',
  'deletion-blocked',
  'preview-binding',
  'consent-restore',
  'non-mutation',
  'idempotence',
]);

const HOST_PRIMARY_ASSET = Object.freeze({
  claude: '.claude/settings.json',
  cursor: '.cursor/mcp.json',
  codex: '.codex/hooks.json',
  grok: '.grok/config.toml',
  windsurf: '.windsurf/rules/ark.md',
  cline: '.clinerules/ark.md',
  copilot: '.github/copilot-instructions.md',
  kiro: '.kiro/steering/ark.md',
  roo: '.roo/rules/ark.md',
  continue: '.continue/rules/ark.md',
  gemini: 'GEMINI.md',
});

const HOST_VERSIONED_ASSET = Object.freeze({
  claude: '.claude/skills/ark-upgrade/SKILL.md',
  cursor: '.cursor/commands/ark-upgrade.md',
  codex: '.agents/skills/ark-upgrade/SKILL.md',
  grok: '.grok/skills/ark-upgrade/SKILL.md',
  windsurf: '.windsurf/workflows/ark-upgrade.md',
  cline: '.clinerules/workflows/ark-upgrade.md',
  copilot: '.github/prompts/ark-upgrade.prompt.md',
});

const CUSTOMIZED_ASSET = 'AGENTS.md';
const DELETED_ASSET = '.github/workflows/ark-check.yml';
const PLAN_DIGEST = /^sha256:[a-f0-9]{64}$/;
const SNAPSHOT_EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules']);

function requireValue(tokens, index, flag) {
  const value = tokens[index + 1];
  if (value === undefined || value.startsWith('-')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(tokens) {
  const options = {
    tarball: process.env.ARK_MANAGED_UPGRADE_TARBALL || undefined,
    artifactDir: process.env.ARK_MANAGED_UPGRADE_ARTIFACT_DIR || undefined,
    out: process.env.ARK_MANAGED_UPGRADE_REPORT || undefined,
    help: false,
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--help' || token === '-h') options.help = true;
    else if (token === '--tarball') {
      options.tarball = requireValue(tokens, index, token);
      index += 1;
    } else if (token === '--artifact-dir') {
      options.artifactDir = requireValue(tokens, index, token);
      index += 1;
    } else if (token === '--out') {
      options.out = requireValue(tokens, index, token);
      index += 1;
    } else throw new Error(`unknown argument: ${token}`);
  }
  if (Boolean(options.tarball) === Boolean(options.artifactDir) && !options.help) {
    throw new Error('provide exactly one of --tarball or --artifact-dir');
  }
  return options;
}

function usage() {
  return `Usage: node tests/harness/managed-upgrade-candidate.mjs --artifact-dir <directory> [options]

Options:
  --tarball <file>            Install this exact packed ArkGate candidate
  --artifact-dir <directory>  Find one checksummed arkgate-*.tgz candidate here
  --out <file>                Complete JSON report path
  --help                      Show this help
`;
}

function writeText(root, relativePath, content) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function hashContent(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function hashFile(file) {
  return hashContent(fs.readFileSync(file));
}

function skillIdentity(content) {
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  const end = lines.indexOf('---', 1);
  for (let index = 1; index < end; index += 1) {
    if (/^arkVersion:/.test(lines[index])) lines[index] = 'arkVersion:<managed>';
  }
  return hashContent(Buffer.from(lines.join('\n')));
}

function snapshotProject(root) {
  const snapshot = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && SNAPSHOT_EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isSymbolicLink()) snapshot[relative] = `link:${fs.readlinkSync(absolute)}`;
      else snapshot[relative] = hashFile(absolute);
    }
  };
  visit(root);
  return snapshot;
}

function assertSnapshotEqual(before, after, label) {
  const entries = (snapshot) => Object.entries(snapshot).sort(([left], [right]) => left.localeCompare(right));
  assertCondition(
    JSON.stringify(entries(before)) === JSON.stringify(entries(after)),
    `${label} mutated the consumer project`
  );
}

function serializeError(error) {
  return error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack.slice(-3000) } : {}),
      }
    : { name: 'Error', message: String(error) };
}

export function buildUpgradeArguments(root, host, options = {}) {
  assertCondition(MANAGED_UPGRADE_HOSTS.includes(host), `unsupported host: ${host}`);
  const args = [
    'upgrade',
    '--root',
    root,
    '--tools',
    host,
    '--no-install',
    '--no-strict',
  ];
  if (options.acceptConflicts) args.push('--accept-conflicts');
  if (options.apply) {
    assertCondition(PLAN_DIGEST.test(options.planDigest ?? ''), 'apply requires an exact planDigest');
    args.push('--apply', '--plan-digest', options.planDigest);
  }
  args.push('--json');
  return args;
}

function assertPreview(data, host, label) {
  assertCondition(data.readOnly === true && data.applied === false, `${label} was not read-only`);
  assertCondition(PLAN_DIGEST.test(data.planDigest ?? ''), `${label} omitted planDigest`);
  assertCondition(
    typeof data.nextCommand === 'string' && data.nextCommand.includes(`--plan-digest ${data.planDigest}`),
    `${label} nextCommand was not bound to planDigest`
  );
  assertCondition(
    JSON.stringify(data.hosts) === JSON.stringify([host]),
    `${label} selected ${JSON.stringify(data.hosts)}, expected ${host}`
  );
  assertCondition(Array.isArray(data.assets) && data.assets.length > 0, `${label} emitted no assets`);
  return data;
}

function prepareConsumer(root, candidateTarball, host) {
  fs.mkdirSync(root, { recursive: true });
  const installSpec = pathToFileURL(path.resolve(candidateTarball)).href;
  writeJson(path.join(root, 'package.json'), {
    name: `ark-managed-upgrade-${host}`,
    private: true,
    type: 'module',
    devDependencies: { arkgate: installSpec },
  });
  writeJson(path.join(root, 'tsconfig.json'), {
    compilerOptions: { strict: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' },
    include: ['src'],
  });
  writeJson(path.join(root, 'ark.config.json'), {
    include: ['src'],
    layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
    rules: [],
  });
  writeText(root, 'src/domain/value.ts', 'export const managedUpgradeCandidateValue = 1;\n');
  return installSpec;
}

function installedBinaries(root) {
  const requireFromConsumer = createRequire(path.join(root, 'package.json'));
  const packageJson = canonicalPath(requireFromConsumer.resolve('arkgate/package.json'));
  const packageRoot = path.dirname(packageJson);
  const ark = canonicalPath(path.join(packageRoot, 'bin/ark.mjs'));
  const arkCheck = canonicalPath(path.join(packageRoot, 'bin/ark-check.mjs'));
  for (const [name, binary] of Object.entries({ ark, arkCheck })) {
    assertCondition(fs.existsSync(binary), `installed ${name} binary missing: ${binary}`);
    assertCondition(pathIsWithin(root, binary), `installed ${name} resolved outside consumer: ${binary}`);
    assertCondition(!pathIsWithin(REPO_ROOT, binary), `installed ${name} resolved from checkout: ${binary}`);
  }
  return { packageJson, ark, arkCheck };
}

function runBinary(binary, args, root, timeout = 120_000) {
  return runCommand(process.execPath, [binary, ...args], { cwd: root, timeout });
}

function runPreview(cell, host, options = {}) {
  const before = snapshotProject(cell.root);
  const run = runBinary(
    cell.binaries.ark,
    buildUpgradeArguments(cell.root, host, { acceptConflicts: options.acceptConflicts }),
    cell.root
  );
  expectStatus(run, 0, `${host} managed-upgrade preview`);
  const data = assertPreview(parseJsonOutput(run.stdout, `${host} managed-upgrade preview`), host, `${host} preview`);
  assertSnapshotEqual(before, snapshotProject(cell.root), `${host} preview`);
  return { data, command: commandEvidence(run) };
}

function runApply(cell, host, preview, options = {}) {
  const run = runBinary(
    cell.binaries.ark,
    buildUpgradeArguments(cell.root, host, {
      apply: true,
      planDigest: preview.planDigest,
      acceptConflicts: options.acceptConflicts,
    }),
    cell.root
  );
  return run;
}

function markSkipped(cell, reason) {
  for (const name of MANAGED_UPGRADE_CHECKS) {
    if (!cell.checks[name]) cell.checks[name] = { ok: false, skipped: true, reason };
  }
}

function findAsset(preview, relativePath) {
  return preview.assets.find((asset) => asset.path === relativePath);
}

function runHostCell(candidate, workRoot, host) {
  const root = path.join(workRoot, 'consumers', host);
  const cell = { host, root, checks: {}, errors: [], ok: false };
  let active = true;
  let installSpec;
  let sourceBefore;
  let similarPath;
  let similarBefore;
  let originalVersionedContent;
  let initialPreview;
  let customizedContent;
  let acceptedPreview;
  const stage = (name, operation) => {
    if (!active) return false;
    active = runRecordedStage(cell, name, operation);
    return active;
  };

  stage('prepare', () => {
    installSpec = prepareConsumer(root, candidate.copied, host);
    assertCondition(!pathIsWithin(REPO_ROOT, canonicalPath(root)), 'consumer must live outside checkout');
    sourceBefore = hashFile(path.join(root, 'src/domain/value.ts'));
    return { installSpec };
  });

  stage('install', () => {
    const version = runCommand('npm', ['--version'], { cwd: root });
    expectStatus(version, 0, 'npm --version');
    const install = runCommand('npm', managerInstallArgs('npm'), { cwd: root, timeout: 240_000 });
    expectStatus(install, 0, `${host} candidate install`);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assertCondition(manifest.devDependencies?.arkgate === installSpec, 'candidate install spec drifted');
    return {
      npmVersion: version.stdout.trim(),
      installSpec,
      versionCommand: commandEvidence(version),
      installCommand: commandEvidence(install),
    };
  });

  stage('installed-bin', () => {
    cell.binaries = installedBinaries(root);
    const packageManifest = JSON.parse(fs.readFileSync(cell.binaries.packageJson, 'utf8'));
    const installGates = runBinary(cell.binaries.arkCheck, [
      '--root',
      root,
      '--install-agent-gates',
      '--tools',
      host,
    ], root);
    expectStatus(installGates, 0, `${host} install managed assets`);
    assertCondition(fs.existsSync(path.join(root, HOST_PRIMARY_ASSET[host])), `${host} primary asset missing`);
    similarPath = `${HOST_PRIMARY_ASSET[host]}.user-owned`;
    writeText(root, similarPath, `ArkGate Z06 similarly named user file for ${host}\n`);
    similarBefore = hashFile(path.join(root, similarPath));
    return {
      packageVersion: packageManifest.version,
      packageJson: cell.binaries.packageJson,
      ark: cell.binaries.ark,
      arkCheck: cell.binaries.arkCheck,
      installCommand: commandEvidence(installGates),
    };
  });

  stage('current-assets', () => {
    const versionedPath = HOST_VERSIONED_ASSET[host];
    if (versionedPath) {
      const file = path.join(root, versionedPath);
      originalVersionedContent = fs.readFileSync(file, 'utf8');
      const old = originalVersionedContent.replace(
        /^arkVersion:[^\r\n]*$/m,
        'arkVersion: 0.0.0-z06-old'
      );
      assertCondition(old !== originalVersionedContent, `${host} versioned asset has no arkVersion stamp`);
      fs.writeFileSync(file, old);
    }
    const preview = runPreview(cell, host);
    initialPreview = preview.data;
    assertCondition(
      initialPreview.assets.every((asset) => asset.state === 'current'),
      `${host} installer did not produce only current assets`
    );
    return {
      assetCount: initialPreview.assets.length,
      states: initialPreview.summary.states,
      planDigest: initialPreview.planDigest,
      command: preview.command,
    };
  });

  stage('old-version-body', () => {
    const versionedPath = HOST_VERSIONED_ASSET[host];
    const versionedAssets = initialPreview.assets.filter((asset) => asset.kind === 'skill');
    if (!versionedPath) {
      assertCondition(versionedAssets.length === 0, `${host} unexpectedly emitted version-stamped skills`);
      return {
        applicable: false,
        reason: 'this host publishes instruction assets, not version-stamped skills',
      };
    }
    const metadataOnly = findAsset(initialPreview, versionedPath);
    assertCondition(metadataOnly?.state === 'current', `${host} old stamp changed content identity`);
    assertCondition(metadataOnly?.action === 'refresh-metadata', `${host} old stamp was not scheduled for metadata refresh`);
    assertCondition(
      skillIdentity(LEGACY_UPGRADE_SKILL) === LEGACY_UPGRADE_IDENTITY,
      'published 3.7 skill fixture identity drifted'
    );
    fs.writeFileSync(path.join(root, versionedPath), LEGACY_UPGRADE_SKILL);
    const legacy = runPreview(cell, host);
    initialPreview = legacy.data;
    const stale = findAsset(initialPreview, versionedPath);
    assertCondition(
      stale?.state === 'stale' && stale.managed === true && stale.willApply === true,
      `${host} exact published 3.7 body was not identity-proven stale content`
    );
    return {
      applicable: true,
      path: versionedPath,
      identicalBodyState: metadataOnly.state,
      identicalBodyAction: metadataOnly.action,
      publishedBodyState: stale.state,
      publishedBodyAction: stale.action,
      publishedIdentity: LEGACY_UPGRADE_IDENTITY,
      command: legacy.command,
    };
  });

  stage('initial-apply', () => {
    const apply = runApply(cell, host, initialPreview);
    expectStatus(apply, 0, `${host} initial bound apply`);
    const data = parseJsonOutput(apply.stdout, `${host} initial bound apply`);
    assertCondition(data.applied === true && data.blocked === false, `${host} initial apply did not apply`);
    assertCondition(data.planDigest === initialPreview.planDigest, `${host} initial apply digest drifted`);
    assertCondition(fs.existsSync(path.join(root, 'ark.managed.json')), `${host} manifest missing after apply`);
    if (HOST_VERSIONED_ASSET[host]) {
      assertCondition(
        fs.readFileSync(path.join(root, HOST_VERSIONED_ASSET[host]), 'utf8') === originalVersionedContent,
        `${host} old stamp was not restored without body drift`
      );
    }
    const stable = runPreview(cell, host);
    assertCondition(stable.data.summary.changed === 0, `${host} post-adoption preview was not stable`);
    return {
      changed: data.summary.changed,
      stableChanged: stable.data.summary.changed,
      command: commandEvidence(apply),
      stablePreviewCommand: stable.command,
    };
  });

  stage('customization', () => {
    const file = path.join(root, CUSTOMIZED_ASSET);
    customizedContent = `${fs.readFileSync(file, 'utf8')}\nUser-owned Z06 customization for ${host}.\n`;
    fs.writeFileSync(file, customizedContent);
    fs.rmSync(path.join(root, DELETED_ASSET));
    return { customizedPath: CUSTOMIZED_ASSET, deletedPath: DELETED_ASSET };
  });

  stage('deletion-blocked', () => {
    const preview = runPreview(cell, host);
    const customized = findAsset(preview.data, CUSTOMIZED_ASSET);
    const deleted = findAsset(preview.data, DELETED_ASSET);
    assertCondition(
      customized?.state === 'customized' && customized.managed === true && customized.willApply === false,
      `${host} did not preserve managed customization`
    );
    assertCondition(
      deleted?.state === 'missing' && deleted.blocked === true && deleted.requiresConsent === true,
      `${host} deletion did not require consent`
    );
    const before = snapshotProject(root);
    const apply = runApply(cell, host, preview.data);
    expectStatus(apply, 1, `${host} blocked deletion apply`);
    const data = parseJsonOutput(apply.stdout, `${host} blocked deletion apply`);
    assertCondition(data.blocked === true && data.applied === false, `${host} blocked apply was not blocked`);
    assertSnapshotEqual(before, snapshotProject(root), `${host} blocked apply`);
    return {
      customizedState: customized.state,
      deletedState: deleted.state,
      blocked: data.blocked,
      previewCommand: preview.command,
      applyCommand: commandEvidence(apply),
    };
  });

  stage('preview-binding', () => {
    const preview = runPreview(cell, host, { acceptConflicts: true });
    acceptedPreview = preview.data;
    const concurrent = 'concurrent user bytes after preview\n';
    writeText(root, DELETED_ASSET, concurrent);
    const before = snapshotProject(root);
    const staleApply = runApply(cell, host, acceptedPreview, { acceptConflicts: true });
    expectStatus(staleApply, 2, `${host} stale bound apply`);
    assertCondition(/plan digest mismatch/i.test(staleApply.stderr), `${host} stale apply omitted digest mismatch`);
    assertSnapshotEqual(before, snapshotProject(root), `${host} stale apply`);
    assertCondition(
      fs.readFileSync(path.join(root, DELETED_ASSET), 'utf8') === concurrent,
      `${host} stale apply overwrote concurrent bytes`
    );
    fs.rmSync(path.join(root, DELETED_ASSET));
    return {
      planDigest: acceptedPreview.planDigest,
      previewCommand: preview.command,
      staleApplyCommand: commandEvidence(staleApply),
    };
  });

  stage('consent-restore', () => {
    const preview = runPreview(cell, host, { acceptConflicts: true });
    const deleted = findAsset(preview.data, DELETED_ASSET);
    assertCondition(deleted?.state === 'missing' && deleted.willApply === true, `${host} consent did not schedule restore`);
    const apply = runApply(cell, host, preview.data, { acceptConflicts: true });
    expectStatus(apply, 0, `${host} consented restore`);
    const data = parseJsonOutput(apply.stdout, `${host} consented restore`);
    assertCondition(data.applied === true && data.blocked === false, `${host} consented restore failed`);
    assertCondition(fs.existsSync(path.join(root, DELETED_ASSET)), `${host} deleted asset was not restored`);
    assertCondition(hashFile(path.join(root, DELETED_ASSET)) === deleted.afterHash, `${host} restored bytes differ from preview`);
    assertCondition(
      fs.readFileSync(path.join(root, CUSTOMIZED_ASSET), 'utf8') === customizedContent,
      `${host} consented restore overwrote customization`
    );
    return {
      restoredPath: DELETED_ASSET,
      planDigest: preview.data.planDigest,
      previewCommand: preview.command,
      applyCommand: commandEvidence(apply),
    };
  });

  stage('non-mutation', () => {
    assertCondition(hashFile(path.join(root, 'src/domain/value.ts')) === sourceBefore, `${host} source changed`);
    assertCondition(hashFile(path.join(root, similarPath)) === similarBefore, `${host} similar user file changed`);
    assertCondition(
      fs.readFileSync(path.join(root, CUSTOMIZED_ASSET), 'utf8') === customizedContent,
      `${host} customized asset changed`
    );
    return { sourcePath: 'src/domain/value.ts', similarPath, customizedPath: CUSTOMIZED_ASSET };
  });

  stage('idempotence', () => {
    const first = runPreview(cell, host);
    assertCondition(first.data.summary.changed === 0, `${host} final preview planned changes`);
    const before = snapshotProject(root);
    const apply = runApply(cell, host, first.data);
    expectStatus(apply, 0, `${host} idempotent apply`);
    const applied = parseJsonOutput(apply.stdout, `${host} idempotent apply`);
    assertCondition(applied.summary.changed === 0, `${host} idempotent apply reported changes`);
    assertSnapshotEqual(before, snapshotProject(root), `${host} idempotent apply`);
    const second = runPreview(cell, host);
    assertCondition(second.data.summary.changed === 0, `${host} second preview planned changes`);
    return {
      firstChanged: first.data.summary.changed,
      applyChanged: applied.summary.changed,
      secondChanged: second.data.summary.changed,
      firstPreviewCommand: first.command,
      applyCommand: commandEvidence(apply),
      secondPreviewCommand: second.command,
    };
  });

  if (!active) markSkipped(cell, 'an earlier managed-upgrade stage failed');
  delete cell.binaries;
  cell.ok = cell.errors.length === 0 && MANAGED_UPGRADE_CHECKS.every((name) => cell.checks[name]?.ok === true);
  return cell;
}

export function managedUpgradeCandidateReportOk(report) {
  const cells = Array.isArray(report.cells) ? report.cells : [];
  const expectedHosts = [...MANAGED_UPGRADE_HOSTS].sort();
  const actualHosts = cells.map((cell) => cell.host).sort();
  const candidate = report.candidate;
  const candidateOk =
    candidate &&
    typeof candidate.source === 'string' &&
    typeof candidate.copied === 'string' &&
    /^[a-f0-9]{64}$/.test(candidate.sha256 ?? '') &&
    (!candidate.checksumRequired || candidate.checksumVerified === true);
  return (
    report.schemaVersion === 1 &&
    candidateOk &&
    Array.isArray(report.errors) &&
    report.errors.length === 0 &&
    JSON.stringify(actualHosts) === JSON.stringify(expectedHosts) &&
    cells.every(
      (cell) =>
        cell.ok === true &&
        Array.isArray(cell.errors) &&
        cell.errors.length === 0 &&
        MANAGED_UPGRADE_CHECKS.every((name) => cell.checks?.[name]?.ok === true)
    )
  );
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`[managed-upgrade-candidate] ${error instanceof Error ? error.message : String(error)}`);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const reportPath = path.resolve(
    options.out ?? path.join(os.tmpdir(), `ark-managed-upgrade-candidate-${process.pid}.json`)
  );
  const workRoot = fs.mkdtempSync(
    path.join(canonicalPath(os.tmpdir()), 'ark-managed-upgrade-candidate-')
  );
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    packageManager: 'npm',
    expectedHosts: [...MANAGED_UPGRADE_HOSTS],
    expectedChecks: [...MANAGED_UPGRADE_CHECKS],
    cells: [],
    errors: [],
    ok: false,
  };

  try {
    const candidate = resolveCandidate(options, workRoot);
    report.candidate = {
      source: candidate.source,
      copied: candidate.copied,
      sha256: candidate.digest,
      checksumVerified: candidate.verified,
      checksumRequired: Boolean(options.artifactDir),
    };
    console.log(
      `[managed-upgrade-candidate] candidate ${path.basename(candidate.source)} sha256=${candidate.digest}`
    );
    for (const host of MANAGED_UPGRADE_HOSTS) {
      console.log(`[managed-upgrade-candidate] ${host}`);
      try {
        const cell = runHostCell(candidate, workRoot, host);
        report.cells.push(cell);
        console.log(`[managed-upgrade-candidate] ${cell.ok ? 'OK' : 'FAIL'} ${host}`);
      } catch (error) {
        const serialized = serializeError(error);
        report.cells.push({
          host,
          checks: Object.fromEntries(
            MANAGED_UPGRADE_CHECKS.map((name) => [
              name,
              { ok: false, skipped: true, reason: 'unexpected host-cell failure' },
            ])
          ),
          errors: [{ check: 'unexpected', ...serialized }],
          ok: false,
        });
        report.errors.push({ host, ...serialized });
      }
    }
  } catch (error) {
    const serialized = serializeError(error);
    report.errors.push({ check: 'candidate', ...serialized });
    report.cells = MANAGED_UPGRADE_HOSTS.map((host) => ({
      host,
      checks: Object.fromEntries(
        MANAGED_UPGRADE_CHECKS.map((name) => [
          name,
          { ok: false, skipped: true, reason: 'candidate resolution failed' },
        ])
      ),
      errors: [{ check: 'candidate', ...serialized }],
      ok: false,
    }));
  } finally {
    report.finishedAt = new Date().toISOString();
    report.ok = managedUpgradeCandidateReportOk(report);
    try {
      writeJson(reportPath, report);
      console.log(`[managed-upgrade-candidate] report ${reportPath}`);
    } catch (error) {
      console.error(`[managed-upgrade-candidate] failed to write report: ${String(error)}`);
      report.ok = false;
    }
    fs.rmSync(workRoot, { recursive: true, force: true });
  }
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  await main();
}
