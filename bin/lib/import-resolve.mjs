/**
 * Shared import path → repo-relative + layer resolution for ark-mcp write-gate.
 * Single primitive so peerIsolation and layer rules share one resolver.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  layerForRelativePath,
  matchingLayersForRelativePath,
} from '../ark-layer-match.mjs';

/**
 * Same candidate list as ark-check `resolveSpecifier` (src/kernel/moduleGraph.ts).
 * The write hook must feed `layerForRelativePath` a path with the extension
 * ark-check already sees on disk — otherwise an explicit `money.ts` pattern
 * loses to a broader `src/lib/**` bag.
 */
const SPECIFIER_SUFFIXES = Object.freeze([
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '/index.ts',
  '/index.tsx',
]);

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/i;

function posixRel(value) {
  return String(value).split(/[/\\]/).join('/');
}

function specifierRelCandidates(rel) {
  const base = posixRel(rel);
  if (SOURCE_EXT.test(base)) return [base];
  return SPECIFIER_SUFFIXES.map((suffix) => `${base}${suffix}`);
}

function isOnDiskFile(root, rel) {
  try {
    return fs.statSync(path.join(root, rel)).isFile();
  } catch {
    return false;
  }
}

/**
 * Read tsconfig path aliases via the TypeScript config parser (JSONC + extends).
 * @returns {{ baseUrl: string, aliases: Array<{ from: string, to: string }> }}
 */
export function readTsconfigAliases(ts, root) {
  if (!ts) return { baseUrl: root, aliases: [] };
  try {
    const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
    if (!configPath) return { baseUrl: root, aliases: [] };
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) return { baseUrl: root, aliases: [] };
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
    const opts = parsed.options || {};
    const baseUrl = opts.baseUrl || path.dirname(configPath);
    const aliases = [];
    for (const [pattern, targets] of Object.entries(opts.paths || {})) {
      if (!Array.isArray(targets) || targets.length === 0) continue;
      // Catch-all `*` → empty prefix would match every specifier; skip it.
      const from = pattern.replace(/\*$/, '');
      if (!from) continue;
      aliases.push({ from, to: String(targets[0]).replace(/\*$/, '') });
    }
    aliases.sort((a, b) => b.from.length - a.from.length);
    return { baseUrl, aliases };
  } catch {
    return { baseUrl: root, aliases: [] };
  }
}

function canonicalPathWithMissingTail(value) {
  const resolved = path.resolve(value);
  let current = resolved;
  const tail = [];
  while (true) {
    try {
      return path.join(fs.realpathSync(current), ...tail.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Resolve an import specifier to a repo-relative path.
 * Relative + tsconfig-aliased only; bare packages → undefined.
 */
export function resolveSpecifierToRel(specifier, fromFilePath, root, tsAliases) {
  const canonicalRoot = canonicalPathWithMissingTail(root);
  let abs;
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!fromFilePath) return undefined;
    const fromAbs = canonicalPathWithMissingTail(
      path.isAbsolute(fromFilePath) ? fromFilePath : path.resolve(root, fromFilePath)
    );
    abs = canonicalPathWithMissingTail(path.resolve(path.dirname(fromAbs), specifier));
  } else {
    const alias = tsAliases.aliases.find((a) => specifier.startsWith(a.from));
    if (!alias) return undefined;
    abs = canonicalPathWithMissingTail(
      path.resolve(tsAliases.baseUrl, `${alias.to}${specifier.slice(alias.from.length)}`)
    );
  }
  const relative = path.relative(canonicalRoot, abs);
  if (path.isAbsolute(relative) || relative.startsWith('..')) return undefined;
  return relative.split(path.sep).join('/');
}

function filePathToRel(filePath, root) {
  if (!filePath || typeof filePath !== 'string') return undefined;
  const abs = canonicalPathWithMissingTail(
    path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath)
  );
  const relative = path.relative(canonicalPathWithMissingTail(root), abs);
  if (path.isAbsolute(relative) || relative.startsWith('..')) return undefined;
  return relative.split(path.sep).join('/');
}

/**
 * Classify a specifier-relative path with the same specificity scorer as ark-check.
 * Prefer an on-disk candidate; otherwise pick the candidate whose winning
 * `layerForRelativePath` pattern scores highest (explicit file beats `src/lib/**`).
 */
function classifyProbe(root, rel, layers) {
  const candidates = specifierRelCandidates(rel);
  const existing = candidates.find((candidate) => isOnDiskFile(root, candidate));
  if (existing) {
    return {
      relPath: existing,
      layer: layerForRelativePath(existing, layers),
      onDisk: true,
    };
  }
  let bestRel = posixRel(rel);
  let bestLayer;
  let bestScore = -1;
  for (const candidate of candidates) {
    const layer = layerForRelativePath(candidate, layers);
    if (!layer) continue;
    const hit = matchingLayersForRelativePath(candidate, layers).find(
      (row) => row.layer === layer
    );
    const score = hit?.score ?? -1;
    if (score > bestScore) {
      bestScore = score;
      bestLayer = layer;
      bestRel = candidate;
    }
  }
  return { relPath: bestRel, layer: bestLayer, onDisk: false };
}

/**
 * One resolver for write-gate: specifier or absolute/repo-relative source file →
 * `{ relPath, layer }`.
 */
export function createImportTargetResolver(ts, root, config) {
  const layers = config?.layers ?? [];
  if (layers.length === 0) return undefined;
  const tsAliases = readTsconfigAliases(ts, root);

  return (specifierOrFilePath, fromFilePath) => {
    if (!specifierOrFilePath || typeof specifierOrFilePath !== 'string') return undefined;

    // Absolute filesystem path (file being written)
    if (path.isAbsolute(specifierOrFilePath)) {
      const relPath = filePathToRel(specifierOrFilePath, root);
      if (!relPath) return undefined;
      return classifyProbe(root, relPath, layers);
    }

    // Relative or path-alias import
    if (
      specifierOrFilePath.startsWith('./') ||
      specifierOrFilePath.startsWith('../') ||
      specifierOrFilePath.startsWith('@')
    ) {
      const rel = resolveSpecifierToRel(
        specifierOrFilePath,
        fromFilePath,
        root,
        tsAliases
      );
      if (!rel) return undefined;
      return classifyProbe(root, rel, layers);
    }

    // Try as import alias / bare package first
    const asImport = resolveSpecifierToRel(
      specifierOrFilePath,
      fromFilePath,
      root,
      tsAliases
    );
    if (asImport) {
      return classifyProbe(root, asImport, layers);
    }

    // Repo-relative source file path (not an import specifier)
    const asFile = filePathToRel(specifierOrFilePath, root);
    if (asFile) {
      return classifyProbe(root, asFile, layers);
    }

    return undefined;
  };
}
