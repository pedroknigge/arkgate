#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEDGER_GENESIS_HASH,
  cellFingerprint,
  computeLedgerEntryHash,
  freezeManifest,
  mutationFingerprint,
  sealLedgerEntry,
  validateTerminalForRun,
  verifyLedger,
} from './contract.mjs';
import { analyzeExperiment } from './analyze.mjs';
import { extractCandidatePackage } from './candidate.mjs';
import { gradeWorkspace, graderBundleSha256 } from './grader.mjs';
import { classifyHookAudit } from './hook-audit.mjs';
import { architectureConfig, writeTaskFiles } from './task-materialize.mjs';
import {
  appendJsonLineDurable,
  sha256,
  sha256File,
  snapshotTree,
  writeJsonAtomic,
} from './fs-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GRADING_RESERVE_MS = 30_000;
const TERMINATION_GRACE_MS = 2_000;
const FINAL_SCHEMA = JSON.stringify({
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: { summary: { type: 'string' } },
});

function value(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function required(argv, flag) {
  const result = value(argv, flag);
  if (!result) throw new Error(`${flag} is required`);
  return path.resolve(result);
}

export function maxNewCells(argv) {
  const raw = value(argv, '--max-new-cells');
  if (raw === undefined) return Number.POSITIVE_INFINITY;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error('--max-new-cells must be a positive integer');
  return Number(raw);
}

function run(argv, options = {}) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`${argv.join(' ')} failed (${result.status ?? result.error?.code}): ${result.stderr || result.stdout || result.error}`);
  }
  return result;
}

function copyClone(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const result = spawnSync('/bin/cp', ['-cR', source, target], { encoding: 'utf8' });
  if (result.status === 0) return;
  fs.cpSync(source, target, { recursive: true, dereference: false });
}

