import { addCents } from '../../../src/domain/shared/money';

describe('money', () => {
  it('adds cent amounts without a currency object', () => {
    if (addCents(100, 50) !== 150) throw new Error('sum');
  });
});
