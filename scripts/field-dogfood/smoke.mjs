#!/usr/bin/env node
/**
 * Maintainer field-dogfood smoke (S7) — offline unit-level gap locks.
 *
 * Does NOT clone external repos. Runs vitest on assertion-linked suites and soft-skips
 * features that have not landed yet (e.g. monorepo walk-up until S2).
 *
 * Usage (from repo root):
 *   node scripts/field-dogfood/smoke.mjs
 *   npm run test:field-dogfood-smoke
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const MANIFEST = path.join(HERE, 'gap-assertions.json');

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

/** Soft feature probes — return true when the tree already has the behavior. */
function featureProbes() {
  const walkUpCandidates = [
    path.join(REPO, 'bin/lib/project-root.mjs'),
    path.join(REPO, 'bin/lib/config-discovery.mjs'),
    path.join(REPO, 'bin/lib/find-config.mjs'),
    path.join(REPO, 'bin/lib/config-root.mjs'),
  ];
  let configWalkUp = false;
  for (const p of walkUpCandidates) {
    if (!fs.existsSync(p)) continue;
    const body = fs.readFileSync(p, 'utf8');
    if (
      /walk.?up|walkUp|parent.*ark\.config|findConfigRoot|findNearestArkConfig|resolveEffectiveProjectRoot/i.test(
        body
      )
    ) {
      configWalkUp = true;
      break;
    }
  }
  // Also probe shared CLI config resolution for walk-up language
  if (!configWalkUp) {
    for (const rel of ['bin/ark-shared.mjs', 'bin/lib/scan-files.mjs', 'bin/ark-check.mjs', 'bin/ark-check-runtime.mjs']) {
      const p = path.join(REPO, rel);
      if (!fs.existsSync(p)) continue;
      const body = fs.readFileSync(p, 'utf8');
      if (/walkParents|walk.?up.*ark\.config|findNearestArkConfig|configRoot|resolveEffectiveProjectRoot/i.test(body)) {
        configWalkUp = true;
        break;
      }
    }
  }
  return { configWalkUp };
}

function main() {
  const manifest = loadManifest();
  const probes = featureProbes();
  const vitestFiles = new Set();
  const skipped = [];
  const tracked = [];

  for (const a of manifest.assertions || []) {
    if (a.featureProbe && probes[a.featureProbe] !== true) {
      skipped.push({ id: a.id, reason: a.softSkipIf || `featureProbe ${a.featureProbe} not present` });
      continue;
    }
    if (a.status === 'open' && a.check === 'soft') {
      skipped.push({ id: a.id, reason: a.softSkipIf || 'soft open assertion' });
      continue;
    }
    tracked.push(a.id);
    for (const f of a.vitest || []) {
      const abs = path.isAbsolute(f) ? f : path.join(REPO, f);
      if (!fs.existsSync(abs)) {
        console.error(`[field-dogfood] missing vitest target for ${a.id}: ${f}`);
        process.exit(2);
      }
      vitestFiles.add(f);
    }
  }

  console.log('[field-dogfood] mother smoke — offline unit gap locks');
  console.log(`[field-dogfood] against: ${manifest.against}`);
  console.log(`[field-dogfood] assertions: ${tracked.join(', ') || '(none)'}`);
  if (skipped.length) {
    for (const s of skipped) {
      console.log(`[field-dogfood] soft-skip ${s.id}: ${s.reason}`);
    }
  }

  const files = [...vitestFiles];
  if (files.length === 0) {
    console.error('[field-dogfood] no vitest files selected');
    process.exit(2);
  }

  const r = spawnSync(
    process.execPath,
    [
      path.join(REPO, 'node_modules/vitest/vitest.mjs'),
      'run',
      ...files,
    ],
    { cwd: REPO, encoding: 'utf8', stdio: 'inherit' }
  );

  if (r.status !== 0) {
    console.error('[field-dogfood] FAIL — unit gap locks red');
    process.exit(r.status ?? 1);
  }

  console.log('[field-dogfood] PASS — offline gap locks green');
  console.log(
    '[field-dogfood] optional full lab: .grok/workflows/pre-release-field-dogfood.rhai (network clones; not CI default)'
  );
  process.exit(0);
}

main();
