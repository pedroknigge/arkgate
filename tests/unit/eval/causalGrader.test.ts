import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { snapshotTree } from '../../../eval/causal/fs-evidence.mjs';
import { GRADER_BUNDLE_FILES, gradeWorkspace } from '../../../eval/causal/grader.mjs';
import { architectureConfig, writeTaskFiles } from '../../../eval/causal/task-materialize.mjs';
import { makeManifest } from './causalFixtures';

const temporary: string[] = [];

function temp() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z08-grader-test-'));
  temporary.push(directory);
  return directory;
}

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function fixture(architectureExitCode: number) {
  const root = temp();
  const workspace = path.join(root, 'workspace');
  const evidenceDir = path.join(root, 'evidence');
  const candidateRoot = path.join(root, 'candidate');
  fs.mkdirSync(workspace, { recursive: true });
  const manifest = makeManifest();
  const task = manifest.tasks[0];
  writeTaskFiles(workspace, task, 'oracle');
  const architectureConfigPath = path.join(evidenceDir, 'ark.config.json');
  const taskPath = path.join(evidenceDir, 'task.json');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(architectureConfigPath, `${JSON.stringify(architectureConfig(task))}\n`);
  fs.writeFileSync(taskPath, `${JSON.stringify(task)}\n`);
  write(path.join(candidateRoot, 'bin', 'ark-check.mjs'), architectureExitCode === 0
    ? 'console.log(JSON.stringify({ valid: true, violations: [] }));\n'
    : 'console.log(JSON.stringify({ valid: false, violations: [{ ruleId: "TEST_ESCAPE" }] })); process.exitCode = 1;\n');
  const hostTarget = path.join(candidateRoot, 'node_modules', 'typescript-ark-host');
  fs.mkdirSync(path.dirname(hostTarget), { recursive: true });
  fs.symlinkSync(path.resolve('node_modules/typescript-ark-host'), hostTarget, 'dir');
  return { root, workspace, evidenceDir, candidateRoot, manifest, task, architectureConfigPath };
}

describe('Z08 common grader', () => {
  it('runs the hidden task, architecture, TypeScript, and repository commands through one green', () => {
    const value = fixture(0);
    const beforeSnapshot = snapshotTree(value.workspace);
    const result = gradeWorkspace({
      workspace: value.workspace,
      task: value.task,
      repository: { id: value.task.repositoryId, commands: { typecheck: [process.execPath, '-e', ''], tests: [process.execPath, '-e', ''] } },
      candidateRoot: value.candidateRoot,
      harnessRoot: path.resolve('.'),
      evidenceDir: value.evidenceDir,
      architectureConfigPath: value.architectureConfigPath,
      beforeSnapshot,
      env: process.env,
      deadlineMs: Date.now() + 30_000,
    });
    expect(result.report.passed).toBe(true);
    expect(result.report.stages).toMatchObject({
      integrity: { status: 'pass' },
      architecture: { status: 'pass' },
      typecheck: { status: 'pass' },
      tests: { status: 'pass' },
    });
    expect(result.report.classifications.falseBlocks).toBeNull();
    expect(result.report.stages.architecture.commands[0].argv).toEqual(expect.arrayContaining(['--strict-config', '--strict-merge']));
    expect(GRADER_BUNDLE_FILES).toEqual(expect.arrayContaining([
      'eval/causal/hook-audit.mjs',
      'eval/causal/run.mjs',
    ]));
  });

  it('counts a final architecture violation as an escaped write-path result', () => {
    const value = fixture(1);
    const result = gradeWorkspace({
      workspace: value.workspace,
      task: value.task,
      repository: { id: value.task.repositoryId, commands: { typecheck: [process.execPath, '-e', ''], tests: [process.execPath, '-e', ''] } },
      candidateRoot: value.candidateRoot,
      harnessRoot: path.resolve('.'),
      evidenceDir: value.evidenceDir,
      architectureConfigPath: value.architectureConfigPath,
      beforeSnapshot: snapshotTree(value.workspace),
      env: process.env,
    });
    expect(result.report.passed).toBe(false);
    expect(result.report.classifications.escapes).toBe(1);
  });
});
