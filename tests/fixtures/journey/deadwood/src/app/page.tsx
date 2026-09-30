import { formatMoney } from '../lib/format';
import { loadHandler } from '../lib/handlers-registry';

export default function Page() {
  void loadHandler('refund');
  return formatMoney(1200);
}
