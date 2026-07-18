import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzeResolvedProject,
  loadContract,
  preflightResolvedChange,
} from '../../../src/gate';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';
import {
  canonicalizeCandidateChanges,
  resolveCandidateFacts,
} from '../../../bin/lib/resolved-candidate-facts.mjs';
import { prepareChangeFromRoot } from '../../../bin/lib/prepare-change.mjs';

const SOURCE = path.resolve('tests/fixtures/resolved-facts-boundary');
const roots: string[] = [];

function fixtureRoot(): string {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z04-resolver-'));
  const root = path.join(parent, 'project');
  fs.cpSync(SOURCE, root, { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules/@z03'), { recursive: true });
  fs.symlinkSync(
    path.join(root, 'packages/kernel'),
    path.join(root, 'node_modules/@z03/kernel'),
    'dir'
  );
  roots.push(parent);
  return fs.realpathSync(root);
}

function configAt(root: string) {
  return JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
}

function safetyRoot(packageName: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z04-safety-')));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: packageName }));
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
      rules: [],
      safety: { maxTsSuppressions: 0, maxAnyCasts: 0, allowInMemory: false },
    })
  );
  fs.writeFileSync(
    path.join(root, 'src/unsafe.ts'),
    [
      "import { InMemoryOutboxStore, createArkKernel } from 'arkgate';",
      '// @ts-ignore',
      'const unsafe = missing as any;',
      "const moduleName = './runtime';",
      'void import(moduleName);',
      'require(moduleName);',
      'createArkKernel();',
      'export { unsafe, InMemoryOutboxStore };',
      '',
    ].join('\n')
  );
  return root;
}

