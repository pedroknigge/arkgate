/**
 * Phase EH (4.1.1) — enforcement evidence + docs truth.
 * Focused unit tests: gitignore coverage, soft-write honesty, provider policy, repair split.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  arkGitignoreAppendDecision,
  gitignoreCoversArkState,
  gitignoreHasArkNegationException,
  archiveReportSnapshots,
} from '../../../bin/lib/html-report.mjs';
import {
  buildBaselineHonesty,
  buildCoverageHonesty,
  buildProductHonesty,
  buildWritePathHonesty,
  computeDoctorEnforcementHonesty,
} from '../../../bin/lib/enforcement-honesty.mjs';
import {
  classifyGithubProviderFailure,
  reportGithubBranchProtection,
  reportGithubCiRuntime,
} from '../../../bin/lib/github-enforcement.mjs';
import { withCiProviderEvidence } from '../../../bin/lib/enforcement-state.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';
import {
  hostRepairCapabilities,
  HOST_SUPPORT_MATRIX,
} from '../../../bin/lib/host-support-matrix.mjs';
import { githubWorkflow, packageManager } from '../../../bin/lib/ci-and-commands.mjs';

const temps: string[] = [];

function mk(prefix = 'ark-eh-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(root);
  return root;
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
  return full;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('EH03 gitignore Ark coverage', () => {
  it('recognizes .ark/*, /.ark/*, and .ark/reports/ as coverage', () => {
    expect(gitignoreCoversArkState('.ark/\n')).toBe(true);
    expect(gitignoreCoversArkState('.ark\n')).toBe(true);
    expect(gitignoreCoversArkState('/.ark/\n')).toBe(true);
    expect(gitignoreCoversArkState('**/.ark/\n')).toBe(true);
    expect(gitignoreCoversArkState('.ark/*\n')).toBe(true);
    expect(gitignoreCoversArkState('/.ark/*\n')).toBe(true);
    expect(gitignoreCoversArkState('.ark/reports/\n')).toBe(true);
    expect(gitignoreCoversArkState('/.ark/reports/*\n')).toBe(true);
    expect(gitignoreCoversArkState('node_modules/\n')).toBe(false);
  });

  it('does not append broad .ark/ when .ark/* + ! exception already covers intent', () => {
    const text = 'node_modules/\n.ark/*\n!/.ark/golden-pattern.json\n';
    expect(gitignoreCoversArkState(text)).toBe(true);
    expect(gitignoreHasArkNegationException(text)).toBe(true);
    expect(arkGitignoreAppendDecision(text)).toEqual({
      append: false,
      rule: null,
      reason: 'already-covered',
    });
  });

  it('appends narrow .ark/reports/ when only a ! exception policy is present', () => {
    const text = 'node_modules/\n!/.ark/golden-pattern.json\n';
    expect(gitignoreCoversArkState(text)).toBe(false);
    expect(gitignoreHasArkNegationException(text)).toBe(true);
    expect(arkGitignoreAppendDecision(text)).toEqual({
      append: true,
      rule: '.ark/reports/',
      reason: 'append-narrow-reports',
    });
  });

  it('appends .ark/ only when uncovered and no negation policy', () => {
    expect(arkGitignoreAppendDecision('node_modules/\n')).toEqual({
      append: true,
      rule: '.ark/',
      reason: 'append-broad',
    });
  });

  it('archiveReportSnapshots does not dirty a compatible .ark/* + exception tree', () => {
    const root = mk('ark-eh-gi-');
    write(root, 'package.json', '{"name":"eh-gi"}\n');
    const gi = 'node_modules/\n.ark/*\n!/.ark/golden-pattern.json\n';
    write(root, '.gitignore', gi);
    archiveReportSnapshots(root, {
      html: '<html></html>',
      snapshot: { score: 1, date: '2026-07-25' },
      noArchive: true,
    });
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe(gi);
  });

  it('archiveReportSnapshots appends .ark/ on uncovered tree', () => {
    const root = mk('ark-eh-gi-append-');
    write(root, 'package.json', '{"name":"eh-gi-append"}\n');
    write(root, '.gitignore', 'node_modules/\n');
    archiveReportSnapshots(root, {
      html: '<html></html>',
      snapshot: { score: 1, date: '2026-07-25' },
      noArchive: true,
    });
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toMatch(/\.ark\//);
  });
});

