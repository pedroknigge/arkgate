export type Cents = number;

export function addCents(left: Cents, right: Cents): Cents {
  return left + right;
}

export function zeroCents(): Cents {
  return 0;
}
