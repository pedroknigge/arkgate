import { PrismaClient } from '@prisma/client';
export function makePrisma(): PrismaClient {
  return new PrismaClient();
}
