# Plan: Understandable execution — explicit effects, legible core

> **Plan (not SSOT implementation docs).** Library hub: [AGENTS.md](../../../AGENTS.md)<br>
> Related: [ROADMAP.md](../../../ROADMAP.md) · [analysis-engine ownership](../../adr/0002-analysis-engine-ownership.md) · [CLI bundle](../../adr/0003-cli-analysis-engine-bundle.md) · [change integrity](../change-integrity-loop/README.md)<br>
> Implementation remains governed by `ROADMAP.md`; this plan records the epic rationale and
> boundaries.

**Status:** Shipped in `arkgate@3.4.0` (2026-07-16)<br>
**Slug:** `understandable-execution`<br>
**Kind:** epic / redesign<br>
**Owners:** product (Pedro) + library maintainers<br>
**Last updated:** 2026-07-15<br>
**Code path (existing):** `src/domain/configContract.ts`, `src/kernel/analysis.ts`, generated analysis bundle, CLI/MCP/ESLint/hook adapters

---

## Problem

ArkGate already blocks invalid architecture deterministically, but two kinds of hidden complexity
remain relevant to its product promise:

1. Effects such as network, filesystem, time, randomness, environment, process access, and
   persistence are only partially modeled through imports and `forbiddenGlobals`. A boundary may
   be import-clean while still depending on ambient behavior that is hard for a human or agent to
   reason about.
2. ArkGate's own canonical contract and analysis modules are reported as `god-module` candidates by
   its shipped doctor, while several Tooling entrypoints operate near their LOC budgets. Splitting
   blindly would replace local flow with call-site hopping; doing nothing would keep concentrating
   responsibilities.

The useful lesson from John Carmack's later clarification is not mandatory inlining. It is that
unexpected dependency and mutation are the real enemies, and pure functions solve those problems
more directly. ArkGate should translate that into architectural evidence, not a general coding
style doctrine.

## Outcome

ArkGate can describe and constrain important effects and ambient state as deterministic
architecture capabilities. A casual user receives one concrete instruction such as “inject a
Clock port”; a senior receives stable capability IDs, source evidence, hashes, and adapter-parity
results. The library dogfoods the same philosophy through cohesive pure modules and thin effect
boundaries without changing its public API merely to reduce LOC.

## Users & success

### Primary users

| User | Job to be done |
|---|---|
| Senior / architect | Define which layers may perform effects and audit exact evidence across adapters |
| Agent-assisted developer | Reject hidden effects before a proposed patch is written or merged |
| Vibecoder / casual user | Understand why ambient time, I/O, or global state is risky and get one safe next move |
| ArkGate maintainer | Keep the enforcement path understandable without introducing scanner or helper sprawl |

### Success metrics

| Metric | Required direction |
|---|---|
| Canonical IR/verdict drift across CLI, MCP, ESLint, hooks, and package API | Zero |
| False-positive blockers on the fixed capability/adoption corpus | Zero before a rule becomes strict |
| Self-hosted deterministic design-smell evidence | The named canonical candidates clear after their individual pilots |
| Public API/schema compatibility during internal pilots | No unplanned breaking change |
| Complete-patch preflight | Same capability verdict and evidence as final strict CI for the same candidate |
| End-to-end hook/MCP preflight latency and memory | Baseline first; then a fixed CI budget with measured runner headroom |
| Package/module budgets | No item-by-item ceiling ratchet; stay within the roadmap-cycle guardrails |

### Non-goals / out of scope

- No “Carmack mode”, style score, trust score, or branding dependency.
- No mandatory inlining of single-use helpers, maximum function length, class ban, naming rule, or
  blanket `const` lint.
- No rewrite from scratch, language migration, data-oriented layout without profiling, or broad
  performance optimization.
- No new preset pack, skill basename, runtime feature, general codemod, or LLM-derived verdict.
- No automatic extraction of judgment-heavy code. Internal and consumer Shape changes remain
  one-pilot-at-a-time with a kill-switch.

