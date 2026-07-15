import assert from 'node:assert/strict';
import { qualifiesForFreeShipping } from './src/domain/shipping-policy.js';

assert.equal(qualifiesForFreeShipping(99), false);
assert.equal(qualifiesForFreeShipping(100), true);
assert.equal(qualifiesForFreeShipping(250), true);
console.log('free-shipping acceptance: passed');
