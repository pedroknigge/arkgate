export type TaxRate = {
  region: string;
  basisPoints: number;
};

export function taxOn(amountCents: number, rate: TaxRate): number {
  return Math.round((amountCents * rate.basisPoints) / 10_000);
}
