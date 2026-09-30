import type { ATx } from '@/lib/repositories/a-db-executor';

export async function closeOrder(tx: ATx, orderId: string) {
  await tx`UPDATE orders SET status = 'closed' WHERE id = ${orderId}`;
}
