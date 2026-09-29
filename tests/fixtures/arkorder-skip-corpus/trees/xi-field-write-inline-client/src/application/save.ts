import { PrismaClient } from '@prisma/client';

/** The README one-liner: "the skip that must not land". */
export async function savePlan(): Promise<void> {
  await new PrismaClient().billing.update({ data: { plan: 'pro' } });
}
