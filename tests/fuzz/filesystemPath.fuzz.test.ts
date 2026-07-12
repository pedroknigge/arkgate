import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { walk } from '../../bin/lib/scan-files.mjs';
import { runFuzz } from '../helpers/fuzz';

describe('filesystem path fuzzing', () => {
  let parent: string;
  let root: string;
  const rootFixture = JSON.parse(
    fs.readFileSync(
      path.resolve(process.cwd(), 'tests/fixtures/fuzz-regressions/filesystem-path/realpath-root.json'),
      'utf8'
    )
  ) as { path: string };

  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-fuzz-files-'));
    root = path.join(parent, 'project');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'inside.ts'), 'export {};\n');
    fs.mkdirSync(path.join(parent, 'outside'), { recursive: true });
    fs.writeFileSync(path.join(parent, 'outside', 'secret.ts'), 'export {};\n');
    root = fs.realpathSync(root);
  });

  afterAll(() => fs.rmSync(parent, { recursive: true, force: true }));

  it('keeps the realpath root regression inside the project', () => {
    const files = walk(path.resolve(root, rootFixture.path), [], { root });
    expect(files).toHaveLength(1);
    expect(path.relative(root, fs.realpathSync(files[0]))).toBe('src/inside.ts');
  });

  it('does not return files beyond the root for traversal-shaped paths', () => {
    const parts = fc.array(fc.constantFrom('.', '..', 'src', 'outside', 'missing'), {
      minLength: 1,
      maxLength: 8,
    });
    runFuzz(
      'filesystem-path',
      fc.property(parts, (segments) => {
        const candidate = path.resolve(root, segments.join(path.sep));
        try {
          for (const file of walk(candidate, [], { root })) {
            const relative = path.relative(root, fs.realpathSync(file));
            expect(relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')).toBe(true);
          }
        } catch (error) {
          expect(String(error)).toContain('Refusing to scan symlink outside project root');
        }
      })
    );
  });
});