## MVP scope

| In MVP | Later / out |
|---|---|
| Typed capability vocabulary and evidence in the canonical analysis IR | Polyglot or framework-specific effect systems |
| Layer policy for supported effects with backwards-compatible `forbiddenGlobals` behavior | Arbitrary user-authored semantic plugins in the gate core |
| Advisory ambient-state sensor with a fixed false-positive corpus | Strict ambient-state blocking before evidence supports it |
| Dual-depth remediation using ports/adapters | Automatic port/interface generation |
| Separate self-hosted cohesion pilots for the named candidates | Repo-wide file splitting or CLI rewrite |
| End-to-end pre-tool/MCP benchmark and fixed budget | Micro-optimizations without profiles |

## Acceptance criteria

- [x] **A1 — Boundary, not style:** an accepted ADR defines supported capability/state semantics,
  compatibility, non-goals, and the evidence required before a diagnostic can block —
  [ADR 0009](../../adr/0009-effect-capability-boundary.md) (Accepted 2026-07-16) plus the
  `capability-corpus` fixtures and structural guard.
- [x] **A2 — Honest dogfood:** the named self-hosted god-module candidates are handled as
  separate pilots; each preserves public behavior and stops if coupling or call-site hopping grows
  — U02 shipped both pilots (type-vocabulary split + C02 facade over cohesive kernel modules)
  with byte-identical config artifacts, zero consumer import changes, and self-doctor reporting
  zero design smells.
- [x] **A3 — Canonical effect evidence:** identical files, compiler inputs, and policy yield the
  same ordered capability uses, violations, hashes, and remediation IDs through the canonical IR
  (U03 determinism cases against the frozen corpus).
- [x] **A4 — Atomic enforcement:** a multi-file candidate cannot hide a newly introduced denied
  capability; pre-tool/MCP preflight and final CI agree on the complete patch (U04 pinned the
  multi-file case; U06 wired the real hook).
- [x] **A5 — Ambient state earns strictness:** module-scope mutable-state findings remain advisory
  until the fixed corpus proves blocker-grade precision and an explicit layer policy opts in —
  U05 shipped the sensor advisory-only, opt-in via `pure: true` layers, with sidecar acks and no
  strict option anywhere.
- [x] **A6 — Dual depth:** every rejection has one plain-language next action and stable JSON
  evidence; no model interpretation decides pass/fail — CAPABILITY_VIOLATION carries FIX_HINTS +
  suggestion (casual) and ruleId/capability/fixClass/nextAction (JSON) across CLI, hook, MCP,
  preflight, and ESLint.
- [x] **A7 — Profile before optimize:** end-to-end hook and MCP paths have reproducible cold and
  incremental measurements before fixed budgets or optimizations are approved — the hook-path
  bench measures complete child-process paths; ceilings land only from the recorded Linux
  baseline (record mode until then), and no optimization shipped without a profile.
- [x] **A8 — Hard lines held:** no weakened gate, new skill namespace, general codemod, runtime
  wedge, package-budget ratchet, or breaking API hidden inside the redesign — verified across
  U01–U07: every new surface is opt-in/advisory, budgets were met by extraction (never raised),
  and the only classification change (D6 coverage atoms) STRENGTHENS the acknowledgment guard.

## Proposed public surface (hypothesis)

| Kind | Surface | Status / notes |
|---|---|---|
| Analysis IR | Ordered typed capability-use evidence | TBD in U01; additive/schema-version decision required |
| Config | Layer-level allow/deny capability policy | TBD in U01; absence must preserve current behavior |
| CLI / MCP | Existing check, doctor, prepare-write, and atomic preflight responses | Reuse existing commands/tools; no new basename |
| ESLint / hooks | Existing adapters over the same verdict vocabulary | Adapter-native collection may remain, verdict parity is mandatory |
| Human remediation | “Define a Clock/Random/HTTP/storage port and bind it outside the pure layer” | Stable next-action IDs; no automatic judgment apply |
| Ambient state | Advisory finding for opted-in pure layers | Strict mode is a later evidence decision, not assumed |

