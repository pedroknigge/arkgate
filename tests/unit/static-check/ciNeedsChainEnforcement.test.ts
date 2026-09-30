/**
 * Regression: a CI job with `needs:` on an unconditional profile job (this repo's own
 * `build` job) must count as a fail-closed Ark merge gate, while jobs that a profile
 * output can intentionally skip (skip reports success) or that continue on error must not.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { githubEvidenceForCiMergeBoundary } from '../../../bin/lib/adoption-stance.mjs';
import { buildCiMergeBoundary } from '../../../bin/lib/ci-merge-boundary.mjs';
import { withCiProviderEvidence } from '../../../bin/lib/enforcement-state.mjs';
import { inspectArkCiGate } from '../../../bin/lib/gate-files.mjs';
import { GITHUB_ACTIONS_APP_ID } from '../../../bin/lib/github-enforcement.mjs';
import {
  collectWeakestLinkGaps,
  detectCiEnforcement,
  isArkRequiredStatusCheck,
  jobIdsThatRunArkCheck,
  reportGithubBranchProtection,
} from '../../../bin/lib/weakest-link.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';

const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const SELF_HOST_SCRIPT = 'node bin/ark-check.mjs --root . --config ark.config.json --strict';

function write(root: string, relativePath: string, content: string) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function repo(workflow: string, script = SELF_HOST_SCRIPT) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ci-needs-'));
  write(root, 'package.json', `${JSON.stringify({ scripts: { 'check:architecture': script } })}\n`);
  write(root, '.github/workflows/ci.yml', workflow);
  return root;
}

/** Mirrors .github/workflows/ci.yml: profile job, profile-gated jobs, `build` needs ci-profile. */
function repoShapedWorkflow(buildControl = '') {
  return `name: CI
on:
  pull_request:
jobs:
  ci-profile:
    name: CI profile
    runs-on: ubuntu-latest
    outputs:
      docs_only: \${{ steps.decide.outputs.docs_only }}
      run_perf: \${{ steps.decide.outputs.run_perf }}
    steps:
      - id: decide
        run: node scripts/ci-profile.mjs
  performance:
    name: Performance budgets
    needs: ci-profile
    if: needs.ci-profile.outputs.run_perf == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: npm run perf
  # Required status check name: "build" (branch protection). Always runs.
  build:
    needs: ci-profile
${buildControl}    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - name: Test suite (profile confidence_cmd)
        env:
          CONFIDENCE_CMD: \${{ needs.ci-profile.outputs.confidence_cmd }}
        run: |
          set -euo pipefail
          case "$CONFIDENCE_CMD" in
            'npm run test:coverage') npm run test:coverage ;;
            *) exit 1 ;;
          esac
      - name: Gate/runtime package isolation smoke
        if: needs.ci-profile.outputs.docs_only != 'true'
        run: npm run test:package-isolation
      - name: Architecture gate (ark-check)
        run: npm run check:architecture
        env:
          ARK_POLICY_BASE_REF: \${{ github.event.pull_request.base.sha || github.event.before }}
  node-compat:
    name: Node \${{ matrix.node }}
    needs: ci-profile
    if: needs.ci-profile.outputs.docs_only != 'true'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - run: node bin/ark-check.mjs --version
`;
}

type Spawned = { status: number; stdout: string; stderr: string };

