# Roadmap — Architecture Co-pilot for AI TypeScript

**What this is:** a **machine-readable architecture contract** for TypeScript, enforced when
AI agents write code and again before merge — plus a **co-pilot** that plans and drives safe
cleanup without lying about coverage.

**What this is not:** a web framework, ORM, job runner, or “runtime kernel” product. An optional
runtime API may exist; it is not the wedge.

**npm:** [`arkgate`](https://www.npmjs.com/package/arkgate) (product **ArkGate**; formerly `ark-runtime-kernel`).  
**Product shape:** write gate (`arkgate-mcp`) · CI gate (`arkgate-check`) · plan / goal / loop · agent skills.

**How to use this file:** implement **one item at a time**, in order (R1 → R2 → …). Do not start
the next item until the current item’s **Definition of Done** is green. Shipped history and
identity stay below for context.

---

## North star

**Gate → Guide → Co-pilot** (shipped through 2.0.x+).

One contract, two entries:

| Entry | Who | Path |
|-------|-----|------|
| **Newbie** | Builders who ship with agents, not architecture jargon | `start` + autopilot skill |
| **Expert** | Leads who want precise contract + CI | `init` / plan / fix / strict check |

Three **operating modes** (status lights — not settings):

- **Suggest** — shape a thin/greenfield tree  
- **Adapt** — raise governed coverage / match real layout; freeze only real debt  
- **Enforce** — gates honestly hold; clean plan with ~0% governed is *not* enforce  

**Hard lines (never planned):** codemod engine; auto-applying judgment-heavy “big rocks”;
false-green “healthy” with no real coverage.

### Audience strategy (natural path)

1. **Now** — best architecture gate + co-pilot for **TypeScript + AI agents**.  
2. **Next** — deeper safe autonomy + evals (newbies don’t stall; experts don’t distrust).  
3. **Then** — teams (CI, baselines, reports, light ownership).  
4. **Later** — org-scale monorepo / control-plane only if demand pulls.  
5. **Identity** — **ArkGate / `arkgate` locked** (predecessor package deprecated).

We do **not** optimize first for “Meta/Google monorepo platform.” We optimize for **agents that
write TS in real product repos**.

---

## Execution backlog (implement one by one)

Status legend: `todo` · `doing` · `done`

Work in this order. Each item is a shippable slice (PR-sized or small PR stack).

### Track A — Path-hot debt (foundation)

These fix the scorecard risks that slow every later feature.

| # | Status | Item | Why now | Definition of Done |
|---|--------|------|---------|-------------------|
| **R1** | `done` | **Single source of truth for layer globs** | Dual impl (`bin/ark-layer-match.mjs` + `src/domain/layerMatch.ts`) is parity-tested but not one source — every matcher fix risks drift | One canonical module; the other is **generated** or compiled from it. CI fails if they diverge without regenerate. Parity tests stay as safety net. Docs no longer claim “two handwritten SoTs”. |
| **R2** | `done` | **Package surface = product wedge** | Main export still looks like a runtime kernel; docs say gates are the product | Stable surface policy written (CLI flags JSON, MCP tools, `ark.config` schema = stable; kernel runtime = opt-in). Prefer subpath `arkgate/runtime` (or thin main + re-export path). README “Optional runtime” links the subpath. No breaking remove of root re-exports in the same minor without deprecation notice. |
| **R3** | `done` | **`ark-check` entry slim-down (phase 2)** | 2.6 split extracted libs; entry still ~2.4k LOC | `bin/ark-check.mjs` is orchestration only (parse args → load config → run scan → present). Scan graph, rule runners, and report wiring live in `bin/lib/*` modules **each &lt; ~500 LOC**. Existing CLI flags and JSON shapes unchanged. Full `test:run` + `check:architecture` green. |
| **R4** | `done` | **Typed pure core for CLI pure functions** | Gate value lives in untyped `.mjs`; hard to refactor safely | At least: layer match (R1), violation enrich/classify, and one more pure helper are TypeScript (or generated from TS) with unit tests **without** full process spawn. Zero new production deps. |

### Track B — Co-pilot quality (product depth)

| # | Status | Item | Why now | Definition of Done |
|---|--------|------|---------|-------------------|
| **R5** | `done` | **Grow labeled eval corpus** | Classifier + autopilot need more than a handful of cases | ≥ **15** eval cases under `eval/cases/` covering: type-only move, Nest overlay, Next `core/**` bag, monorepo `frontend/`, wrong-layer, domain forbidden global, baseline ratchet, pure-type relocate. `npm run eval:agent` (or documented subset) runs in CI or nightly without flaking. Each case has expected fixClass / pass-fail label. **Done:** 16 cases; `npm run eval:corpus` + `evalCorpus.test.ts`; live agent optional/nightly. |
| **R6** | `done` | **Broaden `mechanical-safe` (eval-gated)** | Co-pilot pays only when safe auto-depth grows without lying | New mechanical-safe kinds only land with labeled evals and **zero false mechanical-safe** on the corpus. Still deferred without static proof: verbatim infra relocation of value modules. Bias unchanged: false “safe” &gt; extra human approval. **Done:** fourth kind `import-type-of-type-exports` (`namedBindingsTypeOnly`); labeled case + precision corpus; value/require/dynamic/mixed-value stay judgment. |
| **R7** | `done` | **Codex multi-project MCP DX** | Home config last-wins breaks multi-repo agents | Documented + implemented path so multi-project Codex (or equivalent host) does not silently overwrite MCP/gates. Doctor flags the bad state. Regression test or fixture for the config shape. **Done:** secondary `ark_<slug>` without `--force`; doctor gap `codex-home-multi-project`; docs absolute-path multi-project section; force rebinds primary. |

### Track C — Runtime honesty (opt-in kernel)

Only after A is stable enough that gate work isn’t blocked.

| # | Status | Item | Why now | Definition of Done |
|---|--------|------|---------|-------------------|
| **R8** | `todo` | **EventBus decomposition** | 872 LOC god object; high regression risk | Publish pipeline split into cohesive modules (e.g. intercept → contract → observed-flow → policy → history/outbox). Public `createEventBus` API unchanged. Integration tests for order of enforcement still pass. |
| **R9** | `todo` | **Runtime durability stance** | Only InMemory stores exist | Either (a) one reference durable adapter (e.g. file/SQLite) for outbox **or** audit with tests, **or** (b) explicit “reference InMemory-only; not production durability” in README + JSDoc on store interfaces. Prefer (b) unless demand pulls (a). |

### Track D — Growth (not prerequisites)

Start only when R1–R7 are done or explicitly skipped with a written reason.

| # | Status | Item | Definition of Done |
|---|--------|------|-------------------|
| **R10** | `todo` | **Docs site** | Deployed site from existing `docs/` (enthusiast + agent-guide + demos). Canonical English. |
| **R11** | `todo` | **Team baseline burn-down UX** | Report/export shows baseline debt trend; package-scoped debt optional. |
| **R12** | `todo` | **Framework policy packs** | Only if filename overlays prove insufficient in field; otherwise skip. |
| **R13** | `todo` | **TS 7.1+ programmatic API** | When Microsoft ships stable API: extend `usableTypescript`, keep matrix green. |
| **R14** | `todo` | **Optional locale packs** | English remains canonical; extra locales optional. |
| **R15** | `todo` | **Secondary package for runtime** | Only if R2 subpath is not enough for consumers who want zero kernel in tree. |

### Later / only if demand pulls

- Incremental checks + ownership-aware contracts for huge monorepos  
- Deeper agent control plane (org policy inheritance, audit bus)  
- Polyglot — only if the TS agent wedge is solid  

---

## Implementation rules (every item)

1. **One item at a time** — branch/PR title includes the id (`R3: slim ark-check entry`).  
2. **Tests first or with** — behavior change without tests is incomplete. CLI: real binary + temp fixtures.  
3. **Dogfood** — `npm run test:run`, `npm run typecheck`, `npm run check:architecture` green before merge.  
4. **No hard-line breaks** — no codemod engine; no silent judgment auto-apply; no false-green health.  
5. **Changelog** — user-visible changes under `CHANGELOG.md` Unreleased or next version.  
6. **Status** — set the item to `doing` when started, `done` when DoD is met (and strike through the row if you prefer).  

### Suggested first three sessions

```text
Session 1 → R1  layerMatch single source + CI drift guard  ✅ done
Session 2 → R2  package surface policy + runtime subpath           ✅ done
Session 3 → R3  ark-check entry orchestration-only split           ✅ done
Session 4 → R4  typed pure core (remediation + baselineKey)        ✅ done
Session 5 → R5  labeled eval corpus (≥15 cases + static precheck)  ✅ done
Session 6 → R6  broaden mechanical-safe (import-type-of-type-exports) ✅ done
Session 7 → R7  Codex multi-project MCP DX (secondary table + doctor)  ✅ done
```

Next: **R8** (EventBus decomposition) when Track C starts — or R9 durability stance.

---

## How we measure “good”

| Audience | Signal |
|----------|--------|
| Newbie | Completes `start` → autopilot without learning “hexagonal”; no false “you’re done” |
| Expert | Trusts deny reasons; baseline/coverage honesty; no gate bypass culture |
| Team | CI red on real debt only; governed% trends up; agents self-correct on write |
| Package | Name and docs describe gate/co-pilot — never “runtime kernel” as the product |

### Operational KPIs (track as work lands)

| KPI | Intent |
|-----|--------|
| **False mechanical-safe rate** | Must stay **0** on labeled corpus when R6 lands |
| **Eval case count** | Grow with R5; don’t ship new safe kinds without cases |
| **`ark-check.mjs` LOC** | Budget after R3: treat re-bloat past ~500 orchestration LOC as a regression |
| **Layer matcher drift** | After R1: CI red if dual artifacts diverge |
| **Time-to-Enforce** (optional) | Fixture greenfield/brownfield: steps from `start` to doctor Enforce |

---

## Shipped (context)

### Through 2.0.x — Gate, guide, co-pilot

- Write gate + CI + optional runtime; minimal runtime deps (`typescript` JS-API host)  
- Governed %, baselines, concentration guards, layer `exclude`, mature-repo routing  
- Framework overlays (Nest/Next/express/library), **TypeScript 5 / 6 / 7** matrix  
- Mechanical-safe: type-only edges · pure-type file relocate · `import type` of pure-type modules · **R6** named type-exports from mixed modules (`import-type-of-type-exports`)  
- Playbook, `--recommend`, enthusiast track, policy packs, gallery starters  
- `--plan` · `start` · autopilot/loop skills · HTML report + origin under `.ark/reports/`  
- Hosts: Claude Code · Cursor · Codex · Grok Build · `/ark-*` skills  

### 2.4.x – 2.6.x highlights

- Adoption completeness (doctor hosts/MCP/codex/origin)  
- ESLint plugin parity with CI (`arkgate/eslint`)  
- Identity cutover to **ArkGate / `arkgate`**  
- `bin/lib/*` modularization (phase 1); **R1:** canonical `src/domain/layerMatch.ts` → generated `bin/ark-layer-match.mjs` + `check:layer-match` drift guard  
- **R2:** `docs/package-surface.md` + preferred subpath **`arkgate/runtime`** (root re-exports kernel for compat)  
- **R3:** `ark-check` entry orchestration-only; scan pipeline in `bin/lib/{scan-files,config-warnings,ts-resolve,ast-scan,graph-cycles,architecture-scan}.mjs`  
- **R4:** typed pure core — `src/domain/{remediation,baselineKey,layerMatch}.ts` → generated CLI load paths + `check:cli-pure`  
- **R5:** labeled eval corpus — 16 cases under `eval/cases/`; `npm run eval:corpus` + unit test; live agent optional  
- **R6:** fourth mechanical-safe kind `import-type-of-type-exports`; dual-space + side-effect targets stay judgment  
- **R7:** Codex multi-project MCP — `bin/lib/codex-home.mjs`; hashed secondary slug; doctor gap  




- Deploy-path adoption gaps (lint/types before host build)  
- One-flow UX: `start` → `/ark-autopilot` → `doctor`; Next/monorepo honesty (2.6.1)  

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
| **GitHub** | [pedroknigge/arkgate](https://github.com/pedroknigge/arkgate) |

Same codebase; not a greenfield rewrite.

---

## Not planned

- Reimplementing Temporal/Restate-style orchestrators  
- Growing production deps beyond the intentional TypeScript gate host  
- Becoming a web framework, job runner, ORM, or deploy platform  
- Ad-hoc layer guesses outside playbook/presets  
- **Codemod/AST-rewrite engine** — agents edit; the gate decides what lands  
- **Silent auto-apply of judgment refactors**  

---

## Contributing

Issues and PRs: [github.com/pedroknigge/arkgate](https://github.com/pedroknigge/arkgate).

For onboarding misfires, include archetype id and `ark-check --recommend --json`.

**Start implementation at R1.** Mark status in this file when you pick up or finish an item.
