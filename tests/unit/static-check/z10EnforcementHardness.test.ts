import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  claudeSettings,
  codexHooks,
  grokHooks,
} from '../../../bin/lib/hook-templates.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';

function write(root: string, relativePath: string, content: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z10-hardness-'));
  write(root, 'package.json', '{"name":"z10-hardness","private":true}\n');
  write(root, 'node_modules/arkgate/package.json', '{"name":"arkgate","exports":{"./package.json":"./package.json"}}\n');
  write(root, 'node_modules/arkgate/bin/ark-check.mjs', '#!/usr/bin/env node\n');
  write(root, '.claude/settings.json', claudeSettings(root));
  write(root, '.grok/hooks/ark-write-gate.json', grokHooks(root));
  write(root, '.codex/hooks.json', codexHooks(root));
  write(root, '.mcp.json', '{"mcpServers":{"ark":{"command":"npx","args":["arkgate-mcp"]}}}\n');
  write(
    root,
    '.github/workflows/ark-check.yml',
    'jobs:\n  ark-check:\n    steps:\n      - run: npx arkgate-check --strict-merge\n'
  );
  return root;
}

describe('Z10 runtime-proven enforcement hardness', () => {
  it('keeps installed host assets unverified and hard:false for every unobserved host', () => {
    const root = fixture();
    for (const host of ['claude', 'grok', 'cursor', 'codex'] as const) {
      const state = detectWritePathCapabilities(root, host).enforcementState.localWrite;
      expect(state.runtimeObserved).toBe(false);
      expect(state.operation).toBeNull();
      expect(state.operationCoverage).toBe('unverified');
      expect(state.hard).toBe(false);
      if (host === 'claude' || host === 'grok') {
        expect(state).toMatchObject({
          supported: true,
          configured: true,
          installed: true,
          active: 'unverified',
          bypassable: 'unverified',
        });
      } else {
        expect(state.supported).toBe(false);
      }
    }
  });

  it('sets hard:true only for a fresh covered operation on the active hard-hook host', () => {
    const root = fixture();
    const cases = [
      ['claude', 'Write'],
      ['grok', 'search_replace'],
    ] as const;
    for (const [host, operation] of cases) {
      const state = detectWritePathCapabilities(root, host, {
        boundary: 'pre-tool',
        operation,
        completePatch: true,
      }).enforcementState.localWrite;
      expect(state).toMatchObject({
        supported: true,
        runtimeObserved: true,
        operation,
        operationCoverage: true,
        active: true,
        bypassable: false,
        hard: true,
      });
      expect(state.evidence).toContainEqual(
        expect.objectContaining({ field: 'hard', value: true, source: expect.stringContaining('fresh') })
      );
    }
  });

  it('never upgrades an unsupported or uncovered operation to hard', () => {
    const root = fixture();
    const codex = detectWritePathCapabilities(root, 'codex', {
      boundary: 'pre-tool',
      operation: 'apply_patch',
      completePatch: true,
    }).enforcementState.localWrite;
    expect(codex).toMatchObject({
      runtimeObserved: true,
      operation: 'apply_patch',
      operationCoverage: true,
      active: true,
      bypassable: true,
      hard: false,
    });

    const uncovered = detectWritePathCapabilities(root, 'claude', {
      boundary: 'pre-tool',
      operation: 'Bash',
    }).enforcementState.localWrite;
    expect(uncovered).toMatchObject({
      runtimeObserved: true,
      operation: 'Bash',
      operationCoverage: false,
      active: false,
      bypassable: true,
      hard: false,
    });
  });
});
