/**
 * Extracted agent-gates module (install modularization).
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arkCommand,
  detectPackageManager,
  execCommandParts,
  execRunner,
  presentLockfiles,
  usableTypescript,
  typescriptUsabilityHint,
  DEFAULT_INTENT_PREFIXES,
  DEFAULT_LAYER_DIRECTORIES,
  DEFAULT_DOMAIN_FORBIDDEN_GLOBALS,
  DEFAULT_RULES,
  createElevenLayerConfig,
  applyFrameworkLayoutOverlays,
} from '../ark-shared.mjs';
import { CORE_LAYER_NAMES } from './core-layers.mjs';
import { falseGreenAdoptionGap } from './field-install.mjs';
import {
  assessCodexHomeMcp,
  codexConfigPath,
  codexPromptsDir,
  isTempOrUpgradeRoot,
  wireCodexMcp,
} from './codex-home.mjs';
import {
  PREFERRED_MCP_BIN,
  claudeSettings,
  grokHooks,
  grokProjectConfig,
} from './hook-templates.mjs';
import { detectWritePathCapabilities } from './write-path-detect.mjs';

import { __packageRoot } from './gate-files.mjs';

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

/**
 * Args for every emitted `ark-check` (AGENTS.md, package.json, Cursor rule, CI).
 * If `.ark-baseline.json` exists, include `--baseline` so agent/local/CI paths
 * match the ratchet — otherwise agents re-fail on frozen debt (field-test bug).
 */
