/**
 * An ark-check whose analysis covers zero files must REFUSE, not pass.
 *
 * A green verdict over an empty file set certifies nothing: every rule is
 * vacuously satisfied. Field repro: pointing `--config` at a copy of the
 * contract outside the tree moves the effective root to the copy's directory,
 * every layer pattern matches nothing, and the run printed advisory warnings
 * plus a closing green and exited 0. Under `--strict` it exited 1 for an
 * unrelated reason ("Ark gates are not installed") that never mentioned the
 * empty analysis.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EMPTY_ANALYSIS_RULE_ID,
  emptyAnalysisRefusal,
} from '../../../bin/lib/analysis-completeness.mjs';

const repoRoot = path.resolve('.');
const arkCheck = path.join(repoRoot, 'bin/ark-check.mjs');
const temps: string[] = [];

function mk(prefix = 'ark-empty-analysis-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function run(args: string[], cwd: string) {
  return spawnSync(process.execPath, [arkCheck, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, NO_COLOR: '1', ARK_NO_OPEN_REPORT: '1' },
  });
}

const MOVED_MESSAGE =
  'Analysis covered 0 files: 0 source file(s) exist under /tmp/probe, which is not the /repo ' +
  'this run was asked for — the contract at /tmp/probe/ark.config.json lives outside it. Every ' +
  'rule is vacuously satisfied on an empty set, so a pass here would certify nothing.';

const MOVED_NEXT_ACTION =
  'This run analyzed /tmp/probe, not the /repo you asked for: the contract at ' +
  '/tmp/probe/ark.config.json lives outside /repo, and ark-check adopted the directory holding ' +
  'it as the project root. Pass a contract inside the tree you want checked. ' +
  '`npx arkgate-check --root . --plan` and `--coverage` report the empty scope without ' +
  'refusing, and `--adopt-contract --write` proposes an include that matches this tree.';

const MISMATCH_MESSAGE =
  'Analysis covered 0 files: 12 source file(s) exist under /repo and none of them matched the ' +
  'include and layer patterns in /repo/ark.config.json. Every rule is vacuously satisfied on an ' +
  'empty set, so a pass here would certify nothing.';

const MISMATCH_NEXT_ACTION =
  'Point --root at the tree the contract describes (this run analyzed /repo), or fix the ' +
  'include / exclude / layer patterns in /repo/ark.config.json so they match real files. ' +
  '`npx arkgate-check --root . --plan` and `--coverage` report the empty scope without ' +
  'refusing, and `--adopt-contract --write` proposes an include that matches this tree.';

describe('emptyAnalysisRefusal (pure)', () => {
  it('is silent when the analysis covered at least one file', () => {
    expect(
      emptyAnalysisRefusal({
        governedFileCount: 1,
        ungovernedSourceCount: 40,
        root: '/repo',
        configPath: '/repo/ark.config.json',
      })
    ).toBe(null);
    expect(
      emptyAnalysisRefusal({
        governedFileCount: -1,
        ungovernedSourceCount: 40,
        root: '/repo',
        configPath: '/repo/ark.config.json',
      })
    ).toBe(null);
    // A non-numeric count is not evidence of an empty analysis.
    expect(emptyAnalysisRefusal({ ungovernedSourceCount: 40, root: '/repo' })).toBe(null);
  });

  it('is silent on a greenfield root the caller asked for (no source to govern)', () => {
    expect(
      emptyAnalysisRefusal({
        governedFileCount: 0,
        ungovernedSourceCount: 0,
        root: '/repo',
        requestedRoot: '/repo',
        configPath: '/repo/ark.config.json',
      })
    ).toBe(null);
  });

  it('is silent when the root was not actually moved away from the one asked for', () => {
    const base = {
      governedFileCount: 0,
      ungovernedSourceCount: 0,
      root: '/repo',
      configPath: '/repo/ark.config.json',
    };
    // Walk-up flag absent: a different requestedRoot alone does not move the root.
    expect(emptyAnalysisRefusal({ ...base, requestedRoot: '/elsewhere' })).toBe(null);
    // Walk-up flag set but the walk landed on the requested root.
    expect(
      emptyAnalysisRefusal({ ...base, requestedRoot: '/repo', configWalkedUp: true })
    ).toBe(null);
    // Walk-up flag set with no requested root recorded: nothing to compare.
    expect(emptyAnalysisRefusal({ ...base, requestedRoot: '', configWalkedUp: true })).toBe(null);
  });

  it('refuses a contract that governs none of the source under the root it was asked for', () => {
    const refusal = emptyAnalysisRefusal({
      governedFileCount: 0,
      ungovernedSourceCount: 12,
      root: '/repo',
      requestedRoot: '/repo',
      configPath: '/repo/ark.config.json',
    });
    expect(refusal?.ruleId).toBe(EMPTY_ANALYSIS_RULE_ID);
    // Whole message, not a fragment: every clause is load-bearing.
    expect(refusal?.message).toBe(MISMATCH_MESSAGE);
    expect(refusal?.nextAction).toBe(MISMATCH_NEXT_ACTION);
  });

  it('refuses a root moved away from the one asked for, even with no source there', () => {
    const refusal = emptyAnalysisRefusal({
      governedFileCount: 0,
      ungovernedSourceCount: 0,
      root: '/tmp/probe',
      requestedRoot: '/repo',
      configPath: '/tmp/probe/ark.config.json',
      configWalkedUp: true,
    });
    expect(refusal?.ruleId).toBe(EMPTY_ANALYSIS_RULE_ID);
    expect(refusal?.message).toBe(MOVED_MESSAGE);
    expect(refusal?.nextAction).toBe(MOVED_NEXT_ACTION);
  });

  it('renders empty paths rather than "undefined" when the caller omits them', () => {
    const refusal = emptyAnalysisRefusal({ governedFileCount: 0, ungovernedSourceCount: 3 });
    expect(refusal?.message).toBe(
      'Analysis covered 0 files: 3 source file(s) exist under  and none of them matched the ' +
        'include and layer patterns in . Every rule is vacuously satisfied on an empty set, so a ' +
        'pass here would certify nothing.'
    );
  });

  it('reports zero rather than a missing count when the caller passes no numbers or paths', () => {
    const refusal = emptyAnalysisRefusal({
      governedFileCount: 0,
      root: '',
      requestedRoot: '/repo',
      configWalkedUp: true,
    });
    expect(refusal?.message).toBe(
      'Analysis covered 0 files: 0 source file(s) exist under , which is not the /repo this run ' +
        'was asked for — the contract at  lives outside it. Every rule is vacuously satisfied on ' +
        'an empty set, so a pass here would certify nothing.'
    );
  });
});

describe('ark-check refuses an empty analysis', () => {
  it('exits 1 instead of printing a closing green when no file is governed', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    // Source exists in the tree — the contract simply does not describe it.
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', 'thing.ts'), 'export const thing = 1;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      })
    );

    const res = run(['--root', root, '--config', 'ark.config.json'], root);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    expect(res.status, out).toBe(1);
    expect(out).toContain(EMPTY_ANALYSIS_RULE_ID);
    expect(out).not.toMatch(/Ark check passed/);
  });

  it('--json reports ok:false with the empty-analysis ruleId', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    // Source exists in the tree — the contract simply does not describe it.
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', 'thing.ts'), 'export const thing = 1;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      })
    );

    const res = run(['--root', root, '--config', 'ark.config.json', '--json'], root);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    const start = out.indexOf('{');
    expect(start, out.slice(0, 400)).toBeGreaterThanOrEqual(0);
    const payload = JSON.parse(out.slice(start));
    expect(payload.ok).toBe(false);
    expect(payload.error ?? payload.violations?.[0]?.ruleId).toContain(EMPTY_ANALYSIS_RULE_ID);
  });

  it('field repro: --config copied outside the tree refuses with the real reason', () => {
    const outside = mk();
    const configCopy = path.join(outside, 'probe.config.json');
    fs.copyFileSync(path.join(repoRoot, 'ark.config.json'), configCopy);

    const plain = run(['--root', repoRoot, '--config', configCopy], repoRoot);
    const plainOut = `${plain.stdout || ''}${plain.stderr || ''}`;
    expect(plain.status, plainOut.slice(-800)).toBe(1);
    expect(plainOut).toContain(EMPTY_ANALYSIS_RULE_ID);
    expect(plainOut).not.toMatch(/Ark check passed/);

    const strict = run(['--root', repoRoot, '--config', configCopy, '--strict'], repoRoot);
    const strictOut = `${strict.stdout || ''}${strict.stderr || ''}`;
    expect(strict.status, strictOut.slice(-800)).toBe(1);
    expect(strictOut).toContain(EMPTY_ANALYSIS_RULE_ID);
    // The old wrong reason: gates missing in the directory holding the config copy.
    expect(strictOut).not.toMatch(/Ark gates are not installed/);
  });

  it('the real contract still passes over a non-empty file set', () => {
    const res = run(['--root', repoRoot, '--config', 'ark.config.json'], repoRoot);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    expect(out).not.toContain(EMPTY_ANALYSIS_RULE_ID);
    expect(res.status, out.slice(-800)).toBe(0);
  });
});
