/**
 * Effective project root for ark-check / doctor.
 *
 * Monorepo honesty (NEW-MONOREPO-CWD-WALKUP): when cwd (or --root) has no
 * ark.config.json, walk parent directories until one is found. Never invent a
 * silent 11-layer / empty ADAPT world while a parent monorepo contract exists.
 *
 * Security (S0 walk-up review):
 * - Split **config discovery root** from **write root**.
 * - Walk-up is for read/doctor/check by default.
 * - Mutating commands stay on explicit --root/cwd unless --follow-config-root.
 * - Walk is bounded by git root, workspaces package root, and max depth.
 * - Config write paths must stay under the write root (no --config ../outside).
 */
import fs from 'node:fs';
import path from 'node:path';

/** Safety cap so a pathological tree cannot walk forever. */
export const MAX_CONFIG_WALK_DEPTH = 32;

/**
 * True when dir looks like a package-manager workspaces / monorepo root.
 * Used as an upper bound for walk-up (config at this root is accepted; parents are not).
 * @param {string} dir
 */
export function isWorkspacesPackageRoot(dir) {
  const pkgPath = path.join(dir, 'package.json');
  try {
    if (!fs.statSync(pkgPath, { throwIfNoEntry: false })?.isFile()) {
      // still check workspace marker files below
    } else {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (
        pkg &&
        (Array.isArray(pkg.workspaces) ||
          (pkg.workspaces && typeof pkg.workspaces === 'object'))
      ) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  for (const marker of ['pnpm-workspace.yaml', 'lerna.json', 'rush.json', 'nx.json']) {
    try {
      if (fs.statSync(path.join(dir, marker), { throwIfNoEntry: false })?.isFile()) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * True when dir is a git worktree root (.git file or directory).
 * @param {string} dir
 */
export function isGitRoot(dir) {
  try {
    const git = path.join(dir, '.git');
    const st = fs.statSync(git, { throwIfNoEntry: false });
    return Boolean(st && (st.isDirectory() || st.isFile()));
  } catch {
    return false;
  }
}

/**
 * Resolve config path and require it is under projectRoot (or equal).
 * Used by mutative paths (migrate-contract --write, init --force, etc.).
 *
 * @param {string} projectRoot
 * @param {string} configPathOrName absolute path or relative name
 * @returns {{ ok: true, configPath: string } | { ok: false, error: string, configPath: string }}
 */
export function resolveConfigPathWithinRoot(projectRoot, configPathOrName) {
  const root = path.resolve(projectRoot || process.cwd());
  const raw = configPathOrName || 'ark.config.json';
  const configPath = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw);
  const rel = path.relative(root, configPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return {
      ok: false,
      configPath,
      error: `Refusing config path outside project root: ${configPath} (root ${root}). Pass a path under --root, or only use --follow-config-root when intentional monorepo writes are required.`,
    };
  }
  return { ok: true, configPath };
}

/**
 * Walk parents from startDir looking for configName (default ark.config.json).
 * Bounds: filesystem root, max depth, git root, workspaces package root.
 * Config found at a bound root is accepted; walking above a bound is refused.
 *
 * @param {string} startDir
 * @param {string} [configName='ark.config.json']
 * @param {{ maxDepth?: number, boundAtGitRoot?: boolean, boundAtWorkspacesRoot?: boolean }} [opts]
 * @returns {{ root: string, configPath: string, walkedUp: boolean } | null}
 */
export function findNearestArkConfig(startDir, configName = 'ark.config.json', opts = {}) {
  const maxDepth = Number.isFinite(opts.maxDepth) ? opts.maxDepth : MAX_CONFIG_WALK_DEPTH;
  const boundAtGit = opts.boundAtGitRoot !== false;
  const boundAtWorkspaces = opts.boundAtWorkspacesRoot !== false;

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
  let depth = 0;
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
    depth += 1;
    if (depth > maxDepth) return null;

    // Do not walk above git / workspaces roots (config at this dir already checked).
    if (boundAtGit && isGitRoot(dir)) return null;
    if (boundAtWorkspaces && isWorkspacesPackageRoot(dir)) return null;

    dir = parent;
  }
}

/**
 * Resolve config discovery vs write roots for CLI invocation.
 *
 * - If config exists at startRoot → use startRoot for both.
 * - Else walk parents for config (bounded) → configRoot may differ from writeRoot.
 * - writeMode without followConfigRoot: keep writeRoot/start as `root` (do not rewrite parent).
 * - writeMode + followConfigRoot (or read mode): adopt walked config root as `root`.
 *
 * @param {string} startRoot
 * @param {{
 *   configName?: string,
 *   writeMode?: boolean,
 *   followConfigRoot?: boolean,
 *   maxDepth?: number,
 * }} [opts]
 * @returns {{
 *   root: string,
 *   writeRoot: string,
 *   config: string,
 *   configPath: string,
 *   configRoot: string,
 *   walkedUp: boolean,
 *   configFound: boolean,
 *   writeRootFollowedConfig: boolean,
 * }}
 */
export function resolveEffectiveProjectRoot(startRoot, opts = {}) {
  const configName = opts.configName || 'ark.config.json';
  const start = path.resolve(startRoot || process.cwd());
  const writeMode = opts.writeMode === true;
  const followConfigRoot = opts.followConfigRoot === true;
  // Writes adopt walked config root only with explicit opt-in.
  const adoptWalkedRoot = !writeMode || followConfigRoot;

  if (typeof configName === 'string' && path.isAbsolute(configName)) {
    const found = findNearestArkConfig(start, configName, opts);
    if (found) {
      const root = adoptWalkedRoot ? found.root : start;
      return {
        root,
        writeRoot: start,
        config: configName,
        configPath: found.configPath,
        configRoot: found.root,
        walkedUp: found.walkedUp,
        configFound: true,
        writeRootFollowedConfig: adoptWalkedRoot && found.walkedUp,
      };
    }
    return {
      root: start,
      writeRoot: start,
      config: configName,
      configPath: configName,
      configRoot: start,
      walkedUp: false,
      configFound: false,
      writeRootFollowedConfig: false,
    };
  }

  const localPath = path.join(start, configName);
  try {
    if (fs.statSync(localPath, { throwIfNoEntry: false })?.isFile()) {
      return {
        root: start,
        writeRoot: start,
        config: configName,
        configPath: localPath,
        configRoot: start,
        walkedUp: false,
        configFound: true,
        writeRootFollowedConfig: false,
      };
    }
  } catch {
    // fall through to walk-up
  }

  const found = findNearestArkConfig(start, configName, opts);
  if (found) {
    const root = adoptWalkedRoot ? found.root : start;
    return {
      root,
      writeRoot: start,
      config: configName,
      configPath: found.configPath,
      configRoot: found.root,
      walkedUp: true,
      configFound: true,
      writeRootFollowedConfig: adoptWalkedRoot && found.walkedUp,
    };
  }

  return {
    root: start,
    writeRoot: start,
    config: configName,
    configPath: localPath,
    configRoot: start,
    walkedUp: false,
    configFound: false,
    writeRootFollowedConfig: false,
  };
}

/**
 * Commands that mutate project files under --root.
 * Walk-up must not rewrite a parent monorepo unless --follow-config-root.
 * @param {Record<string, unknown>} args
 */
export function isMutatingCliCommand(args = {}) {
  if (args.installAgentGates) return true;
  if (args.init) return true;
  if (args.applyPolicyPack) return true;
  if (args.migrateContract && args.write) return true;
  if (args.adoptContract && args.write) return true;
  if (args.updateBaseline) return true;
  if (args.ratchetCores) return true;
  if (args.migrateCommands) return true;
  if (args.suggestInclude && args.write) return true;
  return false;
}
