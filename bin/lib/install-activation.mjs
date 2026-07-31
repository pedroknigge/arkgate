import fs from 'node:fs';
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';
import { codexProjectMcpIsValid } from './codex-home.mjs';
import { codexRuntimeActivation } from './enforcement-state.mjs';

export function inspectCodexInstallActivation(root, enabled) {
  let configuredOnDisk = false;
  if (enabled) {
    try {
      configuredOnDisk = codexProjectMcpIsValid(
        fs.readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8'),
        root
      );
    } catch {
      // Missing/unreadable configuration remains explicitly unverified.
    }
  }
  return {
    codexProjectConfigured: configuredOnDisk,
    runtimeActivation: codexRuntimeActivation({
      configuredOnDisk,
      restartRequired: configuredOnDisk,
    }),
  };
}

export function reportPartialInstall({
  root,
  tools,
  results,
  homeResults,
  earlyWritten,
  codexMcp,
  runtimeActivation,
}) {
  const failed = [...results, ...homeResults]
    .filter((result) => result.status === 'failed')
    .map((result) => ({
      target: result.relativePath ?? '(unknown template)',
      reason: 'write failed',
    }));
  if (codexMcp?.status === 'failed') {
    failed.push({
      target: codexMcp.file,
      reason: codexMcp.message ?? 'Codex MCP registration failed',
    });
  }
  if (failed.length === 0) return false;

  const written = new Set([
    ...earlyWritten,
    ...[...results, ...homeResults]
      .filter((result) => result.status === 'written' || result.status === 'merged')
      .map((result) => result.relativePath),
  ]);
  console.error('\nINSTALL PARTIAL — some artifacts were written; activation is not complete.');
  console.error('Written:');
  if (written.size === 0) console.error('  - (none)');
  for (const relativePath of written) console.error(`  - ${relativePath}`);
  console.error('Failed:');
  for (const failure of failed) console.error(`  - ${failure.target}: ${failure.reason}`);
  console.error('Recovery:');
  console.error(
    `  - Fix the listed path or permission error, then re-run ${arkCommand(root, 'ark-check', `--install-agent-gates${tools.size > 0 ? ` --tools ${[...tools].join(',')}` : ''}`)}.`
  );
  console.error('  - Existing customized files were preserved; no destructive rollback was attempted.');
  if (tools.has('codex')) {
    console.error(`  - Runtime activation: ${JSON.stringify(runtimeActivation)}`);
  }
  return true;
}

export function printCodexActivationHandoff(root, configuredOnDisk, runtimeActivation) {
  console.log(
    configuredOnDisk
      ? '  CODEX MCP CONFIGURED — RUNTIME NOT VERIFIED'
      : '  CODEX MCP CONFIGURATION UNRESOLVED — RUNTIME NOT VERIFIED'
  );
  console.log(`  Runtime activation: ${JSON.stringify(runtimeActivation)}`);
  console.log(
    configuredOnDisk
      ? `  Restart Codex, then call ark_identity with expectedRoot "${path.resolve(root)}".`
      : '  Repair `.codex/config.toml`, then restart Codex and call ark_identity.'
  );
  console.log('  Do not trust MCP verdicts before the project identity matches.');
}
