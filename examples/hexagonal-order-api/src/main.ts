/**
 * Composition root: the only file allowed to see every layer.
 * Wires the Ark kernel, the adapters, and the use case together.
 */
import { createArkKernel } from 'arkgate/runtime';
import { ORDER_PLACED, type OrderPlacedPayload } from './domain/order.js';
import { PLACE_ORDER, createPlaceOrder } from './application/place-order.js';
import { createInMemoryOrderRepository } from './adapters/persistence/in-memory-order-repository.js';
import { createHttpServer, type OrderView } from './adapters/http/server.js';

const ark = createArkKernel();

// 1. Intents
const OrderPlaced = ark.registry.define<typeof ORDER_PLACED, OrderPlacedPayload>(ORDER_PLACED);
ark.registry.define<typeof PLACE_ORDER, { orderId: string }>(PLACE_ORDER, {
  produces: [ORDER_PLACED],
});

// 2. Event contract for OrderPlaced v1
ark.eventContracts.register({
  intent: ORDER_PLACED,
  version: '1',
  allowAdditionalFields: false,
  schema: {
    orderId: { type: 'string', required: true },
    sku: { type: 'string', required: true },
    quantity: { type: 'number', required: true },
    amount: { type: 'number', required: true },
  },
});

// 3. Projection: read model of placed orders, kept up to date by the kernel
ark.projections.register({
  name: 'Orders',
  sourceIntents: [ORDER_PLACED],
  initialState: { orders: {} as Record<string, OrderView> },
  project: (event, state) => {
    const p = event.payload as OrderPlacedPayload;
    return {
      orders: {
        ...state.orders,
        [p.orderId]: { orderId: p.orderId, sku: p.sku, quantity: p.quantity, amount: p.amount, status: 'placed' },
      },
    };
  },
});

// 4. Wire adapters + use case through ports
const repository = createInMemoryOrderRepository();
const placeOrder = createPlaceOrder({
  repository,
  publisher: ark.publisher(PLACE_ORDER),
  orderPlaced: OrderPlaced,
});

const server = createHttpServer({
  placeOrder,
  getOrder: async (id) => {
    const state = (await ark.projections.getState('Orders')) as { orders: Record<string, OrderView> };
    return state.orders[id];
  },
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`hexagonal-order-api listening on http://localhost:${port}`);
  console.log(`kernel=${ark.instanceId} profile="${ark.profile.name}"`);
});
