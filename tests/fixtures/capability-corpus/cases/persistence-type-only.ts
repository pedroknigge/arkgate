import type { PrismaClient } from '@prisma/client';
export function describeClient(prisma: PrismaClient): string {
  return typeof prisma;
}
