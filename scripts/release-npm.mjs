#!/usr/bin/env node
/**
 * scripts/release-npm.mjs
 *
 * One-command npm release: verify (typecheck + tests + security audit +
 * architecture gate) → publish.
 * `prepack` runs the build, so `npm publish` always ships a fresh dist.
 *
 * Real releases should run through .github/workflows/publish-npm.yml so npm
 * receives GitHub Actions provenance. Local real publish is an explicit
 * emergency path only.
 *
 * Usage:
 *   npm run release:npm -- --dry          # verify + npm publish dry-run
 *   npm run release:npm                  # real publish in GitHub Actions
 *   npm run release:npm -- --allow-local # emergency local publish, no provenance
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dry = process.argv.includes('--dry');
const allowLocalPublish = process.argv.includes('--allow-local');
const runningInGitHubActions = process.env.GITHUB_ACTIONS === 'true';

if (!dry && !runningInGitHubActions && !allowLocalPublish) {
  console.error(
    '[release-npm] real releases must run from GitHub Actions for npm provenance. ' +
      'Use "--dry" locally, or "--allow-local" only for an explicit emergency publish.'
  );
  process.exit(1);
}

function run(cmd) {
  console.log(`[release-npm] ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

if (!dry && !runningInGitHubActions) {
  try {
    execSync('npm whoami', { cwd: root, stdio: 'pipe' });
  } catch {
    console.error('[release-npm] not logged in to npm. Run "npm login" first.');
    process.exit(1);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

try {
  execFileSync('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  console.error(`[release-npm] ${pkg.name}@${pkg.version} is already published. Bump package.json first.`);
  process.exit(1);
} catch (error) {
  const stderr = error.stderr?.toString() ?? '';
  if (!stderr.includes('E404') && !stderr.includes('404')) throw error;
}

run('npm run typecheck');
run('npx vitest run');
run('npm run security:audit');
run('npm run check:architecture');

if (!dry && allowLocalPublish) {
  console.warn('[release-npm] local publish is not provenance-backed.');
}

run(
  dry
    ? 'npm publish --dry-run'
    : runningInGitHubActions
      ? 'npm publish --provenance --access public'
      : 'npm publish --access public'
);

console.log(
  dry
    ? '[release-npm] dry run complete.'
    : `[release-npm] published ${pkg.name}@${pkg.version}`
);
