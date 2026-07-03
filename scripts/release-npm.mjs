#!/usr/bin/env node
/**
 * scripts/release-npm.mjs
 *
 * One-command npm release: verify (typecheck + tests + architecture gate) → publish.
 * `prepack` runs the build, so `npm publish` always ships a fresh dist.
 *
 * Prerequisites: npm login (whoami is checked first).
 *
 * Usage:
 *   npm run release:npm             # real publish
 *   npm run release:npm -- --dry    # everything except the actual publish
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dry = process.argv.includes('--dry');

function run(cmd) {
  console.log(`[release-npm] ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

if (!dry) {
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
run('npm run check:architecture');

run(dry ? 'npm publish --dry-run' : 'npm publish');

console.log(
  dry
    ? '[release-npm] dry run complete.'
    : `[release-npm] published ${pkg.name}@${pkg.version}`
);
