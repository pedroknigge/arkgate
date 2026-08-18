/**
 * Entry-path smoke: local ark-check on fixtures (opt-in silence + fail-closed missing arkRules).
 * Drives the real CLI entry (bin/ark-check.mjs), not a re-implementation.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { version } from '../../../src/version.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = path.join(REPO, 'bin/ark-check.mjs');
const FIX = path.join(REPO, 'tests/fixtures/arkrules-entry');

function runCheck(rootRel: string) {
  const root = path.join(FIX, rootRel);
  return runCheckRoot(root);
}

function runCheckRoot(root: string) {
  return spawnSync(process.execPath, [CLI, '--root', root, '--config', 'ark.config.json'], {
    encoding: 'utf8',
    cwd: REPO,
  });
}

describe('ArkRules entry path via ark-check CLI', () => {
  it('package identity matches prepared train version', () => {
    expect(version).toBe('4.6.3');
  });

  it('completes without arkRules (opt-in silence)', () => {
    const r = runCheck('no-rules');
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/passed|✔/i);
  });

  it('fails closed when referenced arkrules file is missing', () => {
    const r = runCheck('missing-ref');
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/Invalid Effective Contract|ARKRULES_LOAD|missing/i);
    expect(out).toMatch(/DomainModel|arkrules\/DomainModel\.json/);
  });

  it.each([
    '../outside/DomainModel.json',
    '/tmp/outside/DomainModel.json',
    String.raw`C:\outside\DomainModel.json`,
    String.raw`\\server\share\DomainModel.json`,
  ])('fails closed before loading an ArkRules path outside the project: %s', (reference) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkrules-entry-containment-'));
    try {
      fs.writeFileSync(
        path.join(root, 'ark.config.json'),
        `${JSON.stringify({
          schemaVersion: '1.1',
          include: ['src'],
          layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
          rules: [],
          arkRules: { DomainModel: reference },
        })}\n`
      );

      const result = runCheckRoot(root);
      expect(result.status, result.stdout + result.stderr).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(
        /project-relative|outside the project root|Invalid Effective Contract/i
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
