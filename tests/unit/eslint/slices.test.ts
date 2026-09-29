/**
 * ESLint sees the same slice decision as ark-check: the inner-wall message
 * (#337) and the slice reason on the attached diagnostic.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { noDomainInfraImports } from '../../../src/eslint/index';

const temps: string[] = [];
afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const UNIVERSE = 'Universe wall: never import another universe.';

function repo(childMessage?: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-eslint-slices-')));
  temps.push(root);
  const config = {
    schemaVersion: '1.3',
    include: ['src'],
    layers: [{ name: 'Application', patterns: ['src/lib/**'] }],
    rules: [
      {
        from: 'Application',
        to: 'Application',
        allowed: false,
        peerIsolation: true,
        sliceFolders: ['features'],
        message: UNIVERSE,
        childSlices: {
          sliceFolders: ['lib/features/*/*'],
          sliceIdentity: 'stars',
          siblings: 'deny',
          ...(childMessage ? { message: childMessage } : {}),
        },
      },
    ],
  };
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config));
  for (const rel of ['src/lib/features/projects/rfi/service.ts', 'src/lib/features/management/eos/eos.ts']) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), 'export const x = 1;\n');
  }
  return root;
}

function lint(root: string, specifier: string) {
  const reports: Array<{ diagnostic?: { message: string; evidence: Record<string, unknown> } }> = [];
  const listener = noDomainInfraImports.create({
    getFilename: () => path.join(root, 'src/lib/features/projects/scm/new.ts'),
    report: (descriptor: Record<string, unknown>) => reports.push(descriptor as never),
  } as never);
  listener.ImportDeclaration({ type: 'ImportDeclaration', source: { value: specifier } } as never);
  return reports;
}

describe('ESLint slice findings', () => {
  it('a sibling crossing does not reuse the universe message and carries its reason', () => {
    const [report] = lint(repo(), '../rfi/service');
    expect(report?.diagnostic?.message).not.toContain(UNIVERSE);
    expect(report?.diagnostic?.evidence).toMatchObject({ reasonId: 'CROSS_SIBLING_SLICE' });
  });

  it('childSlices.message is the sibling text; a cross-universe import keeps the rule message', () => {
    const root = repo('Inner wall text.');
    expect(lint(root, '../rfi/service')[0]?.diagnostic?.message.startsWith('Inner wall text.')).toBe(true);
    const [parent] = lint(root, '../../management/eos/eos');
    expect(parent?.diagnostic?.message.startsWith(UNIVERSE)).toBe(true);
    expect(parent?.diagnostic?.evidence).toMatchObject({ reasonId: 'CROSS_PARENT_SLICE' });
  });
});
