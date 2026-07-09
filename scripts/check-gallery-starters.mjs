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
import { ARCHITECTURE_PRESETS } from '../bin/lib/presets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

const STARTERS = [
  { dir: 'examples/vertical-slice-starter', preset: 'vertical-slice' },
  { dir: 'examples/ddd-context-starter', preset: 'ddd-bounded-contexts' },
];

function stableStringify(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

let failed = false;
for (const { dir, preset } of STARTERS) {
  const factory = ARCHITECTURE_PRESETS[preset];
  if (typeof factory !== 'function') {
    console.error(`Unknown preset "${preset}" for ${dir}`);
    failed = true;
    continue;
  }
  const expected = factory([]);
  const configPath = path.join(root, dir, 'ark.config.json');
  const next = stableStringify(expected);
  if (write) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, next, 'utf8');
    console.log(`Wrote ${path.relative(root, configPath)} from preset ${preset}`);
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
}

if (failed) process.exit(1);
console.log('Gallery starter configs match preset factories.');
