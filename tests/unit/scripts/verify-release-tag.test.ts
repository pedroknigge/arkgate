import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  checkTagMatchesVersion,
  resolveSignedTagPolicy,
} from '../../../scripts/verify-release-tag.mjs';

const script = path.resolve('scripts/verify-release-tag.mjs');

function runScript(args: string[], env: Record<string, string>) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe('verify-release-tag policy (pure)', () => {
  it('defaults to allow unsigned annotated tags (pre-adoption)', () => {
    const p = resolveSignedTagPolicy({});
    expect(p.requireSigned).toBe(false);
    expect(p.allowUnsigned).toBe(true);
  });

  it('requires signed only when ARK_REQUIRE_SIGNED_RELEASE_TAG=true', () => {
    const p = resolveSignedTagPolicy({ ARK_REQUIRE_SIGNED_RELEASE_TAG: 'true' });
    expect(p.allowUnsigned).toBe(false);
    expect(p.requireSigned).toBe(true);
  });

  it('lets ARK_ALLOW_UNSIGNED_RELEASE_TAG win over require-signed', () => {
    const p = resolveSignedTagPolicy({
      ARK_REQUIRE_SIGNED_RELEASE_TAG: 'true',
      ARK_ALLOW_UNSIGNED_RELEASE_TAG: 'true',
    });
    expect(p.allowUnsigned).toBe(true);
    expect(p.requireSigned).toBe(false);
  });

  it('rejects tag/version mismatch', () => {
    const r = checkTagMatchesVersion({ tag: 'v1.0.0', packageVersion: '2.0.0' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('does not match');
  });

  it('accepts matching v${version} tag', () => {
    expect(checkTagMatchesVersion({ tag: 'v2.2.0', packageVersion: '2.2.0' }).ok).toBe(true);
  });
});

describe('verify-release-tag script (real entry)', () => {
  it('exits 1 on version/tag mismatch without git', () => {
    const r = runScript(['v9.9.9'], {
      ARK_VERIFY_PACKAGE_VERSION: '2.2.0',
      ARK_VERIFY_SKIP_GIT: 'true',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('does not match');
  });

  it('exits 0 on match with ARK_VERIFY_SKIP_GIT', () => {
    const r = runScript(['v2.2.0'], {
      ARK_VERIFY_PACKAGE_VERSION: '2.2.0',
      ARK_VERIFY_SKIP_GIT: 'true',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('version/tag match only');
  });

  it('exits 0 on forced unsigned with the pre-adoption default', () => {
    const r = runScript(['v2.2.0'], {
      ARK_VERIFY_PACKAGE_VERSION: '2.2.0',
      ARK_VERIFY_FORCE_UNSIGNED: 'true',
      GITHUB_TOKEN: '',
      GITHUB_REPOSITORY: '',
    });
    expect(r.status).toBe(0);
    expect(r.stderr + r.stdout).toMatch(/unsigned annotated|continuing with/i);
  });

  it('exits 1 on forced unsigned when ARK_REQUIRE_SIGNED_RELEASE_TAG=true', () => {
    const r = runScript(['v2.2.0'], {
      ARK_VERIFY_PACKAGE_VERSION: '2.2.0',
      ARK_VERIFY_FORCE_UNSIGNED: 'true',
      ARK_REQUIRE_SIGNED_RELEASE_TAG: 'true',
      GITHUB_TOKEN: '',
      GITHUB_REPOSITORY: '',
    });
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/requires a signed tag|forced unsigned/i);
  });
});
