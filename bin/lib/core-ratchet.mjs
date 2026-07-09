/**
 * Core-layer optionality ratchet — pure plan + CLI runner.
 * Keeps ark-check.mjs orchestration-only (dispatch only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';
import { computeCoverage } from './doctor-plan.mjs';

/**
 * Core layers whose optionality matters once they match files (presets share these names).
 * Used by doctor adoption gaps and `--ratchet-cores`.
 */
export const CORE_LAYER_NAMES = new Set([
  'DomainModel',
  'ApplicationOrchestration',
  'PresentationAdapters',
  'PersistenceAdapters',
]);

/**
 * Plan a ratchet of optional→required for core layers that already match files.
 * Empty cores stay optional (avoids false ENFORCE theatre). Pure — does not write disk.
 *
 * @param {object} config ark.config.json shape
 * @param {{ name: string, files: number }[]} layerRows coverage layer rows
 */
export function planPopulatedCoreRatchet(config, layerRows = []) {
  const countByName = new Map(
    (Array.isArray(layerRows) ? layerRows : []).map((row) => [row.name, Number(row.files) || 0])
  );
  const ratcheted = [];
  const alreadyStrict = [];
  const stillOptionalEmpty = [];
  const nextLayers = (config?.layers ?? []).map((layer) => {
    if (!CORE_LAYER_NAMES.has(layer.name)) return layer;
    const files = countByName.get(layer.name) ?? 0;
    if (layer.optional !== true) {
      if (files > 0) alreadyStrict.push({ layer: layer.name, files });
      return layer;
    }
    if (files <= 0) {
      stillOptionalEmpty.push(layer.name);
      return layer;
    }
    ratcheted.push({ layer: layer.name, files });
    return { ...layer, optional: false };
  });
  return {
    ratcheted,
    alreadyStrict,
    stillOptionalEmpty,
    config: { ...(config ?? {}), layers: nextLayers },
    changed: ratcheted.length > 0,
  };
}

/**
 * When the architecture is green (raw violations = 0, not baselined), ratchet populated
 * core layers from optional→required so doctor can honestly report ENFORCE.
 * Empty cores stay optional. Always writes when changes apply (like --update-baseline).
 *
 * @param {string} root
 * @param {object} config
 * @param {string[]} files
 * @param {object[]} rules
 * @param {object[]} violations raw scan violations (baseline ignored — must be truly clean)
 * @param {{ json?: boolean, config?: string }} args
 * @param {{ displayPathFromRoot: (root: string, abs: string) => string }} deps
 */
export function runRatchetCores(root, config, files, rules, violations, args, deps) {
  const displayPathFromRoot = deps.displayPathFromRoot;
  const cov = computeCoverage(root, config, files, rules);
  const activeCount = Array.isArray(violations) ? violations.length : 0;
  const configPath = path.isAbsolute(args.config)
    ? args.config
    : path.join(root, args.config || 'ark.config.json');

  const refuse = (code, message, extra = {}) => {
    if (args.json) {
      console.log(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
    } else {
      console.error(message);
    }
    process.exitCode = code;
  };

  if (activeCount > 0) {
    refuse(
      2,
      `Refusing --ratchet-cores: ${activeCount} active architecture violation(s) (raw graph; baseline does not count). Resolve them first (ark-check --plan), then re-run.`,
      { activeViolations: activeCount, governed: cov.governed }
    );
    return;
  }
  if (cov.totalFiles === 0 || (cov.governed?.percent ?? 0) < 50) {
    refuse(
      2,
      `Refusing --ratchet-cores: governed coverage is too low (${cov.governed?.percent ?? 0}% of ${cov.totalFiles} files). Classify ungoverned code first.`,
      { governed: cov.governed }
    );
    return;
  }

  const plan = planPopulatedCoreRatchet(config, cov.layers);
  if (!plan.changed) {
    const payload = {
      ok: true,
      changed: false,
      message: 'No optional core layers with files — nothing to ratchet.',
      alreadyStrict: plan.alreadyStrict,
      stillOptionalEmpty: plan.stillOptionalEmpty,
      governed: cov.governed,
    };
    if (args.json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(payload.message);
      if (plan.stillOptionalEmpty.length > 0) {
        console.log(`Still optional (empty patterns): ${plan.stillOptionalEmpty.join(', ')}`);
      }
    }
    return;
  }

  fs.writeFileSync(configPath, `${JSON.stringify(plan.config, null, 2)}\n`);
  const payload = {
    ok: true,
    changed: true,
    configPath: displayPathFromRoot(root, configPath),
    ratcheted: plan.ratcheted,
    stillOptionalEmpty: plan.stillOptionalEmpty,
    governed: cov.governed,
    next: arkCommand(root, 'ark-check', '--doctor'),
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(
      `Ratcheted ${plan.ratcheted.length} core layer(s) to optional: false (populated only):`
    );
    for (const row of plan.ratcheted) {
      console.log(`  ${row.layer} (${row.files} file(s))`);
    }
    if (plan.stillOptionalEmpty.length > 0) {
      console.log(
        `Left optional (empty patterns — avoid false ENFORCE): ${plan.stillOptionalEmpty.join(', ')}`
      );
    }
    console.log(`Wrote ${displayPathFromRoot(root, configPath)}`);
    console.log(`Confirm: ${payload.next}`);
  }
}
