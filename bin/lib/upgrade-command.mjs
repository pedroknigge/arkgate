/** Read-only-first `ark upgrade` orchestration. Managed identity logic lives separately. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { arkCommand } from '../ark-shared.mjs';
import { describePackageVersionDualTruth } from './field-install.mjs';
import { __packageRoot } from './gate-files.mjs';
import {
  applyManagedUpgrade,
  managedUpgradeJson,
  planManagedUpgrade,
  renderManagedUpgrade,
} from './managed-upgrade.mjs';

function installedCli(root) {
  const requireFromProject = createRequire(path.join(root, 'package.json'));
  const packageJson = requireFromProject.resolve('arkgate/package.json');
  return path.join(path.dirname(packageJson), 'bin', 'ark.mjs');
}

/**
 * Resolve the project's installed arkgate package.json.
 * Shallow `node_modules/arkgate` first, then Node module resolution (hoisted monorepos).
 * @returns {string|null} absolute path to package.json, or null when not installed for this root
 */
export function resolveProjectArkgatePackageJson(root) {
  const resolvedRoot = path.resolve(root);
  const shallow = path.join(resolvedRoot, 'node_modules', 'arkgate', 'package.json');
  if (fs.existsSync(shallow)) return shallow;
  try {
    const requireFromProject = createRequire(path.join(resolvedRoot, 'package.json'));
    return requireFromProject.resolve('arkgate/package.json');
  } catch {
    return null;
  }
}

/**
 * Compare numeric major.minor.patch cores (prerelease / build ignored).
 * @returns {-1|0|1}
 */
