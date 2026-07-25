import { describe, expect, it } from 'vitest';
import {
  decideCiProfile,
  isCodePath,
  isDocsPath,
  isPerfPath,
} from '../../../scripts/ci-profile.mjs';

describe('ci-profile path classifiers', () => {
  it('classifies code, docs, and perf paths without false docs-only for workflows', () => {
    expect(isCodePath('src/gate.ts')).toBe(true);
    expect(isCodePath('bin/ark-check.mjs')).toBe(true);
    expect(isCodePath('.github/workflows/ci.yml')).toBe(true);
    expect(isCodePath('package.json')).toBe(true);
    expect(isCodePath('docs/README.md')).toBe(false);

    expect(isDocsPath('docs/plans/foo/README.md')).toBe(true);
    expect(isDocsPath('CONTRIBUTING.md')).toBe(true);
    expect(isDocsPath('src/gate.ts')).toBe(false);

    expect(isPerfPath('src/kernel/analysis.ts')).toBe(true);
    expect(isPerfPath('scripts/hook-path-bench.mjs')).toBe(true);
    expect(isPerfPath('eval/performance/hook-budgets.v1.json')).toBe(true);
    expect(isPerfPath('docs/README.md')).toBe(false);
  });
});

describe('decideCiProfile', () => {
  it('uses PR slim defaults for ordinary feature branches', () => {
    const profile = decideCiProfile({
      eventName: 'pull_request',
      refName: 'feat/my-change',
      headRef: 'feat/my-change',
      labels: [],
      changed: ['src/gate.ts'],
    });
    expect(profile.full_matrix).toBe(false);
    expect(profile.docs_only).toBe(false);
    expect(profile.confidence_cmd).toBe('npm run test:coverage');
    expect(profile.fail_fast).toBe(true);
    expect(profile.ts_compat_include).toEqual([
      { node: 20, pm: { name: 'npm', version: '10.8.2' } },
    ]);
    expect(profile.gallery_include).toEqual([
      { pm: { name: 'npm', version: '10.8.2' } },
    ]);
    expect(profile.onboarding_fixtures).toEqual([
      'library/small',
      'api/small',
      'frontend/small',
      'monorepo/small',
    ]);
    expect(profile.run_perf).toBe(true);
    expect(profile.run_packed).toBe(true);
  });

  it('forces full matrix on main push, labels, and release-prep branch names', () => {
    const main = decideCiProfile({
      eventName: 'push',
      refName: 'main',
      changed: ['docs/README.md'],
    });
    expect(main.full_matrix).toBe(true);
    expect(main.docs_only).toBe(false);
    expect(main.confidence_cmd).toBe('npm run test:confidence');
    expect(main.fail_fast).toBe(false);
    expect(main.ts_compat_include).toHaveLength(12);
    expect(main.gallery_include).toHaveLength(3);
    expect(main.onboarding_fixtures).toHaveLength(12);
    expect(main.run_perf).toBe(true);

    const labeled = decideCiProfile({
      eventName: 'pull_request',
      refName: 'feat/x',
      headRef: 'feat/x',
      labels: ['full-matrix'],
      changed: ['README.md'],
    });
    expect(labeled.full_matrix).toBe(true);

    const releaseLabel = decideCiProfile({
      eventName: 'pull_request',
      refName: 'feat/x',
      headRef: 'feat/x',
      labels: ['release'],
      changed: ['README.md'],
    });
    expect(releaseLabel.full_matrix).toBe(true);

    const branch41 = decideCiProfile({
      eventName: 'pull_request',
      refName: 'feat/4.1.0-field-p0-p1-p2',
      headRef: 'feat/4.1.0-field-p0-p1-p2',
      labels: [],
      changed: ['src/gate.ts'],
    });
    expect(branch41.full_matrix).toBe(true);
    expect(branch41.confidence_cmd).toBe('npm run test:confidence');
  });

  it('detects docs-only PRs and skips packed/onboarding/perf', () => {
    const profile = decideCiProfile({
      eventName: 'pull_request',
      refName: 'docs/fix-typo',
      headRef: 'docs/fix-typo',
      labels: [],
      changed: ['docs/README.md', 'CONTRIBUTING.md', 'docs/plans/x/README.md'],
    });
    expect(profile.docs_only).toBe(true);
    expect(profile.code).toBe(false);
    expect(profile.run_packed).toBe(false);
    expect(profile.run_onboarding).toBe(false);
    expect(profile.run_perf).toBe(false);
    expect(profile.confidence_cmd).toBe('npm run test:coverage');
  });

  it('treats mixed docs+code as code and skips perf when only non-perf code paths change', () => {
    const mixed = decideCiProfile({
      eventName: 'pull_request',
      refName: 'feat/mixed',
      headRef: 'feat/mixed',
      labels: [],
      changed: ['docs/README.md', 'templates/skills/foo.md'],
    });
    expect(mixed.docs_only).toBe(false);
    expect(mixed.code).toBe(true);
    expect(mixed.run_packed).toBe(true);
    // templates are code surface but not perf paths
    expect(mixed.run_perf).toBe(false);

    const testsOnly = decideCiProfile({
      eventName: 'pull_request',
      refName: 'feat/tests',
      headRef: 'feat/tests',
      labels: [],
      changed: ['tests/unit/smoke.test.ts'],
    });
    expect(testsOnly.run_perf).toBe(false);
    expect(testsOnly.run_packed).toBe(true);
  });
});
