#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const budgets = JSON.parse(fs.readFileSync(path.join(root, 'release/package-budgets.v1.json'), 'utf8'));
const outArg = process.argv.indexOf('--out');
const output = path.resolve(outArg === -1 ? path.join(root, 'release', 'artifacts') : process.argv[outArg + 1]);
const json = process.argv.includes('--json');

function run(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' });
}
function sha256(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function cyclonedxSerial(component) {
  const hex = createHash('sha256').update(component).digest('hex');
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function pack(name, policy, work) {
  const cwd = path.join(root, policy.path);
  const report = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', work], cwd))[0];
  const tarball = path.join(work, report.filename);
  const errors = [];
  if (report.size > policy.maxPackedBytes) errors.push(`packed ${report.size} exceeds ${policy.maxPackedBytes}`);
  if (report.unpackedSize > policy.maxUnpackedBytes) errors.push(`unpacked ${report.unpackedSize} exceeds ${policy.maxUnpackedBytes}`);
  if (report.files.length > policy.maxFiles) errors.push(`files ${report.files.length} exceeds ${policy.maxFiles}`);
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const component = { type: 'library', name: pkg.name, version: pkg.version, licenses: [{ license: { id: pkg.license || 'NOASSERTION' } }] };
  fs.mkdirSync(path.join(output, name), { recursive: true });
  fs.copyFileSync(tarball, path.join(output, name, report.filename));
  fs.writeFileSync(path.join(output, name, `${report.filename}.sha256`), `${sha256(tarball)}  ${report.filename}\n`);
  fs.writeFileSync(path.join(output, name, 'content-manifest.json'), `${JSON.stringify({ schemaVersion: 1, package: component, packedBytes: report.size, unpackedBytes: report.unpackedSize, files: report.files }, null, 2)}\n`);
  fs.writeFileSync(path.join(output, name, 'sbom.cdx.json'), `${JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5', serialNumber: cyclonedxSerial(`${pkg.name}@${pkg.version}`), version: 1, metadata: { component }, components: Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies }).map(([dep, version]) => ({ type: 'library', name: dep, version })) }, null, 2)}\n`);
  return { name, package: pkg.name, version: pkg.version, packedBytes: report.size, unpackedBytes: report.unpackedSize, files: report.files.length, errors };
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-release-artifacts-'));
try {
  run('npm', ['run', 'build']);
  run('npm', ['run', 'build:runtime']);
  fs.rmSync(output, { recursive: true, force: true });
  const results = Object.entries(budgets.packages).map(([name, policy]) => pack(name, policy, work));
  const report = { schemaVersion: 1, candidateSha: run('git', ['rev-parse', 'HEAD']).trim(), budgets: 'release/package-budgets.v1.json', results, ok: results.every((result) => result.errors.length === 0) };
  fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (json) console.log(JSON.stringify(report, null, 2)); else console.log(`release artifacts ${report.ok ? 'verified' : 'failed'}: ${output}`);
  if (!report.ok) process.exitCode = 1;
} finally { fs.rmSync(work, { recursive: true, force: true }); }
