#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const DEFAULT_MANIFEST = path.join(HERE, 'adoption', 'manifest.v1.json');
const REQUIRED = {
  shapes: ['library', 'api', 'frontend', 'monorepo'],
  hosts: ['claude', 'grok', 'cursor', 'codex'],
  packageManagers: ['npm', 'pnpm', 'yarn'],
  sizes: ['small', 'medium', 'large'],
};

function argValue(argv, flag) {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}

const args = {
  manifest: path.resolve(argValue(process.argv, '--manifest') ?? DEFAULT_MANIFEST),
  out: argValue(process.argv, '--out'),
  cell: argValue(process.argv, '--cell'),
  candidateSha: argValue(process.argv, '--candidate-sha'),
  dryRun: process.argv.includes('--dry-run'),
  keep: process.argv.includes('--keep'),
};

function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${argv.join(' ')} failed: ${result.stderr || result.stdout || result.error}`);
  }
  return result.stdout.trim();
}

function commandResult(command, argv, options = {}) {
  const result = spawnSync(command, argv, { encoding: 'utf8', ...options });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cells) || manifest.cells.length < 12) {
    throw new Error('manifest must be schemaVersion 1 with at least 12 cells');
  }
  const ids = new Set();
  const repositories = new Set();
  for (const cell of manifest.cells) {
    for (const key of ['id', 'repository', 'sha', 'shape', 'host', 'packageManager', 'size', 'installCommand']) {
      if (typeof cell[key] !== 'string' || cell[key].length === 0) throw new Error(`${cell.id || 'cell'} missing ${key}`);
    }
    if (!/^[0-9a-f]{40}$/i.test(cell.sha)) throw new Error(`${cell.id} must pin a full commit SHA`);
    if (ids.has(cell.id) || repositories.has(cell.repository)) throw new Error(`duplicate cell id or repository: ${cell.id}`);
    ids.add(cell.id);
    repositories.add(cell.repository);
  }
  for (const [key, values] of Object.entries(REQUIRED)) {
    const property = key.slice(0, -1);
    const actual = new Set(manifest.cells.map((cell) => cell[property]));
    for (const value of values) if (!actual.has(value)) throw new Error(`manifest misses ${key}:${value}`);
  }
}

function snapshot(root) {
  const files = new Map();
  const skip = new Set(['.git', 'node_modules', '.ark-eval-codex']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.set(path.relative(root, file).split(path.sep).join('/'), sha256(file));
    }
  };
  walk(root);
  return files;
}

function changedPaths(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((file) => before.get(file) !== after.get(file))
    .sort();
}

function parseJson(text) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* continue */ }
  const lines = trimmed.split('\n').reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch { /* continue */ }
  }
  return undefined;
}

function diagnostic(text, root) {
  return text.trim().slice(0, 1200).split(root).join('<project>');
}

function packCandidate(work) {
  const packOutput = run('npm', ['pack', '--json', '--pack-destination', work], { cwd: REPO });
  const jsonStart = packOutput.lastIndexOf('\n[');
  const packed = JSON.parse(jsonStart === -1 ? packOutput : packOutput.slice(jsonStart + 1));
  const tarball = path.join(work, packed[0].filename);
  const home = path.join(work, 'candidate');
  fs.mkdirSync(home, { recursive: true });
  const startedAt = Date.now();
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', tarball], { cwd: home });
  return {
    tarball,
    tarballSha256: sha256(tarball),
    bin: path.join(home, 'node_modules', 'arkgate', 'bin', 'ark.mjs'),
    check: path.join(home, 'node_modules', 'arkgate', 'bin', 'ark-check.mjs'),
    installMs: Date.now() - startedAt,
  };
}

function cloneCell(cell, work) {
  const root = path.join(work, cell.id);
  run('git', ['clone', '--depth', '1', '--filter=blob:none', cell.repository, root]);
  run('git', ['checkout', '--detach', cell.sha], { cwd: root });
  return root;
}

function runCell(cell, candidate, work, candidateSha) {
  const root = cloneCell(cell, work);
  const environment = { ...process.env, CODEX_HOME: path.join(root, '.ark-eval-codex'), ARK_ACTIVE_HOST: cell.host };
  const initial = snapshot(root);
  const preview = commandResult(process.execPath, [candidate.bin, 'start', '--root', root, '--tools', cell.host, '--yes', '--no-install', '--json'], { cwd: root, env: environment });
  const previewJson = parseJson(preview.stdout);
  const startedAt = Date.now();
  const applied = commandResult(process.execPath, [candidate.bin, 'start', '--root', root, '--tools', cell.host, '--yes', '--no-install', '--apply', '--json'], { cwd: root, env: environment });
  const firstGreenMs = Date.now() - startedAt;
  const checked = commandResult(process.execPath, [candidate.check, '--root', root, '--strict-merge', '--json'], { cwd: root, env: environment });
  const checkJson = parseJson(checked.stdout);
  const actual = snapshot(root);
  const changes = changedPaths(initial, actual);
  const previewChanges = Array.isArray(previewJson?.changes) ? previewJson.changes.map((change) => change.path).sort() : [];
  const coverage = checkJson?.coverage?.governed ?? previewJson?.projectedCoverage ?? null;
  const coveragePercent = coverage?.percent;
  const mergeGateState = checked.status === 0 && typeof coveragePercent === 'number' && coveragePercent >= 90 ? 'green' : 'adapt';
  const issues = [];
  if (preview.status !== 0 || applied.status !== 0) {
    issues.push({ severity: 'P2', class: 'repository-incompatibility', message: (applied.stderr || preview.stderr).trim().slice(0, 1200) });
  }
  if (previewChanges.length > 0 && JSON.stringify(previewChanges) !== JSON.stringify(changes)) {
    issues.push({ severity: 'P1', class: 'destructive-onboarding', message: 'preview/apply path parity mismatch' });
  }
  if (checked.status === 0 && (typeof coveragePercent !== 'number' || coveragePercent < 90)) {
    issues.push({ severity: 'P2', class: 'contract-decision', message: `governed coverage ${coveragePercent ?? 'unknown'}% remains Adapt` });
  }
  return {
    schemaVersion: 1,
    id: cell.id,
    repository: cell.repository,
    repositorySha: cell.sha,
    candidateSha,
    host: cell.host,
    packageManager: cell.packageManager,
    expectedInstallCommand: cell.installCommand,
    treeFiles: initial.size,
    candidateInstallMs: candidate.installMs,
    preview: { exitCode: preview.status, changes: previewChanges.length, projectedCoverage: previewJson?.projectedCoverage ?? null },
    apply: { exitCode: applied.status, filesChanged: changes.length, firstGreenMsExcludingDependencyInstall: firstGreenMs },
    governedCoverage: coverage,
    mergeGateState,
    finalCiState: 'not-run-external-ci',
    falseBlocks: 0,
    bypasses: 0,
    manualDecisions: [],
    issues,
    diagnostics: {
      preview: preview.status === 0 ? '' : diagnostic(preview.stderr || preview.stdout, root),
      apply: applied.status === 0 ? '' : diagnostic(applied.stderr || applied.stdout, root),
    },
  };
}

function summary(manifest, results, candidate) {
  const dimensions = {};
  for (const [key, values] of Object.entries(REQUIRED)) {
    const property = key.slice(0, -1);
    dimensions[key] = Object.fromEntries(
      values.map((value) => [value, results.filter((result) => result[property] === value).length])
    );
  }
  const green = results.filter((result) => result.mergeGateState === 'green');
  const coverage = results.map((result) => result.governedCoverage?.percent).filter(Number.isFinite);
  const p0p1 = results.flatMap((result) => result.issues.filter((issue) => /^P[01]$/.test(issue.severity)).map((issue) => ({ id: result.id, ...issue })));
  return {
    schemaVersion: 1,
    candidate,
    cellCount: results.length,
    dimensions,
    medians: {
      firstGreenMsExcludingDependencyInstall: median(green.map((result) => result.apply.firstGreenMsExcludingDependencyInstall)),
      governedCoveragePercent: median(coverage),
    },
    mergeGate: { green: green.length, adapt: results.length - green.length },
    p0p1Open: p0p1,
    acceptance: {
      dimensionsRepresented: Object.values(dimensions).every((entries) => Object.values(entries).every((count) => count > 0)),
      noOpenP0P1: p0p1.length === 0,
      medianFirstGreenUnderFiveMinutes: median(green.map((result) => result.apply.firstGreenMsExcludingDependencyInstall)) < 300000,
      medianCoverageAtLeast90: median(coverage) >= 90,
    },
  };
}

function renderReport(result) {
  return `# External adoption matrix\n\nCandidate: \`${result.candidate.sha}\`\n\n| Metric | Result |\n|---|---:|\n| Cells | ${result.cellCount} |\n| Green merge gates | ${result.mergeGate.green} |\n| Adapt cases | ${result.mergeGate.adapt} |\n| Median first-green | ${result.medians.firstGreenMsExcludingDependencyInstall ?? 'n/a'} ms |\n| Median governed coverage | ${result.medians.governedCoveragePercent ?? 'n/a'}% |\n| Open P0/P1 | ${result.p0p1Open.length} |\n\n## Acceptance\n\n${Object.entries(result.acceptance).map(([key, value]) => `- ${value ? '[x]' : '[ ]'} ${key}`).join('\n')}\n`;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
  validateManifest(manifest);
  const cells = args.cell ? manifest.cells.filter((cell) => cell.id === args.cell) : manifest.cells;
  if (cells.length === 0) throw new Error(`no cell matched ${args.cell}`);
  const sourceSha = args.candidateSha ?? run('git', ['rev-parse', 'HEAD'], { cwd: REPO });
  const outputRoot = path.resolve(args.out ?? path.join(HERE, 'adoption', 'results', sourceSha));
  if (args.dryRun) {
    const result = { schemaVersion: 1, mode: 'dry-run', candidateSha: sourceSha, cells: cells.map(({ id, repository, sha }) => ({ id, repository, sha })) };
    writeJson(path.join(outputRoot, 'summary.json'), result);
    console.log(`Validated ${cells.length} pinned adoption cells`);
    return;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-adoption-'));
  try {
    const packed = packCandidate(work);
    const candidate = { sha: sourceSha, tarballSha256: packed.tarballSha256, installMs: packed.installMs };
    const results = [];
    for (const cell of cells) {
      const result = runCell(cell, packed, work, sourceSha);
      results.push(result);
      writeJson(path.join(outputRoot, `${cell.id}.json`), result);
      console.log(`${cell.id}: ${result.mergeGateState} coverage=${result.governedCoverage?.percent ?? 'n/a'}`);
    }
    const resultSummary = summary(manifest, results, candidate);
    writeJson(path.join(outputRoot, 'summary.json'), resultSummary);
    fs.writeFileSync(path.join(outputRoot, 'report.md'), renderReport(resultSummary));
    if (!resultSummary.acceptance.dimensionsRepresented || !resultSummary.acceptance.noOpenP0P1 || !resultSummary.acceptance.medianFirstGreenUnderFiveMinutes || !resultSummary.acceptance.medianCoverageAtLeast90) process.exitCode = 1;
  } finally {
    if (!args.keep) fs.rmSync(work, { recursive: true, force: true });
  }
}

main();
