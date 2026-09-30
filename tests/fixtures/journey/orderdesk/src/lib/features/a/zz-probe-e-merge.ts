import type postgres from 'postgres';

export async function closeOrder(tx: postgres.TransactionSql, orderId: string) {
  await tx`MERGE INTO orders r USING (SELECT ${orderId} AS id) s ON r.id = s.id WHEN MATCHED THEN UPDATE SET status = 'closed'`;
  await tx`TRUNCATE orders`;
}
