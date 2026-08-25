import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeResolvedProject, loadContract } from '../../../src/gate';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';
import { resolveCandidateFacts } from '../../../bin/lib/resolved-candidate-facts.mjs';

const roots: string[] = [];

function projectRoot(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-rn03-facts-')));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/application'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'rn03-fixture' }));
  fs.writeFileSync(
    path.join(root, 'src/domain/order-service.ts'),
    'export class OrderService { place() { return 1; } }\n'
  );
  fs.writeFileSync(
    path.join(root, 'src/application/billing.ts'),
    [
      "import { OrderService } from '../domain/order-service';",
      'export const billing = new OrderService();',
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(root, 'src/main.ts'),
    [
      "import { createStrictArkKernel } from '@arkgate/runtime';",
      'const ark = createStrictArkKernel();',
      "ark.publisher('Domain.Order.Placed');",
      'export { ark };',
      '',
    ].join('\n')
  );
  return root;
}

function writeConfig(root: string, extra?: Record<string, unknown>) {
  const config = {
    schemaVersion: '1.2',
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'ApplicationOrchestration', patterns: ['src/application/**', 'src/main.ts'] },
    ],
    rules: [{ from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true }],
    ...(extra ?? {}),
  };
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config, null, 2));
  return config;
}

describe('RN03 resolver ArkRun facts', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('records factory call sites, managed new, and composition-root hits when arkRun is present', async () => {
    const root = projectRoot();
    const config = writeConfig(root, {
      arkRun: {
        mode: 'advisory',
        compositionRoots: ['src/main.ts'],
        managedLayers: ['ApplicationOrchestration', 'DomainModel'],
      },
    });
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const contract = loadContract(config);
    const facts = resolveCandidateFacts({
      root,
      config: contract.config,
      ts: loaded.ts,
    });
    expect(facts.schemaVersion).toBe('1.2');
    expect(facts.arkRunKernelCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/main.ts',
          kind: 'factory',
          callee: 'createStrictArkKernel',
          viaImport: true,
        }),
        expect.objectContaining({
          file: 'src/main.ts',
          kind: 'publisher',
          nameLiteral: 'Domain.Order.Placed',
        }),
      ])
    );
    expect(facts.arkRunManagedNews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/application/billing.ts',
          typeName: 'OrderService',
          importedFrom: '../domain/order-service',
        }),
      ])
    );
    expect(facts.arkRunCompositionRootHits).toEqual([
      expect.objectContaining({
        file: 'src/main.ts',
        matchedRoot: 'src/main.ts',
        hasKernelFactory: true,
      }),
    ]);
    const result = analyzeResolvedProject({ contract, facts });
    expect(result.ir.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('extracts kernel calls without composition-root hits when arkRun is absent', async () => {
    const root = projectRoot();
    const config = writeConfig(root);
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const contract = loadContract(config);
    const facts = resolveCandidateFacts({
      root,
      config: contract.config,
      ts: loaded.ts,
    });
    expect(facts.arkRunKernelCalls.some((call) => call.kind === 'factory')).toBe(true);
    expect(facts.arkRunCompositionRootHits).toEqual([]);
    const withExtra = writeConfig(root, {
      arkRun: {
        mode: 'advisory',
        compositionRoots: ['src/main.ts'],
        managedLayers: ['ApplicationOrchestration'],
      },
    });
    const without = analyzeResolvedProject({ contract, facts });
    const extraContract = loadContract(withExtra);
    const advisory = analyzeResolvedProject({
      contract: extraContract,
      facts: resolveCandidateFacts({ root, config: extraContract.config, ts: loaded.ts }),
    });
    expect(advisory.valid).toBe(without.valid);
    expect(advisory.ir.violations.map((v) => v.ruleId)).toEqual(
      without.ir.violations.map((v) => v.ruleId)
    );
  });

  it('records composition-root hits without a factory when the root file skips the kernel', async () => {
    const root = projectRoot();
    fs.writeFileSync(path.join(root, 'src/main.ts'), 'export const boot = 1;\n');
    const config = writeConfig(root, {
      arkRun: {
        mode: 'advisory',
        compositionRoots: ['src/main.ts'],
        managedLayers: ['ApplicationOrchestration'],
      },
    });
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const contract = loadContract(config);
    const facts = resolveCandidateFacts({
      root,
      config: contract.config,
      ts: loaded.ts,
    });
    expect(facts.arkRunCompositionRootHits).toEqual([
      expect.objectContaining({
        file: 'src/main.ts',
        matchedRoot: 'src/main.ts',
        hasKernelFactory: false,
      }),
    ]);
    expect(facts.arkRunKernelCalls.some((call) => call.kind === 'factory')).toBe(false);
  });
});
