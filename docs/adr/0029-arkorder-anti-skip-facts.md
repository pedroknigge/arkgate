# ADR 0029: ArkOrder anti-skip facts

- **Status:** Accepted (`OR01`)
- **Date:** 2026-08-29
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase OR / OR01 — closed anti-skip sensor vocabulary as resolver
  facts ([plan](../plans/arkorder/README.md))
- **Refines:** [ADR 0009](0009-effect-capability-boundary.md),
  [ADR 0013](0013-arkrules-structural-sensors.md),
  [ADR 0022](0022-arkrun-anti-skip-facts.md) (same discipline, different skip)
- **Does not supersede:** [ADR 0026](0026-gate-waist-facts-in-verdict-out.md) — advisory
  projects facts; no second verdict engine

## Context

Layer rules block illegal imports; ArkRun sensors require a kernel factory when that
extra is on. Neither requires a split write path for operational pattern. Agents
therefore keep a God `PUT` that mutates plan, seats, and invoices together while the
gate stays green.

Anti-skip sensors must block on deterministic evidence, not style opinion, and must
not invent residual so an agent can skip `/ark-place` or `/ark-contract` (ADR 0026).

## Decisions

### D1 — Direct evidence blocks; inference advises forever

Same discipline as ADR 0009 / 0013 / 0022. Heuristic inference (“this PUT looks like
it changes the product”) is tier 2 and **advisory only** — never promotable.
Incomplete analysis reports `partial` and never fakes green for enforced ArkOrder.
No LLM pass/fail.

### D2 — Closed sensor vocabulary

| Sensor id | Tier | Evidence | Default |
|---|---|---|---|
| `arkorder-missing-plane` | 1 | No `createOrderPlane` in `planeRoots` | advisory, promotable |
| `arkorder-kernel-in-domain` | 1 | Domain-role layer imports `arkgate/order` | advisory, promotable |
| `arkorder-generic-update` | 1 | Call to a forbidden plane method (`update` / `patch` / `set`) | advisory, promotable |
| `arkorder-too-many-params` | 1 | ξ schema/object keys > configured `maxXiKeys` at plane create | advisory, promotable |
| `arkorder-ingest-writes-xi` | 1 | `ingest` result assigned into a release/ξ store (lexical, closed) | advisory, promotable |
| `arkorder-skip-god-put` | 2 | Heuristic: a wide HTTP handler mutates both pattern-shaped and field-shaped names | advisory only |

Diagnostic `ruleId`s (`OR05`): `ARKORDER_MISSING_PLANE`, `ARKORDER_KERNEL_IN_DOMAIN`,
`ARKORDER_GENERIC_UPDATE`, `ARKORDER_TOO_MANY_PARAMS`, `ARKORDER_INGEST_WRITES_XI`.
All `judgment` / `neverMechanicalSafe`.

### D3 — `planeRoots` are an explicit allowlist; Domain stays plane-free

Domain-role layers must not import `arkgate/order`. `createOrderPlane` belongs in
`planeRoots`. Enforced extra with empty roots fails closed.

### D4 — Freeze interop reuses `baselineKey`

`baselineKey` reuses `ruleId` + file + target name so brownfield can freeze residual
skip sites. Resolver-fact extraction is `OR05`; this ADR locks the vocabulary.

### D5 — No executable user predicates in the gate

ξ membership is not a user-supplied function inside `arkgate`. Consumer `projector`
and `xiSchema` live in the companion call. The gate sees call sites and import
specifiers, not industry rules (ADR 0016).

## Consequences

- A skip corpus (`OR06`) is the proof: extra absent stays green; enforced fails
  missing plane, Domain import, and generic `update()`.
- ESLint and CLI/MCP/hook/CI share these sensor ids; they do not add a parallel
  vocabulary.
- Doctor `arkOrder` residual is `notAScore`. `null` residual is unknown, not green.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Heuristic God-PUT as a merge blocker | False positives; agents route around the gate |
| LLM labels a field as ξ | Forbidden (ADR 0016 / 0026) |
| Require a five-step admission ritual | Ceremony without extra skip resistance |

## Related

- Extra plane: [ADR 0027](0027-arkorder-gated-extra-plane.md)
- Companion isolation: [ADR 0028](0028-arkorder-companion-isolation.md)
- ArkRun anti-skip (precedent): [ADR 0022](0022-arkrun-anti-skip-facts.md)
