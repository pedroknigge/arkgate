# ADR 0011: Versioned resolved candidate facts are the parity-capable analysis input

- **Status:** Accepted (the Z03 alias/workspace/API differential is pinned by
  `z03ResolvedFactsBoundary.test.ts`)
- **Date:** 2026-07-18
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase Z/Z03 — public programmatic analysis input, resolver ownership,
  lexical compatibility, and the generated CLI seam
  ([plan](../plans/enforcement-truth-at-speed/README.md))
- **Refines:** [ADR 0002](0002-analysis-engine-ownership.md),
  [ADR 0003](0003-cli-analysis-engine-bundle.md), and
  [ADR 0005](0005-atomic-change-preflight.md)

## Context

ADR 0002 deliberately made `analyzeProject`, `analyzeChange`, and `preflightChange` synchronous,
pure, supplied-content APIs. Their current graph extractor resolves relative specifiers from the
supplied file list, but it does not resolve `paths`/`baseUrl`, workspace packages, package exports,
or symlinks. `compilerOptions` contributes to an identity hash but does not change that resolution.

The final CLI uses the TypeScript API, the nearest tsconfig, the filesystem, and package resolution.
That creates two truths for one candidate. The Z03 fixture is one workspace containing both an
`@alias/kernel` path alias and an installed `@z03/kernel` workspace package. The public lexical API
returns no edges or violations, while the final CLI resolves both imports to the governed Kernel
file and rejects both DomainModel edges. A callback-shaped resolver would let each adapter hide a
different resolution implementation behind the same interface, so sharing the interface alone
would not prove that they evaluated identical input.

Resolution is effectful and host-specific; the verdict must remain pure, deterministic, portable,
and usable by the generated CLI bundle and the future warm control plane. The self-hosted contract
forbids TypeScript, filesystem, or process dependencies in DomainModel/Kernel and forbids direct
Tooling↔Kernel source imports.

## Decision

### D1 — DomainModel owns one neutral, versioned facts contract

`src/domain/analysis.ts` owns `RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION` and the
`ResolvedCandidateFacts` vocabulary, separately versioned from `AnalysisIr`. A public JSON Schema
ships at `arkgate/schema/resolved-candidate-facts`.

The facts are serializable evidence, never a precomputed architecture verdict. Version 1 contains:

- canonical project-relative candidate paths, operation/content identities, and parse status;
- dependency syntax evidence (`from`, `specifier`, kind, type-only state, and line);
- an explicit resolution state (`resolved-project`, `resolved-external`, `unresolved`, or
  `dynamic`) and canonical project target when one exists;
- direct capability, ambient-global, and publish evidence needed by the declared policy;
- compiler, resolver, compiler-options, tsconfig, candidate-tree, and facts identities;
- `complete | partial | unavailable` completeness plus structured reasons; and
- a deterministic `factsHash` over the canonical payload.

Facts do not carry authoritative `fromLayer`, `toLayer`, allowed/denied decisions, or violations.
Kernel classifies canonical source/target paths against the supplied `ark.config.json` and remains
the sole verdict authority. A completed resolver attempt that explicitly yields `unresolved` is a
fact, not automatically an incomplete analyzer; inability to attempt or prove mandatory evidence
is `partial`/`unavailable` and cannot produce a green result.

### D2 — Tooling owns the only resolver used by shipped adapters

One `resolveCandidateFacts` implementation in Tooling owns TypeScript loading, nearest-tsconfig and
package/workspace/symlink resolution, governed-file discovery, and a complete in-memory overlay for
creates, updates, and deletes. It emits `ResolvedCandidateFacts`; it does not decide layers or rules.

CLI, CI, MCP, complete-patch hooks, AICodeGate, and ESLint within its documented envelope must use
that resolver or consume its exact facts. Adapter evidence exposes `resolverIdentity` and
`factsHash`, so parity compares input identity as well as output. A resolver callback may exist as
an internal implementation detail, but it is not the public parity contract.

### D3 — Kernel exposes explicit supplied-facts APIs

The stable root receives two additive, synchronous APIs:

- `analyzeResolvedProject({ contract, facts })`; and
- `preflightResolvedChange({ contract, baseFacts, candidateFacts, changes, changeMap? })`.

Both validate the facts schema/hash and call one internal facts → IR → verdict evaluator. The
public promise is **same validated facts + same policy → same verdict and evidence**. Supplying facts
does not add filesystem or compiler work to Kernel and does not make their hash an authenticity
proof. Consumers that construct their own conforming facts own their resolver fidelity; ArkGate's
cross-adapter claim applies to facts produced by the shipped Tooling resolver.

No optional `facts` parameter is added to the existing names: an ambiguous call that silently
switches resolution modes would make logs and compatibility evidence harder to interpret.

### D4 — Existing names remain lexical compatibility, never the parity surface

`analyzeProject`, `analyzeChange`, and `preflightChange` remain source-compatible and synchronous.
They identify their mode as `lexical-compatibility` and report completeness from the facts they can
actually prove. A dependency or policy requirement outside that envelope makes the result partial
and non-green; it is never silently omitted while claiming complete parity. The resolved APIs use
the named `resolved-candidate-facts` mode.

Once both endpoints resolve to governed paths, `ark.config.json` is the final authority, including
same-layer edges. Path-token heuristics may advise on genuinely ungoverned targets but cannot add a
second blocker after the contract evaluated a governed edge.

### D5 — The generated bundle consumes facts, not a second resolver

ADR 0003's generated `bin/lib/analysis-engine.mjs` continues to be the distribution artifact of
the canonical Kernel evaluator. The bundle validates/evaluates the same facts contract exported by
the root API. Tooling creates facts outside the bundle and passes them in; the bundle does not
import TypeScript/filesystem and does not implement another resolution policy.

## Rejected alternative — public resolver port

A public callback is convenient for one-call orchestration, but it fails the identity invariant:
two adapters can return different targets behind the same port, callbacks cannot cross JSON/MCP or
worker boundaries, sync/async and lifecycle leak into the API, and cache keys describe an interface
rather than the evidence evaluated. Requiring the callback to emit the versioned serializable
payload would reduce it to the supplied-facts decision above.

## Fixture obligations

1. One workspace independently exercises a tsconfig alias and an installed workspace-package
   specifier against the same denied governed target.
2. The characterization test records the current lexical/API vs TypeScript/CLI divergence before
   Z04 changes behavior.
3. Z04 converts that fixture into exact facts/verdict parity and adds the full differential corpus
   required by the roadmap.
4. Architecture checks prove DomainModel/Kernel remain free of TypeScript, filesystem, and process
   dependencies; bundle drift and package-surface tests protect the generated/public seams.

## Consequences

The decision adds a public schema and named APIs, so the eventual stable release is a backward-
compatible minor rather than disguising the surface as a patch. Resolution remains replaceable at
the edge while the evaluated evidence becomes replayable, diffable, transportable, and cacheable
for Z07. The cost is a two-stage programmatic flow and a new schema to maintain. That cost is
accepted because it makes parity an inspectable fact rather than a claim about adapter code.
