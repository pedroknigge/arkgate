import { ark } from '../main';

const OrderCancelled = ark.registry.define('Domain.Order.Cancelled');

export const cancelOrder = {
  id: 'Application.CancelOrder',
  uses: [],
  reactsTo: [],
  raises: ['Domain.Order.Placed'],
  sends: [],
};

export async function run(id: string): Promise<void> {
  await ark.send(OrderCancelled, { id }, { source: 'Application.CancelOrder' });
}