describe('EH05 product honesty soft-write reclassification', () => {
  it('soft-write alone does not force unfinished or Not finished headline', () => {
    const honesty = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 20 }),
      baselineHonesty: buildBaselineHonesty({ exists: false }),
      writePathHonesty: {
        advisory: true,
        softWriteHost: true,
        activeHost: 'opencode',
        message: 'OpenCode: write path is advisory',
      },
      operatingMode: 'enforce',
      activeBlockingViolations: 0,
    });
    expect(honesty.unfinished).toBe(false);
    expect(honesty.finished).toBe(true);
    expect(honesty.reasonIds).toContain('soft-write-host');
    expect(honesty.environmentResidualIds).toContain('soft-write-host');
    expect(honesty.architectureReasonIds).not.toContain('soft-write-host');
    expect(honesty.contractReadiness).toBe('ready');
    expect(honesty.localWriteBoundary).toBe('advisory');
    expect(honesty.headline).toMatch(/Architecture contract ready/i);
    expect(honesty.headline).toMatch(/OpenCode local writes are advisory/i);
    expect(honesty.headline).not.toMatch(/^Not finished$/i);
    expect(honesty.primaryNextAction).toMatch(/required GitHub status context|status context/i);
    expect(honesty.primaryNextAction).toMatch(/arkgate-check --strict-merge|ark-check --strict-merge/);
    expect(honesty.notAScore).toBe(true);
  });

  it('soft-write + blocking debt still unfinished', () => {
    const honesty = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 20 }),
      baselineHonesty: buildBaselineHonesty({
        exists: false,
        activeViolations: 3,
        totalViolations: 3,
      }),
      writePathHonesty: buildWritePathHonesty('opencode', false),
      activeBlockingViolations: 3,
    });
    expect(honesty.unfinished).toBe(true);
    expect(honesty.reasonIds).toEqual(
      expect.arrayContaining(['active-blocking-violations', 'soft-write-host'])
    );
    expect(honesty.architectureReasonIds).toContain('active-blocking-violations');
    expect(honesty.headline).toMatch(/Not finished/i);
  });

  it('soft-write + design-weak stays unfinished (architecture residual)', () => {
    const honesty = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 20 }),
      baselineHonesty: buildBaselineHonesty({ exists: false }),
      writePathHonesty: buildWritePathHonesty('opencode', false),
      designWeak: true,
      designWeakLabel: 'ENFORCE · design-weak residual',
      activeBlockingViolations: 0,
    });
    expect(honesty.unfinished).toBe(true);
    expect(honesty.finished).toBe(false);
    expect(honesty.reasonIds).toEqual(expect.arrayContaining(['design-weak', 'soft-write-host']));
    expect(honesty.architectureReasonIds).toContain('design-weak');
    expect(honesty.environmentResidualIds).toContain('soft-write-host');
    expect(honesty.headline).toMatch(/Not finished/i);
  });

  it('synthetic non-environment reason ids still force unfinished (deny-list env)', () => {
    // Future reasons must default to architecture debt unless added to ENVIRONMENT_REASON_IDS.
    const honesty = buildProductHonesty({
      coverageHonesty: buildCoverageHonesty({ percent: 100, totalFiles: 10 }),
      baselineHonesty: buildBaselineHonesty({ exists: false }),
      residualPilots: true,
      pilotTarget: 'src/future.ts',
    });
    expect(honesty.unfinished).toBe(true);
    expect(honesty.architectureReasonIds).toContain('residual-pilot');
  });

  it('computeDoctorEnforcementHonesty keeps unobserved Codex hard write unverified', () => {
    const bundle = computeDoctorEnforcementHonesty({
      governedPercent: 100,
      totalFiles: 40,
      emptyScope: false,
      baselineExists: true,
      frozenKeys: 0,
      activeViolations: 0,
      activeBlockingViolations: 0,
      suppressed: 0,
      totalViolations: 0,
      activeHost: 'codex',
      hardWriteActive: false,
      operatingMode: 'enforce',
    });
    expect(bundle.productHonesty.unfinished).toBe(false);
    expect(bundle.productHonesty.finished).toBe(true);
    expect(bundle.productHonesty.localWriteBoundary).toBe('unverified');
    expect(bundle.writePathHonesty.softWriteHost).toBe(false);
    expect(bundle.writePathHonesty.hardWriteUnverified).toBe(true);
  });
});

