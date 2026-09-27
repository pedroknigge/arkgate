export type PlanId = 'starter' | 'team';

export const PLAN_TIERS: ReadonlyArray<{ id: PlanId; seats: number; monthlyCents: number }> = [
  { id: 'starter', seats: 5, monthlyCents: 2900 },
  { id: 'team', seats: 25, monthlyCents: 9900 },
];

export function tierById(id: PlanId): (typeof PLAN_TIERS)[number] | undefined {
  return PLAN_TIERS.find((tier) => tier.id === id);
}
