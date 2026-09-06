import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveCandidateFacts } from '../../../bin/lib/resolved-candidate-facts.mjs';
import {
  governedFilesFromRelativePaths,
  isGovernedSourcePath,
} from '../../../bin/lib/scan-files.mjs';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';

const roots: string[] = [];

function project() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-changed-scope-')));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/leaf'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'changed-scope' }));
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, moduleResolution: 'bundler' } })
  );
  fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\n');
  fs.writeFileSync(
    path.join(root, 'src/domain/order.ts'),
    "import { db } from '../infra/db';\nexport const order = db;\n"
  );
  fs.writeFileSync(
    path.join(root, 'src/domain/clean.ts'),
    "import { order } from './order';\nexport const clean = order;\n"
  );
  fs.writeFileSync(path.join(root, 'src/leaf/lonely.ts'), 'export const lonely = 1;\n');
  const config = {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
      { name: 'Presentation', patterns: ['src/leaf/**'] },
    ],
    rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
  };
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config));
  return { root, config };
}

describe('changed-scope candidate facts (#205)', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('parses the import closure of scopeFiles, not the whole include tree', async () => {
    const { root, config } = project();
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    let parseCount = 0;
    const countingTs = new Proxy(loaded.ts, {
      get(target, property, receiver) {
        if (property === 'createSourceFile') {
          return (...args: Parameters<typeof target.createSourceFile>) => {
            parseCount += 1;
            return target.createSourceFile(...args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });

    const full = resolveCandidateFacts({ root, config, ts: countingTs });
    const fullParses = parseCount;
    expect(full.files.map((file) => file.path).sort()).toEqual([
      'src/domain/clean.ts',
      'src/domain/order.ts',
      'src/infra/db.ts',
      'src/leaf/lonely.ts',
    ]);
    expect(fullParses).toBe(4);

    parseCount = 0;
    const scoped = resolveCandidateFacts({
      root,
      config,
      ts: countingTs,
      scopeFiles: ['src/domain/clean.ts'],
    });
    expect(scoped.files.map((file) => file.path).sort()).toEqual([
      'src/domain/clean.ts',
      'src/domain/order.ts',
      'src/infra/db.ts',
    ]);
    expect(parseCount).toBe(3);
    expect(parseCount).toBeLessThan(fullParses);
    expect(scoped.dependencies.some((edge) => edge.from === 'src/domain/order.ts')).toBe(true);
    expect(scoped.files.some((file) => file.path === 'src/leaf/lonely.ts')).toBe(false);
  });

  it('does not walk tsconfig include when reading compiler options', async () => {
    const { root, config } = project();
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    let directoryReads = 0;
    const original = loaded.ts.sys?.readDirectory;
    try {
      if (loaded.ts.sys && original) {
        loaded.ts.sys.readDirectory = (...args: Parameters<typeof original>) => {
          directoryReads += 1;
          return original.apply(loaded.ts.sys, args);
        };
      }
      resolveCandidateFacts({ root, config, ts: loaded.ts, scopeFiles: ['src/leaf/lonely.ts'] });
      expect(directoryReads).toBe(0);
    } finally {
      if (loaded.ts.sys && original) loaded.ts.sys.readDirectory = original;
    }
  });

  it('maps diff paths without listing the include tree', () => {
    const { root, config } = project();
    expect(isGovernedSourcePath(root, 'src/leaf/lonely.ts', config)).toBe(true);
    expect(isGovernedSourcePath(root, 'src/missing.ts', config)).toBe(false);
    expect(isGovernedSourcePath(root, 'README.md', config)).toBe(false);
    const files = governedFilesFromRelativePaths(
      root,
      ['src/leaf/lonely.ts', 'README.md', 'src/leaf/lonely.ts'],
      config
    );
    expect(files).toEqual([path.resolve(root, 'src/leaf/lonely.ts')]);
  });
});
