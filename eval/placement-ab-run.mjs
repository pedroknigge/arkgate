#!/usr/bin/env node
/**
 * ACS07 — Maintainer placement A/B eval (with gates+skills vs without).
 *
 * Default mode is **dry** (CI-safe): fixture-measured with real ark-check, no live LLM.
 * Optional **live** mode documents offline agent runs; missing agent/API keys never fail CI.
 *
 * Not a product score. Informational maintainer evidence only.
 *
 * Usage:
 *   node eval/placement-ab-run.mjs
 *   node eval/placement-ab-run.mjs --dry
 *   node eval/placement-ab-run.mjs --mode dry
 *   ARK_PLACEMENT_AB_OUT=eval/placement-ab-report.json node eval/placement-ab-run.mjs
 *   npm run eval:placement-ab
 *
 * Results path (documented):
 *   eval/placement-ab-report.json
 *   eval/placement-ab/results/RESULTS.template.json
 *   eval/placement-ab/results/live-report.json (optional live; not required for CI)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const SUITE_DIR = path.join(HERE, 'placement-ab');
const TASKS_PATH = path.join(SUITE_DIR, 'tasks.json');
const FIXTURES_DIR = path.join(SUITE_DIR, 'fixtures');
const TEMPLATE_PATH = path.join(SUITE_DIR, 'results', 'RESULTS.template.json');
const DEFAULT_OUT = path.join(HERE, 'placement-ab-report.json');
const LIVE_OUT = path.join(SUITE_DIR, 'results', 'live-report.json');

const OUT_PATH = process.env.ARK_PLACEMENT_AB_OUT
  ? path.resolve(process.env.ARK_PLACEMENT_AB_OUT)
  : DEFAULT_OUT;

const SKILL_LAYOUT = '.agents/skills';

function parseMode(argv) {
  if (argv.includes('--live') || argv.includes('--mode=live')) return 'live';
  const at = argv.indexOf('--mode');
  if (at >= 0 && argv[at + 1]) {
    const m = String(argv[at + 1]).toLowerCase();
    if (m === 'live') return 'live';
    if (m === 'dry') return 'dry';
    throw new Error(`Unknown mode: ${m} (expected dry|live)`);
  }
  // --dry is default; accept explicit flag for clarity
  return 'dry';
}

function runCheck(root) {
  const res = spawnSync(
    process.execPath,
    [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--strict-config', '--json'],
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }
  );
  const raw = `${res.stdout || ''}${res.stderr || ''}`.trim();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`ark-check did not return JSON for ${root}\n${raw.slice(0, 500)}`);
  }
  return { exitCode: res.status ?? 1, json };
}

function listSkillNames(root) {
  const base = path.join(root, SKILL_LAYOUT);
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(base, name, 'SKILL.md')))
    .sort();
}

function measureTree(root) {
  const { json } = runCheck(root);
  const violations = json.violations ?? [];
  const files = new Set(
    violations
      .map((v) => v.file)
      .filter((file) => typeof file === 'string' && file.length > 0)
  );
  const skills = listSkillNames(root);
  return {
    layerViolations: violations.length,
    misplacedFiles: files.size,
    contractIntact: true,
    cheated: false,
    skillsPresent: skills.length > 0,
    skillNames: skills,
    governedPercent: json.coverage?.governed?.percent ?? (json.ok ? 100 : 0),
    ok: !!json.ok,
  };
}

function assertMetricsShape(label, metrics) {
  for (const key of ['layerViolations', 'misplacedFiles', 'contractIntact', 'cheated', 'skillsPresent']) {
    if (!(key in metrics)) {
      throw new Error(`${label} missing metric ${key}`);
    }
  }
}

function metricsMatch(oracle, measured, label) {
  for (const key of ['layerViolations', 'misplacedFiles', 'skillsPresent']) {
    if (oracle[key] !== measured[key]) {
      throw new Error(
        `${label} oracle ${key}=${oracle[key]} but measured ${key}=${measured[key]}`
      );
    }
  }
}

function stripMeasured(metrics) {
  return {
    layerViolations: metrics.layerViolations,
    misplacedFiles: metrics.misplacedFiles,
    contractIntact: metrics.contractIntact,
    cheated: metrics.cheated,
    skillsPresent: metrics.skillsPresent,
    ...(metrics.skillNames ? { skillNames: metrics.skillNames } : {}),
    ...(metrics.governedPercent !== undefined ? { governedPercent: metrics.governedPercent } : {}),
  };
}

function validateFixture(task, skillsExpected) {
  const base = path.join(FIXTURES_DIR, task.fixture);
  const withoutRoot = path.join(base, 'without-gates');
  const withRoot = path.join(base, 'with-gates');
  if (!fs.existsSync(withoutRoot) || !fs.existsSync(withRoot)) {
    throw new Error(`Fixture ${task.fixture} missing with-gates or without-gates tree`);
  }

  const withoutMeasured = measureTree(withoutRoot);
  const withMeasured = measureTree(withRoot);

  if (withoutMeasured.ok) {
    throw new Error(`Fixture ${task.fixture}/without-gates expected violations but check passed`);
  }
  if (!withMeasured.ok) {
    throw new Error(`Fixture ${task.fixture}/with-gates expected green check but failed`);
  }
  if (withoutMeasured.layerViolations < 1) {
    throw new Error(`Fixture ${task.fixture}/without-gates expected >=1 violation`);
  }
  if (withMeasured.layerViolations !== 0) {
    throw new Error(`Fixture ${task.fixture}/with-gates expected 0 violations`);
  }
  if (withoutMeasured.skillsPresent) {
    throw new Error(`Fixture ${task.fixture}/without-gates must not ship Agent Skills markers`);
  }
  if (!withMeasured.skillsPresent) {
    throw new Error(`Fixture ${task.fixture}/with-gates must ship Agent Skills markers`);
  }
  for (const skill of skillsExpected) {
    if (!withMeasured.skillNames.includes(skill)) {
      throw new Error(
        `Fixture ${task.fixture}/with-gates missing expected skill marker: ${skill}`
      );
    }
  }

  metricsMatch(task.withoutGates, withoutMeasured, `${task.id}.withoutGates`);
  metricsMatch(task.withGates, withMeasured, `${task.id}.withGates`);

  return {
    verified: true,
    measured: {
      withoutGates: withoutMeasured,
      withGates: withMeasured,
    },
  };
}

function avg(nums) {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildReport({ bank, results, failures, mode }) {
  const dryVerified = results.filter((r) => r.dryVerified).length;
  const withoutSkills = results.filter((r) => r.withoutGates.skillsPresent).length;
  const withSkills = results.filter((r) => r.withGates.skillsPresent).length;
  const avgWithoutV = avg(results.map((r) => r.withoutGates.layerViolations));
  const avgWithV = avg(results.map((r) => r.withGates.layerViolations));
  const placementImproved = avgWithV < avgWithoutV && withSkills === results.length && withoutSkills === 0;

  return {
    schemaVersion: '1.0',
    id: bank.id ?? 'acs07-placement-ab',
    generatedAt: new Date().toISOString(),
    mode,
    liveLlmRequired: mode === 'live',
    notAProductScore: true,
    notes: [
      'Informational maintainer A/B only — never a package trust score or release blocker.',
      'Dry mode verifies fixture pairs with real ark-check and skills-presence markers.',
      'Live mode is optional and offline; absent API keys must not fail CI.',
      'withGates arm: ark.config contract + Agent Skills markers (ark-place, ark-architect).',
      'withoutGates arm: same contract shape for measurement, wrong placement, no skills.',
    ],
    resultsPath: {
      dryReport: 'eval/placement-ab-report.json',
      template: 'eval/placement-ab/results/RESULTS.template.json',
      liveOptional: 'eval/placement-ab/results/live-report.json',
    },
    summary: {
      taskCount: results.length,
      fixtureBacked: results.filter((r) => r.fixture).length,
      dryVerified,
      dryFailed: failures,
      withoutGates: {
        avgLayerViolations: avgWithoutV,
        avgMisplacedFiles: avg(results.map((r) => r.withoutGates.misplacedFiles)),
        skillsPresentCount: withoutSkills,
      },
      withGates: {
        avgLayerViolations: avgWithV,
        avgMisplacedFiles: avg(results.map((r) => r.withGates.misplacedFiles)),
        skillsPresentCount: withSkills,
        avgGovernedPercent: avg(results.map((r) => r.withGates.governedPercent ?? 0)),
      },
      placementImproved,
    },
    tasks: results,
  };
}

function runDry(bank) {
  const tasks = bank.tasks ?? [];
  if (tasks.length < 1) {
    throw new Error('placement-ab tasks.json has no tasks');
  }

  const skillsExpected = bank.skillsExpectedOnWithGates ?? ['ark-place', 'ark-architect'];
  const results = [];
  let failures = 0;

  for (const task of tasks) {
    assertMetricsShape(`${task.id}.withoutGates`, task.withoutGates);
    assertMetricsShape(`${task.id}.withGates`, task.withGates);

    const entry = {
      id: task.id,
      prompt: task.prompt,
      placementIntent: task.placementIntent,
      archetype: task.archetype,
      withoutGates: { ...task.withoutGates },
      withGates: { ...task.withGates },
      source: task.fixture ? 'fixture+oracle' : 'oracle',
      dryVerified: false,
    };

    if (task.fixture) {
      entry.fixture = task.fixture;
      try {
        const fixture = validateFixture(task, skillsExpected);
        entry.fixtureVerified = fixture.verified;
        entry.dryVerified = true;
        entry.source = 'fixture-measured';
        entry.withoutGates = stripMeasured(fixture.measured.withoutGates);
        entry.withGates = stripMeasured(fixture.measured.withGates);
        entry.measured = fixture.measured;
      } catch (error) {
        failures += 1;
        entry.fixtureVerified = false;
        entry.dryVerified = false;
        entry.error = error instanceof Error ? error.message : String(error);
        console.error(`✖ ${task.id}: ${entry.error}`);
      }
    }

    results.push(entry);
  }

  return { results, failures };
}

function runLiveSmoke() {
  /**
   * Live mode is optional maintainer offline tooling.
   * CI and default npm scripts use dry mode only.
   * When no agent command is configured, exit 0 with skipped status
   * so missing API keys never block release or CI.
   */
  const agentCmd = process.env.ARK_EVAL_AGENT_CMD || process.env.ARK_PLACEMENT_AB_AGENT_CMD;
  const payload = {
    schemaVersion: '1.0',
    id: 'acs07-placement-ab',
    generatedAt: new Date().toISOString(),
    mode: 'live',
    liveLlmRequired: true,
    notAProductScore: true,
    status: agentCmd ? 'not-implemented-use-dry-or-manual' : 'skipped-no-agent',
    message: agentCmd
      ? 'Live agent placement A/B is maintainer-offline only. Prefer dry mode for CI; run agents manually against eval/placement-ab/fixtures/*/without-gates|with-gates and record outcomes in eval/placement-ab/results/live-report.json.'
      : 'No ARK_EVAL_AGENT_CMD / ARK_PLACEMENT_AB_AGENT_CMD set. Live mode skipped (not a failure). Run dry mode for CI-safe verification.',
    resultsPath: {
      dryReport: 'eval/placement-ab-report.json',
      template: 'eval/placement-ab/results/RESULTS.template.json',
      liveOptional: 'eval/placement-ab/results/live-report.json',
    },
    agentCmdConfigured: Boolean(agentCmd),
  };

  fs.mkdirSync(path.dirname(LIVE_OUT), { recursive: true });
  fs.writeFileSync(LIVE_OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Live mode: ${payload.status}`);
  console.log(`Wrote ${LIVE_OUT}`);
  console.log(payload.message);
  return 0;
}

function main() {
  const mode = parseMode(process.argv.slice(2));

  if (!fs.existsSync(TASKS_PATH)) {
    console.error(`Missing tasks bank: ${TASKS_PATH}`);
    process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`Missing results template: ${TEMPLATE_PATH}`);
    process.exitCode = 2;
    return;
  }

  if (mode === 'live') {
    process.exitCode = runLiveSmoke();
    return;
  }

  const bank = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8'));
  let results;
  let failures;
  try {
    ({ results, failures } = runDry(bank));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const report = buildReport({ bank, results, failures, mode: 'dry' });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  console.log('ACS07 placement A/B (dry / fixture-measured, no live LLM)');
  console.log(`  tasks:              ${report.summary.taskCount}`);
  console.log(`  fixture-backed:     ${report.summary.fixtureBacked}`);
  console.log(`  dry verified:       ${report.summary.dryVerified}`);
  console.log(
    `  withoutGates avg V: ${report.summary.withoutGates.avgLayerViolations.toFixed(2)} (skills=${report.summary.withoutGates.skillsPresentCount})`
  );
  console.log(
    `  withGates avg V:    ${report.summary.withGates.avgLayerViolations.toFixed(2)} (skills=${report.summary.withGates.skillsPresentCount})`
  );
  console.log(`  placementImproved:  ${report.summary.placementImproved}`);
  console.log(`  notAProductScore:   ${report.notAProductScore}`);
  console.log(`Wrote ${OUT_PATH}`);

  if (failures > 0 || !report.summary.placementImproved) {
    if (failures > 0) console.error(`${failures} fixture verification failure(s)`);
    if (!report.summary.placementImproved) {
      console.error('placementImproved is false — with-gates arm did not improve placement');
    }
    process.exitCode = 1;
  }
}

main();
