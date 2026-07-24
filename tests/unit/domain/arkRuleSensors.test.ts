import { describe, expect, it } from 'vitest';
import {
  buildEffectiveArkRules,
  loadArkRulesContract,
} from '../../../src/domain/arkRulesContract';
import {
  buildArkRuleFileHints,
  collectEmptyAppliesToFindings,
  deriveArkRuleFileHints,
  evaluateArkRuleSensors,
  extractClassShapesFromSource,
} from '../../../src/domain/arkRuleSensors';

function effective(structure: unknown[]) {
  const file = loadArkRulesContract({
    schemaVersion: '1.0',
    layer: 'DomainModel',
    structure,
  }).config;
  return buildEffectiveArkRules([
    { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file },
  ]);
}

describe('AR05–AR07 ArkRules sensors', () => {
  it('extracts public mutable state and factory shape (AR05)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `
export class Order {
  public total: number = 0;
  constructor(total: number) { this.total = total; }
  setTotal(n: number) { this.total = n; }
}
export class Money {
  private constructor(readonly amount: number) {}
  static create(amount: number): Money { return new Money(amount); }
}
`
    );
    const order = shapes.find((s) => s.className === 'Order');
    const money = shapes.find((s) => s.className === 'Money');
    expect(order?.hasPublicMutableFields).toBe(true);
    expect(order?.hasPublicConstructor).toBe(true);
    expect(order?.hasStaticFactory).toBe(false);
    expect(money?.hasPublicConstructor).toBe(false);
    expect(money?.hasStaticFactory).toBe(true);
  });

  it('blocks aggregate-private-state and always-valid-factory in enforced mode (AR06)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `export class Order { public total = 0; constructor() {} setTotal(n: number) { this.total = n; } }`
    );
    const arkRules = effective([
      { id: 'private-state', sensor: 'aggregate-private-state', mode: 'enforced' },
      { id: 'factory', sensor: 'always-valid-factory', mode: 'enforced' },
    ]);
    const findings = evaluateArkRuleSensors({
      arkRules,
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(findings.some((f) => f.arkruleId === 'private-state' && f.failsStrict)).toBe(true);
    expect(findings.some((f) => f.arkruleId === 'factory' && f.failsStrict)).toBe(true);
    expect(findings.every((f) => f.arkruleSource === 'arkrules/DomainModel.json')).toBe(true);
  });

  it('stays advisory in advisory mode and silent without rules', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `export class Order { public total = 0; constructor() {} }`
    );
    const advisory = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'private-state', sensor: 'aggregate-private-state', mode: 'advisory' },
      ]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(advisory).toHaveLength(1);
    expect(advisory[0]?.failsStrict).toBe(false);

    const silent = evaluateArkRuleSensors({
      arkRules: buildEffectiveArkRules([]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(silent).toEqual([]);
  });

  it('flags domain-event-on-mutation when mutators lack publish/guard (AR06)', () => {
    const shapes = extractClassShapesFromSource(
      'src/domain/order.ts',
      `
export class Order {
  private total = 0;
  private constructor() {}
  static create() { return new Order(); }
  increase() { this.total = this.total + 1; }
  decrease() { this.total = this.total - 1; this.ensureInvariants(); }
}
`
    );
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'events', sensor: 'domain-event-on-mutation', mode: 'enforced' },
      ]),
      classShapes: shapes,
      files: ['src/domain/order.ts'],
    });
    expect(findings.some((f) => f.message.includes('increase'))).toBe(true);
    expect(findings.some((f) => f.message.includes('decrease'))).toBe(false);
  });

  it('evaluates orchestration-only, thin-adapter, and no-anemic-model (AR07)', () => {
    const anemicShapes = extractClassShapesFromSource(
      'src/domain/customer.ts',
      `export class Customer { public id: string; public name: string; }`
    );
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        { id: 'orch', sensor: 'orchestration-only', mode: 'advisory', appliesTo: ['src/application/**'] },
        { id: 'thin', sensor: 'thin-adapter', mode: 'advisory', appliesTo: ['src/adapters/**'] },
        { id: 'anemic', sensor: 'no-anemic-model', mode: 'advisory' },
      ]),
      classShapes: anemicShapes,
      files: ['src/application/place-order.ts', 'src/adapters/http.ts', 'src/domain/customer.ts'],
      fileHints: {
        'src/application/place-order.ts': { orchestrationHeavy: true },
        'src/adapters/http.ts': { adapterThick: true },
      },
    });
    expect(findings.some((f) => f.arkruleId === 'orch')).toBe(true);
    expect(findings.some((f) => f.arkruleId === 'thin')).toBe(true);
    expect(findings.some((f) => f.arkruleId === 'anemic' && f.failsStrict === false)).toBe(true);
  });

  it('derives conservative fileHints from source (AR07 wiring)', () => {
    const heavy = `
export function canPlaceOrder(order: Order) { return order.total > 0; }
export function calculateDiscount(order: Order) { return order.total * 0.1; }
export function shouldNotify(order: Order) { return order.status === 'paid'; }
`;
    const thick = `
import { PrismaClient } from '@prisma/client';
export function canShip(order: Order) { return order.status === 'paid'; }
export function toDomain(row: Row) { return { id: row.id }; }
export async function save(order: Order) {
  if (order.total < 0) throw new Error('bad');
  if (order.status === 'cancelled') return;
  const prisma = new PrismaClient();
  await prisma.order.create({ data: order });
}
`;
    const clean = `export async function placeOrder(deps, cmd) { return deps.orders.save(cmd); }`;

    expect(deriveArkRuleFileHints('src/application/heavy.ts', heavy)?.orchestrationHeavy).toBe(
      true
    );
    expect(deriveArkRuleFileHints('src/adapters/thick.ts', thick)?.adapterThick).toBe(true);
    expect(deriveArkRuleFileHints('src/application/clean.ts', clean)).toBeNull();

    const hints = buildArkRuleFileHints({
      'src/application/heavy.ts': heavy,
      'src/adapters/thick.ts': thick,
      'src/application/clean.ts': clean,
    });
    expect(hints['src/application/heavy.ts']?.orchestrationHeavy).toBe(true);
    expect(hints['src/adapters/thick.ts']?.adapterThick).toBe(true);
    expect(hints['src/application/clean.ts']).toBeUndefined();

    // End-to-end: derived hints fire sensors without manual fileHints.
    const findings = evaluateArkRuleSensors({
      arkRules: effective([
        {
          id: 'orch',
          sensor: 'orchestration-only',
          mode: 'advisory',
          appliesTo: ['src/application/**'],
        },
        {
          id: 'thin',
          sensor: 'thin-adapter',
          mode: 'advisory',
          appliesTo: ['src/adapters/**'],
        },
      ]),
      classShapes: [],
      files: Object.keys(hints).concat(['src/application/clean.ts']),
      fileHints: hints,
    });
    expect(findings.some((f) => f.arkruleId === 'orch' && f.file.includes('heavy'))).toBe(true);
    expect(findings.some((f) => f.arkruleId === 'thin' && f.file.includes('thick'))).toBe(true);
    expect(findings.some((f) => f.file.includes('clean'))).toBe(false);
  });

  it('warns on zero-match appliesTo (ADR 0012 empty scope)', () => {
    const arkRules = effective([
      {
        id: 'missing-scope',
        sensor: 'aggregate-private-state',
        mode: 'advisory',
        appliesTo: ['src/domain/**/aggregates/**'],
      },
      {
        id: 'enforced-miss',
        sensor: 'always-valid-factory',
        mode: 'enforced',
        appliesTo: ['src/nowhere/**'],
      },
    ]);
    const empty = collectEmptyAppliesToFindings(arkRules, [
      'src/domain/order.ts',
      'src/application/place.ts',
    ]);
    expect(empty).toHaveLength(2);
    expect(empty.every((f) => f.ruleId === 'ARKRULE_SCOPE_EMPTY')).toBe(true);
    expect(empty.find((f) => f.arkruleId === 'missing-scope')?.failsStrict).toBe(false);
    expect(empty.find((f) => f.arkruleId === 'enforced-miss')?.failsStrict).toBe(true);

    const hit = collectEmptyAppliesToFindings(
      effective([
        {
          id: 'ok',
          sensor: 'aggregate-private-state',
          mode: 'enforced',
          appliesTo: ['src/domain/**'],
        },
      ]),
      ['src/domain/order.ts']
    );
    expect(hit).toEqual([]);
  });
});