describe('EH06 provider policy vs CI runtime', () => {
  it('classifies only explicit plan/upgrade language as unavailable-plan', () => {
    expect(
      classifyGithubProviderFailure('Upgrade to GitHub Pro to use branch protection on private repos')
    ).toBe('provider-policy-unavailable-plan');
    expect(
      classifyGithubProviderFailure('Branch protection is only available with GitHub Team')
    ).toBe('provider-policy-unavailable-plan');
    // Token / SSO / generic 403 — never overclaim Free-plan walls
    expect(
      classifyGithubProviderFailure('gh: HTTP 403: Resource not accessible by integration')
    ).toBe('provider-enforcement-unverified');
    expect(classifyGithubProviderFailure('HTTP 403\n{"message":"Not Found"}')).toBe(
      'provider-enforcement-unverified'
    );
    expect(classifyGithubProviderFailure('connection reset by peer')).toBe(
      'provider-enforcement-unverified'
    );
  });

  it('withCiProviderEvidence: plan language → required false; generic unverified stays unverified', () => {
    const root = mk('ark-eh-ci-');
    write(
      root,
      'package.json',
      JSON.stringify({
        name: 'eh-ci',
        version: '1.0.0',
        devDependencies: { arkgate: '4.1.1' },
        scripts: { 'check:architecture': 'npx ark-check --strict-merge' },
      })
    );
    write(
      root,
      '.github/workflows/ark-check.yml',
      'name: Ark\njobs:\n  ark-check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ark-check --strict-merge\n'
    );
    write(root, 'node_modules/arkgate/package.json', JSON.stringify({ name: 'arkgate', version: '4.1.1' }));
    write(root, 'node_modules/arkgate/bin/ark-check.mjs', '#!/usr/bin/env node\n');

    const base = detectWritePathCapabilities(root, 'codex');
    const planAttached = withCiProviderEvidence(base, {
      available: false,
      reason: 'provider-policy-unavailable-plan',
      policyReason: 'unavailable-plan',
      arkCheckRequired: 'unverified',
      runtimeObserved: true,
      latestCiRun: 'success',
      repo: 'acme/private',
      branch: 'main',
    });
    expect(planAttached.enforcementState.ciMerge.runtimeObserved).toBe(true);
    expect(planAttached.enforcementState.ciMerge.required).toBe(false);
    expect(planAttached.enforcementState.ciMerge.hard).toBe(false);
    expect(planAttached.providerEnforcement?.reason).toBe('provider-policy-unavailable-plan');

    const generic = withCiProviderEvidence(base, {
      available: false,
      reason: 'provider-enforcement-unverified',
      runtimeObserved: true,
      latestCiRun: 'success',
      repo: 'acme/private',
      branch: 'main',
    });
    expect(generic.enforcementState.ciMerge.runtimeObserved).toBe(true);
    expect(generic.enforcementState.ciMerge.required).toBe('unverified');
    expect(generic.enforcementState.ciMerge.hard).toBe(false);

    // Policy available alone must not invent runtimeObserved (EH06 honesty).
    const policyOnly = withCiProviderEvidence(base, {
      available: true,
      reason: 'ok',
      arkCheckRequired: true,
      arkCheckSourceBound: false,
      repo: 'acme/private',
      branch: 'main',
    });
    expect(policyOnly.enforcementState.ciMerge.runtimeObserved).toBe(false);
    expect(policyOnly.enforcementState.ciMerge.required).toBe(true);
  });

  it('reportGithubBranchProtection: generic dual 403 is unverified; plan language is unavailable-plan', () => {
    const root = mk('ark-eh-gh-');
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    write(root, 'package.json', '{"scripts":{"check:architecture":"npx ark-check --strict"}}\n');
    write(
      root,
      '.github/workflows/ci.yml',
      'jobs:\n  architecture:\n    steps:\n      - run: npm run check:architecture\n'
    );
    const ghGeneric = write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'if [ "$1" = "run" ]; then echo \'[{"name":"Ark architecture gate","conclusion":"success","workflowName":"Ark architecture gate"}]\'; exit 0; fi\n' +
        'if [ "$1" = "api" ]; then echo "HTTP 403: Resource not accessible by integration" >&2; exit 1; fi\n' +
        'exit 1\n'
    );
    fs.chmodSync(ghGeneric, 0o755);
    const generic = reportGithubBranchProtection({
      cwd: root,
      repo: 'acme/private',
      branch: 'main',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    });
    expect(generic.available).toBe(false);
    expect(generic.reason).toBe('provider-enforcement-unverified');
    expect(generic.runtimeObserved).toBe(true);

    const ghPlan = write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'if [ "$1" = "run" ]; then echo \'[{"name":"Ark architecture gate","conclusion":"success","workflowName":"Ark architecture gate"}]\'; exit 0; fi\n' +
        'if [ "$1" = "api" ]; then echo "Upgrade to GitHub Pro to enable branch protection on private repositories" >&2; exit 1; fi\n' +
        'exit 1\n'
    );
    fs.chmodSync(ghPlan, 0o755);
    const plan = reportGithubBranchProtection({
      cwd: root,
      repo: 'acme/private',
      branch: 'main',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    });
    expect(plan.reason).toBe('provider-policy-unavailable-plan');
    expect(plan.policyReason).toBe('unavailable-plan');
    expect(plan.runtimeObserved).toBe(true);
  });

  it('reportGithubCiRuntime finds successful ark-named runs; lint-only is not observed', () => {
    const root = mk('ark-eh-run-');
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    const gh = write(
      bin,
      'gh',
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "gh 9"; exit 0; fi\n' +
        'if [ "$1" = "run" ]; then\n' +
        '  if [ -n "$GH_RUNS" ]; then printf "%s\\n" "$GH_RUNS"; exit 0; fi\n' +
        '  echo \'[{"name":"lint","conclusion":"success"},{"name":"ark-check","conclusion":"success","workflowName":"Ark"}]\'; exit 0\n' +
        'fi\n' +
        'exit 1\n'
    );
    fs.chmodSync(gh, 0o755);
    const withPath = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const runtime = reportGithubCiRuntime({ cwd: root, env: withPath });
    expect(runtime.runtimeObserved).toBe(true);
    expect(runtime.latestCiRun).toBe('success');

    const lintOnly = reportGithubCiRuntime({
      cwd: root,
      env: {
        ...withPath,
        GH_RUNS: JSON.stringify([
          { name: 'lint', conclusion: 'success', workflowName: 'CI' },
          { name: 'test', conclusion: 'success', workflowName: 'spark-ci' },
          { name: 'dark-theme build', conclusion: 'success' },
        ]),
      },
    });
    expect(lintOnly.runtimeObserved).toBe(false);
    expect(lintOnly.reason).toBe('ci-runtime-no-ark-runs');
  });
});

