/**
 * Proof skip — do not copy into a product tree.
 * A managed-layer Prisma write of a named arkOrder.xiKeys value (`plan`).
 * The check labels this [ArkOrder] ARKORDER_XI_FIELD_WRITE.
 */
import { PrismaClient } from '@prisma/client';

export async function skipPrismaPlanWrite(plan: string): Promise<void> {
  const prisma = new PrismaClient();
  await prisma.billing.update({ data: { plan } });
}
