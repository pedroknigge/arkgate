/**
 * Diff-scoped checks (`--changed`, `--local`, `--against`, `--persona`) must never go green
 * over a change set they failed to compute: monorepo sub-package paths, non-ASCII names,
 * truncated git listings, and a missing base ref all fail closed or scan the real files.
 * `--update-baseline` must never rewrite the baseline from a changed-files subset.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  effectiveBaselineName,
  parseArgs,
  UPDATE_BASELINE_SCOPE_MESSAGE,
} from '../../../bin/lib/check-args.mjs';
import {
  GIT_MAX_BUFFER,
  gitShowText,
  listChangedPaths,
  rootRelativeGitPath,
} from '../../../bin/lib/git-change-scope.mjs';
import { pruneScopedPatternWarnings, runTeamPreflight } from '../../../bin/lib/team-parliament-io.mjs';
import { resolveStatusNextAction } from '../../../bin/lib/status-manifest.mjs';

const arkCheck = path.resolve('bin/ark-check.mjs');
const arkCli = path.resolve('bin/ark.mjs');
const temps: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.invalid',
};
const FORBIDDEN = "import { db } from '../infra/db';\nexport const x = db;\n";

function mk(prefix = 'ark-changed-scope-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function git(cwd: string, args: string[]) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function writePackage(root: string, violatingDomainFiles = 0) {
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      schemaVersion: '1.3',
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    })
  );
  fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
  fs.writeFileSync(path.join(root, 'src/domain/clean.ts'), 'export const clean = 1;\n');
  for (let i = 1; i <= violatingDomainFiles; i += 1) {
    fs.writeFileSync(path.join(root, `src/domain/m${i}.ts`), FORBIDDEN);
  }
}

function initRepo(top: string, branch = 'main') {
  git(top, ['init', '-q', '-b', branch]);
  git(top, ['add', '-A']);
  git(top, ['commit', '-qm', 'init']);
}

/** The test's git repo is the only base source: CI's own env must not leak in. */
function hostNeutralEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const leaks = ['CI', 'GITHUB_ACTIONS', 'GITHUB_BASE_REF', 'GITHUB_HEAD_REF', 'GITHUB_REF'];
  for (const key of [...leaks, 'GITHUB_EVENT_NAME', 'GITHUB_ACTOR', 'ARK_POLICY_BASE_REF']) delete env[key];
  return env;
}

function check(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [arkCheck, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...hostNeutralEnv(), ...GIT_ENV, ARK_NO_OPEN_REPORT: '1', ARK_CHECK_LOCAL: '', ...env },
  });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
}

