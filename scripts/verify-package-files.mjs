#!/usr/bin/env node
/**
 * Q9 — package content allowlist check against package.json "files" + critical denylist.
 * Ensures publish surface does not accidentally include secrets/internal paths.
 *
 *   node scripts/verify-package-files.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Paths that must never appear in the published package surface. */
const DENY = [
  /^\.env(\.|$)/i,
  /^\.git\//,
  /^internal\//,
  /^\.ark\//,
  /^coverage\//,
  /^node_modules\//,
  /^\.tmp/,
  /credentials/i,
  /id_rsa/i,
  /\.pem$/i,
];

/** Required publish entries (must be listed in package.json files or always-included). */
const REQUIRE_LISTED = [
  'bin',
  'dist',
  'schemas',
  'templates',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
];

function main() {
  const asJson = process.argv.includes('--json');
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const files = Array.isArray(pkg.files) ? pkg.files : [];
  const errors = [];
  const warnings = [];

  for (const req of REQUIRE_LISTED) {
    if (!files.includes(req) && req !== 'LICENSE') {
      // LICENSE is auto-included by npm when present
      if (!files.some((f) => f === req || f.startsWith(`${req}/`))) {
        errors.push(`package.json files[] missing required entry: ${req}`);
      }
    }
  }

  for (const entry of files) {
    if (DENY.some((re) => re.test(entry))) {
      errors.push(`package.json files[] denylist hit: ${entry}`);
    }
  }

  // Scan listed dirs for denylist basenames (shallow)
  for (const entry of files) {
    const abs = path.join(REPO, entry);
    if (!fs.existsSync(abs)) {
      warnings.push(`listed path missing on disk: ${entry}`);
      continue;
    }
    const st = fs.statSync(abs);
    if (!st.isDirectory()) continue;
    let children = [];
    try {
      children = fs.readdirSync(abs);
    } catch {
      continue;
    }
    for (const child of children) {
      const rel = `${entry.replace(/\/$/, '')}/${child}`;
      if (DENY.some((re) => re.test(rel) || re.test(child))) {
        errors.push(`denylist path under published tree: ${rel}`);
      }
    }
  }

  // Threat-model doc should exist for Q9 documentation surface
  if (!fs.existsSync(path.join(REPO, 'docs', 'threat-model.md'))) {
    errors.push('docs/threat-model.md missing');
  }

  const ok = errors.length === 0;
  const report = { ok, errors, warnings, filesCount: files.length };
  if (asJson) console.log(JSON.stringify(report, null, 2));
  else {
    if (ok) console.log(`package files allowlist ok (${files.length} entries)`);
    for (const e of errors) console.error(`ERROR: ${e}`);
    for (const w of warnings) console.warn(`WARN: ${w}`);
  }
  process.exitCode = ok ? 0 : 1;
}

main();
