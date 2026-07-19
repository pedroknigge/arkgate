import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RESIDENT_HOOK_PROTOCOL_VERSION,
  requestResidentHook,
  residentDoctorEnvironment,
  residentHookEndpoint,
} from './resident-hook.mjs';

const arkMcpLauncher = fileURLToPath(new URL('../ark-mcp.mjs', import.meta.url));

/** Try the opt-in resident doctor and let the caller continue through the cold fallback. */
export async function tryResidentDoctor(args) {
  if (!args.resident) return false;
  if (!args.doctor || !args.json) throw new Error('--resident requires --doctor --json.');
  const endpoint = residentHookEndpoint({
    root: args.root,
    config: args.config,
    manifest: args.manifest,
    tsconfig: args.tsconfig,
    launcher: arkMcpLauncher,
  });
  const configuredTimeout = Number(process.env.ARK_RESIDENT_DOCTOR_TIMEOUT_MS);
  const response = await requestResidentHook({
    socket: endpoint.socket,
    timeoutMs:
      Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 500,
    request: {
      protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION,
      kind: 'doctor',
      root: path.resolve(args.root),
      config: args.config,
      manifest: args.manifest ?? null,
      tsconfig: args.tsconfig ?? null,
      environment: residentDoctorEnvironment(),
    },
  });
  if (
    !response ||
    response.fallback === true ||
    !Number.isInteger(response.status) ||
    typeof response.stdout !== 'string' ||
    typeof response.stderr !== 'string'
  ) {
    if (process.env.ARK_RESIDENT_DOCTOR_REQUIRED === '1') {
      throw new Error('Resident doctor was required but unavailable.');
    }
    return false;
  }
  if (response.stdout) process.stdout.write(response.stdout);
  if (response.stderr) process.stderr.write(response.stderr);
  process.exitCode = response.status;
  return true;
}
