import { describe, expect, it } from 'vitest';
import { InMemoryOutboxStore, defineIntent, defaultIntentRegistry } from '../../../src/index';

describe('InMemoryOutboxStore', () => {
  it('enqueues and marks event delivery state', async () => {
    defaultIntentRegistry.clear();
    const Event = defineIntent<'Domain.Test.Outbox', { id: string }>('Domain.Test.Outbox');
    const outbox = new InMemoryOutboxStore();

    const record = await outbox.enqueue(Event({ id: '1' }));
    expect(await outbox.list('pending')).toHaveLength(1);

    await outbox.markDispatched(record.id);
    expect(await outbox.list('pending')).toHaveLength(0);
    expect(await outbox.list('dispatched')).toHaveLength(1);
  });

  it('Q8: markFailed increments attempts (retry boundary) and clear drops durability', async () => {
    defaultIntentRegistry.clear();
    const Event = defineIntent<'Domain.Test.OutboxRetry', { id: string }>(
      'Domain.Test.OutboxRetry'
    );
    const outbox = new InMemoryOutboxStore();
    const record = await outbox.enqueue(Event({ id: 'r1' }));
    await outbox.markFailed(record.id, new Error('network'));
    await outbox.markFailed(record.id, new Error('network-2'));
    const failed = await outbox.list('failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].attempts).toBe(2);
    expect(failed[0].error).toMatch(/network/);
    // Restart/durability boundary: InMemory clear loses state (not production durable)
    await outbox.clear();
    expect(await outbox.list()).toHaveLength(0);
    const again = await outbox.enqueue(Event({ id: 'r2' }));
    expect(again.id).not.toBe(record.id);
    expect(await outbox.list('pending')).toHaveLength(1);
  });
});
