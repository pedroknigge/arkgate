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
import { appendDecisionTape, buildDependencyInformationPackage } from 'arkgate/runtime';
import { createOrderPlane, createMemoryReleaseStore } from 'arkgate/order';
import { billingProjector, billingXi } from './projector';
import { travelBillingResidual } from './bridge';

const plane = createOrderPlane({
  projector: billingProjector,
  xiSchema: { additionalProperties: false, properties: billingXi },
  packs: [
    { id: 'seats', capacity: [{ kind: 'SeatAdded', sigmaKey: 'seatCap', payloadKey: 'seats', op: 'lte' }] },
  ],
  store: createMemoryReleaseStore(), // process-local; not durable; not K01
});
plane.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' }, { seatCap: 3 });
const absorbed = plane.ingest({ kind: 'InvoicePosted' }); // residual names xiHash
await travelBillingResidual(absorbed, { send, raiseHuman }); // absorb → send
const proposal = plane.proposeRelease({ plan: 'pro' });
plane.apply(proposal); // valve — a raw second release() of different ξ fails
plane.refreshSigma({ seatCap: 10 }); // xiHash unchanged
const over = plane.ingest({ kind: 'SeatAdded', payload: { seats: 11 } }); // hold capacity
let tape = buildDependencyInformationPackage({ kernelInstanceId: 'billing' });
tape = appendDecisionTape(tape, { xiHash: over.xiHash, event: over.event, residual: over });
```

Domain files must not import `arkgate/order`. No `/ark-order` skill.
