import { prorate } from '../../domain/billing/proration';
import type { Cents } from '../../domain/shared/money';

export function changePlanCredit(previous: Cents, daysUsed: number, daysInPeriod: number): Cents {
  return prorate(previous, daysUsed, daysInPeriod);
}
