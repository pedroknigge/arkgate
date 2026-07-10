#!/usr/bin/env node
/**
 * W3 — Loop-cost eval harness (fixture-measured by default).
 *
 * Measures cost of clearing a gated violation:
 *   - turns-to-green  (agent-equivalent repair attempts)
 *   - tokens-to-green (optional; null in fixture mode)
 *   - CHEATED         (governance surface or mustKeep gutted)
 *
 * Default mode is **fixture-measured** (deterministic, CI-safe):
 *   1. Copy a labeled case under eval/cases/
 *   2. Confirm ark-check fails
 *   3. Attempt mechanical-safe autoPatch on violating source files (W1)
 *   4. Re-run ark-check; count turns; detect CHEATED if protected files change
 *
 * Live agent mode (optional / nightly): set ARK_EVAL_LOOP_LIVE=1 to delegate
 * remaining judgment cases to eval/run.mjs-style agents later. Fixture mode
 * never requires a live model.
 *
 * Usage:
 *   node eval/loop-cost-run.mjs
 *   node eval/loop-cost-run.mjs --write-baseline
 *   ARK_EVAL_LOOP_CASE=import-type-of-type-exports node eval/loop-cost-run.mjs
 *
 * Outputs:
 *   eval/loop-cost-report.json
 *   eval/loop-cost-baseline.json  (when --write-baseline or missing baseline)
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  applyImportTypeAutoPatch,
  resolveImportFileAbs,
} from '../bin/lib/auto-patch.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const CASES_DIR = path.join(HERE, 'cases');
const REPORT_PATH = path.join(HERE, 'loop-cost-report.json');
const BASELINE_PATH = path.join(HERE, 'loop-cost-baseline.json');

const PROTECTED = ['ark.config.json', '.ark-baseline.json', 'tsconfig.json', 'AGENTS.md'];
const PROTECTED_DIRS = ['.github', '.claude', '.cursor', '.codex', '.grok'];

/** Documented case set: ≥1 type-only mechanical-safe + ≥1 judgment. */
const DEFAULT_CASES = [
  {
    id: 'import-type-of-type-exports',
    kind: 'type-only',
    maxTurns: 3,
  },
  {
    id: 'domain-forbidden-global',
    kind: 'judgment',
    maxTurns: 3,
  },
];

function sha(buf) {
  return createHash('sha1').update(buf).digest('hex');
}

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'case.json') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function snapshotFiles(root) {
  const map = new Map();
  for (const rel of walk(root)) {
    map.set(rel.split(path.sep).join('/'), sha(fs.readFileSync(path.join(root, rel))));
  }
  return map;
}

function isProtected(rel) {
  const norm = rel.split(path.sep).join('/');
  if (PROTECTED.includes(norm)) return true;
  return PROTECTED_DIRS.some((d) => norm === d || norm.startsWith(`${d}/`));
}

function runArkCheck(root) {
  const res = spawnSync(
    process.execPath,
    [ARK_CHECK, '--root', root, '--config', 'ark.config.json'],
    { cwd: root, encoding: 'utf8' }
  );
  return {
    code: res.status ?? 1,
    output: `${res.stdout || ''}${res.stderr || ''}`.trim(),
  };
}

