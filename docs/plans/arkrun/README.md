# ArkRun — gated runtime complement

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) ·
> [ADR index](../../adr/README.md) ([0020](../../adr/0020-arkrun-gated-extra-plane.md)–[0024](../../adr/0024-arkrun-transport-ports.md)) ·
> [ADR 0004](../../adr/0004-runtime-package-isolation.md) ·
> [Package surface](../../package-surface.md) ·
> [Production hardening](../../production-hardening.md)

**Status:** In progress (Phase RN). `RN01` done — ADRs 0020–0024 accepted in
[docs/adr](../../adr/README.md); `RN02` done (schema `1.2` `arkRun`); `RN03` done
(resolver facts); `RN04` done (tier-1 sensors); `RN05` done (catalog dual-depth
`nextAction`); `RN06` done (`arkgate/eslint` import/`new` envelope);
`RN07` done (CLI / MCP / hook / preflight / CI extra teeth); `RN08` done
(doctor / status / report `arkRun` `notAScore`; mergePlanes honesty);
`RN09` done (companion branded; `createStrictArkKernel` stays the factory);
`RN10` done (declarations + `getDependencyInformationPackage()`);
`RN11` transports in tree (`ROADMAP` still `doing` until review);
`RN12`–`RN16` remain `todo` in ROADMAP. Does not close
`Z09` / residual `RB-11`.<br>
**Slug:** `arkrun`<br>
**Kind:** epic / gated extra plane + companion kernel<br>
**Owners:** product (Pedro) + library maintainers<br>
**Last updated:** 2026-08-25<br>
**Target package:** **arkgate@4.7.0** (additive `arkRun` on config schema `1.2`) plus
`@arkgate/runtime` companion (still 0.x; stores remain in-memory reference)<br>
**Code path (existing):** `src/kernel/runtime/`, `packages/runtime/`, skill `/ark-runtime`

---

ArkGate already proves **who may import whom** (Layers) and **how a layer is shaped**
(ArkRules). It does not yet prove that an opted-in project **actually uses the runtime
kernel** and **declares every interaction**. Agents skip optional kernels: they construct
services with `new`, import peers, and emit on homemade buses. The write gate stays green
because usage was never a contract.

**ArkRun** is the third extra: opt-in like ArkRules, silent when absent, and **the same
enforcement plane** once a project turns it on. The product remains the write firewall.
The kernel stays a separate package (ADR 0004). What becomes stable is the *gate extra*,
not a claim that in-memory stores are production-durable.

```text
Layers     always     inter-layer imports
ArkRules   extra      intra-layer shape + catalog
ArkRun     extra      kernel usage + complete declarations
```

## 1. Contrast: desired extra vs current code

| Requirement | Current state | Gap |
|---|---|---|
| Named extra, absence silent | `@arkgate/runtime` exists; docs label it experimental; no `arkRun` config key | Config plane + product name |
| Once enabled, agents cannot skip the kernel | Layer rules block illegal imports; they do not require `createStrictArkKernel`, `publisher()`, or `defineIntent` at call sites | Anti-skip sensors on the gate |
| Declare every raise / handle / depend / send | Companion `register()` takes `uses` / `reactsTo` / `raises` / `sends`; gate sensors already consume file-scoped lists | RN13 graph slices still pending |
| Dual API: composition root vs injected kernel | `createArkKernel()` returns a bag of engines; factories are not a required admission path | Composition-root allowlist + no kernel import in Domain |
| Local / blocking / broker send at one call site | In-process `EventBus` + `EventBufferStore`; no broker port | Transport ports, fallback, `ephemeral` |
| Tooling snapshot without leaking factories | `getDependencyInformationPackage()` JSON snapshot of ids, lifetime, declarations | Inspector (`RN12`) and graph slices (`RN13`) consume it |
| Partial diagrams | Full graph / manifest | `nodeIds`, degrees, process vs technical, query |
| Dev inspector | Observability reporter in-process | Localhost HTTP + SSE, production veto |
| Test doubles without tearing down the app | `createArkKernel()` per test already isolates instances (good — keep; no process singleton) | Test-only replace of one registration |
| Same CLI / MCP / hook / CI / ESLint plane | ArkRules precedent | New `ruleId`s through existing adapters |
| Durable production kernel | Explicitly **not** claimed; K01 parked | Out of this train — honesty stays |

