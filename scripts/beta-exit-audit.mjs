#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateAt = process.argv.indexOf('--candidate');
const candidate = candidateAt === -1 ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() : process.argv[candidateAt + 1];
const outAt = process.argv.indexOf('--out');
const out = path.resolve(outAt === -1 ? path.join(root, 'eval', 'beta-exit', candidate) : process.argv[outAt + 1]);
const reviewerAt = process.argv.indexOf('--reviewer');
const reviewer = reviewerAt === -1 ? null : path.resolve(process.argv[reviewerAt + 1]);

function check(id, status, detail) { return { id, status, detail }; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function command(command, args) { return spawnSync(command, args, { cwd: root, encoding: 'utf8' }); }
function reportMarkdown(report) {
  return `# Beta exit audit\n\nCandidate: \`${report.candidate}\`\n\nDecision: **${report.decision.toUpperCase()}**\n\n| Check | Status | Detail |\n|---|---|---|\n${report.checks.map((item) => `| ${item.id} | ${item.status} | ${item.detail} |`).join('\n')}\n`;
}

const checks = [];
checks.push(check('candidate-sha', /^[0-9a-f]{40}$/i.test(candidate) ? 'pass' : 'fail', /^[0-9a-f]{40}$/i.test(candidate) ? 'full SHA supplied' : 'candidate must be a full SHA'));
const adoptionFile = path.join(root, 'eval', 'adoption', 'results', candidate, 'summary.json');
if (!fs.existsSync(adoptionFile)) checks.push(check('adoption', 'unverified', `missing ${path.relative(root, adoptionFile)}`));
else {
  const adoption = readJson(adoptionFile);
  checks.push(check('adoption', adoption.acceptance && Object.values(adoption.acceptance).every(Boolean) ? 'pass' : 'fail', `cells=${adoption.cellCount}, coverage=${adoption.medians?.governedCoveragePercent ?? 'n/a'}%`));
  const hosts = Object.keys(adoption.dimensions?.hosts ?? {});
  checks.push(check('host-profiles', ['claude', 'grok', 'cursor', 'codex'].every((host) => hosts.includes(host)) ? 'pass' : 'fail', `hosts=${hosts.join(',') || 'none'}`));
}
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-beta-artifacts-'));
try {
  const artifactRun = command('npm', ['run', 'check:release-artifacts', '--', '--out', artifacts]);
  checks.push(check('release-artifacts', artifactRun.status === 0 ? 'pass' : 'fail', artifactRun.status === 0 ? 'tarballs, SBOMs, checksums, manifests verified' : (artifactRun.stderr || artifactRun.stdout).trim().slice(0, 300)));
} finally { fs.rmSync(artifacts, { recursive: true, force: true }); }
if (!reviewer || !fs.existsSync(reviewer)) checks.push(check('independent-review', 'unverified', 'missing reviewer declaration supplied with --reviewer'));
else {
  const declaration = readJson(reviewer);
  const ok = declaration.candidate === candidate && declaration.independent === true && declaration.decision === 'pass' && typeof declaration.reviewer === 'string';
  checks.push(check('independent-review', ok ? 'pass' : 'fail', ok ? `reviewer=${declaration.reviewer}` : 'declaration must be an independent pass for this candidate'));
}
const decision = checks.every((item) => item.status === 'pass') ? 'pass' : 'fail';
const report = { schemaVersion: 1, candidate, decision, checks };
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'audit.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(out, 'audit.md'), reportMarkdown(report));
console.log(JSON.stringify(report, null, 2));
process.exitCode = decision === 'pass' ? 0 : 1;
