/** Domain logic in UI (domain-logic-in-ui) under features layout. */
export function canBuy(balance: number, price: number) {
  return balance >= price;
}

export function calculateDiscount(price: number) {
  return price * 0.1;
}
