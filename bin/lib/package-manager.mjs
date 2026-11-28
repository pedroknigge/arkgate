/**
 * Package-manager detection and emitted install/run command shapes.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The three package managers Ark emits commands for. */
const LOCKFILES = { pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', npm: 'package-lock.json', bun: 'bun.lock' };
/** Bun can ship either textual `bun.lock` (1.2+) or binary `bun.lockb`. */
const BUN_LOCKFILES = ['bun.lock', 'bun.lockb'];

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
  return name === 'pnpm' || name === 'yarn' || name === 'npm' || name === 'bun' ? name : undefined;
}

/**
 * Bun is detected but not driven: `bun install` never runs from start (#415 — npm in a
 * bun workspace dies on EUNSUPPORTEDPROTOCOL `catalog:`). A bun repo must not pass as
 * npm: bun.lock / bun.lockb anywhere in the root, or a `packageManager` / devEngines
 * declaration naming bun. Returns 'bun' | null.
 */
export function detectBunPackageManager(root) {
  if (declaredPackageManager(root) === 'bun') return 'bun';
  if (BUN_LOCKFILES.some((file) => fs.existsSync(path.join(root, file)))) return 'bun';
  return null;
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
  // A binary bun.lockb alone never shows up in LOCKFILES above; only claim bun when no
  // pnpm/yarn/npm lockfile also claims the root (existing tie logic keeps npm's win).
  if (BUN_LOCKFILES.some((file) => fs.existsSync(path.join(root, file)))) {
    if (presentLockfiles(root).length === 0) return 'bun';
  }
  const locks = presentLockfiles(root);
  if (locks.length <= 1) return locks[0] ?? 'npm';
  if (locks.includes('npm')) return 'npm';
  return locks[0]; // pnpm over yarn when only those two collide
}

// pnpm 10+ `pnpm exec` runs a deps-status pre-check that fails with ERR_PNPM_IGNORED_BUILDS
// when the repo has un-approved native build scripts (sharp, esbuild, tailwind oxide, …) —
// the common state of real pnpm apps. Skip that gate so Ark's emitted commands still run.
const PNPM_EXEC = 'pnpm --config.verify-deps-before-run=false exec';
const RUNNER_BY_PM = { pnpm: PNPM_EXEC, yarn: 'yarn', npm: 'npx', bun: 'bunx' };

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
  if (!arkgateIsProjectDependency(root)) return pinnedArkgateRunner();
  return RUNNER_BY_PM[detectPackageManager(root)];
}

/** The exact arkgate version that ships this CLI (the package.json next to bin/). */
function shippedArkgateVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * True when the project resolves arkgate locally: a `dependencies` / `devDependencies` entry,
 * an installed node_modules/arkgate, or the arkgate package itself (self-host). Only then
 * does a bare `npx ark-check` / `pnpm exec` / `yarn` runner reach this package's bins.
 */
export function arkgateIsProjectDependency(root) {
  // An installed copy (node_modules/arkgate) also resolves the local runner.
  if (fs.existsSync(path.join(root, 'node_modules', 'arkgate', 'package.json'))) return true;
  const pkg = readPackageJson(root);
  if (!pkg || typeof pkg !== 'object') return false;
  if (pkg.name === 'arkgate') return true;
  return [pkg.dependencies, pkg.devDependencies].some(
    (deps) => deps && typeof deps === 'object' && typeof deps.arkgate === 'string'
  );
}

/** `arkgate@<exact shipped version>` — the package an unpinned project runs through npx. */
function pinnedArkgateSpec(version = shippedArkgateVersion()) {
  return version ? `arkgate@${version}` : 'arkgate';
}

/**
 * Runner for a project that does not pin arkgate. Bare `npx ark-check` asks npm for a
 * package named `ark-check` (404) or runs a stale global copy; `-p arkgate@<exact>` names the
 * package that owns the bin, and `-y` keeps CI and host hooks from blocking on a prompt.
 */
export function pinnedArkgateRunner(version) {
  return `npx -y -p ${pinnedArkgateSpec(version)}`;
}

/**
 * Honest fail-closed signal for the fall-through case (#395): a fresh worktree without
 * `node_modules/arkgate` lets `<runner> arkgate-mcp` answer from a stale global whose
 * version does not satisfy the project's pin. A gate running the wrong version is not
 * containing anything — the hook refuses loudly instead of denying with schema noise.
 *
 * Deliberately narrow: when the local install EXISTS, the project runner resolves it and
 * a direct invocation of another binary is deliberate (test harness, self-host dev) — the
 * running version is not evidence of a fall-through, so no deny. Returns the warning
 * message, or null when there is nothing to compare.
 */
export function staleGlobalArkgateWarning(root) {
  const running = shippedArkgateVersion();
  if (!running) return null;
  if (fs.existsSync(path.join(root, 'node_modules', 'arkgate', 'package.json'))) return null;
  const pkg = readPackageJson(root);
  const declaredRaw =
    typeof pkg?.dependencies?.arkgate === 'string'
      ? pkg.dependencies.arkgate
      : typeof pkg?.devDependencies?.arkgate === 'string'
        ? pkg.devDependencies.arkgate
        : null;
  if (!declaredRaw) return null;
  const declared = declaredRaw.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
  if (!declared) return null; // file:/link:/workspace:/dist-tag — not numerically comparable
  if (arkgateSpecSatisfiesRange(declaredRaw, running)) return null;
  return [
    `Ark architecture gate denied fail-closed: the running arkgate-mcp is ${running}, but this project pins ${declaredRaw} and has no local install in this worktree.`,
    'A gate running the wrong version is not containing anything — it denies with schema noise instead of enforcing this repo\'s contract.',
    `Fix: install the project's arkgate (the package manager's install command in this worktree), then retry the same write.`,
    '[WRITE_GATE_STALE_GLOBAL]',
  ].join('\n');
}