No public name or schema is locked by this plan. U01 owns those decisions and promotes durable
answers to an ADR before implementation.

## Approach

```mermaid
flowchart LR
  Candidate[Complete candidate patch] --> Collect[Collect imports, globals, effects, state]
  Collect --> IR[Canonical ordered analysis IR]
  Policy[Layer capability policy] --> IR
  IR --> Verdict[Deterministic verdict + evidence hashes]
  Verdict --> Simple[One plain-language next action]
  Verdict --> Deep[Stable JSON for senior tooling]
  Verdict --> Adapters[Hook · MCP · ESLint · CI]
```

### Iteration map

| Order | ID | Size | Outcome | Depends on |
|---:|---|---:|---|---|
| 1 | `U01` | S | Lock the architecture-vs-style boundary, capability vocabulary, compatibility, and fixed corpus in an ADR | Phase T shipped |
| 2 | `U02` | M | Dogfood separate cohesive pure-core pilots without public API or verdict drift | `U01` |
| 3 | `U03` | L | Add typed effect capability evidence to the canonical IR and generated CLI bundle | `U01`, `U02` (soft) |
| 4 | `U04` | L | Enforce opted-in layer capability walls in complete-patch preflight with full adapter parity | `U03` |
| 5 | `U05` | M | Add an advisory ambient mutable-state sensor and prove its precision before any strict option | `U03` |
| 6 | `U06` | M | Ship dual-depth remediation and end-to-end pre-tool/MCP performance budgets | `U04`, `U05` |
| 7 | `U07` | S | Run adoption/release evidence, documentation parity, package checks, and release readiness | `U01`–`U06` |

One item may be `doing` at a time after promotion into `ROADMAP.md`. Every behavioral item starts
with a failing fixture or measured baseline, preserves the canonical engine, and runs the common
merge gate.

**U02 is a hygiene dependency, not a logic one.** Splitting the named modules first reduces U03's
merge surface, but U03 does not require the split: if a U02 pilot's kill-switch fires (coupling or
call-site hopping grows), record the outcome as that pilot's evidence and start U03 anyway — a
cosmetic pilot must never hold the phase hostage.

**Release slicing (owner decision 2026-07-15):** the L+L middle concentrates the phase's
wall-clock risk, so Phase U ships in two stable minors — `U01–U03` first (advisory capability
evidence in the IR, no enforcement; the corpus matures in the field), then `U04–U07` (opted-in
walls, ambient-state sensor, budgets, release evidence). This mirrors the Phase W advisory-first
pattern; U07's release evidence closes the second slice.

## Dependencies & risks

### Depends on

- Phase T and `arkgate@3.1.0` complete.
- ADR 0002/0003 ownership: one Kernel analysis source and one checked CLI bundle.
- Existing symbol-aware scanning, atomic candidate preflight, adapter parity, deterministic hashes,
  design-smell pilots, and roadmap-cycle package budgets.

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| Becomes a generic code-quality linter | Only model effects/state that change architectural reasoning; leave local style to TypeScript/ESLint |
| Capability names or defaults make config harder for casual users | Optional/backwards-compatible surface; existing starters and human remediation hide depth without hiding evidence |
| Ambient-state detection flags legitimate caches/registries | Advisory first, explicit pure-layer opt-in, fixed negative corpus, strictness requires a later evidence decision |
| Internal splitting creates helper sprawl | Cohesive responsibility seams, exact public parity, one pilot at a time, kill-switch on increased call hopping/coupling |
| Generated bundle or adapter verdicts drift | Existing drift gate plus exact cross-adapter capability fixtures |
| Pre-tool path becomes slower | Measure complete path first; optimize only repeated parsing/scanning shown by profiles |
| Package grows beyond the cycle ceiling | Reuse existing IR/adapters; measure candidate contents; remove duplicated surface before requesting an exception |