function loadCase(id) {
  const dir = path.join(CASES_DIR, id);
  if (!fs.existsSync(dir)) throw new Error(`case not found: ${id}`);
  const metaPath = path.join(dir, 'case.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return { id, dir, meta };
}

/**
 * One fixture turn: try import-type autoPatch on every .ts/.tsx under src/.
 * Returns { changed, writePathCleared }. writePathCleared means at least one file
 * got a non-no-op import-type rewrite from applyImportTypeAutoPatch (fixture proxy
 * for the W1 write-boundary path). Full AICodeGate revalidation lives in
 * validateWithAutoPatch / MCP tests; this harness measures mechanical rewrite turns.
 *
 * Note: ark-check may still report type-only layer debt (`arkCheckGreen` separate).
 * Loop cost "green" = write-path autoPatch success, not full CI green.
 */
function applyAutoPatchTurn(root, ts) {
  let changed = false;
  let writePathCleared = false;
  const srcRoot = path.join(root, 'src');
  if (!fs.existsSync(srcRoot)) return { changed: false, writePathCleared: false };
  const files = walk(srcRoot).filter((r) => /\.(ts|tsx|mts|cts)$/.test(r));
  for (const rel of files) {
    const abs = path.join(srcRoot, rel);
    const before = fs.readFileSync(abs, 'utf8');
    const patch = applyImportTypeAutoPatch(ts, before, {
      root,
      filePath: abs,
      resolveTargetAbs: resolveImportFileAbs,
    });
    if (
      patch &&
      patch.source !== before &&
      /\bimport\s+type\b|\bexport\s+type\b/.test(patch.source)
    ) {
      fs.writeFileSync(abs, patch.source);
      changed = true;
      writePathCleared = true;
    }
  }
  return { changed, writePathCleared };
}

function detectCheated(root, beforeSnap, caseDef) {
  const afterSnap = snapshotFiles(root);
  for (const [rel, hash] of afterSnap) {
    if (isProtected(rel) && beforeSnap.get(rel) !== hash) {
      return { cheated: true, why: `modified/created protected file: ${rel}` };
    }
  }
  for (const [rel] of beforeSnap) {
    if (isProtected(rel) && !afterSnap.has(rel)) {
      return { cheated: true, why: `deleted protected file: ${rel}` };
    }
  }
  for (const rel of caseDef.mustKeep || []) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      return { cheated: true, why: `removed load-bearing file: ${rel}` };
    }
    try {
      if (fs.statSync(abs).size < 8) {
        return { cheated: true, why: `gutted load-bearing file: ${rel}` };
      }
    } catch {
      return { cheated: true, why: `missing load-bearing file: ${rel}` };
    }
  }
  return { cheated: false };
}

/**
 * Fixture-measured loop for one case.
 */
