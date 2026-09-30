import { sql } from 'drizzle-orm';

export async function renameOrder(ordersTable: unknown, orderId: string) {
  await sql`UPDATE ${ordersTable} SET title = 'x' WHERE id = ${orderId}`;
}
