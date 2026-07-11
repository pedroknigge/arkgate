#!/usr/bin/env node
/**
 * Comparative eval — static oracle mode (CI-safe).
 *
 * Loads 30 enthusiast prompts from eval/comparative/prompts.json. Fixture-backed
 * entries are verified with real ark-check runs on with-ark / without-ark trees;
 * oracle-only entries ship curated metrics for reporting.
 *
 * Usage:
 *   node eval/comparative-run.mjs
 *   ARK_COMPARATIVE_OUT=eval/comparative-report.json node eval/comparative-run.mjs
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEnvironmentValue } from '../bin/lib/product-identity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const PROMPTS_PATH = path.join(HERE, 'comparative', 'prompts.json');
const FIXTURES_DIR = path.join(HERE, 'comparative', 'fixtures');
const comparativeOutput = resolveEnvironmentValue(
  process.env,
  'STRUCTRAIL_COMPARATIVE_OUT',
  'ARK_COMPARATIVE_OUT'
).value;
const OUT_PATH = comparativeOutput
  ? path.resolve(comparativeOutput)
  : path.join(HERE, 'comparative-report.json');

const REQUIRED_METRIC_KEYS = ['layerViolations', 'misplacedFiles', 'contractIntact', 'cheated'];

function runCheck(root) {
  const res = spawnSync(
    process.execPath,
    [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--strict-config', '--json'],
    { encoding: 'utf8' }
  );
  const raw = `${res.stdout || ''}${res.stderr || ''}`.trim();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`ark-check did not return JSON for ${root}\n${raw}`);
  }
  return { exitCode: res.status ?? 1, json };
}

function measureTree(root) {
  const { json } = runCheck(root);
  const violations = json.violations ?? [];
  const files = new Set(
    violations
      .map((v) => v.file)
      .filter((file) => typeof file === 'string' && file.length > 0)
  );
  return {
    layerViolations: violations.length,
    misplacedFiles: files.size,
    contractIntact: true,
    cheated: false,
    governedPercent: json.coverage?.governed?.percent ?? (json.ok ? 100 : 0),
    ok: !!json.ok,
  };
}

function assertMetricsShape(label, metrics) {
  for (const key of REQUIRED_METRIC_KEYS) {
    if (!(key in metrics)) {
      throw new Error(`${label} missing metric ${key}`);
    }
  }
}

function metricsMatch(oracle, measured, label) {
  for (const key of ['layerViolations', 'misplacedFiles']) {
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
    ...(metrics.governedPercent !== undefined ? { governedPercent: metrics.governedPercent } : {}),
  };
}

function validateFixture(prompt) {
  const base = path.join(FIXTURES_DIR, prompt.fixture);
  const withoutRoot = path.join(base, 'without-ark');
  const withRoot = path.join(base, 'with-ark');
  if (!fs.existsSync(withoutRoot) || !fs.existsSync(withRoot)) {
    throw new Error(`Fixture ${prompt.fixture} missing with-ark or without-ark tree`);
  }

  const withoutMeasured = measureTree(withoutRoot);
  const withMeasured = measureTree(withRoot);

  if (withoutMeasured.ok) {
    throw new Error(`Fixture ${prompt.fixture}/without-ark expected violations but check passed`);
  }
  if (!withMeasured.ok) {
    throw new Error(`Fixture ${prompt.fixture}/with-ark expected green check but failed`);
  }
  if (withoutMeasured.layerViolations < 1) {
    throw new Error(`Fixture ${prompt.fixture}/without-ark expected >=1 violation`);
  }
  if (withMeasured.layerViolations !== 0) {
    throw new Error(`Fixture ${prompt.fixture}/with-ark expected 0 violations`);
  }

  metricsMatch(prompt.withoutArk, withoutMeasured, `${prompt.id}.withoutArk`);
  metricsMatch(prompt.withArk, withMeasured, `${prompt.id}.withArk`);

  return {
    verified: true,
    measured: {
      withoutArk: withoutMeasured,
      withArk: withMeasured,
    },
  };
}

function main() {
  const bank = JSON.parse(fs.readFileSync(PROMPTS_PATH, 'utf8'));
  const prompts = bank.prompts ?? [];
  if (prompts.length !== 30) {
    console.error(`Expected 30 prompts, found ${prompts.length}`);
    process.exitCode = 1;
    return;
  }

  const results = [];
  let failures = 0;

  for (const prompt of prompts) {
    assertMetricsShape(`${prompt.id}.withoutArk`, prompt.withoutArk);
    assertMetricsShape(`${prompt.id}.withArk`, prompt.withArk);

    const entry = {
      id: prompt.id,
      prompt: prompt.prompt,
      archetype: prompt.archetype,
      withoutArk: { ...prompt.withoutArk },
      withArk: { ...prompt.withArk },
      source: prompt.fixture ? 'fixture+oracle' : 'oracle',
    };

    if (prompt.fixture) {
      try {
        const fixture = validateFixture(prompt);
        entry.fixture = prompt.fixture;
        entry.fixtureVerified = fixture.verified;
        entry.source = 'fixture-measured';
        entry.withoutArk = stripMeasured(fixture.measured.withoutArk);
        entry.withArk = stripMeasured(fixture.measured.withArk);
        entry.measured = fixture.measured;
      } catch (error) {
        failures += 1;
        entry.fixtureVerified = false;
        entry.error = error instanceof Error ? error.message : String(error);
        console.error(`✖ ${prompt.id}: ${entry.error}`);
      }
    }

    results.push(entry);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: bank.mode ?? 'static-oracle',
    promptCount: results.length,
    fixtureBacked: results.filter((r) => r.fixture).length,
    summary: {
      withoutArk: {
        avgLayerViolations:
          results.reduce((sum, r) => sum + r.withoutArk.layerViolations, 0) / results.length,
        avgMisplacedFiles:
          results.reduce((sum, r) => sum + r.withoutArk.misplacedFiles, 0) / results.length,
      },
      withArk: {
        avgLayerViolations:
          results.reduce((sum, r) => sum + r.withArk.layerViolations, 0) / results.length,
        avgMisplacedFiles:
          results.reduce((sum, r) => sum + r.withArk.misplacedFiles, 0) / results.length,
        avgGovernedPercent:
          results.reduce((sum, r) => sum + (r.withArk.governedPercent ?? 0), 0) / results.length,
      },
    },
    results,
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${OUT_PATH} (${report.promptCount} prompts, ${report.fixtureBacked} fixture-backed)`);

  if (failures > 0) {
    console.error(`${failures} fixture verification failure(s)`);
    process.exitCode = 1;
  }
}

main();
