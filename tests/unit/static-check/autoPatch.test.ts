/**
 * W1 — write-boundary autoPatch for mechanical-safe import-type kinds.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  applyImportTypeAutoPatch,
  classifyImportTypeConversion,
  inspectTargetModule,
  resolveImportFileAbs,
  validateWithAutoPatch,
} from '../../../bin/lib/auto-patch.mjs';

const require = createRequire(import.meta.url);

describe('auto-patch (W1 mechanical-safe import type)', () => {
  let ts: typeof import('typescript');
  let root: string;

  beforeAll(() => {
    ts = require('typescript');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-autopatch-'));
    fs.mkdirSync(path.join(root, 'src/ui'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/data/types-only.ts'),
      'export type Id = string;\nexport interface Item { n: number }\n'
    );
    fs.writeFileSync(
      path.join(root, 'src/data/mixed.ts'),
      'export const q = 1;\nexport type Row = { id: string };\nexport interface Item { n: number }\n'
    );
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves relative import targets on disk', () => {
    const from = path.join(root, 'src/ui/uses.ts');
    const abs = resolveImportFileAbs(root, from, '../data/types-only');
    expect(abs).toBe(path.join(root, 'src/data/types-only.ts'));
  });

  it('inspects pure type modules and mixed type-only export names', () => {
    const pure = inspectTargetModule(
      ts,
      fs.readFileSync(path.join(root, 'src/data/types-only.ts'), 'utf8')
    );
    expect(pure?.pureTypeModule).toBe(true);
    expect(pure?.typeOnlyNames.has('Id')).toBe(true);

    const mixed = inspectTargetModule(
      ts,
      fs.readFileSync(path.join(root, 'src/data/mixed.ts'), 'utf8')
    );
    expect(mixed?.pureTypeModule).toBe(false);
    expect(mixed?.typeOnlyNames.has('Row')).toBe(true);
    expect(mixed?.typeOnlyNames.has('q')).toBe(false);
  });

  it('classifies pure-type vs named type-only conversions', () => {
    const pure = inspectTargetModule(
      ts,
      fs.readFileSync(path.join(root, 'src/data/types-only.ts'), 'utf8')
    );
    expect(classifyImportTypeConversion(pure, ['Id'])?.kind).toBe(
      'import-type-from-pure-type-module'
    );
    const mixed = inspectTargetModule(
      ts,
      fs.readFileSync(path.join(root, 'src/data/mixed.ts'), 'utf8')
    );
    expect(classifyImportTypeConversion(mixed, ['Row'])?.kind).toBe(
      'import-type-of-type-exports'
    );
    expect(classifyImportTypeConversion(mixed, ['q'])).toBeNull();
  });

  it('rewrites value import of pure-type module to import type', () => {
    const source = `import { Id } from '../data/types-only';\nexport function asId(x: Id): Id { return x; }\n`;
    const from = path.join(root, 'src/ui/uses-id.ts');
    const patch = applyImportTypeAutoPatch(ts, source, {
      root,
      filePath: from,
    });
    expect(patch).not.toBeNull();
    expect(patch!.remediationKind).toBe('import-type-from-pure-type-module');
    expect(patch!.source).toContain('import type { Id }');
    expect(patch!.source).not.toMatch(/^import \{ Id \}/m);
  });

  it('rewrites value import of type-only exports from mixed module', () => {
    const source = `import { Row } from '../data/mixed';\nexport function label(row: Row): string { return row.id; }\n`;
    const from = path.join(root, 'src/ui/uses-row.ts');
    const patch = applyImportTypeAutoPatch(ts, source, {
      root,
      filePath: from,
    });
    expect(patch).not.toBeNull();
    expect(patch!.remediationKind).toBe('import-type-of-type-exports');
    expect(patch!.source).toContain('import type { Row }');
  });

  it('does not rewrite value imports of runtime exports', () => {
    const source = `import { q } from '../data/mixed';\nexport const n = q;\n`;
    const from = path.join(root, 'src/ui/uses-q.ts');
    const patch = applyImportTypeAutoPatch(ts, source, {
      root,
      filePath: from,
    });
    expect(patch).toBeNull();
  });

  it('does not rewrite mixed type+value named imports', () => {
    const mixed = inspectTargetModule(
      ts,
      fs.readFileSync(path.join(root, 'src/data/mixed.ts'), 'utf8')
    );
    expect(classifyImportTypeConversion(mixed, ['Row', 'q'])).toBeNull();
    const source = `import { Row, q } from '../data/mixed';\nexport const n = q;\nexport type R = Row;\n`;
    const from = path.join(root, 'src/ui/uses-mixed.ts');
    const patch = applyImportTypeAutoPatch(ts, source, {
      root,
      filePath: from,
    });
    expect(patch).toBeNull();
  });

  it('does not resolve imports that escape project root', () => {
    const from = path.join(root, 'src/ui/uses.ts');
    // Enough ../ to leave the temp root; must not open /etc or parent dirs.
    expect(resolveImportFileAbs(root, from, '../../../../../../../../etc/passwd')).toBeNull();
    expect(resolveImportFileAbs(root, '/tmp/outside.ts', './secret')).toBeNull();
    expect(resolveImportFileAbs(root, from, 'lodash')).toBeNull();
  });

  it('skips default and side-effect imports (judgment)', () => {
    const from = path.join(root, 'src/ui/uses-def.ts');
    expect(
      applyImportTypeAutoPatch(ts, `import Id from '../data/types-only';\nexport type T = Id;\n`, {
        root,
        filePath: from,
      })
    ).toBeNull();
    expect(
      applyImportTypeAutoPatch(ts, `import '../data/types-only';\nexport const x = 1;\n`, {
        root,
        filePath: from,
      })
    ).toBeNull();
  });

  it('validateWithAutoPatch discards when revalidation fails', () => {
    const source = `import { Id } from '../data/types-only';\nexport function asId(x: Id): Id { return x; }\n`;
    const from = path.join(root, 'src/ui/uses-id.ts');
    let calls = 0;
    const out = validateWithAutoPatch({
      source,
      filePath: from,
      root,
      ts,
      validate: (src: string) => {
        calls += 1;
        // First call: invalid. Second (patched): still invalid → discard.
        return { valid: false, violations: [{ ruleId: 'LAYER_IMPORT_VIOLATION', message: 'x' }] };
      },
    });
    expect(out.autoPatch).toBeNull();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('validateWithAutoPatch returns autoPatch when revalidation is green', () => {
    const source = `import { Id } from '../data/types-only';\nexport function asId(x: Id): Id { return x; }\n`;
    const from = path.join(root, 'src/ui/uses-id.ts');
    const out = validateWithAutoPatch({
      source,
      filePath: from,
      root,
      ts,
      validate: (src: string) => {
        const isType = /import\s+type\b/.test(src);
        return {
          valid: isType,
          violations: isType
            ? []
            : [{ ruleId: 'LAYER_IMPORT_VIOLATION', message: 'layer', code: 'LAYER_IMPORT_VIOLATION' }],
        };
      },
    });
    expect(out.valid).toBe(false);
    expect(out.autoPatch).not.toBeNull();
    expect(out.autoPatch!.valid).toBe(true);
    expect(out.autoPatch!.remediationKind).toBe('import-type-from-pure-type-module');
    expect(out.autoPatch!.source).toContain('import type');
  });
});
