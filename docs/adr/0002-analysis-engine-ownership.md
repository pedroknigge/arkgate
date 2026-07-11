# ADR 0002: One importable analysis engine owns the stable IR

- **Status:** Accepted
- **Date:** 2026-07-11
- **Owner:** ArkGate maintainers
- **Decision scope:** analysis API, IR, CLI/MCP scanner migration

## Context

ArkGate currently has independently evolving scanner entry points in its CLI, MCP, hooks, and
other adapters. Before migrating those adapters, consumers and internal surfaces need one stable
in-memory contract. Write hooks in particular must be able to inspect proposed content before it is
written to disk.

## Decision

`src/domain/analysis.ts` is the sole owner of the versioned, pure analysis vocabulary:

- `ANALYSIS_IR_SCHEMA_VERSION`, files, layers, resolved/unresolved import edges, capability uses,
  evidence, violations, and deterministic hashes.
- `src/kernel/analysis.ts` is the sole owner of the public orchestration API:
  `loadContract`, `analyzeProject`, `analyzeChange`, and `explainViolation`.

The API accepts only supplied content; it performs no filesystem reads and exposes no runtime-kernel
types. Identical files, compiler options, and policy produce identical IR. Hashes are portable
FNV-1a fingerprints for identity, not cryptographic security claims.

C02 implements deterministic file classification, relative-import resolution, and configured layer
dependency violations. Capability-use extraction remains intentionally empty until C04 establishes
the supported symbol-aware soundness envelope. C03 migrates the existing CLI/MCP scanner to this
engine rather than creating a second IR or changing this public contract.

## Consequences

- Consumers import the API from `arkgate`; they do not depend on CLI artifacts.
- Tooling stays an adapter: filesystem discovery, TypeScript compiler integration, and output
  formatting remain outside the stable IR owner. The engine uses a deterministic lexical extractor
  over supplied in-memory text, so the published runtime has no extra dependency.
- The self-hosted four-layer contract is intentional: pure IR vocabulary is DomainModel and the
  importable engine is Kernel. Tooling may consume the vocabulary but must not import Kernel.
- A future IR change requires a schema-version decision and contract-test update.
