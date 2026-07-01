#!/usr/bin/env node
/**
 * scripts/run-publish-smoke.mjs
 *
 * Committed automation for Verification plan step 2.
 * - packs the library to {SCRATCH}
 * - creates a fresh temp dir
 * - npm installs the tgz
 * - compiles and runs examples/publish-smoke/consumer.ts
 * - writes stdout to {SCRATCH}/consumer-run.log (and consumer-run2.log on repeat)
 *
 * Usage:
 *   node scripts/run-publish-smoke.mjs
 *   node scripts/run-publish-smoke.mjs --repeat
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SCRATCH = process.env.SCRATCH || '/var/folders/02/q6fn08j97gx7bf7s8y25j7sh0000gn/T/grok-goal-feab1526d053/implementer';
const root = process.cwd();

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8', ...opts });
}

function logTo(file, content) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(file, content);
  console.log('Wrote', file);
}

const repeat = process.argv.includes('--repeat');
const logName = repeat ? 'consumer-run2.log' : 'consumer-run.log';
const logPath = path.join(SCRATCH, logName);

// Always ensure we are in full dev state before packing.
run('node scripts/dev-setup.cjs');

console.log('[run-publish-smoke] packing...');
run(`npm pack --pack-destination ${SCRATCH} --silent`);

const files = fs.readdirSync(SCRATCH).filter(f => f.endsWith('.tgz'));
if (files.length === 0) throw new Error('No tgz found after pack');
const tgz = path.join(SCRATCH, files[0]);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-smoke-'));
console.log('[run-publish-smoke] installing into', tmp);
run(`cd ${tmp} && npm init -y && npm install ${tgz} typescript @types/node`, { stdio: 'inherit' });

// Copy the committed consumer
const consumerSrc = path.join(root, 'examples/publish-smoke/consumer.ts');
const consumerDst = path.join(tmp, 'consumer.ts');
fs.copyFileSync(consumerSrc, consumerDst);

// tsconfig for the smoke
fs.writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    outDir: './dist',
    rootDir: '.'
  },
  include: ['consumer.ts']
}, null, 2));

// Set type module
const pkgPath = path.join(tmp, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.type = 'module';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

console.log('[run-publish-smoke] compiling and running...');
run(`cd ${tmp} && npx tsc`, { stdio: 'inherit' });
const output = run(`cd ${tmp} && node dist/consumer.js`, { encoding: 'utf8' });

logTo(logPath, output);
console.log('[run-publish-smoke] done. Output written to', logPath);

if (!repeat) {
  // also run repeat for convenience
  console.log('[run-publish-smoke] running repeat for consumer-run2.log ...');
  run(`node ${path.join(root, 'scripts/run-publish-smoke.mjs')} --repeat`);
}
