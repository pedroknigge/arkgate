export function price(cents: number): number {
  return Math.max(0, cents);
}
