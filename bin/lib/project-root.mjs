/**
 * Effective project root for ark-check / doctor.
 *
 * Monorepo honesty (NEW-MONOREPO-CWD-WALKUP): when cwd (or --root) has no
 * ark.config.json, walk parent directories until one is found. Never invent a
 * silent 11-layer / empty ADAPT world while a parent monorepo contract exists.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Walk parents from startDir looking for configName (default ark.config.json).
 * Stops at filesystem root.
 *
 * @param {string} startDir
 * @param {string} [configName='ark.config.json']
 * @returns {{ root: string, configPath: string, walkedUp: boolean } | null}
 */
export function findNearestArkConfig(startDir, configName = 'ark.config.json') {
  if (typeof configName === 'string' && path.isAbsolute(configName)) {
    if (fs.existsSync(configName)) {
      const root = path.dirname(configName);
      const start = path.resolve(startDir || process.cwd());
      return { root, configPath: configName, walkedUp: path.resolve(root) !== start };
    }
    return null;
  }

  let dir = path.resolve(startDir || process.cwd());
  const start = dir;
  const name = configName || 'ark.config.json';
  for (;;) {
    const candidate = path.join(dir, name);
    try {
      if (fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
        return {
          root: dir,
          configPath: candidate,
          walkedUp: dir !== start,
        };
      }
    } catch {
      // unreadable — keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Resolve the effective project root for CLI invocation.
 *
 * - If config exists at startRoot → use startRoot.
 * - Else walk parents for config and adopt that directory as root.
 * - If nothing found → keep startRoot (true greenfield; caller may use defaults).
 *
 * @param {string} startRoot
 * @param {{ configName?: string }} [opts]
 * @returns {{
 *   root: string,
 *   config: string,
 *   configPath: string,
 *   configRoot: string,
 *   walkedUp: boolean,
 *   configFound: boolean,
 * }}
 */
export function resolveEffectiveProjectRoot(startRoot, opts = {}) {
  const configName = opts.configName || 'ark.config.json';
  const start = path.resolve(startRoot || process.cwd());

  if (typeof configName === 'string' && path.isAbsolute(configName)) {
    const found = findNearestArkConfig(start, configName);
    if (found) {
      return {
        root: found.root,
        config: configName,
        configPath: found.configPath,
        configRoot: found.root,
        walkedUp: found.walkedUp,
        configFound: true,
      };
    }
    return {
      root: start,
      config: configName,
      configPath: configName,
      configRoot: start,
      walkedUp: false,
      configFound: false,
    };
  }

  const localPath = path.join(start, configName);
  try {
    if (fs.statSync(localPath, { throwIfNoEntry: false })?.isFile()) {
      return {
        root: start,
        config: configName,
        configPath: localPath,
        configRoot: start,
        walkedUp: false,
        configFound: true,
      };
    }
  } catch {
    // fall through to walk-up
  }

  const found = findNearestArkConfig(start, configName);
  if (found) {
    return {
      root: found.root,
      config: configName,
      configPath: found.configPath,
      configRoot: found.root,
      walkedUp: true,
      configFound: true,
    };
  }

  return {
    root: start,
    config: configName,
    configPath: localPath,
    configRoot: start,
    walkedUp: false,
    configFound: false,
  };
}
