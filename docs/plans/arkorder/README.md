# ArkOrder — gated operational-pattern extra

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) ·
> [ADR index](../../adr/README.md) ([0027](../../adr/0027-arkorder-gated-extra-plane.md)–[0030](../../adr/0030-opt-in-extras-same-npm-package.md)) ·
> [Package surface](../../package-surface.md) · [Product voice](../../product-voice.md)

**Status:** Shipped in **4.8.0** (`OR01`–`OR07` + `PK01`). Same npm package.<br>
**Slug:** `arkorder`<br>
**Kind:** epic / gated extra plane (same npm package)<br>
**Owners:** product (Pedro) + library maintainers<br>
**Last updated:** 2026-08-29<br>
**Target package:** `arkgate@4.8.0`+ (additive `arkOrder` on config schema `1.3`;
subpath `arkgate/order` in the **same** npm tarball — [ADR 0030](../../adr/0030-opt-in-extras-same-npm-package.md))<br>
**Code path:** `src/domain/arkOrder*.ts`, `src/kernel/order/` → `dist/order`,
gallery `examples/arkorder-billing/`

Does **not** close `Z09` / residual `RB-11` or `K01`. Does **not** replace ArkRun.

---

ArkGate already proves **who may import whom** (Layers) and **how a layer is shaped**
(ArkRules). ArkRun proves an opted-in app **talks through the kernel**. None of those prove
that a product has a **slow operational pattern** and that field writes cannot overwrite it.

Agents skip optional kernels: they ship `PUT /everything` and the write gate stays green
because “what may be pattern” was never a contract.

**ArkOrder** is the fourth extra: opt-in like ArkRules and ArkRun, silent when absent, and
**the same enforcement plane** once a project turns it on. The product remains the write
firewall. The plane is a subpath of package `arkgate` (ADR 0030), not a second npm
package. What becomes stable is the *gate extra*, not a claim that the plane is durable storage.

```text
Layers     always     inter-layer imports
ArkRules   extra      intra-layer shape + catalog
ArkRun     extra      how the app talks (intents, bus)
ArkOrder   extra      what may be considered pattern (ξ vs s)
```

Public sentence (docs, when the extra exists — **not** a shipped claim today):

> ArkRun slaves how the app talks. ArkOrder slaves what the app may treat as pattern.

Haken / slaving stays in this plan and the README later. The product name is **ArkOrder**.
The import is `arkgate/order`. Not a second npm package. Not `slaving`. Not `arkorderplane`.

---

## 1. What “any project” means

The kernel is **domain-free**. Physics is **always consumer-supplied**.

It applies to any **product** that can name 3–5 slow modes in an afternoon (billing plan,
clinical protocol, match ruleset, construction parti). It does **not** apply to any git
repo automatically: Layers ≠ ξ. This mother repo must **not** turn `arkOrder` on against
its 4-layer authoring contract.

**Admission:** empty ξ, or more keys than `maxXiKeys`, fails closed. If a team cannot name
the pattern, they do not have an Order plane.

v0 physics (locked): **SaaS billing fixture only** — not a construction OS, not this
library’s layers.

---

## 2. Design decisions (locked — OR01)

Authority is the accepted ADRs. This section is the index, not a second rationale.

| ADR | Decision |
|-----|----------|
| [0027](../../adr/0027-arkorder-gated-extra-plane.md) | Extra plane: optional `arkOrder` on schema `1.3`; absence silent; advisory never merge-teeth; demotion/delete is weakening |
| [0028](../../adr/0028-arkorder-companion-isolation.md) | Plane isolation: import `arkgate/order`; brand **ArkOrder**; `createOrderPlane`; no process singleton; no bus/inspector/Nest in v0 |
| [0030](../../adr/0030-opt-in-extras-same-npm-package.md) | One npm package `arkgate`; extras are subpaths; no `@arkgate/order` |
| [0029](../../adr/0029-arkorder-anti-skip-facts.md) | Anti-skip facts: closed sensors; direct evidence blocks; inference advisory forever |

Rejected alternatives (same ADRs): fold into `createStrictArkKernel`; types-only catalog
with no write-path split; new skill name `/ark-order`; always-on extra.

---

## 3. Plane sketch (`arkgate/order`)

Four verbs. No `update()`.

```ts
createOrderPlane({
  xiSchema,      // JSON Schema object; additionalProperties false
  maxXiKeys,     // default 7
  clocks,        // injected; Domain must not call Date.now
  packs,         // data, not user predicates
  projector,     // consumer (release, sigma) => projection
})
```

| Verb | Contract |
|------|----------|
| `release(xi, sigma)` | freeze, version, hash. No in-place mutate |
| `project(release)` | derive allowed s + invalidations |
| `ingest(event)` | absorb **or** escalate. Never returns a new Release |
| `proposeRelease(delta)` | blast radius + invalidations. Empty blast = domain error |

**Out of v0:** event bus, outbox, saga, inspector HTTP, Nest adapter, cloud SDKs, durable
store, FirmPack marketplace, BIM, UI, LLM classification of ξ.

---

## 4. Config sketch (`ark.config.json` v1.3)

