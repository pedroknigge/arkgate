/** How a refund is judged: the window in days and whether partial refunds are allowed. */
export interface RefundPolicy {
  windowDays: number;
  partialAllowed: boolean;
}
