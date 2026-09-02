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

/** A11: file-local structure + hints vs full-tree graph. */
function boundedProject() {
  const { root } = project();
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/application'), { recursive: true });
  fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\n');
  fs.writeFileSync(
    path.join(root, 'src/domain/clean.ts'),
    "import { Order } from './order';\nexport const clean = 1;\nexport type T = typeof Order;\n"
  );
  fs.writeFileSync(
    path.join(root, 'src/domain/order.ts'),
    [
      "import { db } from '../infra/db';",
      "import { clean } from './clean';",
      'export class Order { public total = 0; constructor() {} setTotal(n: number) { this.total = n; } }',
      'export const uses = { db, clean };',
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(root, 'src/application/heavy.ts'),
    [
      'export function canPlaceOrder(order: { total: number }) { return order.total > 0; }',
      'export function calculateDiscount(order: { total: number }) { return order.total * 0.1; }',
      "export function shouldNotify(order: { status: string }) { return order.status === 'paid'; }",
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(root, 'arkrules/DomainModel.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      layer: 'DomainModel',
      structure: [
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
      ],
      invariants: [],
    })
  );
  fs.writeFileSync(
    path.join(root, 'arkrules/ApplicationOrchestration.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      layer: 'ApplicationOrchestration',
      structure: [{ id: 'orch', sensor: 'orchestration-only', mode: 'advisory' }],
      invariants: [],
    })
  );
  const config = {
    schemaVersion: '1.3',
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
      { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
    ],
    rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    arkRules: {
      DomainModel: 'arkrules/DomainModel.json',
      ApplicationOrchestration: 'arkrules/ApplicationOrchestration.json',
    },
  };
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config));
  return {
    root,
    config,
    files: {
      clean: path.join(root, 'src/domain/clean.ts'),
      order: path.join(root, 'src/domain/order.ts'),
      heavy: path.join(root, 'src/application/heavy.ts'),
      db: path.join(root, 'src/infra/db.ts'),
    },
  };
}

function findingOn(
  rows: Array<{ ruleId?: string; file?: string; message?: string; arkruleId?: string }>,
  file: string,
  match: (row: { ruleId?: string; message?: string; arkruleId?: string }) => boolean
) {
  return rows.some((row) => row.file === file && match(row));
}

function isPrivateState(row: { ruleId?: string; message?: string; arkruleId?: string }) {
  return (
    row.ruleId === 'ARKRULE_STRUCTURE' &&
    (row.arkruleId === 'private-state' || String(row.message ?? '').includes('aggregate-private-state'))
  );
}

function isOrchestration(row: { ruleId?: string; message?: string; arkruleId?: string }) {
  return (
    row.arkruleId === 'orch' || String(row.message ?? '').includes('orchestration-only')
  );
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
    const leanSnapshot = resolveArchitectureSnapshot({ ...options, captureInputs: false });
    const legacyResult = runArchitectureScan(options);

    expect(snapshot.result).toEqual(legacyResult);
    expect(JSON.stringify(snapshot.result)).toBe(JSON.stringify(legacyResult));
    expect(leanSnapshot.result).toEqual(snapshot.result);
    expect(leanSnapshot.facts).toEqual(snapshot.facts);
    expect(leanSnapshot.inputs).toEqual([]);
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

  it('honors files for file-local structure sensors and hint load; graph still sees the full tree', async () => {
    const { root, config, files } = boundedProject();
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const base = {
      root,
      config,
      manifest: null,
      rules: config.rules,
      ts: loaded.ts,
      args: { config: 'ark.config.json' },
    };

    const full = resolveArchitectureSnapshot({ ...base, files: [] });
    expect(findingOn(full.result.violations, 'src/domain/order.ts', isPrivateState)).toBe(true);
    expect(
      findingOn(
        full.result.violations,
        'src/domain/order.ts',
        (row) => row.ruleId === 'LAYER_IMPORT_VIOLATION'
      )
    ).toBe(true);
    expect(
      findingOn(full.result.violations, 'src/domain/clean.ts', (row) => row.ruleId === 'CIRCULAR_DEPENDENCY') ||
        findingOn(full.result.violations, 'src/domain/order.ts', (row) => row.ruleId === 'CIRCULAR_DEPENDENCY')
    ).toBe(true);
    expect(findingOn(full.result.warnings, 'src/application/heavy.ts', isOrchestration)).toBe(true);

    const changedClean = resolveArchitectureSnapshot({ ...base, files: [files.clean] });
    expect(changedClean.facts.factsHash).toBe(full.facts.factsHash);
    expect(changedClean.facts.files.map((file: { path: string }) => file.path).sort()).toEqual(
      full.facts.files.map((file: { path: string }) => file.path).sort()
    );
    expect(findingOn(changedClean.result.violations, 'src/domain/order.ts', isPrivateState)).toBe(
      false
    );
    expect(findingOn(changedClean.result.warnings, 'src/application/heavy.ts', isOrchestration)).toBe(
      false
    );
    expect(
      findingOn(
        changedClean.result.violations,
        'src/domain/order.ts',
        (row) => row.ruleId === 'LAYER_IMPORT_VIOLATION'
      )
    ).toBe(true);
    expect(
      findingOn(changedClean.result.violations, 'src/domain/clean.ts', (row) => row.ruleId === 'CIRCULAR_DEPENDENCY') ||
        findingOn(changedClean.result.violations, 'src/domain/order.ts', (row) => row.ruleId === 'CIRCULAR_DEPENDENCY')
    ).toBe(true);

    const changedOrder = resolveArchitectureSnapshot({ ...base, files: [files.order] });
    expect(findingOn(changedOrder.result.violations, 'src/domain/order.ts', isPrivateState)).toBe(
      true
    );
    expect(findingOn(changedOrder.result.warnings, 'src/application/heavy.ts', isOrchestration)).toBe(
      false
    );
    expect(
      findingOn(
        changedOrder.result.violations,
        'src/domain/order.ts',
        (row) => row.ruleId === 'LAYER_IMPORT_VIOLATION'
      )
    ).toBe(true);

    const changedHeavy = resolveArchitectureSnapshot({ ...base, files: [files.heavy] });
    expect(findingOn(changedHeavy.result.violations, 'src/domain/order.ts', isPrivateState)).toBe(
      false
    );
    expect(findingOn(changedHeavy.result.warnings, 'src/application/heavy.ts', isOrchestration)).toBe(
      true
    );
    expect(
      findingOn(
        changedHeavy.result.violations,
        'src/domain/order.ts',
        (row) => row.ruleId === 'LAYER_IMPORT_VIOLATION'
      )
    ).toBe(true);
  });
});
