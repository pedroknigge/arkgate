import { PrismaClient } from '@prisma/client';

export class PlanWriter {
  constructor(private readonly orm: PrismaClient) {}

  async savePlan(id: string): Promise<void> {
    await this.orm.billing.update({ where: { id }, data: { plan: 'pro' } });
  }
}
