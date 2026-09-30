import type { ATx } from '@/lib/repositories/a-db-executor';

export async function readOrder(tx: ATx) {
  await tx`SELECT 1 -- UPDATE orders SET x`;
}
