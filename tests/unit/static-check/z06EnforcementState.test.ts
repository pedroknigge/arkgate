import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderWritePathAdoptionBlock } from '../../../bin/lib/html-report-depth.mjs';
import { withCiProviderEvidence } from '../../../bin/lib/enforcement-state.mjs';
import { reportGithubBranchProtection } from '../../../bin/lib/weakest-link.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';

const ARK_CHECK = path.resolve('bin/ark-check.mjs');

function write(root: string, relativePath: string, content: string) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-enforcement-'));
  write(root, 'package.json', '{"name":"z06-enforcement-consumer","private":true}\n');
  write(
    root,
    'ark.config.json',
    `${JSON.stringify({
      schemaVersion: '1.0',
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    })}\n`
  );
  write(root, 'src/domain/value.ts', 'export const value = 1;\n');
  write(root, 'AGENTS.md', '# ArkGate consumer\n');
  write(
    root,
    '.claude/settings.json',
    '{"hooks":{"PreToolUse":[{"hooks":[{"command":"npx arkgate-mcp --hook"}]}]}}\n'
  );
  write(root, '.mcp.json', '{"mcpServers":{"ark":{"command":"npx","args":["arkgate-mcp"]}}}\n');
  write(
    root,
    '.github/workflows/ark-check.yml',
    'name: Ark\njobs:\n  architecture:\n    steps:\n      - run: npx arkgate-check --root . --strict-merge\n'
  );
  return root;
}

function expectSchemaShape(state: Record<string, unknown>) {
  const schema = JSON.parse(
    fs.readFileSync(path.resolve('schemas/ark.enforcement-state.schema.json'), 'utf8')
  );
  expect(Object.keys(state).sort()).toEqual([...schema.required].sort());
  expect(schema.properties.activeHost.enum).toContain(state.activeHost);
  for (const name of ['localWrite', 'advisoryMcp', 'ciMerge']) {
    const boundary = state[name] as Record<string, unknown>;
    expect(Object.keys(boundary).sort()).toEqual([...schema.$defs.boundary.required].sort());
    for (const field of ['supported', 'analyzed', 'configured', 'installed']) {
      expect(typeof boundary[field]).toBe('boolean');
    }
    for (const field of ['active', 'bypassable', 'required']) {
      expect([true, false, 'unverified']).toContain(boundary[field]);
    }
    for (const evidence of boundary.evidence as Array<Record<string, unknown>>) {
      expect(schema.$defs.evidence.properties.field.enum).toContain(evidence.field);
      expect(typeof evidence.source).toBe('string');
      if (evidence.field === 'configured' || evidence.field === 'installed') {
        expect(typeof evidence.value).toBe('boolean');
      } else expect([true, false, 'unverified']).toContain(evidence.value);
    }
  }
}

