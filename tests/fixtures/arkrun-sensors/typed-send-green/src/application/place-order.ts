import type { ArkKernel } from 'arkgate/runtime';
import { ark } from '../main';

const ORDER_PLACED = 'Domain.Order.Placed' as const;
const OrderPlaced = ark.registry.define<typeof ORDER_PLACED, { id: string }>(ORDER_PLACED);
const OrderShipped = ark.registry.define('Domain.Order.Shipped');

export const placeOrder = {
  id: 'Application.PlaceOrder',
  uses: [],
  reactsTo: ['Domain.Order.Shipped'],
  raises: ['Domain.Order.Placed'],
  sends: ['Domain.Order.Placed'],
};

export async function run(id: string): Promise<void> {
  await ark.send(OrderPlaced, { id }, { source: 'Application.PlaceOrder' });
  ark.eventBus.subscribe(OrderShipped, () => undefined);
}

export class PlaceOrderService {
  constructor(private readonly kernel: ArkKernel) {}

  async place(id: string): Promise<void> {
    await this.kernel.send(OrderPlaced, { id }, { source: 'Application.PlaceOrder' });
  }
}
