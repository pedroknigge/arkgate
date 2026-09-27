import type { Cents } from '../shared/money';

const REFUND_WINDOW_DAYS = 14;

export { REFUND_WINDOW_DAYS };

export function refundDue(paid: Cents, daysSinceCharge: number): Cents {
  if (daysSinceCharge > REFUND_WINDOW_DAYS) return 0;
  return paid;
}
