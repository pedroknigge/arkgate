#!/usr/bin/env node
/**
 * Release-trust gate for ArkGate publishes.
 *
 * Policy (P0):
 * - Tag name MUST match package.json version (`v${version}`).
 * - Tag MUST be annotated (not lightweight).
 * - Signed/verified tags are preferred. Unsigned fails by default.
 * - Override: ARK_ALLOW_UNSIGNED_RELEASE_TAG=true for intentional unsigned annotated tags.
 * - Legacy: ARK_REQUIRE_SIGNED_RELEASE_TAG=true also requires signed (redundant with default).
 *
 * Test hooks (not for production publishes):
 * - ARK_VERIFY_PACKAGE_VERSION — override package.json version
 * - ARK_VERIFY_FORCE_UNSIGNED — after annotation check, treat as unsigned
 * - ARK_VERIFY_SKIP_GIT — only check tag/version match (unit path)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEnvironmentValue } from '../bin/lib/product-identity.mjs';

const root = process.cwd();

function releaseEnvironment(env, suffix) {
  return resolveEnvironmentValue(env, `STRUCTRAIL_${suffix}`, `ARK_${suffix}`).value;
}

function readPackageVersion(env = process.env) {
  const override = releaseEnvironment(env, 'VERIFY_PACKAGE_VERSION');
  if (override != null) return override;
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return pkg.version;
}

/** @param {NodeJS.ProcessEnv} [env] */
export function resolveSignedTagPolicy(env = process.env) {
  if (releaseEnvironment(env, 'ALLOW_UNSIGNED_RELEASE_TAG') === 'true') {
    return { allowUnsigned: true, requireSigned: false };
  }
  if (releaseEnvironment(env, 'REQUIRE_SIGNED_RELEASE_TAG') === 'false') {
    // Explicit compatibility opt-out; prefer STRUCTRAIL_ALLOW_UNSIGNED_RELEASE_TAG.
    return { allowUnsigned: true, requireSigned: false };
  }
  // Default fail-closed: co-pilot releases should be signed.
  return { allowUnsigned: false, requireSigned: true };
}

/** @param {{ tag: string, packageVersion: string }} args */
export function checkTagMatchesVersion({ tag, packageVersion }) {
  if (!tag) {
    return { ok: false, message: 'missing release tag argument' };
  }
  const expectedTag = `v${packageVersion}`;
  if (tag !== expectedTag) {
    return {
      ok: false,
      message: `tag ${tag} does not match package version ${packageVersion}; expected ${expectedTag}`,
    };
  }
  return { ok: true };
}

function fail(message) {
  console.error(`[verify-release-tag] ${message}`);
  process.exit(1);
}

function handleUnsignedTag(message, policy) {
  if (!policy.allowUnsigned) {
    fail(
      `${message}. Refusing unsigned release tag (set STRUCTRAIL_ALLOW_UNSIGNED_RELEASE_TAG=true to override).`
    );
  }
  console.warn(
    `[verify-release-tag] ${message}; continuing because STRUCTRAIL_ALLOW_UNSIGNED_RELEASE_TAG=true`
  );
}

async function readGitHubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'ark-release-verifier',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    fail(`GitHub API request failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function verifyWithGitHub(tag, policy) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return false;

  if (releaseEnvironment(process.env, 'VERIFY_FORCE_UNSIGNED') === 'true') {
    handleUnsignedTag(`tag ${tag} forced unsigned (STRUCTRAIL_VERIFY_FORCE_UNSIGNED)`, policy);
    return true;
  }

  const refUrl = `https://api.github.com/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`;
  const ref = await readGitHubJson(refUrl, token);

  if (ref.object?.type !== 'tag') {
    fail(`tag ${tag} is not an annotated tag`);
  }

  const tagObject = await readGitHubJson(ref.object.url, token);
  const verification = tagObject.verification;

  if (!verification?.verified) {
    handleUnsignedTag(
      `tag ${tag} is not verified by GitHub` +
        (verification?.reason ? ` (${verification.reason})` : ''),
      policy
    );
  } else {
    console.log(`[verify-release-tag] verified signed annotated tag ${tag}`);
  }

  return true;
}

function verifyWithLocalGit(tag, policy) {
  if (releaseEnvironment(process.env, 'VERIFY_FORCE_UNSIGNED') === 'true') {
    handleUnsignedTag(`tag ${tag} forced unsigned (STRUCTRAIL_VERIFY_FORCE_UNSIGNED)`, policy);
    return;
  }

  const type = execFileSync('git', ['cat-file', '-t', tag], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  if (type !== 'tag') {
    fail(`tag ${tag} is not an annotated tag`);
  }

  try {
    execFileSync('git', ['tag', '-v', tag], {
      cwd: root,
      stdio: 'inherit',
    });
    console.log(`[verify-release-tag] verified signed annotated tag ${tag}`);
  } catch {
    handleUnsignedTag(`tag ${tag} is not signed or cannot be verified locally`, policy);
  }
}

export async function main(argv = process.argv, env = process.env) {
  const tag =
    argv[2] ??
    env.GITHUB_REF_NAME ??
    env.GITHUB_REF?.replace(/^refs\/tags\//, '');

  const packageVersion = readPackageVersion(env);
  const match = checkTagMatchesVersion({ tag, packageVersion });
  if (!match.ok) fail(match.message);

  const policy = resolveSignedTagPolicy(env);
  console.log(
    `[verify-release-tag] policy: requireSigned=${policy.requireSigned} allowUnsigned=${policy.allowUnsigned}`
  );

  if (releaseEnvironment(env, 'VERIFY_SKIP_GIT') === 'true') {
    console.log(
      `[verify-release-tag] STRUCTRAIL_VERIFY_SKIP_GIT=true — version/tag match only for ${tag}`
    );
    return 0;
  }

  // Use process.env for GitHub path (fetch needs real env tokens)
  process.env = { ...process.env, ...env };
  if (!(await verifyWithGitHub(tag, policy))) {
    verifyWithLocalGit(tag, policy);
  }
  return 0;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  await main();
}
