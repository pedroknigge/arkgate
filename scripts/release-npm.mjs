#!/usr/bin/env node
/**
 * scripts/release-npm.mjs
 *
 * One-command npm release: verify (typecheck + coverage/mutation confidence +
 * security audit + architecture gate) → publish `arkgate` (latest) and
 * Deprecated leftover `@arkgate/runtime` (`experimental` dist-tag only; ADR 0031).
 * `prepack` runs the gate build, so `npm publish` at root always ships a fresh dist.
 * Companion has no prepack — `npm run build:runtime` runs before that publish.
 *
 * Real releases should run through .github/workflows/publish-npm.yml so npm
 * receives GitHub Actions provenance. Companion-only first publish uses
 * .github/workflows/publish-runtime.yml (`--runtime-only`).
 * Local real publish is an explicit emergency path only.
 *
 * Usage:
 *   npm run release:npm -- --dry             # verify + npm publish dry-run (both)
 *   npm run release:npm                      # real publish in GitHub Actions
 *   npm run release:npm -- --runtime-only    # companion only (skip gate tarball)
 *   npm run release:npm -- --allow-local     # emergency local publish, no provenance
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const dry = process.argv.includes('--dry');
const allowLocalPublish = process.argv.includes('--allow-local');
const runtimeOnly = process.argv.includes('--runtime-only');
const runningInGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const RUNTIME_DIST_TAG = 'experimental';
const runtimeDir = path.join(root, 'packages/runtime');

if (!dry && !runningInGitHubActions && !allowLocalPublish) {
  console.error(
    '[release-npm] real releases must run from GitHub Actions for npm provenance. ' +
      'Use "--dry" locally, or "--allow-local" only for an explicit emergency publish.'
  );
  process.exit(1);
}

function run(file, args, cwd = root) {
  const where = cwd === root ? '' : `(${path.relative(root, cwd)}) `;
  console.log(`[release-npm] ${where}${[file, ...args].join(' ')}`);
  execFileSync(file, args, { cwd, stdio: 'inherit' });
}

function alreadyPublished(name, version) {
  try {
    execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      cwd: root,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch (error) {
    const stderr = error.stderr?.toString() ?? '';
    if (!stderr.includes('E404') && !stderr.includes('404')) throw error;
    return false;
  }
}

function publishPackage({ label, cwd, distTag }) {
  // Always publish from the repo root so GitHub OIDC / `.npmrc` apply.
  // `npm publish <folder>` from a subdirectory loses trusted-publishing auth (ENEEDAUTH).
  // `./` is required: `npm publish packages/runtime` is parsed as a git spec.
  const args = ['publish'];
  if (cwd !== root) args.push(`./${path.relative(root, cwd)}`);
  if (dry) args.push('--dry-run');
  else if (runningInGitHubActions) args.push('--provenance');
  args.push('--access', 'public');
  if (distTag) args.push('--tag', distTag);
  console.log(`[release-npm] ${label}`);
  run('npm', args, root);
}

if (!dry && !runningInGitHubActions) {
  try {
    execFileSync('npm', ['whoami'], { cwd: root, stdio: 'pipe' });
  } catch {
    console.error('[release-npm] not logged in to npm. Run "npm login" first.');
    process.exit(1);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const runtimePkg = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'package.json'), 'utf8'));

if (runtimePkg.name !== '@arkgate/runtime') {
  console.error(`[release-npm] expected packages/runtime name @arkgate/runtime, got ${runtimePkg.name}`);
  process.exit(1);
}
if (runtimePkg.publishConfig?.tag !== RUNTIME_DIST_TAG) {
  console.error(
    `[release-npm] @arkgate/runtime must publish under dist-tag "${RUNTIME_DIST_TAG}" (ADR 0004).`
  );
  process.exit(1);
}

const gatePublished = alreadyPublished(pkg.name, pkg.version);
const runtimePublished = alreadyPublished(runtimePkg.name, runtimePkg.version);

if (!dry && !runtimeOnly && gatePublished && runtimePublished) {
  console.error(
    `[release-npm] ${pkg.name}@${pkg.version} and ${runtimePkg.name}@${runtimePkg.version} ` +
      'are already published. Bump the unpublished package first.'
  );
  process.exit(1);
}
if (!dry && runtimeOnly && runtimePublished) {
  console.error(
    `[release-npm] ${runtimePkg.name}@${runtimePkg.version} is already published. Bump packages/runtime first.`
  );
  process.exit(1);
}

if (runtimeOnly) {
  run('npm', ['run', 'typecheck']);
  run('npm', ['run', 'check:architecture']);
} else {
  run('npm', ['run', 'typecheck']);
  run('npm', ['run', 'test:confidence']);
  run('npm', ['run', 'security:audit']);
  run('npm', ['run', 'check:architecture']);
  const releaseArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'arkgate-release-'));
  try {
    console.log('[release-npm] npm run check:release-artifacts');
    execFileSync(
      'npm',
      ['run', 'check:release-artifacts', '--', '--out', path.join(releaseArtifacts, 'artifacts')],
      { cwd: root, stdio: 'inherit' }
    );
  } finally {
    fs.rmSync(releaseArtifacts, { recursive: true, force: true });
  }
}

run('npm', ['run', 'build:runtime']);

if (!dry && allowLocalPublish) {
  console.warn('[release-npm] local publish is not provenance-backed.');
}

if (!runtimeOnly) {
  if (!dry && gatePublished) {
    console.log(`[release-npm] skip ${pkg.name}@${pkg.version} (already published).`);
  } else {
    publishPackage({ label: `${pkg.name}@${pkg.version}`, cwd: root, distTag: undefined });
  }
}

if (!dry && runtimePublished) {
  console.log(`[release-npm] skip ${runtimePkg.name}@${runtimePkg.version} (already published).`);
} else {
  publishPackage({
    label: `${runtimePkg.name}@${runtimePkg.version} dist-tag ${RUNTIME_DIST_TAG}`,
    cwd: runtimeDir,
    distTag: RUNTIME_DIST_TAG,
  });
}

console.log(
  dry
    ? '[release-npm] dry run complete.'
    : runtimeOnly
      ? `[release-npm] published ${runtimePkg.name}@${runtimePkg.version}`
      : `[release-npm] published ${pkg.name}@${pkg.version}` +
        (runtimePublished ? '' : ` and ${runtimePkg.name}@${runtimePkg.version}`)
);
