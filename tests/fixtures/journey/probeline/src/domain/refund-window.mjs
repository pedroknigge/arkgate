/** A refund is refused after the published window. */
export function assertRefundWindow(daysSincePurchase) {
  if (daysSincePurchase > 30) {
    throw new Error('refund window closed');
  }
  return true;
}
