import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { githubWorkflow } from '../../../bin/lib/ci-and-commands.mjs';

const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const roots: string[] = [];

function writeJson(root: string, relativePath: string, value: unknown): void {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

function run(root: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [ARK_CHECK, '--root', root, '--json', '--no-cache', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function runHuman(root: string, args: string[]) {
  return spawnSync(process.execPath, [ARK_CHECK, '--root', root, '--no-cache', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function git(root: string, args: string[]): void {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'ArkGate Test',
      GIT_AUTHOR_EMAIL: 'arkgate@example.test',
      GIT_COMMITTER_NAME: 'ArkGate Test',
      GIT_COMMITTER_EMAIL: 'arkgate@example.test',
    },
  });
  if (result.status !== 0) throw new Error(result.stderr);
}

function setupRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t01-policy-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark\n');
  writeJson(root, '.mcp.json', { mcpServers: { ark: {} } });
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github/workflows/ark-check.yml'),
    'name: Ark\njobs:\n  check:\n    steps:\n      - run: npx ark-check --strict-merge\n'
  );
  const base = {
    include: ['src'],
    layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
    rules: [],
    dynamicImportAllowlist: [],
  };
  writeJson(root, 'ark.config.json', base);
  git(root, ['init', '-b', 'main']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  return { root, base };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('T01 strict policy transition guard', () => {
  it('gives generated CI and the composite Action an explicit merge-base input', () => {
    const workflow = githubWorkflow(
      { name: 'npm', install: 'npm ci', run: 'npx ark-check --strict-merge', cache: 'npm', setup: [] },
      { kind: 'version', value: '22' }
    );
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('ARK_POLICY_BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}');

    const action = fs.readFileSync(path.resolve('action.yml'), 'utf8');
    expect(action).toContain('ARK_POLICY_BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}');
    expect(action).toContain('git fetch --no-tags --depth=1 origin "$ARK_POLICY_BASE_REF"');
  });

  it('blocks an unacknowledged weakening and accepts only the exact hash-bound acknowledgement', () => {
    const { root, base } = setupRoot();
    writeJson(root, 'ark.config.json', {
      ...base,
      dynamicImportAllowlist: ['src/domain/dynamic.ts'],
    });

    const blocked = run(root, ['--strict-merge', '--policy-base-ref', 'HEAD']);
    expect(blocked.status).toBe(1);
    const payload = JSON.parse(blocked.stdout);
    expect(payload).toMatchObject({
      ok: false,
      policyDelta: {
        classification: 'weakening',
        valid: false,
        requiresAcknowledgement: true,
      },
    });

    const human = runHuman(root, ['--strict-merge', '--policy-base-ref', 'HEAD']);
    expect(human.status).toBe(1);
    expect(human.stderr).toContain('Policy transition rejected');
    expect(human.stderr).not.toContain('0 violation(s)');

    writeJson(root, '.ark/policy-delta-ack.json', {
      schemaVersion: '1.0',
      basePolicyHash: payload.policyDelta.basePolicyHash,
      candidatePolicyHash: payload.policyDelta.candidatePolicyHash,
      findingIds: payload.policyDelta.blockingFindingIds,
      reason: 'Temporary loader while static imports are migrated.',
    });
    const accepted = run(root, [
      '--strict-merge',
      '--policy-base-ref',
      'HEAD',
      '--policy-ack',
      '.ark/policy-delta-ack.json',
    ]);
    expect(accepted.status).toBe(0);
    expect(JSON.parse(accepted.stdout).policyDelta).toMatchObject({
      valid: true,
      acknowledged: true,
    });

    writeJson(root, 'ark.config.json', {
      ...base,
      dynamicImportAllowlist: ['src/domain/dynamic.ts', 'src/domain/other.ts'],
    });
    const stale = run(root, [
      '--strict-merge',
      '--policy-base-ref',
      'HEAD',
      '--policy-ack',
      '.ark/policy-delta-ack.json',
    ]);
    expect(stale.status).toBe(1);
    expect(JSON.parse(stale.stdout).policyDelta).toMatchObject({
      valid: false,
      acknowledged: false,
    });
  });

  it('fails closed when an explicit base ref cannot be resolved', () => {
    const { root } = setupRoot();
    const result = run(root, ['--strict-merge', '--policy-base-ref', 'missing-ref']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Cannot read policy base');
  });

  it('ignores ambient CI refs for a checked root that is not a Git repository', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t01-policy-nongit-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Ark\n');
    writeJson(root, '.mcp.json', { mcpServers: { ark: {} } });
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ark-check.yml'),
      'name: Ark\njobs:\n  check:\n    steps:\n      - run: npx ark-check --strict-merge\n'
    );
    writeJson(root, 'ark.config.json', {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    });

    const result = run(root, ['--strict-merge'], { GITHUB_BASE_REF: 'main' });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).not.toHaveProperty('policyDelta');

    const explicit = run(root, ['--strict-merge', '--policy-base-ref', 'HEAD']);
    expect(explicit.status).toBe(2);
    expect(explicit.stderr).toContain('Cannot resolve policy base ref outside a Git repository');
  });

  it('keeps first-time adoption green when the CI base commit has no policy file', () => {
    const { root } = setupRoot();
    git(root, ['rm', 'ark.config.json']);
    git(root, ['commit', '-m', 'remove policy before adoption']);
    const baseRef = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).stdout.trim();
    writeJson(root, 'ark.config.json', {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    });

    const result = run(root, ['--strict-merge'], { ARK_POLICY_BASE_REF: baseRef });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).not.toHaveProperty('policyDelta');
  });
});
