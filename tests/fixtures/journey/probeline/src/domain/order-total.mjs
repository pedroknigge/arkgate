/** Sum of price × quantity over the order lines. */
export function orderTotal(lines) {
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  if (total < 0) {
    throw new Error('order total cannot be negative');
  }
  return total;
}
