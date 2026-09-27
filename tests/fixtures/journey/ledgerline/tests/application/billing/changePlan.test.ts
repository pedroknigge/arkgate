import { changePlanCredit } from '../../../src/application/billing/changePlan';

describe('change plan', () => {
  it('credits half the previous charge at the midpoint', () => {
    if (changePlanCredit(1000, 15, 30) !== 500) throw new Error('credit');
  });
});
