/**
 * FX06 — MCP process package vs project install honesty.
 *
 * Pure-ish helpers so unit tests need no MCP server. Production MCP runtime
 * calls buildProcessPackageHonesty with the process version + project root.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * Resolve installed arkgate version for a project root (shallow node_modules,
 * then Node module resolution for hoisted monorepos).
 * @param {string} root
 * @returns {string|null}
 */
export function readProjectInstalledArkgateVersion(root) {
  const resolvedRoot = path.resolve(root);
  try {
    const shallow = path.join(resolvedRoot, 'node_modules', 'arkgate', 'package.json');
    if (fs.existsSync(shallow)) {
      const v = JSON.parse(fs.readFileSync(shallow, 'utf8')).version;
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    }
  } catch {
    /* fall through */
  }
  try {
    const requireFromProject = createRequire(path.join(resolvedRoot, 'package.json'));
    const pkgJson = requireFromProject.resolve('arkgate/package.json');
    const v = JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   processVersion?: string|null,
 *   projectInstalledVersion?: string|null,
 *   root?: string,
 * }} input
 * @returns {{
 *   schemaVersion: '1.0',
 *   notAScore: true,
 *   processArkgateVersion: string|null,
 *   projectInstalledVersion: string|null,
 *   processPackageMismatch: boolean,
 *   processStale: boolean,
 *   nextAction: string,
 * }}
 */
export function buildProcessPackageHonesty(input = {}) {
  const processVersion =
    typeof input.processVersion === 'string' && input.processVersion.trim()
      ? input.processVersion.trim()
      : null;
  let projectInstalledVersion =
    input.projectInstalledVersion !== undefined
      ? input.projectInstalledVersion
      : null;
  if (
    projectInstalledVersion === null &&
    input.projectInstalledVersion === undefined &&
    typeof input.root === 'string' &&
    input.root
  ) {
    projectInstalledVersion = readProjectInstalledArkgateVersion(input.root);
  }
  if (typeof projectInstalledVersion === 'string') {
    projectInstalledVersion = projectInstalledVersion.trim() || null;
  } else if (projectInstalledVersion !== null) {
    projectInstalledVersion = null;
  }

  const mismatch =
    processVersion != null &&
    projectInstalledVersion != null &&
    processVersion !== projectInstalledVersion;

  return {
    schemaVersion: '1.0',
    notAScore: true,
    processArkgateVersion: processVersion,
    projectInstalledVersion,
    processPackageMismatch: mismatch,
    processStale: mismatch,
    nextAction: mismatch
      ? 'Restart or retarget the Ark MCP server so process arkgateVersion matches the project install. Prefer project-local CLI (`npx arkgate` / `npx arkgate-check`) until identity is matched and versions align. Multi-checkout users: one expectedRoot per project; never reuse another checkout’s projectId.'
      : projectInstalledVersion == null
        ? 'Project has no resolvable node_modules/arkgate; install the package or use CLI from a project that pins arkgate.'
        : 'Process package version matches project install for this MCP root.',
  };
}
