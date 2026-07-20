import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyHookAudit, replayBlockedCandidate } from '../../../eval/causal/hook-audit.mjs';
import { extractCandidatePackage } from '../../../eval/causal/candidate.mjs';
import { generateManifest } from '../../../eval/causal/generate-manifest.mjs';
import {
  copyDependencyTrees,
  grokArgv,
  maxNewCells,
  prepareGrokHome,
  recoverInterrupted,
  terminalFromRun,
  validatePartialLedger,
  verifyMutationAttestation,
} from '../../../eval/causal/run.mjs';
import { firstValidTerminal, makeLedger, makeManifest } from './causalFixtures';

const temporary: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function temp() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z08-runner-test-'));
  temporary.push(directory);
  return directory;
}

function write(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value)}\n`);
}

afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('Z08 causal runner evidence', () => {
  it('accepts only a positive per-invocation cell limit for safe pilot batches', () => {
    expect(maxNewCells([])).toBe(Number.POSITIVE_INFINITY);
    expect(maxNewCells(['--max-new-cells', '2'])).toBe(2);
    expect(() => maxNewCells(['--max-new-cells', '0'])).toThrow(/positive integer/);
    expect(() => maxNewCells(['--max-new-cells', '1.5'])).toThrow(/positive integer/);
  });

  it('copies root and package-level dependency trees for pnpm workspaces', () => {
    const source = temp();
    const target = temp();
    write(path.join(source, 'node_modules', 'root-package', 'index.js'), 'root\n');
    write(path.join(source, 'packages', 'library', 'node_modules', 'linked-package', 'index.js'), 'nested\n');
    write(path.join(source, 'packages', 'library', 'src', 'index.ts'), 'export {};\n');
    copyDependencyTrees(source, target);
    expect(fs.readFileSync(path.join(target, 'node_modules', 'root-package', 'index.js'), 'utf8')).toBe('root\n');
    expect(fs.readFileSync(path.join(target, 'packages', 'library', 'node_modules', 'linked-package', 'index.js'), 'utf8')).toBe('nested\n');
    expect(fs.existsSync(path.join(target, 'packages', 'library', 'src'))).toBe(false);
  });

  it('re-extracts the candidate on every resume instead of trusting stale state', () => {
    const source = temp();
    const target = temp();
    const tarball = path.join(temp(), 'candidate.tgz');
    write(path.join(source, 'package', 'package.json'), { name: 'arkgate' });
    write(path.join(source, 'package', 'marker.txt'), 'frozen\n');
    const packed = spawnSync('tar', ['-czf', tarball, '-C', source, 'package'], { encoding: 'utf8' });
    expect(packed.status, packed.stderr).toBe(0);
    const options = {
      tarball,
      target,
      typeScriptHostSource: path.resolve('node_modules/typescript-ark-host'),
    };
    extractCandidatePackage(options);
    write(path.join(target, 'marker.txt'), 'tampered\n');
    extractCandidatePackage(options);
    expect(fs.readFileSync(path.join(target, 'marker.txt'), 'utf8')).toBe('frozen\n');
  });

  it('keeps Grok credentials outside the durable evidence tree', () => {
    const out = temp();
    const authHome = temp();
    write(path.join(authHome, 'auth.json'), '{"token":"secret"}\n');
    const grokHome = prepareGrokHome(out, authHome);
    temporary.push(grokHome);
    expect(path.relative(out, grokHome).startsWith('..')).toBe(true);
    expect(fs.lstatSync(path.join(grokHome, 'auth.json')).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(out, 'state', 'grok-home', 'auth.json'))).toBe(false);
  });

  it('measures replay-classified false blocks instead of initializing a constant', () => {
    const directory = temp();
    const audit = path.join(directory, 'hook-audit.jsonl');
    fs.writeFileSync(audit, [
      { status: 2, replay: { classified: true, falseBlock: true } },
      { status: 2, replay: { classified: true, falseBlock: false } },
      { status: 2, replay: null },
      { status: 0, replay: null },
    ].map(JSON.stringify).join('\n') + '\n');
    expect(classifyHookAudit(audit)).toEqual({ blocks: 3, trueBlocks: 1, falseBlocks: 1, unclassifiedBlocks: 1 });
  });

  it('replays a blocked proposal through the final checker before calling it false', () => {
    const workspace = temp();
    const audit = path.join(workspace, 'audit.jsonl');
    write(path.join(workspace, 'ark.config.json'), { include: ['z08-task'] });
    write(path.join(workspace, 'z08-task', 'task', 'file.mts'), 'export const value = 1;\n');
    write(path.join(workspace, 'deny.mjs'), 'process.stdin.resume(); process.stdin.on("end", () => { process.exitCode = 2; });\n');
    write(path.join(workspace, 'check.mjs'), 'console.log(JSON.stringify({ valid: true }));\n');
    const payload = JSON.stringify({
      toolName: 'write',
      toolInput: { file_path: path.join(workspace, 'z08-task', 'task', 'file.mts'), content: 'export const value = 2;\n' },
    });
    expect(replayBlockedCandidate({ input: Buffer.from(payload), workspace, checkPath: 'check.mjs', configPath: 'ark.config.json' })).toMatchObject({ classified: true, falseBlock: true });
    const result = spawnSync(process.execPath, [
      path.resolve('eval/causal/hook-audit.mjs'),
      '--log', audit,
      '--replay-check', 'check.mjs',
      '--replay-config', 'ark.config.json',
      '--', process.execPath, path.join(workspace, 'deny.mjs'),
    ], { cwd: workspace, input: payload, encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(JSON.parse(fs.readFileSync(audit, 'utf8')).replay).toMatchObject({ classified: true, falseBlock: true });
    expect(classifyHookAudit(audit)).toEqual({ blocks: 1, trueBlocks: 0, falseBlocks: 1, unclassifiedBlocks: 0 });
  });

  it('records an after-cap green as censored time with completed merge-gate evidence', () => {
    const directory = temp();
    const manifest = makeManifest();
    const runCell = manifest.runs[0];
    const stdoutPath = path.join(directory, 'grok.stdout');
    const stderrPath = path.join(directory, 'grok.stderr');
    const reportPath = path.join(directory, 'grader-report.json');
    write(stdoutPath, JSON.stringify({ num_turns: 3, usage: { input_tokens: 10, output_tokens: 5 } }));
    write(stderrPath, '');
    const grading = {
      report: {
        passed: true,
        stages: Object.fromEntries(['integrity', 'architecture', 'typecheck', 'tests'].map((stage) => [stage, { status: 'pass' }])),
        classifications: { escapes: 0, bypasses: 0, falseBlocks: null, hookBlocks: null, manualDecisions: [] },
      },
      reportPath,
      afterSnapshot: { sha256: '4'.repeat(64) },
    };
    write(reportPath, grading.report);
    const terminal = terminalFromRun({
      manifest,
      runCell,
      startedAtMs: Date.now() - manifest.design.tauMs - 5,
      agentResult: { argv: ['grok'], result: { status: 0, timedOut: false }, stdoutPath, stderrPath },
      agentOutput: JSON.parse(fs.readFileSync(stdoutPath, 'utf8')),
      grading,
      cellDir: directory,
      intervention: {
        before: runCell.arm === 'treatment' ? '9'.repeat(64) : null,
        after: runCell.arm === 'treatment' ? 'a'.repeat(64) : null,
      },
      beforeSnapshot: { sha256: '3'.repeat(64) },
    });
    expect(terminal).toMatchObject({
      outcome: 'censored',
      censorReason: 'cap_reached',
      mergeGateCompleted: true,
      finalCiState: 'green',
    });
  });

  it('censors an over-cap agent turn count without creating an invalid ledger terminal', () => {
    const directory = temp();
    const manifest = makeManifest();
    const runCell = manifest.runs[0];
    const stdoutPath = path.join(directory, 'grok.stdout');
    const stderrPath = path.join(directory, 'grok.stderr');
    const reportPath = path.join(directory, 'grader-report.json');
    write(stdoutPath, JSON.stringify({ num_turns: manifest.design.maxTurns + 1 }));
    write(stderrPath, '');
    const grading = {
      report: {
        passed: true,
        stages: Object.fromEntries(['integrity', 'architecture', 'typecheck', 'tests'].map((stage) => [stage, { status: 'pass' }])),
        classifications: { escapes: 0, bypasses: 0, falseBlocks: null, hookBlocks: null, manualDecisions: [] },
      },
      reportPath,
      afterSnapshot: { sha256: '4'.repeat(64) },
    };
    write(reportPath, grading.report);
    const terminal = terminalFromRun({
      manifest,
      runCell,
      startedAtMs: Date.now() - 100,
      agentResult: { argv: ['grok'], result: { status: 0, timedOut: false }, stdoutPath, stderrPath },
      agentOutput: JSON.parse(fs.readFileSync(stdoutPath, 'utf8')),
      grading,
      cellDir: directory,
      intervention: {
        before: runCell.arm === 'treatment' ? '9'.repeat(64) : null,
        after: runCell.arm === 'treatment' ? 'a'.repeat(64) : null,
      },
      beforeSnapshot: { sha256: '3'.repeat(64) },
    });
    expect(terminal).toMatchObject({
      outcome: 'censored',
      censorReason: 'turn_cap_exceeded',
      turns: manifest.design.maxTurns,
      mergeGateCompleted: true,
      finalCiState: 'green',
    });
  });

  it('rejects a reordered partial ledger before resuming the wrong cell', () => {
    const manifest = makeManifest();
    const ledger = makeLedger(manifest).slice(0, 2);
    [ledger[0], ledger[1]] = [ledger[1], ledger[0]];
    expect(() => validatePartialLedger(manifest, ledger)).toThrow(/partial ledger breaks|cell identity/);
  });

  it('binds mutation proof to the frozen source, tarball, config, runner, and report', () => {
    const directory = temp();
    const manifest = makeManifest();
    const report = path.join(directory, 'mutation.json');
    const attestation = path.join(directory, 'attestation.json');
    write(report, '{"files":{}}\n');
    write(attestation, {
      schemaVersion: 1,
      candidateSourceSha: manifest.candidate.sourceSha,
      candidateTarballSha256: manifest.candidate.tarballSha256,
      configSha256: manifest.mutation.configSha256,
      reportSha256: sha256(fs.readFileSync(report, 'utf8')),
      runner: manifest.mutation.runner,
      sourceFiles: manifest.mutation.ranges.map((range) => ({ file: range.file, sha256: range.sourceSha256 })),
    });
    expect(verifyMutationAttestation({ manifest, mutationReportPath: report, mutationAttestationPath: attestation })).toMatchObject({ schemaVersion: 1 });
    const drifted = JSON.parse(fs.readFileSync(attestation, 'utf8'));
    drifted.candidateSourceSha = 'f'.repeat(40);
    write(attestation, drifted);
    expect(() => verifyMutationAttestation({ manifest, mutationReportPath: report, mutationAttestationPath: attestation })).toThrow(/does not match/);
  });

  it('freezes all 144 sessions plus the exact Grok and TypeScript-host identities', () => {
    const directory = temp();
    const binary = path.join(directory, 'grok');
    const output = path.join(directory, 'manifest.json');
    write(binary, '#!/bin/sh\n');
    const sourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const result = generateManifest([
      '--grok-binary', binary,
      '--frozen-at', '2026-07-20T12:00:00.000Z',
      '--candidate-source-sha', sourceSha,
      '--tarball-url', 'artifact://arkgate-candidate.tgz',
      '--tarball-sha256', 'b'.repeat(64),
      '--output', output,
    ]);
    const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(result.runs).toBe(144);
    expect(manifest.agent).toMatchObject({ binary, binarySha256: sha256('#!/bin/sh\n'), modelSeed: null });
    expect(manifest.toolchain.nodeVersion).toBe(process.version);
    expect(manifest.grader.typeScriptHost).toMatchObject({ version: '6.0.3' });
    expect(manifest.mutation.ranges.every((range: { sourceSha256: string }) => /^[0-9a-f]{64}$/.test(range.sourceSha256))).toBe(true);
    const zod = manifest.repositories.find((repository: { id: string }) => repository.id === 'zod');
    expect(zod.commands.install[0].slice(0, 2)).toEqual(['corepack', 'pnpm@10.12.1']);
    expect(zod.commands.typecheck).toContain('tsconfig.test.json');
    expect(zod.commands.tests).toContain('--typecheck.enabled=false');
    expect(manifest.runs.every((run: { sessionUuid: string }) => /^[0-9a-f-]{36}$/.test(run.sessionUuid))).toBe(true);
  });

  it('builds Grok argv from the frozen invocation flags rather than a second hardcoded policy', () => {
    const manifest = makeManifest();
    const workspace = temp();
    fs.mkdirSync(path.join(workspace, '.git'), { recursive: true });
    manifest.agent.invocationFlags = ['--always-approve', '--output-format=json', '--max-turns=25', '--no-memory', '--verbatim'];
    const argv = grokArgv(manifest, manifest.runs[0], manifest.tasks[0], workspace);
    expect(argv).toEqual(expect.arrayContaining(['--output-format', 'json', '--max-turns', '25', '--no-memory']));
    expect(argv.filter((value: string) => value === '--output-format')).toHaveLength(1);
    expect(argv.filter((value: string) => value === '--verbatim')).toHaveLength(1);
  });

  it('appends an already durable successful terminal instead of force-censoring it on resume', () => {
    const directory = temp();
    const manifest = makeManifest();
    const runCell = manifest.runs[0];
    const cellDir = path.join(directory, 'cell');
    const ledgerPath = path.join(directory, 'ledger.jsonl');
    fs.mkdirSync(cellDir, { recursive: true });
    const transcript = path.join(cellDir, 'transcript.json');
    const grader = path.join(cellDir, 'grader-report.json');
    write(transcript, { ok: true });
    write(grader, { passed: true });
    const terminal = firstValidTerminal();
    const startedAtMs = 1_800_000_000_000;
    Object.assign(terminal, {
      startedAtMs,
      finishedAtMs: startedAtMs + terminal.observedElapsedMs,
      transcriptSha256: sha256(fs.readFileSync(transcript, 'utf8')),
      graderReportSha256: sha256(fs.readFileSync(grader, 'utf8')),
      interventionBeforeSha256: runCell.arm === 'treatment' ? '9'.repeat(64) : null,
      interventionAfterSha256: runCell.arm === 'treatment' ? 'a'.repeat(64) : null,
    });
    write(path.join(cellDir, 'terminal.json'), terminal);
    write(path.join(cellDir, 'run-started.json'), {
      workspace: path.join(cellDir, 'workspace'),
      startedAtMs,
      sourceTreeBeforeSha256: terminal.sourceTreeBeforeSha256,
      interventionBeforeSha256: terminal.interventionBeforeSha256,
      interventionAfterSha256: terminal.interventionAfterSha256,
    });
    const entries: Array<Record<string, unknown>> = [];
    expect(recoverInterrupted({
      manifest,
      ledgerPath,
      entries,
      runCell,
      cellDir,
      repository: manifest.repositories[0],
      task: manifest.tasks[0],
      candidateRoot: directory,
      architectureConfigPath: path.join(cellDir, 'ark.config.hidden.json'),
      env: process.env,
    })).toBe(true);
    expect(entries).toHaveLength(1);
    expect((entries[0].terminal as { outcome: string }).outcome).toBe('first_valid');
    expect(fs.readFileSync(ledgerPath, 'utf8')).toContain(runCell.cellId);
  });
});
