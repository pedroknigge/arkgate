import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveArchitectureSnapshot,
} from '../../../bin/lib/architecture-scan.mjs';
import { resolveCandidateFacts } from '../../../bin/lib/resolved-candidate-facts.mjs';
import { collectGovernedFiles } from '../../../bin/lib/scan-files.mjs';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';

const roots: string[] = [];

function writeTree(fileCount: number) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-doctor-cold-')));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'doctor-cold' }));
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, moduleResolution: 'bundler' } })
  );
  const half = Math.floor(fileCount / 2);
  for (let index = 0; index < fileCount; index += 1) {
    const dir = index < half ? 'src/domain' : 'src/app';
    const name = `mod-${String(index).padStart(3, '0')}.ts`;
    const neighbor =
      index === 0 ? null : `${index < half ? './' : '../domain/'}mod-${String(index - 1).padStart(3, '0')}`;
    const body = neighbor
      ? `import { value as prev } from '${neighbor}';\nexport const value = prev + ${index};\n`
      : `export const value = ${index};\n`;
    fs.writeFileSync(path.join(root, dir, name), body);
  }
  const config = {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'ApplicationOrchestration', patterns: ['src/app/**'] },
    ],
    rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
  };
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config));
  return { root, config };
}

describe('doctor cold path (#212)', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not treat a complete governed list as a --changed scope', async () => {
    const { root, config } = writeTree(8);
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const governed = collectGovernedFiles(root, config);
    expect(governed.length).toBe(8);

    let scopedParses = 0;
    const countingTs = new Proxy(loaded.ts, {
      get(target, property, receiver) {
        if (property === 'createSourceFile') {
          return (...args: Parameters<typeof target.createSourceFile>) => {
            scopedParses += 1;
            return target.createSourceFile(...args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });

    const full = resolveArchitectureSnapshot({
      root,
      config,
      manifest: null,
      rules: config.rules,
      files: [],
      ts: countingTs,
      args: { config: 'ark.config.json' },
      captureInputs: false,
    });
    const fullParses = scopedParses;
    scopedParses = 0;
    const listed = resolveArchitectureSnapshot({
      root,
      config,
      manifest: null,
      rules: config.rules,
      files: governed,
      ts: countingTs,
      args: { config: 'ark.config.json' },
      captureInputs: false,
    });

    expect(listed.facts.files.map((file: { path: string }) => file.path).sort()).toEqual(
      full.facts.files.map((file: { path: string }) => file.path).sort()
    );
    expect(listed.facts.factsHash).toBe(full.facts.factsHash);
    expect(scopedParses).toBe(fullParses);
    expect(fullParses).toBe(8);
  });

  it('skips extra-plane extractors when extras are off', async () => {
    const { root, config } = writeTree(2);
    fs.writeFileSync(
      path.join(root, 'src/app/boot.ts'),
      [
        "import { createArkKernel } from 'arkgate/runtime';",
        "import { createOrderPlane } from 'arkgate/order';",
        'export const ark = createArkKernel();',
        'export const plane = createOrderPlane();',
        '',
      ].join('\n')
    );
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const silent = resolveCandidateFacts({ root, config, ts: loaded.ts });
    expect(silent.arkRunKernelCalls).toEqual([]);
    expect(silent.arkOrderPlaneCalls).toEqual([]);
    expect(silent.classShapes).toEqual([]);

    const armed = resolveCandidateFacts({
      root,
      config: {
        ...config,
        arkRun: { mode: 'advisory', compositionRoots: ['src/app/boot.ts'], managedLayers: ['ApplicationOrchestration'] },
        arkOrder: { mode: 'advisory', planeRoots: ['src/app/boot.ts'], managedLayers: ['ApplicationOrchestration'] },
      },
      ts: loaded.ts,
    });
    expect(armed.arkRunKernelCalls.some((call: { kind: string }) => call.kind === 'factory')).toBe(
      true
    );
    expect(armed.arkOrderPlaneCalls.some((call: { callee: string }) => call.callee === 'createOrderPlane')).toBe(
      true
    );
  });

  it('finishes a ~226-file cold snapshot in seconds, not minutes', async () => {
    const { root, config } = writeTree(226);
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const governed = collectGovernedFiles(root, config);
    expect(governed.length).toBe(226);

    const started = Date.now();
    const snapshot = resolveArchitectureSnapshot({
      root,
      config,
      manifest: null,
      rules: config.rules,
      files: governed,
      ts: loaded.ts,
      args: { config: 'ark.config.json' },
      captureInputs: false,
    });
    const elapsedMs = Date.now() - started;
    expect(snapshot.facts.files).toHaveLength(226);
    expect(snapshot.result.completeness).toBe('complete');
    // Field report was ~142s. Interactive first screen is seconds.
    expect(elapsedMs).toBeLessThan(20_000);
  });
});
