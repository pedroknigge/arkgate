/**
 * Shared import path → repo-relative + layer resolution for ark-mcp write-gate.
 * Single primitive so peerIsolation and layer rules share one resolver.
 */
import fs from 'node:fs';
import path from 'node:path';
import { layerForFile } from '../ark-layer-match.mjs';

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

/**
 * Resolve an import specifier to a repo-relative path.
 * Relative + tsconfig-aliased only; bare packages → undefined.
 */
export function resolveSpecifierToRel(specifier, fromFilePath, root, tsAliases) {
  let abs;
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!fromFilePath) return undefined;
    const fromAbs = path.isAbsolute(fromFilePath)
      ? fromFilePath
      : path.resolve(root, fromFilePath);
    abs = path.resolve(path.dirname(fromAbs), specifier);
  } else {
    const alias = tsAliases.aliases.find((a) => specifier.startsWith(a.from));
    if (!alias) return undefined;
    abs = path.resolve(tsAliases.baseUrl, `${alias.to}${specifier.slice(alias.from.length)}`);
  }
  const rel = path.relative(root, abs).split(path.sep).join('/');
  return rel.startsWith('..') ? undefined : rel;
}

function filePathToRel(filePath, root) {
  if (!filePath || typeof filePath !== 'string') return undefined;
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  return rel.startsWith('..') ? undefined : rel;
}

function classifyProbe(root, rel, layers) {
  let probe = rel;
  try {
    if (fs.statSync(path.join(root, rel)).isDirectory()) probe = `${rel}/index.ts`;
  } catch {
    /* not on disk */
  }
  return (
    layerForFile(root, probe, layers) || layerForFile(root, `${rel}/index.ts`, layers)
  );
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
      return { relPath, layer: classifyProbe(root, relPath, layers) };
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
      return { relPath: rel, layer: classifyProbe(root, rel, layers) };
    }

    // Try as import alias / bare package first
    const asImport = resolveSpecifierToRel(
      specifierOrFilePath,
      fromFilePath,
      root,
      tsAliases
    );
    if (asImport) {
      return { relPath: asImport, layer: classifyProbe(root, asImport, layers) };
    }

    // Repo-relative source file path (not an import specifier)
    const asFile = filePathToRel(specifierOrFilePath, root);
    if (asFile) {
      return { relPath: asFile, layer: classifyProbe(root, asFile, layers) };
    }

    return undefined;
  };
}

