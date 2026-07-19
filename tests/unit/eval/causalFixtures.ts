import { createHash } from 'node:crypto';
import {
  LEDGER_GENESIS_HASH,
  orderRunsDeterministically,
  sealLedgerEntry,
  sha256Canonical,
  validateAndFreezeManifest,
} from '../../../eval/causal/contract.mjs';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const pin = (character: string) => character.repeat(64);

export type TerminalFactory = (run: Record<string, unknown>, index: number) => Record<string, unknown>;

export function makeManifest() {
  const packageManagers = [
    { name: 'npm', version: '10.9.2' },
    { name: 'pnpm', version: '10.12.1' },
    { name: 'yarn', version: '4.9.2' },
  ];
  const typescriptVersions = ['4.6.4', '5.5.4', '5.9.2'];
  const repositories = Array.from({ length: 6 }, (_, index) => ({
    id: `repo-${index + 1}`,
    url: `https://example.test/repo-${index + 1}.git`,
    sha: `${index + 1}`.repeat(40),
    treeSha: (index + 7).toString(16).repeat(40),
    license: 'MIT',
    lockfile: {
      path: packageManagers[index % 3].name === 'yarn' ? 'yarn.lock' : packageManagers[index % 3].name === 'pnpm' ? 'pnpm-lock.yaml' : 'package-lock.json',
      sha256: pin(((index + 1) % 10).toString()),
      synthetic: index === 5,
    },
    packageManager: packageManagers[index % 3],
    typescriptVersion: typescriptVersions[index % 3],
    commands: {
      install: [packageManagers[index % 3].name, 'install', '--frozen'],
      typecheck: [packageManagers[index % 3].name, 'run', 'typecheck'],
      tests: [packageManagers[index % 3].name, 'test'],
    },
    commonPatch: index === 2 ? {
      path: 'eval/causal/patches/repo-3.patch',
      sha256: pin('a'),
      rationale: 'Pinned common baseline repair.',
    } : null,
  }));
  const tasks = repositories.flatMap((repository, repositoryIndex) =>
    Array.from({ length: 4 }, (_, taskIndex) => {
      const id = `${repository.id}-task-${taskIndex + 1}`;
      const prompt = `Implement held-out task ${taskIndex + 1} in repository ${repositoryIndex + 1}.`;
      return {
        id,
        repositoryId: repository.id,
        scenario: ['clock-boundary', 'repository-port', 'presentation-mapper', 'cycle-extraction'][taskIndex],
        noun: `Subject${repositoryIndex + 1}${taskIndex + 1}`,
        prompt,
        promptSha256: sha256(prompt),
        fixtureSha256: sha256(`fixture:${id}`),
        oracleSha256: sha256(`oracle:${id}`),
        architectureConfigSha256: sha256(`architecture:${id}`),
        acceptanceSha256: sha256(`acceptance:${id}`),
      };
    })
  );
  const unorderedRuns = tasks.flatMap((task, taskIndex) =>
    Array.from({ length: 3 }, (_, replicateIndex) =>
      ['control', 'treatment'].map((arm, armIndex) => {
        const ordinal = taskIndex * 6 + replicateIndex * 2 + armIndex + 1;
        return {
          cellId: `${task.id}-r${replicateIndex + 1}-${arm}`,
          pairId: `${task.id}-r${replicateIndex + 1}`,
          repositoryId: task.repositoryId,
          taskId: task.id,
          replicate: replicateIndex + 1,
          arm,
          sessionUuid: `00000000-0000-4000-8000-${ordinal.toString(16).padStart(12, '0')}`,
          order: 0,
          workspaceId: `workspace-${ordinal}`,
        };
      })
    ).flat()
  );
  const orderSeed = 'z08-order-fixture-v1';
  const runs = orderRunsDeterministically(unorderedRuns, orderSeed).map((run, index) => ({ ...run, order: index + 1 }));

  return {
    $schema: './manifest.schema.v1.json',
    schemaVersion: 1,
    experimentId: 'z08-fixture',
    frozenAt: '2026-07-19T12:00:00.000Z',
    candidate: {
      sourceRepository: 'https://example.test/arkgate.git',
      sourceSha: 'a'.repeat(40),
      tarballUrl: 'https://example.test/arkgate-3.8.0.tgz',
      tarballSha256: pin('b'),
    },
    toolchain: {
      os: { platform: 'linux', release: '6.11', arch: 'x64', image: 'ubuntu-24.04' },
      nodeVersion: 'v22.17.0',
      packageManagers,
      typescriptVersions,
    },
    agent: {
      provider: 'xai',
      name: 'grok',
      cliVersion: '0.2.106',
      model: 'grok-4.5',
      configSha256: pin('c'),
      invocationFlags: ['--always-approve', '--disable-web-search', '--no-memory', '--no-subagents'],
      modelSeed: null,
    },
    grader: {
      id: 'common-grader-v1',
      version: '1.0.0',
      sha256: pin('d'),
      stages: ['integrity', 'architecture', 'typecheck', 'tests'],
    },
    design: {
      tauMs: 10_000,
      maxTurns: 25,
      sessionsPerArm: 3,
      bootstrapReplicates: 50_000,
      bootstrapSeed: 'z08-bootstrap-fixture-v1',
      orderSeed,
      confidenceLevel: 0.95,
      primaryMaxRatio: 0.8,
      primaryUpperBoundExclusive: 1,
      maxCompletionRegression: 0.05,
      percentiles: [0.5, 0.75, 0.95],
      exclusions: [{ id: 'non-typescript', rationale: 'The experiment is scoped to TypeScript repositories.' }],
    },
    arms: {
      control: { arkgateEnabled: false, setupCommands: [] },
      treatment: { arkgateEnabled: true, setupCommands: [['node', '/candidate/bin/ark.mjs', 'start', '--apply']] },
    },
    repositories,
    tasks,
    runs,
    mutation: {
      runner: 'stryker@9.6.1',
      configSha256: pin('e'),
      ranges: [
        { id: 'analysis-completeness', file: 'bin/lib/analysis-completeness.mjs', startLine: 9, endLine: 27 },
        { id: 'resolved-candidate-facts', file: 'bin/lib/resolved-candidate-facts.mjs', startLine: 684, endLine: 728 },
        { id: 'managed-upgrade', file: 'bin/lib/managed-upgrade.mjs', startLine: 233, endLine: 255 },
        { id: 'snapshot-invalidation', file: 'bin/lib/resident-hook.mjs', startLine: 115, endLine: 162 },
      ],
    },
  };
}

