import { total } from '@repo/billing';

export function Badge() {
  return total({ cents: 1 });
}
