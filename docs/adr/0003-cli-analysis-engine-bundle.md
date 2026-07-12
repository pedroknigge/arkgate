# ADR 0003: CLI scanning consumes a bundled analysis engine

- **Status:** Accepted
- **Date:** 2026-07-11
- **Owner:** ArkGate maintainers
- **Decision scope:** C03 scanner ownership and CLI distribution

## Context

The public C02 analysis API lives in Kernel, while the npm CLIs deliberately run without importing
source or `dist/`. The legacy architecture scanner is a separate implementation in `bin/lib/`.
Importing Kernel directly from `bin/` would violate both the self-hosted layer contract and the
zero-build CLI guarantee; maintaining both scanners would keep verdict drift possible.

## Decision

The canonical scanner will live in `src/kernel/analysis.ts` and focused modules beside it. The build will emit one committed,
standalone ESM bundle in `bin/lib/analysis-engine.mjs` for the CLI and MCP adapters. The bundle is a
distribution artifact, not a second source of truth:

- it is generated from the Kernel engine and checked for drift in CI;
- `bin/ark-check.mjs` and `bin/ark-mcp.mjs` consume that bundle only;
- the public `arkgate` API consumes the same Kernel source through normal package exports;
- temporary legacy scanner code remains only while a parity harness compares full fixture verdicts.

The bundled engine receives explicit filesystem/compiler ports from its adapters. It owns graph,
config, policy, and cycle evaluation, but not argument parsing, terminal presentation, MCP protocol,
or filesystem discovery policy. This keeps the CLI standalone without allowing Tooling to import
Kernel source or `dist/` at runtime.

## Consequences

- C03 may remove `bin/lib/architecture-scan.mjs` only after the parity fixture corpus is green.
- New scanner rules are implemented in Kernel exactly once; C04/C05 build on that API.
- The package build and the CLI-bundle drift check become release gates.
- Existing generated pure Domain artifacts remain permitted because their canonical algorithms are
  DomainModel and their generators already have drift checks; they are unrelated to scanner
  ownership.