export function firstValidTerminal(firstValidMs = 1_000) {
  return {
    outcome: 'first_valid',
    firstValidMs,
    censoredAtMs: null,
    observedElapsedMs: firstValidMs + 25,
    restrictedTimeMs: firstValidMs,
    censorReason: null,
    mergeGateCompleted: true,
    finalCiState: 'green',
    grader: { integrity: 'pass', architecture: 'pass', typecheck: 'pass', tests: 'pass' },
    turns: 3,
    usage: {
      inputTokens: 100,
      cacheReadInputTokens: 20,
      outputTokens: 30,
      totalTokens: 150,
      costUsd: null,
      costIsPartial: true,
      usageIsIncomplete: false,
    },
    escapes: 0,
    falseBlocks: 0,
    bypasses: 0,
    manualDecisions: [],
    transcriptSha256: pin('1'),
    graderReportSha256: pin('2'),
    sourceTreeBeforeSha256: pin('3'),
    sourceTreeAfterSha256: pin('4'),
    interventionBeforeSha256: null,
    interventionAfterSha256: null,
  };
}

export function censoredTerminal(tauMs = 10_000) {
  return {
    outcome: 'censored',
    firstValidMs: null,
    censoredAtMs: tauMs,
    observedElapsedMs: tauMs,
    restrictedTimeMs: tauMs,
    censorReason: 'cap_reached',
    mergeGateCompleted: false,
    finalCiState: 'red',
    grader: { integrity: 'pass', architecture: 'pass', typecheck: 'pass', tests: 'fail' },
    turns: 25,
    usage: null,
    escapes: 0,
    falseBlocks: 0,
    bypasses: 0,
    manualDecisions: [],
    transcriptSha256: pin('5'),
    graderReportSha256: pin('6'),
    sourceTreeBeforeSha256: pin('7'),
    sourceTreeAfterSha256: pin('8'),
    interventionBeforeSha256: null,
    interventionAfterSha256: null,
  };
}

export function makeLedger(
  inputManifest = makeManifest(),
  terminalFactory: TerminalFactory = () => firstValidTerminal()
) {
  const manifest = validateAndFreezeManifest(inputManifest);
  const manifestHash = sha256Canonical(manifest);
  const entries: Array<Record<string, unknown>> = [];
  let previousHash = LEDGER_GENESIS_HASH;
  for (const [index, run] of manifest.runs.entries()) {
    const payload = {
      schemaVersion: 1,
      sequence: index + 1,
      manifestSha256: manifestHash,
      kind: 'cell_terminal',
      cellId: run.cellId,
      sessionUuid: run.sessionUuid,
      cellFingerprint: sha256Canonical({ manifestSha256: manifestHash, run }),
      terminal: (() => {
        const terminal = terminalFactory(run, index);
        const startedAtMs = 1_800_000_000_000 + index * (manifest.design.tauMs + 100);
        return {
          ...terminal,
          interventionBeforeSha256: run.arm === 'treatment' ? pin('9') : null,
          interventionAfterSha256: run.arm === 'treatment' ? pin('a') : null,
          startedAtMs,
          finishedAtMs: startedAtMs + (terminal.observedElapsedMs as number),
        };
      })(),
    };
    const entry = sealLedgerEntry(payload, previousHash) as unknown as Record<string, unknown>;
    entries.push(entry);
    previousHash = entry.entryHash as string;
  }
  const mutationPayload = {
    schemaVersion: 1,
    sequence: manifest.runs.length + 1,
    manifestSha256: manifestHash,
    kind: 'mutation_terminal',
    mutationFingerprint: sha256Canonical({ manifestSha256: manifestHash, mutation: manifest.mutation }),
    reportSha256: pin('f'),
    groups: manifest.mutation.ranges.map((range) => ({
      ...range,
      totalMutants: 10,
      statuses: { killed: 9, survived: 1, timedOut: 0, noCoverage: 0, other: 0 },
    })),
  };
  entries.push(sealLedgerEntry(mutationPayload, previousHash) as unknown as Record<string, unknown>);
  return entries;
}

export function resealEntries(inputEntries: Array<Record<string, unknown>>) {
  const entries: Array<Record<string, unknown>> = [];
  let previousHash = LEDGER_GENESIS_HASH;
  for (const input of inputEntries) {
    const { previousHash: _previousHash, entryHash: _entryHash, ...payload } = input;
    const entry = sealLedgerEntry(payload, previousHash) as unknown as Record<string, unknown>;
    entries.push(entry);
    previousHash = entry.entryHash as string;
  }
  return entries;
}
