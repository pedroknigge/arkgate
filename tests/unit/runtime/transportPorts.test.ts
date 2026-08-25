import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as gate from '../../../src/gate';
import {
  ARK_RUN_EPHEMERAL_DEFAULT,
  InvalidArkRunSendOptionError,
  SourceMetadataOverrideError,
  createStrictArkKernel,
  type ArkKernel,
  type DomainEvent,
} from '../../../src/index';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const CLOUD_SDK_TOKENS = [
  '@aws-sdk/',
  'aws-sdk',
  '@azure/',
  '@google-cloud/',
  'kafkajs',
  'amqplib',
  'bullmq',
];

function setupOrder(ark: ArkKernel) {
  const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
    'Domain.Order.Placed'
  );
  ark.registry.define('Application.PlaceOrder', { produces: ['Domain.Order.Placed'] });
  return { OrderPlaced, source: 'Application.PlaceOrder' as const };
}

describe('RN11 ArkRun transport ports', () => {
  it('keeps send ports off the stable gate root', () => {
    expect((gate as { send?: unknown }).send).toBeUndefined();
    expect((gate as { createStrictArkKernel?: unknown }).createStrictArkKernel).toBeUndefined();
    expect((gate as { ArkRunBrokerAdapter?: unknown }).ArkRunBrokerAdapter).toBeUndefined();
  });

  it('defaults ephemeral true and local fire-and-forget does not wait for handlers', async () => {
    expect(ARK_RUN_EPHEMERAL_DEFAULT).toBe(true);
    const ark = createStrictArkKernel({ strictEventContracts: false });
    const { OrderPlaced, source } = setupOrder(ark);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished = false;
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    ark.eventBus.subscribe(OrderPlaced, async () => {
      await blocked;
      finished = true;
      finish();
    });

    const result = await ark.send(OrderPlaced, { id: 'o1' }, { source });
    expect(result.transport).toBe('local');
    expect(result.ephemeral).toBe(true);
    expect(result.awaitHandlers).toBe(false);
    expect(result.awaitHandoff).toBe(true);
    expect(result.deliveredVia).toBe('local');
    expect(ark.eventBus.getHistory()).toHaveLength(1);
    expect(finished).toBe(false);

    release();
    await done;
    expect(finished).toBe(true);
  });

  it('localBlocking waits for local handlers even when ephemeral is false', async () => {
    const ark = createStrictArkKernel({
      strictEventContracts: false,
      ephemeral: false,
    });
    const { OrderPlaced, source } = setupOrder(ark);
    let finished = false;
    ark.eventBus.subscribe(OrderPlaced, async () => {
      await Promise.resolve();
      finished = true;
    });

    const result = await ark.send(OrderPlaced, { id: 'o2' }, {
      source,
      transport: 'localBlocking',
    });
    expect(result.transport).toBe('localBlocking');
    expect(result.awaitHandlers).toBe(true);
    expect(finished).toBe(true);
  });

  it('falls back broker to in-process local delivery when no adapter is bound', async () => {
    const ark = createStrictArkKernel({ strictEventContracts: false });
    const { OrderPlaced, source } = setupOrder(ark);
    let localHits = 0;
    ark.eventBus.subscribe(OrderPlaced, () => {
      localHits += 1;
    });

    const result = await ark.publisher(source).send(OrderPlaced, { id: 'o3' }, {
      transport: 'broker',
    });
    expect(result.transport).toBe('broker');
    expect(result.fallbackToLocal).toBe(true);
    expect(result.deliveredVia).toBe('local');
    await Promise.resolve();
    expect(localHits).toBe(1);
  });

  it('hands off to a bound broker and skips local subscribers', async () => {
    const received: DomainEvent[] = [];
    const ark = createStrictArkKernel({
      strictEventContracts: false,
      broker: {
        send(event) {
          received.push(event);
        },
      },
    });
    const { OrderPlaced, source } = setupOrder(ark);
    let localHits = 0;
    ark.eventBus.subscribe(OrderPlaced, () => {
      localHits += 1;
    });

    const result = await ark.send(OrderPlaced, { id: 'o4' }, {
      source,
      transport: 'broker',
    });
    expect(result.deliveredVia).toBe('broker');
    expect(result.fallbackToLocal).toBe(false);
    expect(result.awaitHandoff).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]?.payload).toEqual({ id: 'o4' });
    await Promise.resolve();
    expect(localHits).toBe(0);
    expect(ark.eventBus.getHistory()).toHaveLength(1);
  });

  it('ephemeral false returns before the broker adapter accepts', async () => {
    let release!: () => void;
    const gateHold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let accepted = false;
    let finishAccept!: () => void;
    const acceptedDone = new Promise<void>((resolve) => {
      finishAccept = resolve;
    });
    const ark = createStrictArkKernel({
      strictEventContracts: false,
      ephemeral: false,
      broker: {
        async send() {
          await gateHold;
          accepted = true;
          finishAccept();
        },
      },
    });
    const { OrderPlaced, source } = setupOrder(ark);
    const result = await ark.send(OrderPlaced, { id: 'o5' }, {
      source,
      transport: 'broker',
    });
    expect(result.ephemeral).toBe(false);
    expect(result.awaitHandoff).toBe(false);
    expect(accepted).toBe(false);
    release();
    await acceptedDone;
    expect(accepted).toBe(true);
  });

  it('isolates brokers per kernel instance', async () => {
    const hits = { a: 0, b: 0 };
    const a = createStrictArkKernel({
      strictEventContracts: false,
      broker: { send() { hits.a += 1; } },
    });
    const b = createStrictArkKernel({
      strictEventContracts: false,
      broker: { send() { hits.b += 1; } },
    });
    const orderA = setupOrder(a);
    const orderB = setupOrder(b);
    await a.send(orderA.OrderPlaced, { id: 'a' }, {
      source: orderA.source,
      transport: 'broker',
    });
    expect(hits).toEqual({ a: 1, b: 0 });
    await b.send(orderB.OrderPlaced, { id: 'b' }, {
      source: orderB.source,
      transport: 'broker',
    });
    expect(hits).toEqual({ a: 1, b: 1 });
  });

  it('rejects unknown transport and source override on send', async () => {
    const ark = createStrictArkKernel({ strictEventContracts: false });
    const { OrderPlaced, source } = setupOrder(ark);
    await expect(
      ark.send(OrderPlaced, { id: 'bad' }, {
        source,
        transport: 'kafka' as never,
      })
    ).rejects.toBeInstanceOf(InvalidArkRunSendOptionError);

    await expect(
      ark.publisher(source).send(OrderPlaced, { id: 'bad-src' }, {
        metadata: { source: 'Application.Other' },
      })
    ).rejects.toBeInstanceOf(SourceMetadataOverrideError);
  });

  it('eventBus publish still waits for handlers (regression)', async () => {
    const ark = createStrictArkKernel({ strictEventContracts: false });
    const { OrderPlaced, source } = setupOrder(ark);
    let finished = false;
    ark.eventBus.subscribe(OrderPlaced, async () => {
      await Promise.resolve();
      finished = true;
    });
    await ark.eventBus.publish(OrderPlaced, { id: 'pub' }, { source });
    expect(finished).toBe(true);
  });

  it('does not ship cloud broker SDKs in the companion package', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'packages/runtime/package.json'), 'utf8')
    ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ].join('\n');
    for (const token of CLOUD_SDK_TOKENS) {
      expect(names.includes(token), token).toBe(false);
    }
    const transportSrc = fs.readFileSync(
      path.join(ROOT, 'src/kernel/runtime/transport.ts'),
      'utf8'
    );
    for (const token of CLOUD_SDK_TOKENS) {
      expect(transportSrc.includes(token), token).toBe(false);
    }
    const hardening = fs.readFileSync(
      path.join(ROOT, 'docs/production-hardening.md'),
      'utf8'
    );
    expect(hardening).toMatch(/does not ship cloud broker SDKs/i);
    expect(hardening).toMatch(/in-process local/);
    expect(hardening).toMatch(/not\*\* a durability claim/);
  });
});
