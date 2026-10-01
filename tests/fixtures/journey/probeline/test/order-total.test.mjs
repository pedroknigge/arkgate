import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderTotal } from '../src/domain/order-total.mjs';

// Happy path only: nothing here fails when the negative-total guard is removed.
test('INV-TOTAL-SURVIVES: totals two lines', () => {
  assert.equal(orderTotal([{ price: 2, quantity: 3 }, { price: 4, quantity: 1 }]), 10);
});
