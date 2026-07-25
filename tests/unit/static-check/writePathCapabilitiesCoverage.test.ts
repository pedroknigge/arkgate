/**
 * Coverage lock for bin/lib/write-path-capabilities.mjs (4.1.0 packageInstalled honesty).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';

function pinArkgate(root: string): void {
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0', devDependencies: { arkgate: '4.1.0' } })
  );
  const pkg = path.join(root, 'node_modules', 'arkgate');
  fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'arkgate', version: '4.1.0' }));
  fs.writeFileSync(path.join(pkg, 'bin', 'ark-check.mjs'), 'export {}\n');
}

function installClaudeHook(root: string): void {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude/settings.json'),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                command:
                  'npx arkgate-mcp --hook --hook-repair --root . --config ark.config.json',
              },
            ],
          },
        ],
      },
    })
  );
  fs.writeFileSync(
    path.join(root, '.mcp.json'),
    JSON.stringify({ mcpServers: { ark: { command: 'npx', args: ['arkgate-mcp'] } } })
  );
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github/workflows/arkgate.yml'),
    'name: Ark\njobs:\n  c:\n    steps:\n      - run: npx arkgate-check --strict-merge\n'
  );
}

describe('write-path-capabilities packageInstalled honesty', () => {
  it('without package: observed covered op is active but never hard', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-wpc-no-pkg-'));
    try {
      installClaudeHook(root);
      const ladder = detectWritePathCapabilities(root, 'claude', {
        boundary: 'pre-tool',
        operation: 'Write',
        completePatch: true,
      }).enforcementLadder.localWrite;
      expect(ladder).toMatchObject({
        active: true,
        operationCovered: true,
        completePatch: true,
        hard: false,
        bypassable: true,
        packageInstalled: false,
      });
      // Configured hooks still report active unverified when not observed.
      const idle = detectWritePathCapabilities(root, 'claude').enforcementLadder;
      expect(idle.localWrite).toMatchObject({
        active: 'unverified',
        hard: false,
        packageInstalled: false,
      });
      expect(idle.advisoryMcp.active).toBe('unverified');
      expect(idle.ciMerge.active).toBe('unverified');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('with package: observed covered op is hard and complete-patch', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-wpc-pkg-'));
    try {
      pinArkgate(root);
      installClaudeHook(root);
      const ladder = detectWritePathCapabilities(root, 'claude', {
        boundary: 'pre-tool',
        operation: 'Write',
        completePatch: true,
      }).enforcementLadder.localWrite;
      expect(ladder).toMatchObject({
        active: true,
        operationCovered: true,
        completePatch: true,
        hard: true,
        bypassable: false,
        packageInstalled: true,
        coverage: 'complete-patch',
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('empty root stays non-hard with packageInstalled false', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-wpc-empty-'));
    try {
      const ladder = detectWritePathCapabilities(root, 'claude').enforcementLadder;
      expect(ladder.localWrite).toMatchObject({
        installed: false,
        active: false,
        hard: false,
        packageInstalled: false,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
