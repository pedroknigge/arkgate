/**
 * One definition of projected governed coverage: include-scoped files that
 * match a layer glob, via computeCoverage. Shared by start, --recommend, and
 * doctor so the same tree cannot advertise two "projected" percents.
 */
import fs from 'node:fs';
import path from 'node:path';
import { collectGovernedFiles } from './scan-files.mjs';
import { computeCoverage } from './doctor-plan.mjs';
import { ARCHITECTURE_PRESETS } from './presets.mjs';
import {
  detectWorkspaces,
  resolveIncludeRoots,
  resolveStartInitPreset,
} from '../ark-shared.mjs';

export function measureGovernedCoverage(root, config) {
  const files = collectGovernedFiles(root, config);
  return computeCoverage(root, config, files, config.rules ?? []);
}

export function summarizeGovernedCoverage(coverage) {
  const governed = coverage?.governed ?? {};
  return {
    percent: typeof governed.percent === 'number' ? governed.percent : 0,
    classifiedFiles: governed.classifiedFiles ?? 0,
    totalFiles: governed.totalFiles ?? coverage?.totalFiles ?? 0,
    emptyScope: coverage?.emptyScope === true,
  };
}

export function starterConfigForPreset(root, preset) {
  const factory = ARCHITECTURE_PRESETS[preset];
  if (typeof factory !== 'function') return null;
  const workspacesOrInclude =
    preset === 'monorepo' || preset === 'ui-surface'
      ? resolveIncludeRoots(root)
      : detectWorkspaces(root);
  return factory(workspacesOrInclude, root);
}

/**
 * Contract start/recommend/doctor should score: existing ark.config.json, else
 * the starter --init would write for this tree (same preset resolution as start).
 */
export function resolveProjectedCoverageConfig(root, recommendation = {}) {
  const configPath = path.join(root, 'ark.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        return { config: parsed, source: 'existing-config' };
      }
    } catch {
      /* fall through to starter */
    }
  }
  const preset = resolveStartInitPreset(root, recommendation);
  if (!preset) return { config: null, source: 'none', preset: null };
  return { config: starterConfigForPreset(root, preset), source: 'start-starter', preset };
}

export function measureProjectedGovernedCoverage(root, recommendation = {}) {
  const resolved = resolveProjectedCoverageConfig(root, recommendation);
  if (!resolved.config) {
    return {
      percent: 0,
      classifiedFiles: 0,
      totalFiles: 0,
      emptyScope: true,
      source: resolved.source,
      preset: resolved.preset ?? null,
    };
  }
  return {
    ...summarizeGovernedCoverage(measureGovernedCoverage(root, resolved.config)),
    source: resolved.source,
    preset: resolved.preset ?? recommendation.preset ?? null,
  };
}

const PROJECTED_COVERAGE_REASON = /projected governed coverage is \d+% \(below 90%\)/;

export function withProjectedGovernedCoverage(recommendation, root) {
  if (!recommendation || typeof recommendation !== 'object') return recommendation;
  const measured = measureProjectedGovernedCoverage(root, recommendation);
  const percent = measured.percent;
  const confirmationReasons = (recommendation.confirmationReasons ?? []).filter(
    (reason) => !PROJECTED_COVERAGE_REASON.test(String(reason))
  );
  if (percent < 90) {
    confirmationReasons.push(`projected governed coverage is ${percent}% (below 90%)`);
  }
  return {
    ...recommendation,
    requiresConfirmation:
      Boolean(recommendation.requiresConfirmation) ||
      percent < 90 ||
      Boolean(recommendation.thinTsSurface),
    confirmationReasons,
    signals: {
      ...recommendation.signals,
      projectedGovernedCoverage: percent,
      projectedGovernedClassifiedFiles: measured.classifiedFiles,
      projectedGovernedTotalFiles: measured.totalFiles,
      projectedGovernedSource: measured.source,
    },
    projectedCoverage: {
      percent,
      classifiedFiles: measured.classifiedFiles,
      totalFiles: measured.totalFiles,
    },
  };
}
