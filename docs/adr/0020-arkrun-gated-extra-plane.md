# ADR 0020: ArkRun extra plane

- **Status:** Accepted (`RN01`)
- **Date:** 2026-08-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase RN / RN01 — ArkRun as an opt-in extra on the existing write/CI
  plane ([plan](../plans/arkrun/README.md))
- **Refines:** [ADR 0012](0012-arkrules-contract-composition.md) (silent-when-absent extra),
  [ADR 0002](0002-analysis-engine-ownership.md) (one verdict authority)

## Context

ArkGate already proves who may import whom (Layers) and how a layer is shaped (ArkRules).
It does not prove that an opted-in project actually uses the runtime kernel or declares
every interaction. Agents skip optional kernels because the write gate stays green without
them. A second product or a kernel bundled into `arkgate` would invert the package wedge.

ArkRun is the third extra: the same enforcement plane as Layers and ArkRules, silent when
absent, and merge-toothed only when a project turns it on and promotes it.

## Decisions

### D1 — Optional top-level `arkRun`; absence is silent

`ark.config.json` gains an optional top-level `arkRun` object on schema version `1.2`
(additive). Absence of the key changes **no** Layers or ArkRules verdict (byte-for-byte
silent; ArkRules precedent). The extra is **inline** in v1 (one kernel per app), not a
sibling referenced file. A later sibling schema is allowed only if a later ADR adds it.

Unknown keys fail closed. `managedLayers` must name existing `layers[].name` values;
unknown names fail closed. Empty `compositionRoots` in `enforced` mode fails closed
(`ARKRUN_MISSING_ROOT`). Schema load and migration are `RN02`; this ADR locks the
silence and fail-closed shape.

### D2 — `mode: "advisory" | "enforced"`; default advisory

Advisory never adds merge teeth and never flips `valid`. Enforced arms `mergePlanes`
extra teeth only when the layer plane is honestly classified (same empty-graph guard as
ArkRules). Doctor / status / report may show an `arkRun` residual section; it is always
`notAScore` and never an LLM pass/fail.

### D3 — Policy-delta weakening uses the existing hash-bound ack

Advisory → enforced is a strengthening delta. Demotion (`enforced` → `advisory`) or
deletion of the extra is **weakening** and needs the existing hash-bound acknowledgment.
Weakening `arkRun` must not be a silent config edit.

### D4 — Stable gate extra; experimental remains store durability

Once shipped, ArkRun is a **stable gate surface** in `arkgate`. It is not an experimental
flag. Experimental remains a label for **in-memory store durability** (ADR 0004 / 0021),
not for the extra. This train does not close `Z09` / residual `RB-11` or `K01`.

## Consequences

- `1.1` configs migrate additively; projects without `arkRun` keep current verdicts.
- Compact starters do not enable the extra by default (opt-in; brownfield stays advisory
  until the team promotes).
- Sensors, diagnostics, ESLint, and CI extra teeth (`RN03`–`RN08`) share this contract;
  they do not invent a second gate.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Always-on kernel usage rules | Punishes projects that never opted in; breaks silence |
| Separate runtime product / second CLI | Splits the enforcement plane; violates the product wedge |
| Experimental flag on the extra itself | Conflates gate stability with store durability |

## Related

- Companion isolation: [ADR 0021](0021-arkrun-companion-isolation.md)
- Anti-skip facts: [ADR 0022](0022-arkrun-anti-skip-facts.md)
- Mandatory declarations: [ADR 0023](0023-arkrun-mandatory-declarations.md)
- Transport ports: [ADR 0024](0024-arkrun-transport-ports.md)
- Isolation (not superseded): [ADR 0004](0004-runtime-package-isolation.md)