export function copyDependencyTrees(source, target) {
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

function verifyStaticInputs({ manifest, candidateTarball, grokBinary }) {
  if (process.version !== manifest.toolchain.nodeVersion) {
    throw new Error(`runner Node ${process.version} does not match ${manifest.toolchain.nodeVersion}`);
  }
  if (sha256File(candidateTarball) !== manifest.candidate.tarballSha256) throw new Error('candidate tarball digest drifted');
  if (path.resolve(grokBinary) !== path.resolve(manifest.agent.binary)) throw new Error('Grok binary path drifted');
  if (sha256File(grokBinary) !== manifest.agent.binarySha256) throw new Error('Grok binary digest drifted');
  if (
    process.platform !== manifest.toolchain.os.platform
    || process.arch !== manifest.toolchain.os.arch
    || os.release() !== manifest.toolchain.os.release
  ) {
    throw new Error('runner OS identity does not match the frozen manifest');
  }
  const grokVersion = run([grokBinary, '--version']).stdout.trim();
  if (!grokVersion.includes(`grok ${manifest.agent.cliVersion}`)) throw new Error('Grok CLI version drifted');
  if (sha256File(path.join(ROOT, 'eval/causal/grok-config.v1.toml')) !== manifest.agent.configSha256) {
    throw new Error('isolated Grok config drifted');
  }
  if (graderBundleSha256(ROOT) !== manifest.grader.sha256) throw new Error('grader bundle drifted');
  const hostEntrypoint = path.join(ROOT, manifest.grader.typeScriptHost.entrypoint);
  const hostPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/typescript-ark-host/package.json'), 'utf8'));
  if (hostPackage.version !== manifest.grader.typeScriptHost.version || sha256File(hostEntrypoint) !== manifest.grader.typeScriptHost.sha256) {
    throw new Error('TypeScript grader host drifted');
  }
  run(['git', 'cat-file', '-e', `${manifest.candidate.sourceSha}^{commit}`], { cwd: ROOT });
}

function verifySourceCache(manifest, sourceCache) {
  const prequalificationRoot = path.join(sourceCache, '.z08-prequalification');
  const prequalification = JSON.parse(fs.readFileSync(path.join(sourceCache, 'prequalification.json'), 'utf8'));
  if (
    prequalification.candidateTarballSha256 !== manifest.candidate.tarballSha256
    || prequalification.graderSha256 !== manifest.grader.sha256
    || prequalification.tasks.length !== manifest.tasks.length
  ) {
    throw new Error('source prequalification does not match the frozen candidate and grader');
  }
  for (const task of manifest.tasks) {
    const evidence = prequalification.tasks.find((entry) => entry.taskId === task.id);
    const report = path.join(prequalificationRoot, task.id, 'grader-report.json');
    if (!evidence || evidence.graderReportSha256 !== sha256File(report)) {
      throw new Error(`${task.id} prequalification evidence drifted`);
    }
  }
  for (const repository of manifest.repositories) {
    const root = path.join(sourceCache, repository.id);
    const head = run(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.trim();
    const tree = run(['git', 'rev-parse', 'HEAD^{tree}'], { cwd: root }).stdout.trim();
    if (head !== repository.sha || tree !== repository.treeSha) throw new Error(`${repository.id} source identity drifted`);
    const lockfile = repository.lockfile.synthetic
      ? path.join(ROOT, 'eval/causal/locks/yocto-queue.package-lock.json')
      : path.join(root, repository.lockfile.path);
    if (sha256File(lockfile) !== repository.lockfile.sha256) throw new Error(`${repository.id} lockfile drifted`);
    if (!fs.existsSync(path.join(root, 'node_modules'))) throw new Error(`${repository.id} has no prequalified node_modules`);
    if (repository.commonPatch && sha256File(path.join(ROOT, repository.commonPatch.path)) !== repository.commonPatch.sha256) {
      throw new Error(`${repository.id} common patch drifted`);
    }
  }
}

export function prepareGrokHome(out, authHome) {
  const identity = sha256(path.resolve(out)).slice(0, 24);
  const grokHome = path.join(os.tmpdir(), `ark-z08-grok-home-${identity}`);
  fs.mkdirSync(grokHome, { recursive: true, mode: 0o700 });
  const authTarget = path.join(grokHome, 'auth.json');
  fs.rmSync(authTarget, { force: true });
  fs.symlinkSync(path.resolve(authHome, 'auth.json'), authTarget);
  fs.copyFileSync(path.join(ROOT, 'eval/causal/grok-config.v1.toml'), path.join(grokHome, 'config.toml'));
  return grokHome;
}

function prepareWorkspace({ manifest, repository, task, runCell, sourceCache, candidateRoot, candidateTarball, cellDir }) {
  const workspace = path.join(cellDir, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const archive = path.join(cellDir, 'source.tar');
  run(['git', '-C', path.join(sourceCache, repository.id), 'archive', '--format=tar', repository.sha, '-o', archive]);
  run(['tar', '-xf', archive, '-C', workspace]);
  fs.rmSync(archive, { force: true });

  if (repository.lockfile.synthetic) {
    fs.copyFileSync(path.join(ROOT, 'eval/causal/locks/yocto-queue.package-lock.json'), path.join(workspace, repository.lockfile.path));
  }
  if (repository.commonPatch) run(['git', 'apply', path.join(ROOT, repository.commonPatch.path)], { cwd: workspace });
  copyDependencyTrees(path.join(sourceCache, repository.id), workspace);
  if (repository.id === 'nestjs-hexagonal-auth') {
    copyClone(path.join(sourceCache, repository.id, 'generated', 'prisma'), path.join(workspace, 'generated', 'prisma'));
  }
  writeTaskFiles(workspace, task, 'fixture');

  let interventionBeforeSha256 = null;
  let interventionAfterSha256 = null;
  if (runCell.arm === 'treatment') {
    interventionBeforeSha256 = snapshotTree(workspace).sha256;
    const runtime = path.join(workspace, '.arkgate-candidate');
    copyClone(candidateRoot, runtime);
    fs.writeFileSync(path.join(workspace, 'ark.config.json'), `${JSON.stringify(architectureConfig(task), null, 2)}\n`);
    for (const setupCommand of manifest.arms.treatment.setupCommands) {
      if (setupCommand.length === 1 && setupCommand[0] === 'z08-bind-candidate-runtime') {
        bindCandidateIntervention({ workspace, cellDir });
        continue;
      }
      const executable = setupCommand[0] === 'node' ? process.execPath : setupCommand[0];
      run([executable, ...setupCommand.slice(1)], { cwd: workspace });
    }
    interventionAfterSha256 = snapshotTree(workspace).sha256;
  }

  initializeGit(workspace);
  const beforeSnapshot = snapshotTree(workspace);
  return { workspace, beforeSnapshot, interventionBeforeSha256, interventionAfterSha256, candidateTarball };
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function bindCandidateIntervention({ workspace, cellDir }) {
  const candidate = '.arkgate-candidate/bin/ark-mcp.mjs';
  const config = [
    '# Z08 exact-candidate binding; generated intervention metadata remains protected.',
    '[mcp_servers.ark]',
    'command = "node"',
    `args = [${['.arkgate-candidate/bin/ark-mcp.mjs', '--root', '.', '--config', 'ark.config.json'].map((item) => JSON.stringify(item)).join(', ')}]`,
    '',
  ].join('\n');
  fs.mkdirSync(path.join(workspace, '.grok'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.grok', 'config.toml'), config);

  const audit = path.join(cellDir, 'hook-audit.jsonl');
  const pinnedHarness = path.join(cellDir, 'pinned-hook');
  fs.mkdirSync(pinnedHarness, { recursive: true });
  for (const file of ['hook-audit.mjs', 'fs-evidence.mjs']) {
    fs.copyFileSync(path.join(ROOT, 'eval/causal', file), path.join(pinnedHarness, file));
  }
  const rootExpression = '"${GROK_WORKSPACE_ROOT:-.}"';
  const sessionCommand = `node ${candidate} --session-context --root ${rootExpression} --config ark.config.json`;
  const hookCommand = [
    'node',
    shellQuote(path.join(pinnedHarness, 'hook-audit.mjs')),
    '--log',
    shellQuote(audit),
    '--replay-check',
    shellQuote('.arkgate-candidate/bin/ark-check.mjs'),
    '--replay-config',
    shellQuote('ark.config.json'),
    '--',
    'node',
    candidate,
    '--hook',
    '--hook-repair',
    '--root',
    rootExpression,
    '--config',
    'ark.config.json',
  ].join(' ');
  const hooks = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', timeout: 30, command: sessionCommand }] }],
      PreToolUse: [{ matcher: 'Write|Edit|MultiEdit|write|search_replace', hooks: [{ type: 'command', timeout: 30, command: hookCommand }] }],
    },
  };
  fs.mkdirSync(path.join(workspace, '.grok', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.grok', 'hooks', 'ark-write-gate.json'), `${JSON.stringify(hooks, null, 2)}\n`);

  const agentsPath = path.join(workspace, 'AGENTS.md');
  fs.appendFileSync(agentsPath, [
    '',
    '## Z08 exact candidate',
    '',
    'This evaluation is bound to `.arkgate-candidate`; use `node .arkgate-candidate/bin/ark-check.mjs`',
    'for local checks. Do not use registry-resolved `npx arkgate*` commands.',
    '',
  ].join('\n'));
  const workflow = path.join(workspace, '.github', 'workflows', 'ark-check.yml');
  if (fs.existsSync(workflow)) {
    const source = fs.readFileSync(workflow, 'utf8');
    fs.writeFileSync(workflow, source.replace('npx ark-check --root . --config ark.config.json --strict-merge', 'node .arkgate-candidate/bin/ark-check.mjs --root . --config ark.config.json --strict-merge'));
  }
}

function initializeGit(workspace) {
  run(['git', 'init', '--quiet'], { cwd: workspace });
  const info = path.join(workspace, '.git', 'info', 'exclude');
  fs.appendFileSync(info, '\nnode_modules/\ndist/\ncoverage/\n.next/\n');
  run(['git', 'add', '--all'], { cwd: workspace });
  run([
    'git',
    '-c', 'user.name=ArkGate Z08',
    '-c', 'user.email=z08@invalid.example',
    'commit', '--quiet', '-m', 'z08 baseline',
  ], { cwd: workspace });
}

export function grokArgv(manifest, runCell, task, workspace) {
  const promptPath = path.join(workspace, '.git', 'z08-prompt.md');
  fs.writeFileSync(promptPath, task.prompt);
  const invocationFlags = manifest.agent.invocationFlags.flatMap((flag) => {
    const equals = flag.indexOf('=');
    return equals === -1 ? [flag] : [flag.slice(0, equals), flag.slice(equals + 1)];
  });
  return [
    manifest.agent.binary,
    '--prompt-file', promptPath,
    '--session-id', runCell.sessionUuid,
    '--cwd', workspace,
    '--model', manifest.agent.model,
    '--json-schema', FINAL_SCHEMA,
    ...invocationFlags,
  ];
}

async function runAgent({ argv, workspace, env, stdoutPath, stderrPath, timeoutMs }) {
  const stdout = fs.openSync(stdoutPath, 'w', 0o600);
  const stderr = fs.openSync(stderrPath, 'w', 0o600);
  const startedAtMs = Date.now();
  const child = spawn(argv[0], argv.slice(1), {
    cwd: workspace,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', stdout, stderr],
  });
  let timedOut = false;
  const terminate = () => {
    if (child.exitCode !== null) return;
    timedOut = true;
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch {}
    setTimeout(() => {
      if (child.exitCode !== null) return;
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, TERMINATION_GRACE_MS).unref();
  };
  const timer = setTimeout(terminate, timeoutMs);
  const result = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ status: null, signal: null, error: String(error.message ?? error) }));
    child.once('exit', (status, signal) => resolve({ status, signal, error: null }));
  });
  clearTimeout(timer);
  fs.closeSync(stdout);
  fs.closeSync(stderr);
  return { ...result, timedOut, startedAtMs, finishedAtMs: Date.now() };
}

function parseLastJson(source) {
  const trimmed = source.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {}
  const lines = trimmed.split(/\r?\n/).reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch {}
  }
  return null;
}

function normalizedUsage(output) {
  const usage = output?.usage;
  if (!usage) return null;
  const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
  const cacheReadInputTokens = Number(usage.cache_read_input_tokens ?? usage.cacheReadInputTokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
  const cost = output.total_cost_usd ?? output.totalCostUsd ?? null;
  const costIsPartial = Boolean(output.cost_is_partial ?? output.costIsPartial ?? cost === null);
  const usageIsIncomplete = Boolean(output.usage_is_incomplete ?? output.usageIsIncomplete ?? false);
  return {
    inputTokens,
    cacheReadInputTokens,
    outputTokens,
    totalTokens: inputTokens + cacheReadInputTokens + outputTokens,
    costUsd: costIsPartial || usageIsIncomplete || !Number.isFinite(Number(cost)) ? null : Number(cost),
    costIsPartial,
    usageIsIncomplete,
  };
}

export function terminalFromRun({ manifest, runCell, startedAtMs, agentResult, agentOutput, grading, cellDir, intervention, beforeSnapshot }) {
  const actualFinishedAtMs = Date.now();
  const actualElapsedMs = actualFinishedAtMs - startedAtMs;
  const withinCap = actualElapsedMs <= manifest.design.tauMs;
  const commonGreen = grading.report.passed;
  const rawTurns = Number(agentOutput?.num_turns ?? agentOutput?.numTurns ?? 0);
  const validTurns = Number.isInteger(rawTurns) && rawTurns >= 0 ? rawTurns : 0;
  const exceededTurnCap = validTurns > manifest.design.maxTurns;
  const firstValid = commonGreen && withinCap && !exceededTurnCap;
  const observedElapsedMs = Math.min(actualElapsedMs, manifest.design.tauMs);
  const transcript = {
    schemaVersion: 1,
    argv: agentResult.argv,
    result: agentResult.result,
    actualStartedAtMs: startedAtMs,
    actualFinishedAtMs,
    actualElapsedMs,
    stdout: fs.readFileSync(agentResult.stdoutPath, 'utf8'),
    stderr: fs.readFileSync(agentResult.stderrPath, 'utf8'),
    hookAuditSha256: fs.existsSync(path.join(cellDir, 'hook-audit.jsonl'))
      ? sha256File(path.join(cellDir, 'hook-audit.jsonl'))
      : null,
  };
  const transcriptPath = path.join(cellDir, 'transcript.json');
  writeJsonAtomic(transcriptPath, transcript);
  const hookClassification = classifyHookAudit(path.join(cellDir, 'hook-audit.jsonl'));
  const manualDecisions = hookClassification.unclassifiedBlocks === 0
    ? []
    : [`${hookClassification.unclassifiedBlocks} hook block(s) could not be replay-classified.`];
  grading.report.classifications.falseBlocks = hookClassification.falseBlocks;
  grading.report.classifications.hookBlocks = hookClassification;
  grading.report.classifications.manualDecisions = manualDecisions;
  writeJsonAtomic(grading.reportPath, grading.report);
  const firstFailure = ['integrity', 'architecture', 'typecheck', 'tests'].find((stage) => grading.report.stages[stage].status !== 'pass');
  const censorReason = firstValid
    ? null
    : exceededTurnCap
      ? 'turn_cap_exceeded'
      : agentResult.result.timedOut || !withinCap
      ? 'cap_reached'
      : agentResult.result.status !== 0
        ? `agent_exit_${agentResult.result.status ?? 'error'}`
        : `grader_${firstFailure ?? 'unknown'}`;
  const stageStatuses = Object.fromEntries(['integrity', 'architecture', 'typecheck', 'tests'].map((stage) => [stage, grading.report.stages[stage].status]));
  const finalCiState = commonGreen
    ? 'green'
    : Object.values(stageStatuses).some((status) => status === 'not_run')
      ? 'not_run'
      : 'red';
  return {
    outcome: firstValid ? 'first_valid' : 'censored',
    firstValidMs: firstValid ? observedElapsedMs : null,
    censoredAtMs: firstValid ? null : manifest.design.tauMs,
    observedElapsedMs,
    restrictedTimeMs: firstValid ? observedElapsedMs : manifest.design.tauMs,
    startedAtMs,
    finishedAtMs: startedAtMs + observedElapsedMs,
    censorReason,
    mergeGateCompleted: commonGreen,
    finalCiState,
    grader: stageStatuses,
    turns: Math.min(validTurns, manifest.design.maxTurns),
    usage: normalizedUsage(agentOutput),
    escapes: grading.report.classifications.escapes,
    falseBlocks: grading.report.classifications.falseBlocks,
    bypasses: grading.report.classifications.bypasses,
    manualDecisions,
    transcriptSha256: sha256File(transcriptPath),
    graderReportSha256: sha256File(grading.reportPath),
    sourceTreeBeforeSha256: beforeSnapshot.sha256,
    sourceTreeAfterSha256: grading.afterSnapshot.sha256,
    interventionBeforeSha256: intervention.before,
    interventionAfterSha256: intervention.after,
  };
}

export function loadLedger(target) {
  if (!fs.existsSync(target)) return [];
  const source = fs.readFileSync(target, 'utf8');
  if (source.length === 0) return [];
  if (!source.endsWith('\n')) throw new Error('ledger has a torn final line');
  return source.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function validatePartialLedger(manifest, entries) {
  if (entries.length > manifest.runs.length + 1) throw new Error('ledger contains evidence beyond the preregistered cells and mutation proof');
  let previousHash = LEDGER_GENESIS_HASH;
  entries.forEach((entry, index) => {
    if (entry.sequence !== index + 1 || entry.previousHash !== previousHash || entry.entryHash !== computeLedgerEntryHash(entry)) {
      throw new Error(`partial ledger breaks at sequence ${index + 1}`);
    }
    if (index === manifest.runs.length) {
      if (entry.kind !== 'mutation_terminal') throw new Error('the only post-cell evidence must be mutation proof');
      previousHash = entry.entryHash;
      return;
    }
    const expected = manifest.runs[index];
    if (
      entry.kind !== 'cell_terminal'
      || entry.manifestSha256 !== freezeManifest(manifest).sha256
      || entry.cellId !== expected.cellId
      || entry.sessionUuid !== expected.sessionUuid
      || entry.cellFingerprint !== cellFingerprint(manifest, expected.cellId)
    ) {
      throw new Error(`partial ledger cell identity breaks at sequence ${index + 1}`);
    }
    validateTerminalForRun(manifest, expected.cellId, entry.terminal);
    previousHash = entry.entryHash;
  });
  return previousHash;
}

function appendCellTerminal({ manifest, ledgerPath, entries, runCell, terminal }) {
  validateTerminalForRun(manifest, runCell.cellId, terminal);
  const previousHash = entries.at(-1)?.entryHash ?? LEDGER_GENESIS_HASH;
  const entry = sealLedgerEntry({
    schemaVersion: 1,
    sequence: entries.length + 1,
    manifestSha256: freezeManifest(manifest).sha256,
    kind: 'cell_terminal',
    cellId: runCell.cellId,
    sessionUuid: runCell.sessionUuid,
    cellFingerprint: cellFingerprint(manifest, runCell.cellId),
    terminal,
  }, previousHash);
  appendJsonLineDurable(ledgerPath, entry);
  entries.push(entry);
}

function mutationGroups(manifest, report) {
  const entries = Object.entries(report.files ?? {}).flatMap(([file, value]) =>
    (value.mutants ?? []).map((mutant) => ({ file: file.replaceAll('\\', '/').replace(/^\.\//, ''), mutant }))
  );
  return manifest.mutation.ranges.map((range) => {
    const relevant = entries.filter(({ file, mutant }) => {
      const line = mutant.location?.start?.line;
      return mutant.status !== 'Ignored' && file === range.file && Number.isInteger(line) && line >= range.startLine && line <= range.endLine;
    });
    const count = (status) => relevant.filter((entry) => entry.mutant.status === status).length;
    const known = ['Killed', 'Survived', 'Timeout', 'NoCoverage'];
    return {
      id: range.id,
      file: range.file,
      startLine: range.startLine,
      endLine: range.endLine,
      totalMutants: relevant.length,
      statuses: {
        killed: count('Killed'),
        survived: count('Survived'),
        timedOut: count('Timeout'),
        noCoverage: count('NoCoverage'),
        other: relevant.filter((entry) => !known.includes(entry.mutant.status)).length,
      },
    };
  });
}

export function verifyMutationAttestation({ manifest, mutationReportPath, mutationAttestationPath }) {
  const attestation = JSON.parse(fs.readFileSync(mutationAttestationPath, 'utf8'));
  const expectedKeys = [
    'candidateSourceSha',
    'candidateTarballSha256',
    'configSha256',
    'reportSha256',
    'runner',
    'schemaVersion',
    'sourceFiles',
  ];
  if (JSON.stringify(Object.keys(attestation).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('mutation attestation has an unexpected shape');
  }
  const expectedSources = manifest.mutation.ranges.map(({ file, sourceSha256 }) => ({ file, sha256: sourceSha256 }));
  if (
    attestation.schemaVersion !== 1
    || attestation.candidateSourceSha !== manifest.candidate.sourceSha
    || attestation.candidateTarballSha256 !== manifest.candidate.tarballSha256
    || attestation.configSha256 !== manifest.mutation.configSha256
    || attestation.reportSha256 !== sha256File(mutationReportPath)
    || attestation.runner !== manifest.mutation.runner
    || JSON.stringify(attestation.sourceFiles) !== JSON.stringify(expectedSources)
  ) {
    throw new Error('mutation attestation does not match the frozen candidate and report');
  }
  return Object.freeze(attestation);
}

function appendMutation({ manifest, ledgerPath, entries, mutationReportPath }) {
  const report = JSON.parse(fs.readFileSync(mutationReportPath, 'utf8'));
  const previousHash = entries.at(-1)?.entryHash ?? LEDGER_GENESIS_HASH;
  const entry = sealLedgerEntry({
    schemaVersion: 1,
    sequence: entries.length + 1,
    manifestSha256: freezeManifest(manifest).sha256,
    kind: 'mutation_terminal',
    mutationFingerprint: mutationFingerprint(manifest),
    reportSha256: sha256File(mutationReportPath),
    groups: mutationGroups(manifest, report),
  }, previousHash);
  appendJsonLineDurable(ledgerPath, entry);
  entries.push(entry);
}

export function recoverInterrupted({
  manifest,
  ledgerPath,
  entries,
  runCell,
  cellDir,
  repository,
  task,
  candidateRoot,
  architectureConfigPath,
  env,
}) {
  const markerPath = path.join(cellDir, 'run-started.json');
  if (!fs.existsSync(markerPath)) return false;
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  const workspace = marker.workspace;
  const terminalPath = path.join(cellDir, 'terminal.json');
  if (fs.existsSync(terminalPath)) {
    const terminal = JSON.parse(fs.readFileSync(terminalPath, 'utf8'));
    validateTerminalForRun(manifest, runCell.cellId, terminal);
    if (
      terminal.transcriptSha256 !== sha256File(path.join(cellDir, 'transcript.json'))
      || terminal.graderReportSha256 !== sha256File(path.join(cellDir, 'grader-report.json'))
      || terminal.sourceTreeBeforeSha256 !== marker.sourceTreeBeforeSha256
    ) {
      throw new Error(`${runCell.cellId} durable terminal evidence drifted before resume`);
    }
    appendCellTerminal({ manifest, ledgerPath, entries, runCell, terminal });
    return true;
  }

  const agentResultPath = path.join(cellDir, 'agent-result.json');
  const beforeSnapshotPath = path.join(cellDir, 'before-snapshot.json');
  if (fs.existsSync(agentResultPath) && fs.existsSync(beforeSnapshotPath) && fs.existsSync(workspace)) {
    const agentResult = JSON.parse(fs.readFileSync(agentResultPath, 'utf8'));
    const beforeSnapshot = JSON.parse(fs.readFileSync(beforeSnapshotPath, 'utf8'));
    const grading = gradeWorkspace({
      workspace,
      task,
      repository,
      candidateRoot,
      harnessRoot: ROOT,
      evidenceDir: cellDir,
      architectureConfigPath,
      beforeSnapshot,
      env,
    });
    const stdoutPath = path.join(cellDir, 'grok.stdout');
    const stderrPath = path.join(cellDir, 'grok.stderr');
    const output = parseLastJson(fs.readFileSync(stdoutPath, 'utf8'));
    const terminal = terminalFromRun({
      manifest,
      runCell,
      startedAtMs: marker.startedAtMs,
      agentResult: { argv: agentResult.argv, result: agentResult.result, stdoutPath, stderrPath },
      agentOutput: output,
      grading,
      cellDir,
      intervention: { before: marker.interventionBeforeSha256, after: marker.interventionAfterSha256 },
      beforeSnapshot,
    });
    writeJsonAtomic(terminalPath, terminal);
    appendCellTerminal({ manifest, ledgerPath, entries, runCell, terminal });
    return true;
  }

  const after = fs.existsSync(workspace) ? snapshotTree(workspace) : { sha256: sha256('missing-workspace') };
  const observedElapsedMs = Math.min(manifest.design.tauMs, Math.max(0, Date.now() - marker.startedAtMs));
  const transcriptPath = path.join(cellDir, 'transcript.json');
  writeJsonAtomic(transcriptPath, { schemaVersion: 1, recovered: true, reason: 'interrupted' });
  const reportPath = path.join(cellDir, 'grader-report.json');
  writeJsonAtomic(reportPath, {
    schemaVersion: 1,
    graderId: manifest.grader.id,
    taskId: runCell.taskId,
    repositoryId: runCell.repositoryId,
    passed: false,
    stages: Object.fromEntries(['integrity', 'architecture', 'typecheck', 'tests'].map((stage) => [stage, { status: 'not_run', reason: 'interrupted', commands: [] }])),
    classifications: {
      escapes: 0,
      falseBlocks: 0,
      hookBlocks: { blocks: 0, trueBlocks: 0, falseBlocks: 0, unclassifiedBlocks: 0 },
      bypasses: 0,
      manualDecisions: ['Run recovered from durable start marker without durable agent output.'],
    },
  });
  appendCellTerminal({
    manifest,
    ledgerPath,
    entries,
    runCell,
    terminal: {
      outcome: 'censored',
      firstValidMs: null,
      censoredAtMs: manifest.design.tauMs,
      observedElapsedMs,
      restrictedTimeMs: manifest.design.tauMs,
      startedAtMs: marker.startedAtMs,
      finishedAtMs: marker.startedAtMs + observedElapsedMs,
      censorReason: 'interrupted',
      mergeGateCompleted: false,
      finalCiState: 'not_run',
      grader: { integrity: 'not_run', architecture: 'not_run', typecheck: 'not_run', tests: 'not_run' },
      turns: 0,
      usage: null,
      escapes: 0,
      falseBlocks: 0,
      bypasses: 0,
      manualDecisions: ['Run recovered from durable start marker without durable agent output.'],
      transcriptSha256: sha256File(transcriptPath),
      graderReportSha256: sha256File(reportPath),
      sourceTreeBeforeSha256: marker.sourceTreeBeforeSha256,
      sourceTreeAfterSha256: after.sha256,
      interventionBeforeSha256: marker.interventionBeforeSha256,
      interventionAfterSha256: marker.interventionAfterSha256,
    },
  });
  return true;
}

async function main() {
  const argv = process.argv.slice(2);
  const cellLimit = maxNewCells(argv);
  const manifestPath = required(argv, '--manifest');
  const sourceCache = required(argv, '--source-cache');
  const candidateTarball = required(argv, '--candidate-tarball');
  const mutationReportPath = required(argv, '--mutation-report');
  const mutationAttestationPath = required(argv, '--mutation-attestation');
  const out = required(argv, '--out');
  const authHome = required(argv, '--auth-home');
  const grokBinary = required(argv, '--grok-binary');
  const manifest = freezeManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).manifest;
  fs.mkdirSync(out, { recursive: true });
  verifyStaticInputs({ manifest, candidateTarball, grokBinary });
  verifySourceCache(manifest, sourceCache);
  const candidateRoot = extractCandidatePackage({
    tarball: candidateTarball,
    target: path.join(out, 'state', 'candidate'),
    typeScriptHostSource: path.join(ROOT, 'node_modules', 'typescript-ark-host'),
  });
  const candidateHost = path.join(candidateRoot, manifest.grader.typeScriptHost.entrypoint);
  if (sha256File(candidateHost) !== manifest.grader.typeScriptHost.sha256) throw new Error('extracted TypeScript grader host drifted');
  const grokHome = prepareGrokHome(out, authHome);
  const ledgerPath = path.join(out, 'ledger.jsonl');
  const entries = loadLedger(ledgerPath);
  validatePartialLedger(manifest, entries);
  const initialCellCount = entries.filter((entry) => entry.kind === 'cell_terminal').length;
  if (entries.some((entry) => entry.kind === 'mutation_terminal')) {
    const evidence = verifyLedger({ manifest, entries });
    const report = analyzeExperiment({ manifest, ledgerEntries: entries });
    writeJsonAtomic(path.join(out, 'report.json'), report);
    console.log(JSON.stringify({ complete: true, terminalHash: evidence.terminalHash }));
    return;
  }

  for (let index = entries.length; index < manifest.runs.length; index += 1) {
    const runCell = manifest.runs[index];
    const task = manifest.tasks.find((candidate) => candidate.id === runCell.taskId);
    const repository = manifest.repositories.find((candidate) => candidate.id === runCell.repositoryId);
    const cellDir = path.join(out, 'cells', `${String(runCell.order).padStart(3, '0')}-${runCell.cellId}`);
    fs.mkdirSync(cellDir, { recursive: true });
    const architectureConfigPath = path.join(cellDir, 'ark.config.hidden.json');
    const taskPath = path.join(cellDir, 'task.json');
    const gradingEnvironment = { ...process.env, TZ: 'UTC', LANG: 'C.UTF-8', NO_COLOR: '1' };
    if (recoverInterrupted({
      manifest,
      ledgerPath,
      entries,
      runCell,
      cellDir,
      repository,
      task,
      candidateRoot,
      architectureConfigPath,
      env: gradingEnvironment,
    })) {
      const completedNow = entries.filter((entry) => entry.kind === 'cell_terminal').length - initialCellCount;
      if (completedNow >= cellLimit) {
        console.log(JSON.stringify({ complete: false, cellsCompleted: entries.length, stoppedAfterNewCells: completedNow }));
        return;
      }
      continue;
    }

    const prepared = prepareWorkspace({ manifest, repository, task, runCell, sourceCache, candidateRoot, candidateTarball, cellDir });
    writeJsonAtomic(architectureConfigPath, architectureConfig(task));
    writeJsonAtomic(taskPath, task);
    const startedAtMs = Date.now();
    writeJsonAtomic(path.join(cellDir, 'before-snapshot.json'), prepared.beforeSnapshot);
    writeJsonAtomic(path.join(cellDir, 'run-started.json'), {
      schemaVersion: 1,
      cellId: runCell.cellId,
      startedAtMs,
      workspace: prepared.workspace,
      sourceTreeBeforeSha256: prepared.beforeSnapshot.sha256,
      interventionBeforeSha256: prepared.interventionBeforeSha256,
      interventionAfterSha256: prepared.interventionAfterSha256,
    });

    const agentArgv = grokArgv(manifest, runCell, task, prepared.workspace);
    const stdoutPath = path.join(cellDir, 'grok.stdout');
    const stderrPath = path.join(cellDir, 'grok.stderr');
    const agentEnvironment = {
      ...process.env,
      ...manifest.agent.environment,
      HOME: grokHome,
      GROK_HOME: grokHome,
      PATH: process.env.PATH,
    };
    const result = await runAgent({
      argv: agentArgv,
      workspace: prepared.workspace,
      env: agentEnvironment,
      stdoutPath,
      stderrPath,
      timeoutMs: manifest.design.tauMs - GRADING_RESERVE_MS - TERMINATION_GRACE_MS,
    });
    writeJsonAtomic(path.join(cellDir, 'agent-result.json'), { argv: agentArgv, result });
    const grading = gradeWorkspace({
      workspace: prepared.workspace,
      task,
      repository,
      candidateRoot,
      harnessRoot: ROOT,
      evidenceDir: cellDir,
      architectureConfigPath,
      beforeSnapshot: prepared.beforeSnapshot,
      env: gradingEnvironment,
      deadlineMs: startedAtMs + manifest.design.tauMs,
    });
    const output = parseLastJson(fs.readFileSync(stdoutPath, 'utf8'));
    const terminal = terminalFromRun({
      manifest,
      runCell,
      startedAtMs,
      agentResult: { argv: agentArgv, result, stdoutPath, stderrPath },
      agentOutput: output,
      grading,
      cellDir,
      intervention: { before: prepared.interventionBeforeSha256, after: prepared.interventionAfterSha256 },
      beforeSnapshot: prepared.beforeSnapshot,
    });
    writeJsonAtomic(path.join(cellDir, 'terminal.json'), terminal);
    appendCellTerminal({ manifest, ledgerPath, entries, runCell, terminal });
    console.log(JSON.stringify({ sequence: entries.length, cellId: runCell.cellId, outcome: terminal.outcome, observedElapsedMs: terminal.observedElapsedMs }));
    const completedNow = entries.filter((entry) => entry.kind === 'cell_terminal').length - initialCellCount;
    if (completedNow >= cellLimit) {
      console.log(JSON.stringify({ complete: false, cellsCompleted: entries.length, stoppedAfterNewCells: completedNow }));
      return;
    }
  }

  verifyMutationAttestation({ manifest, mutationReportPath, mutationAttestationPath });
  appendMutation({ manifest, ledgerPath, entries, mutationReportPath });
  const evidence = verifyLedger({ manifest, entries });
  const report = analyzeExperiment({ manifest, ledgerEntries: entries });
  writeJsonAtomic(path.join(out, 'report.json'), report);
  console.log(JSON.stringify({ complete: true, terminalHash: evidence.terminalHash, acceptance: report.acceptance }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
