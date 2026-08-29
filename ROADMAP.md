# ArkGate internal roadmap — truth, focus, proof

- **Status date:** 2026-08-29 (Engineering doing: none; Phase OR `OR01`–`OR07` **done** on tree, unpublished `arkgate@4.8.0`; `arkgate/order` is an extra **inside** package `arkgate` (ADR 0030), not `@arkgate/order`; `PK01` **todo** (fold ArkRun into the same npm package); `WH01` **done** (ADR 0026); `K01` **parked** — 4.7.6 shipped workflow primitives, bus commit gaps and durable outbox remain; Phase DX `DX01`–`DX03` **done** on `main` (not in published `arkgate@4.7.6`); Phase HS `HS01`–`HS05` **done**; `RN16` **done**; `RN17` **done**; Phase RN ArkRun shipped **4.7.0**; companion `@arkgate/runtime` on npm `experimental`; Write. Check. Ship. patch **4.7.5** published; npm `latest` is **4.7.6**; `AL05` parked; Z09 still parked)
- **Scope:** canonical implementation queue for the ArkGate library repository
- **Rule:** one active item at a time; do not start an item until all dependencies are `done`

This roadmap supersedes the former “Trust 95+” estimate and its active Q-track. Shipped work is
kept in the [historical appendix](docs/archive/roadmap-history.md), but it is not evidence that the current
product is release-ready.

---

## Product mandate

**Write. Check. Ship.** When the agent writes a bad import, the write doesn’t land.

**ArkGate is the product. Untouchable.** Import rules. Deterministic. No LLM pass/fail.
Skills and `AGENTS.md` never replace the check.

```text
ArkGate   always     import rules (write + required CI)
ArkRules  optional   policies inside a layer
ArkRun    optional   experimental runtime — in-memory, not Postgres
ArkOrder  optional   pattern plane (ξ vs s) — same npm package, not durable
```

ArkRules, ArkRun, and ArkOrder must not determine the `arkgate` package shape. Absence is silent.
Same write/CI plane when they are on. Voice: [docs/product-voice.md](docs/product-voice.md).

### North-star product invariant

- Earliest useful deny: hard PreToolUse when covered, MCP prepare when the agent calls it,
  required CI as the non-bypassable merge line.
- Same tree + same candidate + same policy → same verdict on every parity-capable adapter.
  Incomplete analysis never looks green.
- Every rejection teaches: one human next step, plus JSON/evidence for people who want it.
- After import rules pass, help tidy: where code belongs, leftover design work, one small
  refactor at a time. Judgment aids never masquerade as the check.

### Product boundary

**Shipped in 3.1.0**

- Protect **contract transitions**, not only the final `ark.config.json`: classify policy deltas
  and require explicit, hash-bound acknowledgment for weakening changes.
- Preflight create/update/delete batches as one atomic candidate so cross-file edges and cycles
  are rejected before the host commits any source write.
- Add an optional, tool-agnostic architecture change map and a read-only convergence report for
  multi-step work. Keep product intent in the user's own spec or brief.
- Reuse the existing analysis engine, CLI/MCP adapters, and current skills; do not add a second
  planner, task tracker, or skill namespace.

**Still frozen through 4.5.0 / Phase DF (do not start without a new ROADMAP item)**

Phase DF restates these freezes for the **arkgate@4.5.0** train (plan lock `DF01`). Phase ACS +
IC freezes remain; DF adds domain-fitness and session-truth non-goals (no score surface, no
Level-5 monorepo aspiration). **Exception:** Phase **PL** (`understandable-ark-4.6`) is the
authorized **4.6.0** train for plain-language human surfaces + shared home skills — it does not
lift DF freezes on scores, new skill names, sensors, or LLM verdicts.

- New architecture presets or policy packs.
- New skill *names* beyond consolidating/clarifying the current 13 (prefer deepen + route +
  Agent Skills packaging of the same names). **IC05 deepens skill bodies** for vibe coders — same names.
