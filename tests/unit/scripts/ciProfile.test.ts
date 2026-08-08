import { describe, expect, it } from 'vitest';
import {
  decideCiProfile,
  isCodePath,
  isDocsPath,
  isHygienePath,
  isPerfPath,
} from '../../../scripts/ci-profile.mjs';

const Q06 = 'tests/unit/static-check/q06ReleaseSurfaces.test.ts';

describe('ci-profile path classifiers', () => {
  it('classifies code, docs, hygiene, and perf paths without false docs-only for workflows', () => {
    expect(isCodePath('src/gate.ts')).toBe(true);
    expect(isCodePath('bin/ark-check.mjs')).toBe(true);
    expect(isCodePath('.github/workflows/ci.yml')).toBe(true);
    expect(isCodePath('package.json')).toBe(true);
    expect(isCodePath('docs/README.md')).toBe(false);

    expect(isDocsPath('docs/plans/foo/README.md')).toBe(true);
    expect(isDocsPath('CONTRIBUTING.md')).toBe(true);
    expect(isDocsPath('src/gate.ts')).toBe(false);

    expect(isHygienePath('docs/README.md')).toBe(true);
    expect(isHygienePath('CHANGELOG.md')).toBe(true);
    expect(isHygienePath('package.json')).toBe(true);
    expect(isHygienePath('package-lock.json')).toBe(true);
    expect(isHygienePath(Q06)).toBe(true);
    expect(isHygienePath('src/gate.ts')).toBe(false);
    expect(isHygienePath('tests/unit/smoke.test.ts')).toBe(false);
    expect(isHygienePath('.github/workflows/ci.yml')).toBe(false);

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
    expect(profile.hygiene).toBe(false);
    expect(profile.profile).toBe('code');
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
    expect(main.hygiene).toBe(false);
    expect(main.profile).toBe('full_matrix');
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
    expect(profile.hygiene).toBe(false);
    expect(profile.profile).toBe('docs_only');
    expect(profile.code).toBe(false);
    expect(profile.run_packed).toBe(false);
    expect(profile.run_onboarding).toBe(false);
    expect(profile.run_perf).toBe(false);
    expect(profile.confidence_cmd).toBe('npm run test:coverage');
  });

  it('classifies hygiene PRs (lock ± package.json-with-lock ± docs ± q06) and skips heavy matrices', () => {
    const cases: Array<{ label: string; changed: string[] }> = [
      { label: 'lockfile alone', changed: ['package-lock.json'] },
      { label: 'docs+lock', changed: ['docs/releases/4.2.0.md', 'package-lock.json'] },
      {
        label: 'docs+package.json+lock',
        changed: ['CHANGELOG.md', 'package.json', 'package-lock.json'],
      },
      {
        label: 'docs+lock+q06',
        changed: [
          'docs/README.md',
          'ROADMAP.md',
          'package.json',
          'package-lock.json',
          Q06,
        ],
      },
      { label: 'q06 + lock only', changed: [Q06, 'package-lock.json'] },
      { label: 'q06 alone', changed: [Q06] },
    ];

    for (const { label, changed } of cases) {
      const profile = decideCiProfile({
        eventName: 'pull_request',
        refName: 'chore/supply-chain',
        headRef: 'chore/supply-chain',
        labels: [],
        changed,
      });
      expect(profile.hygiene, label).toBe(true);
      expect(profile.docs_only, label).toBe(false);
      expect(profile.profile, label).toBe('hygiene');
      expect(profile.full_matrix, label).toBe(false);
      // code is a path diagnostic (manifest/tests are code paths), not the CI tier
      expect(profile.code, label).toBe(true);
      expect(profile.run_packed, label).toBe(false);
      expect(profile.run_onboarding, label).toBe(false);
      expect(profile.run_perf, label).toBe(false);
      expect(profile.confidence_cmd, label).toBe('npm run test:coverage');
      expect(profile.fail_fast, label).toBe(true);
    }
  });

  it('package.json without lockfile stays on code path (packaging-sensitive)', () => {
    const alone = decideCiProfile({
      eventName: 'pull_request',
      refName: 'chore/exports',
      headRef: 'chore/exports',
      labels: [],
      changed: ['package.json'],
    });
    expect(alone.hygiene).toBe(false);
    expect(alone.profile).toBe('code');
    expect(alone.run_packed).toBe(true);
    expect(alone.run_onboarding).toBe(true);

    const docsAndPkg = decideCiProfile({
      eventName: 'pull_request',
      refName: 'chore/pkg-docs',
      headRef: 'chore/pkg-docs',
      labels: [],
      changed: ['package.json', 'docs/README.md'],
    });
    expect(docsAndPkg.hygiene).toBe(false);
    expect(docsAndPkg.profile).toBe('code');
    expect(docsAndPkg.run_packed).toBe(true);

    const pkgAndQ06 = decideCiProfile({
      eventName: 'pull_request',
      refName: 'chore/pkg-q06',
      headRef: 'chore/pkg-q06',
      labels: [],
      changed: ['package.json', Q06],
    });
    expect(pkgAndQ06.hygiene).toBe(false);
    expect(pkgAndQ06.profile).toBe('code');
    expect(pkgAndQ06.run_packed).toBe(true);
  });

  it('docs+src is code path, not hygiene or docs_only', () => {
    const profile = decideCiProfile({
      eventName: 'pull_request',
      refName: 'feat/docs-and-src',
      headRef: 'feat/docs-and-src',
      labels: [],
      changed: ['docs/README.md', 'src/gate.ts'],
    });
    expect(profile.hygiene).toBe(false);
    expect(profile.docs_only).toBe(false);
    expect(profile.profile).toBe('code');
    expect(profile.code).toBe(true);
    expect(profile.run_packed).toBe(true);
    expect(profile.run_onboarding).toBe(true);
  });

  it('non-allowlisted tests with lockfile stay on code path', () => {
    const profile = decideCiProfile({
      eventName: 'pull_request',
      refName: 'feat/lock-and-smoke',
      headRef: 'feat/lock-and-smoke',
      labels: [],
      changed: ['package-lock.json', 'tests/unit/smoke.test.ts'],
    });
    expect(profile.hygiene).toBe(false);
    expect(profile.profile).toBe('code');
    expect(profile.run_packed).toBe(true);
    expect(profile.run_onboarding).toBe(true);
  });

  it('workflow changes stay on code path even with docs+lock', () => {
    const profile = decideCiProfile({
      eventName: 'pull_request',
      refName: 'chore/ci',
      headRef: 'chore/ci',
      labels: [],
      changed: ['docs/README.md', 'package.json', '.github/workflows/ci.yml'],
    });
    expect(profile.hygiene).toBe(false);
    expect(profile.profile).toBe('code');
    expect(profile.run_packed).toBe(true);
  });

  it('full-matrix / release / main override hygiene and docs-only', () => {
    for (const label of ['full-matrix', 'release'] as const) {
      const docs = decideCiProfile({
        eventName: 'pull_request',
        refName: 'docs/typo',
        headRef: 'docs/typo',
        labels: [label],
        changed: ['docs/README.md', 'CONTRIBUTING.md'],
      });
      expect(docs.full_matrix, `docs+${label}`).toBe(true);
      expect(docs.docs_only, `docs+${label}`).toBe(false);
      expect(docs.hygiene, `docs+${label}`).toBe(false);
      expect(docs.profile, `docs+${label}`).toBe('full_matrix');
      expect(docs.run_packed, `docs+${label}`).toBe(true);
      expect(docs.run_onboarding, `docs+${label}`).toBe(true);
      expect(docs.run_perf, `docs+${label}`).toBe(true);
      expect(docs.confidence_cmd, `docs+${label}`).toBe('npm run test:confidence');
      expect(docs.fail_fast, `docs+${label}`).toBe(false);

      const hygieneLabeled = decideCiProfile({
        eventName: 'pull_request',
        refName: 'chore/pins',
        headRef: 'chore/pins',
        labels: [label],
        changed: ['package.json', 'package-lock.json', 'docs/README.md'],
      });
      expect(hygieneLabeled.full_matrix, `hygiene+${label}`).toBe(true);
      expect(hygieneLabeled.hygiene, `hygiene+${label}`).toBe(false);
      expect(hygieneLabeled.profile, `hygiene+${label}`).toBe('full_matrix');
      expect(hygieneLabeled.run_packed, `hygiene+${label}`).toBe(true);
      expect(hygieneLabeled.run_onboarding, `hygiene+${label}`).toBe(true);
      expect(hygieneLabeled.confidence_cmd, `hygiene+${label}`).toBe('npm run test:confidence');
    }

    const mainHygiene = decideCiProfile({
      eventName: 'push',
      refName: 'main',
      changed: ['package.json', 'package-lock.json'],
    });
    expect(mainHygiene.full_matrix).toBe(true);
    expect(mainHygiene.hygiene).toBe(false);
    expect(mainHygiene.profile).toBe('full_matrix');
    expect(mainHygiene.run_packed).toBe(true);
    expect(mainHygiene.confidence_cmd).toBe('npm run test:confidence');
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
    expect(mixed.hygiene).toBe(false);
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
    expect(testsOnly.hygiene).toBe(false);
  });

  it('empty changed falls back to conservative code path (not docs-only or hygiene)', () => {
    const profile = decideCiProfile({
      eventName: 'pull_request',
      refName: 'feat/empty-diff',
      headRef: 'feat/empty-diff',
      labels: [],
      changed: [],
    });
    expect(profile.docs_only).toBe(false);
    expect(profile.hygiene).toBe(false);
    expect(profile.profile).toBe('code');
    expect(profile.code).toBe(true);
    expect(profile.run_packed).toBe(true);
    expect(profile.confidence_cmd).toBe('npm run test:coverage');
  });

  it('release-prepare branch substring forces full matrix', () => {
    const profile = decideCiProfile({
      eventName: 'pull_request',
      refName: 'chore/my-release-prepare-train',
      headRef: 'chore/my-release-prepare-train',
      labels: [],
      changed: ['docs/README.md'],
    });
    expect(profile.full_matrix).toBe(true);
    expect(profile.docs_only).toBe(false);
    expect(profile.hygiene).toBe(false);
    expect(profile.confidence_cmd).toBe('npm run test:confidence');
    expect(profile.run_packed).toBe(true);
  });
});
