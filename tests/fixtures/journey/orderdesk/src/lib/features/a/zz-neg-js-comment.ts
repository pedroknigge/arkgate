import type { ATx } from '@/lib/repositories/a-db-executor';

// UPDATE orders SET x
export function noteClosedOrder(tx: ATx) {
  return tx;
}