function violationCount(out: string): number {
  return (out.match(/LAYER_IMPORT_VIOLATION|DomainModel must not import/g) ?? []).length;
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('diff-scoped checks: monorepo sub-package paths', () => {
  it('--changed / --local / --against see committed, staged and unstaged edits under a sub-package root', () => {
    const top = mk();
    const app = path.join(top, 'packages/app');
    fs.mkdirSync(app, { recursive: true });
    writePackage(app);
    fs.writeFileSync(path.join(top, 'outside.ts'), 'export const o = 1;\n');
    initRepo(top);
    git(top, ['checkout', '-qb', 'feat']);
    fs.writeFileSync(path.join(app, 'src/domain/committed.ts'), FORBIDDEN);
    git(top, ['add', '-A']);
    git(top, ['commit', '-qm', 'committed']);
    fs.writeFileSync(path.join(app, 'src/domain/staged.ts'), FORBIDDEN);
    git(top, ['add', '-A']);
    fs.appendFileSync(path.join(app, 'src/domain/clean.ts'), FORBIDDEN);
    fs.appendFileSync(path.join(top, 'outside.ts'), '// outside the package\n');

    const listed = listChangedPaths(app, 'main');
    expect(listed.ok).toBe(true);
    expect(listed.paths).toEqual([
      'src/domain/clean.ts',
      'src/domain/committed.ts',
      'src/domain/staged.ts',
    ]);

    const full = check(app, []);
    expect(full.code).toBe(1);
    for (const flags of [['--changed', '--base', 'main'], ['--local', '--base', 'main'], ['--against', 'main', '--changed']]) {
      const scoped = check(app, flags);
      expect(scoped.code, flags.join(' ')).toBe(1);
      expect(scoped.out).toMatch(/3 violation\(s\)/);
      expect(scoped.out).not.toMatch(/CONFIG_LAYER_PATTERN_NO_MATCHES/);
    }
    const raw = check(app, ['--changed', '--base', 'main', '--json']).out;
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    expect(json.teamParliament?.changeSet?.productPaths).toEqual([
      'src/domain/clean.ts',
      'src/domain/committed.ts',
      'src/domain/staged.ts',
    ]);
  });

  it('reads the base baseline and config from the sub-package, not the repo top level', () => {
    const top = mk();
    const app = path.join(top, 'packages/app');
    fs.mkdirSync(app, { recursive: true });
    writePackage(app, 2);
    git(top, ['init', '-q', '-b', 'main']);
    expect(check(app, ['--update-baseline', '--contract-session', '--force']).code).toBe(0);
    git(top, ['add', '-A']);
    git(top, ['commit', '-qm', 'freeze']);
    git(top, ['checkout', '-qb', 'feat']);
    fs.writeFileSync(path.join(app, 'src/domain/k.ts'), 'export const k = 1;\n');
    git(top, ['add', '-A']);
    git(top, ['commit', '-qm', 'clean change']);

    expect(gitShowText(app, 'main', '.ark-baseline.json')).toContain('"');
    expect(gitShowText(app, 'main', path.join(app, 'ark.config.json'))).toContain('DomainModel');
    expect(gitShowText(app, 'main', '../outside.json')).toBeNull();

    const against = check(app, ['--against', 'main', '--json']);
    expect(against.code).toBe(0);
    const body = JSON.parse(against.out.slice(against.out.indexOf('{'), against.out.lastIndexOf('}') + 1));
    expect(body.ok).toBe(true);
    expect(body.teamParliament.baselineGrow).toBe(0);
    expect(body.teamParliament.deny).toBe(false);
    expect(body.suppressedViolations).toBe(2);
    expect(body.teamParliament.changeSet.productPaths).toEqual(['src/domain/k.ts']);

    // design-delta reads base blobs the same root-relative way (`<commit>:./<path>`).
    const delta = check(app, ['--fail-on-new-smells', '--base-ref', 'main', '--baseline']);
    expect(delta.out).not.toMatch(/Design delta unavailable/);
    expect(delta.code).toBe(0);
  });
});

describe('diff-scoped checks: git listing fails closed', () => {
  it('catches non-ASCII, quoted and spaced file names (core.quotePath)', () => {
    const root = mk();
    writePackage(root);
    initRepo(root);
    fs.writeFileSync(path.join(root, 'src/domain/señal.ts'), FORBIDDEN);
    fs.writeFileSync(path.join(root, 'src/domain/with space.ts'), FORBIDDEN);
    fs.writeFileSync(path.join(root, 'src/domain/quo"te.ts'), FORBIDDEN);
    expect(listChangedPaths(root, 'HEAD').paths).toEqual(
      expect.arrayContaining(['src/domain/señal.ts', 'src/domain/with space.ts', 'src/domain/quo"te.ts'])
    );
    const untracked = check(root, ['--changed', '--base', 'HEAD']);
    expect(untracked.code).toBe(1);
    expect(untracked.out).toMatch(/3 violation\(s\)/);
    git(root, ['add', '-A']);
    const staged = check(root, ['--local', '--base', 'HEAD']);
    expect(staged.code).toBe(1);
    expect(staged.out).toMatch(/3 violation\(s\)/);
  });

  it('does not drop files when the untracked listing is larger than the default spawn buffer', () => {
    expect(GIT_MAX_BUFFER).toBeGreaterThanOrEqual(64 * 1024 * 1024);
    const root = mk();
    writePackage(root);
    initRepo(root);
    const bulk = path.join(root, 'assets/generated_fixture_data_directory_name_that_is_long');
    fs.mkdirSync(bulk, { recursive: true });
    for (let i = 0; i < 20000; i += 1) fs.writeFileSync(path.join(bulk, `generated-${i}.txt`), '');
    fs.writeFileSync(path.join(root, 'src/domain/new.ts'), FORBIDDEN);
    const result = check(root, ['--changed', '--base', 'HEAD']);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/1 violation\(s\)/);
  }, 60_000);

  it('turns any failed git listing into an error, never an empty diff', () => {
    const notRepo = mk();
    const listed = listChangedPaths(notRepo, 'HEAD');
    expect(listed.ok).toBe(false);
    expect(listed.paths).toEqual([]);
  });
});

