/**
 * Policy delta must read the BASE ArkRules from the base ref (or the base file's
 * directory), never from the candidate working tree. Otherwise demoting or deleting
 * an enforced ArkRule compares the candidate catalog with itself and reads neutral.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzePolicyTransition } from '../../../bin/lib/policy-delta-io.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const CONFIG = {
  schemaVersion: '1.1',
  include: ['src'],
  layers: [{ name: 'Domain', patterns: ['src/domain/**'] }],
  rules: [],
  dynamicImportAllowlist: [],
  arkRules: { Domain: 'arkrules/Domain.json' },
};

function rulesFile(structure: unknown[]) {
  return { schemaVersion: '1.0', layer: 'Domain', structure };
}

const ENFORCED = { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' };

function writeJson(root: string, rel: string, value: unknown): string {
  const absolute = path.join(root, rel);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
  return absolute;
}

function git(root: string, args: string[]): string {
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
  return result.stdout.trim();
}

/** Repository whose project lives at `<repo>/<sub>` (sub may be ''). */
function repoWithProject(sub = ''): { repo: string; project: string } {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-arkrules-base-')));
  roots.push(repo);
  const project = sub ? path.join(repo, sub) : repo;
  fs.mkdirSync(path.join(project, 'src', 'domain'), { recursive: true });
  fs.writeFileSync(path.join(project, 'src', 'domain', 'order.ts'), 'export const x = 1;\n');
  writeJson(project, 'ark.config.json', CONFIG);
  writeJson(project, 'arkrules/Domain.json', rulesFile([ENFORCED]));
  git(repo, ['init']);
  git(repo, ['checkout', '-b', 'main']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'base']);
  git(repo, ['checkout', '-b', 'feat']);
  return { repo, project };
}

function commitAll(repo: string): void {
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'candidate']);
}

function transition(project: string, extra: Record<string, unknown> = {}) {
  return analyzePolicyTransition({
    root: project,
    configPath: 'ark.config.json',
    candidateConfig: JSON.parse(fs.readFileSync(path.join(project, 'ark.config.json'), 'utf8')),
    strictMerge: false,
    baseRef: 'main',
    ...extra,
  });
}

describe('policy delta reads base ArkRules from the base ref (arkrules cluster)', () => {
  it('classifies a demoted enforced structure rule as weakening', () => {
    const { repo, project } = repoWithProject();
    writeJson(project, 'arkrules/Domain.json', rulesFile([{ ...ENFORCED, mode: 'advisory' }]));
    commitAll(repo);
    const delta = transition(project);
    expect(delta.classification).toBe('weakening');
    expect(delta.requiresAcknowledgement).toBe(true);
    expect(delta.basePolicyHash).not.toBe(delta.candidatePolicyHash);
    expect(delta.findings.map((f: { id: string }) => f.id).join(' ')).toContain('arkrule-demoted');
    const strict = transition(project, { strictMerge: true });
    expect(strict.valid).toBe(false);
  });

  it('classifies a deleted structure rule as weakening (nested project root)', () => {
    const { repo, project } = repoWithProject('packages/app');
    writeJson(project, 'arkrules/Domain.json', rulesFile([]));
    commitAll(repo);
    const delta = transition(project);
    expect(delta.classification).toBe('weakening');
    expect(delta.findings.map((f: { id: string }) => f.id).join(' ')).toContain(
      'arkrule-structure-removed'
    );
  });

  it('an unchanged catalog stays neutral', () => {
    const { project } = repoWithProject();
    const delta = transition(project);
    expect(delta.classification).toBe('neutral');
    expect(delta.basePolicyHash).toBe(delta.candidatePolicyHash);
  });

  it('a file referenced by the base config but absent at the ref counts as an empty layer', () => {
    const { repo, project } = repoWithProject();
    // Base ref: config references arkrules/Extra.json that the ref never contained.
    git(repo, ['checkout', 'main']);
    const withExtra = {
      ...CONFIG,
      layers: [...CONFIG.layers, { name: 'App', patterns: ['src/app/**'] }],
      arkRules: { ...CONFIG.arkRules, App: 'arkrules/App.json' },
    };
    writeJson(project, 'ark.config.json', withExtra);
    commitAll(repo);
    git(repo, ['checkout', 'feat']);
    git(repo, ['merge', '--no-edit', 'main']);
    writeJson(project, 'arkrules/App.json', {
      schemaVersion: '1.0',
      layer: 'App',
      structure: [{ id: 'app-private', sensor: 'aggregate-private-state', mode: 'advisory' }],
    });
    commitAll(repo);
    const delta = transition(project);
    expect(delta.valid).toBe(true);
    expect(delta.classification).not.toBe('weakening');
  });

  it('fails closed when the base ArkRules at the ref cannot be parsed', () => {
    const { repo, project } = repoWithProject();
    git(repo, ['checkout', 'main']);
    fs.writeFileSync(path.join(project, 'arkrules', 'Domain.json'), '{ not json');
    commitAll(repo);
    git(repo, ['checkout', 'feat']);
    expect(() => transition(project)).toThrow(/Policy base ArkRules could not be loaded/);
  });

  it('--policy-base <file> resolves ArkRules next to the base file, not the working tree', () => {
    const { project } = repoWithProject();
    const baseDir = path.join(project, '.ark-base');
    writeJson(baseDir, 'ark.config.json', CONFIG);
    writeJson(baseDir, 'arkrules/Domain.json', rulesFile([ENFORCED]));
    writeJson(project, 'arkrules/Domain.json', rulesFile([{ ...ENFORCED, mode: 'advisory' }]));
    const delta = transition(project, {
      baseRef: undefined,
      basePath: path.join(baseDir, 'ark.config.json'),
    });
    expect(delta.classification).toBe('weakening');
    fs.rmSync(path.join(baseDir, 'arkrules'), { recursive: true });
    expect(() =>
      transition(project, { baseRef: undefined, basePath: path.join(baseDir, 'ark.config.json') })
    ).toThrow(/Policy base ArkRules could not be loaded[\s\S]*copy the base catalog[\s\S]*--policy-base-ref/);
  });

  it('ark-check --policy-base-ref reports the demotion as weakening', () => {
    const { repo, project } = repoWithProject();
    writeJson(project, 'arkrules/Domain.json', rulesFile([{ ...ENFORCED, mode: 'advisory' }]));
    commitAll(repo);
    const result = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'bin', 'ark-check.mjs'),
        '--root',
        project,
        '--config',
        path.join(project, 'ark.config.json'),
        '--json',
        '--policy-base-ref',
        'main',
      ],
      { encoding: 'utf8', env: { ...process.env, GITHUB_BASE_REF: '', ARK_POLICY_BASE_REF: '' } }
    );
    const json = JSON.parse(result.stdout) as {
      policyDelta?: { classification: string; requiresAcknowledgement: boolean };
    };
    expect(json.policyDelta?.classification).toBe('weakening');
    expect(json.policyDelta?.requiresAcknowledgement).toBe(true);
  });
});
