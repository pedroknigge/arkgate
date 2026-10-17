/**
 * A tree with no ark.config.json refuses a plain check. The sentence is the
 * packed journey's contract; this test hits the workspace CLI.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABSENT_CONFIG_FIRST_STEP } from '../../../src/domain/firstStep';

const CHECK = path.resolve('bin/ark-check.mjs');
const ARK = path.resolve('bin/ark.mjs');

function freshRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-no-config-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fresh","private":true}\n');
  return root;
}

describe('no ark.config.json', () => {
  it('plain check does not pass and names arkgate start', () => {
    const root = freshRoot();
    const run = spawnSync(process.execPath, [CHECK, '--root', root, '--json', '--no-cache'], {
      encoding: 'utf8',
    });
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toMatch(/passed/i);
    const payload = JSON.parse(run.stdout) as { ok: boolean; error: string; nextAction: string };
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('NO_ARK_CONFIG');
    expect(payload.nextAction).toBe(ABSENT_CONFIG_FIRST_STEP);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('status and doctor use the same sentence', () => {
    const root = freshRoot();
    const status = spawnSync(process.execPath, [ARK, 'status', '--root', root, '--json'], {
      encoding: 'utf8',
    });
    expect(status.status).toBe(0);
    const statusPayload = JSON.parse(status.stdout) as { nextAction?: { summary?: string } };
    expect(statusPayload.nextAction?.summary).toBe(ABSENT_CONFIG_FIRST_STEP);

    const doctor = spawnSync(
      process.execPath,
      [CHECK, '--root', root, '--doctor', '--json', '--no-cache'],
      { encoding: 'utf8' }
    );
    expect(doctor.status).toBe(0);
    const doctorPayload = JSON.parse(doctor.stdout) as {
      doctor?: { primaryNextAction?: string };
    };
    expect(doctorPayload.doctor?.primaryNextAction).toBe(ABSENT_CONFIG_FIRST_STEP);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