describe('Z04 shipped resolved candidate facts resolver', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves aliases and workspace packages to one canonical project target', async () => {
    const firstRoot = fixtureRoot();
    const secondRoot = fixtureRoot();
    const loaded = await loadTypeScript(firstRoot);
    expect(loaded.ts).toBeTruthy();

    const first = resolveCandidateFacts({
      root: firstRoot,
      config: configAt(firstRoot),
      ts: loaded.ts,
      tsconfig: 'tsconfig.json',
    });
    const second = resolveCandidateFacts({
      root: secondRoot,
      config: configAt(secondRoot),
      ts: loaded.ts,
      tsconfig: 'tsconfig.json',
    });

    expect(first).toEqual(second);
    expect(first.completeness).toBe('complete');
    expect(first.dependencies).toHaveLength(2);
    expect(first.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'packages/domain/src/order.ts',
          specifier: '@alias/kernel',
          resolution: 'resolved-project',
          target: 'packages/kernel/src/index.ts',
        }),
        expect.objectContaining({
          from: 'packages/domain/src/order.ts',
          specifier: '@z03/kernel',
          resolution: 'resolved-project',
          target: 'packages/kernel/src/index.ts',
        }),
      ])
    );

    const result = analyzeResolvedProject({
      contract: loadContract(configAt(firstRoot)),
      facts: first,
    });
    expect(result.valid).toBe(false);
    expect(result.ir.violations).toHaveLength(2);
    expect(result.ir.violations.every(({ ruleId }) => ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(
      true
    );

    const invalidContent = 'export const = ;\n';
    const firstInvalid = resolveCandidateFacts({
      root: firstRoot,
      config: configAt(firstRoot),
      ts: loaded.ts,
      tsconfig: 'tsconfig.json',
      changes: [{ path: 'packages/domain/src/order.ts', content: invalidContent }],
    });
    const secondInvalid = resolveCandidateFacts({
      root: secondRoot,
      config: configAt(secondRoot),
      ts: loaded.ts,
      tsconfig: 'tsconfig.json',
      changes: [{ path: 'packages/domain/src/order.ts', content: invalidContent }],
    });
    expect(firstInvalid).toEqual(secondInvalid);
    expect(firstInvalid).toMatchObject({
      completeness: 'partial',
      completenessReasons: [
        expect.objectContaining({ code: 'PARSE_FAILURE', file: 'packages/domain/src/order.ts' }),
      ],
    });
  });

  it('resolves creates, updates, and deletes against one complete virtual overlay', async () => {
    const root = fixtureRoot();
    const config = configAt(root);
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const contract = loadContract(config);
    const createdPath = 'packages/kernel/src/created.ts';
    const createdContent = 'export const created = 1;\n';
    const updatedPath = 'packages/domain/src/order.ts';
    const updatedContent =
      "import { created } from '../../kernel/src/created';\nexport const orderValue = created;\n";

    const baseFacts = resolveCandidateFacts({
      root,
      config,
      ts: loaded.ts,
      tsconfig: 'tsconfig.json',
    });
    const candidateFacts = resolveCandidateFacts({
      root,
      config,
      ts: loaded.ts,
      tsconfig: 'tsconfig.json',
      changes: [
        { path: updatedPath, content: updatedContent },
        { path: createdPath, content: createdContent },
      ],
    });

    expect(candidateFacts.dependencies).toEqual([
      expect.objectContaining({
        from: updatedPath,
        resolution: 'resolved-project',
        target: createdPath,
      }),
    ]);
    expect(
      preflightResolvedChange({
        contract,
        baseFacts,
        candidateFacts,
        changes: [
          { path: updatedPath, content: updatedContent },
          { path: createdPath, content: createdContent },
        ],
      }).violations
    ).toEqual([expect.objectContaining({ ruleId: 'LAYER_IMPORT_VIOLATION' })]);

    const afterDelete = resolveCandidateFacts({
      root,
      config,
      ts: loaded.ts,
      tsconfig: 'tsconfig.json',
      changes: [{ path: 'packages/kernel/src/index.ts', delete: true }],
    });
    expect(
      afterDelete.dependencies.find(({ specifier }) => specifier === '@alias/kernel')
    ).toMatchObject({ resolution: 'unresolved' });
    expect(afterDelete.files.some(({ path: file }) => file === 'packages/kernel/src/index.ts')).toBe(
      false
    );
  });

  it('keeps excluded source changes visible to module resolution without analyzing them', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z04-excluded-overlay-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
    const config = {
      include: ['src', 'generated'],
      exclude: ['generated/**'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'Kernel', patterns: ['generated/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
    };
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const importer = {
      path: 'src/domain/order.ts',
      content:
        "import { generated } from '../../generated/value';\nexport const order = generated;\n",
    };
    const excludedTarget = {
      path: 'generated/value.ts',
      content: 'export const generated = 1;\n',
    };

    const facts = resolveCandidateFacts({
      root,
      config,
      ts: loaded.ts,
      changes: [importer, excludedTarget],
    });
    expect(facts.files.map(({ path: file }) => file)).not.toContain(excludedTarget.path);
    expect(facts.dependencies).toEqual([
      expect.objectContaining({
        from: importer.path,
        resolution: 'resolved-project',
        target: excludedTarget.path,
      }),
    ]);

    const preflight = prepareChangeFromRoot({
      root,
      config,
      changes: [importer],
      overlayChanges: [importer, excludedTarget],
      ts: loaded.ts,
    });
    expect(preflight.valid).toBe(false);
    expect(preflight.violations).toEqual([
      expect.objectContaining({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: importer.path,
        target: excludedTarget.path,
      }),
    ]);
  });

  it('captures neutral safety evidence and applies package/config policy only in Kernel', async () => {
    const consumerRoot = safetyRoot('consumer-app');
    const providerRoot = safetyRoot('arkgate');
    const loaded = await loadTypeScript(consumerRoot);
    expect(loaded.ts).toBeTruthy();
    const consumerConfig = configAt(consumerRoot);
    const consumerFacts = resolveCandidateFacts({
      root: consumerRoot,
      config: consumerConfig,
      ts: loaded.ts,
    });

    expect(consumerFacts.projectPackageName).toBe('consumer-app');
    expect(consumerFacts.safetyUses.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        'ts-suppression',
        'any-cast',
        'dynamic-import',
        'dynamic-require',
        'in-memory-store',
      ])
    );
    const consumer = analyzeResolvedProject({
      contract: loadContract(consumerConfig),
      facts: consumerFacts,
    });
    expect(consumer.ir.warnings.map(({ ruleId }) => ruleId)).toEqual(
      expect.arrayContaining([
        'DYNAMIC_IMPORT_NOT_ALLOWLISTED',
        'DYNAMIC_REQUIRE_NOT_ALLOWLISTED',
        'TS_SUPPRESSION_THRESHOLD_EXCEEDED',
        'ANY_CAST_THRESHOLD_EXCEEDED',
        'IN_MEMORY_STORE_IN_PRODUCTION_SOURCE',
      ])
    );

    const providerConfig = configAt(providerRoot);
    const provider = analyzeResolvedProject({
      contract: loadContract(providerConfig),
      facts: resolveCandidateFacts({ root: providerRoot, config: providerConfig, ts: loaded.ts }),
    });
    expect(provider.safety.inMemoryProductionStores).toEqual([]);
    expect(provider.ir.warnings.map(({ ruleId }) => ruleId)).not.toContain(
      'IN_MEMORY_STORE_IN_PRODUCTION_SOURCE'
    );
  });

  it('canonicalizes internal symlink aliases independently of include order', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z04-symlink-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(root, 'shared/value.ts'), 'export const value = 1;\n');
    fs.symlinkSync(path.join(root, 'shared'), path.join(root, 'src/shared'));
    fs.writeFileSync(
      path.join(root, 'src/entry.ts'),
      "import { value } from './shared/value';\nexport { value };\n"
    );
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const base = {
      layers: [
        { name: 'DomainModel', patterns: ['shared/**', 'src/shared/**', 'src/entry.ts'] },
      ],
      rules: [],
    };
    const first = resolveCandidateFacts({
      root,
      config: { ...base, include: ['src/shared', 'shared', 'src/entry.ts'] },
      ts: loaded.ts,
    });
    const second = resolveCandidateFacts({
      root,
      config: { ...base, include: ['shared', 'src/shared', 'src/entry.ts'] },
      ts: loaded.ts,
    });

    expect(first).toEqual(second);
    expect(first.files.map(({ path: file }) => file)).toEqual([
      'shared/value.ts',
      'src/entry.ts',
    ]);

    const updated = resolveCandidateFacts({
      root,
      config: { ...base, include: ['shared', 'src/shared', 'src/entry.ts'] },
      ts: loaded.ts,
      changes: [{ path: 'src/shared/value.ts', content: 'export const value = 2;\n' }],
    });
    expect(updated.files.map(({ path: file }) => file)).toEqual([
      'shared/value.ts',
      'src/entry.ts',
    ]);
    expect(updated.files[0].contentHash).not.toBe(first.files[0].contentHash);
    expect(updated.dependencies).toEqual([
      expect.objectContaining({
        from: 'src/entry.ts',
        resolution: 'resolved-project',
        target: 'shared/value.ts',
      }),
    ]);

    const deleted = resolveCandidateFacts({
      root,
      config: { ...base, include: ['shared', 'src/shared', 'src/entry.ts'] },
      ts: loaded.ts,
      changes: [{ path: 'src/shared/value.ts', delete: true }],
    });
    expect(deleted.files.map(({ path: file }) => file)).toEqual(['src/entry.ts']);
    expect(deleted.dependencies).toEqual([
      expect.objectContaining({ from: 'src/entry.ts', resolution: 'unresolved' }),
    ]);

    const created = resolveCandidateFacts({
      root,
      config: { ...base, include: ['shared', 'src/shared', 'src/entry.ts'] },
      ts: loaded.ts,
      changes: [{ path: 'src/shared/new.ts', content: 'export const next = 1;\n' }],
    });
    expect(created.files.map(({ path: file }) => file)).toEqual([
      'shared/new.ts',
      'shared/value.ts',
      'src/entry.ts',
    ]);

    const createdAndImported = resolveCandidateFacts({
      root,
      config: { ...base, include: ['shared', 'src/shared', 'src/entry.ts'] },
      ts: loaded.ts,
      changes: [
        { path: 'src/shared/made.ts', content: 'export const made = 1;\n' },
        {
          path: 'src/entry.ts',
          content: "import { made } from './shared/made';\nexport { made };\n",
        },
      ],
    });
    expect(createdAndImported.dependencies).toEqual([
      expect.objectContaining({
        from: 'src/entry.ts',
        resolution: 'resolved-project',
        target: 'shared/made.ts',
      }),
    ]);

    const preflight = prepareChangeFromRoot({
      root,
      config: { ...base, include: ['shared', 'src/shared', 'src/entry.ts'] },
      changes: [{ path: 'src/shared/value.ts', content: 'export const value = 3;\n' }],
      ts: loaded.ts,
    });
    expect(preflight).toMatchObject({
      mode: 'resolved-candidate-facts',
      valid: true,
      changes: [{ path: 'shared/value.ts', operation: 'update' }],
      baseCompleteness: 'complete',
      candidateCompleteness: 'complete',
    });
    expect(() =>
      canonicalizeCandidateChanges({
        root,
        config: { ...base, include: ['shared', 'src/shared', 'src/entry.ts'] },
        changes: [
          { path: 'shared/value.ts', content: 'export const value = 4;\n' },
          { path: 'src/shared/value.ts', content: 'export const value = 5;\n' },
        ],
      })
    ).toThrow(/duplicate path shared\/value\.ts/i);
  });

  it('canonicalizes creates through an empty internal symlink before scope and layer evaluation', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z04-empty-symlink-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
    fs.symlinkSync(path.join(root, 'shared'), path.join(root, 'src/domain/link'), 'dir');
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const change = {
      path: 'src/domain/link/new.ts',
      content: "export const load = () => f\\u0065tch('/data');\n",
    };
    const config = {
      include: ['src', 'shared'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'Kernel', patterns: ['shared/**'], forbiddenGlobals: ['fetch'] },
      ],
      rules: [],
    };

    const facts = resolveCandidateFacts({ root, config, ts: loaded.ts, changes: [change] });
    expect(facts.files.map(({ path: file }) => file)).toEqual(['shared/new.ts']);
    expect(analyzeResolvedProject({ contract: loadContract(config), facts }).ir.violations).toEqual([
      expect.objectContaining({
        ruleId: 'FORBIDDEN_GLOBAL',
        file: 'shared/new.ts',
        fromLayer: 'Kernel',
      }),
    ]);
    expect(
      prepareChangeFromRoot({ root, config, ts: loaded.ts, changes: [change] })
    ).toMatchObject({
      valid: false,
      changes: [{ path: 'shared/new.ts', operation: 'create' }],
      violations: [expect.objectContaining({ ruleId: 'FORBIDDEN_GLOBAL' })],
    });

    const aliasOnly = resolveCandidateFacts({
      root,
      config: { ...config, include: ['src'] },
      ts: loaded.ts,
      changes: [change],
    });
    expect(aliasOnly.files.map(({ path: file }) => file)).toEqual(['src/domain/link/new.ts']);
  });

  it('distinguishes a completed unresolved lookup from a resolver failure', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z04-resolution-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/order.ts'), "import value from 'missing-package';\n");
    const config = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
      rules: [],
    };
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();

    const unresolved = resolveCandidateFacts({ root, config, ts: loaded.ts });
    expect(unresolved).toMatchObject({
      completeness: 'complete',
      completenessReasons: [],
      dependencies: [expect.objectContaining({ resolution: 'unresolved' })],
    });

    const throwingTs = new Proxy(loaded.ts, {
      get(target, property, receiver) {
        if (property === 'resolveModuleName') {
          return () => {
            throw new Error('synthetic resolver failure');
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const failed = resolveCandidateFacts({ root, config, ts: throwingTs });
    expect(failed).toMatchObject({
      completeness: 'partial',
      completenessReasons: [
        expect.objectContaining({
          code: 'MODULE_RESOLUTION_FAILURE',
          file: 'src/order.ts',
        }),
      ],
      dependencies: [expect.objectContaining({ resolution: 'unresolved' })],
    });
    expect(failed.completenessReasons[0].message).not.toContain(root);
  });

  it('parses each candidate once while preserving port-proof evidence', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z04-single-parse-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/adapters'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { repository } from '../adapters/repository';\n" +
        'export function loadOrder() { return repository.load(); }\n'
    );
    fs.writeFileSync(
      path.join(root, 'src/adapters/repository.ts'),
      'export const repository = { load: () => 1 };\n'
    );
    const config = {
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'PersistenceAdapters', patterns: ['src/adapters/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    };
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

    const facts = resolveCandidateFacts({ root, config, ts: countingTs });

    expect(parseCount).toBe(facts.files.length);
    expect(facts.dependencies).toEqual([
      expect.objectContaining({
        from: 'src/domain/order.ts',
        target: 'src/adapters/repository.ts',
        portProofEligible: true,
      }),
    ]);
  });

  it('uses only nearest candidate configs and hashes their transitive extends inputs', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z04-tsconfig-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'unused'), { recursive: true });
    fs.mkdirSync(path.join(root, 'config'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/order.ts'), 'export const order = 1;\n');
    fs.writeFileSync(path.join(root, 'unused/tsconfig.json'), '{ invalid');
    const config = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
      rules: [],
    };
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();

    const withoutUsedConfig = resolveCandidateFacts({ root, config, ts: loaded.ts });
    expect(withoutUsedConfig.completeness).toBe('complete');
    fs.writeFileSync(path.join(root, 'unused/tsconfig.json'), '{ still invalid');
    expect(resolveCandidateFacts({ root, config, ts: loaded.ts })).toEqual(withoutUsedConfig);

    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ extends: './config/mid.json', compilerOptions: { module: 'esnext' } })
    );
    fs.writeFileSync(path.join(root, 'config/mid.json'), JSON.stringify({ extends: './base.json' }));
    fs.writeFileSync(
      path.join(root, 'config/base.json'),
      JSON.stringify({ compilerOptions: { strict: true } })
    );
    const first = resolveCandidateFacts({ root, config, ts: loaded.ts });
    fs.writeFileSync(
      path.join(root, 'config/base.json'),
      `${JSON.stringify({ compilerOptions: { strict: true } }, null, 2)}\n`
    );
    const second = resolveCandidateFacts({ root, config, ts: loaded.ts });

    expect(first.completeness).toBe('complete');
    expect(second.completeness).toBe('complete');
    expect(second.tsconfigHash).not.toBe(first.tsconfigHash);
    expect(second.compilerOptionsHash).toBe(first.compilerOptionsHash);
    expect(second.candidateTreeHash).toBe(first.candidateTreeHash);
    expect(second.factsHash).not.toBe(first.factsHash);
  });

  it('supports portable explicit configs outside the project root', async () => {
    const makeLayout = () => {
      const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z04-external-')));
      roots.push(parent);
      const root = path.join(parent, 'project');
      const configDir = path.join(parent, 'config');
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(root, 'src/value.ts'), 'export const value = 1;\n');
      fs.writeFileSync(
        path.join(root, 'src/order.ts'),
        "import { value } from '@value';\nexport { value };\n"
      );
      const tsconfig = path.join(configDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfig,
        JSON.stringify({
          compilerOptions: {
            baseUrl: '../project',
            paths: { '@value': ['src/value.ts'] },
          },
        })
      );
      return { root: fs.realpathSync(root), tsconfig };
    };
    const firstLayout = makeLayout();
    const secondLayout = makeLayout();
    const loaded = await loadTypeScript(firstLayout.root);
    expect(loaded.ts).toBeTruthy();
    const config = {
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
      rules: [],
    };

    const first = resolveCandidateFacts({ ...firstLayout, config, ts: loaded.ts });
    const second = resolveCandidateFacts({ ...secondLayout, config, ts: loaded.ts });

    expect(first).toEqual(second);
    expect(first.completeness).toBe('complete');
    expect(first.dependencies).toEqual([
      expect.objectContaining({
        specifier: '@value',
        resolution: 'resolved-project',
        target: 'src/value.ts',
      }),
    ]);
    expect(JSON.stringify(first)).not.toContain(firstLayout.root);
    expect(JSON.stringify(second)).not.toContain(secondLayout.root);

    fs.rmSync(firstLayout.tsconfig);
    const missing = resolveCandidateFacts({ ...firstLayout, config, ts: loaded.ts });
    expect(missing).toMatchObject({
      completeness: 'partial',
      completenessReasons: [expect.objectContaining({ code: 'TSCONFIG_PARSE_FAILURE' })],
    });
    expect(JSON.stringify(missing.completenessReasons)).not.toContain(firstLayout.root);
  });
});
