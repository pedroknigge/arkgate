import type postgres from 'postgres';

export async function closeOrder(tx: postgres.TransactionSql, orderId: string) {
  await tx`UPDATE orders SET status = 'closed' WHERE id = ${orderId}`;
}
