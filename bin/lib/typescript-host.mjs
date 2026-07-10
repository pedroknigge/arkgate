/**
 * TypeScript host resolution for architecture scan (API-compatible loader).
 */
import path from 'node:path';
import { usableTypescript, typescriptUsabilityHint } from '../ark-shared.mjs';
import { __arkCheckCli } from './gate-files.mjs';

export async function loadTypeScript(root) {
  const { createRequire } = await import('node:module');
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
  // Nested under arkgate (production dependency) — must work when project has only TS7.
  try {
    const req = createRequire(__arkCheckCli);
    loaders.push({
      label: 'arkgate',
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
    /* ark install tree unavailable */
  }
  loaders.push({
    label: 'import',
    load: async () => {
      const m = await import('typescript');
      return m;
    },
    resolvePath: () => null,
  });

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
          ...(projectRejected ? { fallbackReason: projectRejected } : {}),
        };
      }
      if (label === 'project' && mod) {
        projectRejected = `project typescript is not API-compatible (${typescriptUsabilityHint(mod)}); using ArkGate's JS-API TypeScript fallback (TypeScript 7.0 main export is version-only). See docs/typescript-support.md.`;
      }
    } catch {
      /* try next loader */
    }
  }
  return null;
}