- New ArkRules sensor vocabulary (e.g. family/export symmetry) without ADR + field demand.
- LLM-derived pass/fail or package “process verdict” (maintainer offline eval only).
- Enforcement claims from AGENTS.md, skills, or version-matched agent projection alone.
- New runtime **kernel** features outside Phase RN or Phase OR. **Exception:** Phase **RN**
  (ArkRun gated complement, target `arkgate@4.7.0`) is the authorized extra plane: `arkRun`
  on the contract, anti-skip sensors, companion `@arkgate/runtime` DX. Store durability and
  `K01` stay parked; in-memory stores remain reference-only. **Exception:** Phase **OR**
  (ArkOrder gated extra; [plan](docs/plans/arkorder/README.md)) is the authorized order
  plane: `arkOrder` on schema `1.3`, anti-skip sensors, subpath `arkgate/order` (4 verbs;
  no bus; same npm package — ADR 0030). Does not close `Z09` / `K01`. No new skill names.
- False hard-write claims for soft hosts (Codex/OpenCode). Cursor hard write is limited to
  listed `preToolUse` ops when hooks are installed + trusted.
- Numeric trust / architecture / principle health **score**, average, or Excellent/Good rank band.
- Improvement compass as a gate input (projection is advisory `notAScore` only).
- New report polish that does not expose required evidence (presentation-only HTML growth).
- Org control-plane, polyglot support, or broad codemods.
- “Level 5 the monorepo” (formal verification, 100% mutation) as a product goal — selective L5
  islands on truth paths only.
- Raising pure-domain LOC budgets **without** a behavior-preserving split when already over
  ceiling (disguised maintenance debt; DF03 forbids as sole fix).
- Z09 retained-adoption / independent-close as DF scope (parked residual `RB-11`).
- New doctor/advisory planes that invent residual or a second verdict. Advisory must
  project existing facts ([ADR 0026](docs/adr/0026-gate-waist-facts-in-verdict-out.md)).
  Skills/doors stay the intelligent edge. Do not add a second analysis engine.

### Hard lines

- No silent auto-apply of judgment-heavy changes.
- No automatic approval of a weaker contract; any exception is explicit and bound to both policy
  hashes.
- No enforcement claim based only on prompt context, `AGENTS.md`, a rules file, or MCP registration;
  advisory remains labeled advisory unless the host makes that path non-bypassable.
- No LLM-derived pass/fail verdict and no blocking diagnostic without stable evidence plus an
  actionable next step.
- No general codemod engine.
- No product-spec or task-management engine, and no behavioral “done” claim from path traceability.
- No “Enforce” status when active-host enforcement or governed coverage is incomplete.
- No release claim that cannot be reproduced from a clean checkout.
- No numeric trust score. The final gate is binary.

---

## Audit baseline

