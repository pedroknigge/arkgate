/** Report TypeScript-host unavailability without a false-green architecture result. */
import fs from 'node:fs';
import path from 'node:path';
import { computeCoverage, runDoctor, runPlan } from './doctor-plan.mjs';
import { ANALYSIS_COMPLETENESS } from './analysis-completeness.mjs';
import { summarizeParseHealth } from './parse-health.mjs';

export function reportUnavailableAnalysis({
  root,
  config,
  rules,
  files,
  args,
  message,
  nextAction,
  createResult,
}) {
  const completeness = ANALYSIS_COMPLETENESS.unavailable;
  const parseHealth = summarizeParseHealth();
  const finding = {
    ruleId: 'ANALYSIS_HOST_UNAVAILABLE',
    message,
    nextAction,
    file: '<analysis-host>',
  };

  if (args.plan) {
    const coverage = computeCoverage(root, config, files, rules);
    runPlan(root, [], args.json, coverage.governed.percent, coverage.governed.totalFiles, {
      config,
      files,
      coverage,
      completeness,
    });
    process.exitCode = 2;
    return;
  }

  if (args.doctor) {
    const configPath = path.isAbsolute(args.config) ? args.config : path.join(root, args.config);
    runDoctor(root, config, files, rules, [], args.json, {
      configPath,
      configMissing: !fs.existsSync(configPath),
      parseHealth,
      completeness,
    });
    process.exitCode = 2;
    return;
  }

  const adapterResult = createResult({
    valid: false,
    completeness,
    violations: [finding],
  });
  if (args.json) {
    console.log(JSON.stringify({
      ...adapterResult,
      ok: false,
      violations: [finding],
      warnings: [],
    }, null, 2));
  } else {
    console.error(message);
    console.error(`Next action: ${nextAction}`);
  }
  process.exitCode = 2;
}
