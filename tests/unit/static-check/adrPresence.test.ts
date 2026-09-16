/**
 * Soft ADR / decision-note presence when --require-gates or adopted-strict
 * is on. Silent when the demand is off. Never a gate fail.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ADR_PRESENCE_ASK,
  ADR_PRESENCE_NEXT,
  collectAdrPresenceResidual,
  findAdrPresenceHome,
} from '../../../bin/lib/adr-presence.mjs';
import {
  ADR_PATH_ASK,
  ADR_PATH_NEXT,
  attachPolicyAdrNote,
  collectAdrPathResidual,
  isConventionalAdrPath,
  resolveAdrNotePath,
} from '../../../bin/lib/adr-path.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const temps: string[] = [];

function mk(prefix = 'ark-adr-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function writeGoverned(root: string) {
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/value.ts'), 'export const value = 1;\n');
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    })
  );
}

function writeNote(root: string, rel = 'docs/adr/0001-why.md') {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), '# Why we require gates\n');
}

function installGates(root: string) {
  execFileSync('node', [path.resolve('bin/ark-check.mjs'), '--root', root, '--install-agent-gates'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

describe('ADR presence helper', () => {
  it('is silent when gates are not demanded', () => {
    const root = mk();
    expect(findAdrPresenceHome(root)).toBeNull();
    expect(collectAdrPresenceResidual({ root, demanded: false })).toBeNull();
    expect(collectAdrPresenceResidual({ root })).toBeNull();
  });

  it('names a missing home only when demanded', () => {
    const root = mk();
    const residual = collectAdrPresenceResidual({ root, demanded: true });
    expect(residual?.missing).toBe(true);
    expect(residual?.ask).toBe(ADR_PRESENCE_ASK);
    expect(residual?.nextAction).toBe(ADR_PRESENCE_NEXT);
    expect(residual?.ask).not.toMatch(/Haken|ξ|xiHash/i);
  });

  it('treats an empty docs/adr folder as missing', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'docs/adr'), { recursive: true });
    expect(findAdrPresenceHome(root)).toBeNull();
    expect(collectAdrPresenceResidual({ root, demanded: true })?.missing).toBe(true);
  });

  it('accepts docs/adr, docs/decisions, or a root decision file', () => {
    const adr = mk();
    writeNote(adr);
    expect(findAdrPresenceHome(adr)).toBe('docs/adr');
    expect(collectAdrPresenceResidual({ root: adr, demanded: true })).toBeNull();

    const decisions = mk();
    writeNote(decisions, 'docs/decisions/note.md');
    expect(findAdrPresenceHome(decisions)).toBe('docs/decisions');

    const file = mk();
    writeNote(file, 'DECISIONS.md');
    expect(findAdrPresenceHome(file)).toBe('DECISIONS.md');
  });
});

describe('require-gates soft hint', () => {
  it('stays silent without --require-gates even when no note exists', () => {
    const root = mk('ark-adr-off-');
    writeGoverned(root);
    installGates(root);
    const human = execFileSync('node', [path.resolve('bin/ark-check.mjs'), '--root', root], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    expect(human).not.toContain(ADR_PRESENCE_ASK);
  });

  it('hints on --require-gates when no note exists, and stays green', () => {
    const root = mk('ark-adr-on-');
    writeGoverned(root);
    installGates(root);
    const human = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--require-gates'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(human).toContain('Ark gate artifacts found on disk');
    expect(human).toContain(ADR_PRESENCE_ASK);
    expect(human).toContain(ADR_PRESENCE_NEXT);
    expect(human).toMatch(/✔ Ark check passed/);

    const json = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--require-gates', '--json'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    const payload = JSON.parse(json) as { ok: boolean; warnings?: Array<{ ruleId: string }> };
    expect(payload.ok).toBe(true);
    expect((payload.warnings ?? []).map((row) => row.ruleId)).not.toContain('CONFIG_ADR_MISSING');
  });

  it('stays quiet on --require-gates once a short note exists', () => {
    const root = mk('ark-adr-have-');
    writeGoverned(root);
    installGates(root);
    writeNote(root);
    const human = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--require-gates'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(human).toContain('Ark gate artifacts found on disk');
    expect(human).not.toContain(ADR_PRESENCE_ASK);
  });
});

describe('doctor residual', () => {
  it('omits adrPresence unless require-gates or required-merge is on', () => {
    const root = mk('ark-adr-doc-');
    writeGoverned(root);
    const file = path.join(root, 'src/domain/value.ts');
    let silent:
      | { doctor?: { adrPresence?: { missing?: boolean } } }
      | undefined;
    runDoctor(root, JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')), [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        silent = JSON.parse(text);
      },
    });
    expect(silent?.doctor?.adrPresence).toBeUndefined();

    let demanded:
      | { doctor?: { adrPresence?: { missing?: boolean; nextAction?: string } } }
      | undefined;
    runDoctor(root, JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')), [file], [], [], true, {
      completeness: 'complete',
      requireGates: true,
      writeJson: (text: string) => {
        demanded = JSON.parse(text);
      },
    });
    expect(demanded?.doctor?.adrPresence?.missing).toBe(true);
    expect(demanded?.doctor?.adrPresence?.nextAction).toBe(ADR_PRESENCE_NEXT);

    writeNote(root);
    let present:
      | { doctor?: { adrPresence?: { missing?: boolean } } }
      | undefined;
    runDoctor(root, JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')), [file], [], [], true, {
      completeness: 'complete',
      requireGates: true,
      writeJson: (text: string) => {
        present = JSON.parse(text);
      },
    });
    expect(present?.doctor?.adrPresence).toBeUndefined();
  });
});

describe('ADR path on policy-ack', () => {
  it('accepts conventional homes and rejects escapes', () => {
    expect(isConventionalAdrPath('docs/adr/0001-why.md')).toBe(true);
    expect(isConventionalAdrPath('docs/decisions/note.md')).toBe(true);
    expect(isConventionalAdrPath('ADR.md')).toBe(true);
    expect(isConventionalAdrPath('../docs/adr/x.md')).toBe(false);
    expect(isConventionalAdrPath('README.md')).toBe(false);
    expect(isConventionalAdrPath('/tmp/note.md')).toBe(false);
  });

  it('is silent unless a weaken or new edge needs a note', () => {
    const root = mk();
    expect(collectAdrPathResidual({ root, needed: false, adrPath: undefined })).toBeNull();
    expect(collectAdrPathResidual({ root })).toBeNull();
    expect(collectAdrPathResidual({ root, needed: true })?.ask).toBe(ADR_PATH_ASK);
    expect(collectAdrPathResidual({ root, needed: true })?.nextAction).toBe(ADR_PATH_NEXT);
  });

  it('resolves a real note and residual when the path is missing', () => {
    const root = mk();
    writeNote(root);
    expect(resolveAdrNotePath(root, 'docs/adr/0001-why.md')).toBe('docs/adr/0001-why.md');
    expect(collectAdrPathResidual({ root, needed: true, adrPath: 'docs/adr/0001-why.md' })).toBeNull();
    expect(collectAdrPathResidual({ root, needed: true, adrPath: 'docs/adr/missing.md' })?.missing).toBe(
      true
    );
  });

  it('flips valid only on the fail-closed policy-ack plane', () => {
    const root = mk();
    writeNote(root);
    const result = {
      requiresAcknowledgement: true,
      valid: true,
      acknowledged: true,
    };
    expect(
      attachPolicyAdrNote(result, {
        root,
        acknowledgement: { reason: 'because' },
        failClosed: false,
      })
    ).toMatchObject({ valid: true, adrNote: { missing: true } });
    expect(
      attachPolicyAdrNote(result, {
        root,
        acknowledgement: { reason: 'because' },
        failClosed: true,
      })
    ).toMatchObject({ valid: false, adrNote: { missing: true } });
    expect(
      attachPolicyAdrNote(result, {
        root,
        acknowledgement: { reason: 'because', adrPath: 'docs/adr/0001-why.md' },
        failClosed: true,
      })
    ).toMatchObject({ valid: true, adrNote: { missing: false, path: 'docs/adr/0001-why.md' } });
    expect(attachPolicyAdrNote({ requiresAcknowledgement: false, valid: true }, { failClosed: true })).toEqual(
      { requiresAcknowledgement: false, valid: true }
    );
  });
});
