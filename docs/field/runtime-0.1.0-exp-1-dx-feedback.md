# Field Feedback: @arkgate/runtime 0.1.0-experimental.1 DX

**Date:** 2026-08-26
**Version:** `@arkgate/runtime@0.1.0-experimental.1` (ArkRun)
**Topic:** Observability vs. Declaration Tax Trade-offs

## Summary

Early field adoption of `0.1.0-experimental.1` highlighted a significant DX trade-off: the new observability tools (Inspector and Graph) are powerful but require a high "declaration tax" and strict compliance with instantiation rules.

### Advantages (The Good)

1. **Local Loopback Inspector (`startInspector`)**: Opt-in real-time telemetry (HTTP/SSE) server for local development. It successfully provides visibility into the kernel state, EventBus transactions, information packages, and the graph. Security is well-received (refuses to start in `NODE_ENV=production` or on public network binds).
2. **Native Graph Queries (`requestGraph`)**: The ability to query the runtime instantiated architecture and generate Mermaid diagrams (`formatArkRunGraphMermaid`) automatically from runtime declarations is a major win for understanding component communication.
3. **`ArkRunBrokerAdapter` / Cloud Decoupling**: The formalization of injecting custom broker adapters (pub/sub, SQS, RabbitMQ) and the fallback to in-memory local delivery when absent works well. The `ephemeral` flag for short-lived workers/tests is useful.

### Frictions / Trade-offs (The Bad)

1. **The "Registry Tax"**: To leverage the Inspector and Graph, developers are forced to register use cases via `ark.register(...)` and manually declare dependencies (`uses`, `reactsTo`, `raises`, `sends`). This introduces substantial boilerplate before a component can even be used.
2. **`ARKRUN_DIRECT_NEW` Sensitivity**: The architectural rules for this version are extremely strict regarding direct instantiation. The sensor penalizes using the `new` keyword for classes in managed layers (Domain, Application, SharedKernel) outside of composition roots. This forces the creation of factory functions (e.g., `createWorkspaceAuthorizationError()`) even for simple custom exceptions or native `Error` subclasses to pass CI.

## Conclusion

The update delivers phenomenal observability for debugging complex flows (sagas/events). However, it forces a shift in coding style—specifically, heavier boilerplate and factory patterns—to satisfy the local PolicyEngine and fuel the runtime registry. This friction may deter quick prototyping but serves the strict structural constraints of ArkRun.

## Proposed Relaxations for Next Release

To reduce friction without compromising strict governance, the following relaxations to the `ARKRUN_DIRECT_NEW` sensor have been proposed for the roadmap:

1. **Native Exemption for Error Subclasses**: 
   Errors (e.g., `PublicApiError`, `WorkspaceAuthorizationError`) are control flow primitives, not stateful services. Instantiating them does not hide dependencies.
   *Proposed Solution*: The AST sensor should auto-exempt classes inheriting from `Error` (or ending in `Error`), or allow an opt-in flag in `ark.config.json` like `"ignoreDirectNewForErrors": true`.
2. **Convention for DTOs and Pure Value Objects**:
   Instantiating immutable Value Objects in Domain layers (e.g., `new PhoneNumber(value)`) is common and harmless.
   *Proposed Solution*: Establish a heuristic (e.g., `*DTO`, `*VO` naming conventions) or a pattern in `ark.config.json` so the PolicyEngine allows direct instantiation without forcing a factory or `ark.resolve()`.

3. **Rename or Relax `compositionRoots` / `ARKRUN_MISSING_ROOT`**:
   The `arkRun.compositionRoots` config key causes friction because it enforces that *every* matched file contains a `createStrictArkKernel()` call. Developers naturally use wide globs (e.g., `src/**/composition/**`) assuming it refers to the architectural layer, resulting in spurious `ARKRUN_MISSING_ROOT` errors for other files in that layer.
   *Proposed Solution*: Rename the key to `kernelFactories` or `kernelRoots` to be more precise. Alternatively, relax `ARKRUN_MISSING_ROOT` to only check that *at least one* file within the glob's expansion instantiates the kernel, rather than requiring it in 100% of the matched files.