export function compareSemverCore(a, b) {
  const parse = (value) => {
    const core = String(value ?? '')
      .trim()
      .replace(/^v/i, '')
      .split(/[-+]/)[0];
    const parts = core.split('.').map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}

/** True when candidate is the same path as root or a descendant (after resolve). */
export function isPathInside(candidate, root) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  if (resolvedCandidate === resolvedRoot) return true;
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function tryRealpath(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

const RECOVERY_USE_LOCAL =
  'Use: npx arkgate upgrade …   or   node node_modules/arkgate/bin/ark.mjs upgrade …';

/**
 * @param {{
 *   cliVersion: string|null,
 *   projectVersion: string|null,
 *   cliPackageRoot: string,
 *   kind: 'older' | 'unknown-cli' | 'project-unreadable',
 *   projectPkgPath?: string,
 * }} detail
 */
function staleCliRefuseMessage(detail) {
  const { cliVersion, projectVersion, cliPackageRoot, kind, projectPkgPath } = detail;
  if (kind === 'project-unreadable') {
    const where = projectPkgPath ? ` at ${projectPkgPath}` : '';
    const cliPart = cliVersion
      ? `this CLI (v${cliVersion} at ${cliPackageRoot})`
      : `this CLI (unknown version at ${cliPackageRoot})`;
    return (
      `Refusing ark upgrade: cannot read the project's arkgate version${where}; ${cliPart} is outside the install tree.\n` +
      `Use the project-local binary so managed upgrade can resolve a real install.\n` +
      RECOVERY_USE_LOCAL
    );
  }

  const versionLine =
    kind === 'unknown-cli' || !cliVersion
      ? `Refusing ark upgrade: this CLI (unknown version at ${cliPackageRoot}) is outside the project's arkgate install ` +
        `(v${projectVersion}).`
      : `Refusing ark upgrade: this CLI (v${cliVersion} at ${cliPackageRoot}) is older than the project's arkgate (v${projectVersion}).`;

  // Pre-managed era (before content-identity / plan-digest, ~3.8.0): mutative 2.x wording.
  const preManaged = !cliVersion || compareSemverCore(cliVersion, '3.8.0') < 0;
  const second = preManaged
    ? 'Global/stale arkgate 2.x mutates skills and is unsafe next to 3.8+/4.0 managed upgrade.'
    : 'Older outside-tree CLI must not manage a newer project install; use the project-local binary.';

  return `${versionLine}\n${second}\n${RECOVERY_USE_LOCAL}`;
}

/**
 * Fail-closed when this process is a global/stale arkgate CLI older than the
 * project's installed arkgate. Legacy global 2.x mutates skills; a newer
 * project pin must not be managed by an older outside-tree binary.
 *
 * Allow: no local install; CLI package root inside the project install tree
 * (realpath); running CLI version >= project installed version (including newer globals).
 *
 * @param {string} root project root for --root
 * @param {{
 *   cliVersion?: string|null,
 *   cliPackageRoot?: string|null,
 *   projectPackageJsonPath?: string|null,
 * }} [options]
 * @returns {{ refuse: boolean, reason: string, message?: string, cliVersion?: string|null, projectVersion?: string|null, cliPackageRoot?: string|null, projectPackageRoot?: string|null }}
 */
export function evaluateStaleUpgradeCli(root, options = {}) {
  const projectPkgPath =
    options.projectPackageJsonPath ?? resolveProjectArkgatePackageJson(root);
  if (!projectPkgPath || !fs.existsSync(projectPkgPath)) {
    return { refuse: false, reason: 'no-local-arkgate' };
  }

  const cliPackageRoot = tryRealpath(options.cliPackageRoot ?? __packageRoot);
  const projectPackageRoot = tryRealpath(path.dirname(projectPkgPath));

  // Project-local CLI (node_modules/arkgate or same realpath via pnpm link) is always trusted.
  if (isPathInside(cliPackageRoot, projectPackageRoot)) {
    let projectVersion = null;
    try {
      const pkg = JSON.parse(fs.readFileSync(projectPkgPath, 'utf8'));
      projectVersion = typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
      /* local path still trusted */
    }
    return {
      refuse: false,
      reason: 'project-local-cli',
      cliVersion: options.cliVersion ?? null,
      projectVersion,
      cliPackageRoot,
      projectPackageRoot,
    };
  }

  // Outside tree: need a readable project version to compare; fail closed if we cannot prove safety.
  let projectVersion = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(projectPkgPath, 'utf8'));
    projectVersion = typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return {
      refuse: true,
      reason: 'project-unreadable',
      message: staleCliRefuseMessage({
        cliVersion: typeof options.cliVersion === 'string' ? options.cliVersion : null,
        projectVersion: null,
        cliPackageRoot,
        kind: 'project-unreadable',
        projectPkgPath,
      }),
      cliVersion: typeof options.cliVersion === 'string' ? options.cliVersion : null,
      projectVersion: null,
      cliPackageRoot,
      projectPackageRoot,
    };
  }
  if (!projectVersion) {
    return {
      refuse: true,
      reason: 'project-version-missing',
      message: staleCliRefuseMessage({
        cliVersion: typeof options.cliVersion === 'string' ? options.cliVersion : null,
        projectVersion: null,
        cliPackageRoot,
        kind: 'project-unreadable',
        projectPkgPath,
      }),
      cliVersion: typeof options.cliVersion === 'string' ? options.cliVersion : null,
      projectVersion: null,
      cliPackageRoot,
      projectPackageRoot,
    };
  }

  const cliVersion =
    typeof options.cliVersion === 'string' && options.cliVersion
      ? options.cliVersion
      : null;
  if (!cliVersion) {
    return {
      refuse: true,
      reason: 'outside-tree-unknown-version',
      message: staleCliRefuseMessage({
        cliVersion: null,
        projectVersion,
        cliPackageRoot,
        kind: 'unknown-cli',
      }),
      cliVersion,
      projectVersion,
      cliPackageRoot,
      projectPackageRoot,
    };
  }

  if (compareSemverCore(cliVersion, projectVersion) < 0) {
    return {
      refuse: true,
      reason: 'stale-outside-cli',
      message: staleCliRefuseMessage({
        cliVersion,
        projectVersion,
        cliPackageRoot,
        kind: 'older',
      }),
      cliVersion,
      projectVersion,
      cliPackageRoot,
      projectPackageRoot,
    };
  }

  return {
    refuse: false,
    reason: 'outside-cli-ok',
    cliVersion,
    projectVersion,
    cliPackageRoot,
    projectPackageRoot,
  };
}