**Constraints inherited (all respected):**

- Binary gate; no numeric score; no LLM pass/fail.
- No new skill **names** (deepen `/ark-runtime`, `/ark-place`, `/ark-adopt`, `/ark-contract`).
- Kernel implementation stays out of the `arkgate` tarball (ADR 0004).
- In-memory stores remain reference-only ([production-hardening.md](../../production-hardening.md)).
- Weakening `arkRun` enforced → advisory / removing the extra is a policy-delta weakening.
- 30-day freeze from 2026-08-22: no explore / compass / skill-body deepen as `doing`. Contract
  items (`RN01`–`RN08`) may become `doing` when the user sets one. Skill-body deepen is `RN15`
  and waits until that freeze ends.

## 2. Design decisions (locked — RN01)

Authority is the accepted ADRs. This section is the index, not a second rationale.

| ADR | Decision |
|-----|----------|
| [0020](../../adr/0020-arkrun-gated-extra-plane.md) | Extra plane: optional `arkRun` on schema `1.2`; absence silent; advisory never merge-teeth; demotion/delete is weakening |
| [0021](../../adr/0021-arkrun-companion-isolation.md) | Companion isolation: kernel stays `@arkgate/runtime`; brand **ArkRun**; no process singleton; ADR 0004 not superseded |
| [0022](../../adr/0022-arkrun-anti-skip-facts.md) | Anti-skip facts: closed sensors; direct evidence blocks; inference advisory forever |
| [0023](../../adr/0023-arkrun-mandatory-declarations.md) | Mandatory declarations: `uses` / `reactsTo` / `raises` / `sends`; `extendedInfo` is not a verdict input |
| [0024](../../adr/0024-arkrun-transport-ports.md) | Transport ports: local / blocking / broker fallback; no shipped cloud SDKs; `ephemeral` default true |

## 3. Config sketch (`ark.config.json` v1.2)

```jsonc
{
  "schemaVersion": "1.2",
  "layers": [ /* unchanged */ ],
  "rules": [ /* unchanged */ ],
  "arkRules": { /* unchanged, optional */ },
  "arkRun": {
    "mode": "advisory",
    "compositionRoots": ["src/main.ts", "src/nestjs/**"],
    "managedLayers": ["ApplicationOrchestration", "DomainModel"],
    "requireDeclarations": true
  }
}
```

- Unknown keys fail closed.
- `managedLayers` must name existing `layers[].name` values; unknown names fail closed.
- Empty `compositionRoots` in `enforced` mode fails closed (`ARKRUN_MISSING_ROOT`).
- Sibling schema `schemas/ark.arkrun.schema.json` if the extra grows a referenced file;
  v1 keeps the extra **inline** (one kernel per app, unlike per-layer ArkRules files).

## 4. Closed sensor vocabulary

Authority: [ADR 0022](../../adr/0022-arkrun-anti-skip-facts.md). Repeated here as the
implementation seed for `RN03`–`RN05`.

| Sensor id | Tier | Evidence | Default |
|---|---|---|---|
| `arkrun-missing-root` | 1 | No `createArkKernel` / `createStrictArkKernel` / `createArkKernelFromConfig` / `createStrictArkKernelFromConfig` in `compositionRoots` | advisory, promotable |
| `arkrun-kernel-in-domain` | 1 | Domain-role layer imports `@arkgate/runtime` or kernel types | advisory, promotable |
| `arkrun-direct-new` | 1 | `new` of a type registered/admitted for kernel creation, outside the factory | advisory, promotable |
| `arkrun-undeclared-emit` | 1 | `publisher` / `publish` / `raise*` / `send*` call with a name not in `raises`/`sends` | advisory, promotable |
| `arkrun-undeclared-handle` | 1 | `subscribe` / `registerHandler` name not in `reactsTo` | advisory, promotable |
| `arkrun-undeclared-depend` | 1 | `resolve` / `resolveSingleton` name not in `uses` | advisory, promotable |
| `arkrun-transport-bypass` | 1 | Forbidden broker/queue/emitter import in `managedLayers` (closed specifier list + capability reuse) | advisory, promotable |
| `arkrun-skip-resolve` | 2 | Heuristic: Application file imports a peer class that looks kernel-managed | advisory only |

