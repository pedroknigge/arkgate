/** ApplicationOrchestration — business steps a job may invoke. */

import type { OutboxStore } from '../domain/outbox.js';

export async function processOutbox(store: OutboxStore, batchSize: number): Promise<number> {
  const batch = await store.claim(batchSize);
  for (const item of batch) {
    await store.markDone(item.id);
  }
  return batch.length;
}