/** `^X.Y.Z` / `~X.Y.Z` / exact — enough for pin-shaped specs; anything else fails closed. */
function arkgateSpecSatisfiesRange(spec, version) {
  const declared = spec.match(/(\d+)\.(\d+)\.(\d+)/);
  const running = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!declared || !running) return false;
  const d = declared.slice(1).map(Number);
  const r = running.slice(1).map(Number);
  if (spec.startsWith('^')) {
    return d[0] === r[0] && cmp(r, d) >= 0;
  }
  if (spec.startsWith('~')) {
    return d[0] === r[0] && d[1] === r[1] && cmp(r, d) >= 0;
  }
  return cmp(r, d) === 0;
}

function cmp(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

/**
 * Number of npx arguments before the bin: 0 for `npx <bin>`, more for the pinned form
 * (`npx -y -p arkgate@x <bin>`, `--yes`, `--package arkgate@x`, `--package=arkgate@x`).
 */
export function npxArkgatePrefixLength(args) {
  if (!Array.isArray(args)) return 0;
  let index = 0;
  if (args[index] === '-y' || args[index] === '--yes') index += 1;
  const flag = args[index];
  if ((flag === '-p' || flag === '--package') && /^arkgate(?:@\S+)?$/.test(args[index + 1] ?? '')) {
    return index + 2;
  }
  if (typeof flag === 'string' && /^--package=arkgate(?:@\S+)?$/.test(flag)) return index + 1;
  return 0;
}

/** Full runnable command string for an installed Ark binary, package-manager aware. */
export function arkCommand(root, bin, argsStr = '') {
  return `${execRunner(root)} ${bin}${argsStr ? ` ${argsStr}` : ''}`;
}

/**
 * Run an Ark binary from package `arkgate` when local bins may be missing.
 * Bare `npx arkgate-check` 404s — npx treats that bin name as its own package.
 * Pass `packageSpec` (e.g. `arkgate@4.8.19`) when Age blocked a local add.
 */
export function arkPackageRecoveryCommand(bin, argsStr = '', packageSpec) {
  const spec =
    typeof packageSpec === 'string' && packageSpec.trim() ? packageSpec.trim() : 'arkgate';
  return `npx --package=${spec} ${bin}${argsStr ? ` ${argsStr}` : ''}`;
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
  if (runner === 'bunx') return { command: 'bunx', args: [bin, ...binArgs] };
  // Pinned form (`npx -y -p arkgate@x`) keeps its prefix as real argv entries.
  return { command: 'npx', args: [...runner.split(' ').slice(1), bin, ...binArgs] };
}

/**
 * Globs under `packages:` in pnpm-workspace.yaml.
 * `null` when the file is missing or has no `packages:` key (settings only:
 * allowBuilds, catalog, minimumReleaseAge). `[]` when the key is present and
 * lists nothing. A settings-only file is not a workspace (#376).
 */
export function readPnpmWorkspacePackageGlobs(root) {
  const file = path.join(root, 'pnpm-workspace.yaml');
  if (!fs.existsSync(file)) return null;
  const globs = [];
  let inPackages = false;
  let sawKey = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):/);
    if (keyMatch) {
      inPackages = keyMatch[1] === 'packages';
      if (inPackages) sawKey = true;
      continue;
    }
    if (!inPackages) continue;
    const item = line.match(/^\s+-\s*['"]?([^'"#]+?)['"]?\s*$/);
    if (item) globs.push(item[1].trim());
  }
  return sawKey ? globs : null;
}

/**
 * True when this directory is a pnpm workspace root (needs `pnpm add -w` for root deps).
 * A `packages:` key is pnpm workspace mode, even when those directories are not
 * on disk yet. A settings-only file is not a workspace. Nested packages under
 * the workspace are not roots.
 */
export function isPnpmWorkspaceRoot(root) {
  return Array.isArray(readPnpmWorkspacePackageGlobs(root));
}

/**
 * True when package.json declares npm/yarn workspaces (yarn classic needs `-W` at root).
 */
function isNpmYarnWorkspaceRoot(root) {
  const pkg = readPackageJson(root);
  if (!pkg) return false;
  const ws = pkg.workspaces;
  return Array.isArray(ws) || (ws && typeof ws === 'object' && Array.isArray(ws.packages));
}

/**
 * Normalize a version/range/spec into an installable package argument for arkgate.
 * Accepts `latest`, `^3.8.2`, `arkgate@latest`, or a full package name.
 */
function normalizeArkgateInstallSpec(versionSpec) {
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
  if (pm === 'bun') {
    // #415: start never DRIVES bun install (EUNSUPPORTEDPROTOCOL on `catalog:` workspaces),
    // but if a bun repo reaches this path the emitted command must still be bun's.
    return ['bun', ['add', '-d', pkgSpec]];
  }
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
  if (pm === 'bun') return `bun add -d ${pkg}`;
  if (pm === 'pnpm') {
    return isPnpmWorkspaceRoot(root) ? `pnpm add -D ${pkg} -w` : `pnpm add -D ${pkg}`;
  }
  if (pm === 'yarn') {
    return isNpmYarnWorkspaceRoot(root) ? `yarn add -D ${pkg} -W` : `yarn add -D ${pkg}`;
  }
  return `npm install -D ${pkg}`;
}
