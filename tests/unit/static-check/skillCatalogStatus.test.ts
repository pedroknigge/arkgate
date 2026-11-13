/**
 * Issue #390: after start --apply, doctor must not call a missing
 * .agents/skills catalog current, and must not also say the host skills
 * are missing. One status, one sentence, text matches JSON.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin/ark.mjs');
const ARK_CHECK = path.join(REPO, 'bin/ark-check.mjs');
const TMP_ROOTS: string[] = [];

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-skill-status-'));
  TMP_ROOTS.push(root);
  return root;
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

function plain(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

afterEach(() => {
  while (TMP_ROOTS.length > 0) {
    const root = TMP_ROOTS.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('skill catalog status after start --apply (#390)', () => {
  it('does not call a missing .agents/skills catalog current, and says so once', async () => {
    const root = tmpRoot();
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'skill-status-fixture', private: true, version: '0.0.0' }, null, 2)
    );
    write(root, 'src/index.ts', 'export const n = 1;\n');

    const apply = await execFileAsync(
      process.execPath,
      [
        ARK,
        'start',
        '--root',
        root,
        '--tools',
        'cursor',
        '--yes',
        '--no-install',
        '--no-strict',
        '--apply',
      ],
      { encoding: 'utf8', env: { ...process.env, ARK_ACTIVE_HOST: 'cursor' } }
    );
    expect(apply.stdout + apply.stderr).not.toMatch(/Refusing ark start --apply/);
    expect(fs.existsSync(path.join(root, '.agents', 'skills'))).toBe(false);

    const env = { ...process.env, ARK_ACTIVE_HOST: 'cursor' };
    const human = await execFileAsync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--doctor', '--all', '--no-cache'],
      { encoding: 'utf8', env }
    );
    const jsonRun = await execFileAsync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--doctor', '--json', '--no-cache'],
      { encoding: 'utf8', env }
    );
    const text = plain(human.stdout);
    const payload = JSON.parse(jsonRun.stdout) as {
      doctor?: {
        adoption?: { gaps?: Array<{ id?: string; message?: string; fix?: string }> };
        skillGaps?: Array<{ missing?: number; stale?: number }>;
      };
    };
    const gaps = payload.doctor?.adoption?.gaps ?? [];
    const skillGap = gaps.find((gap) => gap.id === 'skill-catalog-absent');
    expect(skillGap?.message).toMatch(/Skill pack not installed \(\.agents\/skills is not on disk/);
    expect(skillGap?.message).toMatch(/Compact start does not install it/);
    expect(skillGap?.fix).toMatch(/--install-agent-gates --skills-only/);
    expect(skillGap?.fix).not.toMatch(/--force/);
    expect(skillGap?.fix).not.toMatch(/--tools cursor/);

    const sentences = text.match(/Skill pack not installed \(\.agents\/skills is not on disk/g) ?? [];
    expect(sentences).toHaveLength(1);
    expect(text).toContain(skillGap?.message);
    expect(text).toContain(skillGap?.fix);
    expect(text).not.toMatch(/skills current/);
    expect(text).not.toMatch(/skill\(s\) missing/);
    expect(gaps.filter((gap) => /skill\(s\) missing/.test(gap.message ?? ''))).toEqual([]);
    const counted = (payload.doctor?.skillGaps ?? []).reduce(
      (sum, gap) => sum + (gap.missing ?? 0) + (gap.stale ?? 0),
      0
    );
    expect(counted).toBe(0);
  }, 120_000);
});
