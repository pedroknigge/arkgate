#!/usr/bin/env node
import path from 'node:path';

import { tryResidentDoctor } from './lib/resident-doctor-client.mjs';

const VALUE_FLAGS = new Map([
  ['--root', 'root'],
  ['--config', 'config'],
  ['--manifest', 'manifest'],
  ['--tsconfig', 'tsconfig'],
]);
const BOOLEAN_FLAGS = new Set(['--resident', '--doctor', '--json', '--no-cache']);

function residentArgs(argv) {
  const args = {
    root: process.cwd(),
    config: 'ark.config.json',
    manifest: undefined,
    tsconfig: undefined,
    resident: false,
    doctor: false,
    json: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    const property = VALUE_FLAGS.get(flag);
    if (property) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) return null;
      args[property] = property === 'root' ? path.resolve(value) : value;
      index += 1;
      continue;
    }
    if (!BOOLEAN_FLAGS.has(flag)) return null;
    if (flag === '--resident') args.resident = true;
    else if (flag === '--doctor') args.doctor = true;
    else if (flag === '--json') args.json = true;
  }
  return args.resident && args.doctor && args.json ? args : null;
}

async function main() {
  const args = residentArgs(process.argv);
  if (!args) {
    await import('./ark-check-runtime.mjs');
    return;
  }
  if (await tryResidentDoctor(args)) return;

  // The lightweight attempt already proved the resident unavailable. Preserve the exact
  // one-shot fallback without paying a second socket timeout in the full runtime.
  process.argv = process.argv.filter((argument, index) => index < 2 || argument !== '--resident');
  await import('./ark-check-runtime.mjs');
}

main().catch((error) => {
  console.error(
    process.env.ARK_DEBUG_STACK === '1' && error instanceof Error
      ? error.stack
      : error instanceof Error
        ? error.message
        : String(error)
  );
  process.exitCode = 2;
});
