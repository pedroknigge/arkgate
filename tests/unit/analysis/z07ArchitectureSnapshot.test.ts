import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveArchitectureSnapshot,
  runArchitectureScan,
} from '../../../bin/lib/architecture-scan.mjs';
import { resolveCandidateFacts } from '../../../bin/lib/resolved-candidate-facts.mjs';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';

const roots: string[] = [];

function project() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z07-snapshot-')));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'snapshot-fixture' }));
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ extends: './config/base.json' })
  );
  fs.writeFileSync(
    path.join(root, 'config/base.json'),
    JSON.stringify({ compilerOptions: { strict: true } })
  );
  fs.writeFileSync(
    path.join(root, 'src/domain/order.ts'),
    "import { missing } from './missing';\nexport const order = missing;\n"
  );
  const config = {
    include: ['src'],
    layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
    rules: [],
  };
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config));
  return { root, config };
}

function input(snapshot: ReturnType<typeof resolveArchitectureSnapshot>, inputPath: string) {
  return snapshot.inputs.find(({ path: observedPath }) => observedPath === inputPath);
}

describe('Z07 canonical architecture snapshot seam', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps runArchitectureScan byte-shape parity while retaining facts outside its result', async () => {
    const { root, config } = project();
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const options = {
      root,
      config,
      manifest: null,
      rules: config.rules,
      files: [],
      ts: loaded.ts,
      args: { config: 'ark.config.json' },
    };

    const snapshot = resolveArchitectureSnapshot(options);
    const legacyResult = runArchitectureScan(options);

    expect(snapshot.result).toEqual(legacyResult);
    expect(JSON.stringify(snapshot.result)).toBe(JSON.stringify(legacyResult));
    expect(snapshot.facts).toEqual(resolveCandidateFacts({ root, config, ts: loaded.ts }));
    expect(Object.isFrozen(snapshot.facts)).toBe(true);
    expect(Object.isFrozen(snapshot.facts.files)).toBe(true);
    expect(snapshot.result.factsHash).toBe(snapshot.facts.factsHash);
    expect(snapshot.result).not.toHaveProperty('facts');
    expect(snapshot.facts).not.toHaveProperty('inputs');
    expect(snapshot.inputs.map(({ path: inputPath }) => inputPath)).toEqual(
      [...snapshot.inputs.map(({ path: inputPath }) => inputPath)].sort()
    );
    expect(snapshot.inputs.every(({ kinds }) => kinds.join() === [...kinds].sort().join())).toBe(
      true
    );
  });

  it('observes present and missing resolver inputs that can invalidate canonical facts', async () => {
    const { root, config } = project();
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const options = {
      root,
      config,
      manifest: null,
      rules: config.rules,
      files: [],
      ts: loaded.ts,
      args: { config: 'ark.config.json' },
    };

    const before = resolveArchitectureSnapshot(options);
    expect(input(before, path.join(root, 'ark.config.json'))?.kinds).toContain('ark-config');
    expect(input(before, path.join(root, 'package.json'))?.kinds).toContain('package');
    expect(input(before, path.join(root, 'tsconfig.json'))?.kinds).toEqual(
      expect.arrayContaining(['exists', 'tsconfig'])
    );
    expect(input(before, path.join(root, 'config/base.json'))?.kinds).toContain('tsconfig');
    expect(input(before, path.join(root, 'src/domain'))?.kinds).toContain('directory');
    expect(input(before, path.join(root, 'src/domain/order.ts'))?.kinds).toEqual(
      expect.arrayContaining(['lstat', 'realpath', 'source'])
    );
    expect(input(before, path.join(root, 'src/domain/tsconfig.json'))?.kinds).toContain('exists');
    expect(input(before, path.join(root, 'src/tsconfig.json'))?.kinds).toContain('exists');
    expect(input(before, path.join(root, 'src/domain/missing.ts'))?.kinds).toContain(
      'module-file'
    );
    expect(before.facts.dependencies).toEqual([
      expect.objectContaining({ specifier: './missing', resolution: 'unresolved' }),
    ]);

    const defaulted = resolveArchitectureSnapshot({
      root,
      config,
      manifest: null,
      files: [],
      ts: loaded.ts,
      args: { manifest: 'ark.manifest.json', tsconfig: 'tsconfig.json' },
    });
    expect(input(defaulted, path.join(root, 'ark.config.json'))?.kinds).toContain('ark-config');
    expect(input(defaulted, path.join(root, 'ark.manifest.json'))?.kinds).toContain('manifest');

    fs.writeFileSync(path.join(root, 'src/domain/missing.ts'), 'export const missing = 1;\n');
    const after = resolveArchitectureSnapshot(options);

    expect(after.facts.factsHash).not.toBe(before.facts.factsHash);
    expect(after.facts.dependencies).toEqual([
      expect.objectContaining({
        specifier: './missing',
        resolution: 'resolved-project',
        target: 'src/domain/missing.ts',
      }),
    ]);
    expect(input(after, path.join(root, 'src/domain/missing.ts'))?.kinds).toEqual(
      expect.arrayContaining(['module-file', 'realpath', 'source'])
    );
  });
});
