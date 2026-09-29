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
import { collectPackedFrontDoorErrors } from './packed-front-door-latest-truth.mjs';

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

/**
 * Code entries ship ESM and CJS declarations, and each `require` branch names its `.d.cts`.
 * Through 4.8.23 files[] dropped `*.d.cts` and one ESM `types` served both conditions, so a
 * CommonJS TypeScript consumer got TS1471 / TS1479 although runtime `require()` worked.
 */
export function collectDualTypesErrors(pkg, files, repo = REPO) {
  const errors = [];
  if (files.some((entry) => entry.startsWith('!') && /\.d\.cts/.test(entry))) {
    errors.push('package.json files[] excludes *.d.cts: CommonJS consumers lose their declarations');
  }
  const distBuilt = fs.existsSync(path.join(repo, 'dist'));
  const typesVersions = pkg.typesVersions?.['*'] ?? {};
  for (const [key, target] of Object.entries(pkg.exports ?? {})) {
    if (!target || typeof target !== 'object' || !('require' in target || 'import' in target)) continue;
    const esm = target.import;
    const cjs = target.require;
    if (typeof esm !== 'object' || typeof cjs !== 'object') {
      errors.push(`exports["${key}"] must nest { types, default } under both import and require`);
      continue;
    }
    if (!String(esm.types ?? '').endsWith('.d.ts') || !String(esm.default ?? '').endsWith('.js')) {
      errors.push(`exports["${key}"].import must be { types: *.d.ts, default: *.js }`);
    }
    if (!String(cjs.types ?? '').endsWith('.d.cts') || !String(cjs.default ?? '').endsWith('.cjs')) {
      errors.push(`exports["${key}"].require must be { types: *.d.cts, default: *.cjs }`);
    }
    if (distBuilt) {
      for (const file of [esm.types, esm.default, cjs.types, cjs.default]) {
        if (typeof file === 'string' && !fs.existsSync(path.join(repo, file))) {
          errors.push(`exports["${key}"] names ${file}, which the build did not emit`);
        }
      }
    }
    if (key !== '.') {
      const mapped = typesVersions[key.replace(/^\.\//, '')];
      if (!Array.isArray(mapped) || mapped[0] !== esm.types) {
        errors.push(`typesVersions["*"]["${key.replace(/^\.\//, '')}"] must map to ${esm.types} (moduleResolution node10)`);
      }
    }
  }
  return errors;
}

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
    if (entry.startsWith('!')) continue; // npm files[] exclusion pattern, not an on-disk path
    const abs = path.join(REPO, entry);
    if (!fs.existsSync(abs)) {
      // A required entry missing on disk is the failure mode this package made
      // reachable when it dropped `prepack` (a build lifecycle script makes a
      // pnpm git install fail closed): nothing builds `dist/` on pack any more,
      // so "dist is absent" must not read as a warning about a stale list.
      if (REQUIRE_LISTED.includes(entry)) {
        errors.push(
          `required publish path missing on disk: ${entry} — run "npm run build" before verifying the package surface`
        );
      } else {
        warnings.push(`listed path missing on disk: ${entry}`);
      }
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

  errors.push(...collectDualTypesErrors(pkg, files));

  // Threat-model doc should exist for Q9 documentation surface
  if (!fs.existsSync(path.join(REPO, 'docs', 'threat-model.md'))) {
    errors.push('docs/threat-model.md missing');
  }

  // This package publishes as npm `latest`. Packed front doors must not say
  // latest remains an older version (#270).
  const pkgVersion = typeof pkg.version === 'string' ? pkg.version : '';
  errors.push(
    ...collectPackedFrontDoorErrors({
      version: pkgVersion,
      readme: fs.existsSync(path.join(REPO, 'README.md'))
        ? fs.readFileSync(path.join(REPO, 'README.md'), 'utf8')
        : '',
      docsReadme: fs.existsSync(path.join(REPO, 'docs', 'README.md'))
        ? fs.readFileSync(path.join(REPO, 'docs', 'README.md'), 'utf8')
        : '',
      changelog: fs.existsSync(path.join(REPO, 'CHANGELOG.md'))
        ? fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8')
        : '',
    })
  );

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

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main();
}
