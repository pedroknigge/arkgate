# ArkOrder billing fixture

Layers stop a bad import. ArkOrder stops rewriting a big product choice —
like the billing plan — as if it were a seat count. Change those choices
through a valve, not a generic update.

Here `plan` / `cycle` / `tenancy` are the big choices; invoices and seats
are not. Rename the three keys to *your* product. Keep invoices, hours, and
logs as events. Membership (`projectId`) is not a big choice. `paid` is
not either: cash against the invoice already tells you that.

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
await travelBillingResidual(absorbed, { send, raiseHuman }); // ingestTravelAction: absorb → send
const proposal = plane.proposeRelease({ plan: 'pro' });
plane.apply(proposal); // valve — a raw second release() of a different plan fails
plane.refreshSigma({ seatCap: 10 }); // xiHash unchanged
const over = plane.ingest({ kind: 'SeatAdded', payload: { seats: 11 } }); // hold capacity
let tape = buildDependencyInformationPackage({ kernelInstanceId: 'billing' });
tape = appendDecisionTape(tape, { xiHash: over.xiHash, event: over.event, residual: over });
```

The skip that must not land — same keys, a use-case that writes `plan`
like a seat count (`skip-prisma-plan.ts` in this folder):

```ts
import { PrismaClient } from '@prisma/client';
await new PrismaClient().billing.update({ data: { plan: 'pro' } });
```

Proof reuses the existing skip corpus (same `xiKeys`), not a second sensor:
`tests/fixtures/arkorder-skip-corpus/trees/xi-field-write`. Enforced check
prints `[ArkOrder] ARKORDER_XI_FIELD_WRITE`.

Domain files must not import `arkgate/order`. Turn the extra on with
`/ark-adopt`.
