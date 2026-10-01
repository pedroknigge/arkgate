/**
 * ADR 0039: `arkgate-check --probe-invariants` end to end on the probeline
 * fixture, from the working-tree bin. The packed-tarball journey repeats the
 * same steps against the published payload.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CHECK = path.join(REPO_ROOT, 'bin/ark-check.mjs');
const FIXTURE = path.join(REPO_ROOT, 'tests/fixtures/journey/probeline');
const roots: string[] = [];

function copyFixture(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-probe-cli-')));
  roots.push(root);
  fs.cpSync(FIXTURE, root, { recursive: true });
  return root;
}

function run(root: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [CHECK, '--root', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ARK_NO_OPEN_REPORT: '1' },
    timeout: 120_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function treeHash(root: string): string {
  const hash = crypto.createHash('sha256');
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name === '.ark') continue;
      const abs = path.join(dir, entry.name);
      hash.update(path.relative(root, abs));
      if (entry.isDirectory()) visit(abs);
      else hash.update(fs.readFileSync(abs));
    }
  };
  visit(root);
  return hash.digest('hex');
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('--probe-invariants on probeline', () => {
  it('reports killed / survived / not-reached / unprobeable, writes only on --write, and promotion reads it', () => {
    const root = copyFixture();
    const before = treeHash(root);

    const report = run(root, '--probe-invariants', '--json');
    expect(report.status).toBe(1);
    const payload = JSON.parse(report.stdout).probeInvariants;
    const verdicts = Object.fromEntries(
      payload.rows.map((row: { invariantId: string; verdict: string; reason: string }) => [row.invariantId, `${row.verdict}/${row.reason}`])
    );
    expect(verdicts).toEqual({
      'INV-WINDOW-KILLED': 'killed/all-killed',
      'INV-TOTAL-SURVIVES': 'survived/mutant-survived',
      'INV-UNREACHED': 'not-reached/reach-canary-survived',
      'INV-TYPE-ONLY': 'unprobeable/declaration-only',
    });
    expect(payload.notAScore).toBe(true);
    expect(payload.written).toBeUndefined();
    expect(fs.existsSync(path.join(root, '.ark/invariant-probe.json'))).toBe(false);
    expect(treeHash(root)).toBe(before);

    const written = run(root, '--probe-invariants', '--write', '--json');
    expect(written.status).toBe(1);
    expect(JSON.parse(written.stdout).probeInvariants.written).toBe('.ark/invariant-probe.json');
    const artifact = JSON.parse(fs.readFileSync(path.join(root, '.ark/invariant-probe.json'), 'utf8'));
    expect(artifact).toMatchObject({ kind: 'arkgate-invariant-probe', notAScore: true, operatorSet: 'ip-ops@1' });
    expect(treeHash(root)).toBe(before);

    const promote = run(root, '--promote', '--json');
    expect(promote.status).toBe(0);
    const rows = JSON.parse(promote.stdout).promote.rows as Array<{ id: string; promotable: boolean; blocker: string | null }>;
    const byId = Object.fromEntries(rows.map((row) => [row.id, { promotable: row.promotable, blocker: row.blocker }]));
    expect(byId).toEqual({
      'INV-WINDOW-KILLED': { promotable: true, blocker: null },
      'INV-TOTAL-SURVIVES': { promotable: false, blocker: 'probe-survived' },
      'INV-UNREACHED': { promotable: false, blocker: 'probe-survived' },
      'INV-TYPE-ONLY': { promotable: true, blocker: null },
    });

    // Strengthen the test: the row goes stale and stops refusing.
    fs.appendFileSync(
      path.join(root, 'test/order-total.test.mjs'),
      "\ntest('INV-TOTAL-SURVIVES: a negative total is refused', () => {\n  assert.throws(() => orderTotal([{ price: -1, quantity: 1 }]));\n});\n"
    );
    const stale = JSON.parse(run(root, '--promote', '--json').stdout).promote.rows.find(
      (row: { id: string }) => row.id === 'INV-TOTAL-SURVIVES'
    );
    expect(stale).toMatchObject({ promotable: true, blocker: null });

    // One invariant at a time keeps the other rows.
    const focused = run(root, '--probe-invariants=INV-TOTAL-SURVIVES', '--write', '--json');
    expect(focused.status).toBe(0);
    const merged = JSON.parse(fs.readFileSync(path.join(root, '.ark/invariant-probe.json'), 'utf8'));
    expect(merged.invariants.map((row: { invariantId: string; verdict: string }) => `${row.invariantId}:${row.verdict}`)).toEqual([
      'INV-TOTAL-SURVIVES:killed',
      'INV-TYPE-ONLY:unprobeable',
      'INV-UNREACHED:not-reached',
      'INV-WINDOW-KILLED:killed',
    ]);
  }, 120_000);

  it('could not run → exit 2 with a reason code', () => {
    const root = copyFixture();
    const unknown = run(root, '--probe-invariants=INV-NOPE', '--json');
    expect(unknown.status).toBe(2);
    expect(JSON.parse(unknown.stdout).probeInvariants).toMatchObject({ status: 'refused', reasonCode: 'PROBE_NO_TARGETS' });
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"probeline","type":"module"}\n');
    const noRunner = run(root, '--probe-invariants', '--json');
    expect(noRunner.status).toBe(2);
    expect(JSON.parse(noRunner.stdout).probeInvariants).toMatchObject({ reasonCode: 'PROBE_RUNNER_UNKNOWN' });
    const forced = run(root, '--probe-invariants', '--runner', 'node', '--json');
    expect(forced.status).toBe(1);
  }, 120_000);
});