describe('diff-scoped checks: missing base ref', () => {
  it('--changed / --persona without a resolvable base halt with exit 2 (changed-needs-base)', () => {
    const halted = runTeamPreflight({
      root: '/tmp',
      args: { changed: true },
      config: {},
      policyDelta: null,
      teamBase: undefined,
    });
    expect(halted.halt?.exitCode).toBe(2);
    expect(halted.teamParliament).toMatchObject({ reasonId: 'changed-needs-base', deny: false });
    const persona = runTeamPreflight({
      root: '/tmp',
      args: { changed: true, persona: 'agent' },
      config: {},
      policyDelta: null,
      teamBase: undefined,
    });
    expect(persona.halt?.message).toMatch(/--persona agent needs a git merge base/);
  });

  it('trunk-only repo and a non-git directory exit 2; --base trunk still finds the violation', () => {
    const trunk = mk();
    writePackage(trunk);
    initRepo(trunk, 'trunk');
    fs.writeFileSync(path.join(trunk, 'src/domain/new.ts'), FORBIDDEN);
    for (const flags of [['--changed'], ['--persona', 'agent'], ['--changed', '--json']]) {
      const result = check(trunk, flags);
      expect(result.code, flags.join(' ')).toBe(2);
      expect(result.out).not.toMatch(/Ark check passed/);
    }
    expect(check(trunk, ['--changed', '--base', 'trunk']).code).toBe(1);

    const plain = mk();
    writePackage(plain);
    fs.writeFileSync(path.join(plain, 'src/domain/new.ts'), FORBIDDEN);
    const outside = check(plain, ['--changed']);
    expect(outside.code).toBe(2);
    expect(outside.out).toMatch(/needs a git merge base/);
  });

  it('--contract-diff / --persona steward without a base exit 2 with an actionable reason', () => {
    const halted = runTeamPreflight({
      root: '/tmp',
      args: { contractDiff: true, persona: 'steward' },
      config: {},
      policyDelta: null,
      teamBase: undefined,
    });
    expect(halted.halt?.exitCode).toBe(2);
    expect(halted.teamParliament).toMatchObject({ reasonId: 'contract-diff-needs-base', deny: false });
    expect(halted.halt?.message).toMatch(/--persona steward .*Pass --base <ref>/);

    const trunk = mk();
    writePackage(trunk);
    initRepo(trunk, 'trunk');
    for (const flags of [['--persona', 'steward'], ['--contract-diff']]) {
      const result = check(trunk, [...flags, '--json']);
      expect(result.code, flags.join(' ')).toBe(2);
      const json = JSON.parse(result.out.slice(result.out.indexOf('{'), result.out.lastIndexOf('}') + 1));
      expect(json.ok).toBe(false);
      expect(json.teamParliament.reasonId).toBe('contract-diff-needs-base');
      expect(json.teamParliament.message).toMatch(/--base <ref>/);
    }
    // A CI base ref this checkout cannot read still answers --json with JSON (exit 2).
    const unreadable = check(trunk, ['--persona', 'steward', '--json'], { GITHUB_BASE_REF: 'main' });
    expect(unreadable.code).toBe(2);
    const body = unreadable.out.slice(unreadable.out.indexOf('{'), unreadable.out.lastIndexOf('}') + 1);
    expect(JSON.parse(body)).toMatchObject({ ok: false, error: 'POLICY_BASE_UNREADABLE' });
    // With a base, the clean steward run passes and the explicit diff is not a false baseline-grow.
    expect(check(trunk, ['--persona', 'steward', '--base', 'trunk']).code).toBe(0);
    expect(check(trunk, ['--contract-diff', '--base', 'trunk']).code).toBe(0);
  });

  it('a failed listing against an explicit bad ref is exit 2, never labelled ok', () => {
    const root = mk();
    writePackage(root);
    initRepo(root);
    const halted = runTeamPreflight({
      root,
      args: { changed: true },
      config: {},
      policyDelta: null,
      teamBase: 'no-such-ref',
    });
    expect(halted.halt?.exitCode).toBe(2);
    expect(halted.teamParliament).toMatchObject({ reasonId: 'changed-paths-unavailable', deny: false });
    expect(halted.halt?.message).toMatch(/Pass --base <ref>/);
    const result = check(root, ['--changed', '--base', 'no-such-ref']);
    expect(result.code).toBe(2);
    expect(result.out).not.toMatch(/Ark check passed/);
  });

  it('a local master branch with no remote is discovered as the base', () => {
    const root = mk();
    writePackage(root);
    initRepo(root, 'master');
    fs.writeFileSync(path.join(root, 'src/domain/new.ts'), FORBIDDEN);
    git(root, ['add', '-A']);
    expect(check(root, ['--changed']).code).toBe(1);
    expect(check(root, ['--persona', 'agent']).code).toBe(1);
  });
});

