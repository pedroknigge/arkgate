import { billingPlane } from '../main';

export function bump(): void {
  (billingPlane as unknown as { update(xi: object): void }).update({ plan: 'pro' });
}
