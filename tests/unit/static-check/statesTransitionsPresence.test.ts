/**
 * Soft states/transitions artifact guidance. Silent unless a conventional
 * domain (or dedicated states) doc is already in play. Never a gate fail.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  STATES_TRANSITIONS_ASK_INCOMPLETE,
  STATES_TRANSITIONS_ASK_MISSING,
  collectStatesTransitionsResidual,
  findStatesTransitionsHome,
  markdownHasStatesHeading,
  markdownHasStatesLink,
  markdownHasStatesTable,
} from '../../../bin/lib/states-transitions-presence.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const temps: string[] = [];

function mk(prefix = 'ark-st-'): string {
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

function writeDoc(root: string, rel: string, body: string) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
}

const TABLE = `| entity | states | allowed transitions |
| --- | --- | --- |
| Order | draft, paid | draft → paid |
`;

describe('states/transitions markdown sensors', () => {
  it('accepts the closed table and a single topic link', () => {
    expect(markdownHasStatesTable(TABLE)).toBe(true);
    expect(markdownHasStatesLink('See the [lifecycle map](./lifecycle.md).\n')).toBe(true);
    expect(markdownHasStatesHeading('## States\n\nTBD\n')).toBe(true);
    expect(markdownHasStatesTable('# Domain\n\nOrders exist.\n')).toBe(false);
    expect(markdownHasStatesLink('[readme](./README.md)\n')).toBe(false);
  });
});

describe('states/transitions presence helper', () => {
  it('is silent when no domain or dedicated home exists', () => {
    const root = mk();
    writeGoverned(root);
    expect(findStatesTransitionsHome(root)).toBeNull();
    expect(collectStatesTransitionsResidual({ root })).toBeNull();
    expect(collectStatesTransitionsResidual({})).toBeNull();
  });

  it('names a missing map when a domain doc has no table or link', () => {
    const root = mk();
    writeDoc(root, 'docs/domain.md', '# Domain\n\nOrders are the core bet.\n');
    const residual = collectStatesTransitionsResidual({ root });
    expect(findStatesTransitionsHome(root)).toBe('docs/domain.md');
    expect(residual?.kind).toBe('missing');
    expect(residual?.home).toBe('docs/domain.md');
    expect(residual?.ask).toBe(STATES_TRANSITIONS_ASK_MISSING);
    expect(residual?.nextAction).toContain('docs/domain.md');
    expect(residual?.nextAction).toMatch(/flag soup/i);
    expect(residual?.ask).not.toMatch(/Haken|ξ|xiHash/i);
    expect(residual?.nextAction).not.toMatch(/Haken|ξ|xiHash/i);
  });

  it('treats a States heading without a table or link as incomplete', () => {
    const root = mk();
    writeDoc(root, 'docs/domain.md', '# Domain\n\n## States\n\nTBD\n');
    const residual = collectStatesTransitionsResidual({ root });
    expect(residual?.kind).toBe('incomplete');
    expect(residual?.ask).toBe(STATES_TRANSITIONS_ASK_INCOMPLETE);
  });

  it('stays quiet once the table or a dedicated link exists', () => {
    const table = mk();
    writeDoc(table, 'docs/domain.md', `# Domain\n\n${TABLE}`);
    expect(collectStatesTransitionsResidual({ root: table })).toBeNull();

    const linked = mk();
    writeDoc(linked, 'docs/architecture.md', '# Architecture\n\nSee the [transitions](./billing-lifecycle.md).\n');
    expect(collectStatesTransitionsResidual({ root: linked })).toBeNull();

    const dedicated = mk();
    writeDoc(dedicated, 'docs/domain.md', '# Domain\n\nOrders.\n');
    writeDoc(dedicated, 'docs/states.md', TABLE);
    expect(collectStatesTransitionsResidual({ root: dedicated })).toBeNull();
  });
});

describe('doctor residual', () => {
  it('omits statesTransitions unless a domain doc is in play, then quiets after a table', () => {
    const root = mk('ark-st-doc-');
    writeGoverned(root);
    const file = path.join(root, 'src/domain/value.ts');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));

    let silent: { doctor?: { statesTransitions?: { kind?: string } } } | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        silent = JSON.parse(text);
      },
    });
    expect(silent?.doctor?.statesTransitions).toBeUndefined();

    writeDoc(root, 'docs/domain.md', '# Domain\n\nOrders are the core bet.\n');
    let missing: { doctor?: { statesTransitions?: { kind?: string; nextAction?: string } } } | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        missing = JSON.parse(text);
      },
    });
    expect(missing?.doctor?.statesTransitions?.kind).toBe('missing');
    expect(missing?.doctor?.statesTransitions?.nextAction).toContain('docs/domain.md');

    writeDoc(root, 'docs/domain.md', `# Domain\n\n${TABLE}`);
    let present: { doctor?: { statesTransitions?: { kind?: string } } } | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        present = JSON.parse(text);
      },
    });
    expect(present?.doctor?.statesTransitions).toBeUndefined();
  });
});

describe('live doctor CLI', () => {
  it('prints the next step when the domain doc has no map, and stays quiet otherwise', () => {
    const missing = mk('ark-st-cli-miss-');
    writeGoverned(missing);
    writeDoc(missing, 'docs/domain.md', '# Domain\n\nOrders are the core bet.\n');
    const missingOut = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', missing, '--doctor'],
      { encoding: 'utf8' }
    );
    expect(missingOut).toContain(STATES_TRANSITIONS_ASK_MISSING);
    expect(missingOut).toContain('docs/domain.md');
    expect(missingOut).toMatch(/flag soup/i);

    const quiet = mk('ark-st-cli-quiet-');
    writeGoverned(quiet);
    const quietOut = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', quiet, '--doctor'],
      { encoding: 'utf8' }
    );
    expect(quietOut).not.toContain(STATES_TRANSITIONS_ASK_MISSING);
    expect(quietOut).not.toContain(STATES_TRANSITIONS_ASK_INCOMPLETE);

    const mapped = mk('ark-st-cli-map-');
    writeGoverned(mapped);
    writeDoc(mapped, 'docs/domain.md', `# Domain\n\n${TABLE}`);
    const mappedOut = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', mapped, '--doctor'],
      { encoding: 'utf8' }
    );
    expect(mappedOut).not.toContain(STATES_TRANSITIONS_ASK_MISSING);
    expect(mappedOut).not.toContain(STATES_TRANSITIONS_ASK_INCOMPLETE);
  });

  it('keeps a plain check green when the map is missing', () => {
    const root = mk('ark-st-check-');
    writeGoverned(root);
    writeDoc(root, 'docs/domain.md', '# Domain\n\nOrders are the core bet.\n');
    const human = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', root],
      { encoding: 'utf8' }
    );
    expect(human).toMatch(/✔ Ark check passed/);
    expect(human).not.toContain(STATES_TRANSITIONS_ASK_MISSING);
  });
});
