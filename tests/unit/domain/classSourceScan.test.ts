import { describe, expect, it } from 'vitest';
import {
  evaluateArkRuleSensors,
  extractClassShapesFromSource,
} from '../../../src/domain/arkRuleSensors';
import { buildEffectiveArkRules, loadArkRulesContract } from '../../../src/domain/arkRulesContract';
import { findClassDeclarations } from '../../../src/domain/classSourceScan';
import { extractClassShapesFromSource as extractCli } from '../../../bin/lib/arkrules-sensors.mjs';

function shapeRow(file: string, source: string) {
  return extractClassShapesFromSource(file, source).map((shape) => ({
    className: shape.className,
    hasPublicMutableFields: shape.hasPublicMutableFields,
    truncatedUntil: Object.getOwnPropertyDescriptor(shape, 'truncatedUntil')?.value as
      | number
      | undefined,
  }));
}

function privateStateRules() {
  const file = loadArkRulesContract({
    schemaVersion: '1.0',
    layer: 'Domain',
    structure: [{ id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' }],
  }).config;
  return buildEffectiveArkRules([{ layer: 'Domain', sourceFile: 'arkrules/Domain.json', file }]);
}

describe('class-shape extractor robustness (arkrules cluster)', () => {
  it('sees generic classes', () => {
    expect(shapeRow('box.ts', 'export class Box<T> { public value: T | undefined; }')).toEqual([
      { className: 'Box', hasPublicMutableFields: true, truncatedUntil: undefined },
    ]);
    expect(
      shapeRow(
        'b.ts',
        'export class B<T extends object> extends Base<T> implements I<T> { public v = 1; }'
      )
    ).toEqual([{ className: 'B', hasPublicMutableFields: true, truncatedUntil: undefined }]);
    expect(
      shapeRow('c.ts', 'export class C extends Base<{ a: 1 }> { public v = 1; }')
    ).toEqual([{ className: 'C', hasPublicMutableFields: true, truncatedUntil: undefined }]);
    expect(shapeRow('d.ts', 'export class D<T = () => void> { public v = 1; }')).toEqual([
      { className: 'D', hasPublicMutableFields: true, truncatedUntil: undefined },
    ]);
  });

  it('does not let a brace inside a string or template literal close the class', () => {
    expect(
      shapeRow('order.ts', 'export class Order { private readonly sep = "}"; public total = 0; }')
    ).toEqual([{ className: 'Order', hasPublicMutableFields: true, truncatedUntil: undefined }]);
    expect(
      shapeRow('o.ts', 'export class O { private s = `a}b`; public total = 0; }')
    ).toEqual([{ className: 'O', hasPublicMutableFields: true, truncatedUntil: undefined }]);
  });

  it('ignores class declarations that only appear in comments', () => {
    expect(
      shapeRow('r.ts', '// export class Fake { public x = 1; }\nexport class Real { private y = 1; }')
    ).toEqual([{ className: 'Real', hasPublicMutableFields: false, truncatedUntil: undefined }]);
  });

  it('marks an unwalkable header as truncated instead of dropping the class', () => {
    const rows = shapeRow('z.ts', 'export class Z<T { public v = 1; }');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.className).toBe('Z');
    expect(typeof rows[0]?.truncatedUntil).toBe('number');
  });

  it('enforced aggregate-private-state reports all three classes and flags truncation', () => {
    const files: Record<string, string> = {
      'src/domain/plain.ts': 'export class Plain { public total = 0; }',
      'src/domain/box.ts': 'export class Box<T> { public value: T | undefined; }',
      'src/domain/order.ts':
        'export class Order { private readonly sep = "}"; public total = 0; }',
    };
    const classShapes = Object.entries(files).flatMap(([file, src]) =>
      extractClassShapesFromSource(file, src)
    );
    const findings = evaluateArkRuleSensors({
      arkRules: privateStateRules(),
      classShapes,
      files: Object.keys(files),
    });
    expect(findings.map((f) => f.file).sort()).toEqual([
      'src/domain/box.ts',
      'src/domain/order.ts',
      'src/domain/plain.ts',
    ]);
    const truncated = evaluateArkRuleSensors({
      arkRules: privateStateRules(),
      classShapes: extractClassShapesFromSource('src/domain/z.ts', 'export class Z<T { x = 1 }'),
      files: ['src/domain/z.ts'],
    });
    expect(truncated).toHaveLength(1);
    expect(truncated[0]?.message).toMatch(/shape analysed until character \d+/);
    expect(truncated[0]?.severity).toBe('error');
  });

  it('keeps the generated CLI extractor aligned', () => {
    const source =
      'export class Box<T> { public value: T | undefined; }\nexport class Order { private sep = "}"; public total = 0; }';
    expect(JSON.stringify(extractCli('f.ts', source))).toBe(
      JSON.stringify(extractClassShapesFromSource('f.ts', source))
    );
  });

  it('findClassDeclarations locates non-exported and default classes when asked', () => {
    const decls = findClassDeclarations(
      'class A {}\nexport default class B<T> { x = "}"; }\nexport abstract class C {}'
    );
    expect(decls.map((d) => [d.name, d.exported, d.bodyEnd !== null])).toEqual([
      ['A', false, true],
      ['B', true, true],
      ['C', true, true],
    ]);
  });
});