describe('Z06 enforcement-state truth', () => {
  it('keeps configured separate from installed and never infers required CI locally', () => {
    const root = fixture();
    const writePath = detectWritePathCapabilities(root, 'claude');
    const state = writePath.enforcementState;

    expectSchemaShape(state);
    expect(state.localWrite).toMatchObject({ configured: true, installed: false, active: false });
    expect(state.advisoryMcp).toMatchObject({ configured: true, installed: false, active: false });
    expect(state.ciMerge).toMatchObject({
      configured: true,
      installed: false,
      active: false,
      required: 'unverified',
    });
    expect(writePath.enforcementLadder.ciMerge.requiredStatus).toBe(state.ciMerge.required);

    const selfHosted = detectWritePathCapabilities(path.resolve('.'), 'claude').enforcementState;
    expect(selfHosted.localWrite.installed).toBe(true);
    expect(selfHosted.localWrite.evidence).toContainEqual(
      expect.objectContaining({ field: 'installed', value: true, source: expect.stringMatching(/self-host/) })
    );
  });

  it('keeps package installed=true on unknown host when inventory lists hooks (no hard claim)', () => {
    // Self-host arkgate + multi-host inventory; activeHost unknown must not invert installed.
    const selfRoot = path.resolve('.');
    const writePath = detectWritePathCapabilities(selfRoot, 'unknown');
    expect(writePath.activeHost).toBe('unknown');
    expect(writePath.sessionNote).toMatch(/activeHost unknown/i);
    expect(writePath.enforcementState.localWrite.installed).toBe(true);
    expect(writePath.enforcementState.localWrite.hard).toBe(false);
    expect(writePath.enforcementState.localWrite.runtimeObserved).toBe(false);
    // Inventory still shows real host assets separately from session projection.
    expect(
      writePath.inventory.capabilities['hard-write'] ||
        writePath.inventory.capabilities['advisory-write']
    ).toBe(true);
  });

  it('keeps doctor JSON, human output, HTML, and schema vocabulary aligned', () => {
    const root = fixture();
    const env = { ...process.env, ARK_ACTIVE_HOST: 'claude' };
    delete env.ARK_DOCTOR_GITHUB;
    const json = spawnSync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
      { cwd: root, env, encoding: 'utf8' }
    );
    expect(json.status, json.stderr || json.stdout).toBe(0);
    const writePath = JSON.parse(json.stdout).doctor.writePath;
    expectSchemaShape(writePath.enforcementState);
    expect(writePath.enforcementState.ciMerge.required).toBe('unverified');
    expect(writePath.enforcementLadder.ciMerge.requiredStatus).toBe('unverified');

    const human = spawnSync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--no-cache'],
      { cwd: root, env, encoding: 'utf8' }
    );
    expect(human.status, human.stderr || human.stdout).toBe(0);
    expect(human.stdout).toMatch(/CI merge — supported: yes · analyzed: yes · configured: yes · installed: no/);
    expect(human.stdout).toMatch(/required: unverified/);

    const html = renderWritePathAdoptionBlock(writePath);
    expect(html).toMatch(/CI merge/);
    expect(html).toMatch(/supported yes; analyzed yes; configured yes; installed no/);
    expect(html).toMatch(/required unverified/);
    expect(html).not.toMatch(/blocks the merge/i);
  });

  it('queries protection for the provider default branch, not the current branch', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-provider-'));
    const bin = path.join(root, 'bin');
    const log = path.join(root, 'gh.log');
    fs.mkdirSync(bin);
    write(
      root,
      'package.json',
      '{"scripts":{"check:architecture":"npx ark-check --strict-merge"}}\n'
    );
    write(
      root,
      '.github/workflows/ci.yml',
      'name: CI\njobs:\n  architecture:\n    steps:\n      - run: npm run check:architecture\n'
    );
    const gh = write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'if [ "$1" = "repo" ]; then echo \'{"nameWithOwner":"acme/repo","defaultBranchRef":{"name":"main"}}\'; exit 0; fi\n' +
        'if [ "$1" = "api" ]; then echo "$*" >> "$GH_LOG"; case "$*" in *rules/branches*) echo \'[]\';; *) echo \'{"strict":true,"contexts":["architecture"],"checks":[],"enforcesAdmins":true}\';; esac; exit 0; fi\n' +
        'exit 1\n'
    );
    fs.chmodSync(gh, 0o755);
    const report = reportGithubBranchProtection({
      cwd: root,
      repo: 'acme/repo',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GH_LOG: log },
    });

    expect(report).toMatchObject({
      available: true,
      repo: 'acme/repo',
      branch: 'main',
      arkCheckRequired: true,
      enforcesAdmins: true,
    });
    const attached = withCiProviderEvidence(
      detectWritePathCapabilities(fixture(), 'claude'),
      report
    );
    expect(attached.enforcementState.ciMerge.required).toBe(true);
    expect(attached.enforcementState.ciMerge.bypassable).toBe(true);
    expect(attached.enforcementLadder.ciMerge.requiredStatus).toBe(true);
    expect(report.arkCheckSourceBound).toBe(false);
    const api = fs.readFileSync(log, 'utf8').trim().split('\n');
    expect(api).toHaveLength(2);
    expect(api[0]).toContain('branches/main/protection');
    expect(api[0]).not.toContain('branches/feature/protection');
    expect(api[1]).toContain('rules/branches/main');
  });

  it('preserves app-bound checks and leaves an uncorrelated app identity unverified', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-provider-app-'));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    write(
      root,
      'package.json',
      '{"scripts":{"check:architecture":"npx ark-check --strict-merge"}}\n'
    );
    write(
      root,
      '.github/workflows/ci.yml',
      'name: CI\njobs:\n  architecture:\n    steps:\n      - run: npm run check:architecture\n'
    );
    const gh = write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'if [ "$1" = "api" ]; then case "$*" in *rules/branches*) echo \'[]\';; *) echo \'{"strict":true,"contexts":["architecture"],"checks":[{"context":"architecture","app_id":42}],"enforcesAdmins":true}\';; esac; exit 0; fi\n' +
        'exit 1\n'
    );
    fs.chmodSync(gh, 0o755);
    const report = reportGithubBranchProtection({
      cwd: root,
      repo: 'acme/repo',
      branch: 'main',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    });

    expect(report.arkCheckRequired).toBe('unverified');
    expect(report.requiredStatusCheckDetails).toEqual([
      { context: 'architecture', app_id: 42 },
    ]);
    const attached = withCiProviderEvidence(
      detectWritePathCapabilities(fixture(), 'claude'),
      report
    );
    expect(attached.enforcementState.ciMerge.required).toBe('unverified');
    expect(attached.enforcementLadder.ciMerge.requiredStatus).toBe('unverified');
  });

  it('accepts unbound classic app checks and effective ruleset checks', () => {
    for (const source of ['classic', 'ruleset']) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `ark-z06-provider-${source}-`));
      const bin = path.join(root, 'bin');
      fs.mkdirSync(bin);
      write(
        root,
        'package.json',
        '{"scripts":{"check:architecture":"npx ark-check --strict-merge"}}\n'
      );
      write(
        root,
        '.github/workflows/ci.yml',
        'jobs:\n  architecture:\n    steps:\n      - run: npm run check:architecture\n'
      );
      const classic = source === 'classic'
        ? '{"strict":true,"contexts":[],"checks":[{"context":"architecture","app_id":-1}],"enforcesAdmins":true}'
        : '{"strict":true,"contexts":[],"checks":[],"enforcesAdmins":true}';
      const rules = source === 'ruleset'
        ? '[{"type":"required_status_checks","parameters":{"required_status_checks":[{"context":"architecture","integration_id":-1}]}}]'
        : '[]';
      const gh = write(
        bin,
        'gh',
        '#!/bin/sh\n' +
          'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
          `if [ "$1" = "api" ]; then case "$*" in *rules/branches*) echo '${rules}';; *) echo '${classic}';; esac; exit 0; fi\n` +
          'exit 1\n'
      );
      fs.chmodSync(gh, 0o755);

      const report = reportGithubBranchProtection({
        cwd: root,
        repo: 'acme/repo',
        branch: 'main',
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
      });
      expect(report).toMatchObject({
        available: true,
        arkCheckRequired: true,
        arkCheckSourceBound: false,
      });
      if (source === 'classic') {
        expect(report.requiredStatusCheckDetails).toEqual([
          { context: 'architecture', app_id: -1 },
        ]);
      } else {
        expect(report.requiredStatusRuleDetails).toEqual([
          { context: 'architecture', integration_id: -1 },
        ]);
      }
    }
  });

  it('keeps absence unverified when either provider source cannot be queried', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-provider-partial-'));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    write(root, 'package.json', '{"scripts":{"check:architecture":"npx ark-check --strict"}}\n');
    write(
      root,
      '.github/workflows/ci.yml',
      'jobs:\n  architecture:\n    steps:\n      - run: npm run check:architecture\n'
    );
    const gh = write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'if [ "$1" = "api" ]; then case "$*" in *rules/branches*) echo "HTTP 403" >&2; exit 1;; *) echo \'{"strict":true,"contexts":[],"checks":[],"enforcesAdmins":true}\'; exit 0;; esac; fi\n' +
        'exit 1\n'
    );
    fs.chmodSync(gh, 0o755);

    expect(reportGithubBranchProtection({
      cwd: root,
      repo: 'acme/repo',
      branch: 'main',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    })).toMatchObject({
      available: false,
      reason: 'provider-enforcement-unverified',
      arkCheckRequired: 'unverified',
    });
  });

  it('distinguishes proven absence, workflow rules, malformed evidence, and legacy names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-provider-branches-'));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    write(root, 'package.json', '{"scripts":{"check:architecture":"npx ark-check --strict"}}\n');
    write(
      root,
      '.github/workflows/ci.yml',
      'jobs:\n  architecture:\n    steps:\n      - run: npm run check:architecture\n'
    );
    const gh = write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'if [ "$1" = "repo" ]; then printf "%s\\n" "$GH_METADATA"; exit 0; fi\n' +
        'if [ "$1" = "api" ]; then case "$*" in *rules/branches*) printf "%s\\n" "$GH_RULES";; *) printf "%s\\n" "$GH_CLASSIC";; esac; exit 0; fi\n' +
        'exit 1\n'
    );
    fs.chmodSync(gh, 0o755);
    const baseEnv = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      GH_CLASSIC: '{"strict":true,"contexts":[],"checks":[],"enforcesAdmins":true}',
      GH_RULES: '[]',
    };
    const report = (env: NodeJS.ProcessEnv = baseEnv) => reportGithubBranchProtection({
      cwd: root,
      repo: 'acme/repo',
      branch: 'main',
      env,
    });

    expect(report()).toMatchObject({ available: true, arkCheckRequired: false });
    expect(report({
      ...baseEnv,
      GH_RULES: '[{"type":"workflows","parameters":{}}]',
    })).toMatchObject({ available: true, arkCheckRequired: 'unverified' });
    expect(report({ ...baseEnv, GH_RULES: '{not-json' })).toMatchObject({
      available: false,
      arkCheckRequired: 'unverified',
    });
    expect(report({
      ...baseEnv,
      GH_CLASSIC: '{"strict":true,"contexts":[],"checks":[{"name":"architecture"}],"enforcesAdmins":true}',
    })).toMatchObject({ available: true, arkCheckRequired: true });
    expect(report({
      ...baseEnv,
      GH_RULES: '[{"type":"required_status_checks","parameters":{"required_status_checks":[{"context":"architecture"}]}}]',
    })).toMatchObject({ available: true, arkCheckRequired: true });

    expect(reportGithubBranchProtection({
      cwd: root,
      env: { ...baseEnv, GH_METADATA: '{}' },
    })).toMatchObject({ available: false, reason: 'gh-repo-unavailable' });
  });

  it('does not treat a dynamic matrix job name as an exact required context', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-provider-matrix-'));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    write(root, 'package.json', '{"scripts":{"check:architecture":"npx ark-check --strict"}}\n');
    write(
      root,
      '.github/workflows/ci.yml',
      `jobs:
  architecture:
    name: Architecture (\${{ matrix.node }})
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - run: npm run check:architecture
`
    );
    const gh = write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'if [ "$1" = "api" ]; then case "$*" in *rules/branches*) echo \'[]\';; *) echo \'{"strict":true,"contexts":["architecture"],"checks":[],"enforcesAdmins":true}\';; esac; exit 0; fi\n' +
        'exit 1\n'
    );
    fs.chmodSync(gh, 0o755);

    expect(reportGithubBranchProtection({
      cwd: root,
      repo: 'acme/repo',
      branch: 'main',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    })).toMatchObject({ available: true, arkCheckRequired: 'unverified' });
  });

  it('does not correlate a duplicated workflow context to the Ark job', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-provider-duplicate-'));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    write(root, 'package.json', '{"scripts":{"check:architecture":"npx ark-check --strict"}}\n');
    write(
      root,
      '.github/workflows/ci.yml',
      `jobs:
  architecture:
    name: Architecture contract
    steps:
      - run: npm run check:architecture
  unrelated:
    name: Architecture contract
    steps:
      - run: echo ok
`
    );
    const gh = write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'if [ "$1" = "api" ]; then case "$*" in *rules/branches*) echo \'[]\';; *) echo \'{"strict":true,"contexts":["Architecture contract"],"checks":[],"enforcesAdmins":true}\';; esac; exit 0; fi\n' +
        'exit 1\n'
    );
    fs.chmodSync(gh, 0o755);

    expect(reportGithubBranchProtection({
      cwd: root,
      repo: 'acme/repo',
      branch: 'main',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    })).toMatchObject({ available: true, arkCheckRequired: 'unverified' });
  });

  it('does not interpret classic protection 404 as proof that no ruleset requires Ark', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-provider-404-'));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    const gh = write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'echo "HTTP 404: Not Found" >&2\n' +
        'exit 1\n'
    );
    fs.chmodSync(gh, 0o755);
    const report = reportGithubBranchProtection({
      cwd: root,
      repo: 'acme/repo',
      branch: 'main',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    });

    expect(report).toMatchObject({
      available: false,
      reason: 'provider-enforcement-unverified',
      repo: 'acme/repo',
      branch: 'main',
    });
    expect(report.arkCheckRequired).toBe('unverified');
  });
});