describe('EH07 repair envelope vs reinjection + ops matrix', () => {
  it('Codex emits repair envelope but never guarantees reinjection', () => {
    const caps = hostRepairCapabilities('codex');
    expect(caps.repairEnvelopeEmitted).toBe(true);
    expect(caps.repairReinjectionGuaranteed).toBe(false);
    expect(caps.operationCoverage.apply_patch).toBe(true);
    expect(caps.operationCoverage.shell).toBe(false);
    expect(caps.operationCoverage['pre-commit']).toBe(false);
    expect(HOST_SUPPORT_MATRIX.codex.capabilities['repair-payload']).toBe(false);
    expect(HOST_SUPPORT_MATRIX.claude.capabilities['repair-reinjection-guaranteed']).toBe(true);
  });

  it('Codex writePath.support (not inventory) drives envelope-only doctor Repair line', () => {
    const root = mk('ark-eh-repair-');
    write(root, 'package.json', '{"name":"eh-repair"}\n');
    const writePath = detectWritePathCapabilities(root, 'codex');
    // Inventory historical key stays false; support profile carries EH07 envelope flag.
    expect(writePath.capabilities['repair-payload']).toBe(false);
    expect(writePath.capabilities['repair-envelope-emitted']).not.toBe(true);
    expect(writePath.support?.capabilities?.['repair-envelope-emitted']).toBe(true);
    expect(writePath.support?.capabilities?.['repair-reinjection-guaranteed']).toBe(false);
    // Same selection doctor-plan uses for the Repair: line (support, not inventory).
    const sc = writePath.support?.capabilities || {};
    const repairReinjection = sc['repair-reinjection-guaranteed'] === true;
    const repairEnvelope = sc['repair-envelope-emitted'] === true || sc['repair-payload'] === true;
    expect(repairReinjection).toBe(false);
    expect(repairEnvelope).toBe(true);
    expect(writePath.supportSummary).toMatch(/envelope may emit|reinjection not guaranteed/i);
    expect(writePath.supportSummary).not.toMatch(/no hard-boundary repair/);
  });
});

describe('EH04 first-push-safe CI template', () => {
  it('generated workflow guards unresolvable base-ref and keeps strict-merge', () => {
    const root = mk('ark-eh-wf-');
    write(root, 'package.json', '{"name":"eh-wf"}\n');
    const pm = packageManager(root);
    const yml = githubWorkflow(pm, { kind: 'default', value: '20' });
    expect(yml).toMatch(/git cat-file -e/);
    expect(yml).toMatch(/0\{40,64\}/);
    expect(yml).toMatch(/--fail-on-new-smells/);
    expect(yml).toMatch(/--strict-merge|--strict /);
    // Optional fetch when SHA present but not local (parity with action.yml)
    expect(yml).toMatch(/git fetch --no-tags --depth=1 origin/);
    // When base is missing, the script still runs pm.run (strict merge) without delta smells only path.
    expect(yml).toMatch(/export ARK_POLICY_BASE_REF=""/);
    // if/else: delta path vs full merge without fail-on-new-smells only on missing base
    expect(yml).toMatch(/fail-on-new-smells --base-ref/);
    expect(yml).toMatch(/else[\s\S]*export ARK_POLICY_BASE_REF=""/);
  });
});
