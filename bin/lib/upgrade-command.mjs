/** Read-only-first `ark upgrade` orchestration. Managed identity logic lives separately. */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

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

function nextCommand(args, planDigest) {
  const parts = ['ark', 'upgrade', '--apply', '--root', args.root];
  if (!args.install) parts.push('--no-install');
  if (!args.install && planDigest) parts.push('--plan-digest', planDigest);
  if (args.tools) parts.push('--tools', args.tools);
  if (args.acceptConflicts) parts.push('--accept-conflicts');
  if (!args.strict) parts.push('--no-strict');
  if (args.json) parts.push('--json');
  return parts.map(quote).join(' ');
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
  if (args.apply && args.install) {
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
      console.error(
        `Package update failed (exit ${exitCode}). Fix the install and re-run, or use ` +
          '`ark upgrade --no-install` against the installed version.'
      );
      return exitCode;
    }
    return spawnSync(process.execPath, [installedCli(root), ...previewArgs(args)], {
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
    const command = nextCommand(args, plan.planDigest);
    if (args.json) {
      // Always expose nextCommand for digest-bound apply (metadata/manifest optional);
      // nothingToApply flags when content writes are zero so UIs do not urge apply.
      console.log(
        managedUpgradeJson(plan, {
          nextCommand: command,
          ...(needsApply ? {} : { nothingToApply: true }),
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
    }
    return 0;
  }

  const applied = applyManagedUpgrade(root, plan, args.planDigest);
  if (applied.blocked) {
    if (args.json) console.log(JSON.stringify(applied, null, 2));
    else renderManagedUpgrade(applied, {
      next: 'Preview again with --accept-conflicts, then use that preview\'s exact next command.',
    });
    return 1;
  }
  const verification = args.strict
    ? { mode: 'strict-merge', ...verify(root, args.json, dependencies.arkCheck, dependencies.runArkCheck) }
    : { mode: 'skipped', exitCode: 0 };
  if (args.json) console.log(JSON.stringify({ ...applied, verification }, null, 2));
  else {
    renderManagedUpgrade(applied);
    if (!args.strict) console.log('Architecture verification skipped (--no-strict).');
  }
  return verification.exitCode;
}
