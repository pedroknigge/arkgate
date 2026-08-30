import { PrismaClient } from '@prisma/client';

export async function savePlan(plan: string): Promise<void> {
  const prisma = new PrismaClient();
  await prisma.billing.update({ data: { plan } });
}
