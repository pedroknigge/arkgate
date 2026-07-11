#!/usr/bin/env node
/**
 * Reject legacy product names on current public surfaces unless the occurrence is
 * explicitly classified as v3 compatibility, migration/history, an internal v3
 * artifact, a negative assertion, or an M6-gated external reference.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = path.join(HERE, 'legacy-identity-allowlist.json');
const SKIP_DIRECTORIES = new Set([
  '.git',
  '.ark',
  'coverage',
  'dist',
  'node_modules',
]);
const APPROVED_MARKER_CATEGORIES = new Set([
  'external-cutover',
  'internal-artifact',
  'migration-history',
  'negative-test',
  'v3-compatibility',
]);
const V4_CATEGORIES = /(?:compatibility|internal-artifact|negative-test)/;
const START_MARKER = /legacy-identity:start\s+([a-z0-9-]+)(?:\s+removal=([^\s>]+))?/i;
const END_MARKER = /legacy-identity:end/i;
const V4_DEPRECATION = /@deprecated\b.*\bRemoval target:\s*v4\b/i;
const DECLARATION_START = /^(?:export\s+)?(?:declare\s+)?(?:const|let|var|type)\b|^export\s*\{/;

const LEGACY_PATTERNS = [
  /\barkgate(?:-[a-z0-9-]+)?\b/i,
  /\bark\.config\.json\b/i,
  /\bark:\/\//i,
  /\bARK_[A-Z0-9_]+\b/,
  /\bark_[a-z][a-z0-9_]*\b/,
  /\/ark-[a-z0-9][a-z0-9-]*/i,
  /\b[A-Za-z0-9_]*Ark[A-Z][A-Za-z0-9_]*\b/,
  /(?<![.A-Za-z0-9_])ark(?:-[a-z0-9][a-z0-9-]*)?\b/i,
];

function parseRoot(argv) {
  const index = argv.indexOf('--root');
  if (index === -1) return process.cwd();
  if (!argv[index + 1]) throw new Error('--root requires a path');
  return path.resolve(argv[index + 1]);
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function matchesPathRule(relativePath, rule) {
  return rule.match === 'prefix'
    ? relativePath.startsWith(rule.path)
    : relativePath === rule.path;
}

function requiresV4(category) {
  return V4_CATEGORIES.test(category);
}

function validatePolicy(policy) {
  const errors = [];
  if (policy.schemaVersion !== 1) errors.push('allowlist schemaVersion must be 1');
  if (policy.removalTarget !== 'v4') errors.push('allowlist removalTarget must be v4');

  for (const collection of ['ignoredPaths', 'allowedPathNames', 'allowedLines']) {
    if (!Array.isArray(policy[collection])) {
      errors.push(`allowlist ${collection} must be an array`);
      continue;
    }
    for (const entry of policy[collection]) {
      if (!entry.path || !entry.category || !entry.reason) {
        errors.push(`allowlist ${collection} entries require path, category, and reason`);
      }
      if (requiresV4(entry.category) && entry.removalTarget !== 'v4') {
        errors.push(
          `allowlist ${collection} entry ${entry.path ?? '<missing>'} must use removalTarget v4`
        );
      }
      if (typeof entry.removalTarget === 'string' && /^v3(?:\.|$)/i.test(entry.removalTarget)) {
        errors.push(`allowlist ${collection} entry ${entry.path} cannot target a v3 minor`);
      }
    }
  }
  return errors;
}

function legacyMatch(text) {
  for (const pattern of LEGACY_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function isBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

function walk(root, directory, policy, files) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalize(path.relative(root, absolutePath));
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      if (
        policy.ignoredPaths.some(
          (rule) => rule.match === 'prefix' && matchesPathRule(`${relativePath}/`, rule)
        )
      ) {
        continue;
      }
      walk(root, absolutePath, policy, files);
      continue;
    }
    files.push({ absolutePath, relativePath });
  }
}

function repositoryFiles(root, policy) {
  if (fs.existsSync(path.join(root, '.git'))) {
    const listed = spawnSync(
      'git',
      ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { encoding: 'utf8' }
    );
    if (listed.status === 0) {
      return listed.stdout
        .split('\0')
        .filter(Boolean)
        .map(normalize)
        .filter((relativePath) => {
          const segments = relativePath.split('/');
          return !segments.some((segment) => SKIP_DIRECTORIES.has(segment));
        })
        .map((relativePath) => ({
          absolutePath: path.join(root, relativePath),
          relativePath,
        }))
        .filter((file) => fs.statSync(file.absolutePath, { throwIfNoEntry: false })?.isFile())
        .filter(
          (file) => !policy.ignoredPaths.some((rule) => matchesPathRule(file.relativePath, rule))
        );
    }
  }

  const files = [];
  walk(root, root, policy, files);
  return files;
}

