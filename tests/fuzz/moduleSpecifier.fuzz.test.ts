import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import ts from 'typescript';
import { createModuleResolutionHost, resolveImport } from '../../bin/lib/ts-resolve.mjs';
import { runFuzz } from '../helpers/fuzz';

describe('module specifier fuzzing', () => {
  let parent: string;
  let root: string;
  let containingFile: string;

  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-fuzz-resolve-'));
    root = path.join(parent, 'project');
    containingFile = path.join(root, 'src', 'from.ts');
    fs.mkdirSync(path.dirname(containingFile), { recursive: true });
    fs.writeFileSync(containingFile, 'export {};\n');
    fs.writeFileSync(path.join(root, 'src', 'inside.ts'), 'export {};\n');
    fs.writeFileSync(path.join(parent, 'outside.ts'), 'export {};\n');
  });

  afterAll(() => fs.rmSync(parent, { recursive: true, force: true }));

  it('never resolves a generated relative specifier outside the project root', () => {
    const segments = fc.array(fc.constantFrom('.', '..', 'inside', 'missing'), {
      minLength: 1,
      maxLength: 8,
    });
    runFuzz(
      'module-specifier',
      fc.property(segments, (parts) => {
        const specifier = `./${parts.join('/')}`;
        const resolved = resolveImport(
          ts,
          specifier,
          containingFile,
          {},
          createModuleResolutionHost(ts),
          root
        );
        if (resolved) {
          const relative = path.relative(root, resolved);
          expect(relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')).toBe(true);
        }
      })
    );
  });
});
