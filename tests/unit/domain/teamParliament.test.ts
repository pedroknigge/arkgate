import { describe, expect, it } from 'vitest';
import {
  baselineKeysFromDocument,
  baselineRecordsDocument,
  canonicalStewardId,
  classifyBaselineKeyDelta,
  classifyChangeSet,
  evaluateTeamGate,
  formatVsBaseLine,
  isLawRelativePath,
  isSteward,
  mapPolicyClassToKind,
  parseCodeownersHandles,
  personaCheckBudget,
  resolveStewardHandle,
  suggestStewards,
} from '../../../src/domain/teamParliament';

describe('team parliament — law vs feature', () => {
  it('classifies constitution paths and mixed change sets', () => {
    expect(isLawRelativePath('ark.config.json')).toBe(true);
    expect(isLawRelativePath('arkrules/DomainModel.json')).toBe(true);
    expect(isLawRelativePath('.ark-baseline.json')).toBe(true);
    expect(isLawRelativePath('src/domain/foo.ts')).toBe(false);
    const mixed = classifyChangeSet(['ark.config.json', 'src/app.ts', 'README.md']);
    expect(mixed.mixed).toBe(true);
    expect(mixed.lawPaths).toEqual(['ark.config.json']);
    expect(mixed.productPaths).toEqual(['src/app.ts']);
  });

  it('denies mixed law+product even in a contract session', () => {
    const verdict = evaluateTeamGate({
      changeSet: classifyChangeSet(['ark.config.json', 'src/app.ts']),
      contractSession: true,
      stewards: ['pedroknigge'],
      author: 'pedroknigge',
    });
    expect(verdict.deny).toBe(true);
    expect(verdict.reasonId).toBe('mixed-law-and-product');
  });

  it('denies law files in a feature diff without --contract-session', () => {
    const verdict = evaluateTeamGate({
      changeSet: classifyChangeSet(['ark.config.json']),
      contractSession: false,
    });
    expect(verdict.reasonId).toBe('law-in-feature');
  });

  it('allows a steward contract-session loosen; rejects a non-steward grow', () => {
    const ok = evaluateTeamGate({
      changeSet: classifyChangeSet(['ark.config.json']),
      contractSession: true,
      policyKind: 'loosen',
      stewards: ['pedroknigge'],
      author: 'pedroknigge',
    });
    expect(ok.deny).toBe(false);
    const blocked = evaluateTeamGate({
      changeSet: classifyChangeSet(['.ark-baseline.json']),
      contractSession: true,
      baselineGrowCount: 2,
      stewards: ['pedroknigge'],
      author: 'agent-bot',
    });
    expect(blocked.reasonId).toBe('steward-only-baseline-grow');
  });

  it('maps policy-delta classes and baseline key grow/shrink', () => {
    expect(mapPolicyClassToKind('strengthening')).toBe('tighten');
    expect(mapPolicyClassToKind('weakening')).toBe('loosen');
    expect(mapPolicyClassToKind('judgment-required')).toBe('reclassify');
    const delta = classifyBaselineKeyDelta(['a|1'], ['a|1', 'b|2']);
    expect(delta.grow).toEqual(['b|2']);
    expect(delta.kinds).toContain('baseline-grow');
  });

  it('reads v1 arrays and v2 records; steward match ignores @ and case', () => {
    expect(baselineKeysFromDocument({ version: 1, violations: ['z', 'a'] })).toEqual(['a', 'z']);
    const doc = baselineRecordsDocument(['b', 'a'], 'note');
    expect(doc.version).toBe(2);
    expect(baselineKeysFromDocument(doc)).toEqual(['a', 'b']);
    expect(isSteward('@PedroKnigge', ['pedroknigge'])).toBe(true);
    expect(isSteward('pedroknigge@users.noreply.github.com', ['pedroknigge'])).toBe(true);
    expect(isSteward('pedroknigge', ['123+pedroknigge@users.noreply.github.com'])).toBe(true);
    expect(isSteward('pedro@example.com', ['pedro@example.com'])).toBe(true);
    expect(isSteward('Pedro Knigge', ['pedroknigge'])).toBe(false);
    expect(isSteward('other', ['pedroknigge'])).toBe(false);
    expect(canonicalStewardId('123+pedroknigge@users.noreply.github.com')).toBe('pedroknigge');
    expect(canonicalStewardId('Pedro Knigge')).toBeNull();
    expect(resolveStewardHandle({ gitName: 'Pedro Knigge' })).toBeNull();
    expect(resolveStewardHandle({ gitName: 'Pedro Knigge', authorEmail: 'pedroknigge@users.noreply.github.com' })).toBe(
      'pedroknigge'
    );
    expect(resolveStewardHandle({ githubActor: 'pedroknigge', gitName: 'Pedro Knigge' })).toBe('pedroknigge');
  });

  it('persona budgets and vs-base line stay advisory copy', () => {
    expect(personaCheckBudget('touch').scan).toBe('none');
    expect(personaCheckBudget('contributor').scan).toBe('changed');
    expect(personaCheckBudget('agent').scan).toBe('changed+ungoverned');
    expect(personaCheckBudget('steward').contractDiff).toBe(true);
    expect(
      formatVsBaseLine({
        baseRef: 'origin/dev',
        pinLocal: '4.5.7',
        pinBase: '4.6.0',
        contractEqual: false,
        baselineGrew: true,
      })
    ).toBe(
      'vs origin/dev: pin local 4.5.7 ≠ pin of base 4.6.0 · contract local ≠ contract of base · baseline local grew'
    );
  });

  it('proposes stewards from CODEOWNERS or git authors and asks — never invents', () => {
    expect(parseCodeownersHandles('# none\n* @pedroknigge @Amarilla-David\n')).toEqual([
      'pedroknigge',
      'amarilla-david',
    ]);
    const nudge = suggestStewards({
      existingStewards: [],
      gitAuthors: ['Alice', 'dependabot[bot]', 'Bob'],
      codeowners: [],
    });
    expect(nudge.needsStewards).toBe(true);
    expect(nudge.proposed).toEqual(['alice', 'bob']);
    expect(nudge.ask).toMatch(/Add @alice, @bob/);
    expect(nudge.notAScore).toBe(true);
    const owned = suggestStewards({
      existingStewards: [],
      gitAuthors: ['Alice', 'Bob'],
      codeowners: ['pedroknigge'],
    });
    expect(owned.source).toBe('codeowners');
    expect(owned.proposed).toEqual(['pedroknigge']);
    const stillListed = suggestStewards({
      existingStewards: ['pedroknigge'],
      gitAuthors: ['Alice', 'Bob'],
    });
    expect(stillListed.needsStewards).toBe(false);
    expect(stillListed.drift).toBe(true);
    expect(stillListed.ask).toMatch(/started with 1 steward/);
    const ownersAhead = suggestStewards({
      existingStewards: ['pedroknigge'],
      gitAuthors: ['pedroknigge'],
      codeowners: ['pedroknigge', 'Amarilla-David'],
    });
    expect(ownersAhead.drift).toBe(true);
    expect(ownersAhead.missingFromList).toEqual(['amarilla-david']);
    expect(ownersAhead.ask).toMatch(/CODEOWNERS is ahead/);
    expect(
      suggestStewards({
        existingStewards: ['pedroknigge', 'amarilla-david'],
        gitAuthors: ['pedroknigge', 'amarilla-david'],
        codeowners: ['pedroknigge', 'Amarilla-David'],
      }).drift
    ).toBe(false);
    const namesOnly = suggestStewards({
      existingStewards: [],
      gitAuthors: ['Pedro Knigge', 'David Amarilla'],
    });
    expect(namesOnly.needsStewards).toBe(true);
    expect(namesOnly.proposed).toEqual([]);
    expect(namesOnly.ask).toMatch(/GitHub handles or emails/);
    const fromMail = suggestStewards({
      existingStewards: [],
      gitAuthors: ['123+pedroknigge@users.noreply.github.com', 'david@example.com'],
    });
    expect(fromMail.proposed).toEqual(['pedroknigge', 'david@example.com']);
  });
});
