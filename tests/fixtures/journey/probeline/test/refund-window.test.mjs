import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRefundWindow } from '../src/domain/refund-window.mjs';

test('INV-WINDOW-KILLED: a refund on day 30 is accepted', () => {
  assert.equal(assertRefundWindow(30), true);
});

test('INV-WINDOW-KILLED: a refund on day 31 is refused', () => {
  assert.throws(() => assertRefundWindow(31), /refund window closed/);
});
