#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tag =
  process.argv[2] ??
  process.env.GITHUB_REF_NAME ??
  process.env.GITHUB_REF?.replace(/^refs\/tags\//, '');

function fail(message) {
  console.error(`[verify-release-tag] ${message}`);
  process.exit(1);
}

if (!tag) {
  fail('missing release tag argument');
}

const expectedTag = `v${pkg.version}`;
if (tag !== expectedTag) {
  fail(`tag ${tag} does not match package version ${pkg.version}; expected ${expectedTag}`);
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

async function verifyWithGitHub() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return false;

  const refUrl = `https://api.github.com/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`;
  const ref = await readGitHubJson(refUrl, token);

  if (ref.object?.type !== 'tag') {
    fail(`tag ${tag} is not an annotated tag`);
  }

  const tagObject = await readGitHubJson(ref.object.url, token);
  const verification = tagObject.verification;

  if (!verification?.verified) {
    fail(
      `tag ${tag} is not verified by GitHub` +
        (verification?.reason ? ` (${verification.reason})` : '')
    );
  }

  console.log(`[verify-release-tag] verified signed annotated tag ${tag}`);
  return true;
}

function verifyWithLocalGit() {
  const type = execFileSync('git', ['cat-file', '-t', tag], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  if (type !== 'tag') {
    fail(`tag ${tag} is not an annotated tag`);
  }

  execFileSync('git', ['tag', '-v', tag], {
    cwd: root,
    stdio: 'inherit',
  });
  console.log(`[verify-release-tag] verified signed annotated tag ${tag}`);
}

if (!(await verifyWithGitHub())) {
  verifyWithLocalGit();
}
