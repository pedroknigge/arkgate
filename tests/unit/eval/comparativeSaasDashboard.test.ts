/**
 * Locks the saas-dashboard without-ark fixture as a real deny (value import).
 * Type-only Presentation→Domain is non-blocking and must not silently green this oracle.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK_CHECK = path.join(REPO, 'bin/ark-check.mjs');
const FIXTURE = path.join(REPO, 'eval/comparative/fixtures/saas-dashboard');
const PROMPTS = path.join(REPO, 'eval/comparative/prompts.json');

function runCheck(root: string) {
  const res = spawnSync(
    process.execPath,
    [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--strict-config', '--json'],
    { encoding: 'utf8', cwd: REPO }
  );
  const raw = `${res.stdout || ''}${res.stderr || ''}`.trim();
  let json: { ok?: boolean; violations?: unknown[] };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`ark-check did not return JSON for ${root}\n${raw}`);
  }
  return { exitCode: res.status ?? 1, json };
}

describe('comparative saas-dashboard fixture', () => {
  it('without-ark is a value-import deny (cannot silently pass as type-only)', () => {
    const dashboard = fs.readFileSync(
      path.join(FIXTURE, 'without-ark/src/presentation/dashboard.ts'),
      'utf8'
    );
    expect(dashboard).toMatch(/import\s+\{\s*teamName\s*\}/);
    expect(dashboard).toContain("from '../domain/team.js'");

    const without = runCheck(path.join(FIXTURE, 'without-ark'));
    expect(without.json.ok, JSON.stringify(without.json.violations)).toBe(false);
    expect((without.json.violations ?? []).length).toBeGreaterThanOrEqual(1);

    const prompts = JSON.parse(fs.readFileSync(PROMPTS, 'utf8')) as {
      prompts: Array<{ id: string; withoutArk: { layerViolations: number } }>;
    };
    const entry = prompts.prompts.find((p) => p.id === 'saas-dashboard');
    expect(entry?.withoutArk.layerViolations).toBeGreaterThanOrEqual(1);
  });

  it('with-ark stays green', () => {
    const withArk = runCheck(path.join(FIXTURE, 'with-ark'));
    expect(withArk.json.ok).toBe(true);
    expect(withArk.json.violations ?? []).toEqual([]);
  });
});
