import { tierById, type PlanId } from '../../domain/billing/planTiers';
import { err, ok, type Result } from '../../domain/shared/result';

// PLAN_TIERS is the closed price table. This use case only asks for one id.
export function quotePlan(id: PlanId): Result<{ seats: number; monthlyCents: number }> {
  const tier = tierById(id);
  if (!tier) return err('unknown plan');
  return ok({ seats: tier.seats, monthlyCents: tier.monthlyCents });
}
