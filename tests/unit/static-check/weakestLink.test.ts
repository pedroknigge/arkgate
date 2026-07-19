/**
 * Q3 — weakest-link sensors drive shipped bin/lib/weakest-link.mjs (not reimplemented).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  detectCiEnforcement,
  detectConfigGateDrift,
  detectPreCommitArk,
  collectWeakestLinkGaps,
  reportGithubBranchProtection,
  jobIdsThatRunArkCheck,
  isArkRequiredStatusCheck,
} from '../../../bin/lib/weakest-link.mjs';

const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) {
    fs.rmSync(t, { recursive: true, force: true });
  }
});

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-q3-'));
  temps.push(root);
  return root;
}

describe('Q3 weakest-link sensors (shipped weakest-link.mjs)', () => {
  it('flags missing CI workflows on adopted consumer', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# a\n');
    fs.writeFileSync(path.join(root, 'ark.config.json'), '{}\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"scripts":{"check:architecture":"x"}}\n');
    const ci = detectCiEnforcement(root);
    expect(ci.hasWorkflowsDir).toBe(false);
    const { gaps } = collectWeakestLinkGaps(root, { adopted: true, isProducer: false });
    expect(gaps.some((g) => g.id === 'enforcement-ci-missing')).toBe(true);
  });

  it('flags workflows without ark-check', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# a\n');
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github/workflows/ci.yml'), 'name: ci\non: push\njobs: {}\n');
    const ci = detectCiEnforcement(root);
    expect(ci.hasWorkflowsDir).toBe(true);
    expect(ci.hasArkCheckWorkflow).toBe(false);
    const { gaps } = collectWeakestLinkGaps(root, { adopted: true, isProducer: false });
    expect(gaps.some((g) => g.id === 'enforcement-ci-no-ark-check')).toBe(true);
  });

  it('detects ark-check workflow with --strict', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ark-check.yml'),
      'name: ark\non: push\njobs:\n  a:\n    steps:\n      - run: npx arkgate-check --strict\n'
    );
    const ci = detectCiEnforcement(root);
    expect(ci.hasArkCheckWorkflow).toBe(true);
    expect(ci.hasStrictFlag).toBe(true);
  });

  it('detects config drift: agents without ark.config', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# a\n');
    const drift = detectConfigGateDrift(root, { adopted: true, isProducer: false });
    expect(drift.issues.some((i) => i.id === 'config-drift-agents-without-config')).toBe(true);
  });

  it('detects config without check:architecture script', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'ark.config.json'), '{}\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x"}\n');
    const drift = detectConfigGateDrift(root, { adopted: true, isProducer: false });
    expect(drift.issues.some((i) => i.id === 'config-drift-no-check-script')).toBe(true);
  });

  it('detects ark-aware pre-commit vs missing', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, '.git/hooks'), { recursive: true });
    expect(detectPreCommitArk(root).arkAware).toBe(false);
    fs.writeFileSync(
      path.join(root, '.git/hooks/pre-commit'),
      '#!/bin/sh\nnpx arkgate-check --strict-config\n'
    );
    const pre = detectPreCommitArk(root);
    expect(pre.present).toBe(true);
    expect(pre.arkAware).toBe(true);
  });

  it('producer without pre-commit template surfaces gap', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'templates/skills'), { recursive: true });
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# a\n');
    const { gaps } = collectWeakestLinkGaps(root, { adopted: true, isProducer: true });
    expect(gaps.some((g) => g.id === 'enforcement-pre-commit-template-missing')).toBe(true);
  });

  it('reportGithubBranchProtection is honest when gh unavailable or forced fail', () => {
    const report = reportGithubBranchProtection({
      env: { ...process.env, PATH: '/nonexistent-path-for-gh' },
    });
    // Either gh missing or repo unavailable — never fake green required checks
    if (!report.available) {
      expect(report.reason).toMatch(/unavailable|error|gh/i);
    } else {
      expect(report.arkCheckRequired === true || report.arkCheckRequired === false).toBe(true);
    }
  });

  it('treats required check "build" as Ark when that job runs check:architecture', () => {
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'package.json'),
      '{"scripts":{"check:architecture":"npx ark-check --strict-merge"}}\n'
    );
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ci.yml'),
      `name: CI
on: push
jobs:
  build:
    name: Architecture contract
    runs-on: ubuntu-latest
    steps:
      - run: npm run check:architecture
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint
`
    );
    const jobs = jobIdsThatRunArkCheck(root);
    expect(jobs.has('build')).toBe(true);
    expect(jobs.has('Architecture contract')).toBe(true);
    expect(jobs.has('lint')).toBe(false);
    expect(isArkRequiredStatusCheck(root, ['build'])).toBe(false);
    expect(isArkRequiredStatusCheck(root, ['Architecture contract'])).toBe(true);
    expect(isArkRequiredStatusCheck(root, ['lint'])).toBe(false);
    expect(isArkRequiredStatusCheck(root, ['architecture-review'])).toBe(false);
    expect(isArkRequiredStatusCheck(root, ['arkgate-check'])).toBe(false);
  });

  it('requires check:architecture to resolve to an actual Ark command', () => {
    for (const packageJson of [
      '{"name":"missing-script"}\n',
      '{"scripts":{"check:architecture":"echo ok"}}\n',
    ]) {
      const root = mk();
      fs.writeFileSync(path.join(root, 'package.json'), packageJson);
      fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.github/workflows/ci.yml'),
        'jobs:\n  architecture:\n    steps:\n      - run: npm run check:architecture\n'
      );

      expect(detectCiEnforcement(root).hasArkCheckWorkflow).toBe(false);
      expect(jobIdsThatRunArkCheck(root).size).toBe(0);
    }
  });

  it('ignores statically disabled jobs and steps regardless of key order', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ci.yml'),
      `jobs:
  disabled-job:
    if: false
    steps:
      - run: npx ark-check --strict
  disabled-step-before:
    steps:
      - if: false
        run: npx ark-check --strict
  disabled-step-after:
    steps:
      - run: npx ark-check --strict
        if: false
  quoted-disabled-step:
    steps:
      - run: npx ark-check --strict
        "if": false
  non-blocking-step:
    steps:
      - run: npx ark-check --strict
        continue-on-error: true
  dependency-skippable-job:
    needs: build
    steps:
      - run: npx ark-check --strict
`
    );

    expect(detectCiEnforcement(root).hasArkCheckWorkflow).toBe(false);
    expect(jobIdsThatRunArkCheck(root).size).toBe(0);
  });

  it('parses quoted job IDs and non-default indentation', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ci.yml'),
      `jobs:
    "architecture-contract":
        name: 'Architecture contract'
        steps:
            - run: npx ark-check --strict
`
    );

    expect(jobIdsThatRunArkCheck(root)).toEqual(
      new Set(['architecture-contract', 'Architecture contract'])
    );
  });

  it('binds strict flags to the Ark invocation that actually runs', () => {
    const directRoot = mk();
    fs.mkdirSync(path.join(directRoot, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(directRoot, '.github/workflows/ci.yml'),
      'jobs:\n  architecture:\n    steps:\n      - run: npx ark-check\n      - run: echo --strict\n'
    );
    expect(detectCiEnforcement(directRoot)).toMatchObject({
      hasArkCheckWorkflow: true,
      failClosed: false,
    });

    const scriptRoot = mk();
    fs.writeFileSync(
      path.join(scriptRoot, 'package.json'),
      '{"scripts":{"check:architecture":"echo --strict && npx ark-check"}}\n'
    );
    fs.mkdirSync(path.join(scriptRoot, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(scriptRoot, '.github/workflows/ci.yml'),
      'jobs:\n  architecture:\n    steps:\n      - run: npm run check:architecture\n'
    );
    expect(detectCiEnforcement(scriptRoot)).toMatchObject({
      hasArkCheckWorkflow: true,
      failClosed: false,
    });
  });

  it('rejects lookalike commands, shell comments, and folded echo text', () => {
    const cases = [
      'run: npx ark-check-fake --strict-merge-disabled',
      'run: node scripts/fake-ark-check.mjs --strict',
      'run: npm run check:architecture-fake',
      'run: echo ok # && npx ark-check --strict',
      'run: >\n          echo npx\n          ark-check --strict',
    ];
    for (const run of cases) {
      const root = mk();
      fs.writeFileSync(
        path.join(root, 'package.json'),
        '{"scripts":{"check:architecture":"npx ark-check --strict"}}\n'
      );
      fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.github/workflows/ci.yml'),
        `jobs:\n  architecture:\n    steps:\n      - ${run}\n`
      );
      expect(detectCiEnforcement(root).hasArkCheckWorkflow, run).toBe(false);
      expect(jobIdsThatRunArkCheck(root).size, run).toBe(0);
    }
  });

  it('does not parse jobs text embedded in a YAML block scalar', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ci.yml'),
      `name: Docs
description: |
  jobs:
    architecture:
      steps:
        - run: npx ark-check --strict
`
    );
    expect(detectCiEnforcement(root).hasArkCheckWorkflow).toBe(false);
    expect(jobIdsThatRunArkCheck(root).size).toBe(0);
  });

  it('does not treat a swallowed Ark failure as merge enforcement', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ci.yml'),
      'jobs:\n  architecture:\n    steps:\n      - run: npx ark-check --strict || true\n'
    );
    expect(detectCiEnforcement(root)).toMatchObject({
      hasArkCheckWorkflow: true,
      failClosed: false,
    });
    expect(jobIdsThatRunArkCheck(root).size).toBe(0);
  });

  it('does not treat comments, step names, or echo output as an Ark-running job', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ci.yml'),
      `name: CI
on: push
# npx ark-check --strict
jobs:
  architecture-review:
    name: Ark architecture docs
    runs-on: ubuntu-latest
    steps:
      - name: Explain ark-check
        run: echo "npx ark-check --strict"
`
    );

    expect(detectCiEnforcement(root).hasArkCheckWorkflow).toBe(false);
    expect(jobIdsThatRunArkCheck(root).size).toBe(0);
    expect(isArkRequiredStatusCheck(root, ['architecture-review'])).toBe(false);
  });
});
