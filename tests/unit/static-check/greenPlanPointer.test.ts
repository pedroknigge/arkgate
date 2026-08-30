/**
 * A green run names `--plan` when design bets are still open.
 *
 * `--plan` is built and good and was invisible: a whole adopter session went by
 * without opening it, because `✔ Ark check passed` reads as *finished*. Clean
 * import edges are not a settled design, and the closing line said only the
 * first half of what the run already knows.
 *
 * Report only: it can only print on a run that passed, it never changes the
 * exit code, and it stays silent when the pass has nothing behind it.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve('.');
const arkCheck = path.join(repoRoot, 'bin/ark-check.mjs');
const temps: string[] = [];

function mk(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-green-plan-pointer-'));
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

/**
 * A repo that passes: every file is governed and no rule denies anything.
 * With `rules: []` both populated layers have no edge, which is exactly the
 * `soft-contract` smell — green gate, unsettled design.
 */
function softContractRepo(rules: unknown[] = []): string {
  const root = mk();
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/thing.ts'), 'export const thing = 1;\n');
  // Populated and never named by any rule: that is `soft-contract`, and it
  // survives whatever `rules` the caller passes.
  fs.writeFileSync(path.join(root, 'src/shared/util.ts'), 'export const util = 2;\n');
  fs.writeFileSync(
    path.join(root, 'src/app/use.ts'),
    "import { thing } from '../domain/thing';\nexport const use = () => thing;\n"
  );
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'Application', patterns: ['src/app/**'] },
        { name: 'SharedKernel', patterns: ['src/shared/**'] },
      ],
      rules,
    })
  );
  return root;
}

describe('a passing run points at --plan when design bets remain', () => {
  it('prints the pointer under the green line, with the smell ids and the command', () => {
    const root = softContractRepo();
    const res = run(['--root', root, '--config', 'ark.config.json'], root);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    expect(res.status, out).toBe(0);
    expect(out).toMatch(/Ark check passed/);
    expect(out).toContain('Import rules are clean; the design bets are not settled');
    expect(out).toContain('soft-contract');
    expect(out).toContain('--plan');
    // Never a warning, never a failure: it is a hint on an already-green run.
    expect(out).not.toMatch(/✖/);
  });

  it('is silent on --changed, where a partial scan would print a slice as the tree', () => {
    const root = softContractRepo();
    spawnSync('git', ['init', '-q'], { cwd: root });
    spawnSync('git', ['add', '-A'], { cwd: root });
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], {
      cwd: root,
    });
    // The changed set must be NON-EMPTY, or the run short-circuits before the
    // summary and the silence proves nothing: with an empty diff this test
    // passes even with the `--changed` guard deleted.
    fs.appendFileSync(path.join(root, 'src/app/use.ts'), 'export const other = use;\n');
    const changed = run(
      ['--root', root, '--config', 'ark.config.json', '--changed', '--base', 'HEAD'],
      root
    );
    const changedOut = `${changed.stdout || ''}${changed.stderr || ''}`;
    expect(changed.status, changedOut).toBe(0);
    expect(changedOut).toMatch(/Ark check passed/);
    expect(changedOut).not.toMatch(/no governed source .* in the diff/);
    expect(changedOut).not.toContain('the design bets are not settled');
    // Same tree, full scan: the pointer DOES print, so the silence above is the
    // guard and not an accident of this fixture.
    const full = run(['--root', root, '--config', 'ark.config.json'], root);
    expect(`${full.stdout || ''}${full.stderr || ''}`).toContain(
      'the design bets are not settled'
    );
  });

  it('leaves --json untouched: the pointer is a human summary line only', () => {
    const root = softContractRepo();
    const res = run(['--root', root, '--config', 'ark.config.json', '--json'], root);
    const stdout = res.stdout || '';
    expect(stdout).not.toContain('the design bets are not settled');
    const parsed = JSON.parse(stdout.slice(stdout.indexOf('{')));
    expect(parsed.ok).toBe(true);
    // The same repo on the human path prints it — otherwise this asserts nothing.
    const human = run(['--root', root, '--config', 'ark.config.json'], root);
    expect(`${human.stdout || ''}${human.stderr || ''}`).toContain(
      'the design bets are not settled'
    );
  });

  it('says nothing when the passing run has no design residual behind it', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/thing.ts'), 'export const thing = 1;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [{ from: 'DomainModel', to: 'DomainModel', allowed: true }],
      })
    );
    const res = run(['--root', root, '--config', 'ark.config.json'], root);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    expect(res.status, out).toBe(0);
    expect(out).toMatch(/Ark check passed/);
    expect(out).not.toContain('the design bets are not settled');
  });
});

describe('the pointer agrees with doctor about what "green" means', () => {
  /**
   * Type-only placement debt: non-blocking, exit 0, its own green branch — and
   * the branch most likely on a real adopter tree. Doctor calls this
   * design-weak (it counts BLOCKING violations), so the pointer must too.
   */
  it('prints on the type-only placement-debt branch, the way doctor does', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/ui'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/use.ts'), 'export const use = 1;\n');
    fs.writeFileSync(path.join(root, 'src/domain/thing.ts'), 'export type Thing = { a: number };\n');
    fs.writeFileSync(
      path.join(root, 'src/ui/view.ts'),
      "import type { Thing } from '../domain/thing';\nexport const view = (t: Thing) => t.a;\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'UI', patterns: ['src/ui/**'] },
          // Populated and rule-less on purpose: that is `soft-contract`, the
          // design residual this branch has to keep reporting.
          { name: 'Application', patterns: ['src/app/**'] },
        ],
        rules: [{ from: 'UI', to: 'DomainModel', allowed: false }],
      })
    );
    const res = run(['--root', root, '--config', 'ark.config.json'], root);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    expect(res.status, out).toBe(0);
    expect(out).toMatch(/placement debt/);
    expect(out).toContain('the design bets are not settled');
  });

  it('does not call a baselined run clean — it names the suppression instead', () => {
    const root = softContractRepo([{ from: 'Application', to: 'DomainModel', allowed: false }]);
    const first = run(['--root', root, '--config', 'ark.config.json'], root);
    expect(`${first.stdout || ''}${first.stderr || ''}`).toMatch(/violation/);
    run(
      [
        '--root', root, '--config', 'ark.config.json',
        '--contract-session', '--force', '--update-baseline',
      ],
      root
    );
    const res = run(
      ['--root', root, '--config', 'ark.config.json', '--baseline', '.ark-baseline.json'],
      root
    );
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    expect(res.status, out).toBe(0);
    expect(out).toMatch(/suppressed by baseline/);
    expect(out).toContain('the design bets are not settled');
    // The summary line directly above says a violation was suppressed; the
    // pointer must not contradict it one line later.
    expect(out).not.toContain('Import rules are clean');
    expect(out).toContain('No blocking import-rule violations (1 suppressed by baseline)');
  });
});