Rule ids in the diagnostic catalog (RN05): `ARKRUN_MISSING_ROOT`, `ARKRUN_KERNEL_IN_DOMAIN`,
`ARKRUN_DIRECT_NEW`, `ARKRUN_UNDECLARED_EMIT`, `ARKRUN_UNDECLARED_HANDLE`,
`ARKRUN_UNDECLARED_DEPEND`, `ARKRUN_TRANSPORT_BYPASS`. All `judgment` /
`neverMechanicalSafe` except adding a missing declaration string (mechanical-safe **only**
when the call-site literal already exists and the edit is the declaration list).

Freeze interop: `baselineKey` reuses `ruleId` + file + target name so brownfield can freeze
residual skip sites.

## 5. Companion kernel (what `@arkgate/runtime` grows)

Keep what Ark already does better: **typed `defineIntent`**, event contracts, policy engine,
event buffer, projections, workflow engine, architecture profile from `ark.config.json`,
**per-instance** `createArkKernel()` (never a process singleton), Nest adapter.

Add:

| Capability | Notes |
|---|---|
| Interaction declarations | `uses` / `reactsTo` / `raises` / `sends` on the registration handle |
| `extendedInfo` | Tooling-only labels for diagrams |
| Information package | Serializable snapshot: ids, lifetime, declarations — **no** factories, live instances, or input DTOs |
| Transport split | local / localBlocking / broker; broker falls back to local; `ephemeral` default true |
| Graph request | `process` \| `technical`; optional `nodeIds`, `degreesOfSeparation`, include/exclude query |
| Inspector | Opt-in; default host `127.0.0.1`; refuse `NODE_ENV=production`; no authless public bind |
| Test replace | Only when kernel `mode: 'test'` (or equivalent flag); not on the production type |

Do **not** add: a required five-step admission ritual as the only factory; a global
`getKernel()` singleton; shipped cloud adapters; executable user predicates in the gate
(ADR 0016).

## 6. Why agents will not skip it

Skipping a kernel works when the compiler and the CI stay green without it. ArkRun closes
that hole on **every existing adapter**:

1. **Write path** — PreToolUse / MCP preflight see the same sensors as `ark-check`.
2. **ESLint** — editor feedback for `direct-new`, kernel-in-domain, transport-bypass.
3. **CI** — `--strict-merge` extra teeth when `mode: "enforced"`.
4. **Doctor / status** — residual ids on the ArkRun plane; never a score; `notAScore: true`.
5. **Skills** — `/ark-place` scaffolds through the kernel; `/ark-runtime` evaluates and
   wires; `/ark-adopt` can enable advisory ArkRun. Skills still do not enforce.

A fixture corpus (`RN14`) is the proof: an Application service constructed with `new`, a
peer import, and `EventEmitter` **must** fail enforced ArkRun and stay green when `arkRun`
is absent.

## 7. Skills routing (no new names)

| Job | Door |
|---|---|
| Turn the extra on (advisory) | `/ark-contract` + `/ark-adopt` |
| Put new code on the kernel | `/ark-place` |
| Evaluate / wire the companion | `/ark-runtime` (deepen body) |
| Fix skip violations | `/ark-fix` / `/ark-loop` |
| Explain the extra | `/ark-explain` (report section) |

## 8. Ordered backlog — Phase RN

Preferred order: contract plane first (agents cannot skip), then companion DX, then proof
and docs. One `doing` at a time.

### RN0 — Lock the extra (gate)

| ID | Size | Depends on | Outcome |
|----|-----:|---|---|
| `RN01` | M | — | **done** — ADRs 0020–0024 accepted in `docs/adr`; this plan remains the seed |
| `RN02` | L | RN01 | **done** — `ark.config` schema `1.2` + `arkRun` key; `1.1` configs migrate; absence silent; invalid extra fails closed |
| `RN03` | L | RN02 | **done** — Resolver facts: kernel API call sites, `new` of managed types, composition-root hits (facts schema additive) |
| `RN04` | L | RN03 | **done** — tier-1 sensors emit `ARKRUN_*`; advisory does not flip `valid`; enforced blocks |
| `RN05` | M | RN04 | **done** — Diagnostic catalog entries + dual-depth hints + `nextAction`; remediation parity tests |
| `RN06` | M | RN04 | **done** — `arkgate/eslint` rules for the same sensors (import / `new` envelope) |
| `RN07` | L | RN05 | **done** — CLI / MCP / hook / preflight / CI extra teeth share one verdict; enforced only when classified |
| `RN08` | M | RN07 | **done** — Doctor / `ark status` / report section `arkRun` (`notAScore`); mergePlanes honesty; report-parity |

