import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURRENCY } from '../src/domain/currency.mjs';

// Loads the module but never calls roundToCents.
test('INV-UNREACHED: the currency module loads', () => {
  assert.equal(CURRENCY, 'EUR');
});
