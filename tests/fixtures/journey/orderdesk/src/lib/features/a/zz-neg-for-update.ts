import type postgres from 'postgres';

export async function lockOrder(tx: postgres.TransactionSql, orderId: string) {
  await tx`SELECT id FROM orders r WHERE r.id = ${orderId} FOR UPDATE OF r`;
}
