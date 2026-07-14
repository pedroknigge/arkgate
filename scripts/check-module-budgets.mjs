#!/usr/bin/env node
/**
 * Q6 — module-size budgets for orchestration / lib surface.
 * Fails when a tracked module exceeds its LOC budget (real drift).
 *
 *   node scripts/check-module-budgets.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Soft product budgets (Q1/Q6). html-report is a deliberate large renderer. */
const BUDGETS = [
  { path: 'bin/ark-check.mjs', max: 1600 },
  { path: 'bin/ark.mjs', max: 900 },
  { path: 'bin/lib/agent-gates.mjs', max: 150 },
  { path: 'bin/lib/mcp-adoption.mjs', max: 600 },
  { path: 'bin/lib/install-migrate.mjs', max: 600 },
  // Phase P: designFitness / designSmells doctor surface + patternBets plan IR.
  { path: 'bin/lib/doctor-plan.mjs', max: 920 },
  { path: 'bin/lib/presets.mjs', max: 650 },
  { path: 'bin/lib/config-contract.mjs', max: 500 },
  { path: 'bin/lib/weakest-link.mjs', max: 500 },
  { path: 'bin/lib/enforcement-profiles.mjs', max: 150 },
  { path: 'bin/lib/write-path-detect.mjs', max: 200 },
  { path: 'bin/lib/html-report.mjs', max: 1550 },
  // Design-depth / write-path / baseline legend for showcase HTML (split from renderer).
  { path: 'bin/lib/html-report-depth.mjs', max: 320 },
];

function loc(rel) {
  const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
  return text.split('\n').length;
}

function main() {
  const asJson = process.argv.includes('--json');
  const rows = [];
  let failed = false;
  for (const b of BUDGETS) {
    const abs = path.join(REPO, b.path);
    if (!fs.existsSync(abs)) {
      rows.push({ path: b.path, max: b.max, loc: null, ok: false, error: 'missing' });
      failed = true;
      continue;
    }
    const n = loc(b.path);
    const ok = n <= b.max;
    if (!ok) failed = true;
    rows.push({ path: b.path, max: b.max, loc: n, ok });
  }
  if (asJson) {
    console.log(JSON.stringify({ ok: !failed, budgets: rows }, null, 2));
  } else {
    for (const r of rows) {
      const mark = r.ok ? 'ok' : 'FAIL';
      console.log(`${mark.padEnd(4)} ${r.path}: ${r.loc ?? '?'}/${r.max}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

main();
