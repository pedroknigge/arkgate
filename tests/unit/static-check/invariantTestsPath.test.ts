/**
 * Adopted-mode domain-invariant tests path (P2 §10).
 * Fail-closed when adopted + catalogued invariants + missing/empty path.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  INVARIANT_TESTS_PATH_ASK,
  INVARIANT_TESTS_PATH_NEXT,
  collectInvariantTestsPathResidual,
  declaredInvariantTestsPathPresent,
} from '../../../bin/lib/invariant-tests-path.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const temps: string[] = [];

function mk(prefix = 'ark-itp-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function writeFile(root: string, rel: string, body: string) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
}

function writeAdoptedInvariants(root: string, coverage?: { testGlobs?: string[]; coverageRoots?: string[] }) {
  writeFile(root, 'src/domain/value.ts', 'export const value = 1;\n');
  writeFile(
    root,
    'arkrules/DomainModel.json',
    JSON.stringify({
      schemaVersion: '1.0',
      layer: 'DomainModel',
      invariants: [{ id: 'INV-VALUE-001', description: 'value stays a number', mode: 'advisory' }],
    })
  );
  writeFile(
    root,
    'ark.config.json',
    JSON.stringify({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
      ...(coverage ? { coverage } : {}),
    })
  );
}

describe('invariant tests path helper', () => {
  it('is silent when not adopted or the catalog is empty', () => {
    expect(collectInvariantTestsPathResidual({})).toBeNull();
    expect(
      collectInvariantTestsPathResidual({
        adopted: true,
        hasDomainInvariants: false,
      })
    ).toBeNull();
  });

  it('names a missing path only when adopted + invariants', () => {
    const residual = collectInvariantTestsPathResidual({
      adopted: true,
      hasDomainInvariants: true,
    });
    expect(residual?.missing).toBe(true);
    expect(residual?.ask).toBe(INVARIANT_TESTS_PATH_ASK);
    expect(residual?.nextAction).toBe(INVARIANT_TESTS_PATH_NEXT);
  });

  it('treats a concrete path that is not on disk as empty', () => {
    const root = mk('ark-itp-empty-');
    expect(declaredInvariantTestsPathPresent(root, { testGlobs: ['ghost/**'] })).toBe(false);
    const residual = collectInvariantTestsPathResidual({
      adopted: true,
      hasDomainInvariants: true,
      coverage: { testGlobs: ['ghost/**'] },
      root,
    });
    expect(residual?.missing).toBe(true);
  });

  it('accepts a real tests folder', () => {
    const root = mk('ark-itp-ok-');
    writeFile(root, 'tests/value.test.ts', "it('INV-VALUE-001', () => {});\n");
    expect(declaredInvariantTestsPathPresent(root, { testGlobs: ['tests/**'] })).toBe(true);
    expect(
      collectInvariantTestsPathResidual({
        adopted: true,
        hasDomainInvariants: true,
        coverage: { testGlobs: ['tests/**'] },
        root,
      })
    ).toBeNull();
  });
});

describe('doctor residual', () => {
  it('omits invariantTestsPath unless adopted or require-gates is on', () => {
    const root = mk('ark-itp-doc-');
    writeAdoptedInvariants(root);
    const file = path.join(root, 'src/domain/value.ts');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    let silent: { doctor?: { invariantTestsPath?: { missing?: boolean } } } | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        silent = JSON.parse(text);
      },
    });
    expect(silent?.doctor?.invariantTestsPath).toBeUndefined();

    let demanded:
      | { doctor?: { invariantTestsPath?: { missing?: boolean; nextAction?: string } } }
      | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      requireGates: true,
      writeJson: (text: string) => {
        demanded = JSON.parse(text);
      },
    });
    expect(demanded?.doctor?.invariantTestsPath?.missing).toBe(true);
    expect(demanded?.doctor?.invariantTestsPath?.nextAction).toBe(INVARIANT_TESTS_PATH_NEXT);
  });

  it('clears once a real tests path is configured', () => {
    const root = mk('ark-itp-doc-ok-');
    writeFile(root, 'tests/value.test.ts', "it('INV-VALUE-001', () => {});\n");
    writeAdoptedInvariants(root, { testGlobs: ['tests/**'] });
    const file = path.join(root, 'src/domain/value.ts');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    let present: { doctor?: { invariantTestsPath?: { missing?: boolean } } } | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      requireGates: true,
      writeJson: (text: string) => {
        present = JSON.parse(text);
      },
    });
    expect(present?.doctor?.invariantTestsPath).toBeUndefined();
  });
});

describe('strict-merge fail-closed', () => {
  it('refuses --require-gates when the tests path is missing', () => {
    const root = mk('ark-itp-deny-');
    writeAdoptedInvariants(root);
    execFileSync('node', [path.resolve('bin/ark-check.mjs'), '--root', root, '--install-agent-gates'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    let failed = false;
    let output = '';
    try {
      execFileSync(
        'node',
        [path.resolve('bin/ark-check.mjs'), '--root', root, '--require-gates', '--json'],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (error) {
      failed = true;
      output = `${(error as { stdout?: string }).stdout ?? ''}${(error as { stderr?: string }).stderr ?? ''}`;
    }
    expect(failed).toBe(true);
    expect(output).toMatch(/INVARIANT_TESTS_PATH_MISSING|empty checkbox|tests path/);
  });

  it('stays green when a real tests path is configured', () => {
    const root = mk('ark-itp-pass-');
    writeFile(root, 'tests/value.test.ts', "it('INV-VALUE-001', () => {});\n");
    writeAdoptedInvariants(root, { testGlobs: ['tests/**'] });
    execFileSync('node', [path.resolve('bin/ark-check.mjs'), '--root', root, '--install-agent-gates'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    const json = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--require-gates', '--json'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    const payload = JSON.parse(json) as { ok?: boolean; violations?: Array<{ ruleId: string }> };
    expect((payload.violations ?? []).map((row) => row.ruleId)).not.toContain(
      'INVARIANT_TESTS_PATH_MISSING'
    );
  });
});
