/**
 * Setup-time arkgate pin shared by `ark start` and `ark init` (kept out of bin/ark.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { packageInstallArgv } from '../ark-shared.mjs';
import { pinArkgateDevDependency } from './field-install.mjs';
import {
  formatStartPackageInstallFailure,
  runStartPackageInstall,
} from './start-install-recovery.mjs';

/**
 * Pin arkgate in package.json (and optionally run the package manager).
 * start calls this so CI/`npx` is not forced to rely on a stale global install.
 *
 * @param {string} root
 * @param {{ install?: boolean, runPackageManager?: boolean }} [opts]
 */
export function ensureProjectArkgateDependency(root, opts = {}) {
  const install = opts.install !== false;
  const runPm = opts.runPackageManager === true;
  if (!install) {
    return { pinned: { changed: false, reason: 'skipped-no-install' }, installStatus: null };
  }
  const pinned = pinArkgateDevDependency(root);
  let installStatus = null;
  let hostOutput = '';
  // Only run the package manager after a successful pin change — avoid surprise
  // network on every start when arkgate is already listed.
  if (runPm && pinned.changed) {
    const [command, commandArgs] = packageInstallArgv(root, pinned.version);
    const install = runStartPackageInstall(command, commandArgs, root);
    installStatus = install.status;
    hostOutput = `${install.stdout}\n${install.stderr}`;
  }
  return { pinned, installStatus, hostOutput };
}

/**
 * Setup-time pin shared by `ark start` and `ark init`: generated CI and host hooks call the
 * local `ark-check` / `arkgate-mcp` bins through the project runner, which only resolves to
 * this package when package.json declares it (otherwise npx 404s or picks a stale global).
 */
export function pinArkgateForSetup(root, args, cliVersion) {
  if (!args.install) {
    console.log('  Skipping arkgate package pin (--no-install).');
    return;
  }
  if (!fs.existsSync(path.join(root, 'package.json'))) {
    console.log(
      `  Warning: no package.json — the generated CI workflow and host hooks run local arkgate bins and will not resolve (npx 404s or picks a stale global). Create package.json and add arkgate@^${cliVersion()} to devDependencies, then re-run setup.`
    );
    return;
  }
  const { pinned, installStatus, hostOutput } = ensureProjectArkgateDependency(root, {
    install: true,
    runPackageManager: !args.skipPackageManager,
  });
  if (pinned.changed) {
    console.log(`  Pinned arkgate@${pinned.version} in package.json devDependencies.`);
    if (installStatus !== null && installStatus !== 0) {
      const [command, commandArgs] = packageInstallArgv(root, pinned.version);
      console.error(
        formatStartPackageInstallFailure({
          exitStatus: installStatus,
          installCommand: `${command} ${commandArgs.join(' ')}`,
          hostOutput,
          packageVersion: cliVersion(),
        })
      );
    }
  } else if (pinned.reason === 'already-present') {
    console.log(`  arkgate already in package.json (${pinned.version}).`);
  }
}
