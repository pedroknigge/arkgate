# ADR 0027: ArkOrder extra plane

- **Status:** Accepted (`OR01`)
- **Date:** 2026-08-29
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase OR / OR01 — ArkOrder as an opt-in extra on the existing write/CI
  plane ([plan](../plans/arkorder/README.md))
- **Refines:** [ADR 0012](0012-arkrules-contract-composition.md) (silent-when-absent extra),
  [ADR 0020](0020-arkrun-gated-extra-plane.md) (third extra precedent),
  [ADR 0002](0002-analysis-engine-ownership.md) (one verdict authority),
  [ADR 0026](0026-gate-waist-facts-in-verdict-out.md) (waist stays facts in, one `valid` out)

## Context

ArkGate proves who may import whom. ArkRules proves how a layer is shaped. ArkRun proves
an opted-in app talks through the kernel. None of those prove that a product has a slow
operational pattern (ξ) and that field writes cannot overwrite it.

Agents skip optional planes: a generic `PUT` mutates plan, seats, and invoices on the same
path while the write gate stays green. Bundling an “order plane” into `createStrictArkKernel`
or into the `arkgate` tarball would invert the package wedge (ADR 0004).

ArkOrder is the fourth extra: the same enforcement plane as Layers, ArkRules, and ArkRun,
silent when absent, merge-toothed only when a project turns it on and promotes it.

## Decisions

### D1 — Optional top-level `arkOrder`; absence is silent

`ark.config.json` gains an optional top-level `arkOrder` object on schema version `1.3`
(additive). Absence of the key changes **no** Layers, ArkRules, or ArkRun verdict
(byte-for-byte silent). The extra is **inline** in v1 (one plane per app), not a sibling
referenced file.

Unknown keys fail closed. `managedLayers` must name existing `layers[].name` values;
unknown names fail closed. Empty `planeRoots` in `enforced` mode fails closed
(`ARKORDER_MISSING_PLANE`). Schema load and migration are `OR04`; this ADR locks the
silence and fail-closed shape.

### D2 — `mode: "advisory" | "enforced"`; default advisory

Advisory never adds merge teeth and never flips `valid`. Enforced arms `mergePlanes`
extra teeth only when the layer plane is honestly classified (same floor as ArkRules /
ArkRun via `extraMergeTeeth.ts`). Doctor / status / report may show an `arkOrder`
residual section; it is always `notAScore` and never an LLM pass/fail.

### D3 — Policy-delta weakening uses the existing hash-bound ack

Advisory → enforced is a strengthening delta. Demotion (`enforced` → `advisory`) or
deletion of the extra is **weakening** and needs the existing hash-bound acknowledgment.
Weakening `arkOrder` must not be a silent config edit.

### D4 — Stable gate extra; experimental remains plane durability

Once shipped, ArkOrder is a **stable gate surface** in `arkgate`. It is not an
experimental flag. Experimental remains a label for **in-memory plane durability**
(the companion is 0.x; instances die on process restart), not for the extra. This train
does not close `Z09` / residual `RB-11` or `K01`.

### D5 — Not a replacement for ArkRun

ArkOrder does not publish application events, version domain payloads, run sagas, or own
an outbox. A `FieldEvent` is not `PlaceOrder`. Folding Order into
`createStrictArkKernel()` is forbidden.

## Consequences

- `1.2` configs migrate additively; projects without `arkOrder` keep current verdicts.
- Compact starters do not enable the extra by default.
- Sensors, diagnostics, ESLint, and CI extra teeth (`OR05`–`OR06`) share this contract;
  they do not invent a second gate.
- Enforced extra does **not** require a second npm package ([ADR 0030](0030-opt-in-extras-same-npm-package.md)).
  nextAction is import `arkgate/order` and call `createOrderPlane` in `planeRoots`.
- Product-voice quadruple is a **shipped** sentence only when the extra exists (`OR07`).
  Until then the public triple stays Gate / Rules / Run.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Always-on pattern rules | Punishes projects that never opted in; breaks silence |
| Types-only catalog (ArkRules-shaped) | No write-path split; WhatsApp/`PUT` still mutates ξ |
| Fold into ArkRun | Obese kernel; hexagonal-order-api is a bus proof, not a pattern plane |
| Separate CLI product | Splits the enforcement plane |

## Related

- Companion isolation: [ADR 0028](0028-arkorder-companion-isolation.md)
- Anti-skip facts: [ADR 0029](0029-arkorder-anti-skip-facts.md)
- ArkRun extra (precedent, not superseded): [ADR 0020](0020-arkrun-gated-extra-plane.md)
- Isolation pattern: [ADR 0004](0004-runtime-package-isolation.md)
