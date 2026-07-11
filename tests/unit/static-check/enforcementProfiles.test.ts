import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOST_ENFORCEMENT_SUPPORT,
  WRITE_PROFILE_HOSTS,
  hasHardWriteHook,
  validateHardWriteRequest,
  validateSelectedTools,
} from '../../../bin/lib/enforcement-profiles.mjs';
import { KNOWN_TOOLS } from '../../../bin/lib/skill-install.mjs';
import { STRUCTRAIL_GENERATION_IDENTITY } from '../../../bin/lib/product-identity.mjs';

function mk(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ark-enforcement-profile-'));
}

describe('enforcement profile policy', () => {
  it('declares the supported host guarantees explicitly', () => {
    expect(WRITE_PROFILE_HOSTS).toEqual(['claude', 'grok', 'cursor', 'codex']);
    expect(HOST_ENFORCEMENT_SUPPORT).toEqual({
      claude: {
        hardWrite: true,
        advisoryWrite: true,
        hookPath: '.claude/settings.json',
      },
      grok: {
        hardWrite: true,
        advisoryWrite: true,
        hookPath: '.grok/hooks/ark-write-gate.json',
      },
      cursor: { hardWrite: false, advisoryWrite: true, hookPath: null },
      codex: { hardWrite: false, advisoryWrite: true, hookPath: null },
    });
  });

  it('normalizes valid tool lists and rejects empty or unknown selections', () => {
    expect(validateSelectedTools(null)).toEqual({ ok: true, tools: null });
    expect(validateSelectedTools(' Claude, cursor ')).toEqual({
      ok: true,
      tools: ['claude', 'cursor'],
    });
    expect(validateSelectedTools([])).toEqual({
      ok: false,
      error: `--tools expects a comma-separated subset of: ${KNOWN_TOOLS.join(', ')}`,
    });
    expect(validateSelectedTools('claude,unknown-one,unknown-two')).toEqual({
      ok: false,
      error:
        `--tools expects a comma-separated subset of: ${KNOWN_TOOLS.join(', ')}` +
        ' (unknown: unknown-one, unknown-two)',
    });
  });

  it('rejects unknown, advisory-only, and mismatched hard-write requests', () => {
    const root = mk();
    try {
      expect(
        validateHardWriteRequest({ root, host: null, tools: 'claude' })
      ).toEqual({ ok: true, host: null, tools: ['claude'] });
      expect(
        validateHardWriteRequest({ root, host: 'claude', tools: 'unknown-host' })
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining('(unknown: unknown-host)'),
      });
      expect(
        validateHardWriteRequest({ root, host: ' IDE ', tools: null })
      ).toEqual({
        ok: false,
        error: 'Unknown write host "ide". Expected: claude, grok, cursor, codex.',
      });
      expect(
        validateHardWriteRequest({ root, host: 'CODEX', tools: 'codex' })
      ).toEqual({
        ok: false,
        error:
          'codex supports advisory-write plus the shared CI check, not a hard local write hook. ' +
          'Omit --require-write-hook, keep --strict-merge in CI, and require that status to block merges.',
      });
      expect(
        validateHardWriteRequest({ root, host: 'claude', tools: 'cursor' })
      ).toEqual({
        ok: false,
        error: '--require-write-hook claude requires --tools to include claude.',
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('defaults a supported request to its host and detects installed evidence', () => {
    const root = mk();
    try {
      expect(hasHardWriteHook(root, 'claude')).toBe(false);
      expect(
        validateHardWriteRequest({ root, host: 'Claude', tools: null })
      ).toMatchObject({
        ok: true,
        host: 'claude',
        tools: ['claude'],
      });

      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude', 'settings.json'),
        'command: arkgate-mcp --hook --root .\n'
      );
      expect(hasHardWriteHook(root, 'claude')).toBe(true);
      expect(
        validateHardWriteRequest({ root, host: 'claude', tools: 'claude' })
      ).toMatchObject({ ok: true, host: 'claude' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed on a preserved incompatible hook unless force is explicit', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.grok', 'hooks'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.grok', 'hooks', 'ark-write-gate.json'),
        '{"hooks":{}}\n'
      );
      expect(
        validateHardWriteRequest({ root, host: 'grok', tools: 'grok' })
      ).toEqual({
        ok: false,
        error:
          '.grok/hooks/ark-write-gate.json already exists without an Ark hard-write hook and would be preserved. ' +
          'Use --force to replace that host file, or omit --require-write-hook for merge-only enforcement.',
      });
      expect(
        validateHardWriteRequest({
          root,
          host: 'grok',
          tools: 'grok',
          force: true,
        })
      ).toMatchObject({ ok: true, host: 'grok' });

      fs.writeFileSync(
        path.join(root, '.grok', 'hooks', 'structrail-write-gate.json'),
        '{"hooks":{}}\n'
      );
      expect(
        validateHardWriteRequest({
          root,
          host: 'grok',
          tools: 'grok',
          identity: STRUCTRAIL_GENERATION_IDENTITY,
        })
      ).toEqual({
        ok: false,
        error:
          '.grok/hooks/structrail-write-gate.json already exists without an Ark hard-write hook and would be preserved. ' +
          'Use --force to replace that host file, or omit --require-write-hook for merge-only enforcement.',
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