function approvedLine(policy, relativePath, line) {
  return policy.allowedLines.some(
    (rule) => rule.path === relativePath && line.includes(rule.contains)
  );
}

function scanFile(policy, file, errors) {
  const { absolutePath, relativePath } = file;
  if (policy.ignoredPaths.some((rule) => matchesPathRule(relativePath, rule))) return false;

  const pathToken = legacyMatch(relativePath);
  const pathApproved = policy.allowedPathNames.some((rule) => rule.path === relativePath);
  if (pathToken && !pathApproved) {
    errors.push(`${relativePath}:path unapproved legacy identity "${pathToken}"`);
  }

  const buffer = fs.readFileSync(absolutePath);
  if (isBinary(buffer)) return false;
  const lines = buffer.toString('utf8').split(/\r?\n/);
  let activeMarker = null;
  let pendingDeprecatedLine = null;
  let inDeprecatedDeclaration = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const start = line.match(START_MARKER);
    const end = END_MARKER.test(line);

    if (start) {
      const category = start[1];
      const removalTarget = start[2] ?? null;
      if (activeMarker) {
        errors.push(`${relativePath}:${lineNumber} nested legacy-identity block`);
      }
      if (!APPROVED_MARKER_CATEGORIES.has(category)) {
        errors.push(`${relativePath}:${lineNumber} unknown legacy-identity category ${category}`);
      }
      if (requiresV4(category) && removalTarget !== 'v4') {
        errors.push(`${relativePath}:${lineNumber} removal target must be v4`);
      }
      if (removalTarget && /^v3(?:\.|$)/i.test(removalTarget)) {
        errors.push(`${relativePath}:${lineNumber} removal target cannot be a v3 minor`);
      }
      activeMarker = { category, lineNumber };
    }

    if (end) {
      if (!activeMarker) {
        errors.push(`${relativePath}:${lineNumber} legacy-identity:end without a start`);
      }
      activeMarker = null;
      continue;
    }

    if (V4_DEPRECATION.test(line)) pendingDeprecatedLine = lineNumber;
    const trimmed = line.trim();
    if (pendingDeprecatedLine && lineNumber - pendingDeprecatedLine > 3) {
      pendingDeprecatedLine = null;
    }
    if (
      pendingDeprecatedLine &&
      !inDeprecatedDeclaration &&
      trimmed &&
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('/*') &&
      DECLARATION_START.test(trimmed)
    ) {
      inDeprecatedDeclaration = true;
      pendingDeprecatedLine = null;
    } else if (
      pendingDeprecatedLine &&
      lineNumber > pendingDeprecatedLine &&
      trimmed &&
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('/*')
    ) {
      pendingDeprecatedLine = null;
    }

    const token = legacyMatch(line);
    if (
      token &&
      !activeMarker &&
      !inDeprecatedDeclaration &&
      !pendingDeprecatedLine &&
      !approvedLine(policy, relativePath, line)
    ) {
      errors.push(`${relativePath}:${lineNumber} unapproved legacy identity "${token}"`);
    }

    if (inDeprecatedDeclaration && trimmed.endsWith(';')) {
      inDeprecatedDeclaration = false;
    }
  }

  if (activeMarker) {
    errors.push(
      `${relativePath}:${activeMarker.lineNumber} unclosed legacy-identity block (${activeMarker.category})`
    );
  }
  return true;
}

function main() {
  let root;
  let policy;
  try {
    root = path.resolve(parseRoot(process.argv.slice(2)));
    policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  } catch (error) {
    console.error(`[identity-ratchet] ${error.message}`);
    process.exit(1);
  }

  const errors = validatePolicy(policy);
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    errors.push(`root is not a directory: ${root}`);
  }

  const files = errors.length === 0 ? repositoryFiles(root, policy) : [];
  let scanned = 0;
  for (const file of files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    if (scanFile(policy, file, errors)) scanned += 1;
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    console.error(
      `Legacy identity ratchet failed (${errors.length} finding${errors.length === 1 ? '' : 's'}).`
    );
    process.exit(1);
  }

  console.log(`Legacy identity ratchet passed (${scanned} text files; removal target v4).`);
}

main();
