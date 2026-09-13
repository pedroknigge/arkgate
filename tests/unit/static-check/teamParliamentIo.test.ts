/**
 * Team parliament I/O helpers — cover the Tooling surface that domain tests do not hit.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeSemanticGateArtifacts } from '../../helpers/semanticGateArtifacts';
// eslint-disable-next-line -- runtime .mjs under test
import {
  applyPersonaDefaults,
  arkgatePinFromPackageJson,
  bindTeamBaseRefs,
  adoptAgeDaysFromGit,
  collectStewardNudge,
  contractSessionFrom,
  filterChangedGovernedFiles,
  readJsonMaybe,
  resolveTeamAuthor,
  safeGitRef,
  runTeamPreflight,
  teamCheckRequested,
  teamStewardsFromConfig,
  ungovernedDumpMessage,
} from '../../../bin/lib/team-parliament-io.mjs';

const temps: string[] = [];

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...env },
  });
}

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-tw-io-'));
  temps.push(root);
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'pedroknigge@users.noreply.github.com']);
  git(root, ['config', 'user.name', 'pedroknigge']);
  fs.writeFileSync(path.join(root, 'README.md'), 'hi\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'init']);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('team parliament I/O', () => {
  it('validates refs, session env, author identity, and JSON/pin bags', () => {
    expect(safeGitRef('origin/dev')).toBe(true);
    expect(safeGitRef('../escape')).toBe(false);
    expect(safeGitRef('')).toBe(false);
    expect(contractSessionFrom({}, {})).toBe(false);
    expect(contractSessionFrom({ contractSession: true }, {})).toBe(true);
    expect(contractSessionFrom({}, { ARK_CONTRACT_SESSION: '1' })).toBe(true);
    expect(resolveTeamAuthor({ author: 'pedroknigge' }, {})).toBe('pedroknigge');
    expect(resolveTeamAuthor({}, { GITHUB_ACTOR: 'pedroknigge' })).toBe('pedroknigge');
    expect(resolveTeamAuthor({}, { GIT_AUTHOR_EMAIL: 'pedroknigge@users.noreply.github.com' })).toBe(
      'pedroknigge'
    );
    expect(resolveTeamAuthor({}, { GIT_AUTHOR_NAME: 'Pedro Knigge' })).toBeNull();
    expect(readJsonMaybe('')).toBeNull();
    expect(readJsonMaybe('{')).toBeNull();
    expect(readJsonMaybe('{"a":1}')).toEqual({ a: 1 });
    expect(arkgatePinFromPackageJson({ devDependencies: { arkgate: '^4.6.1' } })).toBe('^4.6.1');
    expect(arkgatePinFromPackageJson({ name: 'arkgate', version: '4.6.1' })).toBe('4.6.1');
    expect(arkgatePinFromPackageJson({})).toBeNull();
  });

  it('applies persona defaults and only locks --strict-merge when stewards exist', () => {
    expect(applyPersonaDefaults({ persona: 'contributor' }).changed).toBe(true);
    expect(applyPersonaDefaults({ persona: 'steward' }).contractSession).toBe(true);
    expect(applyPersonaDefaults({ persona: 'nope' }).changed).toBeUndefined();
    expect(teamStewardsFromConfig({ stewards: ['pedroknigge', 1] })).toEqual(['pedroknigge']);
    expect(teamCheckRequested({ strictMerge: true }, {})).toBe(false);
    expect(teamCheckRequested({ strictMerge: true }, { stewards: ['pedroknigge'] })).toBe(true);
    expect(teamCheckRequested({ changed: true }, {})).toBe(true);
    expect(teamCheckRequested({ updateBaseline: true }, {})).toBe(true);
  });

  it('LC01 --local without a resolvable base exits 2 (local-needs-base)', () => {
    const halted = runTeamPreflight({
      root: '/tmp',
      args: { local: true, changed: true },
      config: {},
      policyDelta: null,
      teamBase: undefined,
    });
    expect(halted.halt?.exitCode).toBe(2);
    expect(halted.halt?.message).toMatch(/--local needs a git merge base/);
    expect(halted.teamParliament).toMatchObject({ reasonId: 'local-needs-base', deny: false });
  });

  it('LC01 --local with a base reuses --changed (cheap, teamBase, bad/invalid ref)', () => {
    const root = mkRepo();
    const cheap = runTeamPreflight({
      root,
      args: { local: true, changed: true, against: 'HEAD' },
      config: {},
      policyDelta: null,
      teamBase: undefined,
    });
    expect(cheap.halt?.exitCode).toBe(0);
    expect(cheap.halt?.cheap).toBe(true);
    expect(cheap.teamParliament?.reasonId).not.toBe('local-needs-base');

    const viaTeamBase = runTeamPreflight({
      root,
      args: { local: true, changed: true },
      config: {},
      policyDelta: null,
      teamBase: 'HEAD',
    });
    expect(viaTeamBase.halt?.cheap).toBe(true);
    expect(viaTeamBase.teamParliament?.baseRef).toBe('HEAD');

    const unresolved = runTeamPreflight({
      root,
      args: { local: true, changed: true, against: 'definitely-not-a-ref' },
      config: {},
      policyDelta: null,
      teamBase: undefined,
    });
    expect(unresolved.halt?.exitCode).toBe(2);
    expect(unresolved.teamParliament?.changedPathError).toMatch(/Cannot resolve git ref/);

    const invalid = runTeamPreflight({
      root,
      args: { local: true, changed: true, against: '../escape' },
      config: {},
      policyDelta: null,
      teamBase: undefined,
    });
    expect(invalid.halt?.exitCode).toBe(2);
    expect(invalid.teamParliament?.changedPathError).toMatch(/Invalid or missing git base ref/);

    const bound = bindTeamBaseRefs({ local: true, changed: true, base: 'HEAD' }, root);
    expect(bound.teamBase).toBe('HEAD');
    expect(bound.args.against).toBe('HEAD');
    expect(bound.args.policyBaseRef).toBe('HEAD');

    expect(teamCheckRequested({ contractDiff: true }, {})).toBe(true);
    expect(teamCheckRequested({ against: 'HEAD' }, {})).toBe(true);
    expect(teamCheckRequested({ persona: 'contributor' }, {})).toBe(true);
    expect(teamCheckRequested({ contractSession: true }, {})).toBe(true);

    const noLocalNoBase = runTeamPreflight({
      root,
      args: { updateBaseline: true },
      config: {},
      policyDelta: null,
      teamBase: undefined,
    });
    expect(noLocalNoBase.halt).toBeNull();
    expect(noLocalNoBase.teamParliament?.baseRef).toBeUndefined();
  });

  it('runTeamPreflight covers skip, weakening, dirty local, and mixed-law deny', () => {
    const skipped = runTeamPreflight({
      root: '/tmp',
      args: {},
      config: {},
      policyDelta: null,
      teamBase: null,
    });
    expect(skipped.halt).toBeNull();
    expect(skipped.teamParliament).toBeNull();

    const weakened = runTeamPreflight({
      root: '/tmp',
      args: { changed: true },
      config: {},
      policyDelta: { classification: 'weakening' },
      teamBase: 'HEAD',
    });
    expect(weakened.halt?.exitCode).toBe(1);
    expect(weakened.teamParliament).toMatchObject({ reasonId: 'steward-only-loosen' });

    const judged = runTeamPreflight({
      root: '/tmp',
      args: { changed: true },
      config: {},
      policyDelta: { classification: 'judgment-required' },
      teamBase: 'HEAD',
    });
    expect(judged.halt?.exitCode).toBe(1);
    expect(judged.teamParliament).toMatchObject({ reasonId: 'steward-only-loosen' });

    const root = mkRepo();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app.ts'), 'export const app = 1;\n');
    const dirty = runTeamPreflight({
      root,
      args: { local: true, changed: true, against: 'HEAD' },
      config: {},
      policyDelta: { classification: 'additive' },
      teamBase: 'HEAD',
    });
    expect(dirty.halt).toBeNull();
    expect(dirty.changedPaths.some((p) => p.endsWith('src/app.ts') || p === 'src/app.ts')).toBe(true);

    fs.writeFileSync(path.join(root, '.ark-baseline.json'), '{}\n');
    const mixed = runTeamPreflight({
      root,
      args: { local: true, changed: true, against: 'HEAD', baseline: '.ark-baseline.json' },
      config: {},
      policyDelta: { classification: 'additive' },
      teamBase: 'HEAD',
    });
    expect(mixed.halt?.exitCode).toBe(1);
    expect(mixed.teamParliament).toMatchObject({ reasonId: 'mixed-law-and-product' });
  });

  it('does not treat plain --strict-merge as an explicit policy-base ref', () => {
    const root = mkRepo();
    const { args, teamBase } = bindTeamBaseRefs({ strictMerge: true }, root);
    expect(teamBase).toBe('main');
    expect(args.policyBaseRef).toBeUndefined();
    expect(args.against).toBeUndefined();
    const changed = bindTeamBaseRefs({ changed: true }, root);
    expect(changed.args.against).toBe('main');
    expect(changed.args.policyBaseRef).toBe('main');
  });

  it('filters changed files, dumps ungoverned names, and nudges stewards', () => {
    const root = mkRepo();
    fs.writeFileSync(path.join(root, 'CODEOWNERS'), '* @alice\n');
    const nudge = collectStewardNudge(root, {});
    expect(nudge.notAScore).toBe(true);
    expect(nudge.needsStewards || nudge.ask).toBeTruthy();
    expect(ungovernedDumpMessage(['a.ts', 'b.ts'])).toMatch(/a\.ts, b\.ts/);
    const files = [path.join(root, 'src/a.ts'), path.join(root, 'src/b.ts')];
    expect(
      filterChangedGovernedFiles(files, root, ['src/a.ts'], (rel: string) => rel.replace(/\\/g, '/'))
    ).toEqual([files[0]]);
    expect(filterChangedGovernedFiles(files, root, [], (rel: string) => rel)).toEqual(files);
  });

  it('collectStewardNudge skips git probes when the tree is not a repo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-tw-nongit-'));
    temps.push(root);
    const nudge = collectStewardNudge(root, {});
    expect(nudge.notAScore).toBe(true);
    expect(adoptAgeDaysFromGit(root, 'ark.config.json', new Date('2026-08-22T00:00:00Z'))).toEqual({
      days: null,
      source: 'unavailable',
    });
  });

  it('collectStewardNudge uses git first-add vs injected now for empty-stewards grace', () => {
    const root = mkRepo();
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [], rules: [] })
    );
    git(root, ['add', 'ark.config.json']);
    git(root, ['commit', '-m', 'add contract'], {
      GIT_AUTHOR_DATE: '2026-07-22T00:00:00+00:00',
      GIT_COMMITTER_DATE: '2026-07-22T00:00:00+00:00',
    });
    const nudge = collectStewardNudge(root, {}, { now: new Date('2026-08-22T00:00:00Z') });
    expect(nudge.emptyStewardsPastGrace).toBe(true);
    expect(nudge.needsStewards).toBe(true);
    expect(nudge.ask).toMatch(/No stewards listed|several people/);
  });

  it('T4 valid policy-ack without --contract-session exits 1; session plus ack is valid', () => {
    const root = mkRepo();
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
    const base = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
      dynamicImportAllowlist: [] as string[],
    };
    fs.writeFileSync(path.join(root, 'ark.config.json'), `${JSON.stringify(base, null, 2)}\n`);
    writeSemanticGateArtifacts(root);
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'base contract']);
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      `${JSON.stringify({ ...base, dynamicImportAllowlist: ['src/domain/dynamic.ts'] }, null, 2)}\n`
    );
    const blocked = spawnSync(
      process.execPath,
      [
        path.resolve('bin/ark-check.mjs'),
        '--root',
        root,
        '--json',
        '--no-cache',
        '--strict-merge',
        '--policy-base-ref',
        'HEAD',
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(blocked.status).toBe(1);
    const payload = JSON.parse(blocked.stdout);
    expect(payload.policyDelta.classification).toBe('weakening');
    fs.mkdirSync(path.join(root, '.ark'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.ark/policy-delta-ack.json'),
      `${JSON.stringify({
        schemaVersion: '1.0',
        basePolicyHash: payload.policyDelta.basePolicyHash,
        candidatePolicyHash: payload.policyDelta.candidatePolicyHash,
        findingIds: payload.policyDelta.blockingFindingIds,
        reason: 'Temporary loader while static imports are migrated.',
      })}\n`
    );
    const ackOnly = spawnSync(
      process.execPath,
      [
        path.resolve('bin/ark-check.mjs'),
        '--root',
        root,
        '--json',
        '--no-cache',
        '--strict-merge',
        '--policy-base-ref',
        'HEAD',
        '--policy-ack',
        '.ark/policy-delta-ack.json',
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(ackOnly.status).toBe(1);
    expect(`${ackOnly.stdout}${ackOnly.stderr}`).toMatch(/--contract-session/);
    const accepted = spawnSync(
      process.execPath,
      [
        path.resolve('bin/ark-check.mjs'),
        '--root',
        root,
        '--json',
        '--no-cache',
        '--strict-merge',
        '--policy-base-ref',
        'HEAD',
        '--policy-ack',
        '.ark/policy-delta-ack.json',
        '--contract-session',
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(JSON.parse(accepted.stdout).policyDelta).toMatchObject({
      valid: true,
      acknowledged: true,
    });
  });

  it('T5 --update-baseline without --contract-session exits 1 and does not write', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-tw-t5-'));
    temps.push(root);
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const order = db;\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      })
    );
    const denied = spawnSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--update-baseline'],
      { cwd: root, encoding: 'utf8' }
    );
    expect(denied.status).toBe(1);
    expect(`${denied.stdout}${denied.stderr}`).toMatch(/--contract-session/);
    expect(fs.existsSync(path.join(root, '.ark-baseline.json'))).toBe(false);
    const forced = spawnSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--update-baseline', '--force'],
      { cwd: root, encoding: 'utf8' }
    );
    expect(forced.status).toBe(1);
    expect(`${forced.stdout}${forced.stderr}`).toMatch(/--contract-session/);
    expect(fs.existsSync(path.join(root, '.ark-baseline.json'))).toBe(false);
    const written = spawnSync(
      process.execPath,
      [
        path.resolve('bin/ark-check.mjs'),
        '--root',
        root,
        '--update-baseline',
        '--contract-session',
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(written.status, written.stderr).toBe(0);
    expect(fs.existsSync(path.join(root, '.ark-baseline.json'))).toBe(true);
  });
});
