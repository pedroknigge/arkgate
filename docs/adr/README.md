# ArkGate architecture decision records

> Hub: [AGENTS.md](../../AGENTS.md) · Queue: [ROADMAP.md](../../ROADMAP.md) ·
> Audit: [documentation claims matrix](../audit/claims-matrix.md)

This is the decision index, not a second source of rationale. Each ADR below owns one durable
decision; implementation and manifests remain authoritative for current structure.

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](0001-product-identity-arkgate.md) | Retain ArkGate as the product identity | Accepted |
| [0002](0002-analysis-engine-ownership.md) | One importable analysis engine owns the stable IR | Accepted |
| [0003](0003-cli-analysis-engine-bundle.md) | CLI scanning consumes a bundled analysis engine | Accepted |
| [0004](0004-runtime-package-isolation.md) | Isolate the experimental runtime from ArkGate | Accepted |
| [0005](0005-atomic-change-preflight.md) | Atomic change preflight is a distinct read-only operation | Accepted |
| [0006](0006-optional-architecture-change-map.md) | Architecture change maps are explicit optional input | Accepted |
| [0007](0007-convergence-uses-explicit-candidate.md) | Structural convergence uses the explicit candidate | Accepted |
| [0008](0008-enforcement-evidence-ladder.md) | Enforcement claims require boundary-specific evidence | Accepted |
| [0009](0009-effect-capability-boundary.md) | Effect capabilities are architecture evidence, not style doctrine | Accepted |
| [0010](0010-reshape-copilot-boundary.md) | Physical cohesion is advisory; reshape remains judgment | Accepted |

Do not renumber or delete accepted decisions. Add a superseding ADR when a durable decision
changes, and link both records.
