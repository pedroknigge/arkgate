export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDate(day: string): string {
  return day.slice(0, 10);
}