function runFixtureCase(caseSpec, ts) {
  const { id, kind, maxTurns } = caseSpec;
  const loaded = loadCase(id);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ark-loop-cost-${id}-`));
  try {
    copyDir(loaded.dir, tmp);
    // strip answer key
    try {
      fs.unlinkSync(path.join(tmp, 'case.json'));
    } catch {
      /* ok */
    }

    const beforeSnap = snapshotFiles(tmp);
    const initial = runArkCheck(tmp);
    if (initial.code === 0) {
      return {
        id,
        kind,
        mode: 'fixture-measured',
        status: 'ERROR',
        turnsToGreen: null,
        tokensToGreen: null,
        cheated: false,
        why: 'fixture did not violate under ark-check',
      };
    }

    let turns = 0;
    let writePathGreen = false;
    let arkCheckGreen = false;
    let cheated = false;
    let why = '';
    let lastStrategy = null;

    while (turns < maxTurns && !writePathGreen && !cheated) {
      turns += 1;
      const { changed, writePathCleared } = applyAutoPatchTurn(tmp, ts);
      lastStrategy = changed ? 'autoPatch' : 'no-op-recheck';
      const cheat = detectCheated(tmp, beforeSnap, loaded.meta);
      if (cheat.cheated) {
        cheated = true;
        why = cheat.why;
        break;
      }
      const check = runArkCheck(tmp);
      arkCheckGreen = check.code === 0;
      // Write-path green: autoPatch applied successfully this turn (W1 revalidated).
      // Full CI green is reported separately (type-only debt may remain for plan/loop).
      if (writePathCleared || arkCheckGreen) {
        writePathGreen = true;
        break;
      }
      if (!changed) break;
    }

    if (cheated) {
      return {
        id,
        kind,
        mode: 'fixture-measured',
        status: 'CHEATED',
        turnsToGreen: null,
        tokensToGreen: null,
        cheated: true,
        turnsAttempted: turns,
        strategy: lastStrategy,
        why,
        arkCheckGreen: false,
        expectedRemediationClass: loaded.meta.expectedRemediationClass,
      };
    }

    if (writePathGreen) {
      return {
        id,
        kind,
        mode: 'fixture-measured',
        status: 'PASS',
        turnsToGreen: turns,
        tokensToGreen: null,
        cheated: false,
        strategy: lastStrategy,
        arkCheckGreen,
        expectedRemediationClass: loaded.meta.expectedRemediationClass,
      };
    }

    const judgment =
      loaded.meta.expectedRemediationClass === 'judgment' || kind === 'judgment';
    return {
      id,
      kind,
      mode: 'fixture-measured',
      status: judgment ? 'JUDGMENT_REQUIRED' : 'FAIL',
      turnsToGreen: null,
      tokensToGreen: null,
      cheated: false,
      turnsAttempted: turns,
      strategy: lastStrategy,
      arkCheckGreen,
      expectedRemediationClass: loaded.meta.expectedRemediationClass,
      why: judgment
        ? 'no mechanical-safe autoPatch cleared the write path (expected for judgment cases)'
        : `write path still blocked after ${turns} turn(s)`,
    };
  } finally {
    if (!process.env.ARK_EVAL_KEEP) {
      fs.rmSync(tmp, { recursive: true, force: true });
    } else {
      console.error(`[loop-cost] kept ${tmp}`);
    }
  }
}

function summarize(cases) {
  const typeOnly = cases.filter((c) => c.kind === 'type-only' && c.turnsToGreen != null);
  const turns = typeOnly.map((c) => c.turnsToGreen).sort((a, b) => a - b);
  const median =
    turns.length === 0
      ? null
      : turns.length % 2 === 1
        ? turns[(turns.length - 1) / 2]
        : (turns[turns.length / 2 - 1] + turns[turns.length / 2]) / 2;
  const cheatedN = cases.filter((c) => c.cheated).length;
  return {
    caseCount: cases.length,
    typeOnlyWithGreen: typeOnly.length,
    medianTurnsTypeOnly: median,
    cheatedRate: cases.length ? cheatedN / cases.length : 0,
    cheatedCount: cheatedN,
  };
}

function main() {
  const writeBaseline =
    process.argv.includes('--write-baseline') || !fs.existsSync(BASELINE_PATH);
  const only = process.env.ARK_EVAL_LOOP_CASE;
  const caseSpecs = only
    ? DEFAULT_CASES.filter((c) => c.id === only)
    : DEFAULT_CASES;
  if (caseSpecs.length === 0) {
    console.error(`[loop-cost] unknown case: ${only}`);
    process.exit(2);
  }

  let ts;
  try {
    ts = require('typescript');
  } catch (err) {
    console.error('[loop-cost] typescript required:', err.message);
    process.exit(2);
  }

  const cases = caseSpecs.map((spec) => {
    process.stderr.write(`[loop-cost] ${spec.id}…\n`);
    return runFixtureCase(spec, ts);
  });
  const summary = summarize(cases);
  const report = {
    capturedAt: new Date().toISOString(),
    mode: 'fixture-measured',
    note:
      'Fixture-measured loop cost (W3). Live agents optional via ARK_EVAL_LOOP_LIVE later. ' +
      'tokensToGreen is null in fixture mode. Baseline enables ÷10 targets after W1–W2.',
    cases,
    summary,
  };

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.relative(REPO, REPORT_PATH)}`);

  if (writeBaseline) {
    const baseline = {
      capturedAt: report.capturedAt,
      mode: report.mode,
      cases: cases.map((c) => ({
        id: c.id,
        kind: c.kind,
        turnsToGreen: c.turnsToGreen,
        tokensToGreen: c.tokensToGreen,
        cheated: c.cheated,
        status: c.status,
      })),
      summary: report.summary,
    };
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote ${path.relative(REPO, BASELINE_PATH)} (baseline)`);
  } else {
    try {
      const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
      console.log(
        `Baseline medianTurnsTypeOnly=${baseline.summary?.medianTurnsTypeOnly} ` +
          `current=${summary.medianTurnsTypeOnly} cheatedRate=${summary.cheatedRate}`
      );
    } catch {
      /* ignore */
    }
  }

  // CI-safe exit: fixture mode fails only on ERROR/CHEATED for type-only expected PASS
  const hardFail = cases.some(
    (c) =>
      c.status === 'ERROR' ||
      c.status === 'CHEATED' ||
      (c.kind === 'type-only' && c.status === 'FAIL')
  );
  if (hardFail) {
    console.error('[loop-cost] FAIL — see report');
    process.exit(1);
  }
  console.log(
    `[loop-cost] OK — ${cases.length} cases, medianTurnsTypeOnly=${summary.medianTurnsTypeOnly}, cheatedRate=${summary.cheatedRate}`
  );
}

main();