function previewArgs(args) {
  const next = ['upgrade', '--root', args.root, '--no-install'];
  if (args.tools) next.push('--tools', args.tools);
  if (args.acceptConflicts) next.push('--accept-conflicts');
  if (!args.strict) next.push('--no-strict');
  if (args.json) next.push('--json');
  return next;
}

function quote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@=-]+$/.test(text) ? text : `'${text.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Project-local nextCommand (never bare PATH `ark`) so paste-from-preview cannot re-hit global 2.x.
 * Uses package-manager-aware runner (`npx` / `pnpm exec` / `yarn`) + `arkgate` bin name.
 * @param {{ root: string, install?: boolean, tools?: string, acceptConflicts?: boolean, strict?: boolean, json?: boolean }} args
 * @param {string|null|undefined} planDigest
 */
export function buildUpgradeNextCommand(args, planDigest) {
  const flagParts = ['upgrade', '--apply', '--root', args.root];
  if (!args.install) flagParts.push('--no-install');
  if (!args.install && planDigest) flagParts.push('--plan-digest', planDigest);
  if (args.tools) flagParts.push('--tools', args.tools);
  if (args.acceptConflicts) flagParts.push('--accept-conflicts');
  if (!args.strict) flagParts.push('--no-strict');
  if (args.json) flagParts.push('--json');
  const argsStr = flagParts.map(quote).join(' ');
  return arkCommand(args.root, 'arkgate', argsStr);
}

function verify(root, json, arkCheck, runArkCheck) {
  const args = ['--root', root, '--config', 'ark.config.json', '--strict-merge'];
  if (!json) return { exitCode: runArkCheck(args, { cwd: root }) };
  const result = spawnSync(process.execPath, [arkCheck, ...args, '--json'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return { exitCode: result.status ?? 1, stderr: result.stderr?.trim() || undefined };
}

export function runUpgradeCommand(args, dependencies) {
  const root = args.root;
  // Fail closed before install/plan when PATH resolves a global/stale CLI older
  // than the project's installed arkgate (field footgun: Homebrew 2.x next to 3.8+/4.0).
  const staleGuard =
    typeof dependencies?.evaluateStaleUpgradeCli === 'function'
      ? dependencies.evaluateStaleUpgradeCli(root, {
          cliVersion: dependencies.cliVersion,
          cliPackageRoot: dependencies.cliPackageRoot,
        })
      : evaluateStaleUpgradeCli(root, {
          cliVersion: dependencies?.cliVersion,
          cliPackageRoot: dependencies?.cliPackageRoot,
        });
  if (staleGuard?.refuse) {
    console.error(staleGuard.message || 'Refusing ark upgrade: stale CLI.');
    return 2;
  }

  if (args.apply && args.install) {
    const skip =
      typeof dependencies.shouldSkipArkgateInstall === 'function'
        ? dependencies.shouldSkipArkgateInstall(root, dependencies.cliVersion)
        : { skip: false };
    if (skip.skip) {
      if (!args.json) {
        console.log(
          `Package already at arkgate@${skip.installedVersion}; skipping install and recomputing managed preview.`
        );
      }
    } else {
      const [command, commandArgs] = dependencies.packageInstallArgv(root);
      if (!args.json) console.log(`Updating ArkGate: ${command} ${commandArgs.join(' ')}`);
      const install = spawnSync(command, commandArgs, {
        cwd: root,
        stdio: args.json ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        encoding: 'utf8',
      });
      const exitCode = install.status ?? 1;
      if (exitCode !== 0) {
        if (args.json && install.stderr) console.error(install.stderr.trim());
        const recovery = `${command} ${commandArgs.join(' ')}`;
        const rePreview = arkCommand(
          root,
          'arkgate',
          [
            'upgrade',
            '--no-install',
            '--root',
            quote(root),
            ...(args.tools ? ['--tools', args.tools] : []),
            ...(!args.strict ? ['--no-strict'] : []),
            ...(args.json ? ['--json'] : []),
          ].join(' ')
        );
        console.error(
          `Package update failed (exit ${exitCode}). Fix the install and re-run:\n` +
            `  ${recovery}\n` +
            `Then: ${rePreview}`
        );
        return exitCode;
      }
    }
    // Re-enter via installed CLI so the managed plan uses the newly installed package bytes.
    let cli;
    try {
      cli = installedCli(root);
    } catch {
      console.error(
        'arkgate is not installed in this project after the package step. Install it, then re-run with --no-install.'
      );
      return 1;
    }
    return spawnSync(process.execPath, [cli, ...previewArgs(args)], {
      cwd: root,
      stdio: 'inherit',
      encoding: 'utf8',
    }).status ?? 1;
  }

  const plan = planManagedUpgrade(root, {
    tools: args.tools,
    acceptConflicts: args.acceptConflicts,
  });
  if (!args.apply) {
    const wouldWrite = plan.summary?.wouldWrite ?? 0;
    const blocked = plan.summary?.blocked ?? 0;
    const needsApply = wouldWrite > 0 || blocked > 0;
    const command = buildUpgradeNextCommand(args, plan.planDigest);
    if (args.json) {
      // Always expose nextCommand for digest-bound apply (metadata/manifest optional);
      // nothingToApply flags when content writes are zero so UIs do not urge apply.
      console.log(
        managedUpgradeJson(plan, {
          nextCommand: command,
          ...(needsApply ? {} : { nothingToApply: true }),
          // Surface dual-truth when managed assets refresh without a package pin bump.
          ...(args.install === false
            ? {
                packageInstallSkipped: true,
                note: 'Managed assets use this CLI; package.json arkgate pin is unchanged under --no-install. Bump the pin or re-run without --no-install so CI resolves the same version.',
              }
            : {}),
        })
      );
    } else {
      const metadataRefresh = plan.summary?.metadataRefresh ?? 0;
      renderManagedUpgrade(plan, {
        next: needsApply
          ? args.install
            ? `Update the package and recompute this preview with: ${command}`
            : `Apply the exact preview with: ${command}`
          : undefined,
        // Human path: optional digest-bound stamp refresh without urging content apply.
        ...( !needsApply && metadataRefresh > 0 ? { optionalStampApply: command } : {}),
      });
      if (args.install === false) {
        console.log(
          'Note: --no-install left package.json arkgate pin unchanged. Managed assets match this CLI; bump the pin (or re-run without --no-install) so CI resolves the same version.'
        );
      }
    }
    return 0;
  }

  let applied;
  try {
    applied = applyManagedUpgrade(root, plan, args.planDigest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return 2;
  }
  if (applied.blocked) {
    if (args.json) console.log(JSON.stringify(applied, null, 2));
    else renderManagedUpgrade(applied, {
      next: 'Preview again with --accept-conflicts, then use that preview\'s exact next command.',
    });
    return 1;
  }
  if (applied.nothingToApply && !applied.applied) {
    if (args.json) console.log(JSON.stringify(applied, null, 2));
    else {
      renderManagedUpgrade(applied);
      console.log('No managed content writes pending (optional stamp refresh needs --plan-digest).');
    }
    return 0;
  }
  const verification = args.strict
    ? { mode: 'strict-merge', ...verify(root, args.json, dependencies.arkCheck, dependencies.runArkCheck) }
    : { mode: 'skipped', exitCode: 0 };
  const dualTruth = describePackageVersionDualTruth(root);
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ...applied,
          verification,
          ...(args.install === false || dualTruth.dualTruth
            ? {
                packageInstallSkipped: args.install === false,
                packageVersionTruth: dualTruth,
                ...(dualTruth.dualTruth
                  ? {
                      note: dualTruth.note,
                    }
                  : args.install === false
                    ? {
                        note: 'Managed assets use this CLI; package.json arkgate pin is unchanged under --no-install. Bump the pin or re-run without --no-install so CI resolves the same version.',
                      }
                    : {}),
              }
            : {}),
        },
        null,
        2
      )
    );
  } else {
    renderManagedUpgrade(applied);
    if (!args.strict) console.log('Architecture verification skipped (--no-strict).');
    if (args.install === false || dualTruth.dualTruth) {
      console.log(
        dualTruth.dualTruth
          ? dualTruth.note
          : 'Note: --no-install left package.json arkgate pin unchanged. Managed assets match this CLI; bump the pin (or re-run without --no-install) so CI resolves the same version.'
      );
    }
  }
  return verification.exitCode;
}
