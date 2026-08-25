import { describe, expect, it } from 'vitest';
import * as gate from '../../../src/gate';
import {
  createStrictArkKernel,
  ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION,
} from '../../../src/index';

function ownKeys(value: object): string[] {
  return [
    ...Object.getOwnPropertyNames(value),
    ...Object.getOwnPropertySymbols(value).map(String),
  ];
}

function assertNoLeakage(value: unknown): void {
  const visit = (node: unknown, path: string): void => {
    expect(typeof node, path).not.toBe('function');
    if (node === null || typeof node !== 'object') return;
    for (const key of ownKeys(node)) {
      expect(key, path).not.toMatch(/^(factory|factories|instance|instances|input|dto|payload)$/i);
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, '$');
}

describe('RN10 ArkRun registration + information package', () => {
  it('keeps the information package API off the stable gate root', () => {
    expect(
      (gate as { getDependencyInformationPackage?: unknown }).getDependencyInformationPackage
    ).toBeUndefined();
    expect(
      (gate as { buildDependencyInformationPackage?: unknown }).buildDependencyInformationPackage
    ).toBeUndefined();
    expect((gate as { createStrictArkKernel?: unknown }).createStrictArkKernel).toBeUndefined();
  });

  it('accepts uses/reactsTo/raises/sends without requiring a factory', () => {
    const ark = createStrictArkKernel();
    const handle = ark.register({
      id: 'Application.PlaceOrder',
      uses: ['Domain.OrderRepository'],
      reactsTo: ['Domain.Order.Cancelled'],
      raises: ['Domain.Order.Placed'],
      sends: ['Adapter.NotifyWarehouse'],
      extendedInfo: {
        label: 'Place order',
        architectureKind: 'use-case',
        tags: ['orders'],
        group: 'sales',
        metadata: { owner: 'sales' },
      },
    });

    expect(handle.id).toBe('Application.PlaceOrder');
    expect(handle.lifetime).toBe('singleton');
    expect(handle.uses).toEqual(['Domain.OrderRepository']);
    expect(handle.reactsTo).toEqual(['Domain.Order.Cancelled']);
    expect(handle.raises).toEqual(['Domain.Order.Placed']);
    expect(handle.sends).toEqual(['Adapter.NotifyWarehouse']);
    expect(handle.extendedInfo?.label).toBe('Place order');
    expect('factory' in handle).toBe(false);
    assertNoLeakage(handle);
    (handle.uses as string[]).push('leaked');
    if (handle.extendedInfo?.metadata) handle.extendedInfo.metadata.owner = 'mutated';
    expect(ark.getDependencyInformationPackage().components[0]?.uses).toEqual([
      'Domain.OrderRepository',
    ]);
    expect(
      ark.getDependencyInformationPackage().components[0]?.extendedInfo?.metadata?.owner
    ).toBe('sales');
    expect(() => ark.resolve('Application.PlaceOrder')).toThrow(/no factory/);
  });

  it('resolves singleton vs transient and never puts instances on the package', () => {
    const ark = createStrictArkKernel({ instanceId: 'kernel-rn10' });
    let created = 0;
    ark.register({
      id: 'Domain.OrderRepository',
      factory: () => {
        created += 1;
        return { kind: 'repo', n: created };
      },
    });
    ark.register({
      id: 'Application.BillingWorker',
      lifetime: 'transient',
      uses: ['Domain.OrderRepository'],
      factory: () => ({ kind: 'worker', n: created }),
    });

    const first = ark.resolve<{ kind: string; n: number }>('Domain.OrderRepository');
    const again = ark.resolveSingleton<{ kind: string; n: number }>('Domain.OrderRepository');
    expect(first).toBe(again);
    expect(created).toBe(1);

    const workerA = ark.resolve<{ kind: string }>('Application.BillingWorker');
    const workerB = ark.resolve<{ kind: string }>('Application.BillingWorker');
    expect(workerA).not.toBe(workerB);
    expect(() => ark.resolveSingleton('Application.BillingWorker')).toThrow(/transient/);

    const pkg = ark.getDependencyInformationPackage();
    expect(pkg.schemaVersion).toBe(ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION);
    expect(pkg.kernelInstanceId).toBe('kernel-rn10');
    expect(pkg.components.map((c) => c.id)).toEqual([
      'Application.BillingWorker',
      'Domain.OrderRepository',
    ]);
    expect(pkg.components[0]?.lifetime).toBe('transient');
    expect(pkg.components[0]?.uses).toEqual(['Domain.OrderRepository']);
    expect(pkg.components[1]?.lifetime).toBe('singleton');
    assertNoLeakage(pkg);
    expect(JSON.parse(JSON.stringify(pkg))).toEqual(pkg);
    expect(JSON.stringify(pkg)).not.toMatch(/kind":"repo"|kind":"worker"/);
  });

  it('isolates registrations per kernel instance and rejects duplicate ids', () => {
    const a = createStrictArkKernel();
    const b = createStrictArkKernel();
    a.register({
      id: 'Application.PlaceOrder',
      uses: ['Domain.OrderRepository'],
      factory: () => ({ from: 'a' }),
    });
    expect(b.getDependencyInformationPackage().components).toEqual([]);
    expect(() => b.resolve('Application.PlaceOrder')).toThrow(/not registered/);
    expect(() => a.register({ id: 'Application.PlaceOrder' })).toThrow(/already registered/);
    expect(() => a.register({ id: '  ' })).toThrow(/non-empty string/);
    expect(() =>
      a.register({ id: 'X', lifetime: 'scoped' as unknown as 'singleton' })
    ).toThrow(/singleton" or "transient"/);
  });

  it('detects circular resolve without leaking the factory', () => {
    const ark = createStrictArkKernel();
    ark.register({
      id: 'A',
      uses: ['B'],
      factory: () => ark.resolve('B'),
    });
    ark.register({
      id: 'B',
      uses: ['A'],
      factory: () => ark.resolve('A'),
    });
    expect(() => ark.resolve('A')).toThrow(/circular resolve/);
    const pkg = ark.getDependencyInformationPackage();
    assertNoLeakage(pkg);
    expect(pkg.components.map((c) => c.id)).toEqual(['A', 'B']);
  });
});
