# Roadmap — Architecture Co-pilot for AI TypeScript

**What this is:** a **machine-readable architecture contract** for TypeScript, enforced when
AI agents write code and again before merge — plus a **co-pilot** that plans and drives safe
cleanup without lying about coverage.

**What this is not:** a web framework, ORM, job runner, or “runtime kernel” product. An optional
runtime API may exist; it is not the wedge.

**Website:** [arkgate.online](https://www.arkgate.online/)  
**npm:** [`arkgate`](https://www.npmjs.com/package/arkgate) (product **ArkGate**; formerly `ark-runtime-kernel`).  
**Product shape:** write gate (`arkgate-mcp`) · CI gate (`arkgate-check`) · plan / goal / loop · agent skills.

**How to use this file:** implement **one item at a time**, in order (**Q1 → Q2 → …**). Do not start
the next item until the current item’s **Definition of Done** is green. Finished foundation work
lives under [Shipped](#shipped-context); do not treat completed tracks as “next.”

---

## North star

**Shipped:** **Gate → Guide → Co-pilot** (through 2.x — write gate, CI, plan/loop/autopilot, honest coverage).

**Current product arc:** **Trust 95+ — prove the gate, repair loop, and adoption path at release quality**

| Stage | Meaning |
|-------|---------|
| **Close confidence gaps** | Raise regression confidence on the code that enforces, repairs, packages, and releases ArkGate; thresholds ratchet upward rather than resetting. |
| **Prove the whole enforcement chain** | Show that human edits, agent writes, CI configuration, branch protection, and published artifacts cannot silently bypass the contract. |
| **Prove it outside this repository** | Publish reproducible adoption evidence across real greenfield and brownfield TypeScript projects, hosts, package managers, and repository sizes. |

Track W shipped the constrained-write and verified-repair primitives. The bottleneck is now
**confidence outside the happy path**: global coverage floors are met, this repo dogfoods a
repair-capable write path (Q2 still requires multi-host proof), branch protection is external
state, and field evidence is thinner than the package surface. Trust 95+ closes those gaps
before adding another broad capability.

One contract, two entries (unchanged):

| Entry | Who | Path |
|-------|-----|------|
| **Newbie** | Builders who ship with agents, not architecture jargon | `start` + autopilot skill |
| **Expert** | Leads who want precise contract + CI | `init` / plan / fix / strict check |

Three **operating modes** (status lights — not settings):

- **Suggest** — shape a thin/greenfield tree  
- **Adapt** — raise governed coverage / match real layout; freeze only real debt  
- **Enforce** — gates honestly hold; clean plan with ~0% governed is *not* enforce  

### Hard lines (never planned)

- **No general codemod / AST-rewrite engine** — agents edit; the gate decides what may land.  
- **No silent auto-apply of judgment-heavy refactors** (“big rocks” always proposed).  
- **No false-green “healthy”** with no real governed coverage.  
- **False mechanical-safe worse than extra human approval** — precision corpus stays at **0** false-safe.

### Audience strategy (natural path)

1. **Now** — best architecture gate + co-pilot for **TypeScript + AI agents**.  
2. **Now (Track Q)** — raise measurable release confidence to **95+/100** without weakening the gate.
3. **Then** — demand-driven teams UX (baseline trend, reports) and verified transforms only when proof + evals allow.
4. **Later** — org-scale monorepo / control-plane only if demand pulls.  
5. **Identity** — **ArkGate / `arkgate` locked** (predecessor package deprecated).

We do **not** optimize first for “Meta/Google monorepo platform.” We optimize for **agents that
write TS in real product repos** — fewer wasted turns, fewer contract bypasses, honest green.

---

## Execution backlog (implement one by one)

Status legend: `todo` · `doing` · `done`

Work in this order. Each item is a shippable slice (PR-sized or small PR stack).

### Track W — Constrained write → verified repair (**done** — W1–W6 published)

Primary bet after Gate → Guide → Co-pilot. Reuse `classifyRemediation` and existing
mechanical-safe kinds; do **not** invent a general codemod. Expand safe kinds only after W1–W3
instrument the write boundary and loop metrics. **All W items are `done`.**

| # | Status | Item | Why now | Definition of Done |
|---|--------|------|---------|-------------------|
| **W1** | `done` | **Write-boundary autoPatch for existing mechanical-safe kinds** | Safe fixes already classified in `--plan` almost never run at PreToolUse / `validate_code` — agents re-draft instead | `validate_code` and/or hook path can return an **`autoPatch`** (patched source + `remediationKind` + confidence) for the four shipped mechanical-safe kinds only (`type-only-import-move`, `pure-type-file-relocate`, `import-type-from-pure-type-module`, `import-type-of-type-exports`). Post-patch validation is green or the patch is discarded. Labeled precision corpus: **0 false mechanical-safe**. JSON additive fields OK within major. **Shipped:** `bin/lib/auto-patch.mjs` + `validate_code`/`--hook` (import-type single-file kinds revalidate green; multi-file kinds stay classified without silent write). Write path allows `import type` edges (value imports still hard-block). |
| **W2** | `done` | **`ark_prepare_write` (place + constrain + validate + autoPatch)** | Agents invent path and content before learning the legal surface | MCP tool (and documented CLI/hook shape if needed) accepts `filePath?` / `description?` / `source` and returns path, layer, mayImport / mustNotImport / forbiddenGlobals, `valid`, optional `autoPatch`, optional `judgmentBrief` (fixClass + one decision), optional content identity for host commit. Composes existing `ark_place` + gate + classifier — not a second contract. Unit/integration tests on real entry points. **Shipped:** MCP `ark_prepare_write` + `bin/lib/prepare-write.mjs` (contentHash, judgmentBrief, autoPatch composition). |
| **W3** | `done` | **Loop-cost eval harness (turns / tokens / CHEATED)** | Comparative eval measures tree quality, not cost of self-correction | Live or fixture-measured harness records at least **turns-to-green**, optional tokens-to-green, and **CHEATED** for a documented case set (type-only + one judgment case). Report artifact under `eval/` (or documented path). CI may keep static oracle; live agent remains optional/nightly. README or `eval/README.md` documents how to run. Baseline numbers captured once so later W items can show ÷10 targets. **Shipped:** `eval/loop-cost-run.mjs`, `npm run eval:loop-cost`, baseline medianTurnsTypeOnly=**1**, cheatedRate=**0** (type-only autoPatch + judgment case). |
| **W4** | `done` | **Opt-in hook “repair” payload for hosts** | Exit-2 reject alone forces full re-reason on hosts that could re-inject a patch | Documented opt-in mode: on deny, emit structured repair hint / `autoPatch` (e.g. Grok-style JSON or stderr contract) **without** silently writing the file. Default remains hard block. Host install templates mention the mode. Regression test for payload shape. **Shipped:** `--hook-repair` / `ARK_HOOK_REPAIR=1` → `ARK_REPAIR_JSON` + `ARK_AUTOPATCH_JSON` on stderr; Grok deny JSON `autoPatch` only in repair mode; install templates Claude/Grok include `--hook-repair`; default `--hook` prose-only hard block. |
| **W5** | `done` | **Doctor / adoption: prepare-write awareness** | Enforce mode should show whether the write path is reject-only or repair-capable | `ark-check --doctor` (JSON stable additive) surfaces whether agent gates / MCP expose prepare-write or autoPatch capabilities (or a clear “reject-only” gap). Docs one-liner for leads. **Shipped:** `doctor.writePath` + adoption gap ids `write-path-*`; human doctor “Write path (agent)” section. |
| **W6** | `done` | **Verified structural transform (port-proof) — eval-gated only** | Brownfield judgment debt (`port-inversion` / inject-port) is the second-order burn-down; must not ship without proof | At most **one** narrow transform (e.g. verbatim infra call extraction to adapter + port inject) classified mechanical-safe **only if**: static proof of behavior preservation, post-gate green, labeled eval cases, **0 false-safe** on full precision corpus. Value/require/dynamic/mixed without proof stay **judgment**. No general codemod engine. **Do not start until W1–W3 are done** (or explicitly skipped with a written reason in the PR). **Shipped:** `port-proof-inject-binding` prove+transform (`bin/lib/port-proof.mjs`) + scan `portProofEligible`; remains **judgment** for auto-apply (signature/arity change is not program-wide behavior-preserving). Write-path autoPatch stays import-type only. Labeled eval case; corpus honest. |

**Order rule:** W1 → W2 → W3 first (write boundary + measurement). W4–W5 can parallelize after W2. **W6 only after W1–W3.**

---

### Track Q — Trust 95+ (**active next**)

The goal is not a vanity score or 95% coverage everywhere. It is a release gate that earns
**95+/100** through independent evidence across correctness, bypass resistance, adoption,
maintainability, documentation, performance, runtime reliability, and supply-chain security.

Current baseline (**2.12.x** / Q1–Q2 done, Q3–Q9 partial): **~91–92/100** (estimate). Global Vitest
coverage floors met on the broad include set; self-hosted write path is **repair-capable** (Q2).
Remaining Trust score is limited by external adoption matrix (Q4), full Diátaxis (Q7), required
branch-protection on default branch (Q3 external), large-N scale CI budgets (Q5), and Q10 audit.

| # | Status | Item | Definition of Done |
|---|--------|------|-------------------|
| **Q1** | `done` | **Coverage + mutation ratchet** | **Done:** Vitest floors statements/lines **≥80%**, functions **≥85%**, branches **≥85%** on the **broad non-gamed include** (`src/**` + `bin/lib/**` + `bin/ark-shared.mjs`; only process-entry shells excluded). Critical modules (write-path-detect, auto-patch, prepare-write, safety-diagnostics, baseline-key, graph-cycles) enforce **≥95%** branch. Two consecutive green `npm run test:coverage` runs. agent-gates modularization: facade ≤600 LOC; modules including mcp-adoption/deploy-path each ≤600. |
| **Q2** | `done` | **Repair-capable dogfood** | **Done:** `doctor.writePath.mode = repair` on this tree; Claude + Grok hooks use `--hook-repair`; tests drive `bin/ark-mcp.mjs` deny → `ARK_REPAIR_JSON`/`autoPatch` → host re-inject → revalidation exit 0. Reject-only remains supported without `--hook-repair`. |
| **Q3** | `doing` | **Weakest-link enforcement proof** | **Local done:** doctor adoption gaps via `bin/lib/weakest-link.mjs` (missing CI, no ark-check job, config drift, pre-commit missing); maintained `templates/hooks/pre-commit-ark`; optional `ARK_DOCTOR_GITHUB=1` → `reportGithubBranchProtection` (honest unavailable / not-protected). **Remaining:** default-branch required-check green on GitHub admin state; release checklist hard-fail when protection absent in prod org. |
| **Q4** | `todo` | **External adoption matrix** | Run reproducible clean-room adoption on ≥ **12** real or fixture-backed repos spanning ≥4 archetypes, 4 agent hosts, npm/pnpm/yarn, greenfield + brownfield, and small/medium/large trees. Publish time-to-Enforce, turns-to-green, false-block, CHEATED, and manual-intervention rates. No P0/P1 false green remains open. Scaffold only: `eval/adoption-matrix.md`. |
| **Q5** | `doing` | **Performance + scale budgets** | **Partial:** `scripts/ark-scale-bench.mjs` + `npm run bench:scale` measure real ark-check cold/warm p50/p95 on generated trees; vitest runs n=20. **Remaining:** publish 1k/10k/50k + symlink/monorepo CI budgets that fail non-flaky regressions. |
| **Q6** | `doing` | **Surface parity + maintainability** | **Partial:** `scripts/check-module-budgets.mjs` + `npm run check:module-budgets` (LOC budgets on orchestration modules); surface parity checks for preferred bins/hooks. **Remaining:** full CLI/MCP/ESLint/Action/config schema contract suite + public JSON snapshots. |
| **Q7** | `todo` | **Documentation completeness** | Every stable surface changed since 2.10 has reference + how-to coverage; strict/doctor/safety/Action/repair each have a runnable clean-room example. Contributor setup and release instructions are smoke-tested. Diátaxis coverage map has no zero-coverage public surface and no stale architecture diagrams. |
| **Q8** | `doing` | **Runtime failure assurance** | **Partial:** fault-injection tests for compensation failure audit, cancellation-ignoring timeout, outbox retry attempts + clear (restart/durability boundary); prior retry/timeout coverage retained. **Remaining:** broader duplicate-delivery + multi-store restart matrix; CI job dedicated to fault suite. |
| **Q9** | `doing` | **Security + supply-chain assurance** | **Partial:** `docs/threat-model.md` (T1–T10); `scripts/verify-package-files.mjs` + `npm run check:package-files`; existing signed tags / provenance / security.yml. **Remaining:** SBOM release asset, fuzz suite for config/glob/AST/path, zero-high-alert hard gate wired to release. |
| **Q10** | `todo` | **Independent 95+ exit audit** | Re-run an adversarial review from a clean checkout and score the weighted rubric below. Exit only at ≥95 with no open P0/P1, all required GitHub checks green on the shipped SHA, npm/package smoke green, and every exception documented with owner + expiry. |

**Order rule:** Q1–Q3 are the hard foundation. Q4 starts once the instrumentation from Q1/Q2
is stable. Q5–Q9 may run in parallel after Q3. Q10 is the only exit gate.

---

### Track D — Growth (demand-driven — **not** the next product bet)

These stay useful; they are **not** a substitute for Track Q.

| # | Status | Item | Definition of Done |
|---|--------|------|-------------------|
| **R11** | `todo` | **Team baseline burn-down UX** | Report/export shows baseline debt trend; package-scoped debt optional. |
| **R12** | `todo` | **Framework policy packs** | Only if filename overlays prove insufficient in field; otherwise skip. |
| **R13** | `todo` | **TS 7.1+ programmatic API** | When Microsoft ships stable API: extend `usableTypescript`, keep matrix green. |
| **R14** | `todo` | **Optional locale packs** | English remains canonical; extra locales optional. |
| **R15** | `todo` | **Secondary package for runtime** | Only if `arkgate/runtime` subpath is not enough for consumers who want zero kernel in tree. |

### Later / only if demand pulls

- Incremental checks + ownership-aware contracts for huge monorepos  
- Deeper agent control plane (org policy inheritance, audit bus)  
- Polyglot — only if the TS agent wedge is solid  
- Full Diataxis docs site (in-repo `docs/` + [arkgate.online](https://www.arkgate.online/) remain canonical until demand pulls)

---

## Implementation rules (every item)

1. **One item at a time** — branch/PR title includes the id (`Q1: coverage + mutation ratchet`).
2. **Tests first or with** — behavior change without tests is incomplete. CLI/MCP: real entry + fixtures.  
3. **Dogfood** — `npm run test:run`, `npm run typecheck`, `npm run check:architecture` green before merge.  
4. **No hard-line breaks** — no general codemod engine; no silent judgment auto-apply; no false-green health.  
5. **Changelog** — user-visible changes under `CHANGELOG.md` Unreleased or next version.  
6. **Status** — set the item to `doing` when started, `done` when DoD is met.  

### Suggested next sessions

```text
Session → Q3  finish external branch-protection required-check on default branch
Session → Q5  wire 1k/10k/50k scale budgets into CI (non-flaky)
Session → Q6  full surface parity snapshots (CLI/MCP/ESLint/Action)
Session → Q4  external adoption matrix (≥12 repos) evidence pack
Session → Q7  Diátaxis coverage map + clean-room examples
Session → Q8–Q9  remaining fault matrix + SBOM/fuzz release gates
Session → Q10 independent 95+ exit audit
```

---

## How we measure “good”

| Audience | Signal |
|----------|--------|
| Newbie | Completes `start` → autopilot without learning “hexagonal”; no false “you’re done” |
| Expert | Trusts deny reasons; baseline/coverage honesty; no gate bypass culture |
| Team | CI red on real debt only; governed% trends up; agents self-correct on write **with fewer turns** |
| Package | Name and docs describe gate/co-pilot — never “runtime kernel” as the product |

### Operational KPIs (Track W)

| KPI | Intent |
|-----|--------|
| **False mechanical-safe rate** | Must stay **0** on labeled precision corpus |
| **Turns-to-green** (eval) | Median agent turns to clear a gated violation — target **÷10** vs baseline after W1–W3 |
| **Tokens-to-green** (optional) | Correction cost under gate — target large reduction when autoPatch applies |
| **CHEATED rate** | Contract/baseline/config edits to silence the gate — drive toward **0** on corpus |
| **autoPatch applicability** | Share of write-gate failures in fixtures that receive a valid patch (grows with W1, not with lying) |
| **Eval case count** | New safe kinds only with labeled cases (W6 included) |
| **Time-to-Enforce** (optional) | Fixture greenfield/brownfield: steps from `start` to doctor Enforce |

Foundation KPIs still hold: layer-matcher drift guard (R1), no `ark-check` entry re-bloat past orchestration budget (R3).

### Trust 95+ weighted exit score

| Dimension | Weight | Exit evidence |
|-----------|-------:|---------------|
| Contract + enforcement integrity | 25 | Q2–Q3 green; no bypass or false-green P0/P1 |
| Correctness + regression confidence | 20 | Q1 thresholds + mutation tests green |
| Security + release integrity | 20 | Q9, signed/provenance/checksum/SBOM gates green |
| Developer experience + repair loop | 15 | Repair-capable dogfood and measured turns-to-green |
| External adoption proof | 10 | Q4 matrix published with no open critical failure |
| Maintainability + documentation | 10 | Q5–Q7 parity, budgets, and doc coverage green |

Score ≥95 is necessary but not sufficient: any open P0/P1, unsigned release, non-required CI
gate, or unverified package artifact is an automatic fail.

---

## Shipped (context)

Completed work stays here for history. **Do not implement these as “next.”**

### Through 2.0.x — Gate, guide, co-pilot

- Write gate + CI + optional runtime; minimal runtime deps (`typescript` JS-API host)  
- Governed %, baselines, concentration guards, layer `exclude`, mature-repo routing  
- Framework overlays (Nest/Next/express/library), **TypeScript 5 / 6 / 7** matrix  
- Mechanical-safe: type-only edges · pure-type file relocate · `import type` of pure-type modules · named type-exports from mixed modules · W6 `port-proof-inject-binding` (proof-gated)  
- Playbook, `--recommend`, enthusiast track, policy packs, gallery starters  
- `--plan` · `start` · autopilot/loop skills · HTML report + origin under `.ark/reports/`  
- Hosts: Claude Code · Cursor · Codex · Grok Build · `/ark-*` skills  

### Foundation tracks R1–R9 (all done)

| # | Item |
|---|------|
| **R1** | Single source of truth for layer globs (`src/domain/layerMatch.ts` → generated CLI + drift CI) |
| **R2** | Package surface = product wedge (`docs/package-surface.md`, preferred `arkgate/runtime`) |
| **R3** | `ark-check` entry orchestration-only; scan in `bin/lib/*` |
| **R4** | Typed pure core (remediation, baselineKey, layerMatch) + `check:cli-pure` |
| **R5** | Labeled eval corpus (≥15 cases; 16 shipped) |
| **R6** | Fourth mechanical-safe kind `import-type-of-type-exports` |
| **R7** | Codex multi-project MCP DX + doctor gap (+ host-aware deferred home debt when session ≠ Codex) |
| **R8** | EventBus publish pipeline decomposition |
| **R9** | Runtime durability stance (InMemory reference honesty) |
| **R10** | Product site [arkgate.online](https://www.arkgate.online/) |

### Track P — Architecture presets & pattern depth (complete)

Peer isolation, vertical-slice + DDD presets, monorepo depth, FSD/Next honesty, clean/onion aliases, Nest modular guidance, skills + recommend/doctor copy, peerIsolation eval case. Demand-deferred only: thin Next colocation preset, CQRS folder patterns, multi-tenant policy notes — pull with field evidence.

### 2.4.x – 2.9.x highlights

- Adoption completeness (doctor hosts/MCP/codex/origin)  
- ESLint plugin parity with CI (`arkgate/eslint`)  
- Identity cutover to **ArkGate / `arkgate`**  
- One-flow UX: `start` → `/ark-autopilot` → `doctor`  
- Deploy-path adoption gaps; Next/monorepo honesty  

### Post-2.12 hygiene (docs + skill policy)

- `/ark-upgrade` and doctor: **active host first**; Codex `$CODEX_HOME` non-temp debt is
  **deferred** when the session host is known and not Codex (temp MCP roots stay fail-closed)  


### Trust foundation (through 2.11.0)

- Signed annotated release tags, npm provenance, release checksum, security workflows, no install lifecycle scripts
- Release tag verification fails closed by default (`ARK_ALLOW_UNSIGNED_RELEASE_TAG` remains emergency-only)
- `--strict` safety diagnostics and required-gate checks are shipped; Q3 adds external branch-protection proof

---

## Identity — ArkGate (`arkgate`) — locked

| | |
|--|--|
| **Product** | **ArkGate** — architecture co-pilot / write+CI gate for AI TypeScript |
| **npm** | `arkgate` |
| **CLI** | `arkgate`, `arkgate-check`, `arkgate-mcp` |
| **Compat bins** | `ark`, `ark-check`, `ark-mcp` (one major) |
| **Config** | `ark.config.json` (unchanged for now) |
| **Skills** | `/ark-*` |
| **Predecessor** | `ark-runtime-kernel` (npm **deprecated**) |
| **Website** | [arkgate.online](https://www.arkgate.online/) |
| **GitHub** | [pedroknigge/arkgate](https://github.com/pedroknigge/arkgate) |

Same codebase; not a greenfield rewrite.

---

## Not planned

- Reimplementing Temporal/Restate-style orchestrators  
- Growing production deps beyond the intentional TypeScript gate host  
- Becoming a web framework, job runner, ORM, or deploy platform  
- Ad-hoc layer guesses outside playbook/presets  
- **General codemod/AST-rewrite engine** — agents edit; the gate decides what lands  
- **Silent auto-apply of judgment refactors**  
- **Runtime kernel as the product** — optional `arkgate/runtime` only  
- **Org control-plane / FAANG monorepo platform** as the immediate epic  

---

## Contributing

Product site: [arkgate.online](https://www.arkgate.online/).  
Issues and PRs: [github.com/pedroknigge/arkgate](https://github.com/pedroknigge/arkgate).

For onboarding misfires, include archetype id and `ark-check --recommend --json`.

**After 2.12.0 ships: start implementation at Q2.** Mark status in this file when you pick up or finish an item.