### RN1 — Companion kernel

| ID | Size | Depends on | Outcome |
|----|-----:|---|---|
| `RN09` | M | RN01 | **done** — Public ArkRun kernel API branded in `@arkgate/runtime` README; `createStrictArkKernel` stays the factory |
| `RN10` | L | RN09 | **done** — `register()` declarations + `getDependencyInformationPackage()`; factories stay off the snapshot |
| `RN11` | L | RN09 | Transport ports: local / blocking / broker fallback; `ephemeral` default true (in tree; ROADMAP `doing` until review) |
| `RN12` | M | RN10 | Inspector: localhost, production veto, SSE + snapshots; lazy load |
| `RN13` | M | RN10 | `requestGraph` slices (process/technical, degrees, query) + Mermaid helper |

### RN2 — Proof and ship

| ID | Size | Depends on | Outcome |
|----|-----:|---|---|
| `RN14` | L | RN07 | Skip corpus: missing extra = green; enforced extra = fail on `new` / peer import / homemade bus |
| `RN15` | M | RN08, freeze end | Deepen `/ark-runtime` / `/ark-place` / `/ark-adopt`; no new skill names |
| `RN16` | M | RN08 + RN14 | Docs: complement extra, durable-stores honesty unchanged; prepare **4.7.0** |

`K01` (in-process commit gaps) stays **parked**. This train does not authorize production
durability claims.

## 9. Acceptance

- No `arkRun` key → identical Layers / ArkRules verdicts vs `1.1`.
- `mode: "advisory"` → doctor residual only; `valid` / `--strict-merge` unchanged.
- `mode: "enforced"` + classified tree → skip corpus fails write path, CLI, and CI.
- Domain files that import `@arkgate/runtime` fail when the extra is enforced.
- `@arkgate/runtime` is still optional to *install*; the extra **requires** the companion
  when enforced (fail closed with `nextAction` to install / import from the companion —
  never from a removed `arkgate/runtime` shim).
- In-memory stores still say **not production durability** in JSDoc and hardening docs.
- `check:architecture`, `check:cli-pure`, `check:package-files`, diagnostic catalog tests,
  report-parity green.
- Zero matches for named external probe-host tokens in the shipped tree (existing static
  check).

## 10. Non-goals

- Shipping cloud broker adapters.
- Process-wide kernel singleton.
- New skill names (`/ark-run` is not a skill).
- Executable business predicates in the gate.
- Closing K01 or claiming restart-safe workflows.
- Closing Z09 / RB-11.
- Putting `arkRun` sensors into the default compact starter (opt-in; brownfield stays
  advisory until the team promotes).

## 11. Promotion

When RN16 ships: promote this seed to a feature pack only if a consumer-facing
`docs/features/arkrun/` is warranted; otherwise keep this file as shipped rationale and
point public docs (`use.md`, `configuration.md`, `package-surface.md`) at the extra.
Mark **Shipped in 4.7.0**. Update the hub plans table.

## Related

- Queue: [ROADMAP Phase RN](../../../ROADMAP.md#phase-rn--arkrun-gated-complement)
- Isolation: [ADR 0004](../../adr/0004-runtime-package-isolation.md) (clarified by [0021](../../adr/0021-arkrun-companion-isolation.md))
- Extra plane: [ADR 0020](../../adr/0020-arkrun-gated-extra-plane.md)
- Companion isolation: [ADR 0021](../../adr/0021-arkrun-companion-isolation.md)
- Anti-skip facts: [ADR 0022](../../adr/0022-arkrun-anti-skip-facts.md)
- Mandatory declarations: [ADR 0023](../../adr/0023-arkrun-mandatory-declarations.md)
- Transport ports: [ADR 0024](../../adr/0024-arkrun-transport-ports.md)
- ArkRules extra (same silence/teeth pattern): [arkrules-evolution](../arkrules-evolution/README.md)
- Hardening (stores, not this extra): [production-hardening.md](../../production-hardening.md)
- Skill: `.grok/skills/ark-runtime/SKILL.md`
