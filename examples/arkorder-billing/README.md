# ArkOrder billing fixture

Consumer physics for the ArkOrder plane. The core does not know these keys.

ξ (slow): `plan`, `cycle`, `tenancy`  
σ: `graceDays`  
s (fast): invoices, seats, members — derived by `h(ξ)`

```ts
import { createOrderPlane } from 'arkgate/order';
import { billingProjector, billingXi } from './projector';

const plane = createOrderPlane({
  projector: billingProjector,
  xiSchema: { additionalProperties: false, properties: billingXi },
});
plane.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
plane.ingest({ kind: 'InvoicePosted' }); // absorb
plane.proposeRelease({ plan: 'pro' }); // blast radius
```

Domain files must not import `arkgate/order`.
