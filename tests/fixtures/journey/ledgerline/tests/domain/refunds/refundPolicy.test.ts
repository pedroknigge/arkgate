import { refundDue } from '../../../src/domain/refunds/refundPolicy';

describe('refunds', () => {
  it('pays the charge back inside the window and nothing after it', () => {
    if (refundDue(5000, 3) !== 5000) throw new Error('inside');
    if (refundDue(5000, 40) !== 0) throw new Error('outside');
  });
});
