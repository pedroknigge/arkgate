import type { ATx } from '@/lib/repositories/a-db-executor';

export async function upsertEvent(tx: ATx) {
  await tx`INSERT INTO events (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET a = 1`;
}
