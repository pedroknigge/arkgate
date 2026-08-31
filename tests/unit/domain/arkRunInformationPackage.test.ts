import { describe, expect, it } from 'vitest';
import {
  ARK_RUN_COMPONENT_LIFETIMES,
  ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION,
  appendDecisionTape,
  buildDependencyInformationPackage,
  sanitizeArkRunComponent,
} from '../../../src/domain/arkRunInformationPackage';

const ROOT_KEYS = ['schemaVersion', 'kernelInstanceId', 'components'];
const COMPONENT_KEYS = ['id', 'lifetime', 'uses', 'reactsTo', 'raises', 'sends', 'extendedInfo'];
const INFO_KEYS = ['label', 'architectureKind', 'tags', 'group', 'metadata'];

function walk(
  value: unknown,
  onNode: (node: unknown, path: string) => void,
  path = '$'
): void {
  onNode(value, path);
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, onNode, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    walk(child, onNode, `${path}.${key}`);
  }
}

describe('RN10 information package sanitizer', () => {
  it('locks schema version and closed lifetimes', () => {
    expect(ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION).toBe('1.0');
    expect([...ARK_RUN_COMPONENT_LIFETIMES]).toEqual(['singleton', 'transient']);
  });

  it('drops factories, live instances, and DTO payloads while keeping declarations', () => {
    const live = { secret: 'instance' };
    const factory = () => live;
    const pkg = buildDependencyInformationPackage({
      kernelInstanceId: 'kernel-1',
      components: [
        {
          id: 'Application.PlaceOrder',
          lifetime: 'singleton',
          uses: ['Domain.OrderRepository', 'Domain.OrderRepository'],
          reactsTo: ['Domain.Order.Cancelled'],
          raises: ['Domain.Order.Placed'],
          sends: ['Adapter.NotifyWarehouse'],
          factory,
          instance: live,
          input: { orderId: 'o-1' },
          dto: { amount: 10 },
          payload: { sku: 'sku-1' },
          extendedInfo: {
            label: 'Place order',
            architectureKind: 'use-case',
            tags: ['orders', 'orders'],
            group: 'sales',
            factory,
            metadata: {
              owner: 'sales',
              count: 2,
              ok: true,
              empty: null,
              nestedDto: { orderId: 'o-1' },
              fn: factory,
            },
          },
        },
        { id: '  ' },
        { lifetime: 'transient' },
      ],
    });

    expect(pkg.schemaVersion).toBe('1.0');
    expect(pkg.kernelInstanceId).toBe('kernel-1');
    expect(pkg.components).toHaveLength(1);
    expect(pkg.components[0]).toEqual({
      id: 'Application.PlaceOrder',
      lifetime: 'singleton',
      uses: ['Domain.OrderRepository'],
      reactsTo: ['Domain.Order.Cancelled'],
      raises: ['Domain.Order.Placed'],
      sends: ['Adapter.NotifyWarehouse'],
      extendedInfo: {
        label: 'Place order',
        architectureKind: 'use-case',
        tags: ['orders'],
        group: 'sales',
        metadata: { count: 2, empty: null, ok: true, owner: 'sales' },
      },
    });

    const keys: string[] = [];
    walk(pkg, (node, path) => {
      expect(typeof node).not.toBe('function');
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        keys.push(...Object.keys(node).map((key) => `${path}.${key}`));
      }
    });
    expect(
      keys.some((key) =>
        /\.(factory|factories|instance|instances|input|dto|payload|nestedDto)$/i.test(key)
      )
    ).toBe(false);
    expect(Object.keys(pkg).sort()).toEqual([...ROOT_KEYS].sort());
    expect(Object.keys(pkg.components[0]!).sort()).toEqual(
      [...COMPONENT_KEYS].sort()
    );
    expect(Object.keys(pkg.components[0]!.extendedInfo!).sort()).toEqual(
      [...INFO_KEYS].sort()
    );
    expect(JSON.parse(JSON.stringify(pkg))).toEqual(pkg);
  });

  it('defaults unknown lifetime, sorts components, and omits empty extendedInfo', () => {
    const pkg = buildDependencyInformationPackage({
      kernelInstanceId: 12,
      components: [
        { id: 'B.Second', uses: ['Z'] },
        { id: 'A.First', lifetime: 'nope', raises: ['E'], extendedInfo: { label: '' } },
        { id: 'A.First', uses: ['ignored-duplicate'] },
      ],
    });
    expect(pkg.kernelInstanceId).toBe('');
    expect(pkg.components.map((c) => c.id)).toEqual(['A.First', 'B.Second']);
    expect(pkg.components[0]?.lifetime).toBe('singleton');
    expect(pkg.components[0]?.extendedInfo).toBeUndefined();
    expect(pkg.components[0]?.raises).toEqual(['E']);
    expect(pkg.components[1]?.uses).toEqual(['Z']);
  });

  it('appends a sanitized decision tape without changing component keys (LV06)', () => {
    const base = buildDependencyInformationPackage({
      kernelInstanceId: 'k1',
      components: [{ id: 'Application.Billing' }],
    });
    expect(Object.keys(base).sort()).toEqual([...ROOT_KEYS].sort());
    const withTape = appendDecisionTape(base, {
      xiHash: 'fnv1a-xi',
      event: { kind: 'SeatAdded', payload: { seats: 6, nested: { skip: true } } },
      residual: { kind: 'hold', reasonCode: 'capacity', eventId: 'e1' },
      factory: () => 'nope',
    });
    expect(withTape.components).toEqual(base.components);
    expect(withTape.decisionTape).toEqual([
      {
        xiHash: 'fnv1a-xi',
        event: { kind: 'SeatAdded', payload: { seats: 6 } },
        residual: { kind: 'hold', reasonCode: 'capacity', eventId: 'e1' },
      },
    ]);
  });

  it('rejects non-object component records', () => {
    expect(sanitizeArkRunComponent(null)).toBeUndefined();
    expect(sanitizeArkRunComponent('PlaceOrder')).toBeUndefined();
    expect(sanitizeArkRunComponent(['uses'])).toBeUndefined();
    expect(
      buildDependencyInformationPackage({
        components: [null, 'x', 1, [], { id: 'Keep' }],
      }).components.map((c) => c.id)
    ).toEqual(['Keep']);
  });
});
