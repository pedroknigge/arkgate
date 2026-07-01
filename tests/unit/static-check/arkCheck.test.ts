import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('ark-check CLI', () => {
  it('detects layer import violations using TypeScript AST', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-test-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const value = 'Domain.Order.Placed';\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'], intentPrefixes: ['Adapter.Persistence.'] },
        ],
        rules: [
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
        ],
      })
    );

    let output = '';
    try {
      execFileSync('node', [
        path.resolve('bin/ark-check.mjs'),
        '--root',
        root,
        '--json',
      ], { encoding: 'utf8' });
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }

    const result = JSON.parse(output);
    expect(result.ok).toBe(false);
    expect(result.violations[0].ruleId).toBe('LAYER_IMPORT_VIOLATION');
  });

  it('resolves tsconfig path-alias imports across layers (not just relative)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-alias-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    // Import via a path alias — the old relative-only resolver could never see this.
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '@infra/db';\nexport const value = 'Domain.Order.Placed';\n"
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@infra/*': ['src/infra/*'] },
        },
      })
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'], intentPrefixes: ['Adapter.Persistence.'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      })
    );

    let output = '';
    try {
      execFileSync('node', [path.resolve('bin/ark-check.mjs'), '--root', root, '--json'], {
        encoding: 'utf8',
      });
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }

    const result = JSON.parse(output);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v: { ruleId: string }) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(
      true
    );
  });
});