These are historical starting facts captured before their associated phases. They intentionally
retain the measurements and gaps that motivated the work; they are **not** the current product
status. Use the ordered queue, closure evidence, and [Current queue](#current-queue)
for current truth.

| Area | Baseline | Consequence |
|---|---|---|
| Architecture | Self-hosted strict check passes; 125/125 files governed | Keep the contract and dogfood path |
| Tests | 680 tests passed, but `npm run test:coverage` exited 1 at 84.73% branch coverage vs 85% required | `S02` owns restoring the release gate |
| Mutation testing | Roadmap claimed a mutation ratchet; no mutation runner or configuration exists | Prior Q1 completion claim is withdrawn |
| Write enforcement | Claude/Grok have hard hooks; Cursor/Codex are advisory at write time | Capabilities must be reported per active host |
| Strict onboarding | Codex-only and Cursor-only installs generate CI that fails for a missing PreToolUse hook | `start` can create a broken setup |
| Scanner soundness | Known shadowing false positives and alias/import/require bypasses | Bypass resistance is not yet proven |
| Runtime | Audit failure can retry an already-successful workflow effect | Duplicate external side effects are possible |
| Onboarding | Default setup can generate 71 files/~487 KB; tested brownfield coverage was 0%, 23%, and 33% | Adoption cost is too high and contract fit too low |
| Performance | Cold scan is roughly linear and ~5 s at 50k trivial files; “warm” benchmark also uses `--no-cache` | Incremental latency is unknown |
| Package | ~3.1 MB unpacked; root and runtime bundles overlap; core scanner is not a stable import API | Public surface is inverted |
| External proof | V03 reproduced 12 MIT-licensed public targets with 93% median governed coverage and no open P0/P1 | Retain the scheduled matrix as field evidence |
| Supply chain | Protected main, signed tags, provenance, CodeQL/Semgrep, and no open alerts | Preserve this foundation |
| Change integrity | Final-state checks and single-file prepare-write exist; policy deltas and atomic multi-file preflight are not public adapter surfaces, and no plan-vs-actual convergence exists | `T01`–`T05` move deterministic feedback before the first write without becoming a spec manager |

### Release blocker register

| ID | Severity | Status | Resolution / owner |
|---|---:|---|---|
| `RB-01` | P0 if runtime remains stable | `closed` | S01 separated effect retry from completion persistence/audit |
| `RB-02` | P1 | `closed` | S03 computes enforcement from the active host only |
| `RB-03` | P1 | `closed` | S04 gives every supported host-only install a valid merge/write contract |
| `RB-04` | P1 | `closed` | S05 closed the confirmed semantic false positives and dependency bypasses |
| `RB-05` | P1 | `closed` | S02 restored executable coverage and mutation gates |
| `RB-06` | P1 | `closed` | O03 compact active-host setup passed PR #41 CI and merged as `105cd39` |
| `RB-07` | P0 operational | `closed` | Z01 restricts cleanup to validated ArkGate-owned outputs and invocation-owned tarballs; PR #80 CI + release smoke are green |
| `RB-08` | P1 | `closed` | Z02's distinct exact host and schema 1.2 fail-closed verdict passed all 36 packed cells in PR #81 CI; published 3.7.0 predates the correction |
| `RB-09` | P1 | `closed` | Z03 selected versioned resolved-candidate facts; Z04 restored one graph/verdict across the parity-capable API, preflight, CLI, MCP, complete-patch write gate, eligible ESLint, and final CI |
| `RB-10` | P1 journey | `closed` | Z05–Z06 proved the installed starter, managed upgrade, observed enforcement, and packed journey across the clean-room matrices |
| `RB-11` | P1 claim | `open` | Residual only: retained-adoption and independent-close under `Z09`. Z07 (10× feedback), Z08 (causal evidence), and Z10 (design-delta + runtime hardness) already closed with recorded evidence in 3.8.0; do not re-open those claim gates as if unearned |
| `RB-12` | P1 enforcement | `closed` | Z10's semantic base-relative ratchet and runtime-observed hardness passed exact-head PR #89 CI run `29796255993` and Security run `29796256067` on `357e282` |

`RB-01`–`RB-06` are closed by the corresponding completed items and their recorded evidence.
V05 passed its then-current binary exit gate in PR #49. The separately authorized stable `3.0.0`
release completed on 2026-07-13; closing `RB-06` had removed the onboarding release blocker.
The post-3.7.0 audit below supersedes that evidence as proof of *current* release readiness for
the pre-3.8.0 distribution. Published **3.8.0** carries Z01–Z08 and Z10; `RB-11` remains open
only for longitudinal retention and independently signed close (`Z09`). Broad product claims that
require those two outcomes stay blocked; ordinary corrective patches do not.

### Post-3.7.0 audit reset (2026-07-17)

A first-principles audit of the installed artifact and full field path confirmed four classes of
false assurance. The shipped history remains `done`; its closure evidence is historical and cannot
stand in for the new corrective proof.

- A real `arkgate@3.7.0` tarball installed beside TypeScript 7 can deduplicate away the promised
  JS-API fallback. Full check fails unavailable, while `--plan --json` can report `goal.met: true`
  over an unanalyzed violating fixture.
- The compiler-free atomic preflight does not resolve `tsconfig` aliases/workspace packages that
  final TypeScript-backed CI resolves. The public API also delegates governed-scope invariants to
  its Tooling adapter, and AICodeGate may apply a hidden same-layer path heuristic after the
  contract allows an edge.
- Release cleanup accepts broad caller-selected output and package isolation removes unrelated
  tarballs; copied gallery starters and managed upgrades do not all satisfy their documented
  clean-room journey.
- The live-agent workflow currently selects a skipped case; adoption `firstGreen` stops before the
  strict check, excludes non-green cells from its median, and records false blocks/bypasses as
  constants. The prior independent-review gate verifies a declaration, not reviewer independence.

These are exactly the roadmap's stop conditions: a confirmed destructive path, adapter verdict
divergence, and package/release proof that a clean consumer cannot reproduce. Phase Z runs before
new feature work. Narrative scope and kill switches:
[enforcement-truth-at-speed](docs/plans/enforcement-truth-at-speed/README.md).

---

## Operating rules

### Status values

`todo` · `doing` · `blocked` · `done` · `parked`

Only one item may be `doing`. A task may be marked `done` only when its item-specific acceptance
criteria and the common merge gate are green on the same commit.

### Per-item workflow

1. Change the item from `todo` to `doing` in this file.
2. Create or expose a failing test/evidence case before changing behavior.
3. Implement the smallest change that closes the item.
4. Run the item-specific verification, then the common merge gate.
5. Update user-facing docs and `CHANGELOG.md` when behavior or a stable surface changes.
6. Record measured before/after evidence in the PR and, where named, under `eval/`.
7. Change the item to `done` only after CI passes on the pushed commit.

### Common merge gate

Run for every implementation item unless the item is documentation/decision-only:

```bash
npm run typecheck
npm run test:confidence
npm run check:js
npm run check:layer-match
npm run check:cli-pure
npm run check:module-budgets
npm run check:package-files
npm run check:architecture
npm run build
```

For package-surface changes, also run:

```bash
npm pack --dry-run
npm run test:ts-compat
```

### Stop conditions

Stop the queue and add a new stabilization item before continuing when any of these occurs:

- A new P0/P1 correctness or security issue is confirmed.
- A proposed fix lowers coverage, strictness, or governed scope to become green.
- Two adapters produce different verdicts for the same contract and source.
- Onboarding writes product source or rewrites an unrelated user file without explicit consent.
- A package/release check cannot be reproduced from a clean checkout.

While any `RB-*` blocker is open, do not publish a normal feature release or repeat a claim owned by
that blocker. A stable corrective release may close a strict subset of blockers when it reduces
risk, names every remaining limitation, and passes the item-specific packed-candidate gate. Use a
patch when no stable public API is added; an explicitly approved backward-compatible corrective
minor is allowed only when the blocker cannot close without a new stable export/API, and it may add
no unrelated surface. Additive evidence/schema fields that make a false-green state explicit must
follow `docs/package-surface.md` and their schema/type/adapter compatibility gate. Otherwise use a
non-`latest` canary. The active phase must name its corrective-release lanes explicitly so a
correctness fix is not serialized behind unrelated performance or longitudinal evidence.

---

## Current queue

Shipped phases (S/C/O/V through SK/TW/CX/DC) live in
[docs/archive/roadmap-history.md](docs/archive/roadmap-history.md). This file is the live
implementation queue only.

### Phase AL — Alive in six months

Plan: [docs/plans/alive-in-six-months/README.md](docs/plans/alive-in-six-months/README.md).
**Does not close `Z09` / residual `RB-11`.** Do not invent adopter counts.

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 179 | `AL01` | `done` | M | CX03 | D0 adopted: required GitHub `--strict-merge` status **or** `.ark/adoption-stance.json` `stance: advisory-only` |
| 180 | `AL02` | `done` | M | CX03 | Propia created-path: `--strict-merge` evaluates new UI `domain-logic-in-ui` vs merge-base |
| 181 | `AL03` | `done` | M | CX03 | Stewards or Adapt: empty `stewards[]` cannot print Healthy ENFORCE; T4/T5 need `--contract-session` |
| 182 | `AL04` | `done` | M | CX03 | First-run noun cut; compact doctor; `--doctor --all` prints Details |
| 183 | `AL05` | `parked` | S | required-status possible + 3 partners | Field enrollment. Does **not** close Z09 |
| 184 | `AL06` | `done` | S | AL04 | Compact first-screen vs Details independently invocable; first-screen honesty stays |

Engineering doing: none. `OR01` **done** (ADRs 0027–0029). `WH01` **done** (ADR 0026). Phase OR seeded.
`K01` **parked** (4.7.6 primitives only).
Phase DX (`DX01`–`DX03`) **done** on `main`, not in published `arkgate@4.7.6`.
Phase HS (`HS01`–`HS05`) **done**. Remaining first-contact copy **4.7.3** published. Write. Check. Ship. patch **4.7.5** published. **4.7.6** is on npm `latest`.
`RN16` **done** (public docs + 4.7.0 published). `RN17` **done** (`@arkgate/runtime@0.1.0-experimental.0` on npm `experimental`).
`RN15` **done** (deepen `/ark-runtime` `/ark-place` `/ark-adopt`; no new skill names).
`RN14` **done** (skip corpus: extra absent = green; enforced = fail `new` / peer import / homemade bus).
`RN13` **done** (graph slices: process/technical, degrees, query + Mermaid helper).
`RN12` **done** (dev inspector: `127.0.0.1`, production veto, SSE + snapshots, lazy load; no public bind).
`RN11` **done** (local / blocking / broker-fallback transports; `ephemeral` default true; no cloud SDKs).
`RN10` **done** (`register()` `uses` / `reactsTo` / `raises` / `sends` +
`getDependencyInformationPackage()`; factories, live instances, and input DTOs stay off the
snapshot).
`RN09` **done** (brand ArkRun on `@arkgate/runtime`; keep `createStrictArkKernel`;
no process singleton; kernel stays out of the `arkgate` tarball).
`RN08` **done** (doctor / status / report `arkRun` section, `notAScore`; mergePlanes honesty; report-parity).
`RN07` **done** (CLI / MCP / hook / preflight / CI extra-teeth parity — one verdict; enforced extra teeth only when classified).
`RN06` **done** (`arkgate/eslint` import/`new` envelope; editor parity tests).
`RN05` **done** (diagnostic catalog `ARKRUN_*` + dual-depth `nextAction`; remediation parity tests).
`RN04` **done** (tier-1 sensors emit `ARKRUN_*`; advisory does not flip `valid`; enforced blocks).
`RN03` **done** (resolver facts for kernel call sites, managed `new`, composition-root hits; facts schema additive).
`RN02` **done** (schema `1.2` `arkRun` extra; `1.1` migrates; absence silent; invalid extra fails closed).
`RN01` done (ADRs 0020–0024 accepted). `Z09` stays parked (retained adoption + independent
close). 30-day freeze from 2026-08-22: no explore / compass as `doing`. Engineering doing:
none (`OR01` paper done; `OR02` is next `todo`). Phase RN shipped in **4.7.0** (gate extra). Companion registry
publish is `RN17` / **4.7.4**. Phase HS is the **4.7.1** host-catalog patch.

### Phase HS — One catalog, one root (4.7.1)

Plan: [docs/plans/one-catalog-one-root/README.md](docs/plans/one-catalog-one-root/README.md).
Target **arkgate@4.7.1**. Does **not** close `Z09` / `K01`. No new skill names.

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 201 | `HS01` | `done` | M | RN16 | Visible `arkgate@<version>. ` prefix on skill `description`; stamp-refresh without `--force` |
| 202 | `HS02` | `done` | L | HS01 | Canonical `.agents/skills`; Claude/Grok/OpenCode adapters; Cursor shares catalog (no `.cursor/commands` copy) |
| 203 | `HS03` | `done` | M | HS02 | Skip home skill/MCP write when project catalog exists; `--prune-home-duplicates`; doctor next action prune |
| 204 | `HS04` | `done` | S | RN15 | `/ark-contract` routes ArkRun extra (adopt / runtime / place); no `/ark-run` |
| 205 | `HS05` | `done` | M | HS03+HS04 | Docs + **4.7.1** published on npm `latest` |

### Phase RN — ArkRun gated complement

Plan: [docs/plans/arkrun/README.md](docs/plans/arkrun/README.md).
Target **arkgate@4.7.0** (additive `arkRun`, schema `1.2`). Does **not** close `Z09` / `K01`.
Does not ship cloud adapters or a process singleton. Companion kernel stays
`@arkgate/runtime` (0.x; in-memory stores are reference-only).

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 185 | `RN01` | `done` | M | — | ADRs [0020](docs/adr/0020-arkrun-gated-extra-plane.md)–[0024](docs/adr/0024-arkrun-transport-ports.md) accepted in `docs/adr` (extra plane, companion isolation, anti-skip facts, mandatory declarations, transport ports) |
| 186 | `RN02` | `done` | L | RN01 | `arkRun` on `ark.config` schema `1.2`; `1.1` migrates; absence silent; invalid extra fails closed |
| 187 | `RN03` | `done` | L | RN02 | Resolver facts for kernel call sites, managed `new`, composition roots |
| 188 | `RN04` | `done` | L | RN03 | Tier-1 ArkRun sensors; advisory does not flip `valid`; enforced blocks |
| 189 | `RN05` | `done` | M | RN04 | Diagnostic catalog `ARKRUN_*` + dual-depth `nextAction` |
| 190 | `RN06` | `done` | M | RN04 | `arkgate/eslint` rules for the same sensors |
| 191 | `RN07` | `done` | L | RN05 | CLI / MCP / hook / preflight / CI extra-teeth parity — one verdict; enforced extra teeth only when classified |
| 192 | `RN08` | `done` | M | RN07 | Doctor / status / report `arkRun` section (`notAScore`); mergePlanes honesty; report-parity |
| 193 | `RN09` | `done` | M | RN01 | Brand ArkRun on `@arkgate/runtime`; keep `createStrictArkKernel` |
| 194 | `RN10` | `done` | L | RN09 | Interaction declarations + serializable information package (no factories) |
| 195 | `RN11` | `done` | L | RN09 | Local / blocking / broker-fallback transports; `ephemeral` default true |
| 196 | `RN12` | `done` | M | RN10 | Dev inspector: `127.0.0.1`, production veto, lazy load |
| 197 | `RN13` | `done` | M | RN10 | Graph slices: process/technical, degrees, query |
| 198 | `RN14` | `done` | L | RN07 | Skip corpus: extra absent = green; enforced = fail `new` / peer import / homemade bus |
| 199 | `RN15` | `done` | M | RN08 + freeze end | Deepen `/ark-runtime` `/ark-place` `/ark-adopt`; no new skill names |
| 200 | `RN16` | `done` | M | RN08 + RN14 | Public docs + **4.7.0** published on npm `latest`; durability honesty unchanged |
| 206 | `RN17` | `done` | M | RN16 | First experimental npm publish of `@arkgate/runtime@0.1.0-experimental.0` (`experimental` dist-tag). `/ark-runtime` can install `@arkgate/runtime@experimental`. Does not close Z09/K01 |

### Residual Phase Z

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 73 | `Z09` | `parked` | L | ≥8 consented adopters + independent review | Residual RB-11 close. Not an engineering `doing` slot |

### Phase PR — Production Runtime

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 207 | `K01` | `parked` | L | RN17 | Residual: in-process bus commit gaps, atomic outbox handoff, durable stores. 4.7.6 shipped workflow OCC / lease / `tx` / `resume` primitives only. Not an engineering `doing` slot. |

### Phase DX — ArkRun DX Relaxations

Targeting next `arkgate` release to reduce `ARKRUN_DIRECT_NEW` friction for transient objects.

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 208 | `DX01` | `done` | S | K01 | Auto-exempt `Error` subclasses (or classes ending in `Error`) from `ARKRUN_DIRECT_NEW` sensor, or add `ignoreDirectNewForErrors` config. |
| 209 | `DX02` | `done` | M | K01 | Establish naming convention (`*DTO`, `*VO`) or config pattern to exempt pure Value Objects / DTOs from strict instantiation rules. |
| 210 | `DX03` | `done` | S | K01 | Rename `arkRun.compositionRoots` to `arkRun.kernelRoots` (or `kernelFactories`) and/or relax `ARKRUN_MISSING_ROOT` to only require at least one kernel instantiation per glob, avoiding false positives on layer-wide globs. |

### Phase WH — Gate waist lock

Decision only. Does **not** close `Z09` / `K01`. No new skill names, sensors, or doctor planes.

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 211 | `WH01` | `done` | S | — | [ADR 0026](docs/adr/0026-gate-waist-facts-in-verdict-out.md) accepted: waist is config + resolved facts → one analysis-result; new advisory must project existing facts; intelligence stays in skills/doors |

### Phase OR — ArkOrder gated extra

Plan: [docs/plans/arkorder/README.md](docs/plans/arkorder/README.md).
ADRs [0027](docs/adr/0027-arkorder-gated-extra-plane.md)–[0030](docs/adr/0030-opt-in-extras-same-npm-package.md).
Fourth extra: operational pattern (ξ vs s). Subpath `arkgate/order` in package `arkgate`
(not `@arkgate/order`; not durable).
Does **not** close `Z09` / `K01`. Does **not** replace ArkRun. No new skill names.
v0 physics: `examples/arkorder-billing/` (`plan` / `cycle` / `tenancy`). This mother repo
does not turn `arkOrder` on against its 4 layers. First-contact voice stays Gate / Rules / Run;
ArkOrder is the fourth extra, named when the consumer opts in.

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 212 | `OR01` | `done` | M | — | ADRs [0027](docs/adr/0027-arkorder-gated-extra-plane.md)–[0030](docs/adr/0030-opt-in-extras-same-npm-package.md) accepted; plan seed; ROADMAP Phase OR. No plane code. |
| 213 | `OR02` | `done` | L | OR01 | `arkgate/order` subpath: `createOrderPlane`, four verbs, clock injection, isolation smoke (root `arkgate` must not export the factory) |
| 214 | `OR03` | `done` | M | OR02 | Gallery `examples/arkorder-billing/` — 3-key SaaS physics; write-path split tests; do not touch `hexagonal-order-api` |
| 215 | `OR04` | `done` | L | OR01 | `arkOrder` on `ark.config` schema `1.3`; `1.2` migrates; absence silent; invalid extra fails closed; weakening ack |
| 216 | `OR05` | `done` | L | OR02+OR04 | Domain-pure `ARKORDER_*` facts/sensors; extraMergeTeeth; catalog + nextAction |
| 217 | `OR06` | `done` | M | OR05 | Skip corpus + `arkgate/eslint` envelope; extra absent = green; enforced fails missing plane / Domain import / generic update |
| 218 | `OR07` | `done` | M | OR03+OR05 | Deepen `/ark-place`; public docs; no `/ark-order` skill; durability honesty unchanged |

### Phase PK — One npm package

Plan lock: [ADR 0030](docs/adr/0030-opt-in-extras-same-npm-package.md). Order never
publishes `@arkgate/order`. ArkRun today still publishes `@arkgate/runtime` (residual).
Does **not** close `Z09` / `K01`. No new skill names.

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 219 | `PK01` | `todo` | L | — | Restore `arkgate/runtime` and `arkgate/nestjs` as **real** subpaths of package `arkgate`; stop documenting `npm i @arkgate/runtime`; keep root export gate-only; sensors teach `arkgate/runtime`; experimental = durability, not a second package |
