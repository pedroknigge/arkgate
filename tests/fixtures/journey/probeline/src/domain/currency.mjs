export const CURRENCY = 'EUR';

/** Round an amount to whole cents. */
export function roundToCents(amount) {
  if (!Number.isFinite(amount)) {
    throw new Error('amount must be a finite number');
  }
  return Math.round(amount * 100) / 100;
}
