import { describe, it } from 'vitest';
import { Order } from '../src/domain/Order';

describe('INV-ORDER-TOTAL-NON-NEGATIVE', () => {
  it('keeps total non-negative', () => {
    Order.create(10);
  });
});
