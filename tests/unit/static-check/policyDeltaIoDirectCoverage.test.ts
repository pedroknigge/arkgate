import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzePolicyTransition,
  normalizePolicyBaseRef,
  readPolicyAcknowledgement,
  resolvePolicyBaseConfig,
} from '../../../bin/lib/policy-delta-io.mjs';

const roots: string[] = [];

const BASE_CONFIG = {
  schemaVersion: '1.1',
  include: ['src'],
  layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
  rules: [],
  dynamicImportAllowlist: [],
};

function temporaryRoot(prefix = 'ark-policy-delta-io-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function writeJson(root: string, relativePath: string, value: unknown): string {
  const absolute = path.join(root, relativePath);
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

function initializeRepository(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'order.ts'), 'export const order = 1;\n');
  writeJson(root, 'ark.config.json', BASE_CONFIG);
  git(root, ['init']);
  git(root, ['checkout', '-b', 'main']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('policy-delta I/O direct coverage', () => {
  it('normalizes refs and reads relative or absolute acknowledgement JSON', () => {
    const root = temporaryRoot();
    const relative = '.ark/policy-delta-ack.json';
    const absolute = writeJson(root, relative, { schemaVersion: '1.0', reason: 'reviewed' });

    expect(normalizePolicyBaseRef(undefined)).toBe('');
    expect(normalizePolicyBaseRef(`  ${'0'.repeat(40)}  `)).toBe('');
    expect(normalizePolicyBaseRef('  HEAD  ')).toBe('HEAD');
    expect(readPolicyAcknowledgement(root, undefined)).toBeUndefined();
    expect(readPolicyAcknowledgement(root, relative)).toEqual({
      schemaVersion: '1.0',
      reason: 'reviewed',
    });
    expect(readPolicyAcknowledgement(root, absolute)).toEqual({
      schemaVersion: '1.0',
      reason: 'reviewed',
    });

    expect(() => readPolicyAcknowledgement(root, 'missing.json')).toThrow(
      /Policy acknowledgement not found/
    );
    fs.writeFileSync(absolute, '{');
    expect(() => readPolicyAcknowledgement(root, absolute)).toThrow(
      /Policy acknowledgement is not valid JSON/
    );
  });

  it('loads an explicit policy file and rejects malformed or missing input', () => {
    const root = temporaryRoot();
    const absolute = writeJson(root, 'base.json', BASE_CONFIG);

    expect(
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        basePath: 'base.json',
      })
    ).toEqual({ config: BASE_CONFIG, source: absolute, ref: null });
    expect(
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        basePath: absolute,
      })
    ).toEqual({ config: BASE_CONFIG, source: absolute, ref: null });

    fs.writeFileSync(absolute, '{');
    expect(() =>
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        basePath: absolute,
      })
    ).toThrow(/Policy base is not valid JSON/);
    expect(() =>
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        basePath: 'missing.json',
      })
    ).toThrow(/Policy base not found/);
  });

  it('handles non-repository refs fail-closed only when explicitly requested', () => {
    const root = temporaryRoot();

    expect(
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        env: { ARK_POLICY_BASE_REF: '0'.repeat(64) },
      })
    ).toBeNull();
    expect(
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        env: { GITHUB_BASE_REF: 'main' },
      })
    ).toBeNull();
    expect(() =>
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        baseRef: '../outside',
        env: {},
      })
    ).toThrow(/Unsafe policy base ref/);
    expect(() =>
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        baseRef: 'HEAD',
        env: {},
      })
    ).toThrow(/outside a Git repository/);
  });

  it('resolves explicit and discovered Git bases while enforcing the repository boundary', () => {
    const root = temporaryRoot();
    initializeRepository(root);

    const explicit = resolvePolicyBaseConfig({
      root,
      configPath: 'ark.config.json',
      baseRef: 'HEAD',
      env: {},
    });
    expect(explicit).toMatchObject({
      config: BASE_CONFIG,
      source: 'git:HEAD:ark.config.json',
      ref: 'HEAD',
    });

    const outsideRoot = temporaryRoot('ark-policy-outside-');
    const outsideConfig = writeJson(outsideRoot, 'outside.json', BASE_CONFIG);
    expect(() =>
      resolvePolicyBaseConfig({
        root,
        configPath: outsideConfig,
        baseRef: 'HEAD',
        env: {},
      })
    ).toThrow(/Policy config must be inside the Git repository/);

    git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    git(root, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
    expect(
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        env: {},
      })
    ).toBeNull();

    git(root, ['checkout', '-b', 'feature']);
    fs.writeFileSync(path.join(root, 'src', 'feature.ts'), 'export const feature = true;\n');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'feature']);
    const discovered = resolvePolicyBaseConfig({
      root,
      configPath: 'ark.config.json',
      env: {},
    });
    expect(discovered?.source).toMatch(/^git:[0-9a-f]+:ark\.config\.json$/);
    expect(discovered?.config).toEqual(BASE_CONFIG);

    expect(() =>
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        baseRef: 'missing-ref',
        env: {},
      })
    ).toThrow(/Cannot read policy base missing-ref/);
  });

  it('reports invalid Git JSON and treats an implicit predecessor without a config as adoption', () => {
    const root = temporaryRoot();
    initializeRepository(root);

    fs.writeFileSync(path.join(root, 'ark.config.json'), '{');
    git(root, ['add', 'ark.config.json']);
    git(root, ['commit', '-m', 'invalid config fixture']);
    expect(() =>
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        baseRef: 'HEAD',
        env: {},
      })
    ).toThrow(/Policy base HEAD:ark\.config\.json is not valid JSON/);

    git(root, ['rm', 'ark.config.json']);
    git(root, ['commit', '-m', 'remove config']);
    const withoutConfig = git(root, ['rev-parse', 'HEAD']);
    writeJson(root, 'ark.config.json', BASE_CONFIG);
    expect(
      resolvePolicyBaseConfig({
        root,
        configPath: 'ark.config.json',
        env: { ARK_POLICY_BASE_REF: withoutConfig },
      })
    ).toBeNull();
  });

  it('analyzes disk policy transitions and validates candidate ArkRules before comparison', () => {
    const root = temporaryRoot();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const basePath = writeJson(root, 'base.json', BASE_CONFIG);
    writeJson(root, '.ark/policy-delta-ack.json', {
      schemaVersion: '1.0',
      basePolicyHash: 'stale',
      candidatePolicyHash: 'stale',
      findingIds: [],
      reason: 'fixture',
    });

    expect(
      analyzePolicyTransition({
        root,
        configPath: 'ark.config.json',
        candidateConfig: BASE_CONFIG,
        strictMerge: false,
      })
    ).toBeUndefined();
    expect(
      analyzePolicyTransition({
        root,
        configPath: 'ark.config.json',
        candidateConfig: BASE_CONFIG,
        strictMerge: true,
      })
    ).toBeUndefined();

    const unchanged = analyzePolicyTransition({
      root,
      configPath: 'ark.config.json',
      candidateConfig: BASE_CONFIG,
      strictMerge: true,
      basePath,
      acknowledgementPath: '.ark/policy-delta-ack.json',
    });
    expect(unchanged).toMatchObject({
      classification: 'neutral',
      valid: true,
    });

    expect(() =>
      analyzePolicyTransition({
        root,
        configPath: 'ark.config.json',
        candidateConfig: {
          ...BASE_CONFIG,
          arkRules: { DomainModel: 'arkrules/DomainModel.json' },
        },
        strictMerge: true,
        basePath,
      })
    ).toThrow(/Invalid candidate Effective Contract/);
  });

  it('loads invariant evidence for an ArkRules candidate transition', () => {
    const root = temporaryRoot();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const basePath = writeJson(root, 'base.json', BASE_CONFIG);
    writeJson(root, 'arkrules/DomainModel.json', {
      schemaVersion: '1.0',
      layer: 'DomainModel',
      invariants: [
        {
          id: 'INV-ORDER-001',
          description: 'Order total is never negative',
          mode: 'advisory',
        },
      ],
    });
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'tests', 'order.test.ts'),
      "it('INV-ORDER-001 keeps totals non-negative', () => {});\n"
    );

    const candidateConfig = {
      ...BASE_CONFIG,
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
    };
    const result = analyzePolicyTransition({
      root,
      configPath: 'ark.config.json',
      candidateConfig,
      strictMerge: true,
      basePath,
    });

    expect(result).toMatchObject({
      classification: 'strengthening',
      valid: true,
    });
  });
});
