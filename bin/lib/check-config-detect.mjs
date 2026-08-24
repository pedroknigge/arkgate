/**
 * Convention-based ark.config detection used by --init.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_RULES,
} from '../ark-shared.mjs';
import { normalize, walk } from './scan-files.mjs';
import { suggestLayerForDir } from './suggestions.mjs';

/**
 * Infer an ark.config.json from the directories that actually exist in the project,
 * using the same layer→directory conventions as the eleven-layer template. A directory
 * only counts when it contains at least one source file, so an empty scaffold dir can't
 * produce a layer whose pattern matches nothing (which --strict-config would fail).
 */
export function detectConfig(root) {
  const srcDir = fs.existsSync(path.join(root, 'src')) ? 'src' : '.';
  const layers = [];

  for (const entry of DEFAULT_INTENT_PREFIXES) {
    const directories = (DEFAULT_LAYER_DIRECTORIES[entry.layer] ?? []).filter(
      (directory) => walk(path.join(root, srcDir, directory), [], { root }).length > 0
    );
    if (directories.length === 0) continue;
    layers.push({
      name: entry.layer,
      patterns: directories.map((directory) => `${normalize(path.join(srcDir, directory))}/**`),
      intentPrefixes: entry.prefixes,
      ...(entry.layer === 'DomainModel'
        ? { forbiddenGlobals: DEFAULT_DOMAIN_FORBIDDEN_GLOBALS }
        : {}),
    });
  }

  const names = new Set(layers.map((layer) => layer.name));
  const rules = DEFAULT_RULES.filter((rule) => names.has(rule.from) && names.has(rule.to));

  return { srcDir, config: { include: [srcDir], layers, rules } };
}

/** Top-level directories under srcDir not covered by any detected layer pattern. */
export function uncoveredDirectories(root, srcDir, layers) {
  const base = path.join(root, srcDir);
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        entry.name !== 'dist' &&
        !entry.name.startsWith('.')
    )
    .map((entry) => entry.name)
    .filter((name) => {
      const prefix = `${normalize(path.join(srcDir, name))}/`;
      return !layers.some((layer) =>
        layer.patterns.some((pattern) => pattern.startsWith(prefix))
      );
    });
}

export function proposeForUncovered(root, srcDir, layers) {
  const proposals = [];
  for (const top of uncoveredDirectories(root, srcDir, layers)) {
    const direct = suggestLayerForDir(top);
    if (direct) {
      proposals.push({ dir: `${srcDir}/${top}`, ...direct });
      continue;
    }
    let children = [];
    try {
      children = fs
        .readdirSync(path.join(root, srcDir, top), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.'))
        .map((e) => e.name);
    } catch {
      /* not a readable directory — treat as unrecognized below */
    }
    if (children.length > 0) {
      // Descend: propose per child so a mixed `lib/` yields lib/repositories → Persistence
      // AND flags lib/db as unrecognized, instead of dropping the parts Ark can't place.
      for (const child of children) {
        const hit = suggestLayerForDir(child);
        proposals.push(
          hit
            ? { dir: `${srcDir}/${top}/${child}`, ...hit }
            : { dir: `${srcDir}/${top}/${child}`, unrecognized: true }
        );
      }
    } else {
      proposals.push({ dir: `${srcDir}/${top}`, unrecognized: true });
    }
  }
  return proposals;
}
