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

  it('says "at least N" only when the probe stopped at its cap', () => {
    const base = {
      governedFileCount: 0,
      root: '/repo',
      requestedRoot: '/repo',
      configPath: '/repo/ark.config.json',
    };
    const under = emptyAnalysisRefusal({ ...base, ungovernedSourceCount: 199, ungovernedSourceCap: 200 });
    expect(under?.message).toContain('199 source file(s) exist');
    expect(under?.message).not.toContain('at least');

    const atCap = emptyAnalysisRefusal({ ...base, ungovernedSourceCount: 200, ungovernedSourceCap: 200 });
    expect(atCap?.message).toContain('at least 200 source file(s) exist');

    // No cap declared: the count is a census, never hedged.
    const noCap = emptyAnalysisRefusal({ ...base, ungovernedSourceCount: 200 });
    expect(noCap?.message).toContain('200 source file(s) exist');
    expect(noCap?.message).not.toContain('at least');
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
  /** Contract governs src/ (empty); the tree's real source lives in app/. */
  function scopeMismatchRepo(extra: Record<string, unknown> = {}): string {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', 'thing.ts'), 'export const thing = 1;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
        ...extra,
      })
    );
    return root;
  }

  it('exits 1 instead of printing a closing green when no file is governed', () => {
    const root = scopeMismatchRepo();
    const res = run(['--root', root, '--config', 'ark.config.json'], root);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    expect(res.status, out).toBe(1);
    expect(out).toContain(EMPTY_ANALYSIS_RULE_ID);
    expect(out).not.toMatch(/Ark check passed/);
  });

  it('--json reports ok:false with the empty-analysis ruleId and its next action', () => {
    const root = scopeMismatchRepo();
    const res = run(['--root', root, '--config', 'ark.config.json', '--json'], root);
    const stdout = res.stdout || '';
    const start = stdout.indexOf('{');
    expect(start, stdout.slice(0, 400)).toBeGreaterThanOrEqual(0);
    const payload = JSON.parse(stdout.slice(start));
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe(EMPTY_ANALYSIS_RULE_ID);
    expect(payload.completeness).toBe('unavailable');
    expect(String(payload.message)).toContain('Analysis covered 0 files');
    expect(String(payload.nextAction)).toContain('--plan');
  });

  it('an exclude that swallows the tree cannot buy a green (the probe ignores exclude)', () => {
    // The contract under suspicion must not get to answer the question about itself:
    // `exclude: ["**"]` used to make the tree read as greenfield and pass.
    const root = mk();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['src'],
        exclude: ['**'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      })
    );
    const res = run(['--root', root, '--config', 'ark.config.json'], root);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    expect(res.status, out.slice(-600)).toBe(1);
    expect(out).toContain(EMPTY_ANALYSIS_RULE_ID);
  });

  it.each(['--plan', '--coverage', '--doctor'])(
    'report mode %s diagnoses an empty scope instead of refusing',
    (mode) => {
      const root = scopeMismatchRepo();
      const res = run(['--root', root, '--config', 'ark.config.json', mode], root);
      const out = `${res.stdout || ''}${res.stderr || ''}`;
      expect(res.status, out.slice(-600)).toBe(0);
      expect(out).not.toContain(EMPTY_ANALYSIS_RULE_ID);
    }
  );

  it('a greenfield root is not refused: --init lands a contract before the code', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x"}\n');
    fs.writeFileSync(path.join(root, 'README.md'), '# x\n');
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
    expect(out).not.toContain(EMPTY_ANALYSIS_RULE_ID);
    expect(res.status, out.slice(-600)).toBe(0);
  });

  it('a repo whose only TS is tooling config is greenfield, not a mismatch', () => {
    // Polyglot / TS-less repos: vite.config.ts is not the product source a contract governs.
    const root = mk();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'vite.config.ts'), 'export default {};\n');
    fs.writeFileSync(path.join(root, 'eslint.config.js'), 'module.exports = {};\n');
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
    expect(out).not.toContain(EMPTY_ANALYSIS_RULE_ID);
    expect(res.status, out.slice(-600)).toBe(0);
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

  it('a governed contract does not trip the refusal', () => {
    // Deliberately a self-contained fixture: asserting exit 0 on the whole repo would
    // couple this file to the repo's own architecture health.
    const root = mk();
    fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'domain', 'order.ts'), 'export const order = 1;\n');
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
    expect(out).not.toContain(EMPTY_ANALYSIS_RULE_ID);
    expect(res.status, out.slice(-600)).toBe(0);
  });
});
