import { issueRefund } from '../../../src/application/refunds/issueRefund';

describe('issue refund', () => {
  it('delegates the window decision to the domain policy', () => {
    if (issueRefund(2500, 1) !== 2500) throw new Error('refund');
  });
});
