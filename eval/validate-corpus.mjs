#!/usr/bin/env node
/**
 * R5 static corpus precheck — no live agent.
 *
 * Validates eval/cases/:
 *   1. ≥ MIN_CASES directories with case.json
 *   2. Each case has expected labels (expectedFixClass + theme; skipHarness may omit ruleId)
 *   3. Required R5 themes are covered by at least one case
 *   4. Every non-skipHarness fixture fails real ark-check with exit 1 and ≥1 violation
 *   5. When expectedRemediationKind is set, --plan first step matches (mechanical-safe kinds)
 *
 * Exit 0 = corpus green for CI. Does not run the agent harness.
 *
 * Usage: node eval/validate-corpus.mjs
 *        npm run eval:corpus
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Vocabulary from the product classifier (generated CLI pure), not a parallel list.
import {
  KNOWN_FIX_CLASSES as FIX_CLASS_LIST,
  MECHANICAL_SAFE_KINDS,
  REMEDIATION_CLASSES,
} from '../bin/lib/remediation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const CASES_DIR = path.join(HERE, 'cases');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');

const MIN_CASES = 15;

/** R5 named scenarios — at least one case each (existing may count). */
const REQUIRED_THEMES = [
  'type-only-move',
  'nest-overlay',
  'next-core-bag',
  'monorepo-frontend',
  'wrong-layer',
  'domain-forbidden-global',
  'baseline-ratchet',
  'pure-type-relocate',
];

const KNOWN_FIX_CLASSES = new Set(FIX_CLASS_LIST);
const KNOWN_REMEDIATION_CLASSES = new Set(REMEDIATION_CLASSES);
const KNOWN_REMEDIATION_KINDS = new Set(MECHANICAL_SAFE_KINDS);

function listCaseDirs() {
  if (!fs.existsSync(CASES_DIR)) return [];
  return fs
    .readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function loadCase(name) {
  const dir = path.join(CASES_DIR, name);
  const casePath = path.join(dir, 'case.json');
  if (!fs.existsSync(casePath)) {
    return { name, dir, error: 'missing case.json' };
  }
  let def;
  try {
    def = JSON.parse(fs.readFileSync(casePath, 'utf8'));
  } catch (err) {
    return { name, dir, error: `invalid case.json: ${err.message}` };
  }
  return { name, dir, def };
}

function runArkCheck(root, extraArgs = []) {
  const res = spawnSync(
    process.execPath,
    [ARK_CHECK, '--root', root, '--config', 'ark.config.json', ...extraArgs],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  );
  return {
    code: res.status ?? 1,
    output: `${res.stdout || ''}${res.stderr || ''}`.trim(),
  };
}

function main() {
  const errors = [];
  const notes = [];
  const names = listCaseDirs();

  if (names.length < MIN_CASES) {
    errors.push(`case count ${names.length} < ${MIN_CASES}`);
  } else {
    notes.push(`case count: ${names.length} (≥ ${MIN_CASES})`);
  }

  const themes = new Map(); // theme → [case names]
  let harnessCases = 0;

  for (const name of names) {
    const loaded = loadCase(name);
    if (loaded.error) {
      errors.push(`${name}: ${loaded.error}`);
      continue;
    }
    const { def, dir } = loaded;

    if (!def.description || typeof def.description !== 'string') {
      errors.push(`${name}: case.json missing description`);
    }
    if (!def.expectedFix || typeof def.expectedFix !== 'string') {
      errors.push(`${name}: case.json missing expectedFix`);
    }
    if (!def.theme || typeof def.theme !== 'string') {
      errors.push(`${name}: case.json missing theme`);
    } else {
      const list = themes.get(def.theme) || [];
      list.push(name);
      themes.set(def.theme, list);
    }

    if (!def.expectedFixClass || typeof def.expectedFixClass !== 'string') {
      errors.push(`${name}: case.json missing expectedFixClass`);
    } else if (!KNOWN_FIX_CLASSES.has(def.expectedFixClass)) {
      errors.push(
        `${name}: unknown expectedFixClass "${def.expectedFixClass}" (known: ${[...KNOWN_FIX_CLASSES].join(', ')})`
      );
    }

    if (!def.expectedRemediationClass || typeof def.expectedRemediationClass !== 'string') {
      errors.push(`${name}: case.json missing expectedRemediationClass`);
    } else if (!KNOWN_REMEDIATION_CLASSES.has(def.expectedRemediationClass)) {
      errors.push(`${name}: unknown expectedRemediationClass "${def.expectedRemediationClass}"`);
    }

    if (def.expectedRemediationKind != null) {
      if (!KNOWN_REMEDIATION_KINDS.has(def.expectedRemediationKind)) {
        errors.push(`${name}: unknown expectedRemediationKind "${def.expectedRemediationKind}"`);
      }
    }

    if (def.skipHarness === true) {
      notes.push(`${name}: skipHarness (architect / non-live)`);
      continue;
    }

    harnessCases += 1;
    if (!fs.existsSync(path.join(dir, 'ark.config.json'))) {
      errors.push(`${name}: missing ark.config.json (required unless skipHarness)`);
      continue;
    }

    const check = runArkCheck(dir);
    if (check.code !== 1) {
      errors.push(
        `${name}: ark-check exit ${check.code} (want 1 — fixture must violate). Tail:\n${check.output.slice(-400)}`
      );
      continue;
    }
    if (!/violation/i.test(check.output)) {
      errors.push(`${name}: ark-check exit 1 but output has no "violation" marker`);
    }

    // Label alignment for mechanical-safe kinds via --plan
    if (def.expectedRemediationKind || def.expectedRemediationClass === 'mechanical-safe') {
      const planRun = runArkCheck(dir, ['--plan', '--json']);
      let plan;
      try {
        plan = JSON.parse(planRun.output);
      } catch {
        errors.push(`${name}: --plan --json not parseable`);
        continue;
      }
      const step = plan?.plan?.steps?.find((s) => s.ruleId === def.expectedRuleId) || plan?.plan?.steps?.[0];
      if (!step) {
        errors.push(`${name}: --plan has no steps`);
        continue;
      }
      if (def.expectedRemediationClass && step.class !== def.expectedRemediationClass) {
        errors.push(
          `${name}: plan class "${step.class}" !== expectedRemediationClass "${def.expectedRemediationClass}"`
        );
      }
      if (def.expectedRemediationKind && step.remediationKind !== def.expectedRemediationKind) {
        errors.push(
          `${name}: plan remediationKind "${step.remediationKind}" !== expected "${def.expectedRemediationKind}"`
        );
      }
    }

    notes.push(`${name}: violates (exit 1) theme=${def.theme} fixClass=${def.expectedFixClass}`);
  }

  for (const theme of REQUIRED_THEMES) {
    if (!themes.has(theme) || themes.get(theme).length === 0) {
      errors.push(`missing required R5 theme: ${theme}`);
    } else {
      notes.push(`theme ${theme}: ${themes.get(theme).join(', ')}`);
    }
  }

  notes.push(`harness-eligible cases: ${harnessCases}`);

  console.log('Ark eval corpus validation (static, no agent)');
  console.log('─'.repeat(48));
  for (const n of notes) console.log(`  · ${n}`);
  console.log('─'.repeat(48));

  if (errors.length > 0) {
    console.error(`FAILED (${errors.length} error(s)):`);
    for (const e of errors) console.error(`  ✖ ${e}`);
    process.exit(1);
  }

  console.log(`OK — ${names.length} cases, all required themes, all harness fixtures violate.`);
  process.exit(0);
}

main();
