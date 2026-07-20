#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  freezeManifest,
  orderRunsDeterministically,
  sha256Canonical,
} from './contract.mjs';
import { graderBundleSha256 } from './grader.mjs';
import {
  architectureConfig,
  materializedTaskFiles,
} from './task-materialize.mjs';
import { sha256, sha256File, stableJson, writeJsonAtomic } from './fs-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REQUIRED_MUTATION_GROUPS = [
  'analysis-completeness',
  'resolved-candidate-facts',
  'managed-upgrade',
  'snapshot-invalidation',
];

function value(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function required(argv, flag) {
  const result = value(argv, flag);
  if (!result) throw new Error(`${flag} is required`);
  return result;
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
}

function taskAcceptanceSha256() {
  return sha256(stableJson({
    acceptTask: fs.readFileSync(path.join(ROOT, 'eval/causal/accept-task.mjs'), 'utf8'),
    taskMaterialize: fs.readFileSync(path.join(ROOT, 'eval/causal/task-materialize.mjs'), 'utf8'),
  }));
}

function validateCatalogArtifacts(sourceCatalog) {
  for (const repository of sourceCatalog.repositories) {
    if (repository.commonPatch) {
      const target = path.join(ROOT, repository.commonPatch.path);
      if (sha256File(target) !== repository.commonPatch.sha256) throw new Error(`${repository.id} common patch drifted`);
    }
    if (repository.lockfile.synthetic) {
      const target = path.join(ROOT, repository.lockfile.artifact);
      if (sha256File(target) !== repository.lockfile.sha256) throw new Error(`${repository.id} synthetic lockfile drifted`);
    }
  }
}

function buildTasks(sourceCatalog, taskCatalog) {
  const sourceIds = new Set(sourceCatalog.repositories.map((repository) => repository.id));
  const acceptanceSha256 = taskAcceptanceSha256();
  return taskCatalog.repositories.flatMap((repository) => {
    if (!sourceIds.has(repository.id)) throw new Error(`${repository.id} is absent from the source catalog`);
    if (repository.nouns.length !== taskCatalog.scenarios.length) throw new Error(`${repository.id} noun count drifted`);
    return taskCatalog.scenarios.map((scenario, index) => {
      const task = {
        id: `${repository.id}-${scenario}`,
        repositoryId: repository.id,
        scenario,
        noun: repository.nouns[index],
      };
      const prompt = fs.readFileSync(path.join(ROOT, `eval/causal/prompts/${task.id}.md`), 'utf8');
      return {
        ...task,
        prompt,
        promptSha256: sha256(prompt),
        fixtureSha256: sha256Canonical(materializedTaskFiles(task, 'fixture')),
        oracleSha256: sha256Canonical(materializedTaskFiles(task, 'oracle')),
        architectureConfigSha256: sha256Canonical(architectureConfig(task)),
        acceptanceSha256,
      };
    });
  });
}

function buildRuns(tasks, design) {
  const unordered = tasks.flatMap((task) =>
    Array.from({ length: design.sessionsPerArm }, (_, replicateIndex) =>
      ['control', 'treatment'].map((arm) => {
        const replicate = replicateIndex + 1;
        return {
          cellId: `${task.id}-r${replicate}-${arm}`,
          pairId: `${task.id}-r${replicate}`,
          repositoryId: task.repositoryId,
          taskId: task.id,
          replicate,
          arm,
          sessionUuid: randomUUID(),
          order: 0,
          workspaceId: `${task.id}-r${replicate}-${arm}`,
        };
      })
    ).flat()
  );
  return orderRunsDeterministically(unordered, design.orderSeed).map((run, index) => ({ ...run, order: index + 1 }));
}

function sourceAtCommit(sourceSha, file) {
  const result = spawnSync('git', ['show', `${sourceSha}:${file}`], {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`cannot read ${file} from candidate ${sourceSha}: ${result.stderr || result.error}`);
  }
  return result.stdout;
}

function buildMutation(sourceSha) {
  const contract = readJson('eval/mutation/critical-groups.v1.json');
  const ranges = REQUIRED_MUTATION_GROUPS.map((id) => {
    const group = contract.groups.find((candidate) => candidate.id === id);
    if (!group || group.targets.length !== 1) throw new Error(`mutation group ${id} is not one pinned range`);
    const target = group.targets[0];
    return { id, ...target, sourceSha256: sha256(sourceAtCommit(sourceSha, target.file)) };
  });
  return {
    runner: 'stryker@9.6.1',
    configSha256: sha256File(path.join(ROOT, 'stryker.config.mjs')),
    ranges,
  };
}

export function generateManifest(argv = process.argv.slice(2)) {
  const sourceCatalog = readJson('eval/causal/source-catalog.v1.json');
  const taskCatalog = readJson('eval/causal/task-catalog.v1.json');
  validateCatalogArtifacts(sourceCatalog);
  const maxTurns = 8;
  const design = {
    tauMs: 240_000,
    maxTurns,
    sessionsPerArm: 3,
    bootstrapReplicates: 50_000,
    bootstrapSeed: 'z08-hierarchical-bootstrap-v1',
    orderSeed: 'z08-serial-order-v1',
    confidenceLevel: 0.95,
    primaryMaxRatio: 0.8,
    primaryUpperBoundExclusive: 1,
    maxCompletionRegression: 0.05,
    percentiles: [0.5, 0.75, 0.95],
    exclusions: [
      { id: 'typescript-only', rationale: 'This causal evaluation is explicitly scoped to pinned TypeScript repositories.' },
      { id: 'controlled-microfeatures', rationale: 'Tasks are held-out controlled microfeatures under z08-task; results do not claim broad feature-delivery performance.' },
      { id: 'single-candidate', rationale: 'Each independent session produces one final candidate; failed final candidates remain censored.' },
    ],
  };
  const tasks = buildTasks(sourceCatalog, taskCatalog);
  const grokBinary = path.resolve(required(argv, '--grok-binary'));
  const typeScriptHostEntrypoint = 'node_modules/typescript-ark-host/lib/tsc.js';
  const typeScriptHostPackage = readJson('node_modules/typescript-ark-host/package.json');
  const candidateSourceSha = required(argv, '--candidate-source-sha');
  const manifest = {
    $schema: './manifest.schema.v1.json',
    schemaVersion: 1,
    experimentId: 'z08-grok-causal-v1',
    frozenAt: required(argv, '--frozen-at'),
    candidate: {
      sourceRepository: 'https://github.com/pedroknigge/arkgate.git',
      sourceSha: candidateSourceSha,
      tarballUrl: required(argv, '--tarball-url'),
      tarballSha256: required(argv, '--tarball-sha256'),
    },
    toolchain: {
      os: {
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
        image: 'macos-26.5-local-apple-silicon',
      },
      nodeVersion: process.version,
      packageManagers: [
        { name: 'npm', version: '10.9.2' },
        { name: 'pnpm', version: '7.33.7' },
        { name: 'pnpm', version: '10.12.1' },
      ],
      typescriptVersions: ['4.6.4', '4.9.5', '5.5.4', '5.7.3', '5.8.3', '5.9.2', '6.0.3'],
    },
    agent: {
      provider: 'xai',
      name: 'grok',
      binary: grokBinary,
      binarySha256: sha256File(grokBinary),
      cliVersion: '0.2.106',
      model: 'grok-4.5',
      configSha256: sha256File(path.join(ROOT, 'eval/causal/grok-config.v1.toml')),
      environment: {
        GROK_DISABLE_AUTOUPDATER: '1',
        HOME: '<isolated-grok-home>',
        GROK_HOME: '<isolated-grok-home>',
        LANG: 'C.UTF-8',
        NO_COLOR: '1',
        TZ: 'UTC',
      },
      invocationFlags: [
        '--always-approve',
        '--disable-web-search',
        '--disallowed-tools=Agent,web_search,web_fetch,search_tool,use_tool',
        `--max-turns=${maxTurns}`,
        '--no-memory',
        '--no-plan',
        '--no-subagents',
        '--output-format=json',
        '--reasoning-effort=high',
        '--sandbox=strict',
        '--verbatim',
      ],
      modelSeed: null,
    },
    grader: {
      id: 'z08-common-grader-v1',
      version: '1.0.0',
      sha256: graderBundleSha256(ROOT),
      typeScriptHost: {
        version: typeScriptHostPackage.version,
        entrypoint: typeScriptHostEntrypoint,
        sha256: sha256File(path.join(ROOT, typeScriptHostEntrypoint)),
      },
      stages: ['integrity', 'architecture', 'typecheck', 'tests'],
    },
    design,
    arms: {
      control: { arkgateEnabled: false, setupCommands: [] },
      treatment: {
        arkgateEnabled: true,
        setupCommands: [
          ['node', '.arkgate-candidate/bin/ark.mjs', 'start', '--root', '.', '--tools', 'grok', '--require-write-hook', 'grok', '--apply', '--json'],
          ['z08-bind-candidate-runtime'],
        ],
      },
    },
    repositories: sourceCatalog.repositories.map((repository) => ({
      ...repository,
      lockfile: {
        path: repository.lockfile.path,
        sha256: repository.lockfile.sha256,
        synthetic: repository.lockfile.synthetic,
      },
    })),
    tasks,
    runs: buildRuns(tasks, design),
    mutation: buildMutation(candidateSourceSha),
  };
  const frozen = freezeManifest(manifest);
  const output = path.resolve(required(argv, '--output'));
  writeJsonAtomic(output, frozen.manifest);
  return { output, sha256: frozen.sha256, runs: frozen.manifest.runs.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = generateManifest();
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
