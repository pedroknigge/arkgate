#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCandidatePackage } from './candidate.mjs';
import { gradeWorkspace, graderBundleSha256 } from './grader.mjs';
import { architectureConfig, writeTaskFiles } from './task-materialize.mjs';
import { sha256File, snapshotTree, writeJsonAtomic } from './fs-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function required(argv, flag) {
  const index = argv.indexOf(flag);
  const result = index === -1 ? undefined : argv[index + 1];
  if (!result) throw new Error(`${flag} is required`);
  return path.resolve(result);
}

function run(argv, options = {}) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 600_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`${argv.join(' ')} failed (${result.status ?? result.error?.code}): ${result.stderr || result.stdout || result.error}`);
  }
  return result;
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
}

function copyClone(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const result = spawnSync('/bin/cp', ['-cR', source, target], { encoding: 'utf8' });
  if (result.status === 0) return;
  fs.cpSync(source, target, { recursive: true, dereference: false });
}

function copyDependencyTrees(source, target) {
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(source, absolute);
      if (entry.name === 'node_modules') {
        copyClone(absolute, path.join(target, relative));
      } else {
        visit(absolute);
      }
    }
  };
  visit(source);
}

function initializeRepository(repository, target) {
  if (!fs.existsSync(path.join(target, '.git'))) {
    if (fs.existsSync(target) && fs.readdirSync(target).length > 0) throw new Error(`${target} exists but is not a Z08 Git cache`);
    fs.mkdirSync(target, { recursive: true });
    run(['git', 'init', '--quiet'], { cwd: target });
    run(['git', 'remote', 'add', 'origin', repository.url], { cwd: target });
    run(['git', 'fetch', '--depth', '1', '--filter=blob:none', 'origin', repository.sha], { cwd: target });
    run(['git', 'checkout', '--detach', '--quiet', 'FETCH_HEAD'], { cwd: target });
  }
  const remote = run(['git', 'remote', 'get-url', 'origin'], { cwd: target }).stdout.trim();
  const head = run(['git', 'rev-parse', 'HEAD'], { cwd: target }).stdout.trim();
  const tree = run(['git', 'rev-parse', 'HEAD^{tree}'], { cwd: target }).stdout.trim();
  if (remote !== repository.url || head !== repository.sha || tree !== repository.treeSha) {
    throw new Error(`${repository.id} cache identity does not match the source catalog`);
  }
}

function installRepository(repository, target) {
  if (repository.lockfile.synthetic) {
    fs.copyFileSync(path.join(ROOT, repository.lockfile.artifact), path.join(target, repository.lockfile.path));
  }
  const lockfile = path.join(target, repository.lockfile.path);
  if (sha256File(lockfile) !== repository.lockfile.sha256) throw new Error(`${repository.id} lockfile drifted before install`);
  for (const command of repository.commands.install) run(command, { cwd: target });
  if (!fs.existsSync(path.join(target, 'node_modules'))) throw new Error(`${repository.id} install produced no node_modules`);
}

function archiveWorkspace(repository, source, workspace) {
  fs.mkdirSync(workspace, { recursive: true });
  const archive = path.join(path.dirname(workspace), 'source.tar');
  run(['git', '-C', source, 'archive', '--format=tar', repository.sha, '-o', archive]);
  run(['tar', '-xf', archive, '-C', workspace]);
  fs.rmSync(archive, { force: true });
  if (repository.lockfile.synthetic) {
    fs.copyFileSync(path.join(ROOT, repository.lockfile.artifact), path.join(workspace, repository.lockfile.path));
  }
  if (repository.commonPatch) run(['git', 'apply', path.join(ROOT, repository.commonPatch.path)], { cwd: workspace });
  copyDependencyTrees(source, workspace);
  if (repository.id === 'nestjs-hexagonal-auth' && fs.existsSync(path.join(source, 'generated', 'prisma'))) {
    copyClone(path.join(source, 'generated', 'prisma'), path.join(workspace, 'generated', 'prisma'));
  }
}

function prequalifyTask({ repository, task, source, evidenceRoot, candidateRoot }) {
  const caseRoot = path.join(evidenceRoot, task.id);
  const workspace = path.join(caseRoot, 'workspace');
  fs.rmSync(caseRoot, { recursive: true, force: true });
  archiveWorkspace(repository, source, workspace);
  writeTaskFiles(workspace, task, 'oracle');
  const architectureConfigPath = path.join(caseRoot, 'ark.config.json');
  writeJsonAtomic(architectureConfigPath, architectureConfig(task));
  writeJsonAtomic(path.join(caseRoot, 'task.json'), task);
  const result = gradeWorkspace({
    workspace,
    task,
    repository,
    candidateRoot,
    harnessRoot: ROOT,
    evidenceDir: caseRoot,
    architectureConfigPath,
    beforeSnapshot: snapshotTree(workspace),
    env: { ...process.env, TZ: 'UTC', LANG: 'C.UTF-8', NO_COLOR: '1' },
  });
  if (!result.report.passed) throw new Error(`${task.id} oracle failed prequalification; see ${result.reportPath}`);
  fs.rmSync(path.join(caseRoot, 'compiled'), { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
  return { taskId: task.id, graderReportSha256: sha256File(result.reportPath) };
}

export function prepareSources(argv = process.argv.slice(2)) {
  const sourceCache = required(argv, '--source-cache');
  const candidateTarball = required(argv, '--candidate-tarball');
  if (sourceCache === path.parse(sourceCache).root) throw new Error('source cache cannot be a filesystem root');
  fs.mkdirSync(sourceCache, { recursive: true });
  const sourceCatalog = readJson('eval/causal/source-catalog.v1.json');
  const taskCatalog = readJson('eval/causal/task-catalog.v1.json');
  const tasks = taskCatalog.repositories.flatMap((entry) => taskCatalog.scenarios.map((scenario, index) => ({
    id: `${entry.id}-${scenario}`,
    repositoryId: entry.id,
    scenario,
    noun: entry.nouns[index],
  })));
  const evidenceRoot = path.join(sourceCache, '.z08-prequalification');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const candidateRoot = extractCandidatePackage({
    tarball: candidateTarball,
    target: path.join(evidenceRoot, 'candidate'),
    typeScriptHostSource: path.join(ROOT, 'node_modules', 'typescript-ark-host'),
  });
  const evidence = [];
  for (const repository of sourceCatalog.repositories) {
    const target = path.join(sourceCache, repository.id);
    initializeRepository(repository, target);
    installRepository(repository, target);
    for (const task of tasks.filter((candidate) => candidate.repositoryId === repository.id)) {
      evidence.push(prequalifyTask({ repository, task, source: target, evidenceRoot, candidateRoot }));
    }
  }
  const report = {
    schemaVersion: 1,
    candidateTarballSha256: sha256File(candidateTarball),
    graderSha256: graderBundleSha256(ROOT),
    sourceCatalogSha256: sha256File(path.join(ROOT, 'eval/causal/source-catalog.v1.json')),
    taskCatalogSha256: sha256File(path.join(ROOT, 'eval/causal/task-catalog.v1.json')),
    repositories: sourceCatalog.repositories.map((repository) => ({ id: repository.id, sha: repository.sha, treeSha: repository.treeSha })),
    tasks: evidence,
  };
  writeJsonAtomic(path.join(sourceCache, 'prequalification.json'), report);
  return Object.freeze({ sourceCache, repositories: report.repositories.length, tasks: report.tasks.length });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(prepareSources())); }
  catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
