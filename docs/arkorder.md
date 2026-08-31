# ArkOrder

**Write. Check. Ship.** Layers can be green while an agent still PATCHes the
billing plan as if it were a seat count. ArkOrder is the extra that names the
few slow product decisions and stops that write.

Import: `arkgate/order` (same npm package `arkgate`). Off until you add
`arkOrder` on schema `1.3`. Absence is silent. In-memory. Not durable. It is
a library plus sensors, not a service. Does **not** replace ArkRun.

First-contact copy: freeze through a valve / no `update`. Haken (ξ vs s) lives
below. **ArkOrder freezes the pattern through a valve. ArkRun is how the residual travels.**

Canonical plan seed: [plans/arkorder/README.md](plans/arkorder/README.md).
ADRs: [0027](adr/0027-arkorder-gated-extra-plane.md)–[0030](adr/0030-opt-in-extras-same-npm-package.md),
[0033](adr/0033-arkorder-runtime-half-is-arkrun.md) (runtime half is ArkRun),
[0034](adr/0034-arkorder-valved-loop.md) (valved loop; public verbs in 4.8.6).
Config: [configuration.md](configuration.md). Surface:
[package-surface.md](package-surface.md#experimental-opt-in-surfaces).

---

## What it is (and is not)

| Is | Is not |
|----|--------|
| A **library** (`createOrderPlane`) plus **static sensors** | A running service, daemon, or hosted plane |
| Valved verbs: `release` / `project` / `ingest` / `proposeRelease` / `apply` / `refreshSigma` | A generic `update` / `patch` / `set` |
| Opt-in extra on `ark.config.json` | Always-on; compact starters leave it off |
| Consumer-named slow keys (`xiKeys`) | A construction OS, BIM, or FirmPack |
| Same npm tarball | not `@arkgate/order` |

If the extra is off, every ArkOrder sensor is silent. If it is on, the same
write gate / CI / ESLint envelope as Layers applies. Domain stays plane-free:
`createOrderPlane` lives in `arkOrder.planeRoots`.

ArkRun is **how the app talks** (intents, transport, information package).
ArkOrder is **what the app may treat as pattern**. Two extras. One activation
shape (`mode` + `managedLayers`). Roots keep different names because they
point at different factories: `arkRun.kernelRoots` vs `arkOrder.planeRoots`.
`compositionRoots` remains an alias of `kernelRoots`. See
[activation](#activation-same-shape-as-arkrun).

---

## Already shipped (named APIs)

Adopters kept redesigning this extra because the names were not on one page.
They already exist:

| Ask | API | Since |
|-----|-----|-------|
| Escalation as a first-class concept | `IngestResult` residual `absorb \| escalate_up \| hold` (`reasonCode`, `IngestEscalate.target`) | 4.8.0 / 4.8.6 |
| Projection at the boundary | `Projector = (release, sigma) => Projection` | 4.8.0 |
| Cap on badly designed slow parameters | `DEFAULT_MAX_XI_KEYS = 7`, `maxXiKeys`, `ARKORDER_TOO_MANY_PARAMS`, `ARKORDER_EMPTY_XI`, `ARKORDER_NESTED_XI` | 4.8.0 |
| Valved proposals, never direct mutation | `ProposeResult` then `apply` (`ARKORDER_UNVALVED_RELEASE`) | 4.8.0 / 4.8.6 |
| Typed cell schema | `XiSchema` / `XiPropertySchema` | 4.8.0 |
| Named slow keys on the write path | `arkOrder.xiKeys`; `ARKORDER_XI_FIELD_WRITE` | 4.8.3 |
| Factory isolation | `createOrderPlane` from `arkgate/order` only | 4.8.0 |
| Information budget | `informationBudget.cannotObserve`; `ARKORDER_INFORMATION_BUDGET` | 4.8.5 |
| σ freshness, never ξ | `sigmaMaxAgeMs` / `σ.freshUntil`; `ARKORDER_XI_TTL`, `ARKORDER_STALE_SIGMA` | 4.8.5 |
| Escalate to a person | `IngestEscalate.target` including `human` | 4.8.5 |
| Shadow / replay / compare | ArkRun `shadowInformationPackage` / `compareInformationPackages` / `replayInformationPackages` | 4.8.5 |
| Decision tape | ArkRun information package `decisionTape` `{ xiHash, event, residual }` | 4.8.6 |
| σ vs ξ identity | `xiHash` / `sigmaHash` / `refreshSigma` | 4.8.6 |
| Capacity as data | `ConstraintPack.capacity` (`kind` / `sigmaKey` / `payloadKey` / `op`) | 4.8.6 |
| Store port | `ReleaseStore` / `createMemoryReleaseStore` in-memory default — not durable, not K01 | 4.8.6 |
| Thin travel helper | `ingestTravelAction` absorb→`send` / escalate_up human→`raises` | 4.8.6 |

Nothing here is a hosted runtime. Nothing here can be “down”. A degraded-mode
contract would defend against an outage that cannot happen.

---

## Valved loop

**ArkOrder freezes the pattern through a valve. ArkRun is how the residual travels.**

```ts
import { createOrderPlane } from 'arkgate/order';

const plane = createOrderPlane({
  projector,          // consumer: (release, sigma) => { allowedKinds, invalidated }
  xiSchema,           // JSON Schema object; additionalProperties false
  maxXiKeys,          // default 7
  clocks,             // injected; Domain must not call Date.now
  packs,              // data, not user predicates (capacity is kind/sigmaKey/payloadKey/op)
  informationBudget,  // optional { cannotObserve: ['ledger'] } — not a config key
  sigmaMaxAgeMs,      // optional σ freshness; never on ξ — not a config key
  store,              // optional ReleaseStore; default in-memory is not durable
  catalogDigest,      // optional; keyed by ξ.catalogReleaseId — SKU set does not enter the hash
});

plane.release(xi, sigma);      // first freeze only
plane.project();               // derive allowed s + invalidations
plane.ingest(event);           // residual absorb | escalate_up | hold. Never a Release
plane.proposeRelease(delta);   // blast radius. Empty blast = domain error
plane.apply(proposal);         // valve: later ξ change
plane.refreshSigma(sigma);     // saldo / clocks; xiHash unchanged
```

There is no `update()`. Calling `update` / `patch` / `set` on the plane throws
`ARKORDER_FORBIDDEN_METHOD` and, on the write path, emits
`ARKORDER_GENERIC_UPDATE`. A second `release()` whose ξ differs fails
`ARKORDER_UNVALVED_RELEASE`.

| Field write | Verb |
|-------------|------|
| Invoice, seat within cap, timesheet, daily log | `ingest` → absorb (`ingestTravelAction` may `send`) |
| Over cap (capacity pack) / stale σ | `ingest` → hold |
| Kind not in h(ξ) | `ingest` → escalate_up (`target: human`; `ingestTravelAction` may `raises`) |
| Change plan / protocol / cost-code bound | `proposeRelease` then `apply` |
| PATCH the slow key through Prisma/Drizzle | `ARKORDER_XI_FIELD_WRITE` |

Copy [examples/arkorder-billing/](../examples/arkorder-billing/) and rename the
three keys. Membership ids (`projectId`) are not keys: a `proposeRelease` that
does not change `h(ξ)` fails closed (`ARKORDER_EMPTY_BLAST`).

---

## Config

```json
{
  "schemaVersion": "1.3",
  "arkOrder": {
    "mode": "advisory",
    "planeRoots": ["src/composition/order-plane.ts"],
    "managedLayers": ["Application"],
    "maxXiKeys": 7,
    "xiKeys": ["plan", "cycle", "tenancy"]
  }
}
```

| Field | Meaning |
|-------|---------|
| `mode` | `advisory` (default) or `enforced`. Same word as ArkRun / ArkRules |
| `managedLayers` | Layers whose persistence writes of `xiKeys` are the skip |
| `planeRoots` | Files allowed to call `createOrderPlane` |
| `maxXiKeys` | Cap on ξ (default 7). Haken: few slow modes |
| `xiKeys` | Optional 3–5 slow names. Empty → `ARKORDER_XI_FIELD_WRITE` silent |

Unknown keys fail closed. Empty `planeRoots` in `enforced` fails
`ARKORDER_MISSING_PLANE`. Demotion or deletion is a policy-delta **weakening**.
This library’s 4-layer authoring contract does **not** turn the extra on.

---

## Activation (same shape as ArkRun)

Both extras already share **`mode`** and **`managedLayers`**. They diverge on
one axis: the factory root.

| | ArkOrder | ArkRun |
|--|----------|--------|
| Extra key | `arkOrder` | `arkRun` |
| Schema | `1.3+` | `1.2+` |
| Factory | `createOrderPlane` from `arkgate/order` | `createStrictArkKernel` from `arkgate/runtime` |
| Roots | `planeRoots` | `kernelRoots` (`compositionRoots` alias) |
| Silence | absence of the extra | absence of the extra |

Do not rename `planeRoots` to `kernelRoots`. They name different factories.
List both on `ark-check --sensors` (same table, same tier vocabulary).

Turn extras on with `/ark-adopt`. Place new files with `/ark-place`. There is
no `/ark-order` skill.

---

## Sensors (closed)

Direct evidence blocks. Inference never does. Default advisory; promotable
except withdrawn heuristics.

| Diagnostic | Skip |
|------------|------|
| `ARKORDER_MISSING_PLANE` | Extra on, no `createOrderPlane` in `planeRoots` |
| `ARKORDER_KERNEL_IN_DOMAIN` | Domain-role layer imports `arkgate/order` |
| `ARKORDER_GENERIC_UPDATE` | `update` / `patch` / `set` on the plane |
| `ARKORDER_TOO_MANY_PARAMS` | ξ keys > `maxXiKeys` |
| `ARKORDER_INGEST_WRITES_XI` | `ingest` result assigned into a Release / ξ store |
| `ARKORDER_XI_FIELD_WRITE` | Managed-layer driver import **and** write token **and** a declared `xiKeys` name |
| `ARKORDER_INFORMATION_BUDGET` | `h(ξ)` allows a kind in `informationBudget.cannotObserve` |
| `ARKORDER_XI_TTL` | ξ named ttl/freshUntil/maxAge — freshness is σ |
| `ARKORDER_STALE_SIGMA` | ingest after σ.freshUntil, or after `release.releasedAt` + `sigmaMaxAgeMs` |

Why / fix: [diagnostics.md](diagnostics.md#ARKORDER_MISSING_PLANE).
`ark-check --sensors` lists every extra sensor with plane, tier, and whether
it can ever be enforced.

---

## Runtime half

Shadow, replay, provenance, and compare belong to **ArkRun** (information
package, inspector, in-memory compare). ArkOrder does not grow a bus, outbox,
or hosted replay. [ADR 0033](adr/0033-arkorder-runtime-half-is-arkrun.md).

Durability (`K01`) stays parked. In-memory is the honesty line.

---

## What we will not build here

- another event bus
- a general workflow engine
- a permissions engine
- a central store holding operational state
- a DSL that duplicates domain / DB / ArkRules
- a coordinator required on every request
- a degraded-mode contract (nothing can be down)

If a “slow parameter” changes with every click, it is not an order parameter.

The valved loop ships in **4.8.6** ([ADR 0034](adr/0034-arkorder-valved-loop.md)).
In-memory `ReleaseStore` is **not** durable. Doctor / status `arkOrder` stays
`notAScore`. This does **not** close `K01` / `Z09`. No `/ark-order` skill.

---

## Next step

```bash
npx arkgate-check --doctor
# copy examples/arkorder-billing/ and rename the three keys
# /ark-adopt to turn arkOrder on advisory
```
