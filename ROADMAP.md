# Roadmap — Architecture Co-pilot for AI TypeScript

**What this is:** a **machine-readable architecture contract** for TypeScript, enforced when
AI agents write code and again before merge — plus a **co-pilot** that plans and drives safe
cleanup without lying about coverage.

**What this is not:** a web framework, ORM, job runner, or “runtime kernel” product. An optional
runtime API may exist; it is not the wedge.

**Website:** [arkgate.online](https://www.arkgate.online/)  
**npm:** [`arkgate`](https://www.npmjs.com/package/arkgate) (product **ArkGate**; formerly `ark-runtime-kernel`).  
**Product shape:** write gate (`arkgate-mcp`) · CI gate (`arkgate-check`) · plan / goal / loop · agent skills.

**How to use this file:** implement **one item at a time**, in order (**W1 → W2 → …**). Do not start
the next item until the current item’s **Definition of Done** is green. Finished foundation work
lives under [Shipped](#shipped-context); do not treat completed tracks as “next.”

---

## North star

**Shipped:** **Gate → Guide → Co-pilot** (through 2.x — write gate, CI, plan/loop/autopilot, honest coverage).

**Next product arc:** **Constrained write → Verified repair**

| Stage | Meaning |
|-------|---------|
| **Constrained write** | The write path places, constrains the legal surface, and **auto-repairs only mechanical-safe** violations *at the boundary* (not reject-and-retry forever). |
| **Verified repair** | Proven, narrow structural transforms (e.g. port-proof extraction) may become mechanical-safe **only** with static proof + labeled evals — never a general codemod engine. |

The bottleneck is no longer “do we have a gate?” — it is the **agent write loop**: draft → block → re-reason → sometimes cheat the contract. The product multiplies when that loop collapses to **prepare → (autoPatch \| judgmentBrief) → commit**.

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
2. **Next (this backlog)** — **Write Protocol**: constrain + auto-repair safe writes; measure loop cost (turns / tokens / CHEATED).  
3. **Then** — verified structural transforms only when proof + evals allow; teams (baseline UX, reports).  
4. **Later** — org-scale monorepo / control-plane only if demand pulls.  
5. **Identity** — **ArkGate / `arkgate` locked** (predecessor package deprecated).

We do **not** optimize first for “Meta/Google monorepo platform.” We optimize for **agents that
write TS in real product repos** — fewer wasted turns, fewer contract bypasses, honest green.

---

## Execution backlog (implement one by one)

Status legend: `todo` · `doing` · `done`

Work in this order. Each item is a shippable slice (PR-sized or small PR stack).

### Track W — Constrained write → verified repair (**active**)

Primary bet after Gate → Guide → Co-pilot. Reuse `classifyRemediation` and existing
mechanical-safe kinds; do **not** invent a general codemod. Expand safe kinds only after W1–W3
instrument the write boundary and loop metrics.

| # | Status | Item | Why now | Definition of Done |
|---|--------|------|---------|-------------------|
| **W1** | `done` | **Write-boundary autoPatch for existing mechanical-safe kinds** | Safe fixes already classified in `--plan` almost never run at PreToolUse / `validate_code` — agents re-draft instead | `validate_code` and/or hook path can return an **`autoPatch`** (patched source + `remediationKind` + confidence) for the four shipped mechanical-safe kinds only (`type-only-import-move`, `pure-type-file-relocate`, `import-type-from-pure-type-module`, `import-type-of-type-exports`). Post-patch validation is green or the patch is discarded. Labeled precision corpus: **0 false mechanical-safe**. JSON additive fields OK within major. **Shipped:** `bin/lib/auto-patch.mjs` + `validate_code`/`--hook` (import-type single-file kinds revalidate green; multi-file kinds stay classified without silent write). Write path allows `import type` edges (value imports still hard-block). |
| **W2** | `done` | **`ark_prepare_write` (place + constrain + validate + autoPatch)** | Agents invent path and content before learning the legal surface | MCP tool (and documented CLI/hook shape if needed) accepts `filePath?` / `description?` / `source` and returns path, layer, mayImport / mustNotImport / forbiddenGlobals, `valid`, optional `autoPatch`, optional `judgmentBrief` (fixClass + one decision), optional content identity for host commit. Composes existing `ark_place` + gate + classifier — not a second contract. Unit/integration tests on real entry points. **Shipped:** MCP `ark_prepare_write` + `bin/lib/prepare-write.mjs` (contentHash, judgmentBrief, autoPatch composition). |
| **W3** | `todo` | **Loop-cost eval harness (turns / tokens / CHEATED)** | Comparative eval measures tree quality, not cost of self-correction | Live or fixture-measured harness records at least **turns-to-green**, optional tokens-to-green, and **CHEATED** for a documented case set (type-only + one judgment case). Report artifact under `eval/` (or documented path). CI may keep static oracle; live agent remains optional/nightly. README or `eval/README.md` documents how to run. Baseline numbers captured once so later W items can show ÷10 targets. |
| **W4** | `todo` | **Opt-in hook “repair” payload for hosts** | Exit-2 reject alone forces full re-reason on hosts that could re-inject a patch | Documented opt-in mode: on deny, emit structured repair hint / `autoPatch` (e.g. Grok-style JSON or stderr contract) **without** silently writing the file. Default remains hard block. Host install templates mention the mode. Regression test for payload shape. |
| **W5** | `todo` | **Doctor / adoption: prepare-write awareness** | Enforce mode should show whether the write path is reject-only or repair-capable | `ark-check --doctor` (JSON stable additive) surfaces whether agent gates / MCP expose prepare-write or autoPatch capabilities (or a clear “reject-only” gap). Docs one-liner for leads. |
| **W6** | `todo` | **Verified structural transform (port-proof) — eval-gated only** | Brownfield judgment debt (`port-inversion` / inject-port) is the second-order burn-down; must not ship without proof | At most **one** narrow transform (e.g. verbatim infra call extraction to adapter + port inject) classified mechanical-safe **only if**: static proof of behavior preservation, post-gate green, labeled eval cases, **0 false-safe** on full precision corpus. Value/require/dynamic/mixed without proof stay **judgment**. No general codemod engine. **Do not start until W1–W3 are done** (or explicitly skipped with a written reason in the PR). |

**Order rule:** W1 → W2 → W3 first (write boundary + measurement). W4–W5 can parallelize after W2. **W6 only after W1–W3.**

---

### Track D — Growth (demand-driven — **not** the next product bet)

These stay useful; they are **not** a substitute for Track W.

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

1. **One item at a time** — branch/PR title includes the id (`W1: write-boundary autoPatch`).  
2. **Tests first or with** — behavior change without tests is incomplete. CLI/MCP: real entry + fixtures.  
3. **Dogfood** — `npm run test:run`, `npm run typecheck`, `npm run check:architecture` green before merge.  
4. **No hard-line breaks** — no general codemod engine; no silent judgment auto-apply; no false-green health.  
5. **Changelog** — user-visible changes under `CHANGELOG.md` Unreleased or next version.  
6. **Status** — set the item to `doing` when started, `done` when DoD is met.  

### Suggested next sessions

```text
Session → W1  write-boundary autoPatch (4 mechanical-safe kinds)
Session → W2  ark_prepare_write (place + constrain + validate + patch)
Session → W3  loop-cost eval (turns / tokens / CHEATED)
Session → W4  opt-in hook repair payload
Session → W5  doctor prepare-write awareness
Session → W6  verified port-proof transform (only after W1–W3)
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

---

## Shipped (context)

Completed work stays here for history. **Do not implement these as “next.”**

### Through 2.0.x — Gate, guide, co-pilot

- Write gate + CI + optional runtime; minimal runtime deps (`typescript` JS-API host)  
- Governed %, baselines, concentration guards, layer `exclude`, mature-repo routing  
- Framework overlays (Nest/Next/express/library), **TypeScript 5 / 6 / 7** matrix  
- Mechanical-safe: type-only edges · pure-type file relocate · `import type` of pure-type modules · named type-exports from mixed modules (`import-type-of-type-exports`)  
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
| **R7** | Codex multi-project MCP DX + doctor gap |
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

### Trust (partial)

- npm provenance, security workflows, no install lifecycle scripts  
- Release tag verify fail-closed by default (`ARK_ALLOW_UNSIGNED_RELEASE_TAG` override documented)  

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

**Start implementation at W1.** Mark status in this file when you pick up or finish an item.
