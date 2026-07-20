#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freezeManifest } from './contract.mjs';
import { sha256File, writeJsonAtomic } from './fs-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function required(argv, flag) {
  const index = argv.indexOf(flag);
  const result = index === -1 ? undefined : argv[index + 1];
  if (!result) throw new Error(`${flag} is required`);
  return path.resolve(result);
}

export function attestMutation(argv = process.argv.slice(2)) {
  const manifestPath = required(argv, '--manifest');
  const reportPath = required(argv, '--report');
  const output = required(argv, '--output');
  const manifest = freezeManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).manifest;
  const sourceFiles = manifest.mutation.ranges.map(({ file, sourceSha256 }) => {
    const actual = sha256File(path.join(ROOT, file));
    if (actual !== sourceSha256) throw new Error(`${file} does not match the frozen candidate source`);
    return { file, sha256: actual };
  });
  const attestation = {
    schemaVersion: 1,
    candidateSourceSha: manifest.candidate.sourceSha,
    candidateTarballSha256: manifest.candidate.tarballSha256,
    configSha256: manifest.mutation.configSha256,
    reportSha256: sha256File(reportPath),
    runner: manifest.mutation.runner,
    sourceFiles,
  };
  writeJsonAtomic(output, attestation);
  return Object.freeze({ output, ...attestation });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(attestMutation())); }
  catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
