import { render } from '../presentation/view';

// Application must not depend on presentation.
export function listTitle() {
  return render('orders');
}

