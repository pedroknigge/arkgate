import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withDistLock } from '../../helpers/distLock';

const RUNNER = path.resolve('eval/change-integrity-run.mjs');

describe('T05 fixed change-integrity journey', () => {
  it('proves no-context casual/senior parity and finishes acceptance + strict Ark green', () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-t05-report-')), 'report.json');
    try {
      const run = withDistLock(() =>
        spawnSync(process.execPath, [RUNNER, '--out', out], {
          cwd: path.resolve('.'),
          encoding: 'utf8',
        })
      );
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
      const report = JSON.parse(fs.readFileSync(out, 'utf8'));
      expect(report).toMatchObject({
        ok: true,
        liveLlmRequired: false,
        casualJourney: {
          contextFilesRequired: false,
          rejectedBeforeWrite: true,
          conciseDenials: 1,
        },
        seniorJourney: { cliMcpHookFinalParity: true },
        contextIndependent: { sameVerdictAndHashes: true },
        completion: {
          acceptancePassed: true,
          strictArkPassed: true,
          behavioralCompletionClaimedByPreflight: false,
        },
      });
    } finally {
      fs.rmSync(path.dirname(out), { recursive: true, force: true });
    }
  });
});
