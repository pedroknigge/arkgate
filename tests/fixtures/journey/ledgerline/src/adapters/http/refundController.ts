import { issueRefund } from '../../application/refunds/issueRefund';

export function postRefund(body: { paid: number; daysSinceCharge: number }): { refunded: number } {
  return { refunded: issueRefund(body.paid, body.daysSinceCharge) };
}
