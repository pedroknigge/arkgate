# ADR 0034: ArkOrder valved loop (circular causality)

- **Status:** Accepted (`LV01`)
- **Date:** 2026-08-31
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase LV / LV01 — valve, σ identity, ingest residual,
  capacity-as-data, ArkRun decision tape, `ReleaseStore` port
  ([plan](../plans/arkorder-valve-loop/README.md))
- **Amends:** [ADR 0028](0028-arkorder-companion-isolation.md) D3 (four verbs
  grow `apply` / `refreshSigma`; first freeze remains `release()`);
  [ADR 0033](0033-arkorder-runtime-half-is-arkrun.md) (decision tape is an
  additive information-package record, not a bus)
- **Does not amend:** ADR 0026 waist; ADR 0016 no user predicates; no new skill
  names (ADR 0015). Does **not** close `K01` / `Z09`

## Context

ArkOrder 4.8.5 is a skip firewall plus a kind-gate. Four verbs exist.
`proposeRelease` returns blast. `ingest` returns `absorb | escalate`. Sensors
stop a Prisma PATCH of `xiKeys`. That is enough for “the agent must not rewrite
the plan.”

It is not enough for Haken as control:

1. Anyone with the plane can call `release()` again and change ξ.
2. σ is hashed into the same `Release.hash` as ξ, so refreshing saldo looks
   like a new pattern.
3. `ingest` returns a string `reason` with no bind to ξ identity.
4. The projector is an `allowedKinds` allowlist; payload is ignored.
5. Absorb does not `send()`. Escalate does not `raises`.
6. `current()` dies with the process; there is no store port.

Orderfield already has the valved loop (slaves never write `ORDER.json`;
residual bound to identity; closed regime menu). Copy that **loop**. Do not
copy the harness (`of`, packets, `.orderfield/`, `SLAVE.md`, explore|cut|build).

## Decisions

### D1 — Valve: first freeze is `release()`; later ξ change is `apply`

After the **first** `release(ξ)`, a later `release()` whose ξ differs from
`current.xi` fails closed (`ARKORDER_UNVALVED_RELEASE`). Pattern change is
`proposeRelease` then **`apply(ProposeResult)`**. Empty blast still fails
(`ARKORDER_EMPTY_BLAST`). First freeze remains `release()`.

Runtime fail-closed is the authority. Do not invent a lexical sensor that
infers “this looks like a second freeze.”

Same-ξ `release()` is not this deny (σ refresh is D2/`refreshSigma`). A public
`release()` that changes ξ bypasses the valve — that is a bug; revert LV02.

### D2 — ξ identity and σ identity are not the same hash

Additive fields on `Release`:

| Field | What it fingerprints | Compatibility |
|-------|----------------------|---------------|
| `hash` | `{ xi, sigma }` (and optional catalog digest, D8) | **Unchanged** when digest is absent — 4.8.x persisted hashes still compare |
| `xiHash` | `{ xi }` (and optional catalog digest, D8) | Additive |
| `sigmaHash` | `{ sigma }` | Additive |

Do **not** silently retcon persisted `hash` values. Combined-hash compatibility
is this table: consumers who never pass a catalog digest keep the same `hash`
for the same ξ+σ.

`refreshSigma` updates σ (and therefore `hash` / `sigmaHash`) without minting
a pattern: `xiHash` stays. A saldo / clock refresh is not `proposeRelease`.

### D3 — Stale σ does not mint a Release

`ingest` returns residual `hold` with `reasonCode: stale-sigma`. It does not
throw a new Release into existence. `ARKORDER_XI_TTL` stays: freshness never
lives on ξ.

### D4 — Ingest residual is a closed menu

`ingest` returns a residual bound to `xiHash` + event identity:

```text
kind:        absorb | escalate_up | hold
reasonCode:  not-in-pattern | stale-sigma | pack | capacity   (absent on absorb)
target:      human | scale | hold   (IngestEscalate.target remains on escalate_up)
proposed_patch: optional { nextXi } — only on escalate_up
```

String `reason` may remain as human text; it is not the regime. Callers must
not invent a fourth kind.

### D5 — Capacity is data on `ConstraintPack`

```text
kind, sigmaKey, payloadKey, op: 'lte' | 'lt' | 'gte' | 'gt'
```

No user predicates (ADR 0016). Over-cap is residual `capacity`, not a new
event kind invented by the caller. A function on the pack is a bug; revert LV05.

### D6 — Decision tape lives on the ArkRun information package

Records `{ xiHash, event, residual }`. `shadow` / `compare` / `replay` that
tape in-process. Component snapshot API (`id`, lifetime, `uses` / `reactsTo` /
`raises` / `sends`, optional `extendedInfo`) is unchanged.

Not a second bus. Not Postgres. A compare that requires a broker or disk
violates ADR 0033; revert LV06.

### D7 — Thin bridge only

`FieldEvent.kind` may ride an ArkRun intent. Absorb may `send()`.
`escalate_up` with `target: human` may `raises`. The consumer still owns
handlers. No coordinator on every request. No new skill name.

### D8 — `ReleaseStore` is an injected port

In-memory default. Optional catalog **digest** keyed by a ξ id (e.g.
`catalogReleaseId`) may enter `xiHash` / `hash` — the SKU set does not.
This does **not** close `K01` (no durable outbox, no shipped Postgres).
Calling the in-memory default durable is a voice bug.

### D9 — No new skill names

Adopt / place / autopilot deepen. Compact starters stay extras-off. Absence
of `arkOrder` stays silent. `/ark-order` is not a skill.

## Names this ADR requires (and forbids)

Required public names (later LV items): `apply`, `refreshSigma`, `xiHash`,
`sigmaHash`, residual kinds `absorb | escalate_up | hold`, `reasonCode`,
`ReleaseStore`, `ARKORDER_UNVALVED_RELEASE`.

Forbidden: `getPlane()`, Nest Order adapter, Orderfield CLI / packets /
`.orderfield` inside `arkgate/order`, PR workflow states on the plane, KPI
keys in ξ, user predicates, a second event bus, turning `arkOrder` on in this
library’s 4-layer `ark.config.json`, exporting `createOrderPlane` from
`import from 'arkgate'`.

## Consequences

- LV02–LV09 implement these decisions. LV01 is plan lock — no plane code.
- Public sentence after LV09: **ArkOrder freezes the pattern through a valve.
  ArkRun is how the residual travels.**
- v0 physics stays the billing fixture. Product statuses stay on the consumer
  aggregate — they are not plane states.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Keep `release()` as the only freeze | Unvalved second freeze; agents rewrite ξ |
| One hash for ξ+σ | Saldo refresh looks like a new pattern |
| String `reason` as the regime | Callers invent kinds; no bind to `xiHash` |
| User predicate for capacity | Violates ADR 0016 |
| Bus / Postgres tape | Violates ADR 0033; pretends to close K01 |
| `/ark-order` skill | Skill-name freeze (ADR 0015) |

## Related

- Extra plane: [ADR 0027](0027-arkorder-gated-extra-plane.md)
- Plane isolation: [ADR 0028](0028-arkorder-companion-isolation.md)
- Runtime half: [ADR 0033](0033-arkorder-runtime-half-is-arkrun.md)
- Plan: [arkorder-valve-loop](../plans/arkorder-valve-loop/README.md)
