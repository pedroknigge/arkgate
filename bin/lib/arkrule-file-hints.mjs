/**
 * Tooling I/O for AR07 orchestration-only / thin-adapter fileHints.
 * Pure derivation lives in Domain (`deriveArkRuleFileHints` / `buildArkRuleFileHints`);
 * this module loads bounded source text when those sensors are active.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildArkRuleFileHints } from './arkrules-sensors.mjs';

const MAX_HINT_FILES = 400;
const MAX_FILE_BYTES = 256 * 1024;

const HINT_SENSORS = new Set(['orchestration-only', 'thin-adapter']);

/**
 * @param {{ structure?: Array<{ sensor?: string }> } | null | undefined} arkRules
 */
export function needsArkRuleFileHints(arkRules) {
  return (arkRules?.structure ?? []).some((rule) => HINT_SENSORS.has(rule?.sensor));
}

/**
 * Load governed source contents (bounded) and derive fileHints.
 *
 * @param {string} root
 * @param {{ files?: Array<{ path: string }> }} facts
 * @param {{ structure?: Array<{ sensor?: string }> } | null | undefined} arkRules
 * @param {Readonly<Record<string, string>>} [preloadedContents] optional reuse from coverage I/O
 * @returns {Record<string, { orchestrationHeavy?: boolean, adapterThick?: boolean }> | undefined}
 */
export function loadArkRuleFileHints(root, facts, arkRules, preloadedContents) {
  if (!needsArkRuleFileHints(arkRules)) return undefined;

  const fileContents = { ...(preloadedContents ?? {}) };
  const seen = new Set(Object.keys(fileContents));

  const pushFile = (relPath) => {
    const rel = String(relPath || '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '');
    if (!rel || seen.has(rel) || seen.size >= MAX_HINT_FILES) return;
    if (!/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/i.test(rel)) return;
    if (rel.includes('node_modules/') || rel.endsWith('.d.ts')) return;
    const absolute = path.resolve(root, rel);
    if (!absolute.startsWith(path.resolve(root))) return;
    try {
      const stat = fs.statSync(absolute);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return;
      fileContents[rel] = fs.readFileSync(absolute, 'utf8');
      seen.add(rel);
    } catch {
      // skip unreadable
    }
  };

  for (const file of facts?.files ?? []) {
    if (file?.path) pushFile(file.path);
  }

  if (Object.keys(fileContents).length === 0) return undefined;
  const hints = buildArkRuleFileHints(fileContents);
  return Object.keys(hints).length > 0 ? hints : {};
}
