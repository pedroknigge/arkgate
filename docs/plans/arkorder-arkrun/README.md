# ArkOrder × ArkRun — one activation model, one runtime story

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [ArkOrder plan](../arkorder/README.md) ·
> [ADR index](../../adr/README.md)

**Status:** shipped on tree in **4.8.5** (`XP01`–`XP08` done; prepared, not published).<br>
**Slug:** `arkorder-arkrun`<br>
**Kind:** epic / cross-plane convergence<br>
**Prefix:** `XP` (cross-plane)<br>
**Last updated:** 2026-08-31<br>
**Does not** close `K01` / `Z09`. **Does not** merge the two planes.

---

## 0. The finding that comes before any feature

Two adopters, in two separate sessions, with no contact between them, reached the same sentence —
*"ArkOrder, no documentation"* — and then each designed a wish-list. **Most of what they asked for
already ships.**

| what they asked for | what exists today | since |
|---|---|---|
| "escalation as a first-class concept" | `IngestResult = IngestAbsorb \| IngestEscalate`, carrying `reason` | 4.8.0 |
| "hierarchical composition without an omniscient parent" | `Projector = (release, sigma) => Projection` — an explicit projection at the boundary | 4.8.0 |
| "validation of a badly designed slow parameter" | `DEFAULT_MAX_XI_KEYS = 7`, `ARKORDER_TOO_MANY_PARAMS`, `ARKORDER_EMPTY_XI`, `ARKORDER_NESTED_XI`, `ARKORDER_GENERIC_UPDATE` | 4.8.0–4.8.3 |
| "valved proposals, never direct mutation" | `ProposeResult { nextXi, blastRadius, invalidations }` | 4.8.0 |
| "a typed cell schema" | `XiSchema` / `XiPropertySchema` | 4.8.0 |

A surface nobody can find is a surface that does not exist. This is the same disease as `--plan`,
which 4.8.4 had to fix by making a passing run point at it: **built, good, unreachable.**

> **XP01 outranks every feature in this plan.** If we build the missing pieces before writing
> `docs/arkorder.md`, the next adopter will ask for those too.

---

## 1. What each plane actually owns

Measured against `schemas/ark.config.schema.json` and `src/domain/`, not from memory.

| | ArkOrder | ArkRun |
|---|---|---|
| **Config keys** | `mode`, `planeRoots`, `managedLayers`, `maxXiKeys`, `xiKeys` | `mode`, `compositionRoots`, `kernelRoots`, `managedLayers`, `requireDeclarations`, `ignoreDirectNewForErrors` |
| **Diagnostics** | 13 `ARKORDER_*` | 14 `ARKRUN_*` |
| **Core model** | slow parameters (ξ), releases, projections, ingest/absorb/escalate, propose | composition roots, declarations (emit/handle/depend), transport, information package |
| **Runtime concepts** | none — it is a library plus static sensors | transport kinds (`local` / `localBlocking` / `broker`), delivery, component lifetimes, doctor, inspector, graph |

### The convergence is already half-built

Both extras already share **`mode`** and **`managedLayers`**. They diverge on one axis only: what
they call their roots — `compositionRoots` / `kernelRoots` versus `planeRoots`.

So the hypothesis that opened this plan is measurably right, and cheaper than expected: **the
activation model is already the same shape. It is simply not named as one, not documented as one,
and not tested as one.** A user adopting the second plane re-learns a vocabulary they already know.

---

## 2. What was missing — and which plane owns it

Shipped in **4.8.5**. Degraded mode stays rejected.

| ask | owner | 4.8.5 |
|---|---|---|
| **Information budget** — declare what a cell may **not** observe | **ArkOrder** | `informationBudget.cannotObserve`; `ARKORDER_INFORMATION_BUDGET` |
| **Signal freshness** | **ArkOrder**, on `sigma` only | `sigmaMaxAgeMs` / `σ.freshUntil`; `ARKORDER_XI_TTL` / `ARKORDER_STALE_SIGMA` |
| **Shadow / replay / compare** | **ArkRun** ([ADR 0033](../../adr/0033-arkorder-runtime-half-is-arkrun.md)) | `shadowInformationPackage` / `compareInformationPackages` / `replayInformationPackages` |
| **Decision provenance / audit** | **ArkRun** | in-memory compare of information packages; not a durable audit log |
| **Human as an escalation target** | **ArkOrder** | `IngestEscalate.target` including `human` |
| **Degraded mode** (`continue-safe`, `pause-ambiguous`, `fail-closed`) | **nobody — reject** | it defends against a risk that does not exist. ArkOrder is a library and a set of static sensors, not a service. Nothing can be "down". |

---

## 3. The discussion this plan existed to force

**Is ArkOrder's runtime half actually ArkRun's?**

**Yes.** [ADR 0033](../../adr/0033-arkorder-runtime-half-is-arkrun.md) is accepted.
ArkOrder stays a library plus static sensors. Shadow / replay / provenance / compare
live on ArkRun information packages, in-memory. Both adopters designed a runtime for
ArkOrder because they could not see ArkRun; that was documentation, not design.

---

## 4. Items

| id | item | depends on | status |
|---|---|---|---|
| `XP01` | `docs/arkorder.md` — what ArkOrder is, what it already answers, and that it is a library plus sensors, not a service. Every row of §0 gets a named API. | — | done |
| `XP02` | Measure and document the shared activation model: one page covering `mode` + `managedLayers` for both planes, and a decision on the roots naming split (`planeRoots` vs `compositionRoots`/`kernelRoots`). Rename or alias, or write down why they must differ. | XP01 | done |
| `XP03` | Decide §3 with evidence: does the runtime half belong to ArkRun? Produce an ADR, not an opinion. | XP01, XP02 | done |
| `XP04` | Information budget on ArkOrder — declare what a scale may not observe; a sensor when a projection exceeds it. | XP03 | done |
| `XP05` | `sigma` freshness, explicitly not on ξ, with a sensor for a "slow" parameter that changes per transaction. | XP03 | done |
| `XP06` | Escalation target, including `human`, on `IngestEscalate`. | XP03 | done |
| `XP07` | Shadow / replay / compare — in whichever plane XP03 chooses. Nothing near money until this exists. | XP03 | done |
| `XP08` | One activation surface in `ark-check --sensors`: both planes, same table, same tier vocabulary (4.8.4 already lists all 22 sensors across the three planes — this finishes the job in config). | XP02 | done |

---

## 5. What we will not build

Recorded because both adopters explicitly warned against it, and they are right:

- another event bus
- a general workflow engine
- a permissions engine
- a central store holding operational state
- a DSL duplicating rules that already live in the domain, the database, or ArkRules
- a coordinator required on every request

> If a "slow parameter" changes with every click, payment or recipient, it is not an order
> parameter — it is centralised operational state wearing the name.

---

## 6. Adjacent, not part of this epic

**ArkRules cannot express a configuration invariant** — "this value, in this file, must be this".
A disabled `package.json` script, a pinned `search_path`, a non-empty baseline: none are expressible
today, so they survive as test ratchets outside the contract. It is the same shape of answer
`peerIsolation` forced for the universe wall before 4.8.4 gave it `sharedRoots`.

It belongs to the ArkRules line, not here, but it shares this epic's thesis: **rules that live in
prose — `CLAUDE.md`, `AGENTS.md` — are not read when the agent changes or the context is lost, and
prose rots on its own.** Contract-as-data is the point; which file it lives in is the detail.
