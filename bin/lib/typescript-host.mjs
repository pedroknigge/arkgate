/**
 * TypeScript host resolution for architecture scan (API-compatible loader).
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { usableTypescript, typescriptUsabilityHint } from '../ark-shared.mjs';

export async function loadTypeScript(root) {
  const loaders = [];
  try {
    const req = createRequire(path.join(root, 'package.json'));
    loaders.push({
      label: 'project',
      load: () => req('typescript'),
      resolvePath: () => {
        try {
          return req.resolve('typescript');
        } catch {
          return null;
        }
      },
    });
  } catch {
    /* project has no package.json resolvable tree */
  }
  // Dedicated production fallback: a different package identity cannot dedupe to project TS7.
  try {
    const req = createRequire(import.meta.url);
    loaders.push({
      label: 'arkgate-fallback',
      load: () => req('typescript-ark-host'),
      resolvePath: () => {
        try {
          return req.resolve('typescript-ark-host');
        } catch {
          return null;
        }
      },
    });
  } catch {
    /* ark install tree unavailable */
  }
  let projectRejected = null;
  const triedPaths = new Set();
  for (const { label, load, resolvePath } of loaders) {
    try {
      const resolved = typeof resolvePath === 'function' ? resolvePath() : null;
      if (resolved && triedPaths.has(resolved)) {
        // Same physical package already rejected (e.g. project === hoisted arkgate path).
        continue;
      }
      if (resolved) triedPaths.add(resolved);

      const mod = await load();
      const ts = usableTypescript(mod);
      if (ts) {
        const version =
          typeof ts.version === 'string'
            ? ts.version
            : typeof mod?.version === 'string'
              ? mod.version
              : undefined;
        return {
          ts,
          source: label,
          version,
          ...(resolved ? { resolvedPath: resolved } : {}),
          ...(projectRejected ? { fallbackReason: projectRejected } : {}),
        };
      }
      if (label === 'project' && mod) {
        projectRejected = `project TypeScript is not API-compatible (${typescriptUsabilityHint(mod)}); using ArkGate's physically independent TypeScript 6 JS-API host. See docs/typescript-support.md.`;
      }
    } catch {
      /* try next loader */
    }
  }
  return {
    ts: null,
    source: 'unavailable',
    reason:
      'ArkGate could not load either the project TypeScript API or its independent TypeScript 6 fallback.',
    ...(projectRejected ? { fallbackReason: projectRejected } : {}),
  };
}