```jsonc
{
  "schemaVersion": "1.3",
  "layers": [ /* unchanged */ ],
  "rules": [ /* unchanged */ ],
  "arkRules": { /* unchanged, optional */ },
  "arkRun": { /* unchanged, optional */ },
  "arkOrder": {
    "mode": "advisory",
    "planeRoots": ["src/main.ts"],
    "managedLayers": ["ApplicationOrchestration"],
    "maxXiKeys": 7
  }
}
```

- Unknown keys fail closed.
- `managedLayers` must name existing `layers[].name` values.
- Empty `planeRoots` in `enforced` mode fails closed (`ARKORDER_MISSING_PLANE`).
- Extra is **inline** in v1 (one plane per app). Compact starters do not enable it.
- Enforced extra does **not** require a second npm install. nextAction: import
  `arkgate/order` and call `createOrderPlane` in `planeRoots`. Advisory does not.

---

## 5. Closed sensor vocabulary

Authority: [ADR 0029](../../adr/0029-arkorder-anti-skip-facts.md).

| Sensor id | Tier | Evidence | Default |
|---|---|---|---|
| `arkorder-missing-plane` | 1 | No `createOrderPlane` in `planeRoots` | advisory, promotable |
| `arkorder-kernel-in-domain` | 1 | Domain-role layer imports `arkgate/order` | advisory, promotable |
| `arkorder-generic-update` | 1 | Forbidden plane method (`update` / `patch` / `set` on the plane) | advisory, promotable |
| `arkorder-too-many-params` | 1 | ξ schema/object keys > `maxXiKeys` at plane create | advisory, promotable |
| `arkorder-ingest-writes-xi` | 1 | `ingest` result assigned into release/ξ store (direct lexical) | advisory, promotable |
| `arkorder-skip-god-put` | 2 | Heuristic: a wide HTTP PUT looks like it mutates pattern | advisory only |

Diagnostic `ruleId`s (`OR05`): `ARKORDER_MISSING_PLANE`, `ARKORDER_KERNEL_IN_DOMAIN`,
`ARKORDER_GENERIC_UPDATE`, `ARKORDER_TOO_MANY_PARAMS`, `ARKORDER_INGEST_WRITES_XI`.

---

## 6. v0 physics — `examples/arkorder-billing/`

Do **not** modify `examples/hexagonal-order-api/` (purchase-order hexagon; ArkRun bus
proof). The word “order” there is domain, not this plane.

ξ (3 keys, frozen):

| Key | Values |
|-----|--------|
| `plan` | `"free" \| "pro" \| "enterprise"` |
| `cycle` | `"monthly" \| "annual"` |
| `tenancy` | `"single" \| "team" \| "org"` |

σ: `graceDays`, `regulation`. s: invoices, seats, tickets. Projector lives in the
**example**, not the companion.

| Write | Verb |
|-------|------|
| post invoice / add seat within cap | `ingest` → absorb |
| add seat over cap | `ingest` → escalate |
| change plan / cycle / tenancy | `proposeRelease` |
| PATCH seatCount as if it were ξ | reject |

Construction OS / FirmPacks are later consumers of the same kernel. No schema bump
required if ξ stays consumer-supplied.

---

## 7. Placement in this tree

| Layer | Path |
|-------|------|
| DomainModel | `src/domain/arkOrder*.ts` — types, facts, sensors, doctor; `generate:cli-pure` |
| Kernel | `src/kernel/order/` — compiled into this package’s `dist/order` (`exports["./order"]`) |
| Tooling | schema `1.3`, ESLint envelope, skip corpus, isolation smoke |
| FrameworkAdapters | **empty in v0** |

Root `src/gate.ts` / `import from 'arkgate'` must not grow `createOrderPlane`. The
factory is `arkgate/order` only. Smoke isolation extends
`scripts/smoke-package-isolation.mjs`.

---

## 8. Queue

Live statuses live in [ROADMAP.md](../../../ROADMAP.md). Seed:

| ID | Outcome |
|----|---------|
| `OR01` | This plan + ADRs [0027](../../adr/0027-arkorder-gated-extra-plane.md)–[0029](../../adr/0029-arkorder-anti-skip-facts.md) |
| `OR02` | `arkgate/order` subpath: `createOrderPlane`, 4 verbs, tests, isolation smoke |
| `OR03` | Billing fixture `examples/arkorder-billing/` |
| `OR04` | schema `1.3` `arkOrder`; `1.2` migrates; absence silent |
| `OR05` | facts + `ARKORDER_*` sensors + extra teeth + doctor `notAScore` |
| `OR06` | skip corpus + ESLint envelope |
| `OR07` | deepen `/ark-place` `/ark-adopt` `/ark-contract`; public docs; no new skill name |

No new skill names. Intelligence stays at those doors (ADR 0026).

---

## 9. Kill switches

- Companion grows a bus, inspector, Nest adapter, or `getPlane()` singleton → stop.
- Extra flips `valid` when absent or advisory → bug, not a feature.
- First example becomes a construction OS / BIM → out of v0.
- LLM-derived “this looks like ξ” as a blocking diagnostic → forbidden (ADR 0016 / 0026).
- README claims Order replaces Run → revert voice.
- Turning `arkOrder` on in this mother `ark.config.json` against Layers → out of v0.

---

## 10. Success

A stranger with a SaaS copies `examples/arkorder-billing/`, renames the 3 keys, keeps the
4 verbs, and gets skip-resistance when they promote `arkOrder` to enforced. A construction
OS can do the same later with a different schema and **no** kernel change.