describe('--update-baseline never truncates under a changed-files scope', () => {
  it('refuses --changed / --local and ignores ARK_CHECK_LOCAL=1', () => {
    expect(() => parseArgs(['node', 'ark-check', '--changed', '--update-baseline'], {})).toThrow(
      UPDATE_BASELINE_SCOPE_MESSAGE
    );
    expect(() => parseArgs(['node', 'ark-check', '--local', '--update-baseline'], {})).toThrow(
      UPDATE_BASELINE_SCOPE_MESSAGE
    );
    const fromEnv = parseArgs(['node', 'ark-check', '--update-baseline'], { ARK_CHECK_LOCAL: '1' });
    expect(fromEnv.changed).not.toBe(true);
    expect(fromEnv.local).not.toBe(true);

    const root = mk();
    writePackage(root, 3);
    git(root, ['init', '-q', '-b', 'main']);
    expect(check(root, ['--update-baseline', '--contract-session', '--force']).code).toBe(0);
    git(root, ['add', '-A']);
    git(root, ['commit', '-qm', 'freeze']);
    const keysBefore = Object.keys(JSON.parse(fs.readFileSync(path.join(root, '.ark-baseline.json'), 'utf8'))).length;
    fs.writeFileSync(path.join(root, 'src/domain/m8.ts'), FORBIDDEN);

    const envRun = check(root, ['--update-baseline', '--contract-session', '--force', '--base', 'HEAD'], {
      ARK_CHECK_LOCAL: '1',
    });
    expect(envRun.code).toBe(0);
    expect(envRun.out).toMatch(/with 4 frozen violation key/);
    expect(check(root, ['--baseline']).code).toBe(0);

    for (const flags of [['--changed', '--base', 'main'], ['--local', '--base', 'main']]) {
      const refused = check(root, [...flags, '--update-baseline', '--contract-session', '--force']);
      expect(refused.code, flags.join(' ')).not.toBe(0);
      expect(refused.out).toMatch(/--update-baseline cannot be combined with a changed-files scope/);
    }
    expect(check(root, ['--baseline']).code).toBe(0);
    expect(keysBefore).toBeGreaterThan(0);
  });
});

