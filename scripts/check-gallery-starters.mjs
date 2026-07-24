#!/usr/bin/env node
/**
 * Ensure gallery starter ark.config.json files match ARCHITECTURE_PRESETS factories.
 * Usage:
 *   node scripts/check-gallery-starters.mjs           # exit 1 if drift
 *   node scripts/check-gallery-starters.mjs --write   # regenerate configs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GALLERY_STARTERS } from '../bin/ark-shared.mjs';
import { ARCHITECTURE_PRESETS, writeArkRulesTemplates } from '../bin/lib/presets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

function stableStringify(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/** Fail if arkRules map points at missing files (strict-config requires them). */
function missingArkRulesFiles(starterDir, config) {
  const refs = config?.arkRules;
  if (!refs || typeof refs !== 'object') return [];
  const missing = [];
  for (const [layer, rel] of Object.entries(refs)) {
    if (typeof rel !== 'string') continue;
    const target = path.join(root, starterDir, rel);
    if (!fs.existsSync(target)) missing.push(`${layer} → ${rel}`);
  }
  return missing;
}

let failed = false;
for (const { directory, generatedPreset: preset } of GALLERY_STARTERS.filter(
  (starter) => starter.generatedPreset
)) {
  const factory = ARCHITECTURE_PRESETS[preset];
  if (typeof factory !== 'function') {
    console.error(`Unknown preset "${preset}" for ${directory}`);
    failed = true;
    continue;
  }
  const expected = factory([]);
  const starterRoot = path.join(root, directory);
  const configPath = path.join(starterRoot, 'ark.config.json');
  const next = stableStringify(expected);
  if (write) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, next, 'utf8');
    const writtenRules = writeArkRulesTemplates(starterRoot, expected, { force: false });
    console.log(`Wrote ${path.relative(root, configPath)} from preset ${preset}`);
    if (writtenRules.length) {
      console.log(`  + arkrules: ${writtenRules.join(', ')}`);
    }
    continue;
  }
  if (!fs.existsSync(configPath)) {
    console.error(`Missing ${configPath} — run with --write`);
    failed = true;
    continue;
  }
  const current = fs.readFileSync(configPath, 'utf8');
  if (current !== next) {
    console.error(
      `Drift: ${path.relative(root, configPath)} does not match ARCHITECTURE_PRESETS['${preset}'](). Run: node scripts/check-gallery-starters.mjs --write`
    );
    failed = true;
  } else {
    console.log(`OK ${path.relative(root, configPath)} ↔ ${preset}`);
  }
  const missing = missingArkRulesFiles(directory, expected);
  if (missing.length) {
    console.error(
      `Missing arkRules files in ${directory}: ${missing.join('; ')}. Run: node scripts/check-gallery-starters.mjs --write`
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Gallery starter configs match preset factories.');
