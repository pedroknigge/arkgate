import { price } from './lib/pricing';

export const quote = (cents: number) => price(cents);
