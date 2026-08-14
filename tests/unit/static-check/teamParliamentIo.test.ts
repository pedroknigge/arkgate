/**
 * Team parliament I/O helpers — cover the Tooling surface that domain tests do not hit.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// eslint-disable-next-line -- runtime .mjs under test
import {
  applyPersonaDefaults,
  arkgatePinFromPackageJson,
  bindTeamBaseRefs,
  collectStewardNudge,
  contractSessionFrom,
  filterChangedGovernedFiles,
  readJsonMaybe,
  resolveTeamAuthor,
  safeGitRef,
  teamCheckRequested,
  teamStewardsFromConfig,
  ungovernedDumpMessage,
} from '../../../bin/lib/team-parliament-io.mjs';

const temps: string[] = [];

function git(cwd: string, args: string[]) {
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: 'pipe' });
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
});
