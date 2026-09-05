# ArkOrder

**Layers stop a bad import. ArkOrder stops rewriting a big product choice —
like the billing plan — as if it were a seat count. Change those choices
through a valve, not a generic update.**

Import: `arkgate/order` (same npm package `arkgate`). Off until you add
`arkOrder`. Absence is silent. In-memory. Not durable. A library plus
sensors, not a service. Does **not** replace ArkRun.

Turn the extra on with `/ark-adopt`. First contact is doctor + `[ArkOrder]`
on the check. Names like ξ live below, in the valve and sensor tables.

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
| Valved verbs: `release` / `project` / `ingest` / `proposeRelease` / `apply` / `refreshSigma` / `restore` | A generic `update` / `patch` / `set` |
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
| Verify a stored `Release.hash` | `hashOf(ξ, σ)` alias of `hashReleasePayload` — no `release()` side effect | 4.8.9 |
| Reinstall a frozen Release | `restore(release)` — process-local; hash is identity; not durable; does not close K01 | 4.8.9 |
| Default clock | omitted `clocks` is Kernel `Date.now()`; Domain must not call `Date.now` | 4.8.9 |

Nothing here is a hosted runtime. Nothing here can be “down”. A degraded-mode
contract would defend against an outage that cannot happen.

---

## Valved loop

**ArkOrder freezes the pattern through a valve. ArkRun is how the residual travels.**

```ts
import { createOrderPlane, hashOf, hashReleasePayload } from 'arkgate/order';

const plane = createOrderPlane({
  projector,          // consumer: (release, sigma) => { allowedKinds, invalidated }
  xiSchema,           // JSON Schema object; additionalProperties false
  maxXiKeys,          // default 7
  clocks,             // optional; default Kernel Date.now(); Domain must not call Date.now
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
plane.restore(release);        // process-local install; hash is identity; not durable; not K01
hashOf(xi, sigma);             // same bytes as hashReleasePayload; no freeze side effect
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

Gallery (not in the npm tarball):
[examples/arkorder-billing](https://github.com/pedroknigge/arkgate/tree/main/examples/arkorder-billing).
Rename the three keys. Membership ids (`projectId`) are not keys: a
`proposeRelease` that does not change `h(ξ)` fails closed (`ARKORDER_EMPTY_BLAST`).

---

## Ingest kinds vs payload (deliberate)

`classifyIngest` uses `event.kind` for `escalateKinds` and `allowedKinds`.
`ConstraintPack` is data-only: a function in the pack is `hold` with
`reasonCode: pack` ([ADR 0016](adr/0016-arkrules-no-executable-core.md) /
[ADR 0034](adr/0034-arkorder-valved-loop.md) D5). Capacity already compares
numeric `payload[payloadKey]` against `sigma[sigmaKey]`.

A payload-dependent story such as "second week failing a goal" is domain /
projector work (a new kind, or that kind in `allowedKinds` when ξ says so).
It is not a pack predicate. Do not add user functions to `ConstraintPack`.

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
| `xiKeys` | Optional 3–5 slow names chosen by the modeller. Empty → `ARKORDER_XI_FIELD_WRITE` silent |

Unknown keys fail closed. Empty `planeRoots` in `enforced` fails
`ARKORDER_MISSING_PLANE`. Demotion or deletion is a policy-delta **weakening**.
This library’s 4-layer authoring contract does **not** turn the extra on.

The modeller names the keys. Empty blast is a mechanical rejection, but a large
blast does not make `paid` independent of current state. Whether a candidate is
entailed by current state remains a modeller and skill obligation. Invoices stay
on ingest. A `paid` flag is not a fourth slow key: derive it from cash received
against the invoice amount.

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

Turn extras on with `/ark-adopt`. Place new files with `/ark-place`. First
contact is doctor + the `[ArkOrder]` check label — same envelope as a bad
import. A dedicated `/ark-order` skill is not required for that.

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
`restore(release)` reinstalls a frozen Release in this process. It is not a
store. It does not close `K01`.

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
A status you can recompute from data you already have is not a slow decision. Derive it. Do not freeze it. The check remains silent on semantic entailment.
For example, cash arrives through ingest; `paid` is a conclusion derived from
cash received against amount due, not a key to freeze or change with
`proposeRelease`.

The valved loop ships in **4.8.6** ([ADR 0034](adr/0034-arkorder-valved-loop.md)).
In-memory `ReleaseStore` is **not** durable. Doctor / status `arkOrder` stays
`notAScore`. This does **not** close `K01` / `Z09`. The extras door stays
`/ark-adopt`.

---

## Doctor / start / status

`--doctor` always emits an ArkOrder row (`notAScore`). Absence is a silent
line. When the extra is on, the first human line is the one-breath:

**Layers stop a bad import. ArkOrder stops rewriting a big product choice —
like the billing plan — as if it were a seat count. Change those choices
through a valve, not a generic update.**

`ark start` leaves extras off (`Optional extras stay off. This start is
layers only — they stop bad imports.`).
`ark status` projects a thin `arkOrder` slice (present / mode / leftover
count). A deny prints `[ArkOrder]` next to `ARKORDER_*`, the same envelope
as a bad import.

## Next step

```bash
npx arkgate-check --doctor
# gallery (not in the npm tarball):
# https://github.com/pedroknigge/arkgate/tree/main/examples/arkorder-billing
# /ark-adopt to turn arkOrder on advisory
# Proof deny: skip corpus trees/xi-field-write (Prisma PATCH of plan)
```
