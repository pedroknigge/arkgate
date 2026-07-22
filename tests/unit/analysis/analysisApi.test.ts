import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_IR_SCHEMA_VERSION,
  analyzeChange,
  analyzeProject,
  explainViolation,
  loadContract,
  preflightChange,
} from '../../../src/index';

const contract = loadContract({
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'Kernel', patterns: ['src/kernel/**'] },
  ],
  rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false }],
});

describe('analysis API contract', () => {
  it('produces a deterministic, versioned IR for identical in-memory inputs', () => {
    const input = {
      contract,
      compilerOptions: { target: 'ES2022', strict: true },
      files: [
        { path: 'src/kernel/service.ts', content: 'export const service = 1;\n' },
        {
          path: 'src/domain/order.ts',
          content: "import { service } from '../kernel/service';\nexport const order = service;\n",
        },
      ],
    };

    const first = analyzeProject(input);
    const second = analyzeProject(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      mode: 'lexical-compatibility',
      completeness: 'partial',
      completenessReasons: [
        expect.objectContaining({ code: 'LEXICAL_EVIDENCE_INCOMPLETE' }),
      ],
      valid: false,
    });
    expect(first.ir.schemaVersion).toBe(ANALYSIS_IR_SCHEMA_VERSION);
    expect(first.ir.edges).toMatchObject([
      {
        from: 'src/domain/order.ts',
        to: 'src/kernel/service.ts',
        resolution: 'resolved',
        fromLayer: 'DomainModel',
        toLayer: 'Kernel',
      },
    ]);
    expect(first.ir.violations).toHaveLength(1);
    expect(explainViolation(first.ir.violations[0])).toContain('DomainModel->Kernel');
  });

  it('only declares an empty lexical candidate complete', () => {
    expect(analyzeProject({ contract, files: [] })).toMatchObject({
      mode: 'lexical-compatibility',
      completeness: 'complete',
      completenessReasons: [],
      valid: true,
    });
    expect(
      analyzeProject({
        contract,
        files: [{ path: 'src/domain/broken.ts', content: 'export const = ;\n' }],
      })
    ).toMatchObject({
      completeness: 'partial',
      valid: false,
    });
  });

  it('accepts post-edit and deletion content without filesystem access', () => {
    const before = [{ path: 'src/domain/order.ts', content: 'export const order = 1;\n' }];
    const result = analyzeChange({
      contract,
      files: before,
      changes: [
        { path: 'src/kernel/temp.ts', content: 'export const temporary = true;\n' },
        { path: 'src/domain/order.ts', delete: true },
      ],
    });

    expect(before).toEqual([{ path: 'src/domain/order.ts', content: 'export const order = 1;\n' }]);
    expect(result.ir.files).toEqual([
      expect.objectContaining({ path: 'src/kernel/temp.ts', layer: 'Kernel' }),
    ]);
  });

  it('records unresolved relative imports as evidence instead of dropping them', () => {
    const result = analyzeProject({
      contract,
      files: [{ path: 'src/domain/order.ts', content: "import './missing';\n" }],
    });

    expect(result.ir.edges).toEqual([
      expect.objectContaining({ resolution: 'unresolved', to: null, specifier: './missing' }),
    ]);
  });

  it('extracts static, export-from, and dynamic imports without matching comments or strings', () => {
    const result = analyzeProject({
      contract,
      files: [
        { path: 'src/kernel/a.ts', content: 'export const a = 1;\n' },
        { path: 'src/kernel/b.ts', content: 'export const b = 1;\n' },
        {
          path: 'src/domain/order.ts',
          content:
            "import { a } from '../kernel/a';\nexport { b } from '../kernel/b';\nvoid import('../kernel/a');\n// import '../kernel/nope';\nconst text = \"export { nope } from '../kernel/nope'\";\n",
        },
      ],
    });

    expect(result.ir.edges.map((edge) => edge.specifier)).toEqual([
      '../kernel/a',
      '../kernel/b',
      '../kernel/a',
    ]);
  });

  it('emits dependency edges for relative require like relative import (S4)', () => {
    const result = analyzeProject({
      contract,
      files: [
        { path: 'src/kernel/service.ts', content: 'export const service = 1;\n' },
        {
          path: 'src/domain/legacy.ts',
          content:
            "const service = require('../kernel/service');\nexport const order = service;\n",
        },
      ],
    });

    expect(result.ir.edges).toEqual([
      expect.objectContaining({
        from: 'src/domain/legacy.ts',
        specifier: '../kernel/service',
        to: 'src/kernel/service.ts',
        resolution: 'resolved',
        fromLayer: 'DomainModel',
        toLayer: 'Kernel',
      }),
    ]);
    expect(result.ir.violations).toHaveLength(1);
    // Package require still feeds capability evidence, not a graph edge.
    const pkg = analyzeProject({
      contract,
      files: [
        {
          path: 'src/domain/db.ts',
          content: "const pg = require('pg');\nexport const c = pg;\n",
        },
      ],
    });
    expect(pkg.ir.edges).toEqual([]);
    expect(pkg.ir.capabilityUses.some((use) => use.symbol === 'pg')).toBe(true);
  });

  it('preflights creates, updates, and deletes as one read-only hash-bound candidate', () => {
    const files = [
      { path: 'src/domain/order.ts', content: 'export const order = 1;\n' },
      { path: 'src/domain/obsolete.ts', content: 'export const obsolete = true;\n' },
    ];
    const result = preflightChange({
      contract,
      files,
      changes: [
        { path: 'src/domain/created.ts', content: 'export const created = true;\n' },
        { path: 'src/domain/order.ts', content: 'export const order = 2;\n' },
        { path: 'src/domain/obsolete.ts', delete: true },
      ],
    });

    expect(result).toMatchObject({
      schemaVersion: '1.0',
      mode: 'lexical-compatibility',
      valid: false,
      readOnly: true,
      policyHash: contract.policyHash,
      baseCompleteness: 'partial',
      candidateCompleteness: 'partial',
      changes: [
        { path: 'src/domain/created.ts', operation: 'create' },
        { path: 'src/domain/obsolete.ts', operation: 'delete' },
        { path: 'src/domain/order.ts', operation: 'update' },
      ],
      violations: [],
    });
    expect(result.baseTreeHash).not.toBe(result.candidateTreeHash);
    expect(result.changes[0].candidateContentHash).toMatch(/^fnv1a-/);
    expect(result.changes[1].beforeContentHash).toMatch(/^fnv1a-/);
    expect(result.changes[2]).toMatchObject({
      beforeContentHash: expect.stringMatching(/^fnv1a-/),
      candidateContentHash: expect.stringMatching(/^fnv1a-/),
    });
    expect(files).toEqual([
      { path: 'src/domain/order.ts', content: 'export const order = 1;\n' },
      { path: 'src/domain/obsolete.ts', content: 'export const obsolete = true;\n' },
    ]);
  });

  it('rejects forbidden edges and cycles that exist only in the complete batch', () => {
    const files = [{ path: 'src/domain/order.ts', content: 'export const order = 1;\n' }];
    const forbiddenChanges = [
      {
        path: 'src/domain/order.ts',
        content: "import { service } from '../kernel/service';\nexport const order = service;\n",
      },
      { path: 'src/kernel/service.ts', content: 'export const service = 1;\n' },
    ] as const;

    expect(preflightChange({ contract, files, changes: forbiddenChanges }).violations).toEqual([
      expect.objectContaining({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'src/domain/order.ts',
        target: 'src/kernel/service.ts',
      }),
    ]);
    expect(preflightChange({ contract, files, changes: [forbiddenChanges[0]] })).toMatchObject({
      valid: false,
      violations: [],
      candidateCompleteness: 'partial',
    });
    expect(preflightChange({ contract, files, changes: [forbiddenChanges[1]] })).toMatchObject({
      valid: false,
      violations: [],
      candidateCompleteness: 'partial',
    });

    const cycleContract = loadContract({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    });
    const cycleChanges = [
      {
        path: 'src/domain/a.ts',
        content: "import { b } from './b';\nexport const a = b;\n",
      },
      {
        path: 'src/domain/b.ts',
        content: "import { a } from './a';\nexport const b = a;\n",
      },
    ] as const;
    const cycle = preflightChange({ contract: cycleContract, files: [], changes: cycleChanges });
    expect(cycle.valid).toBe(false);
    expect(cycle.violations).toEqual([
      expect.objectContaining({ ruleId: 'CIRCULAR_DEPENDENCY', file: 'src/domain/a.ts' }),
    ]);
    expect(
      preflightChange({ contract: cycleContract, files: [], changes: [cycleChanges[0]] })
    ).toMatchObject({ valid: false, violations: [], baseCompleteness: 'complete' });
    expect(
      preflightChange({ contract: cycleContract, files: [], changes: [cycleChanges[1]] })
    ).toMatchObject({ valid: false, violations: [], baseCompleteness: 'complete' });
  });

  it('fails stale or ambiguous change sets before a host can commit them', () => {
    const result = preflightChange({
      contract,
      files: [{ path: 'src/domain/order.ts', content: 'export const order = 1;\n' }],
      changes: [
        { path: 'src/domain/missing.ts', delete: true },
        { path: 'src/domain/order.ts', content: 'export const order = 2;\n' },
        { path: './src/domain/order.ts', delete: true },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.violations.map(({ ruleId }) => ruleId)).toEqual([
      'DELETE_TARGET_MISSING',
      'DUPLICATE_CHANGE_PATH',
    ]);
  });
});