describe('report / status / doctor agree on the committed baseline', () => {
  it('effectiveBaselineName applies .ark-baseline.json to --report only', () => {
    const yes = () => true;
    const no = () => false;
    expect(effectiveBaselineName({ baseline: 'x.json' }, '/r', no)).toBe('x.json');
    expect(effectiveBaselineName({ report: 'r.html' }, '/r', yes)).toBe('.ark-baseline.json');
    expect(effectiveBaselineName({ report: 'r.html' }, '/r', no)).toBeNull();
    expect(effectiveBaselineName({ report: 'r.html', against: 'main' }, '/r', yes)).toBeNull();
    // A merge verdict never inherits the implicit freeze through a reporting flag.
    expect(effectiveBaselineName({ report: 'r.html', strictMerge: true }, '/r', yes)).toBeNull();
    expect(effectiveBaselineName({ report: 'r.html', contractDiff: true }, '/r', yes)).toBeNull();
    expect(effectiveBaselineName({ report: 'r.html', strictMerge: true, baseline: 'b.json' }, '/r', yes)).toBe(
      'b.json'
    );
    expect(effectiveBaselineName({}, '/r', yes)).toBeNull();
  });

  it('--report without --baseline suppresses frozen debt, so status does not ask to fix it', () => {
    const root = mk();
    writePackage(root, 3);
    git(root, ['init', '-q', '-b', 'main']);
    expect(check(root, ['--update-baseline', '--contract-session', '--force']).code).toBe(0);
    git(root, ['add', '-A']);
    git(root, ['commit', '-qm', 'freeze']);
    const report = check(root, ['--report', 'ark-report.html']);
    expect(report.code).toBe(0);
    const latest = JSON.parse(fs.readFileSync(path.join(root, '.ark/reports/latest.json'), 'utf8'));
    expect(JSON.stringify(latest)).not.toMatch(/"verdict":\s*"fail"/);
    const status = spawnSync(process.execPath, [arkCli, 'status', '--root', root], {
      encoding: 'utf8',
      env: hostNeutralEnv(),
    });
    expect(status.stdout).toMatch(/lastCheck: pass/);
    expect(status.stdout).not.toMatch(/fix-active-violations/);
    // A plain check without --baseline still fails: the CI / exit-code contract is unchanged.
    expect(check(root, []).code).toBe(1);
    // Adding --report to a merge verdict must not flip it green via the implicit freeze.
    expect(check(root, ['--install-agent-gates']).code).toBe(0);
    for (const flags of [['--strict-merge'], ['--strict']]) {
      const merge = check(root, [...flags, '--report', 'ark-report.html']);
      expect(merge.code, flags.join(' ')).toBe(1);
      expect(merge.out).not.toMatch(/suppressed by baseline/);
    }
    expect(check(root, ['--strict-merge', '--report', 'ark-report.html', '--baseline']).code).toBe(0);
  });

  it('status next actions name the only command that refreshes the snapshot', () => {
    const facts = { resolvedConfigPath: 'ark.config.json' };
    const binding = { status: 'matched' };
    for (const lastCheck of [
      { verdict: 'fail', activeViolations: 2 },
      { verdict: null, at: null },
      { verdict: 'incomplete' },
    ]) {
      const next = resolveStatusNextAction(facts, binding, {}, lastCheck, []);
      expect(next.summary).toMatch(/ark-check --report/);
      expect(next.summary).not.toMatch(/\(or (ark-check )?--doctor\)/);
    }
  });
});

describe('--changed layer-pattern warnings use the full governed tree', () => {
  it('drops a no-match warning when the full tree matches, keeps a real typo', () => {
    const root = mk();
    writePackage(root);
    const warnings = [
      { ruleId: 'CONFIG_LAYER_PATTERN_NO_MATCHES', pattern: 'src/infra/**', layer: 'PersistenceAdapters' },
      { ruleId: 'CONFIG_LAYER_PATTERN_NO_MATCHES', pattern: 'src/infrr/**', layer: 'Typo' },
      { ruleId: 'OTHER', message: 'kept' },
    ];
    let walked = 0;
    pruneScopedPatternWarnings(warnings, root, () => {
      walked += 1;
      return [path.join(root, 'src/infra/db.ts'), path.join(root, 'src/domain/clean.ts')];
    });
    expect(walked).toBe(1);
    expect(warnings.map((w) => w.pattern ?? w.ruleId)).toEqual(['src/infrr/**', 'OTHER']);
    const untouched = [{ ruleId: 'OTHER' }];
    pruneScopedPatternWarnings(untouched, root, () => {
      throw new Error('must stay lazy');
    });
    expect(untouched).toHaveLength(1);

    initRepo(root);
    fs.appendFileSync(path.join(root, 'src/domain/clean.ts'), '// touched\n');
    const scoped = check(root, ['--changed', '--base', 'HEAD']);
    expect(scoped.code).toBe(0);
    expect(scoped.out).not.toMatch(/CONFIG_LAYER_PATTERN_NO_MATCHES/);
    expect(rootRelativeGitPath(root, path.join(root, 'a/b.json'))).toBe('a/b.json');
  });
});
