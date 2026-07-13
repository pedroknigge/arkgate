/**
 * Design-weak: route imports ORM client directly (facade-sql-in-routes).
 * Contract edges can still be clean if nothing imports across forbidden layers.
 */
import { PrismaClient } from '@prisma/client';

export async function GET() {
  const prisma = new PrismaClient();
  return prisma.order.findMany();
}
