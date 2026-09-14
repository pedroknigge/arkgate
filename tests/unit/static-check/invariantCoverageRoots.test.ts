/**
 * Enforced-invariant coverageRoots (P2 §10 residual).
 * Fail-closed when any invariant is enforced and coverageRoots is missing/empty.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  INVARIANT_COVERAGE_ROOTS_ASK,
  INVARIANT_COVERAGE_ROOTS_NEXT,
  collectCoverageRootsResidual,
  declaredCoverageRootsPresent,
} from '../../../bin/lib/invariant-tests-path.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const temps: string[] = [];

function mk(prefix = 'ark-icr-'): string {
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

function writeEnforcedInvariant(
  root: string,
  coverage?: { testGlobs?: string[]; coverageRoots?: string[] }
) {
  writeFile(root, 'src/domain/value.ts', 'export const value = 1;\n');
  writeFile(
    root,
    'arkrules/DomainModel.json',
    JSON.stringify({
      schemaVersion: '1.0',
      layer: 'DomainModel',
      invariants: [{ id: 'INV-VALUE-001', description: 'value stays a number', mode: 'enforced' }],
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

describe('coverageRoots helper', () => {
  it('is silent when no invariant is enforced', () => {
    expect(collectCoverageRootsResidual({})).toBeNull();
    expect(
      collectCoverageRootsResidual({
        hasEnforcedInvariant: false,
      })
    ).toBeNull();
    expect(
      collectCoverageRootsResidual({
        invariants: [{ mode: 'advisory' }],
      })
    ).toBeNull();
  });

  it('names missing roots only when an invariant is enforced', () => {
    const residual = collectCoverageRootsResidual({
      hasEnforcedInvariant: true,
    });
    expect(residual?.missing).toBe(true);
    expect(residual?.ask).toBe(INVARIANT_COVERAGE_ROOTS_ASK);
    expect(residual?.nextAction).toBe(INVARIANT_COVERAGE_ROOTS_NEXT);
  });

  it('treats testGlobs alone as missing runner roots', () => {
    const residual = collectCoverageRootsResidual({
      hasEnforcedInvariant: true,
      coverage: { testGlobs: ['tests/**'] },
    });
    expect(residual?.missing).toBe(true);
  });

  it('treats a concrete root that is not on disk as empty', () => {
    const root = mk('ark-icr-empty-');
    expect(declaredCoverageRootsPresent(root, { coverageRoots: ['ghost'] })).toBe(false);
    const residual = collectCoverageRootsResidual({
      hasEnforcedInvariant: true,
      coverage: { coverageRoots: ['ghost'] },
      root,
    });
    expect(residual?.missing).toBe(true);
  });

  it('accepts a real runner root', () => {
    const root = mk('ark-icr-ok-');
    writeFile(root, 'tests/value.test.ts', "it('INV-VALUE-001', () => {});\n");
    expect(declaredCoverageRootsPresent(root, { coverageRoots: ['tests'] })).toBe(true);
    expect(
      collectCoverageRootsResidual({
        hasEnforcedInvariant: true,
        coverage: { coverageRoots: ['tests'] },
        root,
      })
    ).toBeNull();
  });
});

describe('doctor residual', () => {
  it('omits invariantCoverageRoots when every invariant is advisory', () => {
    const root = mk('ark-icr-doc-');
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
      })
    );
    const file = path.join(root, 'src/domain/value.ts');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    let silent: { doctor?: { invariantCoverageRoots?: { missing?: boolean } } } | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        silent = JSON.parse(text);
      },
    });
    expect(silent?.doctor?.invariantCoverageRoots).toBeUndefined();
  });

  it('names missing roots when an invariant is enforced', () => {
    const root = mk('ark-icr-doc-enforced-');
    writeEnforcedInvariant(root);
    const file = path.join(root, 'src/domain/value.ts');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    let demanded:
      | { doctor?: { invariantCoverageRoots?: { missing?: boolean; nextAction?: string } } }
      | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        demanded = JSON.parse(text);
      },
    });
    expect(demanded?.doctor?.invariantCoverageRoots?.missing).toBe(true);
    expect(demanded?.doctor?.invariantCoverageRoots?.nextAction).toBe(INVARIANT_COVERAGE_ROOTS_NEXT);
  });

  it('clears once coverageRoots is declared on a real folder', () => {
    const root = mk('ark-icr-doc-ok-');
    writeFile(root, 'tests/value.test.ts', "it('INV-VALUE-001', () => {});\n");
    writeEnforcedInvariant(root, { coverageRoots: ['tests'] });
    const file = path.join(root, 'src/domain/value.ts');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    let present: { doctor?: { invariantCoverageRoots?: { missing?: boolean } } } | undefined;
    runDoctor(root, config, [file], [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        present = JSON.parse(text);
      },
    });
    expect(present?.doctor?.invariantCoverageRoots).toBeUndefined();
  });
});

describe('check fail-closed', () => {
  it('refuses when an invariant is enforced and coverageRoots is missing', () => {
    const root = mk('ark-icr-deny-');
    writeEnforcedInvariant(root, { testGlobs: ['tests/**'] });
    writeFile(root, 'tests/value.test.ts', "it('INV-VALUE-001', () => {});\n");
    let failed = false;
    let output = '';
    try {
      execFileSync('node', [path.resolve('bin/ark-check.mjs'), '--root', root, '--json'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      failed = true;
      output = `${(error as { stdout?: string }).stdout ?? ''}${(error as { stderr?: string }).stderr ?? ''}`;
    }
    expect(failed).toBe(true);
    expect(output).toMatch(/INVARIANT_COVERAGE_ROOTS_MISSING|coverage\.coverageRoots|no runner runs/);
  });

  it('stays green for this finding when coverageRoots is declared', () => {
    const root = mk('ark-icr-pass-');
    writeFile(root, 'tests/value.test.ts', "it('INV-VALUE-001', () => {});\n");
    writeEnforcedInvariant(root, { coverageRoots: ['tests'] });
    let json = '';
    try {
      json = execFileSync(
        'node',
        [path.resolve('bin/ark-check.mjs'), '--root', root, '--json'],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (error) {
      json = `${(error as { stdout?: string }).stdout ?? ''}`;
    }
    const payload = JSON.parse(json) as { violations?: Array<{ ruleId: string }> };
    expect((payload.violations ?? []).map((row) => row.ruleId)).not.toContain(
      'INVARIANT_COVERAGE_ROOTS_MISSING'
    );
  });
});
