import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';

function setupClaudeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t05-ladder-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
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
  fs.writeFileSync(
    path.join(root, '.github/workflows/arkgate.yml'),
    'name: ArkGate\njobs:\n  check:\n    steps:\n      - run: npx arkgate-check --strict-merge\n'
  );
  return root;
}

describe('T05 honest enforcement ladder', () => {
  it('separates supported, installed, active, and bypassable state in doctor data', () => {
    const root = setupClaudeRoot();
    try {
      const ladder = detectWritePathCapabilities(root, 'claude').enforcementLadder;
      expect(ladder).toMatchObject({
        schemaVersion: '1.0',
        localWrite: {
          supported: true,
          installed: true,
          active: 'unverified',
          bypassable: true,
          hard: false,
          completePatch: false,
          evidence: ['.claude/settings.json'],
        },
        advisoryMcp: {
          supported: true,
          installed: true,
          active: 'unverified',
          bypassable: true,
          hard: false,
          evidence: ['.mcp.json'],
        },
        ciMerge: {
          supported: true,
          installed: true,
          active: 'unverified',
          bypassable: 'unknown',
          hard: false,
          requiredStatus: 'unverified',
          evidence: ['.github/workflows/arkgate.yml'],
        },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('claims a hard boundary only for an observed covered hook operation', () => {
    const root = setupClaudeRoot();
    try {
      const covered = detectWritePathCapabilities(root, 'claude', {
        boundary: 'pre-tool',
        operation: 'Write',
      }).enforcementLadder.localWrite;
      expect(covered).toMatchObject({
        active: true,
        operation: 'Write',
        operationCovered: true,
        hard: true,
        bypassable: false,
      });

      const unsupported = detectWritePathCapabilities(root, 'codex', {
        boundary: 'pre-tool',
        operation: 'apply_patch',
      }).enforcementLadder.localWrite;
      expect(unsupported).toMatchObject({
        supported: false,
        hard: false,
        bypassable: true,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps every unobserved boundary explicitly non-hard', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t05-empty-ladder-'));
    try {
      expect(detectWritePathCapabilities(root, 'claude').enforcementLadder).toEqual({
        schemaVersion: '1.0',
        activeHost: 'claude',
        localWrite: {
          supported: true,
          installed: false,
          active: false,
          bypassable: true,
          hard: false,
          evidence: [],
          completePatch: false,
          coverage: 'PreToolUse `Write` / `Edit` / `MultiEdit`',
          operationCovered: 'unverified',
        },
        advisoryMcp: {
          supported: true,
          installed: false,
          active: false,
          bypassable: true,
          hard: false,
          evidence: [],
        },
        ciMerge: {
          supported: true,
          installed: false,
          active: false,
          bypassable: 'unknown',
          hard: false,
          evidence: [],
          requiredStatus: 'unverified',
        },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('normalizes covered operations and proves complete-patch scope per invocation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t05-observed-ladder-'));
    try {
      const observed = detectWritePathCapabilities(root, 'claude', {
        boundary: 'pre-tool',
        operation: ' write ',
        completePatch: true,
      }).enforcementLadder.localWrite;
      expect(observed).toEqual({
        supported: true,
        installed: true,
        active: true,
        bypassable: false,
        hard: true,
        evidence: [],
        completePatch: true,
        coverage: 'complete-patch',
        operation: ' write ',
        operationCovered: true,
      });

      const unknown = detectWritePathCapabilities(root, 'unknown', {
        boundary: 'pre-tool',
        operation: 'Write',
        completePatch: true,
      }).enforcementLadder.localWrite;
      expect(unknown).toEqual({
        supported: false,
        installed: true,
        active: false,
        bypassable: true,
        hard: false,
        evidence: [],
        completePatch: false,
        coverage: null,
        operation: 'Write',
        operationCovered: false,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not broaden a hook to uncovered operations or non-hook attempts', () => {
    const root = setupClaudeRoot();
    try {
      expect(
        detectWritePathCapabilities(root, 'claude', {
          boundary: 'pre-tool',
          operation: 'Delete',
          completePatch: true,
        }).enforcementLadder.localWrite
      ).toMatchObject({
        installed: true,
        active: false,
        hard: false,
        bypassable: true,
        completePatch: false,
        coverage: 'PreToolUse `Write` / `Edit` / `MultiEdit`',
        operation: 'Delete',
        operationCovered: false,
      });
      expect(
        detectWritePathCapabilities(root, 'claude', {
          boundary: 'mcp',
          operation: 'Write',
          completePatch: true,
        }).enforcementLadder.localWrite
      ).toMatchObject({
        active: 'unverified',
        hard: false,
        bypassable: true,
        completePatch: false,
        operationCovered: 'unverified',
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
