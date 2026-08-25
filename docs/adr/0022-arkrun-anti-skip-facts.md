# ADR 0022: ArkRun anti-skip facts

- **Status:** Accepted (`RN01`)
- **Date:** 2026-08-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase RN / RN01 — closed anti-skip sensor vocabulary as resolver
  facts ([plan](../plans/arkrun/README.md))
- **Refines:** [ADR 0009](0009-effect-capability-boundary.md),
  [ADR 0013](0013-arkrules-structural-sensors.md)

## Context

Layer rules block illegal imports; they do not require a composition-root factory,
`publisher()`, or `defineIntent` at call sites. Agents therefore construct services with
`new`, import peers, and emit on homemade buses while the gate stays green. Anti-skip
sensors must block on deterministic evidence, not style opinion.

## Decisions

### D1 — Direct evidence blocks; inference advises forever

Same discipline as ADR 0009 / 0013. Heuristic inference (“this looks like a service”) is
tier 2 and **advisory only** — never promotable. Incomplete analysis reports `partial`
and never fakes green for enforced ArkRun.

### D2 — Closed sensor vocabulary

| Sensor id | Tier | Evidence | Default |
|---|---|---|---|
| `arkrun-missing-root` | 1 | No `createArkKernel` / `createStrictArkKernel` / `createArkKernelFromConfig` / `createStrictArkKernelFromConfig` in `compositionRoots` | advisory, promotable |
| `arkrun-kernel-in-domain` | 1 | Domain-role layer imports `@arkgate/runtime` or kernel types | advisory, promotable |
| `arkrun-direct-new` | 1 | `new` of a type registered/admitted for kernel creation, outside an admitted factory | advisory, promotable |
| `arkrun-undeclared-emit` | 1 | `publisher` / `publish` / `raise*` / `send*` call with a name not in `raises`/`sends` | advisory, promotable |
| `arkrun-undeclared-handle` | 1 | `subscribe` / `registerHandler` name not in `reactsTo` | advisory, promotable |
| `arkrun-undeclared-depend` | 1 | `resolve` / `resolveSingleton` name not in `uses` | advisory, promotable |
| `arkrun-transport-bypass` | 1 | Forbidden broker/queue/emitter import in `managedLayers` (closed specifier list + capability reuse) | advisory, promotable |
| `arkrun-skip-resolve` | 2 | Heuristic: Application file imports a peer class that looks kernel-managed | advisory only |

Diagnostic `ruleId`s (`RN05`): `ARKRUN_MISSING_ROOT`, `ARKRUN_KERNEL_IN_DOMAIN`,
`ARKRUN_DIRECT_NEW`, `ARKRUN_UNDECLARED_EMIT`, `ARKRUN_UNDECLARED_HANDLE`,
`ARKRUN_UNDECLARED_DEPEND`, `ARKRUN_TRANSPORT_BYPASS`. All `judgment` /
`neverMechanicalSafe` except adding a missing declaration string (mechanical-safe **only**
when the call-site literal already exists and the edit is the declaration list).

### D3 — Composition roots are an explicit allowlist; Domain stays kernel-free

Domain-role layers must not import `@arkgate/runtime` or kernel types. Composition roots
are an explicit `compositionRoots` allowlist. `new Type()` of an ArkRun-managed type
outside an admitted factory is a violation when enforced.

### D4 — Transport bypass reuses import/capability evidence

Homemade event emitters, raw broker SDKs, and queue clients in `managedLayers` are
`arkrun-transport-bypass`. Evidence is a closed specifier list plus existing capability /
forbidden-import machinery. This is **not** a new effect capability id unless ADR 0009 is
extended additively.

### D5 — Freeze interop reuses `baselineKey`

`baselineKey` reuses `ruleId` + file + target name so brownfield can freeze residual skip
sites. Resolver-fact extraction is `RN03`; sensors emit in `RN04`.

## Consequences

- A skip corpus (`RN14`) is the proof: Application `new`, peer import, and homemade bus
  fail when the extra is enforced and stay green when `arkRun` is absent.
- ESLint (`RN06`) and CLI/MCP/hook/CI (`RN07`) share these sensor ids; they do not add
  a parallel vocabulary.
- No LLM pass/fail; no numeric score.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Heuristic “service-looking” class as a blocker | False positives; agents learn to route around the gate |
| New effect capability for brokers | Capability vocabulary is closed (ADR 0009); reuse import evidence |
| Require a five-step admission ritual as the only factory | Ceremony without extra skip resistance |

## Related

- Extra plane: [ADR 0020](0020-arkrun-gated-extra-plane.md)
- Declarations: [ADR 0023](0023-arkrun-mandatory-declarations.md)
- Transport ports: [ADR 0024](0024-arkrun-transport-ports.md)
