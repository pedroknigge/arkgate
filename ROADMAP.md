# ArkGate internal roadmap — truth, focus, proof

- **Status date:** 2026-07-17
- **Scope:** canonical implementation queue for the ArkGate library repository
- **Rule:** one active item at a time; do not start an item until all dependencies are `done`

This roadmap supersedes the former “Trust 95+” estimate and its active Q-track. Shipped work is
kept in the [historical appendix](#historical-appendix), but it is not evidence that the current
product is release-ready.

---

## Product mandate

ArkGate exists to prevent architecture-invalid TypeScript changes with low friction and
verifiable coverage.

```text
product value = writes observed × semantic precision × enforcement strength × retained adoption
```

The product wedge is the architecture contract, semantic analysis engine, agent adapters, and CI
gate. The optional runtime is not the product and must not determine the package shape.

### North-star product invariant

ArkGate is an architecture write firewall plus a coach, not a prompt convention. The
`ark.config.json` contract and deterministic engine decide whether a change is valid; agent memory,
`AGENTS.md`, skills, and prose improve prevention but are never trusted enforcement inputs.

- Validate at the earliest available boundary and enforce at the earliest non-bypassable one: hard
  PreToolUse when covered, transactional MCP preparation for proactive feedback, and a required
  CI/merge check as the final boundary.
- Given the same base tree, candidate change, compiler inputs, and policy, every parity-capable
  adapter returns the same verdict and evidence without an LLM deciding pass/fail. A retained
  lexical compatibility mode that lacks required facts reports incomplete and never borrows the
  parity claim.
- Every rejection teaches: concise human cause and next action for a casual user, plus stable JSON,
  hashes, and exact evidence for an experienced engineer.
- After structural validity, help improve architecture and code organization: suggest where new
  code belongs, surface design smells, recommend a consistent pattern, and propose one small
  extraction pilot at a time. These evidence-backed judgment aids never masquerade as deterministic
  pass/fail enforcement.

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

**Still frozen (do not start without a new item)**

- New architecture presets or policy packs.
- New skill *names* beyond consolidating/clarifying the current 13 (prefer deepen + route).
- New runtime features (optional kernel stays experimental).
- New report polish that does not expose required evidence.
- Org control-plane, polyglot support, or broad codemods.

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
status. Use the ordered queue, closure evidence, and [Next implementation session](#next-implementation-session)
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
| `RB-11` | P1 claim | `open` | Z07–Z09 must earn the 10x feedback, causal-evidence, retained-adoption, and independent-close claims |

`RB-01`–`RB-06` are closed by the corresponding completed items and their recorded evidence.
V05 passed its then-current binary exit gate in PR #49. The separately authorized stable `3.0.0`
release completed on 2026-07-13; closing `RB-06` had removed the onboarding release blocker.
The post-3.7.0 audit below supersedes that evidence as proof of *current* release readiness:
`RB-11` remains open, so the broad product-claim stop condition still applies.

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

## Ordered implementation queue

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 1 | `S01` | `done` | S | — | Workflow effects are never retried because telemetry failed |
| 2 | `S02` | `done` | M | `S01` | Local confidence gates are green and truthfully named |
| 3 | `S03` | `done` | M | `S02` | Enforcement capabilities are computed per active host |
| 4 | `S04` | `done` | M | `S03` | Every supported host-only install produces a valid CI/write contract |
| 5 | `S05` | `done` | M | `S04` | All confirmed scanner false positives and bypasses are closed |
| 6 | `S06` | `done` | S | `S03`–`S05` | README, docs, doctor, and site use one truthful support matrix |
| 7 | `S07` | `done` | S | `S06` | ArkGate is retained as the canonical product identity |
| 8 | `C01` | `done` | M | `S07` | `ark.config.json` has a versioned JSON Schema and migrations |
| 9 | `C02` | `done` | M | `C01` | A stable analysis IR and programmatic API are specified |
| 10 | `C03` | `done` | L | `C02` | CLI/MCP scanning uses one importable engine without generated duplication |
| 11 | `C04` | `done` | L | `C03` | Symbol-aware analysis defines and enforces the supported soundness envelope |
| 12 | `C05` | `done` | M | `C04` | CLI, MCP, ESLint, hooks, and Action have contract parity |
| 13 | `C06` | `done` | L | `C05` | Runtime is isolated from the gate package and marked experimental until proven |
| 14 | `O01` | `done` | M | `C05` | Repository discovery is source/graph-first rather than framework-guess-first |
| 15 | `O02` | `done` | M | `O01` | `ark start` previews all mutations and measured coverage before apply |
| 16 | `O03` | `done` | L | `O02` | Host setup writes at most five small project files by default |
| 17 | `O04` | `done` | M | `O03` | Clean-room onboarding remains green for every supported host profile; PR #43 merged |
| 18 | `V01` | `done` | L | `C05`, `O04` | Cold, warm, and incremental performance have real CI budgets; PR #45 passed green CI |
| 19 | `V02` | `done` | M | `C04` | Mutation, property, and fuzz tests defend critical boundaries |
| 20 | `V03` | `done` | L | `O04`, `V01`, `V02` | External adoption is reproduced on 12 pinned MIT-licensed repositories |
| 21 | `V04` | `done` | M | `C06`, `V03` | Package and release artifacts are bounded, complete, and attestable |
| 22 | `V05` | `done` | M | all prior items | Independent audit passed; PR #49 CI green and beta exit authorized |
| 23 | `B01` | `done` | L | `V05` failure evidence | Approved-adoption coverage recovered without lowering the exit criterion |

### Phase P — post-3.0 pattern depth (contract + lived design)

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 24 | `P01` | `done` | M | 3.0.0 released | Skills explore non-deterministic residual and plan Shape dual-plan B; routing de-overlaps skills |
| 25 | `P02` | `done` | M | `P01` | Doctor reports deterministic design smells (path vs design); ENFORCE can be design-weak |
| 26 | `P03` | `done` | M | `P02` | Stable JSON IR for plan **B** pattern bets (pilot, success signal, kill-switch); never mechanical-safe |
| 27 | `P04` | `done` | M | `P03` | Eval fixtures: ENFORCE + design-weak and spaghetti concurrent patterns; CI guards skill/CLI honesty |
| 28 | `P05` | `done` | M | `P03` | Extraction-card playbook productized in docs + judgment assists (no general codemod) |

### Phase Q — power + simple (AI-clear path)

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 29 | `Q01` | `done` | M | Phase P done | Single post-green “clarify for AI / Shape” door in doctor + routing |
| 30 | `Q02` | `done` | S | `Q01` | Human outcome language for each design smell id (docs parity) |
| 31 | `Q03` | `done` | M | `Q01` | Optional golden pattern artifact for new-code place/prepare-write guidance |
| 32 | `Q04` | `done` | M | `Q02`, `Q03` | Pilot loop productized: extraction card → one pilot → re-doctor |
| 33 | `Q05` | `done` | M | `Q04` | AI-velocity evidence: golden-path vs design-weak same feature scenario |
| 34 | `Q06` | `done` | S | `Q01`–`Q05` | Release train: CHANGELOG, 3.0.3 notes, surface parity, dry-run readiness |

### Phase T — change integrity (contract delta → atomic patch → convergence)

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 35 | `T01` | `done` | M | Phase Q done | Semantic policy-delta guard detects and blocks unacknowledged contract weakening |
| 36 | `T02` | `done` | L | `T01` | CLI/MCP preflight create, update, and delete batches atomically before writes |
| 37 | `T03` | `done` | M | `T02` | Optional versioned architecture change map describes planned paths and dependency edges |
| 38 | `T04` | `done` | M | `T03` | Read-only convergence reports planned, missing, contradictory, and unplanned structural impact |
| 39 | `T05` | `done` | M | `T01`–`T04` | Context-independent enforcement ladder, dual-depth remediation, adapter parity, adversarial eval, docs, and release evidence |

Phase T shipped in **`arkgate@3.1.0`**. Retained evidence:
[change-integrity-loop](docs/plans/change-integrity-loop/README.md).

### Phase U — understandable execution (explicit effects + legible core)

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 40 | `U01` | `done` | S | Phase T shipped | ADR locks architecture-vs-style boundary, capability vocabulary, compatibility, and fixed corpus |
| 41 | `U02` | `done` | M | `U01` | Separate self-hosted cohesion pilots clear the named canonical god-module evidence without public drift |
| 42 | `U03` | `done` | L | `U01`, `U02` (soft) | Canonical analysis IR reports typed effect capabilities with stable evidence and generated-bundle parity |
| 43 | `U04` | `done` | L | `U03` | Opted-in layer capability walls block complete invalid patches consistently across every adapter |
| 44 | `U05` | `done` | M | `U03` | Ambient mutable-state sensor remains advisory until blocker-grade precision is proven |
| 45 | `U06` | `done` | M | `U04`, `U05` | Dual-depth remediation and measured end-to-end pre-tool/MCP budgets ship without style scoring |
| 46 | `U07` | `done` | S | `U01`–`U06` | Adoption, docs, package, compatibility, and release evidence close the phase |

**Phase close:** Slice 1 (`U01`–`U03`) shipped in `arkgate@3.3.0` from PR
[#68](https://github.com/pedroknigge/arkgate/pull/68) (squash `64e5def`); Slice 2 (`U04`–`U07`)
shipped in `arkgate@3.4.0` from PR [#69](https://github.com/pedroknigge/arkgate/pull/69).
No U-item authorizes mandatory inlining, function/file-length rules, class bans, broad codemods,
runtime work, or LLM-derived verdicts.

**Release slicing (owner decision 2026-07-15, completed):** Phase U shipped as two stable minors —
`U01–U03` first (advisory capability evidence in the IR, no enforcement), then `U04–U07` (opted-in
walls, state sensor, budgets, release evidence) — mirroring the Phase W advisory-first pattern.
`U02` was a hygiene dependency for `U03`, not a logic one. Narrative scope and retained
kill-switches: [understandable-execution](docs/plans/understandable-execution/README.md).

### Phase W — contract health

Origin: 2026-07-15 external field analysis of a governed production Next.js project (10 layers,
~90 rules, 228 files, 0 violations). The analysis validated enforcement but surfaced three gaps
that live in the contract itself, not in the governed code. **Owner decision (2026-07-15):**
Phase W runs before Phase U — it has no technical dependency on U (it reads the contract and
existing coverage data, not code effects), it is small and advisory-only, and the field feedback
is fresh. Order is `W03 → W01 → W02`. Timebox: if `W01` grows beyond M, park it where it stands
and start `U01`. Phase U remains next after W ships. Order numbers record insertion order in this
file; for the U/W pair, the execution order is the one stated here (W before U).

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 47 | `W03` | `done` | S | Phase T shipped | Positioning docs name the advisory-local / hard-CI boundary as a deliberate trade-off |
| 48 | `W01` | `done` | M | `W03` | Doctor reports deterministic contract smells (meta-lint of `ark.config.json` itself) |
| 49 | `W02` | `done` | S | `W01` | Governance-weight evidence is reported descriptively without becoming a score or gate |

Phase W shipped in **`arkgate@3.2.0`** (2026-07-15): PR [#66](https://github.com/pedroknigge/arkgate/pull/66)
squash-merged as `0a3e098` with all required checks green; signed tag `v3.2.0`; GitHub Release
published from `docs/releases/3.2.0.md`; `publish-npm.yml` run 29455032343 succeeded and
`npm view arkgate` shows `3.2.0` on `latest`. Each item retains commit + review evidence below.

### Phase X — field feedback: report parity, ack lifecycle, reshape (candidate)

Origin: 2026-07-16 field session over **the field-adopter platform** (2,996 files, 12 layers, ENFORCE at
100% with keep-empty baseline — the strongest adoption state on record). Reading its report and
tree surfaced four gaps, one implemented immediately by owner directive; the rest are candidates
gated on the usual promotion discipline.

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 47b | `X01` | `done` | S | 3.4.0 shipped | The HTML report renders every doctor advisory, guarded by an executable parity rule |
| 48b | `X02` | `done` | S | `X01` | Contract-smell acknowledgments gain a lifecycle (review-by/staleness vs origin) so migration acks cannot fossilize |
| 49b | `X03` | `done` | S | — | Lateral-adapter smell recognizes family infrastructure (adapter → its own infra base is not a lateral peer) |
| 50b | `X04` | `done` | L | `X02`, plan doc + ADR | Reshape co-pilot: physicalCohesion sensor + reshape plan as a T03 change map, agent-executed one pilot at a time (moves/merges are judgment; never a codemod) |
| 51b | `X05` | `done` | S | `X02` | Stale acknowledgments are surfaced (`ackLifecycle.stale` + human line) so an ack orphaned by a quieted smell is deleted, not silently carried |
| 52b | `X06` | `done` | S | `X03` | Family-infra heuristic covers mid-name families (`<Domain><Family>Adapters -> <Family>Infrastructure`) without weakening the cross-family default |
| 53b | `X07` | `done` | XS | `X01` | HTML report evidence lists carry their own honest `(+N more)` overflow marker (today capped at 6 with no marker) |

X01–X03 shipped in **`arkgate@3.5.0`** (2026-07-16): X01 from PR
[#71](https://github.com/pedroknigge/arkgate/pull/71) (squash `a5106b7`); X02+X03 and the release
train from PR [#72](https://github.com/pedroknigge/arkgate/pull/72) (squash `7abf9e7`, CI 27/27
green, cross-model review findings fixed in-branch). Signed tag `v3.5.0`; GitHub Release published
from `docs/releases/3.5.0.md`; `publish-npm.yml` run 29545346848 succeeded and `npm view arkgate`
shows `3.5.0` on `latest`. Each item retains commit + review evidence below.

X04–X07 shipped in **`arkgate@3.6.0`** (2026-07-17): Phase X consolidation PR
[#76](https://github.com/pedroknigge/arkgate/pull/76) (squash `5d368f5`, CI + Security green on
main; carries the reviewed content of #74 and #75). Signed tag `v3.6.0`; GitHub Release published
from `docs/releases/3.6.0.md`; `publish-npm.yml` run 29592499256 succeeded and `npm view arkgate`
shows `3.6.0` on `latest`. Phase X is fully shipped.

### Phase Y — field feedback round 2: decisions, shape honesty, edit hygiene (3.7.0)

Origin: 2026-07-17 field session over the field-adopter worktree — upgraded 3.5.0 → 3.6.0 with
`/ark-upgrade` and exercised the full skill chain (`/ark-explore` → `/ark-fix` → `/ark-autopilot`
→ `/ark-contract` → `/ark-explain`) end to end with **zero CLI failures** and every Phase X
surface behaving as designed (see the 3.6.0 field validation below). The same session surfaced
four gaps and one standing-guardrail trigger; all are candidates gated on the usual promotion
discipline. `Y05` runs first — the package-budget guardrail requires recalibrated cycle ceilings
before the first implementation item starts.

The previously planned first post-release activity — a supervised reshape field pilot on the
field adopter — is **superseded by the field outcome**: the adopter's mirror is golden-consistent
and the pilot was correctly rejected there. The supervised pilot needs a corpus target whose
mirroring is *not* explained by its golden pattern; until one exists, the rejection experience
feeds `Y01` design directly.

`Y06`–`Y10` fold the standing retained candidates into the queue as `parked` entries so nothing
lives only in prose: each names the gate that promotes it, and none may start while `parked`.

**Release close (2026-07-17):** Y05, Y01–Y04, and the evidence-promoted Y08 ship in 3.7.0.
Y06, Y07, Y09, and Y10 remain parked; this release does not treat an unmet promotion gate as an
implementation backlog.

**Owner-authorized confidence-budget exception (2026-07-17):** after adding meaningful Y08
multi-form ESLint listener coverage, the complete release dry-run measured 6,661 / 7,854 covered
branches (84.81%). The global branch floor is explicitly recalibrated from 85% to 84.5%; no source
include or exclusion changed, statement/function/line floors stay fixed, and mutation remains a
required release gate. This is a measured regression-confidence budget change, not a weakening of
Ark's product-policy or governed-scope enforcement.

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 54 | `Y05` | `done` | S | 3.6.0 shipped | Cycle ceilings (package + perf budgets) are re-measured and set once with evidence-backed headroom |
| 55 | `Y01` | `done` | M | `X04`, `X02` | A rejected reshape pilot is a recorded decision the doctor respects, not advisory pressure re-fought every session |
| 56 | `Y02` | `done` | M | `P02` | Deterministic hollow-persistence smell: HTTP/route definition living in Persistence-role layers is visible as an advisory |
| 57 | `Y03` | `done` | S | — | Governed files that fail to parse are surfaced honestly (a file the scanner cannot read is never silently "clean") |
| 58 | `Y04` | `done` | S | — | Skill mechanical-edit hygiene rules close the three observed codemod defects |
| 59 | `Y06` | `parked` | S | gate: field case | `pure`-layer opt-in nudge: doctor suggests declaring purity when the golden pattern names pure modules but no layer opts in |
| 60 | `Y07` | `parked` | L | gate: `Y06` corpus | Strict (blocker-grade) ambient mutable-state diagnostics — only after a real `pure: true` field corpus exists (U05 condition unchanged) |
| 61 | `Y08` | `done` | S | gate met: deterministic harness | `node:process` module-import dual of the `process` ambient forbidden global is detected with the same evidence discipline |
| 62 | `Y09` | `parked` | S | gate: field case | Template-interpolation import specifiers are surfaced as an unresolvable-edge advisory instead of silently unresolved |
| 63 | `Y10` | `parked` | L | gate: field demand | Transitive capability inference: a wall sees capabilities reached through local call chains, not only direct uses |

### Phase Z — enforcement truth at speed

Origin: the post-3.7.0 audit reset above. This is stabilization work, not a feature round. It
restores the product invariant from the packed consumer inward, then optimizes only the proven
path and replaces self-referential evidence with causal field proof.

Phase X has no pending work. Y06, Y07, Y09, and Y10 remain parked behind their existing gates:
alias resolution is not Y09's dynamic-template case, direct resolution is not Y10's transitive
inference, and neither supplies the `pure: true` field corpus required by Y06/Y07. The experimental
runtime remains outside the product phase under ADR 0004 and `docs/production-hardening.md`; its
confirmed intra-process commit gaps are retained separately as parked candidate `K01` rather than
silently dropped.

`Z01` starts with a failing destructive-target fixture; do **not** run the unsafe
`check:release-artifacts` path or make budget measurement a prerequisite to its fix. After `Z01` is
done, run release-artifact verification only against a validated tool-owned temporary directory,
measure the clean candidate, and set the Phase Z package/perf ceilings before `Z02`. No later item
may raise those ceilings merely to fit its own implementation.

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 64 | `Z01` | `done` | S | — | Release tooling deletes only validated, tool-owned targets and files |
| 65 | `Z02` | `done` | L | `Z01` | Packed TS5/6/7 analysis is available or explicitly non-green; incomplete analysis never satisfies the goal |
| 66 | `Z03` | `done` | M | `Z02` | The resolved-facts/public-API boundary and generated CLI parity seam are decided before implementation |
| 67 | `Z04` | `done` | L | `Z03` | One normalized candidate-facts graph produces one contract verdict across every supported adapter |
| 68 | `Z05` | `done` | L | `Z02`, `Z04` | Every starter and supported package manager completes the installed tarball journey in a clean consumer |
| 69 | `Z06` | `done` | L | `Z05` | Upgrade touches only identity-proven managed assets and doctor reports actual enforcement state |
| 70 | `Z07` | `done` | L | `Z04`, `Z05` | A measured warm control plane delivers order-of-magnitude hook feedback and bounded canonical reevaluation without semantic drift |
| 71 | `Z08` | `doing` | L | `Z06`, `Z07` | Live-agent and causal evaluation count every outcome and defend the corrected path with mutation proof |
| 72 | `Z09` | `todo` | L | `Z08` | Retained field adoption and a verifiably independent review earn the Phase Z product claims |

#### Corrective-release lanes

- Repository truth corrections do not wait for performance or field evidence. The warning may
  merge immediately; the npm readme remains stale until a corrective package is published.
- With `Z01` and `Z02` closed, a stable corrective patch may publish the safe
  release path, truthful completeness schema, and packed TS compatibility. It must continue to name
  `RB-09`–`RB-11` as open.
- After `Z04`, adapter parity may publish as a patch when the selected seam is internal. If `Z03`
  requires a new stable export/API, use an explicitly approved backward-compatible corrective minor
  (or a canary until its compatibility gate passes), never an unrelated feature minor. After `Z06`,
  the clean installed and managed-upgrade journey can become the stable baseline and `RB-10` closes.
- `Z07` gates only the verified 10x hook-latency claim and its separately named absolute latency
  targets. `Z08` and `Z09` gate causal productivity, retained
  adoption, independent-close, and epic-shipped claims. They do not delay a completed safety or
  correctness patch, but no feature release or broad product claim is allowed while `RB-11` is open.

### Z01 — Make release cleanup tool-owned and path-safe

- **Status:** `done`
- **Depends on:** —

**Outcome:** release-artifact verification refuses repository roots, ancestors, broad caller-owned
directories, and any output without the expected ownership boundary. Package-isolation cleanup
removes only tarballs created by that invocation.

**Acceptance:** failing fixtures cover `--out .`, the repository root, a parent, a non-owned
existing directory, symlink escape, and an unrelated pre-existing `.tgz`. Valid temporary output
still produces the same tarballs, manifests, SBOMs, checksums, and budget verdict. Close `RB-07`
only after the focused tests and release-artifact smoke pass from a clean checkout.

**Measured candidate and Phase Z budgets (2026-07-18):** source commit `6fa5079` / PR synthetic
candidate `b4f25a4` on clean Linux packs `arkgate@3.7.0` to 484,608 bytes / 1,632,090 unpacked
bytes / 135 files. The Phase Z package ceilings are fixed once at 534,000 / 1,796,000 / 149,
retaining 10.19% / 10.04% / 10.37% headroom. CI run `29649631288` performance attempt 1
measured cold@50k 23,315.693 ms, incremental@10k 110.350 ms, hook@10k 591.165 ms, and
doctorCold@10k 5,072.093 ms; its unchanged-head attempt 2 job `88094472142` measured
24,568.744 / 111.538 / 595.053 / 4,799.834 ms. The existing 30,000 / 125 / 900 / 6,800 ms
ceilings retain 22.11% / 12.07% / 51.25% / 34.06% headroom over the worst Phase Z observation,
which exceeds the 5.37% / 1.08% / 0.66% observed attempt variance (doctor improved), so those
ceilings are frozen unchanged before Z02.

**Closure evidence:** the destructive-target and unrelated-tarball fixtures failed before the
fix, then the focused Z01 suite passed 12/12. The default release smoke preserved the unmarked
legacy report byte-for-byte while reproducing both tarballs, manifests, SBOMs, checksums, and
budget verdict under a marked child. Local confidence passed 1,349 tests with 90.77% statements
and 91.44% mutation (93.20% critical aggregate); strict Ark, TS5/6/7, package, generated-parity,
syntax, type, and production-audit gates passed. Two independent read-only reviews found no P0/P1.
PR #80 CI run `29649631288` and Security run `29649631280` completed green on source `6fa5079`;
the same-SHA performance rerun above was also green. `RB-07` is closed.

### Z02 — Make analysis completeness and TS compatibility truthful

- **Status:** `done`
- **Depends on:** `Z01`

**Outcome:** TypeScript host loading has an API-compatible fallback that package-manager deduplication
cannot silently replace with an unusable TS7 export. Public JSON distinguishes complete, partial,
and unavailable analysis; only complete analysis may return a satisfied architecture goal.
Parse-invalid governed files fail closed at `--strict-merge` while doctor may retain its advisory
detail.

**Acceptance:** the compatibility job installs the candidate tarball, not checkout `bin/`, across
the supported Node/package-manager matrix with TS5, TS6, and TS7. It executes plan, full strict
check, hook/MCP smoke, ESM/CJS imports, and types against a known violating fixture. Missing host,
rejected host, and parse-incomplete cases never emit `goal.met: true` or a green strict verdict.
The additive completeness contract is semantically aligned across
`schemas/ark.analysis-result.schema.json`, exported TypeScript types, CLI/MCP JSON, snapshots, and
user docs through contract/drift tests; artifacts generated from the same canonical source remain
byte-identical. Compatibility tests read those surfaces from the tarball, and the dual TS6/TS7
fixture executes the documented commands rather than only inspecting installed packages.
Close `RB-08` only on that packed matrix and schema/type/adapter parity proof.

**Closure evidence:** source `228dd89342644954999af04564f926ffa893c47f` / PR #81 passed
CI run `29655190747` and Security run `29655190745`. CI installed one checksum-verified candidate
tarball across Node 18/20/22/24 × npm 10.8.2/pnpm 9.15.9/Yarn 4.17.1 × project TypeScript
5.9.3/6.0.3/7.0.2: all 12 expanded jobs and all 36 cells passed. Yarn reported strict PnP for
TS5/6 and `node-modules` for native TS7. Build confidence passed 164 test files / 1,373 tests,
90.45% statement coverage, 91.44% mutation, generated parity, package isolation/release artifacts,
and strict architecture; Security passed Dependency Review, CodeQL, and Semgrep. Missing-host and
parse-incomplete fixtures remained non-green, and two independent read-only reviews found no P0/P1.
`RB-08` is closed for current source; published 3.7.0 remains outside the correction.

### Z03 — Decide the resolved-facts and public API boundary

- **Status:** `done`
- **Depends on:** `Z02`

**Outcome:** a decision record selects exactly one parity-capable contract before implementation:
a Tooling-owned resolver/facts port or an additive supplied-facts API. ADR 0002's lexical supplied-
content API may remain only as an explicitly incomplete compatibility mode excluded from parity,
and then a named parity-capable programmatic surface is mandatory. The decision preserves the four-
layer dependency direction unless a new public contract is intentionally approved. It also pins how
the ADR 0003 generated CLI bundle consumes the same versioned facts/verdict seam without importing
Kernel from Tooling.

**Acceptance:** reproduce the alias/workspace/API differential in one minimal fixture; compare the
resolver-port and supplied-facts options plus lexical-compatibility treatment across dependency
direction, sync/async/API compatibility, schema/versioning, generated artifact, and migration
consequences; select the parity-capable surface and record why the rejected shape fails the
invariant. Amend an existing ADR only when its decision remains intact; create a new ADR when the
public input, sync contract, or ownership boundary changes. `Z04` cannot start with this choice open
or with a lexical-only API as the promised parity surface.

**Completed (2026-07-18):** [ADR 0011](docs/adr/0011-resolved-candidate-facts-boundary.md)
selects versioned supplied facts as the only parity-capable input: Tooling resolves one complete
candidate, DomainModel owns the neutral schema, and Kernel synchronously evaluates the validated
facts. The existing supplied-content names remain an explicitly named lexical compatibility mode;
the generated CLI bundle consumes facts rather than owning a resolver. The minimal
`resolved-facts-boundary` workspace independently reproduces both a tsconfig alias and an installed
workspace package: the current lexical API sees no edges while final TypeScript-backed CLI reports
both denied governed edges. The focused API/bundle/fixture suite passed 19 tests; typecheck,
generated-bundle drift, package allowlist, and strict Ark checks passed. No Z04 implementation was
started before the decision closed.

### Z04 — Build one candidate facts → IR → verdict pipeline

- **Status:** `done`
- **Depends on:** `Z03`

**Outcome:** under the selected boundary, the TypeScript/Tooling edge resolves the complete virtual
candidate into serializable facts; the pure Domain/Kernel path evaluates those facts without
filesystem or compiler imports.
Governed scope/layer classification is a shared invariant. Once source and target resolve to
governed layers, `ark.config.json` is the final authority, including same-layer edges; legacy path
heuristics cannot add an undeclared blocker.

**Acceptance:** one differential corpus covers relative paths, `paths`/`baseUrl`, workspace and
project packages, symlinks, creates/updates/deletes, `import = require`, CommonJS, dynamic literal
imports, type-only forms, unresolved evidence, parse failure, exclusions, and unclassified paths.
The parity-capable programmatic surface selected in `Z03`, atomic preflight, CLI, MCP, complete-
patch hook/AICodeGate, ESLint within its documented envelope, and final CI agree on verdict, rule
identity, and evidence. Any retained lexical compatibility API reports incomplete for facts it
cannot resolve and is excluded by name from the parity claim. Y09/Y10 remain outside this item.
Close `RB-09` only when no differential cell disagrees.

**Kill switch:** if implementation imports TypeScript, filesystem, or process state into
Domain/Kernel, violates the `Z03` decision, or makes the generated CLI a second semantic authority,
stop. Return to the decision record rather than hiding the difference in an adapter.

**Completed (2026-07-18):** the versioned `ResolvedCandidateFacts` schema, one Tooling resolver,
and one generated pure evaluator now drive the resolved API, atomic preflight, CLI, MCP, complete-
patch hook/AICodeGate, eligible ESLint, and final strict check. Exact policy, resolver-input, facts,
tree, rule, and evidence identities are compared by the 3-file/19-test differential adapter corpus;
the retained lexical names report partial/non-green outside their documented envelope. The corpus
covers aliases, workspace/project packages, symlinks, relative and CommonJS forms, creates/updates/
deletes, unresolved/parse-invalid evidence, exclusions, and unclassified paths without importing
TypeScript, filesystem, or process state into DomainModel/Kernel. Candidate `174b3c2` passed PR #83
CI/Security runs `29666186597`/`29666186609`, all 12 onboarding shards, all 36 packed
Node/package-manager/TypeScript 5.9.3/6.0.3/7.0.2 cells, package isolation, release-artifact
verification, strict Ark, 1,430 tests, 90.91% statements/lines, 84.56% branches, 93.17%
functions, and 93.84% mutation (94.46% over covered code). The unchanged frozen sensor recorded
50k cold/warm p95 at 18,868.973/14,867.205 ms, 10k incremental p95 at 98.266 ms, and 632,082,432
bytes peak RSS, with exact cold/warm verdict and incremental identity parity; the tarball remained
within ceiling at 518,484 packed bytes, 1,795,618 unpacked bytes, and 138 files. Read-only boundary
and performance reviews found no remaining P0/P1 defect. `RB-09` is closed; Y09/Y10 remain parked.

### Z05 — Prove the installed starter and package journey

- **Status:** `done`
- **Depends on:** `Z02`, `Z04`

**Outcome:** documentation and generated assets describe commands that work outside this mother
repository. Every gallery starter comes from one catalog, is copied to a temporary directory,
installs the candidate tarball, and passes its documented install, check, doctor, start preview,
atomic preflight, strict merge, and package-import path.

**Acceptance:** clean-room tests cover every starter and supported package manager; no package uses
stale registry ranges, repository-relative bins, or an unpublishable `file:../..` path for its
consumer proof. Fixtures run from the packed candidate and verify both success and one deliberate
architecture violation. No unconsented source or unrelated-file rewrite is allowed.

**Completed (2026-07-19):** one frozen catalog owns all six canonical starters. PR
[#84](https://github.com/pedroknigge/arkgate/pull/84) implementation head `3423758` passed CI run
`29667803023` and Security run `29667803007`. The checksum-verified Linux candidate
`abfeb512665928172c62fb3db478165af92d1ae8d141f9945bd9539a1158f069` passed npm 10.8.2,
pnpm 9.15.9, and strict Yarn PnP 4.17.1: 18/18 starter cells and 198/198 fail-closed stages.
Each cell proved the installed package path, check, complete doctor, exact start preview/apply,
benign and deliberately forbidden atomic preflight, strict merge, and whole-journey non-mutation.
The same CI artifact stayed inside the frozen ceiling at 519,476 packed bytes, 1,795,956 unpacked
bytes, and 138 files. Local confidence passed 172 files / 1,442 tests, 90.92% statements/lines,
84.58% branches, and 93.84% mutation; independent review found no remaining P0/P1. `RB-10`
remains open for Z06's managed-upgrade and enforcement-state half.

### Z06 — Make managed upgrade and enforcement state truthful

- **Status:** `done`
- **Depends on:** `Z05`

**Outcome:** upgrade refreshes only Ark-managed assets, preserves user-owned edits, and reports
stale, missing, customized, and conflicted states from content identities rather than version stamps
alone. Doctor separately reports analyzed, configured, installed, active, bypassable, and required
enforcement state from observed evidence.

**Acceptance:** candidate-tarball fixtures cover unmodified managed assets, locally edited managed
assets, deleted assets, old-version assets with identical content, and unrelated similarly named
files across every supported host. Preview/apply is idempotent; conflicts require explicit consent;
no source or user-owned file changes. Doctor's human/JSON/schema/type views agree, and a negative
fixture proves required CI status remains `unverified` without provider evidence—local files or
workflow names never imply branch protection. Close `RB-10` only after the complete `Z05` clean-
room matrix and this managed-content matrix are green.

**Completed (2026-07-19):** source `7fa131f15b948511c40091c7dbc6b6fcfaa2f35f` / PR
[#85](https://github.com/pedroknigge/arkgate/pull/85) passed CI run `29698123366` and
Security run `29698123327`. The checksum-verified Linux candidate
`2ddc876eb97c0d56c81b9e4acdd351025529270b5e9b463fe9449cb76cce5871` passed 11/11
supported hosts and 132/132 managed-upgrade stages, all 12 packed Node/package-manager/TypeScript
jobs, and all three gallery clean-room jobs. It remained inside the frozen package ceiling at
510,941 packed bytes, 1,785,171 unpacked bytes, and 143 files. CI confidence passed 176 test files
/ 1,500 tests, 90.44% statements/lines, 84.55% branches, 92.57% functions, and 93.20% mutation
(93.89% over covered code); host-capabilities scored 91.78% and the critical aggregate 92.51%.
Preview/apply binding, explicit conflict consent, idempotence, source/user-file non-mutation, and
provider-evidence fail-closed behavior are covered by focused adversarial tests. Independent
read-only review found no remaining P0/P1. `RB-10` is closed.

### Z07 — Deliver a warm incremental control plane

- **Status:** `done`
- **Depends on:** `Z04`, `Z05`

**Outcome:** the proven facts pipeline can reuse a project snapshot keyed by policy, compiler, and
content identities. A resident MCP/worker transport is a pilot, not a dependency; the current
one-shot path remains the compatibility and recovery fallback. Pure command tests run in parallel,
with only a small installed CLI suite retaining serial subprocess coverage.

**Acceptance targets (adjusted after bounded trials):** hook p95 <=65 ms at 10k files, resident
doctor p95 <=500 ms, canonical resolved-facts analysis p95 <=100 ms at 10k files, PR-relevant
feedback <10 s, and full non-mutation suite <30 s on the recorded runner. Candidate resolution and
the validated oracle are outside only the separately named canonical-analysis timer. JSON, hash,
verdict, cold/warm, edit/delete, and invalidation parity are exact.

Only the end-to-end hook target earns the order-of-magnitude claim against its recorded Phase Y
683.761 ms baseline. The canonical analysis-only metric is not compared with Phase Y's lexical
106.93 ms endpoint, and the 500 ms resident-doctor target remains an absolute UX ceiling. Claim a
doctor ratio only from the like-for-like one-shot-warm baseline. Do not ship a resident path unless
the absolute targets hold with zero stale-snapshot or differential-verdict failures. Revert to
one-shot rather than relax correctness or budgets.

**Pre-implementation baseline (2026-07-19):** source `778a33a` / PR synthetic candidate
`9cfcb3a` on CI run `29699589991` (Linux x64, Node 20.20.2) measured hook@10k p95
209.036 ms, doctor cold@10k p95 2,160.473 ms, and like-for-like one-shot-warm doctor@10k p95
2,174.517 ms after one discarded prime. Cold and warm used identical fresh-process argv, tree,
and cache-free state; all JSON output hashes matched exactly and the fixture identity remained
`sha256:94b509a47de8a035f51c842c10047d680a12a22c5a49540b57b50149de92b8ad`
before and after. `residentWarm` remained explicitly unavailable. The companion canonical-control
artifact recorded cold@10k 3,578.121 ms, one-shot-warm@10k 2,846.590 ms, and the retained lexical
incremental control at 78.527 ms; none is relabeled as the future resident/canonical metric.

**Authorized metric adjustment (2026-07-19):** four local designs preserved exact canonical output:
full resolve+analyze was about 1,100 ms; the public snapshot route measured about 53.7 ms to create,
77.7 ms to analyze, and 287.6 ms through preflight; trusted validated facts plus update/hash/analyze
measured about 41.9 ms; and serialized hashing alone reached 6.31 ms while the unchanged canonical
evaluator still required about 20 ms. Therefore the original <=10 ms incremental target could only
be met by changing the endpoint or caching a verdict. Under the explicit instruction to adjust an
unreachable metric after repeated attempts, it is retained as a future end-to-end resolver stretch,
not a Z07 gate. The analysis-only endpoint is honest about excluded resolution; the 20-worker local
recording measured 20.851 ms p95 with byte/verdict/facts/tree parity. Three comparable Linux Node 20
distributions then measured 84.023, 81.066, and 84.568 ms p95. The earlier <=50 ms proposal could
not be reached on that runner without changing the endpoint or caching a verdict, so the authorized
final ceiling is <=100 ms, retaining 18.25% headroom over the final/worst comparable distribution.

**Completed (2026-07-19):** source `d5cbe618973b1af30acb3d917da52ac337d29bfb` / PR
[#86](https://github.com/pedroknigge/arkgate/pull/86) passed CI run `29704311754` and
Security run `29704311730`. Its Linux x64 Node 20 synthetic candidate
`381e51b1c5a4c6d37be51aaca083b48e8e6fe62e` measured hook resident@10k p95
58.177 ms (11.75x below the retained 683.761 ms Phase Y baseline), resident doctor@10k p95
468.669 ms, and canonical analysis-only@10k p95 84.568 ms across 20 fresh workers. PR feedback
finished in 7.387 s and the full non-mutation corpus in 24.295 s. Every byte/verdict/facts/tree,
cold/warm, edit/delete, invalidation, and fixture-identity assertion passed; no verdict was cached
and one-shot remained the fallback. The performance, hook, PR-feedback, and full-feedback artifact
SHA-256 values are respectively `899987203df4b3c012ec9d7c48dd7268b49366904d619def088aaca2380815ca`,
`807586dbd47a3360aa2ffdcb59d9030a1336ac6e6274cd27667d1f3a8335da9f`,
`62b5ccdf45d8449fea90402bfea85411a4b0f3d07e940cf5d3ae32437891c8cc`, and
`4a3c0866e1f5ac15c52bacebbb8e8fb645407b90511817fb36907fe9ec2d90e3`.

The release candidate remained under the frozen package budget at 509,089 packed bytes,
1,777,406 unpacked bytes, and 143 files; its gate tarball SHA-256 is
`57b746fa7b37dcd14313ffc8d1934fe97106c8b9497bb4be99dea7322f3b367b`. Confidence passed
180/180 test files and 1,512/1,512 tests with 90.59% statements/lines, 84.51% branches, and
92.68% functions. Mutation remained 93.20% overall / 93.89% covered and the named critical
aggregate remained 92.51%. Independent read-only review found no P0/P1 in the final memory or
launcher changes and reproduced packaged modes, fallback bytes, and watch behavior.

### Z08 — Repair live-agent, causal, and mutation evidence

- **Status:** `doing`
- **Depends on:** `Z06`, `Z07`

**Outcome:** the live-agent workflow executes a non-skipped case when enabled; adoption time runs
through strict Ark, typecheck, and tests; all cells remain in denominators; false blocks, bypasses,
manual decisions, and final CI state are measured rather than initialized.

**Acceptance:** before execution, commit an immutable experiment manifest that pins the candidate
source SHA and tarball SHA-256, repository SHAs/lockfiles, Node/package-manager/TypeScript/OS
toolchain, agent/model/config, task prompts, grader version, caps, exclusions, and session UUIDs.
Treatment and control use the same manifest and differ only by the preregistered ArkGate
intervention. Include at least 24 held-out task pairs across at least six repositories and three
preregistered independent agent sessions per arm; the selected Grok CLI exposes no model seed, so
"seed" is reserved for deterministic experiment order and bootstrap resampling, never fabricated.
The primary estimand is restricted mean time to the first candidate that passes the common
architecture grader, typecheck, and tests. ArkGate/control must be <=0.80 with the upper bound of a
paired 95% bootstrap confidence interval below 1.0; merge-gate completion may not regress by more
than five percentage points.
Reports also publish turns/tokens, escapes, false blocks, and bypasses. Unsuccessful cells are right-
censored at the preregistered cap and remain in the primary and percentile summaries; when fewer
than half succeed, median first-valid is “not reached,” never success-only. Mutation ranges covering
the corrected completeness, resolution, managed-upgrade, and snapshot invalidation paths contain
zero `NoCoverage` survivors. If the primary hypothesis loses, publish the null/negative result and
remove or reframe the causal-productivity claim before `Z09`; never switch endpoints post hoc.

### Z09 — Prove retained field adoption and independent close

- **Status:** `todo`
- **Depends on:** `Z08`

**Outcome:** reproducible external and longitudinal evidence replaces self-declared release proof.
Reviewer and exact-candidate identity are verified from signed repository/review evidence rather
than an `independent: true` field.

**Acceptance:** the preregistered balanced external matrix covers at least 12 pinned repositories,
four hosts, and three package managers; >=5/6 (83.33%) of its entire cell denominator reaches
protected green without weakening the contract, and every Adapt is explained. The preregistered
cohort has at least eight consented adopter projects; >=3/4 of the full cohort retain required Ark
enforcement at D30 and >=5/8 at D90, with missing follow-up counted not retained. A reviewer who did
not implement `Z08`/`Z09` reproduces the initial packed candidate and signs an immutable longitudinal
manifest containing, per project, initial digest, repository SHA, required-status evidence, every
upgrade digest/date, and final state. An upgrade does not reset the clock; retention counts only the
initial candidate or a recorded forward corrective descendant that passed the same relevant gates.
Missing follow-up, disabled enforcement, downgrade, or unrecorded upgrade counts not retained. Close
`RB-11`, mark the epic shipped, and authorize only the 10x, causal-productivity, retained-adoption,
and independent-close claims whose preregistered thresholds passed; ordinary completed corrective
patches did not wait for this milestone.

### Retained runtime correctness candidate (outside Phase Z)

| ID | Status | Size | Promotion gate | Outcome |
|---|---|---:|---|---|
| `K01` | `parked` | L | explicit runtime-hardening cycle authorized under ADR 0004 | Intra-process runtime commit/rollback and hook-failure semantics are atomic and fault-tested |

`K01` retains three confirmed gaps: dependency-graph mutation can precede a rejecting hard policy;
recording history can append before a fallible buffer enqueue; subscriber-handler errors throw only
when `rethrowHandlerErrors` is enabled, while projections are installed as `onPublish` and their
errors are always reduced to `hook.error`. It is not Phase Z work, a gate-package release blocker,
or authorization to expand the experimental runtime. If promoted, begin with failing rollback,
append/enqueue, handler, and projection/hook-policy fault tests and update
`docs/production-hardening.md` with the chosen commit semantics.

### 3.6.0 field validation (field-adopter worktree, 2026-07-17)

Agent session over the field-adopter worktree (2,997 governed files, 12 layers, ENFORCE 100%,
keep-empty baseline) upgraded `arkgate@3.5.0 → 3.6.0` and ran the full skill chain over real
Shape work (parse-corpse repair, two un-hollow pilots, ack hygiene, explain + report). Transcript
retained by the adopter; independently re-verified same day (strict gate green, tsc count
reproduced, report inspected, live login flow of the product exercised).

**Confirmed as designed:**

- **X05 on the real sidecar** — `ackLifecycle.stale` listed exactly the three acks orphaned by
  X03/X06 (`*->PersistenceInfrastructure` family edges); `/ark-contract` deleted them and dated
  the remaining 26; doctor lifecycle clean after.
- **X04 restraint held under pressure** — the reshape pilot (`projects @ src/lib/repositories`,
  124 files) was proposed-only every time; nothing auto-applied; skills correctly rejected it
  as fighting the adopter's golden role-layer layout (origin of `Y01`).
- **X01/X07 at scale** — 82 KB report renders every advisory section (contract health with dated
  acks, governance weight `typical`, ambient state `Idle`, physical cohesion with the proposed
  pilot and per-anchor mirror counts); score 96, ENFORCE, 100% governed.
- **Upgrade path** — pnpm cooling-off handled, skills refreshed across four hosts, MCP single-bin
  verified, no breaking CLI or config changes; migrate-on-touch policy respected end to end
  ("fix all residual" did not become a bulk codemod).

**Findings registered as candidates (Y01–Y05 above):**

- **Y01 origin:** the adopter rejected the same reshape pilot **three times in one session**
  (explore, autopilot, fix-all) because the mirrored anchors (`src/app/api` ↔
  `src/lib/api-handlers` ↔ `src/lib/repositories`) ARE its golden `thin-shell-handlers-data`
  layout — and nothing records that decision, so every future session re-fights the advisory.
- **Y02 origin:** ~206 Persistence modules import `next/server` / hold `NextResponse` bodies
  left by a pre-3.6 bulk extract; gate green, design fitness clean — the smell is invisible to
  the doctor, and the adopter compensates with a hand-rolled vitest (`ark-shape-residual`).
- **Y03 origin:** the same bulk extract left 189 trailing-comma parse corpses across 147
  **governed** files; ArkGate reported 100% governed / 0 violations the whole time. The scanner
  builds each `ts.createSourceFile` and never inspects `parseDiagnostics` — the honesty signal
  already exists at zero additional parse cost.
- **Y04 origin:** three mechanical-edit defects in skill-driven fixes: stacked doc-comment
  headers (`/** … */` injected above an existing `/** … */` producing nested comment text),
  completing a missing route export by splitting `defineRoute<…>(opts, handler)` into untyped
  `*_ROUTE_OPTS` / `*_ROUTE_HANDLER` consts (dropped generics → new implicit-any errors in
  previously clean files), and empty placeholder `*-data.ts` stubs (`import "server-only";
  export {}`) created only to satisfy naming conventions.
- **Y05 origin:** package budget closed the cycle at **98.9% packed**; separately, a docs-only
  PR failed the `doctorCold@10000` perf ceiling by 1.07% (p95 5154.5 ms vs 5100 ms) on an
  unchanged engine — observed runner variance exceeds the recorded +25% headroom.

### Y05 — Cycle budget recalibration (package + perf ceilings)

- **Status:** `done`
- **Depends on:** 3.6.0 shipped

**Outcome:** per the standing guardrails (package-budget rules below; ADR 0009 D5 for perf), the
new cycle's ceilings are measured from clean candidates and set **once**: packed/unpacked/file-count
with ≥ 10% headroom, and hook/doctorCold p95 ceilings whose headroom covers the runner variance
actually observed this cycle (a docs-only diff must not be able to fail a perf budget). Never
ratcheted per item; any later exception needs explicit evidence.

**Verification:** `npm pack --json --dry-run`, `npm run check:package-files`,
`npm run check:release-artifacts` agree on the candidate; two consecutive green
`Performance budgets` CI runs on an unchanged engine commit.

**Measured candidate (2026-07-17):** clean Linux `arkgate@3.6.1` at `4d0d526` packs to 467,437
bytes / 1,572,950 unpacked bytes / 133 files. Phase Y ceilings are fixed once at 515,000 /
1,731,000 / 147 (at least 10% headroom in every dimension). Linux CI run `29593179029`
attempt 1 measured hook@10k 629.687 ms and doctorCold@10k 5,154.522 ms on a docs-only,
unchanged-engine candidate; its unchanged-head retry measured 683.761 / 4,714.687 ms and run
`29608857827` measured 619.852 / 4,781.35 ms. The worst p95 per scenario becomes the Phase Y
baseline; fixed +30% runner headroom rounds up to 900 / 6,800 ms.

**Closure evidence:** local dry-run/package allowlist/release-artifact checks and 31 focused
tests passed before commit `2c064cd`. PR #78 CI run `29611290231` completed green on that SHA;
its `Performance budgets` job passed twice consecutively without an engine change: attempt 1
job `87986335243` and attempt 2 job `87988275984`. The first attempt also passed the full CI,
security, confidence/mutation, package-isolation, artifact, and strict architecture jobs.

### Y01 — Reshape decisions are recorded (physical-cohesion verdict memory)

- **Status:** `done`
- **Depends on:** `X04`, `X02`

**Outcome:** a proposed reshape pilot can be **accepted, deferred, or rejected with a reason**,
and the record has teeth: a rejected target stops being re-proposed (the sensor still reports the
mirror facts; only the pilot pressure stops), an accepted one converges as today, and records
reuse the X02 lifecycle (optional `reviewBy`, stale detection when the anchor set changes —
X05 semantics). The doctor and report render the decision instead of the dead proposal.
Candidate default worth evaluating during design: when the mirrored anchors match the declared
golden pattern's role directories, the pilot is proposed at most once — a golden-consistent
mirror is a layout, not a smell.

**Non-negotiables:** decisions are explicit adopter records (sidecar), never inferred silently;
the underlying cohesion facts keep rendering; cross-anchor evidence never changes the verdict.

**Implemented shape:** bounded `.ark/reshape-decisions.json` records bind a required reason and
`accepted|deferred|rejected` verdict to the concept + complete sorted anchor set, with optional
X02-style `reviewBy`. File-count/evidence drift keeps the decision current; anchor membership
drift makes it stale. Accepted targets keep the X04 change-map/preflight path; current
rejected/deferred targets suppress only the card and advance the one-at-a-time selector to the
next undecided finding. Broken/duplicate/oversized, expired, malformed, and stale records suppress
nothing. Doctor JSON/human output and the HTML report render the memory while the original
`physicalCohesion.findings` remain byte-stable.

**Golden candidate decision:** not inferred in Y01. Q03's `norm` and `newCodeHome` are free-form
guidance, not structured role directories; parsing them to suppress a pilot would violate the
explicit-record non-negotiable. Teams record the rejection explicitly and may cite the golden
layout in `reason`.

**Local evidence (2026-07-17):** `bin/lib/reshape-decisions.mjs` is 285/300 LOC; 60 focused tests
passed across Y01, X04, X02, X05, and report parity (including count drift, anchor stale,
next-finding selection, malformed/bounds/duplicates, golden non-inference, human/JSON/HTML
surfaces). Typecheck, JS syntax, module budgets, `git diff --check`, and strict architecture all
passed.

### Y02 — Hollow-persistence smell (HTTP in Persistence-role layers)

- **Status:** `done`
- **Depends on:** `P02`

**Outcome:** design fitness gains a deterministic smell for Persistence/adapter-role layers whose
modules import framework HTTP surfaces (e.g. `next/server`) or hold route-definition calls —
the "hollow extract" shape where the gate is green because only imports moved. Advisory only
(design-fitness voice, never the verdict), calibrated on the field corpus (206 known-hollow
modules vs the golden pure-data pilots) and the OSS harness for false-positive pressure.
Role detection follows the existing name-heuristic discipline: a miss costs a warning line.

**Non-negotiables:** no style scoring, no codemod, no new gate input; the smell names the
outcome in human language (Q02 parity) and routes to the existing extraction-card pilot loop.

**Implemented shape:** the stable `handler-in-persistence` smell now recognizes static ES imports
and re-exports of framework HTTP surfaces (`next/server`), `defineRoute` calls, and existing
handler bodies in Persistence-role layers or specific persistence paths (`repositories`,
`infra/db`, `infra/data`, `adapters/persistence`). A generic `Infrastructure` role is not treated
as Persistence. Candidate paths are normalized, deduplicated, sorted, and filtered by role/path
before the bounded 800-file
content scan, so a large Application prefix cannot hide the field-calibrated residual. The smell
remains advisory, outcome-first, and judgment-only; its existing pattern bet and one-pilot
extraction card are reused without a new id, config input, verdict edge, or codemod. The detector
does not claim whole-tree cleanliness beyond that envelope: candidates after the first 800 sorted
Persistence paths are explicitly uninspected. CommonJS `require()` and dynamic `import()` are not
claimed by this narrow advisory.

**Local evidence (2026-07-17):** 65 focused tests passed across Y02, P02, Q02, Q04,
design-weak honesty, extraction cards, and shipped skill surfaces. The fixed corpus covers 805
unrelated files before 206 hollow modules, the bounded 800-candidate overflow, stable evidence
under reversed input, each HTTP/route signal, pure-data negatives, generic-Infrastructure
restraint, and the explicit 800-clean/post-cap-uninspected envelope. Typecheck, JavaScript syntax,
module budgets, package-file allowlist, `git diff --check`, and strict architecture all passed.

### Y03 — Parse honesty for governed files

- **Status:** `done`
- **Depends on:** —

**Outcome:** `scanSourceFile` reads the `parseDiagnostics` the AST already carries; governed
files that fail to parse surface as a doctor advisory (`parseHealth`: count + capped file list,
report section under the X01 parity rule). The verdict is untouched this round — but the
"100% governed, 0 violations" line can no longer be silently true over files the scanner could
not honestly read. Escalation to verdict-relevant is a separate future decision requiring its
own evidence.

**Non-negotiables:** zero additional parse cost (no second pass, no tsc dependency); advisory
caps and overflow markers follow X07.

**Implemented shape:** `scanSourceFile` reads only `sourceFile.parseDiagnostics.length` from the
AST it already created and stores `parseDiagnosticCount` in scan-cache schema v9, keyed by the
TypeScript parser version as well as policy inputs. The Tooling
aggregator emits exact scanned, affected-file, and diagnostic totals plus a deterministic top-12
`{ file, diagnosticCount }` list with `truncated`/`overflow`; no raw TypeScript diagnostic enters
the cache or doctor surface. The same `parseHealth` object flows through architecture scan to
doctor JSON/human output and the X01 HTML section. It remains advisory: the normal verdict,
`ok`, violations, design fitness, and pattern bets are unchanged.

**Local evidence (2026-07-17):** focused tests cover valid and two-diagnostic invalid governed
files, one existing AST per cold-scanned file, deterministic 15-file overflow, v8/parser-identity
invalidation, unsafe-count/sum degradation to unavailable, v9 cold/warm parity with zero warm
reparses, doctor JSON/human, HTML report parity, and an unchanged green normal verdict.
Typecheck, JavaScript syntax, module budgets, package-file
allowlist, generated parity checks, `git diff --check`, and strict architecture passed.

### Y04 — Skill mechanical-edit hygiene

- **Status:** `done`
- **Depends on:** —

**Outcome:** the skill templates that drive mechanical edits (`ark-fix`, `ark-autopilot`,
`ark-loop`) encode three explicit rules from the field defects: (1) header injection merges into
an existing doc comment, never stacks a second `/**` above it; (2) completing or moving a
`defineRoute`-style export reconstructs the original **typed** call — never a split into untyped
opts/handler constants that drops generics; (3) never create empty placeholder modules to satisfy
naming conventions — either move the real code or leave the file uncreated. Guarded by an eval
fixture reproducing the three shapes.

**Non-negotiables:** skills-and-eval change only; no engine surface grows; the rules are stated
as outcomes ("previously clean file stays typecheck-clean after the edit"), not as prose advice.

**Implemented shape:** `ark-fix`, `ark-autopilot`, and `ark-loop` carry the same outcome gate:
merge an injected header into the existing doc comment, reconstruct the original typed
`defineRoute<…>(opts, handler)` call without untyped split constants, and leave convention-only
placeholder modules uncreated. Every kept mechanical edit must leave a previously clean file
typecheck-clean.

**Local evidence (2026-07-17):** the deterministic `eval:mechanical-edit-hygiene` fixture
reproduces all three rejected shapes and their accepted outcomes. Its runner verifies one merged
doc block with both contracts retained, a real `noImplicitAny` regression for the split route and
zero diagnostics for the reconstructed typed call, no created placeholder file, and exact
outcome coverage in all three skills. Focused test, typecheck, JavaScript syntax, package-file
allowlist, module budgets, generated parity, `git diff --check`, and strict architecture passed.

### Y06–Y10 — retained candidates (promotion gates on record)

Y06, Y07, Y09, and Y10 predate this cycle and stay `parked`: a parked item never starts; it
promotes to `todo` only when its named gate is met, with the field evidence recorded here first.
Y08 met that discipline below and is the only promoted retained candidate.

**Y06 — `pure`-layer opt-in nudge.** The strict ambient-state candidate still has NO field
corpus: the flagship adopter finished full adoption with zero `pure: true` layers even though its
golden pattern names pure Domain modules (`evm-calc`, `vacation-entitlement`). Outcome: when the
golden pattern (Q03) references pure modules and no layer declares purity, the doctor emits a
one-line opt-in nudge (advisory, U05 voice). Gate: one more field session confirming the nudge
would have been actionable rather than noise.

**Y07 — strict ambient-state diagnostics.** U05's condition is unchanged: strictness requires
blocker-grade precision proven on a real opted-in corpus. `Y06` exists to create that corpus;
this item stays parked until the corpus exists and the U05 precision bar is met on it.

**Y08 — `node:process` dual.** `forbiddenGlobals: ["process"]` sees the ambient global; the
`import process from "node:process"` spelling previously bypassed it. Outcome: the module-import dual is
reported with the same evidence discipline (same rule id, import-form evidence). Gate: a field or
harness case where the dual actually bypassed a purity wall — promote on first confirmed escape.

**Y08 promotion evidence (2026-07-17, deterministic harness):** a governed `DomainModel` fixture
with `forbiddenGlobals: ["process"]` and `import process from "node:process"` exited 0 from the
real CLI with `{ ok: true, violations: [] }`. The generated analysis engine retained direct
`{ capability: "process", symbol: "node:process" }` import evidence but emitted no violation;
atomic preflight remained valid, AICodeGate remained valid, and `ark/no-forbidden-globals`
reported nothing. A warm pre-Y08 scan cache already retained the exact non-type-only import edge,
so the fix can derive from existing deterministic evidence without a second scan or cache-schema
bump. This is a confirmed cross-adapter purity escape: gate met, `parked` → `todo` before work.

**Y08 local evidence (2026-07-17):** one exact Domain matcher now maps only `process` and
`node:process` to forbidden global `process`; subpaths and both `child_process` spellings remain
negative controls. The CLI derives the verdict downstream from each cached `entry.edges` fact,
filters a pre-Y08 overlapping capability finding by file + specifier (never line), and leaves the
cache tag and scan count unchanged. Value imports emit one `FORBIDDEN_GLOBAL` across CLI cold and
warm cache, pure IR, atomic preflight, AICodeGate/MCP hook, and both ESLint rules; type-only forms
written as statement-level `import type` stay green on every path (the pure IR's documented
all-named limitation is unchanged). Coverage lowering records the narrow dual as `import-exact:*` atoms while a process
wall retains its broader `import:process` atom. Focused cross-adapter tests, build/typecheck,
JavaScript syntax, generated parity, module budgets, package-file allowlist, strict architecture,
and `git diff --check` passed.

**Y09 — template-interpolation import specifiers.** Dynamic `import(`./adapters/${name}`)`-style
specifiers resolve to nothing and today vanish silently from the edge graph. Outcome: an
unresolvable-edge advisory (count + capped list, X07 overflow discipline) so governed trees know
where the graph is blind — never a verdict change. Gate: a field case where the blind spot hid a
real boundary crossing.

**Y10 — transitive capability inference.** U03/U04 capability evidence is per-file direct use: a
wall blocks `fetch` in the file, not `fetch` reached through a same-layer helper the file calls.
Outcome: opt-in inference through local (same-package) call chains with the soundness envelope
named explicitly, mirroring the C04 discipline. Gate: field demand — a governed adopter showing a
real wall escape through an intra-layer helper; parked until then because the cost (analysis
depth, budgets, explainability of evidence chains) is the largest in this queue.

### 3.5.0 field validation (field-adopter worktree, 2026-07-16)

Agent session over the field-adopter worktree (2,996 governed files, 12 layers, ENFORCE 100%, 29 real
acks) installed `arkgate@3.5.0` and exercised every Phase X surface. Nothing pushed or merged;
sidecar restored byte-identical (sha `0945fa87…`).

**Confirmed as designed:**

- **X02 on the real 29 acks** — all 29 are undated migration debt ("strangler", "dual-source",
  "migrate-on-touch"): the exact fossilization profile. Experiment: future `reviewBy` still
  applies; past date stops applying with `(ack expired 2026-01-01)` evidence; malformed (`soon`)
  fails loud. `ackLifecycle` counts exact (`undated: 25` = 28−3); fossilization line renders in
  doctor and report even with zero visible smells.
- **X01 at scale** — 82 KB report, nothing truncated; all three `data-advisory` sections present
  exactly once; governance weight `typical — 249.7 files/layer` as expected; ambient state
  honestly `Idle`. Badges untestable there (no `pure`/`capabilities` declared).
- **Perf** — doctor cold 2.84s on 3.5.0 vs 3.10s on 3.4.0 (Mac, record-only); warm 1.76s. No
  regression signal.

**Findings registered as candidates (X05–X07 above, plus X04/ambient evidence):**

- **X05 origin:** the edge X03 quieted (`PersistenceAdapters -> PersistenceInfrastructure`)
  orphaned its ack silently — file has 29, doctor applies 28, and nothing says "1 ack matches no
  detected edge; delete it".
- **X06 origin:** the field adopter names domain-scoped adapters with the domain as leading token and the
  family mid-name: `HoursPersistenceAdapters` / `MoneyPersistenceAdapters` over
  `PersistenceInfrastructure`. The leading-token rule sees `Hours ≠ Persistence` and still fires
  on 2 of the 3 member→base edges while the unprefixed one went quiet — inconsistent to the
  adopter, whose own ack reasons frame these as family infra. Counterpoint recorded: they ARE
  cross-domain in the leading token, so the miss is arguable, and the fix must not weaken the
  cross-family default.
- **X07 origin:** the report's per-finding evidence list caps at 6 `<code>` items with no
  overflow marker — a 12-edge lateral smell silently shows half its evidence (the count survives
  only in the message paragraph).
- **X04 corpus, live:** 211 `route.ts` under `src/app/api/projects/**` mirrored by 167
  `projects*` handlers in `src/lib/api-handlers/` — and no advisory says anything (governance
  weight `typical`, design fitness clean). physicalCohesion has its calibration target.
- **Ambient-state candidate evidence:** the flagship adopter has zero `pure: true` layers after
  full adoption — the strict-mode candidate still has NO field corpus; consider a doctor nudge to
  opt in when the golden pattern names pure modules but no layer declares purity.

### X05–X07 — field warm-ups (stale acks, mid-name families, evidence overflow)

- **Status:** `done` (all three)
- **Depends on:** `X02` / `X03` / `X01` respectively

**X05 outcome:** `analyzeContractSmells` collects detected canonical edges BEFORE ack filtering;
any ack entry matching none (orphaned by a fixed contract or quieted heuristic, unknown id,
typo'd edge) lands in `ackLifecycle.stale` (`staleCount` + list capped at 12). Doctor prints a
dim line with the exact edges ("fix the edge string or delete the entry"), the report renders it
with its own overflow marker, and both surface even at zero visible smells. An invalid sidecar
reports zero stale — a broken file is never inspected.

**X06 outcome:** `isFamilyInfrastructureEdge` matches the target's family token against ANY
source token (case-insensitive, length ≥ 2), not only the leading one — the target must still be
a pure `<Family><InfraWords…>` base (every remaining token an infra word), so non-base siblings,
cross-family edges, and base → member keep firing. Hardening from self-review: a generic role
word (`adapter(s)`/`gateway(s)`) never counts as a family token — otherwise `AdaptersCore` would
read as every `*Adapters` layer's base and silently quiet genuine cross-family edges
(`Persistence` stays a valid family).

**X07 outcome:** the report's per-finding evidence list announces its 6-item cap with
`…(+N more in doctor JSON)`; at or under the cap no marker appears.

**Live validation (field-adopter worktree, 2026-07-17, local build):** doctor over the real tree now
reports `acknowledged: 26`, `staleCount: 3` listing exactly the three orphaned
`*->PersistenceInfrastructure` acks (the X03-quieted edge plus the two X06 mid-name edges
`HoursPersistenceAdapters` / `MoneyPersistenceAdapters`), with the human line naming them —
the adopter now gets told precisely what to delete. Zero visible smells, verdict untouched.

**Local evidence (2026-07-17):** `x05StaleAcks.test.ts` (7/7), X06 describe block in
`x03FamilyInfra.test.ts` with the field adopter's verbatim layer names (13/13 total), X07 case in
`reportParity.test.ts`; `x02AckLifecycle.test.ts` updated for the extended `ackLifecycle` shape.
Cross-model review: 2 findings fixed (stale output now sorted stable under sidecar reordering;
the report's stale note says plain `(+N more)` instead of over-promising "in doctor JSON" past
the JSON cap, and the expired note gained the same honest marker) and 1 rejected as the intended
X06 shape (`PaymentsPersistenceAdapters -> PersistenceInfrastructure` is family membership by
design — pinned as a documented-trade-off test).

### X04 — Reshape co-pilot (physicalCohesion + proposed pilot + skill deepening)

- **Status:** `done` (R1–R3; Phase Y superseded the proposed real-adopter pilot after the flagship
  mirror proved golden-consistent; the complete-graph synthetic pilot remains execution proof)
- **Depends on:** `X02`, plan doc + ADR — both met:
  [plan](docs/plans/reshape-copilot/README.md), [ADR 0010](docs/adr/0010-reshape-copilot-boundary.md)
  (**Accepted**, thresholds calibrated on the live corpus before any code)

**Outcome:** the doctor sees physical shape. `doctor.physicalCohesion` reports concept clusters
per anchor directory — concentration, not volume (dispersed `use-*` hooks never fire) — with
fixed corpus-calibrated thresholds (`maxCluster ≥ 40` OR ≥2 anchors ≥ 20), honest capping, and
`fixedByConvention` marking for `app/`/`pages/` anchors. `reshapePilot.nextPilot` is a
**proposed, never applied** Q04-style card (one at a time; smallest convention-free anchor;
`moveSample`/`movesTotal`; kill switch; `doNot[]` hard lines). `/ark-loop` gained the
pilot-execution loop (change map + atomic preflight before any move); `/ark-architect` gained
merge cards (merges are domain modeling — zero structural clones in the field corpus);
`/ark-fix` gained the no-reshape-in-fix-batch rule. `notAScore`; verdict, `designFitness`, and
`patternBets` pinned untouched. The report section existed from the first commit because the
X01 parity guard fails CI without it — the standing rule enforcing itself on its first new
consumer.

**Live validation (field-adopter worktree, 2026-07-17, local build):** the sensor reproduced the ADR
calibration table exactly — 4 mirrored concepts (`projects` 561 files across
`src/app/api` 221*conv · `api-handlers` 146 · `repositories` 124 · `(dashboard)` 61*conv;
`timesheet` 203; `people` 129; `process` 98) and the pilot targeted the smallest movable anchor
(`src/lib/repositories`, 124 moves) with real from/to paths into `src/features/projects/`.

**Local evidence (2026-07-17):** `bin/lib/physical-cohesion.mjs` (231/260 budget),
`x04PhysicalCohesion.test.ts` (15/15 — ADR fixture obligations: field-corpus-shape positive,
healthy-tree + self-hosting negatives, determinism under shuffle, honest truncation,
convention-only pilot refusal, below-display-floor pilot, scaffold-segment regression,
loop-convergence regression, pinned advisory invariants); parity guard extended automatically;
`doctor-plan.mjs` held at exactly 920/920.

**Multi-repo harness (pre-merge, owner-requested):** fresh shallow clones of five known repos
(five well-known open-source repositories of different shapes) against the local build — zero crashes,
4/4 parity sections in every report, doctor 204–621ms, zero false positives after the harness
caught and fixed the scaffold-segment defect (nest: garbage `packages` concept over 91
`index.ts` files with a nonsense pilot).

**End-to-end pilot loop (executed, synthetic fixture with a real import graph):** pilot 1
(12 repository files → `src/features/projects/`, imports updated) kept the gate green and
advanced the doctor; the NAIVE pilot 2 was **blocked by the gate** (45 route violations, correct
`/ark-contract` remediation — the preflight protecting exactly as designed) and the kill switch
(`git reset --hard`) restored a green tree; the judgment pilot 2 (contract patterns via
`/ark-contract` + handlers into the feature subdir) passed the gate; re-doctor then reported
**convergence**: "every remaining anchor is fixed by framework convention or already
consolidated". Two loop defects found and fixed in the process: the consolidation target (and
its subtree) must never be re-proposed as a source.

### X01 — Report parity with doctor advisories

- **Status:** `done`
- **Depends on:** 3.4.0 shipped

**Outcome:** The HTML report renders the same advisory truth the doctor emits — contract health
(W01) with acknowledgments honesty and governance weight (W02), ambient state (U05), and
capability-wall badges (`pure` / `walls: …`) in the layers table (U04).

**The standing rule (owner directive, 2026-07-16):** the report is a RENDERING of doctor truth
and must evolve with what the product can deliver. That rule is EXECUTABLE, not prose:
`reportParity.test.ts` enumerates the advisory keys `computeDoctorAdvisories` actually returns
and fails when any of them lacks a `data-advisory` section in the rendered report — adding a
doctor advisory without its report section breaks CI by construction.

**Local evidence (2026-07-16):** `bin/lib/html-report-advisories.mjs` (budgeted, 200 LOC cap)
renders the sections; `renderHtmlReport` gains the optional `advisories` payload wired from the
CLI report path via `computeDoctorAdvisories`; the parity guard passes 4/4 including the full
CLI `--report` end-to-end case and the wall badges. Field origin: the field-adopter report on 3.4.0
showed none of the three releases' surfaces.

### X02 — Acknowledgment lifecycle (review-by)

- **Status:** `done`
- **Depends on:** `X01`

**Outcome:** a contract-smell ack may carry an optional `reviewBy` (`YYYY-MM-DD`, strict
round-trip validation). Past that date the ack **stops applying** and the smell returns with
`(ack expired …)` annotated evidence — the lifecycle has teeth while staying advisory. Undated
acks keep applying (backward compatible) but are counted and surfaced (doctor line, report note)
**even when every smell is suppressed** — the exact fossilization case from the field. Malformed
dates never apply (fail-loud, same discipline as a sloppy edge); a re-ack with a fresh date wins
over a dead entry. Doctor JSON gains `contractHealth.ackLifecycle`
(`{ undated, malformed, expiredCount, expired[] capped }`); the HTML report renders it inside the
`contractHealth` section under the X01 parity rule.

**Field origin (field session, 2026-07-16):** 29 acks, ~15 of them transitional migration debt with
no review date — fossilizable by construction.

**Local evidence (2026-07-16):** `bin/lib/contract-smells.mjs` (lifecycle status + resolveAck +
summary), `bin/lib/html-report-advisories.mjs` (lifecycle rows), `x02AckLifecycle.test.ts`
(14/14: semantics incl. same-day boundary, calendar round-trip, whole-file invalid on non-string
`reviewBy`, re-ack precedence, doctor lines, fossilization visibility, report parity). Cross-model
adversarial review found and fixed two lifecycle escapes: an undated leftover duplicate could
resurrect an expired dated ack (now dated entries govern the edge), and the public
`detectContractSmells` path never expired (now defaults `today` to the real clock; the pure
`analyzeContractSmells` core keeps the clock injected).

### X03 — Lateral smell recognizes family infrastructure

- **Status:** `done`
- **Depends on:** —

**Outcome:** `contract-lateral-adapter-allow` no longer fires when an adapter reaches its **own
family's infra base**: same leading name token (length ≥ 2, case-insensitive, camelCase/delimiter
tokenization) and **every** remaining target token a whole infra word
(`Infra(structure)`/`Base`/`Core`/`Shared`/`Common`/`Kernel`/`Platform`/`Foundation`) —
`PaymentsCoreAdapters` is still a sibling (cross-model review finding, fixed from `some` to
`every`). Cross-family edges, same-family non-infra siblings, and the reverse direction
(base → member adapter) still fire. Name heuristic like the existing role regexes — a miss costs
a warning line, never a verdict.

**Field origin (field session, 2026-07-16):** the smell fired on `<Family>Adapters -> <Family>Infra`,
the sanctioned direction inside a layer family.

**Local evidence (2026-07-16):** `isFamilyInfrastructureEdge` in `bin/lib/contract-smells.mjs`;
`x03FamilyInfra.test.ts` (7/7 incl. delimiter/case variants, embedded-word negative
`PaymentsCoredumpGateway`, single-letter family negative).

### Next-round package budget guardrail

**Recalibrated for Phase Z on 2026-07-18:** the gate-package ceilings retain at least 10%
headroom over clean Linux `arkgate@3.7.0` source `6fa5079` / PR candidate `b4f25a4`: 484,608
packed bytes, 1,632,090 unpacked bytes, and 135 files. The resulting limits (534,000 / 1,796,000 /
149) remain internal release guardrails, not npm requirements. The two same-engine Phase Z
performance attempts and frozen ceilings are recorded under Z01 above; no later Phase Z item may
raise them merely to fit its implementation.

- Keep `250 KB` packed / `1 MB` unpacked as the long-term optimization target, not as a reason to
  remove useful deterministic enforcement or architecture/organization coaching surfaces such as
  CLI, MCP, schemas, placement guidance, design-smell diagnostics, or extraction pilots.
- Set the hard packed, unpacked, and file-count ceilings once for the roadmap cycle with at least
  10% headroom over the measured clean candidate; do not ratchet them upward item by item.
- Any item projected to consume more than 25% of that cycle's headroom must record the user value,
  packed-content delta, and alternatives considered before implementation.
- If a candidate exceeds the cycle ceiling, reduce accidental/duplicated published surface or
  approve a new evidence-backed exception explicitly. Never raise the ceiling only to match the
  latest measurement plus a token margin.

**Per-cycle verification:** normally, `npm pack --json --dry-run`, `npm run check:package-files`, and
`npm run check:release-artifacts` must agree on the clean candidate contents before the first
implementation item of each new roadmap cycle starts. Phase Z explicitly exempts `Z01` because that
item fixes an unsafe release-artifact cleanup path: expose and fix the destructive fixture first,
then run release verification in a validated tool-owned temporary directory and freeze the cycle
ceilings before `Z02`. Never reuse a prior cycle's headroom as proof for a new one.

---

## Phase U — understandable execution (detail)

### U01 — Lock effect/state semantics and the architecture-vs-style boundary

- **Status:** `done`
- **Depends on:** Phase T shipped
- **Likely files:** `docs/adr/0009-effect-capability-boundary.md`, `docs/plans/understandable-execution/README.md`,
  fixed positive/negative fixtures and eval design only as required by the ADR

**Started (2026-07-15):** [ADR 0009](docs/adr/0009-effect-capability-boundary.md) drafts all eight
open decisions (Status: Proposed). Load-bearing calls: seven fixed capability IDs with declared
evidence sources; both config dialects lower to one capability semantic space (`forbiddenGlobals`
not deprecated; `pure: true` as the casual dual-depth surface; migrations proposed, never
applied); blocker-grade = direct symbol/import evidence only, transitive inference never blocks;
ambient state doctor-only with W01-style sidecar acks; benchmark method locked, numbers deferred
to the measured baseline; T01 classifies on the lowered space (equivalent migration = neutral);
surface-ownership dedup rule (layer rule wins, one finding, one `nextAction`); capability policies
excluded from W02 banding as a raw fact. Remaining before `done`: the fixture obligations listed
in the ADR (positive/negative per capability ID and evidence source, plus the D6 lowered-policy
pair), then flip the ADR to Accepted.

**Local evidence (2026-07-16):** ADR 0009 is **Accepted**. The fixture corpus lives at
`tests/fixtures/capability-corpus/` — `manifest.v1.json` + 25 case files covering every
capability/evidence-source cell (positives incl. adversarial `globalThis` alias; negatives for
shadowing, type-only value use, `import type`, and similar-name non-drivers `pgn-parser` /
`refetch-hints` / `fsm-machine`; one policy-allowed adapter case) plus the D6 lowered-policy
pair (neutral migration vs real weakening, marked non-executable until U04's schema).
`u01CapabilityCorpus.test.ts` guards the matrix structurally (6/6): exact seven-ID vocabulary,
per-source positive coverage, the negative matrix, TS parseability of every case, unique sorted
ids, and the lowering invariant of the neutral candidate. No production behavior or public
schema changed. Plan acceptance A1 checked.

**Outcome:** Define supported capability IDs, evidence, config compatibility, and the threshold
for blocker-grade precision. Explicitly exclude mandatory inlining, LOC/function-length rules,
class bans, generic `const` lint, style scoring, and from-scratch rewrites.

**Acceptance:** The ADR answers all eight plan open decisions or records a bounded deferment —
including the T01 policy-delta classification of introducing/migrating capability policy, the
surface-ownership map (layer rules vs design smells vs W01 contract smells vs capability walls),
and the W02 governance-weight treatment of capability policies; every
proposed blocking capability has deterministic positive and negative fixtures; no production
behavior or public schema changes in this item.

### U02 — Dogfood cohesive pure-core pilots

- **Status:** `done`
- **Depends on:** `U01`
- **Likely files:** `src/domain/configContract.ts`, `src/kernel/analysis.ts`, focused sibling modules,
  generators/parity tests, existing public-surface tests

**Outcome:** Handle `src/domain/configContract.ts` and `src/kernel/analysis.ts` as separate
one-pilot-at-a-time cohesion changes. Split only stable responsibilities; preserve linear local
flow and stop if extraction increases coupling or call-site hopping.

**Acceptance:** Exact public API, schema, hashes, diagnostics, generated bundle, adapter parity,
performance, and package budgets remain green; self-doctor no longer reports either current file as
a god-module candidate; no module budget is raised to land the pilots. A fired kill-switch is a
valid close for a pilot (recorded as evidence) and does not block `U03` — the dependency is
hygiene, not logic.

**Local evidence (2026-07-16):** Both pilots landed without a kill-switch.
**Pilot 1 (`configContract.ts`):** the contract type vocabulary moved to
`src/domain/configTypes.ts` with `import type`/`export type` re-exports — guaranteed erased on
transpile, so the generated `bin/lib/config-contract.mjs` and both published schemas stayed
**byte-identical** (zero drift) and self-contained; 462→406 LOC / 18→11 export statements.
**Pilot 2 (`analysis.ts`):** the C02 entry became a pure facade (74 lines) over five cohesive,
acyclic kernel modules — `analysisTypes` (API vocabulary), `moduleGraph` (specifier scanning +
edges), `graphEvaluate` (cycles + layer policy), `analysisCore` (load/analyze/policy delta),
`changePreflight` (atomic candidate), `configWarnings` (config diagnostics) — every consumer
import path unchanged; the tsup engine bundle regenerated. Self-doctor now reports **zero design
smells and `designWeak: false`** on this repository for the first time. Mutation line ranges for
`config-loading` were realigned with a deliberate 2-line widening (the previously-truncated tail
of `withArkConfigMetadata` is now mutated — scope-positive, measured green at 93.85%); the
runtime tarball exceeded its packed budget by 149 bytes from facade indirection and was brought
back by minifying its duplicate ESM/CJS dist with `keepNames: true` (gate-bundle precedent;
class/function `.name` stays stable for name-keyed reflection and Nest diagnostics — cross-model
review catch) — 160,149→132,438 packed, **no ceiling raised**. `ArkConfigSchemaVersion` is one
additive public type export.
Full suite 1131/1131; confidence gate green (config-loading 93.85%, aggregate 92.75%); layer-match,
cli-pure, analysis-engine drift, package files, TS 5/6/7 compat, and strict architecture all green.

### U03 — Add typed effect capabilities to the canonical analysis IR

- **Status:** `done`
- **Depends on:** `U01`; `U02` soft (a recorded kill-switch also satisfies it)
- **Likely files:** Domain analysis vocabulary, Kernel semantic analysis, generated CLI bundle,
  JSON Schema/public exports if authorized by U01, parity/property/fuzz tests

**Outcome:** Canonical analysis reports ordered, typed evidence for the U01-approved effects such
as network, filesystem, clock, randomness, environment, process, and persistence without creating
a second scanner or adapter-owned verdict.

**Acceptance:** Identical content/compiler/policy inputs reproduce capability uses and hashes;
shadowing, type-only, aliasing, dynamic-import, and legitimate-adapter negative cases are covered;
generated bundle drift and public compatibility gates pass.

**Local evidence (2026-07-16):** `src/domain/capabilities.ts` ships the closed seven-ID
vocabulary with exact/subpath module matching (never substring), longest-prefix ambient mapping,
and the D6 coverage-faithful `lowerForbiddenGlobal` (`process` → environment+process).
`src/kernel/capabilityAnalysis.ts` composes the EXISTING collectors (`extractSemanticDependencies`
+ `collectForbiddenCapabilityUses`) — no second scanner, no change to `semanticAnalysis.ts`, so
the pinned mutation ranges never moved. The pure IR engine populates `ir.capabilityUses` with the
import-based subset from the same specifier scan (deterministic ordering; conservative textual
`import type` erasure with the mixed-named-bindings envelope documented). The U01 corpus became
executable: `u03CapabilityDetection.test.ts` runs all 25 cases through the symbol-aware collector
(positives detect, negatives never, policy-allowed detects) plus vocabulary/lowering/IR
determinism — 33/33 green on first run against the frozen corpus. Engine bundle regenerated;
full suite 1164/1164; confidence gate green (aggregate 92.75%); budgets, TS 5/6/7, release
artifacts, and strict architecture green. Evidence-only: nothing blocks until U04.

### U04 — Enforce opted-in capability walls over complete patches

- **Status:** `done`
- **Depends on:** `U03`
- **Likely files:** config contract/schema/migration, analysis/preflight, CLI/MCP/ESLint/hook adapters,
  atomic candidate and adapter-parity fixtures

**Outcome:** Layers may opt into U01-approved effect policies. Existing `forbiddenGlobals`
behavior remains compatible, absence of the new surface changes no verdict, and atomic preflight
cannot miss a denied capability introduced across several files.

**Acceptance:** CLI, MCP, ESLint, hooks, package API, and strict CI agree on the same complete
candidate; policy weakening follows the existing hash-bound acknowledgment path; clean brownfield
fixtures do not gain surprise blockers.

**Local evidence (2026-07-16):** Layers opt in via `capabilities: { deny: [...] }` (seven-id enum
in the versioned schema, path-specific rejection of unknown ids) or the dual-depth sugar
`pure: true`; absence changes no verdict (brownfield case pinned). Enforcement is judgment-class
`CAPABILITY_VIOLATION` with a port-injection `nextAction`, emitted by the pure IR engine
(import-based), by atomic preflight over the complete candidate (A4 — multi-file case pinned),
and by the symbol-aware CLI scan path (ambient + import; scan cache bumped to v8). D7 dedup: an
ambient use covered by the layer's `forbiddenGlobals` reports only `FORBIDDEN_GLOBAL` (CLI case
pinned). T01 now classifies the ambient surface on the LOWERED capability space via
`loweredLayerCoverage` — the corpus D6 pair is executable (neutral migration passes without ack;
real lowered loss requires it; bare `process` → deny `[process]` alone is weakening), and
unlowerable custom globals keep the raw comparison. The two tests that pinned the pre-D6 finding
path were updated to the designed semantics. `u04CapabilityWalls.test.ts` 15/15; corpus policy
fixtures flipped executable; full suite 1184/1184; confidence gate green (aggregate 92.75%;
config-loading range realigned 355-431 after the schema grew); artifacts, drift checks, budgets,
and strict architecture green. Docs: package-surface, agent-guide, configuration.

### U05 — Prove ambient mutable-state diagnostics before strictness

- **Status:** `done`
- **Depends on:** `U03`
- **Likely files:** semantic analysis, doctor/design-smell vocabulary, fixed state corpus,
  adapter-parity and false-positive tests

**Outcome:** Detect supported module-scope mutable-state shapes in explicitly pure layers, while
distinguishing legitimate stateful adapters, registries, caches, tests, and experimental runtime.
The MVP diagnostic is advisory unless U01's evidence bar is met by the completed corpus.

**Acceptance:** Stable evidence and plain remediation exist; no strict default is introduced from
an incomplete corpus; any strict option requires explicit policy and zero known false-positive
blockers in the fixed matrix.

**Local evidence (2026-07-16):** `bin/lib/ambient-state.mjs` detects module-scope `let`/`var` in
`pure: true` layers only (opt-in; MVP shape per D4), with sorted findings, an honest truncation
count, and bounded sidecar acks at `.ark/ambient-state-acks.json` (malformed file suppresses
nothing). Surfaced as `doctor.ambientState` + a human advisory section via the new
`doctor-advisories.mjs` aggregator (doctor-plan stays inside its 920-LOC budget); when TypeScript
is absent the sensor reports `available: false` instead of guessing. The fixed FP matrix is
pinned by `u05AmbientState.test.ts` (6/6): const bindings, function-local state, non-pure layers,
and acknowledged registries all stay silent; the doctor case proves `designFitness` and the
verdict are untouched. **No strict mode exists anywhere** — strictness remains a later evidence
decision (A5 checked in the plan).

### U06 — Ship dual-depth remediation and profile the real pre-tool path

- **Status:** `done`
- **Depends on:** `U04`, `U05`
- **Likely files:** remediation vocabulary, doctor/prepare-write/preflight responses, hook/MCP
  benchmark harness, Linux performance budgets and CI

**Outcome:** Casual users receive one action such as defining a Clock/Random/HTTP/storage port;
seniors receive stable JSON evidence and hashes. Cold and incremental measurements cover the full
hook/MCP path before any optimization or fixed threshold is approved.

**Acceptance:** No LLM decides the verdict or remediation ID; adapter responses remain equivalent;
profiles justify every optimization; reproducible CI budgets include measured runner headroom and
do not weaken correctness checks.

**Local evidence (2026-07-16):** Dual depth for capability walls across EVERY surface: the U06
tests exposed and closed two parity gaps — the human `nextAction` fell to the generic fallback
(adapterContract's own switch gained the CAPABILITY_VIOLATION case) and, critically, **the real
PreToolUse hook did not enforce walls at all** (the AICodeGate now takes `capabilityWalls` with
the same D7 dedup; `ark-mcp --hook` blocks a denied-capability Write end-to-end with exit 2 —
pinned by a fresh-child-process test). ESLint gained `ark/no-denied-capabilities` (import
dimension, recommended config) for adapter parity. `scripts/hook-path-bench.mjs` measures the
COMPLETE paths (hook cold/warm + doctor cold, 1k/10k, fresh processes); the D5 method is locked
in `eval/performance/hook-budgets.v1.json` — RECORDING mode until the Linux CI baseline exists,
ceilings = baseline + fixed headroom, guarded by a test that forbids an invented ceiling without
its baseline. CI job added. FIX_HINTS carries the casual port hint. Suite 1200/1200.

### U07 — Adoption and release evidence

- **Status:** `done`
- **Depends on:** `U01`–`U06`
- **Likely files:** adoption/eval fixtures, README/configuration/agent/package-surface docs,
  CHANGELOG/release notes, package and compatibility checks

**Outcome:** Prove the new architecture capability path for expert and casual flows without adding
a new command, skill namespace, preset pack, runtime wedge, or package-budget ratchet.

**Acceptance:** Fixed adoption and adversarial corpora, full confidence gate, architecture check,
TypeScript compatibility, package allowlist/artifact budgets, and exact-SHA CI/Security are green;
the phase plan is marked Shipped only after release evidence exists.

**Started (2026-07-16):** the 3.4.0 release train is prepared (version sync across package.json,
lockfile, src/version.ts, server.json; CHANGELOG section; `docs/releases/3.4.0.md` with the
opt-in honesty lines and maintainer checklist; release-surface parity test extended;
README/package-surface pointers). U06's /review fixes are folded in: the bench dropped its
fictional cold/warm split (the hook never consumes the scan cache — one honest distribution),
armed ceilings that resolve no measurement now FAIL instead of silently passing, non-zero child
exits abort a run, and the ESLint rule gained all-type named-list erasure parity plus a
behavioral test.

**Local evidence (2026-07-16, closed):** CI run 29528935846 is fully green on `89173ed`
(including the perf job: the V01 incremental regression the previous run caught — the specifier
scan's unconditional word probes — was fixed with first-letter guards; Linux 10k incremental
p95 112.5 ms < 125, and locally 41.2 ms vs 45.7 on main). The same run recorded the first Linux
hook-path baseline: hook@10k p95 635.14 ms, doctorCold@10k p95 4063.72 ms — adopted as ceilings
800 / 5100 ms (baseline + ~25% runner headroom, set once for this cycle per D5; the bench
enforces them from now on, and the recording-mode guard test keeps invented ceilings impossible).
Full local gates green at the release candidate: suite 1203/1203, confidence (aggregate 92.75%),
release artifacts within budgets, `npm publish --dry-run` → `+ arkgate@3.4.0`, TS 5/6/7 compat,
strict architecture. No new command, skill namespace, preset pack, runtime wedge, or
package-budget ratchet was added anywhere in the phase. Phase U implementation is COMPLETE;
the plan is marked Shipped after the 3.4.0 release evidence exists.

---

## Phase W — contract health (detail)

ArkGate validates code against the contract; nothing yet validates the contract against known
contract anti-patterns or reports its governance cost. All three items are advisory-only surfaces:
they never change a pass/fail verdict, never auto-apply, and respect every existing hard line
(no numeric trust score, no LLM-derived verdict, no gate weakening).

### W01 — Deterministic contract smells (meta-lint of the contract)

- **Status:** `done`
- **Depends on:** `W03`
- **Likely files:** `bin/lib/design-smells.mjs` (new contract-smell family), `bin/lib/doctor-plan.mjs`,
  `docs/agent-guide.md`, fixture matrix, focused static-check tests

**Outcome:** Doctor emits stable, evidence-backed smell ids for contract shapes that permit future
degradation even at 0 violations: mutually-allowed (bidirectional) edges between two layers,
peripheral layers (observability/audit-style) allowed to depend on orchestration or persistence,
lateral adapter-to-adapter edges, and rules never exercised by any governed file (dead rules).
Complements `soft-contract` (which detects missing rules) by detecting *permissive or unused*
rules. Waiver/exception recurrence on the same edge, where already recorded, is surfaced as
supporting evidence ("architectural pressure"), not as a new tracking system.

**Acceptance:** Every smell has deterministic positive and negative fixtures (a legitimate
bidirectional edge fixture must stay clean when explicitly acknowledged); ids follow the P02/Q02
pattern with plain-language `outcome`; advisory severity only — no smell blocks a merge gate or
downgrades ENFORCE; no new skill name, preset, or config key beyond an optional acknowledgment
field decided in the item's opening ADR note.

**ADR note (2026-07-15):** acknowledgments live in an optional sidecar
`.ark/contract-smell-acks.json` (`{ acks: [{ id, edge, reason }] }`), following the Q03
golden-pattern precedent — the versioned `ark.config.json` contract and its schema are untouched,
so no policy-delta or migration surface changes. A malformed sidecar is reported
(`ackFile.invalid`) and suppresses nothing.

**Local evidence (2026-07-15):** `bin/lib/contract-smells.mjs` ships four stable ids
(`contract-bidirectional-allow`, `contract-peripheral-depends-core`,
`contract-lateral-adapter-allow`, `contract-dead-rule`) with Q02-style outcomes; doctor JSON gains
`doctor.contractHealth` and a human "Contract health (advisory)" section; nothing feeds
`designFitness`, `patternBets`, `postGreenPath`, or any verdict. Red-first
`w01ContractSmells.test.ts` passes 12/12 with positive/negative fixtures per id, order-insensitive
ack suppression, malformed-ack honesty, a self-hosting zero-smell guard on this repo's own
contract, and a doctor-JSON advisory-isolation case. The full confidence gate passes (1124 tests;
mutation aggregate 92.74%, all groups ≥90%), module budgets pass without raising any budget
(doctor-plan footprint kept minimal via `computeContractHealth` / `printContractHealthSection`),
typecheck, JS syntax, layer-match, cli-pure, package-files, build, and strict `check:architecture`
are green. Docs: `docs/package-surface.md` stable-surface row + `docs/agent-guide.md` section.

### W02 — Governance-weight evidence (descriptive, never a score)

- **Status:** `done`
- **Depends on:** `W01`
- **Likely files:** `bin/lib/doctor-plan.mjs` or coverage reporting, `docs/agent-guide.md`,
  `docs/brownfield-adoption.md`, focused tests

**Outcome:** Doctor/coverage JSON reports descriptive governance-weight facts — rules per governed
file, layers relative to governed file count, denied edges per layer — with Q02-style human outcome
language, so a maintainer can see when a contract is unusually heavy or light for the tree it
governs (e.g. "10 layers / 90 rules for 228 files is heavier than typical"). Feeds `ark start`
and adoption guidance for casual users, where the field-observed failure mode is copying a
heavyweight contract onto a small project.

**Acceptance:** Output is raw counts and ratios with fixed comparative wording — explicitly not a
composite score, ranking, or gate input (the final gate stays binary per the hard lines); wording
never tells a user to delete layers, only to justify new ones; fixtures pin a light, a typical,
and a heavy contract; absence of the surface changes no verdict.

**Local evidence (2026-07-15):** `computeGovernanceWeight` in `bin/lib/contract-smells.mjs`
reports raw facts (declared/populated layers, governed files, rules, denied/allowed edges,
files-per-layer, rules-per-layer) plus a fixed band (`heavy`/`typical`/`light`/`unknown`) with
fixed notes and `notAScore: true`; surfaced as `doctor.contractHealth.governanceWeight` with a
human line only for noteworthy bands. Red-first `w02GovernanceWeight.test.ts` passes 7/7,
pinning the field-analysis heavy case (10 layers / 90 rules / 228 files → heavy), a light case,
this repo's typical shape, unknown on empty scope, the no-score key guard, the
never-delete-layers wording, and doctor JSON/human advisory isolation. Dogfood: this repository
reads `typical` (4 layers / 10 rules / 159 governed files). Full confidence gate, typecheck,
JS syntax, module budgets (zero new doctor-plan lines), build, and strict architecture check are
green. Docs: package-surface row + agent-guide section.

### W03 — Name the enforcement-boundary trade-off in positioning docs

- **Status:** `done`
- **Depends on:** Phase T shipped
- **Likely files:** `README.md`, `docs/ai-gates.md`, `docs/agent-guide.md`, host-support-matrix
  wording, docs regression snapshot

**Outcome:** Docs-only. S03/S06 already report per-host truth (hard write for Claude/Grok,
advisory write + hard CI merge for Cursor/Codex); this item names that boundary as a deliberate
design trade-off rather than a gap, in plain language: local checks coach at the earliest
available boundary, the non-bypassable guarantee lives at the merge gate, and the contract also
works as a pressure sensor that shows when the existing design stopped being enough. External
field analysis reached exactly this reading unaided; the positioning should state it first.

**Acceptance:** README/positioning contain the trade-off rationale next to the existing support
matrix without strengthening any guarantee claim; the S06 docs regression still passes; no code,
schema, or template behavior changes.

**Local evidence (2026-07-15):** README gains "Why the hard guarantee lives at the merge gate"
directly under the canonical matrix; `docs/ai-gates.md` and `docs/agent-guide.md` name the
advisory-local / hard-CI split as a deliberate trade-off next to their matrix links. A new W03
case in `hostSupportMatrixDocs.test.ts` was committed red first and pins the heading, the
"deliberate trade-off, not a gap" and "pressure sensor" wording, and the required-status
conditionality; the existing no-universal-claims guards still pass. Typecheck, the full
static-check suite (71 files / 744 tests), and strict `check:architecture` are green. Docs +
test only; no code, schema, or template behavior changed.

---

## Phase Q — power + simple (detail)

### Q01 — Single post-green “clarify for AI / Shape” path

- **Status:** `done`
- **Depends on:** Phase P
- **Likely files:** `bin/lib/post-green-path.mjs`, `bin/lib/doctor-plan.mjs`,
  `bin/lib/ci-and-commands.mjs`, `templates/skills/ark-explore.md`, `ark-autopilot.md`,
  `tests/unit/static-check/q01PostGreenPath.test.ts`

**Outcome:** When `designFitness.designWeak`, doctor ranks **one** primary next action
(`/ark-explore` shape-focus → dual-plan B → `/ark-autopilot` only to apply B with OK). JSON
exposes `postGreenPath` + `primaryNextAction` + `healthyFinishedForbidden`. Skill routing maps
messy/design-weak/clarify-for-AI to that single path. No new skill basename; no new
mechanical-safe kinds.

**Local evidence (2026-07-13):** `q01PostGreenPath.test.ts` green; design-weak fixture doctor
JSON `postGreenPath.id === clarify-for-ai`; human top action #1 is the chained path; no
“Healthy — nothing to do” under design-weak.

### Q02 — Human outcome language for design smells

- **Status:** `done`
- **Depends on:** `Q01`
- **Likely files:** `bin/lib/design-smells.mjs` (`DESIGN_SMELL_OUTCOMES`, `outcome` field),
  `bin/lib/doctor-plan.mjs`, `docs/agent-guide.md`, `docs/package-surface.md`,
  `tests/unit/static-check/q02SmellOutcomes.test.ts`

**Outcome:** Every stable smell id has a plain-language `outcome` for newbies/vibecoders;
technical `message` retained; doctor human prints outcome first; JSON includes `outcome`;
agent-guide table parity. Smell **ids unchanged**. Q01 postGreenPath preserved.

**Local evidence (2026-07-13):** `q02SmellOutcomes.test.ts` green; fixture doctor JSON smells
all have `outcome`; human doctor shows ORM-in-routes outcome wording.

### Q03 — Optional golden pattern artifact (new-code guidance)

- **Status:** `done`
- **Depends on:** `Q01`
- **Likely files:** `bin/lib/golden-pattern.mjs`, `bin/ark-mcp.mjs` (`ark_place` /
  `ark_prepare_write`), `bin/lib/prepare-write.mjs`, `bin/lib/doctor-plan.mjs`,
  `templates/skills/ark-place.md`, `docs/agent-guide.md`, `docs/package-surface.md`,
  `tests/unit/static-check/q03GoldenPattern.test.ts`

**Outcome:** Consumers may record a short golden norm at `.ark/golden-pattern.json`
(`name` + `norm`, optional `newCodeHome` / `examplePath`). `ark_place` /
`ark_prepare_write` and doctor JSON surface it as **advisory for NEW code only**.
**Absent is OK** (no claim). **Never** ENFORCE, never clears `design-weak`, never a
mechanical-safe kind. Malformed file → invalid summary, not silent success.

**Local evidence (2026-07-13):** `q03GoldenPattern.test.ts` 10/10 green; design-weak
fixture still `designWeak` + `postGreenPath.clarify-for-ai` with golden present;
`check:architecture` strict green.

### Q04 — Pilot loop productized (one pilot → re-doctor)

- **Status:** `done`
- **Depends on:** `Q02`, `Q03`
- **Likely files:** `bin/lib/pilot-loop.mjs`, `bin/lib/doctor-plan.mjs`,
  `docs/brownfield-adoption.md`, `docs/package-surface.md`, `docs/agent-guide.md`,
  `templates/skills/ark-explore.md` / `ark-autopilot.md`,
  `tests/unit/static-check/q04PilotLoop.test.ts`

**Outcome:** From design-weak residual, product surfaces emit **one** next pilot
(extraction-card fields from patternBets): pilot target, move, success, kill-switch.
After a single pilot change, re-doctor is the success sensor (reduced evidence on pilot
paths). Never multi-pilot batch, never mechanical-safe, never false healthy finished.

**Local evidence (2026-07-13):** `q04PilotLoop.test.ts` 9/9 green; design-weak fixture
selects `facade-sql-in-routes` → pilot on `src/routes/orders.ts`; after single pilot
rewrite, smell cleared on pilot path while `goal.met` stays true and residual
`domain-logic-in-ui` remains; patternBets never mechanical-safe; `check:architecture` green.

### Q05 — AI-velocity evidence (golden-path vs design-weak)

- **Status:** `done`
- **Depends on:** `Q04`
- **Likely files:** `bin/lib/ai-velocity.mjs`, `eval/ai-velocity-run.mjs`,
  `eval/ai-velocity-report.json`, `eval/ai-velocity-baseline.json`,
  `tests/unit/static-check/q05AiVelocity.test.ts`, `eval/README.md`, package-surface

**Outcome:** Deterministic CI-safe bench runs the **same** fixed feature scenario
(`add-pure-domain-canRefund`) on design-weak vs golden-path arms. Metric
**`placementTurns`** (agent-equivalent steps to DomainModel home); golden strictly
better. Method documented next to the number. No live LLM; no gate weaken.

**Local evidence (2026-07-13):** design-weak 4 turns vs golden-path 1 turn; harness PASS;
`q05AiVelocity.test.ts` green; `check:architecture` green.

### Q06 — Release train (Phase Q surfaces + patch 3.0.3)

- **Status:** `done`
- **Depends on:** `Q01`–`Q05`
- **Likely files:** `package.json`, `src/version.ts`, `server.json`, `package-lock.json`,
  `CHANGELOG.md`, `docs/releases/3.0.3.md`, `docs/package-surface.md`, `docs/agent-guide.md`,
  `release/package-budgets.v1.json`, `tests/unit/static-check/q06ReleaseSurfaces.test.ts`

**Outcome:** Patch **3.0.3** packages Q01–Q05 for consumers: CHANGELOG section, release note
with upgrade path and honesty lines, version sync across package metadata, surface docs parity.
Live `npm publish` only after merge to main with auth; dry-run readiness is the local bar.

**Local evidence (2026-07-13):** version 3.0.3 synced (package/lock/server/src); CHANGELOG +
`docs/releases/3.0.3.md`; `q06ReleaseSurfaces.test.ts` green; `check:release-artifacts` verified
(`arkgate@3.0.3` pack); `npm publish --dry-run` shows `+ arkgate@3.0.3`; architecture green.
Live npm publish deferred to maintainer checklist on main.

## Phase P — post-3.0 pattern depth

### P01 — Skills: exploratory depth + routing clarity

- **Status:** `done`
- **Closes:** agent ambiguity between explore / coverage / think / adopt / autopilot; empty plan A
  celebrated as “architecture healthy”; weak dual-plan B on spaghetti installs
- **Likely files:** `templates/skills/*.md`, `bin/lib/ci-and-commands.mjs` (skill routing),
  `README.md` skill table, `docs/agent-guide.md`, `tests/unit/static-check/skillsSurface.test.ts`

**Implementation**

1. Add **When / not when** to every overlapping skill; keep 13 names (no new skills).
2. Make `/ark-explore` the canonical non-deterministic recon: path vs design, concurrent patterns,
   Align→Stabilize→**Shape** ladder, auto dual-plan seed on spaghetti signals, extraction cards.
3. Narrow `/ark-coverage` to Ark **fitness** (governed/gates/baseline); handoff explore for Shape.
4. Narrow `/ark-think` to **one** decision (2–3 options); handoff explore for full dual-plan.
5. Require adopt/autopilot to seed or execute dual-plan **B** when design-weak residual remains.
6. Update full-install `agentInstructions` routing table: no overlapping skills; Shape honesty.
7. Tests lock routing phrases + explore/coverage/think/adopt/autopilot vocabulary.

**Acceptance**

- Skills surface tests pass; every critical skill has When/not when.
- Explore documents Shape ladder + extraction cards + design-weak under ENFORCE.
- Coverage explicitly defers pattern dual-plan to explore.
- Routing table names Align/Stabilize/Shape and forbids treating empty A as healthy finished.
- No new skill basename; no gate weakening; no new mechanical-safe kinds.

**Verify**

```bash
npx vitest run tests/unit/static-check/skillsSurface.test.ts
npm run check:architecture
```

**Local evidence (2026-07-13):** `skillsSurface` 11/11 pass; `check:architecture` pass. Explore
§G Shape ladder + extraction cards shipped; coverage/think narrowed; adopt/autopilot seed B;
routing table de-overlaps; no new skill names.

### P02 — Deterministic design smells in doctor

- **Status:** `done`
- **Depends on:** `P01`
- **Likely files:** `bin/lib/design-smells.mjs`, `bin/lib/doctor-plan.mjs`, `tests/unit/static-check/designSmells.test.ts`

**Outcome:** doctor emits stable smell ids (`facade-sql-in-routes`, `handler-in-persistence`,
`god-module`, `domain-logic-in-ui`, `io-under-application`, `mixed-pattern-cluster`,
`soft-contract`) so “ENFORCE · design-weak” is machine-visible without LLM prose.

**Acceptance:** doctor JSON documents smells with paths; false-positive rate bounded by fixtures;
skills reference doctor ids when present without requiring them for agent-detected smells.

**Local evidence (2026-07-13):** `designSmells.test.ts` 13/13; CLI `--doctor --json` on a fixture
with prisma-in-route reports `designFitness.designWeak: true` and smell evidence paths.

### P03 — Stable plan-B pattern bet IR

- **Status:** `done`
- **Depends on:** `P02`
- **Likely files:** `bin/lib/doctor-plan.mjs`, `bin/lib/design-smells.mjs`, `docs/package-surface.md`

**Outcome:** `ark-check --plan --json` includes `patternBets[]` with
`pilot`, `successSignal`, `killSwitch`, `neverMechanicalSafe: true`. Additive within major.

**Acceptance:** documented surface + fixture; never auto-applied; loop/autoPatch only
`MECHANICAL_SAFE_KINDS`; honesty guard refuses “healthy finished” under design-weak.

**Local evidence (2026-07-13):** plan JSON sample with `patternBets[0].neverMechanicalSafe`;
`assertPatternBetsNeverMechanicalSafe` vs `MECHANICAL_SAFE_KINDS` green.

### P04 — Eval honesty for design-weak ENFORCE

- **Status:** `done`
- **Depends on:** `P03`
- **Likely files:** `tests/fixtures/design-weak-enforce/**`, `tests/unit/static-check/designWeakEnforce.test.ts`

**Outcome:** synthetic spaghetti fixture where plan A is empty and design smells /
patternBets are non-empty; `assertNotHealthyFinishedIgnoringDesign` refuses healthy-finished claims.

**Local evidence (2026-07-13):** `designWeakEnforce.test.ts` 5/5 on permanent fixture.

### P05 — Extraction cards as productized judgment assist

- **Status:** `done`
- **Depends on:** `P03`
- **Likely files:** `docs/brownfield-adoption.md`, `templates/skills/ark-{explore,fix,autopilot,loop}.md`,
  `tests/unit/static-check/extractionCardSurface.test.ts`

**Outcome:** I/O and god-module judgment has a fixed card template (pilot, move bytes, do-not list,
success, kill-switch) in docs and skills; still human/agent applied, no bulk codemod engine.

**Local evidence (2026-07-13):** extraction card §6 in brownfield-adoption; skill links;
`extractionCardSurface.test.ts` guards template fields.

---

## Phase S — stabilize truth and close P0/P1

### S01 — Make workflow completion audit retry-safe

- **Status:** `done`
- **Closes:** `RB-01`
- **Likely files:** `src/kernel/workflow/Saga.ts`, `tests/unit/workflow/workflowEngine.test.ts`

**Implementation**

1. Add a fault-injection test where `step.execute` succeeds and
   `workflow.step.completed` audit recording fails.
2. Separate the effect retry boundary from persistence and telemetry handling.
3. Persist a completed step once; never append duplicate step names.
4. Define the explicit policy for post-effect persistence/audit failure. An audit failure may fail
   the workflow or become a recorded telemetry failure, but it must never rerun the effect.
5. Add the same regression case for `workflow.completed` audit failure.

**Acceptance**

- The effect counter is exactly `1` under every post-effect audit failure case.
- `completedSteps` contains each completed step at most once.
- Retry tests still prove that an actual `step.execute` failure retries according to policy.
- Runtime docs state the failure semantics and continue to warn that built-in stores are not
  production durability.

**Verify**

```bash
npx vitest run tests/unit/workflow/workflowEngine.test.ts
npm run test:coverage
npm run check:architecture
```

**Not in scope:** recovery leases, durable resume, or outbox redesign. Those belong to `C06`.

**Local evidence (2026-07-11):** 683/683 tests pass; the focused workflow suite has 8/8 tests;
typecheck, build, architecture, JS/parity/module/package gates pass. Global branch coverage improved
from 84.73% to 84.77%; this was the explicit blocker subsequently closed by `S02`.

### S02 — Restore honest regression gates

- **Status:** `done`
- **Closes:** `RB-05`
- **Likely files:** tests for uncovered branches, `vitest.config.ts`, mutation config, CI/release scripts

**Implementation**

1. Add tests until the existing global branch threshold passes. Do not lower or narrow the current
   include set.
2. Run `npm run test:coverage` twice from a clean state and retain both results in the PR.
3. Add a real mutation runner for enforcement-critical modules. Start with write-path detection,
   dependency extraction, forbidden-global detection, baseline keys, and workflow retry logic.
4. Add `test:mutation` and a non-flaky CI gate with an initial critical-module score of at least
   90%.
5. Ensure release scripts invoke the same confidence gate used by CI.

**Acceptance**

- Two consecutive clean coverage runs exit 0 without exclusions added to hide misses.
- `npm run test:mutation` exists, runs real mutants, and meets its documented threshold.
- The release path cannot publish when coverage or mutation gates fail.
- No roadmap or release note claims a test capability that is not executable from `package.json`.

**Verify**

```bash
npm run test:coverage
npm run test:coverage
npm run test:mutation
npm run check:architecture
```

**Local evidence (2026-07-11):** the final `npm run test:confidence` exits 0 with 698/698 tests,
85.22% branch coverage, and 92.45% mutation score (265 real mutants: 245 killed, 20 survived,
0 no-coverage/errors/timeouts). A second clean coverage run also exits 0 at 85.22%; no coverage
threshold, include, or exclusion was weakened. CI, the local/OIDC release script, and the token
publish path all invoke `test:confidence` before publish, guarded by
`tests/unit/scripts/confidence-gates.test.ts`. Typecheck, build, architecture, JS/parity,
module-budget, package-files, and production security-audit gates pass.

### S03 — Model write enforcement per active host

- **Status:** `done`
- **Closes:** `RB-02`
- **Likely files:** `bin/lib/write-path-detect.mjs`, `bin/lib/doctor-plan.mjs`,
`bin/lib/mcp-adoption.mjs`, host detection modules, write-path tests

**Implementation**

1. Introduce a canonical host capability model with at least:
   `hard-write`, `advisory-write`, `merge-gate`, `repair-payload`, and evidence paths.
2. Make capability detection accept an explicit host. Use active-host detection only as a default.
3. Never infer Codex/Cursor hard enforcement from Claude/Grok hook files.
4. Preserve a repo-wide inventory separately from the active-host verdict.
5. Add stable JSON snapshots for Claude, Grok, Cursor, Codex, unknown, and mixed-host repos.

**Acceptance**

- `ARK_ACTIVE_HOST=codex ... --doctor --json` cannot report `hard-write` or `repair` because a
  Grok/Claude hook exists.
- Unknown host is conservative and does not merge incompatible capabilities.
- Human doctor output names the active host and distinguishes advisory write checks from hard
  merge enforcement.
- Existing Claude and Grok hard-hook behavior remains green.

**Verify**

```bash
npx vitest run tests/unit/static-check/writePathDetect.test.ts
npx vitest run tests/unit/static-check/installFieldFixes.test.ts
npm run test:coverage
```

**Local evidence (2026-07-11):** active-host and repo-inventory verdicts are separated for
Claude, Grok, Cursor, Codex, unknown, and mixed fixtures; doctor JSON with
`ARK_ACTIVE_HOST=codex` keeps Grok hard-hook/repair evidence in inventory only, while human output
labels advisory MCP and the hard CI merge gate independently. The full suite passes 705/705 tests
at 85.24% branch coverage; focused write-path coverage is 100% for both the canonical capability
model and compatibility projection. Mutation passes at 98.04% overall
(`write-path-capabilities` 99.23%, `write-path-detect` 100%). Typecheck, build, JavaScript syntax,
architecture, generated-parity, module-budget, package-files, and production security-audit gates
pass (0 vulnerabilities).

### S04 — Make strict and onboarding compatible with each host

- **Status:** `done`
- **Closes:** `RB-03`
- **Likely files:** `bin/ark-check.mjs`, `bin/ark.mjs`, gate/workflow templates, onboarding tests

**Implementation**

1. Separate merge-gate strictness from hard-write-hook strictness. Use explicit profiles or flags;
   do not make a CI process depend on a hook from an unrelated editor/agent.
2. Generate CI for the merge-gate profile.
3. Validate write-hook requirements with an explicit host profile.
4. Add isolated install fixtures for Claude-only, Grok-only, Cursor-only, Codex-only, and mixed
   installs.
5. Make `start` fail before writing files if the requested host/profile combination cannot satisfy
   the requested guarantee.

**Acceptance**

- Every host-only generated CI workflow runs green on its fresh fixture.
- Claude/Grok fixtures prove hard-write enforcement; Cursor/Codex fixtures state advisory write +
  hard CI without pretending otherwise.
- Re-running install is idempotent.
- No suggested fix tells a Codex-only user to install an unrelated host merely to satisfy CI.

**Verify**

```bash
npx vitest run tests/unit/static-check/arkCheck.test.ts
npx vitest run tests/unit/static-check/fieldHonestyDefaults.test.ts
npm run test:coverage
```

**Local evidence (2026-07-11):** generated CI uses the host-agnostic `--strict-merge` profile
(`--strict` remains an alias), and `--require-write-hook <host>` validates only the named host.
Fresh Claude-only, Grok-only, Cursor-only, Codex-only, and mixed fixtures prove their generated
merge command exits 0; Claude/Grok expose hard-write + repair, while Cursor/Codex expose advisory
write + hard CI with host-local fix guidance. Every host install is byte-for-byte idempotent.
`ark start` rejects advisory-only, tool-mismatched, and preserved-incompatible hard-hook requests
before writing, while a supported Claude request completes and verifies. The full suite passes
719/719 tests at 85.20% branch coverage; enforcement-profile focused coverage and mutation are
100%, with the full mutation gate at 98.42%. Typecheck, build, JavaScript syntax, architecture,
generated-parity, module-budget, package-files, and production security-audit gates pass
(0 vulnerabilities).

### S05 — Close the confirmed scanner bypass corpus

- **Status:** `done`
- **Closes:** `RB-04`
- **Likely files:** `bin/ark-shared.mjs`, dependency/safety scanners, `AICodeGate.ts`, new adversarial tests

**Required corpus**

- Local parameter named `fetch` is not treated as the ambient global.
- Local object named `Date` is not treated as the ambient global.
- Aliasing the ambient `fetch` remains a violation.
- `globalThis.Date.now()` remains a violation.
- `import x = require('...')` produces a dependency edge.
- Non-literal `require(expr)` produces an unresolved dynamic-dependency diagnostic under strict.
- Workspace package imports continue to resolve and enforce correctly.

**Implementation**

1. Commit the corpus as failing tests before changing detection.
2. Close every confirmed case in all currently shipped scanner surfaces.
3. Document the remaining soundness envelope: supported syntax, unresolved dynamic behavior, and
   strict-mode policy.
4. Do not add regex-only special cases when symbol/AST evidence is available.

**Acceptance**

- Required corpus is green with zero expected-failure annotations.
- CLI and in-memory validation agree on each case.
- No existing package/workspace resolution regression.

**Verify**

```bash
npx vitest run tests/unit/static-check
npx vitest run tests/unit/ai-gate
npm run eval:corpus
npm run test:coverage
```

**Local evidence (2026-07-11):** the adversarial corpus was committed red first (`3419b2f`),
then closed without expected-failure annotations across ark-check, AICodeGate, and ESLint.
Single-file TypeScript symbols distinguish local bindings from ambient references; static AST
paths cover `globalThis`, import-equals, literal import attributes, and direct dynamic
import/require policy. Workspace-package enforcement remains green and scan cache v7 prevents old
verdict reuse. Static-check passes 454/454 tests, AICodeGate 26/26, ESLint 15/15, and the eval
corpus 18/18 cases. The final confidence gate passes 732/732 tests at 85.16% branch coverage and
97.49% mutation with no uncovered mutants. TypeScript 5.9/6.0/7.0 compatibility, typecheck, build,
JavaScript syntax, architecture, generated parity, module budgets, package allowlist/dry-run, and
production security audit all pass (0 vulnerabilities).

### S06 — Publish one truthful support matrix

- **Status:** `done`
- **Closes:** unsupported product claims
- **Likely files:** `README.md`, `docs/ai-gates.md`, `docs/agent-guide.md`, templates, release docs,
website source if maintained in this repository

**Implementation**

1. Define one canonical host matrix sourced from the capability model.
2. Replace “every write” and “full hooks” claims with exact hard/advisory/CI guarantees.
3. Make README, generated agent instructions, doctor, and website copy agree.
4. Mark runtime experimental and remove production implication until `C06` and `V05` pass.
5. Add a docs regression test or snapshot for the host matrix and key claims.

**Acceptance**

- No repository search finds a stronger claim than the canonical matrix permits.
- A user can tell, before install, what is blocked at write time and what is blocked only in CI.
- Release notes identify the guarantee change explicitly.

**Verify**

```bash
rg -n "every write|full MCP/hooks|PreToolUse|hard write|advisory" README.md docs templates
npm run test:run
npm run check:architecture
```

**Local evidence (2026-07-11):** `bin/lib/host-support-matrix.mjs` is the single static support
source for Claude, Grok, Cursor, and Codex. It renders the only public guarantee matrix in README
and the generated `AGENTS.md`; detailed guides link to it, while doctor reports both the supported
profile and repository-specific evidence. Hard hook operations, advisory MCP calls, CI checks,
external required-status merge blocking, and repair re-injection are stated separately. No website
source is maintained in this repository. Runtime/Nest docs and the shipped `/ark-runtime` skill now
label that surface experimental and unnecessary for gate adoption. The docs regression passes with
the full 736/736-test suite; coverage is 92.59% statements/lines, 85.22% branches, and 95.28%
functions. Typecheck, build, JavaScript syntax, architecture, generated parity, module budgets,
package allowlist/dry-run, and the production security audit pass (0 vulnerabilities).

### S07 — Decide the product name before stabilizing new APIs

- **Status:** `done`
- **Decision input:** direct category/name collision with `archgate/cli`

**Implementation**

1. Run package, repository, domain, search, and basic trademark availability checks for 3–5 names.
2. Write an ADR that compares: retain ArkGate with explicit differentiation vs rename before wider
   adoption.
3. Record migration cost for npm package, bins, config filename, skills, website, and GitHub.
4. Choose one outcome. Do not leave the ADR undecided.
5. If rename wins, add a migration sub-plan before `C01`; keep a deprecated compatibility shim for
   at least one major version.

**Acceptance**

- The ADR has an owner, decision date, evidence links, and a final decision.
- New schema/API names in Phase C use the decided identity.
- If the name is retained, positioning explicitly distinguishes the product from Archgate.

**Verify:** documentation review plus package/domain availability evidence. No release is required.

**Decision (2026-07-11):** retain **ArkGate** as the canonical product and `arkgate` as the npm
package. [ADR 0001](docs/adr/0001-product-identity-arkgate.md) records the owner decision, migration
cost, canonical surface table, existing package/repository/site evidence, and the explicit
positioning boundary from the unrelated Archgate CLI. The unpublished local rename experiment was
reversed without changing GitHub, npm, or `arkgate.online`. Phase C therefore continues with
`ark.config.json`, `Ark*` APIs, `ARK_*` environment variables, `ark://` MCP resources, and the
existing command/skill names.

---

## Phase C — create one product core

### C01 — Version and validate `ark.config.json`

- **Status:** `done`
- **Depends on:** `S07`

**Started (2026-07-11):** the first contract fixture matrix covers every published repository
config, every preset factory, and the previous supported major (`v1.19.0`). The initial red tests pin
version metadata, legacy compatibility, and path-specific rejection of unknown keys before the
shared loader is implemented.

**Implementation**

- Add a packaged JSON Schema with `$schema`, `schemaVersion`, defaults, constraints, and unknown-key
  policy.
- Validate configs through one loader used by every surface.
- Add explicit migrations and compatibility tests for all published config examples/presets.
- Export the schema through a stable package subpath and document editor integration.

**Acceptance**

- Every shipped preset and repository config validates against the schema.
- Invalid/unknown fields fail with a path-specific diagnostic.
- A config written by the previous supported major either loads unchanged or receives a deterministic
  migration.
- CLI, MCP, and ESLint cannot parse config differently.

**Verify:** config fixture suite, public JSON snapshots, `npm pack --dry-run`, common merge gate.

**Completed (2026-07-11):** `src/domain/configContract.ts` now owns schema `1.0`, defaults,
constraints, path-specific diagnostics, and the explicit unversioned migration. Its generated CLI
artifact and packaged JSON Schema are drift-checked, while CLI, MCP, ESLint, presets, and runtime
config factories consume the same contract. Every shipped config and preset validates; the prior
`v1.19.0` fixture migrates deterministically without mutation.

**Evidence:** implementation commit `54c475d` passed all 11 checks on draft PR #28. Local
`test:confidence` passed 847/847 tests with 85.32% branch coverage and a 97.79% mutation score
(398/407 killed); the focused contract suite passed 110/110. Typecheck, build, architecture,
generated-artifact, module-budget, package-file, gallery, TypeScript 5.9/6/7, package dry-run, and
production audit gates passed. The Ark contract stayed at 0 violations / 0 warnings before and
after the change.

### C02 — Specify the stable analysis IR and API

- **Status:** `done`
- **Depends on:** `C01`

**Implementation**

- Write the ADR for engine ownership and the intentional self-hosted layer change.
- Define a minimal public API: `loadContract`, `analyzeProject`, `analyzeChange`, and
  `explainViolation` (names may change in the ADR).
- Define versioned IR types for files, layers, resolved/unresolved edges, symbol capability uses,
  evidence, violations, and content/policy hashes.
- Add contract tests before moving scanner implementation.

**Evidence:** `docs/adr/0002-analysis-engine-ownership.md`, `src/domain/analysis.ts`,
`src/kernel/analysis.ts`, and `tests/unit/analysis/analysisApi.test.ts`.

**Acceptance**

- API and IR have one documented owner and one source of truth.
- Results are deterministic for identical content, compiler options, and policy.
- The API accepts in-memory post-edit content required by write hooks.
- No runtime-kernel type leaks into the analysis surface.

### C03 — Move scanning behind the importable engine

- **Status:** `done`
- **Depends on:** `C02`

**Implementation**

- Move existing graph/config/policy evaluation behind the new API without changing verdicts.
- Bundle CLI binaries from the engine instead of maintaining generated pure copies.
- Keep a temporary parity harness comparing old and new engines on the full fixture corpus.
- Delete old implementations only after parity reaches 100% or every intentional difference has an
  approved fixture and changelog entry.

**Evidence:** `src/kernel/analysis.ts` owns graph policy, cycle detection, and configuration
diagnostics. `bin/lib/architecture-scan.mjs` and its MCP callers provide filesystem/compiler facts
to the generated standalone `bin/lib/analysis-engine.mjs`; the bundle contract and drift guard are
documented by ADR 0003 and enforced in CI. Kernel/bundle parity covers project analysis, changes,
strict/soft/off cycles, layer verdict metadata, and configuration diagnostics. The full fixture
corpus passed 858/858 tests after the closure run exposed and fixed Node 26's asynchronous
recursive-watcher `EMFILE` path.

**Acceptance**

- One canonical implementation produces CLI, MCP, and library results.
- Generated domain-to-CLI duplication is removed or limited to a documented build artifact with a
  drift check.
- Full fixture parity is green.
- Module budgets and package smoke tests pass.

### C04 — Complete symbol-aware semantic analysis

- **Status:** `done`
- **Depends on:** `C03`

**Implementation**

- Resolve forbidden capabilities through TypeScript symbols, including aliases and `globalThis`.
- Extract all supported static dependency forms through the compiler API.
- Define fail/warn behavior for unresolved dynamic imports/requires.
- Cover JS/TS, ESM/CJS, type-only edges, path aliases, project references, workspaces, and symlinks.
- Publish the supported soundness envelope as reference documentation.

**Evidence:** `src/kernel/semanticAnalysis.ts` is the canonical symbol-aware extractor consumed by
the importable API, generated CLI bundle, architecture scan, safety diagnostics, and AICodeGate.
The labeled adversarial corpus covers aliases, `globalThis`, static element access, destructuring,
local shadowing, TS/JS, ESM/CJS, type-only forms, unresolved dynamic dependencies, path aliases,
workspaces, and symlinks with 0 unexplained false negatives and 0 labeled false positives. The
soundness boundary and intentional dynamic/runtime exclusions are documented in
`docs/typescript-support.md`. TypeScript 5.9.3/6.0.3/7.0.2 passed, while mutation testing reached
95.07% overall and 92.51% for the semantic module.

**Acceptance**

- Known bypass corpus remains green.
- Adversarial corpus has zero unexplained false negatives and <0.5% labeled false positives.
- TypeScript 5/6/7 compatibility matrix remains green.
- Critical semantic modules meet the mutation threshold from `S02`.

### C05 — Enforce adapter parity

- **Status:** `done`
- **Depends on:** `C04`

**Implementation**

- Make CLI, MCP, ESLint, hook validation, and GitHub Action consume the same engine API.
- Add golden snapshots for identical config/source inputs across every adapter.
- Version public JSON and MCP schemas; changes require compatibility fixtures.
- Remove adapter-specific rule reimplementations.

**Evidence:** `src/domain/adapterContract.ts` defines the public `1.0` result envelope and emits
`schemas/ark.analysis-result.schema.json` plus the standalone CLI helper. CLI JSON, MCP
`structuredContent`, repair-capable hooks, and ESLint reports normalize through that contract.
`src/domain/sourcePolicy.ts` owns publish-rule classification, while ESLint no longer invents
architecture defaults without `ark.config.json`. The golden adapter corpus asserts exact rule ID,
location, severity, and evidence across CLI/MCP/hook/ESLint. GitHub Actions runs the dedicated
`adapter-parity` job, and `tests/fixtures/contracts/ark.analysis-result.v1.json` freezes v1
compatibility. Full coverage passed 875 tests with 85.60% branches; mutation passed at 94.77%.

**Acceptance**

- Same source + contract yields the same rule ID, location, severity, and evidence in every adapter.
- Parity corpus is a required CI job.
- No adapter has a private architecture policy implementation.

### C06 — Isolate runtime from the gate product

- **Status:** `done`
- **Depends on:** `C05`

**Implementation**

- Move runtime/NestJS exports to a separate package or explicitly experimental distribution chosen
  by ADR.
- Remove runtime exports from the gate root in the next major; provide a timed compatibility shim.
- Rename the current “outbox” unless it gains an atomic state+message transaction contract,
  dispatcher leases, and idempotent delivery semantics.
- Define workflow recovery, optimistic versioning, leases, and idempotency before any production
  durability claim.
- Ensure gate-only consumers do not install or bundle runtime code.

**Evidence:** ADR 0004 selects a separate `@arkgate/runtime` 0.x package published only under the
`experimental` tag. ArkGate `3.0.0` builds its stable root from `src/gate.ts`; the root
tarball has no runtime or NestJS bundles, while deprecated `arkgate/runtime` and `arkgate/nestjs`
paths are forwarding shims scheduled for removal in ArkGate 4. The preferred non-transactional
API is `InMemoryEventBuffer`; old outbox names remain deprecated aliases. Recovery, optimistic
versioning, lease, idempotency, atomic-handoff, and fault-matrix requirements are explicit in ADR
0004 and production hardening docs. Gate-only tests passed without a runtime build, and the offline
package smoke installed and imported `arkgate` and `@arkgate/runtime` independently.

**Acceptance**

- Gate CLI/MCP/ESLint tests run without importing runtime modules.
- Package smoke tests prove independent gate and runtime installation.
- Runtime remains labeled experimental until fault/restart matrices pass.
- Root gate package no longer duplicates runtime bundles.

---

## Phase O — make adoption small and honest

### O01 — Replace framework guessing with source/graph-first discovery

- **Status:** `done`
- **Depends on:** `C05`

**Implementation**

- Discover roots from tsconfig/jsconfig, project references, exports, entrypoints, workspaces, and
  conventional `src`/`source` directories.
- Separate production/peer dependencies from dev-only tooling signals.
- Treat library, application, docs, examples, and test packages separately.
- Use actual package/import boundaries before archetype labels.
- Cap confidence and require user confirmation when two recommendations are close or governed
  coverage is projected below 90%.

**Acceptance**

- Ky-like libraries are not classified as API servers because Express is a dev dependency.
- `source/` and workspace package roots are included.
- Zod-like docs packages cannot make the root library a CRUD product.
- Recommendation JSON explains positive and negative evidence without inverted wording.

### O02 — Make `ark start` preview-first

- **Status:** `done`
- **Depends on:** `O01`
- **Partially closes:** `RB-06`

**Implementation**

- Split start into analyze/plan and apply phases.
- Preview exact file creations/edits, projected governed coverage, host guarantees, package changes,
  and unresolved decisions.
- Require explicit `--apply` or interactive confirmation for mutation.
- Exit non-zero without mutation when the requested guarantee cannot be met.
- Keep preview output machine-readable and deterministic.

**Acceptance**

- Default non-interactive execution is read-only unless `--apply` is passed.
- A low-coverage or incompatible plan writes nothing.
- The preview is sufficient to review the complete diff before apply.
- Applying an approved plan produces exactly the previewed mutations.

### O03 — Reduce setup to the active host and five files

- **Status:** `done`
- **Depends on:** `O02`
- **Closes:** `RB-06`

**Implementation**

- Install only the selected/active host by default.
- Replace 13 copied skills per host with one router backed by package/MCP resources.
- Generate at most five project files and less than 25 KB for a normal single-host setup.
- Do not change `package.json` unless `--install` is explicit; preserve original formatting when a
  change is requested.
- Never write repo-local Codex prompts that Codex will not load.

**Acceptance**

- Single-host fixture meets the file/byte budget.
- Default setup does not modify product source or unrelated package scripts.
- Re-run is idempotent with a zero diff.
- Host removal/update has an explicit, reversible path.

**Local evidence (2026-07-12):** `tests/unit/static-check/o03CompactStart.test.ts` passes
14/14 cases across Claude, Grok, Cursor, Codex, Windsurf, Cline, Copilot, Kiro, Roo, Continue,
and Gemini. The fixture proves preview/apply stays within the five-file / 25 KB budget, leaves
product source and a user-owned script unchanged, does not change `package.json` without
`--install`, rejects multi-host compact selection, avoids repo-local Codex prompts, and supports
explicit remove/re-add. `README.md` and `docs/agent-guide.md` now document the exact budget,
explicit package opt-in, and reversible `--remove-host` path. The focused O03/install/docs suites
pass 159/159; the local confidence gate passes 892/892 tests at 85.26% branch coverage and 94.76%
mutation. Typecheck, JavaScript syntax, generated-artifact drift, module-budget, package-file,
strict architecture, and build gates pass locally.

**Merge evidence (2026-07-12):** PR [#41](https://github.com/pedroknigge/arkgate/pull/41) used
signed commit `a20f851` (GitHub SSH verification: valid), passed all required `build`, `CodeQL`,
and `Semgrep CE` checks plus the Node/TypeScript/parity matrix, and was squash-merged as
`105cd3985aa0f360f881e992dc894fd8aaf231b4`. `RB-06` is closed.

### O04 — Build clean-room onboarding fixtures

- **Status:** `done`
- **Depends on:** `O03`

**Implementation**

- Add small/medium/large fixtures for library, API, frontend, and monorepo shapes.
- Run each through Claude, Grok, Cursor, and Codex host profiles.
- Test npm, pnpm, and yarn workflow generation without network-dependent installs.
- Assert preview/apply parity, governed coverage, strict CI result, and idempotency.

**Acceptance**

- Every supported matrix cell produces a green merge gate.
- Hard/advisory write capability matches the canonical host matrix.
- No fixture reports Enforce below 90% governed coverage.
- No host setup requires files for an unrelated host.

**Local evidence (2026-07-12):** `npm run test:onboarding-matrix` passed all 12 offline
fixture shards (144 cells: library, API, frontend, and monorepo at small/medium/large across
Claude, Grok, Cursor, Codex, npm, pnpm, and yarn). Every cell proved read-only preview,
preview/apply path parity, green strict merge, equal projected/measured 100% governed coverage,
idempotency, and no unrelated host files. The canonical capability checks confirm hard write and
repair only for Claude/Grok, and advisory write plus CI merge gate for Cursor/Codex. The matrix
uses only temporary lockfile signals and does not execute a package-manager install. Typecheck,
JavaScript syntax, and strict Ark configuration checks pass locally. CI now shards the 12 fixture
groups. PR [#43](https://github.com/pedroknigge/arkgate/pull/43) used GitHub-verified signed
commit `771343d`, passed all 12 `Onboarding <shape>/<size>` CI shards, the full `build` gate
(6m57s), security, compatibility, and adapter-parity checks, and was squash-merged as
`9c762c9be9e1606017b66b3e40573b0dca00dfa6`.

---

## Phase V — prove the product outside the happy path

### V01 — Add real cold, warm, and incremental budgets

- **Status:** `done`
- **Depends on:** `C05`, `O04`

**Implementation**

- Correct the benchmark so warm runs use cache and report peak RSS.
- Add realistic imports, aliases, symlinks, workspaces, and mixed TS/JS to generated fixtures.
- Implement content-hash incremental analysis through `analyzeChange`.
- Record 1k/10k/50k p50/p95 and enforce non-flaky regression budgets in CI.

**Acceptance targets**

- 10k-file changed-file analysis p95 <100 ms on the documented CI runner.
- 50k-file cold scan p95 ≤30 s on `ubuntu-latest`; the prior 5 s aspiration is deferred to a dedicated engine-optimization milestone.
- Warm/incremental results prove cache hits and are not aliases for `--no-cache`.
- Peak memory is recorded and bounded.

**Closure evidence:** PR #45 (`d1400ca`) passed the full CI matrix, including `Performance budgets`
on `ubuntu-latest`, where the committed 1k/10k/50k report met latency, cache-hit, and RSS budgets.

### V02 — Expand mutation, property, and fuzz assurance

- **Status:** `done`
- **Depends on:** `C04`

**Implementation**

- Extend mutation testing across config loading, graph edges, host capabilities, baselines, and
  workflow failure boundaries.
- Add property tests for path normalization, layer matching, and baseline occurrence keys.
- Add bounded fuzzers for JSON config, globs, module specifiers, hook payloads, and filesystem paths.
- Store every discovered regression as a minimized permanent fixture.

**Acceptance**

- Critical mutation score remains ≥90%.
- Fuzz jobs have deterministic seeds, time budgets, and artifact capture.
- No crash, traversal escape, or silent bypass remains unresolved.

**Closure evidence (2026-07-12):** `fast-check` is dev-only; `npm run test:property`,
`npm run test:fuzz`, and `npm run test:fuzz:extended` passed with fixed seeds, bounded time,
and `reports/fuzz` artifacts across config JSON, globs, module specifiers, hook payloads, and
filesystem paths. Hook traversal attempts leave external files untouched. `npm run test:mutation` recorded 93.75% config loading, 91.19%
graph edges, 99.58% host capabilities, 100% baselines, and 95.83% workflow-failure boundaries
(95.43% aggregate). The full coverage suite passed 115 files / 908 tests (91.09% statements,
85.47% branches); `npm run typecheck`, `npm run check:js`, `npm run check:architecture`,
`npm run security:audit`, and `npm run test:package-isolation` also passed. The realpath-root
counterexample is retained as a minimized filesystem fixture.

### V03 — Run the external adoption matrix

- **Status:** `done`
- **Depends on:** `O04`, `V01`, `V02`

**Implementation**

- Pin at least 12 public repository SHAs across four product shapes, four agent hosts, three package
  managers, and small/medium/large trees.
- Run from clean clones using a reproducible harness. Do not commit third-party source.
- Record preview size, files changed, projected/actual governed coverage, install time, first-green
  time, false blocks, bypasses, manual decisions, and final CI state.
- Publish machine-readable results plus a short human report.

**Acceptance**

- All required matrix dimensions are represented.
- No open P0/P1 false green or destructive onboarding issue.
- Median time to a valid merge gate is <5 minutes excluding dependency installation.
- Median governed coverage after approved apply is ≥90%; lower cases remain Adapt and are explained.

**Closure evidence (2026-07-12):** `eval/adoption/manifest.v1.json` pins 12 distinct public
MIT-licensed repository SHAs across all required shapes, hosts, package managers, and sizes. The
packed candidate `a52fcbeebf9f6eaae7d458101809616e142e2658` was applied from clean temporary
clones; the versioned results record three green merge gates, nine explicit `Adapt` cases, 589 ms
median first-green time excluding dependency installation, 93% median governed coverage, and zero
open P0/P1 issues. No third-party source is committed. PR #47 passed the full required CI matrix,
including build, CodeQL, Semgrep, onboarding, fuzz, and performance checks.

### V04 — Tighten package and release assurance

- **Status:** `done`
- **Depends on:** `C06`, `V03`

**Implementation**

- Set package size/file budgets for the gate and runtime distributions.
- Remove duplicated bundles, unnecessary maps/docs, and stale compatibility files.
- Generate an SBOM release asset and verify checksums, provenance, signed tags, and packed contents.
- Require build, coverage, mutation, parity, adoption smoke, CodeQL, and Semgrep checks on the release
  commit.
- Use weekly/biweekly stable releases; use canary tags for intermediate slices.

**Acceptance targets**

- Gate package packed size ≤250 KB and unpacked size ≤1 MB, unless an evidence-backed exception is
  documented.
- Runtime is absent from gate-only smoke imports and bundles.
- Release dry-run and installed-tarball smoke tests pass from a clean checkout.
- No open high vulnerability/code-scanning alert at release time.

**Closure evidence (2026-07-13):** V04 removes published source maps and adds a versioned artifact
gate that builds both tarballs, enforces budgets, validates independent installs, and emits
CycloneDX SBOMs, SHA-256 checksums, and packed-content manifests. The experimental runtime is
bounded at 160 KB packed, 700 KB unpacked, and 20 files. The gate remains at 375 KB packed and
1.33 MB unpacked under an explicit 400 KB/1.4 MB exception: its standalone CLI/MCP distribution
cannot yet meet the 250 KB/1 MB target; this must be reconsidered before ArkGate 4. PR #48 passed
build, CodeQL, Semgrep, fuzz, onboarding, package isolation, and performance CI.

### V05 — Independent beta exit audit

- **Status:** `done`
- **Depends on:** every prior item

Run the audit from a clean checkout by a reviewer who did not implement the final slice.

**Binary exit gate**

- Zero open P0/P1 findings.
- Common merge gate and all dedicated CI jobs green on the exact candidate SHA.
- Active-host capability matrix verified on all four hosts.
- Known bypass, mutation, fuzz, parity, performance, and external adoption gates green.
- Package artifacts verified and current security alerts empty.
- Documentation and website claims match measured capabilities.
- Public repository is clean, protected, and aligned with the published artifact.

If any condition fails, the product stays beta. Do not convert the result into a compensating score.

---

## Success metrics

| Dimension | Exit target |
|---|---:|
| Known semantic bypasses | 0 |
| False-green incomplete analyses | 0 |
| Differential adapter verdict/evidence agreement | 100% of parity-capable corpus cells; incomplete compatibility modes never green |
| Labeled false-positive rate | <0.5% |
| Critical mutation score | ≥90% |
| Mutants in declared critical ranges with `NoCoverage` | 0 |
| Host guarantee accuracy | 100% of matrix cells |
| Single-host setup | ≤5 files and <25 KB |
| Unconsented package/source rewrites | 0 |
| Governed coverage after approved adoption | median ≥90% |
| Installed protected-green adoption | ≥5/6 of the full preregistered matrix (minimum 12 cells); every Adapt remains in the denominator |
| Hook latency at 10k files | p95 ≤65 ms |
| Warm doctor latency at 10k files | p95 ≤500 ms |
| Canonical resolved-facts analysis latency at 10k files | p95 ≤100 ms, analysis-only with resolution and validated oracle explicitly excluded |
| 50k cold scan | p95 ≤30 s on `ubuntu-latest`; 5 s deferred to a dedicated engine-optimization milestone |
| External matrix | ≥12 pinned repos, 4 hosts, 3 package managers |
| Causal first-valid effect | ≥24 held-out pairs × 3 independent sessions/arm; restricted-mean Ark/control ≤0.80 and paired 95% CI upper bound <1.0; completion regression ≤5 pp |
| Retained adoption | ≥8 consented projects; ≥3/4 active at D30 and ≥5/8 at D90 over the full cohort; missing follow-up counts not retained |
| Open P0/P1 at beta exit | 0 |

**Phase Z evidence rule:** the V03/V05/B01 records below remain historical attempt evidence. The
post-3.7.0 audit proved that `firstGreen`, false-block/bypass counts, and reviewer independence did
not establish the outcomes their acceptance text required. They cannot support a current release
claim until `Z08` repairs the causal measurement and `Z09` closes `RB-11` with retained and
independent evidence. This does not delay the corrective-release lanes above.

**Attempt evidence (2026-07-13):** `scripts/beta-exit-audit.mjs` and
`eval/beta-exit/audit-schema.v1.json` record a reproducible binary decision. The 12-cell balanced
public matrix at `eval/beta-exit/b775193d310bd964938453a4349393e4f3c4564a/public-matrix/` covered
three repository shapes, four active hosts, three package managers, and four size bands. It found
zero open P0/P1 findings and a 565.5 ms median first-green time, but only 7% median governed
coverage (two green cells and ten requiring adaptation), versus the required 90%. The generated
`audit.json` therefore records `fail`; its independent-review condition is also `unverified` because
no reviewer declaration exists. ArkGate remains beta. B01 is now closed with the evidence below;
V05 still requires an independent reviewer to audit a frozen candidate from a clean checkout.

**Post-B01 re-audit (2026-07-13):** Candidate `42c77f62384e40ffb71e16388e6530f34253f9b9`
has a fresh, SHA-bound twelve-cell adoption result at
`eval/adoption/results/42c77f62384e40ffb71e16388e6530f34253f9b9/summary.json`: 97% median
governed coverage, 583 ms median first-green, all four hosts, and zero P0/P1. Its binary report at
`eval/beta-exit/42c77f62384e40ffb71e16388e6530f34253f9b9/audit.json` passes candidate identity,
adoption-to-candidate binding, host profiles, and release artifacts. It deliberately fails because
the independent-review declaration is unverified. No beta or stable-release claim is authorized.

**Current V05 re-audit (2026-07-13):** Candidate
`93d4107d9df6cb64ec862655301780c32619ddb0` passed the full local common merge gate, including
`93.05%` mutation and strict Ark validation. Its fresh SHA-bound twelve-cell adoption result at
`eval/adoption/results/93d4107d9df6cb64ec862655301780c32619ddb0/summary.json` records 97%
median governed coverage, all four hosts, and zero P0/P1. The audit at
`eval/beta-exit/93d4107d9df6cb64ec862655301780c32619ddb0/audit.json` passes candidate identity,
adoption binding, host profiles, release artifacts, and the independent review recorded as
`pedroknigge`. The exact candidate CI, branch protection, Dependabot, and code-scanning checks
also passed. V05 is done; this authorizes beta exit, but does not itself publish or tag a stable
release.

### B01 — Stabilize representative approved adoption

- **Status:** `done`
- **Depends on:** V05 failure evidence

Identify and close the product gaps that leave real, approved public projects outside governed
scope. Preserve the existing 90% median governed-coverage threshold and the no-unconsented-rewrite
rule; do not narrow the matrix, exclude failing shapes, or lower the exit criterion to obtain a pass.

**Acceptance**

- The V05 public matrix remains balanced across its recorded shapes, hosts, package managers, and
  size bands.
- The same or a more demanding pinned public matrix reaches median governed coverage of at least
  90% after approved adoption.
- Every adaptation is previewed, explicitly approved, and leaves product source and unrelated files
  unchanged.
- The focused adoption evidence and common merge gate pass before V05 is re-run.

**Closure evidence (2026-07-13):** Candidate `69cf823e05cc2a158ba963c71e904fe404fb04bc`
was evaluated by `eval/adoption-run.mjs` against the twelve pinned public cells in
`eval/beta-exit/public-matrix.v1.json`. The matrix remains balanced at three cells per shape and
host, four per package manager and size band. `eval/adoption/results/69cf823e05cc2a158ba963c71e904fe404fb04bc/summary.json`
records 97% median governed coverage, 583 ms median first-green time, and zero P0/P1 findings.
All adaptations were previewed before apply and recorded no bypasses. The focused adoption harness,
the full common merge gate, and strict Ark check passed on the candidate. Ten cells remain `Adapt`
because their local strict merge fails; this is retained as P2 audit evidence, not suppressed or
reclassified as green. At that point V05 remained blocked pending its independent review and every
remaining exit gate; the later current re-audit above records its completed decision.

---

## Historical appendix

The following capabilities were shipped before this roadmap reset. They remain supported unless a
task above explicitly migrates or deprecates them, but historical completion is not a substitute for
the new exit evidence.

### Shipped product foundation

- Machine-readable layers/rules contract, manifest, strict CI check, coverage, baselines, and
  concentration guards.
- Plan, fix classification, conservative autoPatch, `ark_prepare_write`, hook repair payloads, and
  doctor write-path reporting.
- Claude, Cursor, Codex, and Grok templates; hard hooks currently exist only where the host supports
  them.
- Hexagonal, layered, feature-sliced, monorepo, UI-surface, vertical-slice, DDD, clean, and onion
  presets.
- TypeScript 5/6/7 compatibility work, ESLint adapter, HTML reports, day-zero origin, skills, and
  migration from `ark-runtime-kernel`.
- Signed annotated release tags, npm provenance, checksums, pinned actions, CodeQL, Semgrep, and
  package allowlist checks.

### Completed historical tracks

- `W1`–`W6`: constrained write, prepare-write, loop-cost harness, repair payload, doctor awareness,
  and proof-gated port suggestion.
- `R1`–`R10`: pure helper sources/generation, module decomposition, baseline/remediation surfaces,
  Codex multi-project handling, runtime decomposition/honesty, and product site.
- Track P: architecture preset and peer-isolation work.

### Canonical product identity

| Surface | Current value |
|---|---|
| Product | ArkGate |
| npm | `arkgate` |
| Preferred bins | `arkgate`, `arkgate-check`, `arkgate-mcp` |
| Compatibility bins | `ark`, `ark-check`, `ark-mcp` |
| Config | `ark.config.json` |
| Website | [arkgate.online](https://www.arkgate.online/) |
| Repository | [pedroknigge/arkgate](https://github.com/pedroknigge/arkgate) |

S07 retains this identity. Any future proposal to rename it requires a new ADR and must not be
folded into Phase C implementation work.

---

## Next implementation session

```text
Item: `Z07` (`doing`) — deliver a measured warm incremental control plane without semantic drift
Next action: record the like-for-like one-shot warm-doctor baseline, then implement the smallest identity-keyed snapshot path and exact invalidation/parity corpus against the frozen targets
Release lanes: Z01+Z02 may ship a stable corrective patch; Z04 may ship parity; Z06 closes the installed journey; Z07–Z09 gate only 10x/causal/retention/independent-close claims
Parked unchanged: Y06, Y07, Y09, and Y10 retain their named field gates and must not start as collateral Z work
Runtime parked: K01 retains confirmed experimental intra-process commit gaps outside Phase Z and does not block gate-package corrective releases
Released baseline: npm arkgate@3.7.0 (Phase Y close from PR #78)
Released baseline: npm arkgate@3.6.0 (Phase X close from PR #76, squash 5d368f5)
Released baseline: npm arkgate@3.5.0 + MCP registry 3.5.0 isLatest (X01 from PR #71; X02+X03 + release train from PR #72)
Released baseline: npm arkgate@3.4.0; Phase U shipped from PR #69 (slice 1 from #68)
Released baseline note: MCP registry 3.2.0 published (isLatest) alongside npm/GitHub
Retained proof: T01–T05 commits, /review autofixes, fixed eval, confidence/release gates, exact-SHA CI/Security
Released baseline: npm arkgate@3.2.0; Phase W shipped from PR #66 (Phase T from PR #64)
```
