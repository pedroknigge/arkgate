import { quotePlan } from '../../../src/application/billing/quotePlan';

describe('quote plan', () => {
  it('returns the starter seat count', () => {
    const quoted = quotePlan('starter');
    if (!quoted.ok || quoted.value.seats !== 5) throw new Error('starter');
  });
});
