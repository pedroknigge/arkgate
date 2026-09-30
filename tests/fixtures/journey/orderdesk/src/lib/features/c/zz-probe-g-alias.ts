import type postgres from 'postgres';

export async function repriceLine(tx: postgres.TransactionSql, lineId: string) {
  await tx`UPDATE public.line_items li SET price = 1 WHERE id = ${lineId}`;
}
