#!/usr/bin/env node
/** Lightweight launcher; ark-mcp-runtime owns all MCP and hook semantics. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RESIDENT_HOOK_PROTOCOL_VERSION,
  requestResidentHook,
  residentHookEndpoint,
} from './lib/resident-hook.mjs';

const launcher = fileURLToPath(import.meta.url);

function launcherArgs(argv) {
  const args = {
    root: process.cwd(),
    config: 'ark.config.json',
    manifest: undefined,
    tsconfig: undefined,
    hook: false,
    hookRepair: /^(?:1|true|yes|on)$/i.test(String(process.env.ARK_HOOK_REPAIR ?? '').trim()),
    failOnNewSmells: /^(?:1|true|yes|on)$/i.test(
      String(process.env.ARK_FAIL_ON_NEW_SMELLS ?? '').trim()
    ),
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--hook') args.hook = true;
    else if (value === '--hook-repair') {
      args.hook = true;
      args.hookRepair = true;
    } else if (value === '--fail-on-new-smells') args.failOnNewSmells = true;
    else if (value === '--root' && argv[index + 1]) args.root = path.resolve(argv[++index]);
    else if (value === '--config' && argv[index + 1]) args.config = argv[++index];
    else if (value === '--manifest' && argv[index + 1]) args.manifest = argv[++index];
    else if (value === '--tsconfig' && argv[index + 1]) args.tsconfig = argv[++index];
  }
  return args;
}

function residentEligiblePayload(payload) {
  const toolName = payload?.tool_name ?? payload?.toolName;
  return !['ApplyPatch', 'apply_patch'].includes(toolName);
}

async function tryResidentHook(args, hookInput) {
  if (process.env.ARK_RESIDENT_HOOK !== '1') return null;
  let payload;
  try {
    payload = JSON.parse(hookInput);
  } catch {
    // Matches the one-shot contract: malformed/no stdin is a non-blocking no-op.
    return { status: 0, stdout: '', stderr: '' };
  }
  if (!residentEligiblePayload(payload)) return null;
  const endpoint = residentHookEndpoint({
    root: args.root,
    config: args.config,
    manifest: args.manifest,
    tsconfig: args.tsconfig,
    launcher,
  });
  const configuredTimeout = Number(process.env.ARK_RESIDENT_HOOK_TIMEOUT_MS);
  const response = await requestResidentHook({
    socket: endpoint.socket,
    timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 75,
    request: {
      protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION,
      kind: 'hook',
      root: path.resolve(args.root),
      config: args.config,
      manifest: args.manifest ?? null,
      tsconfig: args.tsconfig ?? null,
      hookRepair: args.hookRepair,
      failOnNewSmells: args.failOnNewSmells,
      grokHookEvent: Boolean(process.env.GROK_HOOK_EVENT),
      payload,
    },
  });
  if (
    !response ||
    response.fallback === true ||
    !Number.isInteger(response.status) ||
    typeof response.stdout !== 'string' ||
    typeof response.stderr !== 'string'
  ) {
    return null;
  }
  return response;
}

const args = launcherArgs(process.argv);
let hookInput;
let residentHandled = false;
try {
  if (args.hook) {
    hookInput = fs.readFileSync(0, 'utf8');
    const resident = await tryResidentHook(args, hookInput);
    if (resident) {
      if (resident.stdout) process.stdout.write(resident.stdout);
      if (resident.stderr) process.stderr.write(resident.stderr);
      process.exitCode = resident.status;
      residentHandled = true;
    }
  }
  if (!residentHandled) {
    const runtime = await import('./ark-mcp-runtime.mjs');
    await runtime.runArkMcp({ hookInput });
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
