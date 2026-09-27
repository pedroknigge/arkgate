import type { Cents } from '../shared/money';

export const prorate: (amount: Cents, daysUsed: number, daysInPeriod: number) => Cents = (
  amount,
  daysUsed,
  daysInPeriod
) => {
  if (daysInPeriod <= 0) return 0;
  return Math.round((amount * daysUsed) / daysInPeriod);
};
