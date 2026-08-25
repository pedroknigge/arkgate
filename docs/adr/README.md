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
| [0011](0011-resolved-candidate-facts-boundary.md) | Versioned resolved candidate facts are the parity-capable analysis input | Accepted |
| [0012](0012-arkrules-contract-composition.md) | ArkRules contract and modular composition (intra-layer rules) | Accepted |
| [0013](0013-arkrules-structural-sensors.md) | Intra-layer structural sensors are resolver facts, not style lint | Accepted |
| [0014](0014-arkrules-invariant-catalog.md) | Invariant catalog, coverage evidence, and rule modes | Accepted |
| [0015](0015-arkrules-migration-skills.md) | Migration workflows route through existing skills | Accepted |
| [0016](0016-arkrules-no-executable-core.md) | Executable evaluator stays out of core | Accepted |
| [0017](0017-mcp-project-identity-binding.md) | MCP verdicts require explicit project identity | Accepted |
| [0018](0018-shared-skill-catalogs-are-monotonic.md) | Shared skill catalogs are monotonic | Accepted |
| [0019](0019-codex-operation-scoped-hard-write.md) | Codex hard write is limited to trusted, complete, runtime-observed local `apply_patch` | Accepted |
| [0020](0020-arkrun-gated-extra-plane.md) | ArkRun extra plane (opt-in gate; silent when absent) | Accepted |
| [0021](0021-arkrun-companion-isolation.md) | Companion isolation (`@arkgate/runtime`; clarifies ADR 0004) | Accepted |
| [0022](0022-arkrun-anti-skip-facts.md) | Anti-skip facts (direct evidence; closed sensors) | Accepted |
| [0023](0023-arkrun-mandatory-declarations.md) | Mandatory declarations under enforced ArkRun | Accepted |
| [0024](0024-arkrun-transport-ports.md) | Transport ports (no shipped cloud SDKs) | Accepted |
| [0025](0025-one-project-skill-catalog.md) | One project skill catalog; visible description version; no home duplicates | Accepted |

Do not renumber or delete accepted decisions. Add a superseding ADR when a durable decision
changes, and link both records.
