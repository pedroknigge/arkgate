#!/usr/bin/env node
/**
 * Install a specific TypeScript version into a temp consumer fixture and run
 * ark-check --plan. Used by CI matrix (typescript 5.x / 6.x / 7.x).
 *
 * Usage: node scripts/ts-compat-matrix.mjs <typescript-version>
 * Example: node scripts/ts-compat-matrix.mjs 7.0.2
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/ts-compat-matrix.mjs <typescript-version>');
  process.exit(2);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureSrc = path.join(repoRoot, 'tests/fixtures/ts-consumer');
const checkBin = path.join(repoRoot, 'bin/ark-check.mjs');
const work = fs.mkdtempSync(path.join(os.tmpdir(), `ark-ts-matrix-${version}-`));

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...opts,
  });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    console.error(`[ts-compat-matrix] failed: ${cmd} ${args.join(' ')} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  return r;
}

console.log(`[ts-compat-matrix] typescript@${version}`);
console.log(`[ts-compat-matrix] workdir ${work}`);

fs.cpSync(fixtureSrc, work, { recursive: true });
fs.writeFileSync(
  path.join(work, 'package.json'),
  JSON.stringify(
    {
      name: `ark-ts-matrix-${version.replace(/[^\w.-]/g, '_')}`,
      private: true,
      devDependencies: { typescript: version },
    },
    null,
    2
  )
);

run('npm', ['install', '--no-fund', '--no-audit'], { cwd: work });

const tsPkg = JSON.parse(
  fs.readFileSync(path.join(work, 'node_modules/typescript/package.json'), 'utf8')
);
console.log(`[ts-compat-matrix] installed typescript ${tsPkg.version}`);

const plan = run(process.execPath, [
  checkBin,
  '--root',
  work,
  '--config',
  'ark.config.json',
  '--plan',
  '--json',
  '--no-cache',
]);

const out = JSON.parse(plan.stdout);
if (!out.plan || !Array.isArray(out.plan.steps)) {
  console.error('[ts-compat-matrix] plan missing steps', out);
  process.exit(1);
}

const bad = out.plan.steps.find((s) => s.file === 'src/domain/bad.ts');
if (!bad) {
  console.error('[ts-compat-matrix] expected violation on src/domain/bad.ts', out.plan.steps);
  process.exit(1);
}
if (bad.class !== 'mechanical-safe') {
  console.error('[ts-compat-matrix] expected mechanical-safe for type-only edge', bad);
  process.exit(1);
}

console.log(
  `[ts-compat-matrix] OK typescript@${tsPkg.version} plan steps=${out.plan.steps.length} safe=${out.plan.counts.mechanicalSafe}`
);
