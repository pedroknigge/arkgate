/** BackgroundJobsScheduling — entrypoints for cron or queue workers. */

import { processOutbox } from '../application/process-outbox.js';
import type { OutboxStore } from '../domain/outbox.js';

export async function runNightlySync(store: OutboxStore): Promise<number> {
  return processOutbox(store, 50);
}