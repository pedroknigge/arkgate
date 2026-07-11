import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_IR_SCHEMA_VERSION,
  analyzeChange,
  analyzeProject,
  explainViolation,
  loadContract,
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
});
