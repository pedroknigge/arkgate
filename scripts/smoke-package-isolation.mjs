#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arkgate-package-isolation-'));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function pack(cwd) {
  const raw = run('npm', ['pack', '--json', '--ignore-scripts'], cwd);
  const report = JSON.parse(raw);
  return path.join(cwd, report[0].filename);
}

try {
  run('npm', ['run', 'build'], root);
  run('npm', ['run', 'build:runtime'], root);
  const gateTarball = pack(root);
  const runtimeTarball = pack(path.join(root, 'packages/runtime'));

  const gateInstall = path.join(temp, 'gate');
  fs.mkdirSync(gateInstall);
  run('npm', ['init', '-y'], gateInstall);
  run(
    'npm',
    ['install', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund', gateTarball],
    gateInstall
  );
  const gate = await import(
    pathToFileURL(path.join(gateInstall, 'node_modules/arkgate/dist/index.js')).href
  );
  if (typeof gate.createAICodeGate !== 'function' || gate.createStrictArkKernel !== undefined) {
    throw new Error('gate-only install exposes the wrong public surface');
  }
  if (fs.existsSync(path.join(gateInstall, 'node_modules/arkgate/dist/runtime'))) {
    throw new Error('gate-only install contains a runtime bundle');
  }

  const runtimeInstall = path.join(temp, 'runtime');
  fs.mkdirSync(runtimeInstall);
  run('npm', ['init', '-y'], runtimeInstall);
  run(
    'npm',
    ['install', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund', runtimeTarball],
    runtimeInstall
  );
  const runtime = await import(
    pathToFileURL(
      path.join(runtimeInstall, 'node_modules/@arkgate/runtime/dist/index.js')
    ).href
  );
  if (typeof runtime.createStrictArkKernel !== 'function') {
    throw new Error('independent runtime install did not expose createStrictArkKernel');
  }
  console.log('✔ gate-only and experimental runtime packages install independently.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  for (const cwd of [root, path.join(root, 'packages/runtime')]) {
    for (const file of fs.readdirSync(cwd)) {
      if (file.endsWith('.tgz')) fs.rmSync(path.join(cwd, file), { force: true });
    }
  }
}
