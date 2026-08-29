/**
 * Consumer-supplied billing physics. Not part of the ArkOrder core.
 * ξ: plan, cycle, tenancy. s: invoices, seats, members.
 */
import type { Projector } from '../../src/kernel/order';

export const billingXi = {
  plan: { type: 'string' as const, enum: ['free', 'pro', 'enterprise'] },
  cycle: { type: 'string' as const, enum: ['monthly', 'annual'] },
  tenancy: { type: 'string' as const, enum: ['single', 'team', 'org'] },
};

export const billingProjector: Projector = (release) => {
  const plan = release.xi.plan;
  const tenancy = release.xi.tenancy;
  const allowed = ['InvoicePosted'];
  if (plan === 'pro' || plan === 'enterprise') allowed.push('SeatAdded');
  if (tenancy === 'team' || tenancy === 'org') allowed.push('MemberInvited');
  if (plan === 'enterprise' && tenancy === 'org') allowed.push('SsoEnabled');
  const invalidated: string[] = [];
  if (plan === 'free') invalidated.push('excess-seats');
  return { allowedKinds: allowed, invalidated };
};
