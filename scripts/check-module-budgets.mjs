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

/**
 * Soft product budgets (Q1/Q6). html-report is a deliberate large renderer.
 *
 * Domain pure modules (DF03): tracked so oversize maintenance debt cannot hide.
 * If a domain file is already over its ceiling, done requires a behavior-preserving
 * split — raising max alone is NOT remediation (exception needs owner + kill date).
 */
const BUDGETS = [
  // DF03 — improvement compass split (was monolith ~923 LOC). Ceiling is structural
  // fitness, not a ratchet: keep each pure child under these holds after split.
  { path: 'src/domain/improvementCompassTypes.ts', max: 220 },
  { path: 'src/domain/improvementCompassMap.ts', max: 720 },
  { path: 'src/domain/improvementCompass.ts', max: 160 },
  { path: 'bin/ark-check.mjs', max: 100 },
  // 4.0.0 ArkRules write-path + inventory flags — was 1600 (loc 1671).
  // 4.1.x monorepo config walk-up (S2 / NEW-MONOREPO-CWD-WALKUP) — was 1750.
  // S0 security: write-root split + config path contain + teeth demote — was 1900.
  // DF02 status/MCP compass honesty residual wiring — was 1920 (loc ~1937).
  // Deep-module coach report advisory spread — was 1940.
  { path: 'bin/ark-check-runtime.mjs', max: 1960 },
  // S3 start confidence gate on all apply paths — was 900 (loc ~920).
  // ACS03 unified status command wiring — was 940 (loc ~943).
  // ACS04 agents-md / agent-projection command wiring — was 960 (loc ~974).
  { path: 'bin/ark.mjs', max: 990 },
  { path: 'bin/lib/agent-gates.mjs', max: 150 },
  { path: 'bin/lib/mcp-adoption.mjs', max: 600 },
  // Host expansion (Antigravity hooks merge + OpenCode MCP migrate/merge).
  // S4 force preserve content-identity path — was 700 (loc ~800).
  // 4.6.0 shared Claude/Grok home install wiring — was 850 (loc 855).
  { path: 'bin/lib/install-migrate.mjs', max: 870 },
  // Phase P: designFitness / designSmells doctor surface + patternBets plan IR.
  // 3.8.2 field DX (sessionNote, pure-layer opt-in, Codex legacy advisory) — was 920.
  // Product mandate honesty (coverage/baseline/writePath + design-weak flags) — was 980.
  // 4.0.0 packageVersionTruth + rulesUnderContract — was 1010 (loc 1014).
  // 4.1.0 productHonesty + mergePlanes wiring — was 1050 (loc 1062).
  // FG01/S1 finished-with-debt + S2 pin nextAction / configRoot — was 1120.
  // Improvement compass doctor JSON + human section wiring — was 1240.
  // Deep-module coach doctor JSON + human section wiring — was 1280.
  // 4.6.0 Claude/Grok home gap doctor lines — was 1300 (loc 1303).
  { path: 'bin/lib/doctor-plan.mjs', max: 1320 },
  // 4.0.0 ArkRules start/init templates + dual-plane presets — was 650 (loc 870).
  // S3 SPA + adopt/migrate patterns (vite-vercel-spa, P0A retrofit) — was 920 (loc ~1130).
  { path: 'bin/lib/presets.mjs', max: 1160 },
  { path: 'bin/lib/config-contract.mjs', max: 500 },
  { path: 'bin/lib/weakest-link.mjs', max: 500 },
  { path: 'bin/lib/enforcement-profiles.mjs', max: 150 },
  { path: 'bin/lib/write-path-detect.mjs', max: 200 },
  { path: 'bin/lib/html-report.mjs', max: 1550 },
  // Design-depth / write-path / baseline legend for showcase HTML (split from renderer).
  // 4.1.0 productHonesty card + mergePlanes — was 320 (loc 370).
  // 4.1.0 review: baselineSplit parity inputs — was 400 (loc 427).
  // FG01 HTML productHonesty parity (activeBlocking + pin) — was 460.
  // Improvement compass on report depth payload — was 480.
  // Deep-module coach depth payload wiring — was 500 (loc at ceiling).
  { path: 'bin/lib/html-report-depth.mjs', max: 520 },
  // X04 grew the advisory renderer a third section (physicalCohesion).
  // 4.0.0 ArkRules advisory section — was 280 (loc 281).
  // Improvement compass advisory HTML section — was 300.
  // Deep-module coach advisory HTML section (hot paths + deepening) — was 320.
  { path: 'bin/lib/html-report-advisories.mjs', max: 340 },
  // Deep-module coach pure deepening candidates (Domain; notAScore).
  { path: 'src/domain/deepeningCoach.ts', max: 320 },
  // Tooling assembler for hot-path git heuristic + doctor print.
  { path: 'bin/lib/deep-module-coach.mjs', max: 220 },
  // X04 R1/R2: physicalCohesion sensor + proposed reshape pilot (ADR 0010).
  { path: 'bin/lib/physical-cohesion.mjs', max: 260 },
  // Y01: bounded explicit verdict memory kept out of the X04 sensor/doctor orchestrator.
  { path: 'bin/lib/reshape-decisions.mjs', max: 300 },
  // Y03/Z02: count-only completeness evidence from the existing scan, not a second scanner.
  { path: 'bin/lib/parse-health.mjs', max: 80 },
  { path: 'bin/lib/product-copy.mjs', max: 80 },
  { path: 'bin/lib/agent-homes.mjs', max: 360 },
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
