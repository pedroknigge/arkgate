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
  { path: 'bin/ark-check.mjs', max: 100 },
  // 4.0.0 ArkRules write-path + inventory flags — was 1600 (loc 1671).
  { path: 'bin/ark-check-runtime.mjs', max: 1750 },
  { path: 'bin/ark.mjs', max: 900 },
  { path: 'bin/lib/agent-gates.mjs', max: 150 },
  { path: 'bin/lib/mcp-adoption.mjs', max: 600 },
  // Host expansion (Antigravity hooks merge + OpenCode MCP migrate/merge).
  { path: 'bin/lib/install-migrate.mjs', max: 700 },
  // Phase P: designFitness / designSmells doctor surface + patternBets plan IR.
  // 3.8.2 field DX (sessionNote, pure-layer opt-in, Codex legacy advisory) — was 920.
  // Product mandate honesty (coverage/baseline/writePath + design-weak flags) — was 980.
  // 4.0.0 packageVersionTruth + rulesUnderContract — was 1010 (loc 1014).
  { path: 'bin/lib/doctor-plan.mjs', max: 1050 },
  // 4.0.0 ArkRules start/init templates + dual-plane presets — was 650 (loc 870).
  { path: 'bin/lib/presets.mjs', max: 920 },
  { path: 'bin/lib/config-contract.mjs', max: 500 },
  { path: 'bin/lib/weakest-link.mjs', max: 500 },
  { path: 'bin/lib/enforcement-profiles.mjs', max: 150 },
  { path: 'bin/lib/write-path-detect.mjs', max: 200 },
  { path: 'bin/lib/html-report.mjs', max: 1550 },
  // Design-depth / write-path / baseline legend for showcase HTML (split from renderer).
  { path: 'bin/lib/html-report-depth.mjs', max: 320 },
  // X04 grew the advisory renderer a third section (physicalCohesion).
  // 4.0.0 ArkRules advisory section — was 280 (loc 281).
  { path: 'bin/lib/html-report-advisories.mjs', max: 300 },
  // X04 R1/R2: physicalCohesion sensor + proposed reshape pilot (ADR 0010).
  { path: 'bin/lib/physical-cohesion.mjs', max: 260 },
  // Y01: bounded explicit verdict memory kept out of the X04 sensor/doctor orchestrator.
  { path: 'bin/lib/reshape-decisions.mjs', max: 300 },
  // Y03/Z02: count-only completeness evidence from the existing scan, not a second scanner.
  { path: 'bin/lib/parse-health.mjs', max: 80 },
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