function fakeGh(classic: object, rules: unknown[] = []) {
  return (_cmd: string, args: string[]): Spawned => {
    if (args[0] === '--version') return { status: 0, stdout: 'gh 9', stderr: '' };
    if (args[0] === 'api' && String(args[1]).includes('/rules/branches/')) {
      return { status: 0, stdout: JSON.stringify(rules), stderr: '' };
    }
    if (args[0] === 'api') return { status: 0, stdout: JSON.stringify(classic), stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected' };
  };
}

function protection(root: string, contexts: string[], appId: number | null = GITHUB_ACTIONS_APP_ID) {
  return reportGithubBranchProtection({
    cwd: root,
    repo: 'acme/repo',
    branch: 'main',
    includeCiRuntime: false,
    run: fakeGh({
      strict: true,
      contexts,
      checks: contexts.map((context) => ({ context, app_id: appId })),
      enforcesAdmins: false,
    }),
  });
}

describe('CI needs-chain merge-gate evidence', () => {
  it('recognizes a build job that needs an unconditional profile job (repo shape)', () => {
    const root = repo(repoShapedWorkflow());
    expect(detectCiEnforcement(root)).toMatchObject({
      hasArkCheckWorkflow: true,
      failClosed: true,
      arkWorkflowFiles: ['.github/workflows/ci.yml'],
    });
    expect(inspectArkCiGate(root)).toMatchObject({ failClosed: true, present: true });
    expect(jobIdsThatRunArkCheck(root)).toEqual(new Set(['build']));
    const writePath = detectWritePathCapabilities(root, 'claude');
    expect(writePath.capabilities['merge-gate']).toBe(true);
  });

  it('treats `if: true` and `if: always()` on the Ark job like the default', () => {
    for (const control of ['    if: true\n', '    if: always()\n', '    if: ${{ always() }}\n']) {
      expect(detectCiEnforcement(repo(repoShapedWorkflow(control))).failClosed).toBe(true);
    }
  });

  it('stays strict when a profile output, continue-on-error, or the chain can skip the job', () => {
    const skippable = [
      "    if: needs.ci-profile.outputs.docs_only != 'true'\n",
      '    if: ${{ !cancelled() }}\n',
      '    continue-on-error: true\n',
    ];
    for (const control of skippable) {
      const root = repo(repoShapedWorkflow(control));
      expect(detectCiEnforcement(root).failClosed, control).toBe(false);
      expect(inspectArkCiGate(root).failClosed, control).toBe(false);
      expect(jobIdsThatRunArkCheck(root).size, control).toBe(0);
    }

    const conditionalUpstream = repo(`jobs:
  ci-profile:
    runs-on: ubuntu-latest
    steps:
      - run: echo profile
  prep:
    needs: ci-profile
    if: needs.ci-profile.outputs.code == 'true'
    steps:
      - run: echo prep
  build:
    needs: [ci-profile, prep]
    steps:
      - run: npm run check:architecture
`);
    expect(detectCiEnforcement(conditionalUpstream).failClosed).toBe(false);
    // Presence is still honest: the YAML runs Ark when scheduled.
    expect(inspectArkCiGate(conditionalUpstream)).toMatchObject({ failClosed: false, present: true });

    const expressionNeeds = repo(`jobs:
  build:
    needs: \${{ fromJSON(inputs.jobs) }}
    steps:
      - run: npm run check:architecture
`);
    expect(detectCiEnforcement(expressionNeeds).failClosed).toBe(false);
  });

  it('keeps an always() aggregate over conditional jobs fail-closed', () => {
    const root = repo(`jobs:
  prep:
    if: github.event_name == 'push'
    steps:
      - run: echo prep
  gate:
    name: Architecture gate
    needs: prep
    if: \${{ always() }}
    steps:
      - run: npm run check:architecture
`);
    expect(detectCiEnforcement(root).failClosed).toBe(true);
    expect(isArkRequiredStatusCheck(root, ['Architecture gate'])).toBe(true);
  });

  it('only calls the Ark context required when every job that can skip it is required too', () => {
    const root = repo(repoShapedWorkflow());

    const closed = protection(root, ['CI profile', 'build', 'Performance budgets']);
    expect(closed).toMatchObject({
      available: true,
      arkCheckRequired: true,
      arkCheckSourceBound: true,
      arkCheckUpstreamNotRequired: [],
    });
    expect(isArkRequiredStatusCheck(root, ['CI profile', 'build'])).toBe(true);

    // ci-profile failure would skip build, and a skipped job satisfies protection.
    const open = protection(root, ['build']);
    expect(open).toMatchObject({
      available: true,
      arkCheckRequired: 'unverified',
      arkCheckUpstreamNotRequired: ['CI profile'],
    });
    expect(isArkRequiredStatusCheck(root, ['build'])).toBe(false);

    // Unbound checks stay required but not source-bound; other apps stay unverified.
    expect(protection(root, ['CI profile', 'build'], null)).toMatchObject({
      arkCheckRequired: true,
      arkCheckSourceBound: false,
    });
    expect(protection(root, ['CI profile', 'build'], 42).arkCheckRequired).toBe('unverified');

    // Not required at all remains proven absence.
    expect(protection(root, ['CI profile']).arkCheckRequired).toBe(false);
  });

  it('names the unrequired upstream as a weakest-link gap', () => {
    const root = repo(repoShapedWorkflow());
    const bin = path.join(root, 'fake-bin');
    write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'if [ "$1" = "repo" ]; then echo \'{"nameWithOwner":"acme/repo","defaultBranchRef":{"name":"main"}}\'; exit 0; fi\n' +
        'if [ "$1" = "run" ]; then echo \'[]\'; exit 0; fi\n' +
        'if [ "$1" = "api" ]; then case "$*" in *rules/branches*) echo \'[]\';; ' +
        `*) echo '{"strict":true,"contexts":["build"],"checks":[{"context":"build","app_id":${GITHUB_ACTIONS_APP_ID}}]}';; esac; exit 0; fi\n` +
        'exit 1\n'
    );
    fs.chmodSync(path.join(bin, 'gh'), 0o755);
    const previous = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${previous}`;
    try {
      const report = collectWeakestLinkGaps(root, { adopted: true, isProducer: false, includeGithub: true });
      expect(report.github?.arkCheckRequired).toBe('unverified');
      const gap = report.gaps.find((entry) => entry.id === 'enforcement-ark-check-upstream-not-required');
      expect(gap?.message).toContain('CI profile');
      expect(report.gaps.map((entry) => entry.id)).not.toContain('enforcement-ark-check-not-required');
    } finally {
      process.env.PATH = previous;
    }
  });

  it('cannot close the chain through a matrix upstream name', () => {
    const root = repo(`jobs:
  compat:
    name: Node \${{ matrix.node }}
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - run: echo compat
  build:
    needs: compat
    steps:
      - run: npm run check:architecture
`);
    expect(detectCiEnforcement(root).failClosed).toBe(true);
    expect(protection(root, ['build', 'Node 20', 'Node 22'])).toMatchObject({
      arkCheckRequired: 'unverified',
      arkCheckUpstreamNotRequired: ['<dynamic>'],
    });
  });

  it('projects required provider evidence into ci-merge-boundary', () => {
    const root = repo(repoShapedWorkflow());
    const github = protection(root, ['CI profile', 'build']);
    const writePath = withCiProviderEvidence(detectWritePathCapabilities(root, 'claude'), github);
    const boundary = buildCiMergeBoundary({
      writePath,
      github: githubEvidenceForCiMergeBoundary(
        { enforcement: { ci: detectCiEnforcement(root), github } },
        writePath
      ),
    });
    expect(boundary.ci).toEqual({
      workflowPresent: true,
      requiredStatusConfigured: true,
      state: 'required',
    });
  });

  it('doctor reports the workflow as present without provider evidence', () => {
    const root = repo(repoShapedWorkflow(), 'npx ark-check --root . --config ark.config.json --strict');
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
    const env = { ...process.env };
    delete env.ARK_DOCTOR_GITHUB;
    const result = spawnSync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
      { cwd: root, env, encoding: 'utf8' }
    );
    const doctor = JSON.parse(result.stdout).doctor;
    expect(doctor.ciMergeBoundary.ci).toEqual({
      workflowPresent: true,
      requiredStatusConfigured: false,
      state: 'present-but-not-required',
    });
  });
});
