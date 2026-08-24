/**
 * Package-manager detection and emitted install/run command shapes.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The three package managers Ark emits commands for. */
const LOCKFILES = { pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', npm: 'package-lock.json' };

function readPackageJson(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The Corepack `packageManager` field (and the newer `devEngines.packageManager`) is the
 * project's OWN authoritative statement of its package manager. When present it wins over any
 * lockfile guess. Returns 'pnpm' | 'yarn' | 'npm' | undefined.
 */
function declaredPackageManager(root) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
  const raw =
    (typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : undefined) ??
    (typeof pkg.devEngines?.packageManager?.name === 'string'
      ? pkg.devEngines.packageManager.name
      : undefined);
  const name = raw?.trim().toLowerCase();
  return name === 'pnpm' || name === 'yarn' || name === 'npm' ? name : undefined;
}

/** Lockfiles present in the project root, in { pnpm, yarn, npm } key order. */
export function presentLockfiles(root) {
  return Object.entries(LOCKFILES)
    .filter(([, file]) => fs.existsSync(path.join(root, file)))
    .map(([pm]) => pm);
}

/**
 * Detect the project's package manager: 'pnpm' | 'yarn' | 'npm'.
 *
 * Priority: (1) the `packageManager` / `devEngines` field (the project's own declaration);
 * (2) a single lockfile; (3) on CONFLICT (more than one lockfile and no declaration) prefer
 * npm whenever a package-lock.json is present. Rationale: `npx` runs fine inside a pnpm/yarn
 * repo, but `pnpm exec` / `yarn` in an npm repo BREAKS (frozen-lockfile / no-TTY / a spurious
 * pnpm-lock). So a stray pnpm-lock.yaml left in an npm project must NOT hijack it into pnpm —
 * package-lock.json wins the tie, and the field is the escape hatch for a genuine pnpm repo
 * that still carries a package-lock.json. Falls back to npm when nothing is detectable.
 */
export function detectPackageManager(root) {
  const declared = declaredPackageManager(root);
  if (declared) return declared;
  const locks = presentLockfiles(root);
  if (locks.length <= 1) return locks[0] ?? 'npm';
  if (locks.includes('npm')) return 'npm';
  return locks[0]; // pnpm over yarn when only those two collide
}

// pnpm 10+ `pnpm exec` runs a deps-status pre-check that fails with ERR_PNPM_IGNORED_BUILDS
// when the repo has un-approved native build scripts (sharp, esbuild, tailwind oxide, …) —
// the common state of real pnpm apps. Skip that gate so Ark's emitted commands still run.
const PNPM_EXEC = 'pnpm --config.verify-deps-before-run=false exec';
const RUNNER_BY_PM = { pnpm: PNPM_EXEC, yarn: 'yarn', npm: 'npx' };

/**
 * The command prefix that runs an INSTALLED package binary, matched to the project's
 * package manager. `npx` is used for npm and as the safe fallback.
 *
 * This is the single source of truth that makes every command Ark EMITS — the AGENTS.md
 * contract, .mcp.json, the Claude/Codex hooks, the check:architecture script, the
 * SessionStart summary and every console hint — respect a pnpm-only or yarn repo instead
 * of hardcoding `npx`. (A "pnpm only, never npx" repo treats an emitted `npx` as a policy
 * violation.) `packageManager()` in ark-check.mjs builds the CI-workflow variant on the
 * same detection.
 */
export function execRunner(root) {
  return RUNNER_BY_PM[detectPackageManager(root)];
}

/** Full runnable command string for an installed Ark binary, package-manager aware. */
export function arkCommand(root, bin, argsStr = '') {
  return `${execRunner(root)} ${bin}${argsStr ? ` ${argsStr}` : ''}`;
}

/**
 * Split { command, args } form for JSON/TOML configs (.mcp.json, config.toml) that spawn
 * the binary directly. `pnpm exec ark-mcp` becomes command "pnpm" + args ["exec","ark-mcp",…]
 * so the runner is a real argv[0], not a space-joined string a shell would mis-split.
 */
export function execCommandParts(root, bin, binArgs = []) {
  const runner = execRunner(root);
  if (runner === PNPM_EXEC || runner.startsWith('pnpm ')) {
    return {
      command: 'pnpm',
      args: ['--config.verify-deps-before-run=false', 'exec', bin, ...binArgs],
    };
  }
  if (runner === 'yarn') return { command: 'yarn', args: [bin, ...binArgs] };
  return { command: 'npx', args: [bin, ...binArgs] };
}

/**
 * True when this directory is a pnpm workspace root (needs `pnpm add -w` for root deps).
 * Nested packages under the workspace are not roots.
 */
export function isPnpmWorkspaceRoot(root) {
  return fs.existsSync(path.join(root, 'pnpm-workspace.yaml'));
}

/**
 * True when package.json declares npm/yarn workspaces (yarn classic needs `-W` at root).
 */
export function isNpmYarnWorkspaceRoot(root) {
  const pkg = readPackageJson(root);
  if (!pkg) return false;
  const ws = pkg.workspaces;
  return Array.isArray(ws) || (ws && typeof ws === 'object' && Array.isArray(ws.packages));
}

/**
 * Normalize a version/range/spec into an installable package argument for arkgate.
 * Accepts `latest`, `^3.8.2`, `arkgate@latest`, or a full package name.
 */
export function normalizeArkgateInstallSpec(versionSpec) {
  const raw = typeof versionSpec === 'string' && versionSpec.trim() ? versionSpec.trim() : 'latest';
  if (raw.startsWith('arkgate@') || raw === 'arkgate') return raw === 'arkgate' ? 'arkgate@latest' : raw;
  if (raw.includes('/') || raw.startsWith('file:') || raw.startsWith('link:')) return raw;
  return `arkgate@${raw}`;
}

/**
 * Package-manager argv to add a dev dependency (e.g. arkgate@latest).
 * pnpm workspace roots get `-w`; yarn classic workspaces get `-W`.
 *
 * @param {string} root
 * @param {string} [versionSpec]  package name or name@version (default arkgate@latest)
 * @returns {[string, string[]]}
 */
export function packageInstallArgv(root, versionSpec = 'latest') {
  const pkgSpec = normalizeArkgateInstallSpec(versionSpec);
  const pm = detectPackageManager(root);
  if (pm === 'pnpm') {
    const args = ['add', '-D', pkgSpec];
    if (isPnpmWorkspaceRoot(root)) args.push('-w');
    return ['pnpm', args];
  }
  if (pm === 'yarn') {
    const args = ['add', '-D', pkgSpec];
    if (isNpmYarnWorkspaceRoot(root)) args.push('-W');
    return ['yarn', args];
  }
  return ['npm', ['install', '-D', pkgSpec]];
}

/** Package-manager aware "install a dev dependency" hint (e.g. for a missing typescript). */
export function installDevHint(root, pkg) {
  const pm = detectPackageManager(root);
  if (pm === 'pnpm') {
    return isPnpmWorkspaceRoot(root) ? `pnpm add -D ${pkg} -w` : `pnpm add -D ${pkg}`;
  }
  if (pm === 'yarn') {
    return isNpmYarnWorkspaceRoot(root) ? `yarn add -D ${pkg} -W` : `yarn add -D ${pkg}`;
  }
  return `npm install -D ${pkg}`;
}
