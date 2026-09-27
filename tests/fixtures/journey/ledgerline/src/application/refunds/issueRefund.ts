import { refundDue } from '../../domain/refunds/refundPolicy';
import type { Cents } from '../../domain/shared/money';

// The 14-day cap is REFUND_WINDOW_DAYS in the domain policy.
export function issueRefund(paid: Cents, daysSinceCharge: number): Cents {
  return refundDue(paid, daysSinceCharge);
}
