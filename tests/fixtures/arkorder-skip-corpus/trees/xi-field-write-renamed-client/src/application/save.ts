import { PrismaClient } from '@prisma/client';

export async function savePlan(id: string): Promise<void> {
  const orm = new PrismaClient();
  await orm.billing.update({ where: { id }, data: { plan: 'pro' } });
}
