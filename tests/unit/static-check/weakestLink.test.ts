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
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ci.yml'),
      `name: CI
on: push
jobs:
  build:
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
    expect(jobs.has('lint')).toBe(false);
    expect(isArkRequiredStatusCheck(root, ['build'])).toBe(true);
    expect(isArkRequiredStatusCheck(root, ['lint'])).toBe(false);
    expect(isArkRequiredStatusCheck(root, ['arkgate-check'])).toBe(true);
  });
});
