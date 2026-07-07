/** PersistenceAdapters — in-memory outbox for scaffolding. */

import type { OutboxItem, OutboxStore } from '../domain/outbox.js';

export function createInMemoryOutbox(seed: OutboxItem[] = []): OutboxStore {
  const pending = [...seed];
  const done = new Set<string>();
  return {
    async claim(limit) {
      return pending.filter((item) => !done.has(item.id)).slice(0, limit);
    },
    async markDone(id) {
      done.add(id);
    },
  };
}