## Open decisions owned by U01

1. Capability IDs and whether they extend Analysis IR `1.0` additively or require a version change
   (precedent: 3.1.0 moved the analysis-result envelope `1.0 → 1.1` additively).
2. Config shape and migration relationship with existing `forbiddenGlobals`.
3. Which imports/globals are blocker-grade in the first corpus and which remain advisory.
4. Whether ambient-state policy belongs in MVP config or remains doctor-only through U07.
   Legitimate stateful modules (registries, caches, memoization) may be acknowledged via an
   `.ark/` sidecar following the W01 contract-smell-acks precedent instead of a new config key.
5. Exact end-to-end benchmark scenarios and thresholds after the Linux baseline is recorded.
6. **Policy-delta (T01) classification semantics for the new capability surface:** whether adding
   a capability wall classifies as strengthening (no acknowledgment), and whether migrating
   `forbiddenGlobals` entries into equivalent capability policy is neutral or trips the weakening
   guard when the old entries are removed. U04's enforcement reuses the existing hash-bound ack
   path; the *classification* of introducing/migrating the new keys must be locked here so the
   guard does not block legitimate migrations.
7. **Surface-ownership map — one violation, one voice:** "persistence in the wrong layer" is
   already detectable by layer import rules, design smells (`io-under-application`,
   `facade-sql-in-routes`), and contract smells (`contract-lateral-adapter-allow`, W01); U04 adds
   capability walls. The ADR must state which surface owns which question (declared edge vs lived
   code vs typed effect vs contract shape), how remediations cross-reference each other, and note
   that `persistence` is import-based — unlike clock/random/env, which are global/ambient-based.
8. **W02 governance-weight reconciliation:** whether layer capability policies count as "rules"
   for `governanceWeight` ratios. If they do, wall adopters drift toward the `heavy` band; either
   exclude them from the count or document the effect before U04 ships.

**Draft direction (owner-reviewed, 2026-07-15):** all eight decisions have a drafted answer in
[ADR 0009](../../adr/0009-effect-capability-boundary.md) (Status: Proposed). Load-bearing calls:
both config dialects **lower** to one capability semantic space (makes D6 mechanical and keeps
one engine authoritative); `pure: true` is the casual-user surface (dual-depth); **direct
evidence blocks, transitive inference never does**; ambient state stays doctor-only with sidecar
acks (W01 precedent); capability policies are a governance-weight fact, not a rule count. The ADR
locks to Accepted only when the U01 fixture obligations are met — the plan does not treat the
draft as the contract.

## Promotion

This epic is already linked into the ordered roadmap. When implementation begins:

1. Move only the active U-item from `todo` to `doing`.
2. Promote locked U01 decisions to the next ADR number; do not treat this plan as the contract.
3. Update canonical package/config/agent docs only when a real public surface lands.
4. Mark acceptance criteria from CI evidence, not from stubs or prose.
5. Mark this plan `Shipped` after U07 and retain it as rationale; create a feature pack only if a
   distinct long-lived public capability module needs its own implementation authority.

## Related

- [ROADMAP.md](../../../ROADMAP.md)
- [AGENTS.md](../../../AGENTS.md)
- [ADR 0002 — analysis engine ownership](../../adr/0002-analysis-engine-ownership.md)
- [ADR 0003 — CLI analysis engine bundle](../../adr/0003-cli-analysis-engine-bundle.md)
- [ADR 0005 — atomic change preflight](../../adr/0005-atomic-change-preflight.md)
- [Phase T plan](../change-integrity-loop/README.md)
- [Carmack on inlined code and functional programming](https://number-none.com/blow/john_carmack_on_inlined_code.html)
