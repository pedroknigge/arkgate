// Same slice: the billing slice may import line-format.ts, so this copy is counted, never listed.
export function formatLegacyLine(label: string, amount: number, currency: string): string {
  const fixed = amount.toFixed(2);
  const padded = label.length > 24 ? `${label.slice(0, 21)}...` : label.padEnd(24, ' ');
  const sign = amount < 0 ? '-' : '';
  const body = `${padded} ${sign}${currency} ${fixed.replace('-', '')}`;
  if (body.length > 48) {
    return body.slice(0, 48);
  }
  return body;
}
