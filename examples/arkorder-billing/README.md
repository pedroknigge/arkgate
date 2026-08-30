# ArkOrder billing fixture

What this extra is *for*: layers can be green while an agent still PATCHes
`plan` as if it were `seatCount`. Here `plan` / `cycle` / `tenancy` are the
slow decisions; invoices and seats are not.

Consumer physics for the ArkOrder plane. The core does not know these keys.

ξ (slow): `plan`, `cycle`, `tenancy`  
σ: `graceDays`  
s (fast): invoices, seats, members — derived by `h(ξ)`

Rename the three keys to *your* slow decisions. Construction: catalog-bound / specified-crossing / billing-basis. Clinical: protocol / cycle / site. Keep invoices, hours, and logs as ingest. Membership (`projectId`) is not a slow key — `proposeRelease` of a key that changes nothing throws empty blast.

```json
{
  "arkOrder": {
    "mode": "advisory",
    "planeRoots": ["src/main.ts"],
    "managedLayers": ["Application"],
    "xiKeys": ["plan", "cycle", "tenancy"]
  }
}
```

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
