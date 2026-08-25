# ADR 0024: ArkRun transport ports

- **Status:** Accepted (`RN01`)
- **Date:** 2026-08-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase RN / RN01 — kernel send ports vs shipped adapters
  ([plan](../plans/arkrun/README.md))
- **Refines:** [ADR 0021](0021-arkrun-companion-isolation.md)

## Context

The in-process event bus is not a broker. Agents who need “send this somewhere” currently
import EventEmitter, queue clients, or cloud SDKs and skip the kernel. Shipping AWS / Azure
/ GCP clients inside `@arkgate/runtime` would pull vendor SDKs into the companion, imply
cloud portability ArkGate does not prove, and still would not stop homemade buses.

## Decisions

### D1 — Three kernel send sites; adapters are ports

Call sites are local fire-and-forget, local blocking, and broker handoff. Consumers inject
broker adapters. The companion does **not** ship cloud broker SDKs (no AWS / Azure / GCP
client in the package).

### D2 — Missing broker falls back to local

When no broker adapter is bound, broker handoff falls back to local delivery. Docs must
describe that fallback as in-process, not as cloud portability.

### D3 — `ephemeral` defaults true

`ephemeral` defaults **true**: await local delivery / adapter handoff before resolving —
safe for short-lived processes (CLI, tests, serverless-style workers). Opting into
fire-and-forget after handoff is explicit. This is not a durability claim.

### D4 — Bypass is a gate sensor, not a shipped client

Raw broker/queue/emitter imports in `managedLayers` are `arkrun-transport-bypass`
(ADR 0022). Closing that hole does not require a vendor SDK in the tarball.

### D5 — Docs must not claim shipped cloud adapters

Public and companion docs must not present cloud portability as a shipped adapter.
Consumers who inject their own adapter own that adapter’s semantics. `K01` and production
store durability stay parked.

## Consequences

- Companion transport implementation is `RN11`; this ADR locks the port shape and the
  no-SDK line before code lands.
- Inspector (`RN12`) and graph slices (`RN13`) may show transport kind; they must not
  imply a bundled broker.
- Named external field-probe hosts stay out of shipped files (existing static check).

## Alternatives considered

| Option | Why not |
|--------|---------|
| Ship one cloud SDK “for convenience” | Vendor lock-in in the companion; false portability |
| Broker-required with no local fallback | Breaks tests and short-lived processes |
| Process-wide bus singleton | Conflicts with per-instance kernels (ADR 0021) |

## Related

- Companion isolation: [ADR 0021](0021-arkrun-companion-isolation.md)
- Anti-skip facts: [ADR 0022](0022-arkrun-anti-skip-facts.md)
- Hardening (stores, not this extra): [production-hardening.md](../production-hardening.md)
