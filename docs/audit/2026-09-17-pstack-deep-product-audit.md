# Deep pstack audit — ArkGate core + add-ons

**Date:** 2026-09-17  
**Auditor:** Cloud agent (pstack how / figure-it-out; explore before prescribe)  
**Tree:** `main` tip `2aaf79b` — includes merged [#271](https://github.com/pedroknigge/arkgate/pull/271) (closes [#269](https://github.com/pedroknigge/arkgate/issues/269))  
**Package:** tree `arkgate@4.8.17` · npm `dist-tags.latest` **4.8.17** (live `npm view`)  
**Scope:** Contener · Guiar · Ordenar across core Layers + ArkRules + ArkRun + ArkOrder, plus skills vs product capacity  
**Method:** falsifiable questions first; claim → evidence → VERIFIED / NOT VERIFIED / INCONCLUSIVE  
**This PR:** report only. No product code, no version bump, no issue close.

North star (binding): make deterministic (not agent-judgment) what AI may write and in what shape. Sacred: dual write+PR gate; host-neutral; doctor one-light; add-ons opt-in silent when absent.

Companion trail: [2026-09-17-pstack-deep-product-audit.tsv](2026-09-17-pstack-deep-product-audit.tsv).

---

## 1. Executive summary

- **Contener (Layers / dual gate) is the real product and is mostly honest.** Write hook hard-denies governed illegal imports and unclassified included writes (exit 2). Merge line is `arkgate-check --strict-merge` as a required GitHub status. Same-candidate parity holds for the full analysis engine; the hook is a snippet + ratchet, so write vs CI is **not** identical. That is documented, not hidden.
- **Guiar (doctor one-light) works on the compact surface.** Fresh `start --apply` puts **#1** on “make CI required.” Compact doctor prints one Primary next action. The sacred “one light” breaks when JSON + human are mixed, and when #271’s dual-match heuristic fires on *intentional* Domain+Tooling dual-lists (this mother tree: 24 files, #1 says “not `api/**`”).
- **Ordenar is two products wearing one star.** North-star copy says “order leftover mess.” The first-class door `/ark-order` is the billing-valve extra. Leftover folders stay `/ark-explore` then `/ark-autopilot`. Compact doctor and `start` preview **advertise ArkOrder while the extra is off.** That is tested product copy, and it violates a strict reading of “silent when absent.”
- **ArkRules is not optional in the start path.** `start --apply` writes `arkRules` + four `arkrules/*.json` templates (advisory). Run and Order stay off. Stranger UX: “three optional add-ons” is a lie for Rules.
- **Skills cover 100% of ADR 0036 capacity (four planes + Contener · Guiar · Ordenar).** `npm run check:agent-skills` passes (14 names, 9 first-class, 5 stubs). They do **not** cover 100% of the 16-row package surface. Dashboard, ESLint, `--watch`, and compact-day-zero-without-skills are doors the CLI has and the catalog does not. ArkRules has no dedicated `/ark-rules` (by design). That asymmetry is the bug the bar asked for.
- **Biggest 1-minute stranger risks (open):** [#270](https://github.com/pedroknigge/arkgate/issues/270) packed README still says npm latest is 4.8.16 (false; fix in flight [#272](https://github.com/pedroknigge/arkgate/pull/272)); [#268](https://github.com/pedroknigge/arkgate/issues/268) “Start in one minute” leads with `npm install -D arkgate` (hard-fail on `workspace:*`) and install-fail recovery still dumps host pnpm maturity internals.
- **#269 / #271 closed the monorepo Domain vacuum.** Live preset on a `api/` + `client/` + `packages/schema` fixture: DomainModel has **no** `api/**` / `client/**`. Residual: tree-wide `**/domain/**` remains; doctor repair copy is hardcoded to “not `api/**`.”
- **Maintainer identity is stale in more than README.** `ROADMAP.md` still has **two** `doing` rows (`RL817` and `UC01`) while npm already published 4.8.17 and UC01’s code landed in [#233](https://github.com/pedroknigge/arkgate/pull/233). Claims-matrix identity is still 4.8.13 / 4.8.11. Dual-truth is a process smell, not only a packed-README bug.
- **Parked sacred residuals are honest:** `Z09` / `RB-11` and `K01` (durability) stay parked. Soft hosts stay advisory. Do not board those as engineering `doing`.
- **Health one-liner:** Contener is shippable and tightening. Guiar is good if you trust #1 — and #1 can still lie. Ordenar first-contact is loud on purpose and therefore not silent. Skills match the *declared* capacity table, not every CLI surface.

---

## 2. Core ArkGate (Contener)

### 2.1 How it works

Always-on plane after adopt: **import rules** (which folder may import which). Four-layer mother contract in `ark.config.json` (DomainModel / Kernel / Tooling / FrameworkAdapters). Consumer start typically stamps a 4-layer product preset plus advisory ArkRules.

```text
agent write  →  PreToolUse hook / MCP prepare   →  deny (exit 2) or allow
PR merge     →  arkgate-check --strict-merge     →  required GitHub status
human stuck  →  arkgate-check --doctor           →  one status light + #1
```

| Path | Authority | Evidence |
|------|-----------|----------|
| Hook launcher | `bin/ark-mcp.mjs` → `bin/ark-mcp-runtime.mjs` | Hook + MCP; mother tree needs `dist/` for MCP (AGENTS.md) |
| Deny copy | `formatWriteGateDeny` in `bin/lib/mcp-hook-payload.mjs` | Two lines: `blocked …` + `Next:` + rule id |
| Unclassified write | `unclassifiedIncludedWriteDeny` same file | `CONFIG_UNCLASSIFIED_FILES`, next `/ark-place` |
| Merge CLI | `bin/ark-check.mjs --strict` / `--strict-merge` | `--strict` = `strictConfig` + `requireGates` + `strictMerge` (`bin/lib/check-args.mjs`) |
| Mother CI | `.github/workflows/ci.yml` → `npm run check:architecture` | `package.json`: `ark-check --strict` |
| Consumer Action | `action.yml` | Pinned npm: `--strict-config` only; checkout Action: `--strict` |
| Empty analysis | `bin/lib/analysis-completeness.mjs` `ANALYSIS_COVERS_NO_FILES` | Verdict path only; `--doctor` / `--coverage` / `--plan` diagnose |

### 2.2 Dual-gate honesty

**Claim:** same tree + same candidate + same policy → same write vs CI verdict.

**Verdict: NOT VERIFIED as identity.** VERIFIED as “same engine on resolved facts; hook is a narrower adapter.”

- Kernel/CLI/MCP adapter parity is tested (`tests/unit/adapters/z04ResolvedAdapterParity.test.ts`, cited by prior audit).
- Hook uses **snippet** analysis + **same-file ratchet** (only *new* violation keys vs on-disk). Pre-existing debt can write locally while CI fails (`bin/ark-mcp-runtime.mjs`).
- Hook skips deny for `ANALYSIS_PARSE_INCOMPLETE`. Lexical incompleteness defers to `ark-check`.
- Non-listed tools and out-of-scope paths fail-open.
- **UC01** (include matches files, zero classified): code landed in [#233](https://github.com/pedroknigge/arkgate/pull/233) — verdict refuses `ANALYSIS_COVERS_NO_FILES`; hook denies `CONFIG_UNCLASSIFIED_FILES`. **Partial** unclassified remains a warning on a plain `ark-check` and only fails under `--strict-config` / `--require-gates` / `--strict-merge`. ROADMAP still marks `UC01` `doing` (see §10).

Host hardness (README + `bin/lib/write-path-detect.mjs`):

| Host | Hard write (when installed + trusted) | Notes |
|------|----------------------------------------|-------|
| Claude, Grok, Antigravity | Listed write/edit ops | PreToolUse |
| Cursor | `Write` / `StrReplace` + **`failClosed: true`** | `WG01` done (#231) |
| Codex | Complete local `apply_patch` only | Else advisory |
| OpenCode | Advisory / best-effort | Not a hard write |

Sacred “host-neutral” means **policy** (fail-closed where the host exposes it), not identical hardness. Soft hosts stay advisory. That is honest if doctor says so. Live compact doctor on this VM: “Local writes are advisory; required CI is the merge boundary.”

### 2.3 Doctor (one-light)

Compact help: “one status light, one next action” (`node bin/ark-check.mjs --help`). Human printer shows **Healthy** *or* **Primary next action** `#1` only (`bin/lib/doctor-human.mjs`). Ranking is pure: `collectDoctorNextActions` (`bin/lib/doctor-next-actions.mjs`).

Live compact doctor **on this mother tree** (no TypeScript host in the VM):

```text
! Analysis unavailable: no API-compatible TypeScript host could produce architecture evidence.
Operating mode: ADAPT · stewards unset
Primary next action:
  1. Fix overlapping layer globs — 24 files match more than one layer
     (e.g. bin/ark-layer-match.mjs matches DomainModel + Tooling).
     Narrow DomainModel to package-scoped paths (packages/*/src/domain/**),
     not whole-app roots like api/**. Then /ark-adopt
Coverage: ✓ Governed: 100% (343/343 files)
```

Those 24 dual-matches are **intentional**: DomainModel lists generated CLI artifacts that also sit under Tooling `bin/**` (`ark.config.json` lines 18–44 vs 61). #271’s heuristic (`dualMatchNeedsGlobRepair`: count ≥ 20 **and** a Domain sample) fires on the library’s own dogfood. The remedy sentence is hardcoded to “not whole-app roots like `api/**`” (`overlappingGlobNextAction`). **#1 lies about the shape of the problem on this tree.**

Live compact doctor **on a fresh 4-file start fixture** (this run):

```text
1. Make arkgate-check --strict-merge a required GitHub status,
   or write .ark/adoption-stance.json with stance: "advisory-only"
Governed: 100% (4/4 files)
```

#1 is the sacred adopt light. ArkOrder breath still prints under it (see §5).

Doctor green cites (`#256` / `GR01`): “Healthy — nothing to do” must cite a file, config key, or test (`bin/lib/doctor-green-cite.mjs`). Other green checkmarks are not all cited. Compact doctor is **one** #1; it is not a second gate.

### 2.4 Start / apply / presets

`arkgate start` previews; `--apply` writes. Shape gate refuses coverage < 50% or weak confidence (`evaluateStartShapeConfidenceGate`). Install failure after apply returns the PM exit status and `formatStartPackageInstallFailure` (`bin/ark.mjs`, `bin/lib/start-preview.mjs`). Tests: `tests/unit/static-check/startApplyInstallHonesty.test.ts`.

Live `start --apply --skip-package-manager` on a 4-layer fixture (this run, exit 0):

- Wrote 11 mutations: `ark.config.json`, four `arkrules/*.json`, host gates, CI workflow, `AGENTS.md`.
- **No `arkRun`. No `arkOrder`.**
- **`arkRules` present** (schema 1.3, `$schema` at `arkgate@4`).
- Projected governed coverage 100%.

Monorepo preset after #271 (`bin/lib/presets.mjs`): library Domain bags stay under `packages/` or `libs/`. Live `ARCHITECTURE_PRESETS.monorepo` on an `api` + `client` + `packages/schema` fixture:

```text
**/domain/**  **/entities/**  **/kernel/domain/**
src/**/domain/**  src/**/entities/**  src/domain/**  src/entities/**
**/cinematic/types.ts
packages/schema/src/**
src/**/model/**  src/**/models/**
whole-app leaks: NONE
```

Residual classification risk: `**/domain/**` is still tree-wide. An app that names a folder `domain` still becomes DomainModel.

### 2.5 Known false-greens

| Item | As-is | Evidence |
|------|-------|----------|
| Vacuous include, zero classified | Refused on verdict path (`ANALYSIS_COVERS_NO_FILES`) | #233, `emptyAnalysisRefusal` |
| Partial unclassified | Warning; green **without** `--strict-*` | `ark-check-runtime.mjs` advisory warnings exit 0 |
| Dual-match + high Governed % | Coverage can look healthy while the map lies | Mother 100% + 24 dual; field #269 was 98% + 265 |
| Hook ratchet | Local write can land on old debt | `ark-mcp-runtime.mjs` |
| Empty analysis / `--doctor` | Doctor and coverage are not verdicts | Exempt from refusal |
| Coverage certifying tests | `CR01` done — enforced invariants need `coverage.coverageRoots` | ROADMAP, configuration.md |
| Doctor “Healthy” without a cite | Demoted (`GR01`) | `doctor-green-cite.mjs` |

### 2.6 Open issues vs this tip

| ID | State | Alignment with this tree |
|----|-------|---------------------------|
| [#269](https://github.com/pedroknigge/arkgate/issues/269) | **Closed** | Merged as [#271](https://github.com/pedroknigge/arkgate/pull/271) at `2aaf79b`. Preset leak VERIFIED fixed. Doctor #1 for huge Domain dual-match VERIFIED present. Residual: heuristic + copy over-fire (this mother tree). |
| [#271](https://github.com/pedroknigge/arkgate/pull/271) | **Merged** | Same commit. Commit message says “(#269)”; GitHub PR number is 271. |
| [#270](https://github.com/pedroknigge/arkgate/issues/270) | **Open** | VERIFIED on this tree: README banner and CHANGELOG `## 4.8.17` still say npm latest is 4.8.16. Live `npm view arkgate version` → `4.8.17`. Fix PR [#272](https://github.com/pedroknigge/arkgate/pull/272) open (not this audit). |
| [#268](https://github.com/pedroknigge/arkgate/issues/268) | **Open** (UX/docs; exit-code claim withdrawn) | Exit-non-zero on install fail VERIFIED in code + tests. Remaining: `npm install -D arkgate` on `workspace:*`; maturity-dump recovery; doctor #1 after failed install still “make CI required.” |
| [#233](https://github.com/pedroknigge/arkgate/pull/233) / draft [#234](https://github.com/pedroknigge/arkgate/pull/234) | Merged / stale draft | UC01 **code** is on `main`. ROADMAP row still `doing`. Draft #234 only flips the row. |

---

## 3. ArkRules (Guiar patterns)

### 3.1 Surface map

| Surface | What | Silent when off? |
|---------|------|------------------|
| Config | `arkRules` map → `arkrules/<Layer>.json` | No map → no structure findings |
| CLI | `--rules-inventory`, `--sensors`, `--promote [--apply]` | `--sensors` still lists the vocabulary |
| Doctor compact | One breath + counts **only when map is on** | Compact silent when off (`ARKRULES_ONE_BREATH` gated) |
| Doctor `--all` | **ArkRules (not a score)** when active | No section when inactive |
| Status JSON | `rules.arkRulesLoaded` | Field present, `false` |
| MCP | `ark_rules_inventory` | Inventory tool exists regardless |
| Skills | Folded into `/ark-adopt`, `/ark-explore`, `/ark-autopilot` | **No `/ark-rules` door** |
| Start | `withDefaultArkRules` + template files | **Turns the map on** |

### 3.2 When on / off

- **Off (no map):** structure sensors return empty; compact doctor silent; gate unchanged. VERIFIED by domain tests cited in exploration + `summarizeRulesUnderContract` `active: false`.
- **On (advisory templates from start):** doctor prints structure/invariant counts, “advisory only — does not fail the merge.” Live fixture this run.
- **Promote:** `--promote --apply` writes `mode: "enforced"` into ArkRules JSON only. Extras promote via `arkRun.mode` / `arkOrder.mode` (`bin/lib/sensor-promotion.mjs`).

### 3.3 Stranger UX

A newbie can turn a rule on without an ADR: `--rules-inventory` → `/ark-adopt` write one phrase → `--promote` preview. Tier-2 `no-anemic-model` is permanently non-promotable (ADR 0013); `--sensors` says so.

**Gap:** first-contact README says extras are optional. Start silently attaches ArkRules. That is documented in `docs/use.md` (“start may ship advisory templates”) and still surprises a stranger who was told “optional off until you ask.”

**Gap:** no dedicated skill door. Capacity is real (adopt/explore/autopilot) but the extra does not get the same `/ark-*` noun as Run and Order. Asymmetry vs SK216 “dedicated doors” table (`ARK_SKILL_CAPACITY_DEDICATED_DOORS` only lists ArkRun / ArkOrder / Ordenar).

---

## 4. ArkRun

### 4.1 Surface map

| Surface | What |
|---------|------|
| Config | `arkRun` (schema 1.2+): `mode`, `kernelRoots`, `managedLayers`, `requireDeclarations` |
| Export | `arkgate/runtime`, `arkgate/nestjs` (same npm package) |
| Deprecated | `@arkgate/runtime` leftover (`packages/runtime`) |
| CLI | Same check; `doctor.arkRun`; `ark-dashboard` (TUI, **not a verdict**) |
| Skills | Dedicated `/ark-runtime`; extra on via `/ark-adopt` |
| Docs | package-surface experimental; production-hardening (durability) |
| Sensors | `ARKRUN_*` only when extra present (`src/domain/arkRunSensors.ts` early return) |

### 4.2 Silence when off

| Surface | Silent? | Evidence |
|---------|---------|----------|
| Gate / ESLint / hook | **Yes** | `if (!extra) return { findings: [] }`; ESLint `if (!config?.arkRun) return null` |
| Compact doctor | **Yes** | No ArkRun copy when off (unit test + live mother/fixture compact: no ArkRun section) |
| Full doctor / status JSON | **No** | Always projects `arkRun` object, `present: false`, `residual: 0`, note “Absence is silent” |
| `--sensors` | **No** | Lists every `arkrun-*` id this run |
| Start apply | **Yes** (keys) | Live fixture: `no arkRun` |

Status saying “absence is silent” while printing a full extra slice is a meta-honesty quirk. Residual count 0. Not a second verdict.

### 4.3 Gaps vs skills doors

- Dedicated door exists and is first-class. Skill says extra must be on or STOP → `/ark-adopt`. Durability honesty (“in-memory, not Postgres”) is in skill, doctor, README. VERIFIED.
- **`ark-dashboard` has no skill.** 4.8.8 release note is explicit. Observability is a shipped CLI (`arkgate dashboard` in `ark --help`) with zero catalog mention.
- NestJS adapter is a package export folded shallowly into `/ark-runtime`. Fine for SK216; thin for a stranger who imported `arkgate/nestjs`.
- No `/ark-run` name (forbidden). Good.

---

## 5. ArkOrder (Ordenar)

### 5.1 Surface map

| Surface | What |
|---------|------|
| Config | `arkOrder` (schema 1.3+): `mode`, `planeRoots`, `xiKeys`, `appliesTo`, … |
| Export | `arkgate/order` (same package; not `@arkgate/order`) |
| Docs | `docs/arkorder.md` — breath first; ξ / Haken below the fold |
| Gallery | `examples/arkorder-billing` (git tree, not npm tarball) |
| Skills | First-class `/ark-order` (ADR 0036 / SK216) |
| Sensors | `ARKORDER_*` only when extra present |

### 5.2 Silence when off

**Gate: silent. Compact human: loud.** Product copy says this out loud:

```13:15:bin/lib/product-copy.mjs
 * Compact doctor / details — only when `arkRules` is on.
 * Absence stays silent (unlike ArkOrder, which speaks when off).
```

Live compact doctor (mother tree, extras off) and live start preview (`bin/lib/start-preview.mjs`) both print `ARKORDER_ONE_BREATH` + billing + `/ark-order`. Tests lock that behavior (`arkOrderDoctor.test.ts`).

This is the sharpest north-star conflict in the audit:

- Sacred constraint: “add-ons opt-in **silent when absent**.”
- Shipped choice: ArkOrder is the **killer optional**, so first-contact *must* speak.
- Result: a stranger’s 1-minute doctor is about **billing valves** before they have a required CI check.

### 5.3 Adoption killer-path readiness

| Stage | Ready? | Notes |
|-------|--------|-------|
| Layers first | Yes | Start copy: “Optional extras stay off. This start is layers only.” Then immediately ArkOrder breath. |
| Turn extra on | Yes | `/ark-adopt` writes advisory `arkOrder` only if asked (`templates/skills/ark-adopt.md`) |
| Wire one candidate | Yes | `/ark-order`: `createOrderPlane`, `release()` then `proposeRelease`/`apply` |
| Proof | Partial | Billing gallery is git-only. npm stranger cannot `npm pack` a gallery. |
| Runtime half | Yes | Shadow/compare/tape = ArkRun (ADR 0033). Skill handoff to `/ark-runtime`. |
| Durability | Honest | In-memory `ReleaseStore`. Does not close `K01`. |
| ξ / Haken below fold | Partial | Skill first screen avoids them; docs API table still names σ/ξ. |

**Q10 (adoptable without ADR 0029/0034):** PARTIAL. Skill + `docs/arkorder.md` breath is enough to *run* the extra. Full physics (valve, ingest, σ) still points maintainers at ADRs.

**Ordenar star collision:** Domain table maps Ordenar → `/ark-order` only (`ARK_SKILL_CAPACITY`). Leftover-folder tidy is Guiar (`/ark-explore` / `/ark-autopilot`). First-contact English (“order leftover mess”) does not match the door.

---

## 6. Skills 100% coverage matrix

Mechanical catalog (VERIFIED this run, `npm run check:agent-skills` exit 0):

- 14 names in `ARK_SKILL_NAMES` (`src/domain/agentSkillsPackage.ts`).
- 9 first-class / 5 one-release stubs (introduced 4.8.14, **still shipped** in 4.8.17).
- 1:1 `templates/skills/` ↔ `templates/agent-skills/` ↔ dogfood `.agents/skills` ↔ `.grok/skills`.
- Standing line: “Skill set covers Layers + ArkRules + ArkRun + ArkOrder and Contener · Guiar · Ordenar.”
- Skills never claim to enforce. First-class bodies say “Skills never enforce — CLI / hooks / CI do.”

### 6.1 North star × skills / CLI / docs

| Star / plane | First-class doors | CLI / docs | Gap? |
|--------------|-------------------|------------|------|
| **Contener** / Layers | `/ark-adopt` `/ark-place` `/ark-upgrade` + explore/autopilot/coverage/explain | `start`, write hook, `--strict-merge` | None for ADR 0036 |
| **Guiar** / next step | `/ark-explore` `/ark-autopilot` `/ark-explain` `/ark-coverage` `/ark-runtime` | `--doctor`, `--plan`, `--coverage` | Doctor is the light; skills are the edge |
| **Guiar** / ArkRules | adopt, explore, autopilot | `--rules-inventory` `--sensors` `--promote` | **No `/ark-rules`** (design) |
| **Guiar** / ArkRun | `/ark-runtime` + adopt/place/autopilot | `arkgate/runtime`, dashboard CLI | **No dashboard skill** |
| **Ordenar** / leftover folders | explore + autopilot (bodies) | `--plan` / reshape | Star table does **not** list them under Ordenar |
| **Ordenar** / ArkOrder | **`/ark-order` only** in Domain table | `arkgate/order`, `docs/arkorder.md` | Door ≠ north-star English |

### 6.2 Skills ≠ product capacity (callouts)

ADR 0036 capacity is **planes + stars**, not the 16-row package index. These are the asymmetries that fail a “100% of product surface” reading:

| Missing / thin door | Why it is a bug under the user’s bar | Evidence |
|---------------------|--------------------------------------|----------|
| No `/ark-rules` | Rules is a first-class extra plane with CLI nouns; Run/Order have dedicated skills | `ARK_SKILL_CAPACITY_DEDICATED_DOORS` omits ArkRules |
| No `/ark-dashboard` | Shipped bin in `ark --help`; zero skill mention | `docs/releases/4.8.8.md`; grep empty in `templates/skills/` |
| Compact `--apply` without `--skills-only` | Day-zero can have gates and **no** `/ark-*` files | `bin/lib/install-migrate.mjs` compact path |
| ESLint plugin | Editor same-contract as CI; only coverage/explain mention it | package export `./eslint` |
| `--watch` | In `--help --all`; absent from skills | `first-run-help.mjs` |
| `--local` / `--changed` / parliament | Folded into autopilot only | LC01, `ark-autopilot.md` |
| Improvement compass / deepening coach / layer `description` | Explicit “no new skill” — folded | LD06, IC, DC |
| Stubs past “one-release” | Five leftovers still in the closed catalog | ADR 0036 vs 4.8.17 tree |
| `/ark-contract` redirect | Domain redirect → adopt only; body → adopt **or** autopilot | `ARK_SKILL_STUB_REDIRECTS` vs `templates/skills/ark-contract.md` |
| Host install shapes | Windsurf/Cline/Copilot get flat files, not `SKILL.md` | `bin/lib/skill-install.mjs` |

Host projection: Cursor/Codex/Antigravity native `.agents/skills`; Grok/Claude/OpenCode symlink adapters. Mother `AGENTS.md` must **not** be replaced by the consumer template (Identity block). Consumer install writes a full skill-routing table including leftover shortcuts.

---

## 7. Messaging / stranger-1-minute

Falsifiable fail: *a stranger cannot trust the first screen or #1 in about a minute.*

| Pin | First screen says | Reality (this run) | Verdict |
|-----|-------------------|--------------------|---------|
| npm latest | README / CHANGELOG / `docs/README.md`: 4.8.17 prepared, latest **4.8.16** | `npm view` → **4.8.17** | **FAIL** (#270). #272 in flight. |
| Start in one minute | `npm install -D arkgate typescript` | `workspace:*` monorepos → `EUNSUPPORTEDPROTOCOL` | **FAIL** (#268.1) |
| Install-fail recovery | Generic “Package install failed (exit N)” + replay command + `npx --package=arkgate arkgate-check --doctor` | Honest exit code (not 0). No one-liner for `minimumReleaseAge` | **PARTIAL** (#268.2) |
| Doctor after failed install | Same #1 as not-adopted: make CI required | Package may be unresolved | **LIKELY FAIL** (#268.3); not re-dogfooded here |
| Dual gate | “The same check fails the pull request” | True only if the status is **required**; hook ≠ full CI | **QUALIFIED** (README also says this) |
| Doctor one-light | “one next action” | Compact: one #1. Mother #1 is a glob lie. Fixture #1 is adopt. | **PARTIAL** |
| Extras silent | Voice + ROADMAP | ArkRules on at start; ArkOrder speaks when off; `--sensors` lists all planes | **FAIL** vs sacred wording; **PASS** vs current product-copy |
| Exit codes | Hook deny 2; start shape 2; install fail = PM status; empty analysis 1; this mother doctor **2** (analysis unavailable); fixture doctor **0** | Doctor is not a gate, but exit 2 vs 0 on “analysis unavailable” is inconsistent | **INCONCLUSIVE** why mother is 2 (no TS host + dual-match path) |
| Claims matrix | Identity 4.8.13 / npm 4.8.11 | npm 4.8.17 | **STALE** (historical file; not the 1-minute path) |
| ROADMAP doing | `RL817` doing + `UC01` doing | npm already 4.8.17; UC01 code merged | **FAIL** (two doings; stale release row) |

Recovery copy that *is* honest: `arkPackageRecoveryCommand` never emits bare `npx arkgate-check` (404). VERIFIED in `startApplyInstallHonesty.test.ts` and `formatStartPackageInstallFailure`.

---

## 8. Verification evidence

### 8.1 Commands run (this VM)

| Command | Result |
|---------|--------|
| `git fetch origin main` / `git log origin/main` | Tip `2aaf79b` = local `main`. #271 content is this commit (message `#269`). |
| `npm view arkgate version` / `dist-tags` | `4.8.17` / `{ latest: "4.8.17" }` |
| `node bin/ark.mjs --version` / `--help` | `4.8.17`; start / doctor / dashboard / report |
| `node bin/ark-check.mjs --help` / `--help --all` | Doctor one-light; `--strict-merge`; `--sensors`; unclassified stays red under require-gates |
| `node bin/ark-check.mjs --doctor` (mother) | Exit **2**. Analysis unavailable (no `node_modules/typescript`). #1 overlapping globs (24). Governed 100%. ArkOrder breath. |
| `node bin/ark-check.mjs --doctor --json` (mother) | `arkRun`/`arkOrder` `active: false`, `residual.count: 0`, notes “absence is silent” |
| `npm run check:agent-skills` | Exit **0**. 14/14 + capacity line. |
| Live `ARCHITECTURE_PRESETS.monorepo` fixture | DomainModel: no `api/**` / `client/**`. Keeps `packages/schema/src/**`. |
| Live `dualMatchNeedsGlobRepair` mother-like `{count:24, Domain+Tooling}` | `true` + `api/**` remedy copy. |
| Live small Next dual `{count:8}` | `false` (CI-required stays #1). |
| Live `start --apply --skip-package-manager` 4-file fixture | Exit 0. 11 mutations. `arkRules` yes; `arkRun`/`arkOrder` no. Doctor #1 = make CI required. ArkRules + ArkOrder breaths. `--sensors` lists all three planes. |
| `npm test` / `npm ci` | **Not run.** This VM has **no `node_modules`**. Full suite INCONCLUSIVE here. Targeted Node imports of `bin/lib` do not need vitest. |
| GitHub issues/PRs | Open: #268, #270. Merged: #271/#269, #233. Open PRs: #272 (docs/latest), #245 Dependabot, #244 field stats, #234 draft UC01 row. |

### 8.2 VERIFIED table (hypothesis loop)

| ID | Claim | Evidence | Verdict |
|----|-------|----------|---------|
| Q1 | Write vs CI always same verdict | Hook ratchet + snippet vs `--strict-merge` | **NOT VERIFIED** (documented asymmetry) |
| Q2 | Doctor never two “the” lights | Compact one `#1`; JSON can also expose `postGreenPath` | **PARTIAL** |
| Q3 | `start --apply` never exits 0 on install fail | `ark.mjs` returns PM status; unit test #258/#259 | **VERIFIED** (when install runs). Skipped with `--skip-package-manager`. |
| Q4 | Monorepo start never puts `api/**`/`client/**` on Domain | Preset filter + live fixture | **VERIFIED** for preset path. Manual adopt can still broaden. |
| Q5 | Unclassified include cannot look green | Partial warning without `--strict-*`; zero-classified refused | **NOT VERIFIED** universally |
| Q6 | Doctor green always cites file/key/test | Only the Healthy headline | **NOT VERIFIED** for every checkmark |
| Q7 | Extra off ⇒ zero extra residual on doctor/status/report | Gate findings empty; JSON residual 0; human ArkOrder copy remains | **PARTIAL** |
| Q8 | Extra off ⇒ start does not write extra keys | Live apply: no Run/Order; **yes Rules** | **VERIFIED** for Run/Order. **FAIL** for Rules. |
| Q9 | Skills when/not-when/handoff for all three extras | Capacity test + skill bodies | **VERIFIED** (Rules folded, not dedicated) |
| Q10 | ArkOrder killer-path without ADRs | Skill + arkorder.md breath | **PARTIAL** |
| H1 | npm latest is 4.8.16 | `npm view` 4.8.17 vs README banner | **FALSE** (#270) |
| H2 | #271 fixed Domain vacuum | Live preset patterns | **TRUE** |
| H3 | #271 doctor #1 is safe on this mother tree | 24 intentional dual-lists | **FALSE** (over-fire) |
| H4 | Sacred silence when extras absent | product-copy + start + sensors | **FALSE** as stated; **TRUE** for gate findings |
| H5 | SK216 = 100% product surface | ADR 0036 ≠ 16-row package index | **TRUE** for declared capacity. **FALSE** for full surface. |
| H6 | UC01 still open work | #233 merged; ROADMAP `doing` | **CODE DONE / QUEUE STALE** |
| H7 | One ROADMAP `doing` | `RL817` + `UC01` both `doing` | **FALSE** |

---

## 9. Recommended backlog (Holding)

Board these as Holding candidates. No target-repo identities. No code in this PR.

### P0 — stranger 1-minute / sacred honesty

| ID | Title (one line) |
|----|------------------|
| H-P0-1 | Packed front doors must not claim npm latest is older than the tarball they ship (#270; #272 already open) |
| H-P0-2 | Start-in-one-minute must not lead with `npm install -D arkgate` on `workspace:*` monorepos (#268.1) |
| H-P0-3 | Dual-match doctor #1 must not fire on intentional file+glob dual-lists, and must not hardcode `api/**` |
| H-P0-4 | ROADMAP one-`doing` + release identity: close stale `RL817` / `UC01` rows (queue hygiene, not a product diff) |

### P1 — north star / silence / dual gate

| ID | Title (one line) |
|----|------------------|
| H-P1-1 | Decide: ArkOrder compact/start speech vs sacred “silent when absent” (one sentence in product-voice, then align copy) |
| H-P1-2 | Decide: ArkRules default-on at `start` vs “optional until you ask” |
| H-P1-3 | `--sensors` should not list inert extra planes unless `--all` / extra present |
| H-P1-4 | After `start --apply` install fail, doctor #1 is recover the package, not “make CI required” (#268.3) |
| H-P1-5 | Install-fail recovery one-liner for `minimumReleaseAge` / `ERR_PNPM_NO_MATURE_MATCHING_VERSION` (#268.2) |
| H-P1-6 | Partial unclassified: keep warning on brownfield, but doctor must not show Governed ✓ as the emotional headline |
| H-P1-7 | Claims-matrix / AGENTS.md / `docs/README.md` published pins: restatement pass (identity only) |
| H-P1-8 | Ordenar English: leftover-mess vs billing-valve — pick one first-screen meaning |

### P2 — skills ≠ surface / leftovers

| ID | Title (one line) |
|----|------------------|
| H-P2-1 | Either add a folded `/ark-dashboard` mention to `/ark-runtime`, or stop listing dashboard on the first `--help` screen |
| H-P2-2 | Fold ESLint “same contract as CI” into `/ark-coverage` or `/ark-explain` as a named when/not-when row |
| H-P2-3 | Retire or re-date the five “one-release” stubs (still present three patches later) |
| H-P2-4 | Align `/ark-contract` Domain redirect with the stub body (adopt **or** autopilot) |
| H-P2-5 | Compact day-zero: one line that skills are not installed until `--skills-only` |
| H-P2-6 | Monorepo residual: `**/domain/**` still classifies any folder named domain |
| H-P2-7 | Triage open Dependabot #245 (repo hygiene; not a product door) |
| H-P2-8 | Draft #234: land or close (UC01 row only) |

Do **not** board `Z09` / `K01` / host hardness for OpenCode as Holding product work. They are parked residuals.

---

## 10. What’s still open / INCONCLUSIVE

- **Full `npm test` / `test:coverage` / `check:architecture`:** this VM has no `node_modules` and no TypeScript host. Architecture analysis on mother and fixture printed “Analysis unavailable.” Coverage percents still came from the include/layer walk. Re-run on a `npm ci` machine before treating analysis-complete doctor as verified.
- **#268.3 doctor-after-failed-install:** not reproduced here (would need a live pnpm `minimumReleaseAge` workspace). Code path is inferred from `formatStartPackageInstallFailure` + not-adopted #1 ranking.
- **Hook vs CI on a real host PreToolUse:** not exercised in this VM (no Cursor hook session). Relies on code + existing tests.
- **Field 265 dual-match pile-up:** #271 tests a fixture, not the original anonymized monorepo. Residual risk: `**/domain/**` + application `domain/` folders.
- **Why mother doctor exits 2** vs fixture doctor exit 0, both “analysis unavailable”: not isolated. Treat doctor exit codes as **not a stranger contract** until someone writes the table.
- **#272:** may land the #270 pin before this report is read. The *class* of bug (prepare-banner surviving publish) remains a Holding item even if 4.8.17 copy is patched.
- **Sales-stats #244 / Dependabot #245:** open; not product-capacity. Hygiene only.
- **Claims matrix “98 truth score”:** stale identity; not re-scored. Do not quote it as current.
- **Parked:** `Z09` retained-adoption, `K01` durability, scanner bypass residuals in ROADMAP audit baseline. Out of this 1-minute stranger bar.

---

## Appendix A — Falsifiable questions (framed first)

What would make Contener / Guiar / Ordenar fail for a stranger in ~1 minute?

1. The first install command dies on a normal monorepo.
2. The version banner on the package they just installed is wrong.
3. Doctor #1 is the wrong problem (or a generic `api/**` sermon).
4. Governed % looks green while the layer map is a lie.
5. An extra they never asked for is on (Rules) or advertised (Order).
6. A skill they invoke does not exist for the CLI they just saw (`dashboard`).
7. Write lands locally and CI fails, or the reverse, with no sentence that says why.

Items 1–3 are live. Item 4 is fixed for the #269 shape and still live for intentional dual-lists and `**/domain/**`. Item 5 is live by design. Item 6 is live for dashboard. Item 7 is documented ratchet.

## Appendix B — Files most cited

`README.md` · `docs/README.md` · `docs/use.md` · `docs/product-voice.md` · `CHANGELOG.md` · `ROADMAP.md` · `ark.config.json` · `bin/ark.mjs` · `bin/ark-check.mjs` · `bin/ark-mcp-runtime.mjs` · `bin/lib/presets.mjs` · `bin/lib/doctor-next-actions.mjs` · `bin/lib/doctor-human.mjs` · `bin/lib/start-preview.mjs` · `bin/lib/product-copy.mjs` · `bin/lib/sensor-promote-cli.mjs` · `src/domain/agentSkillsPackage.ts` · `src/domain/arkRunSensors.ts` · `src/domain/arkOrderSensors.ts` · `templates/agent-skills/ark-order/SKILL.md` · `docs/adr/0036-skill-catalog-product-capacity.md` · `tests/unit/static-check/monorepoDomainGlobs.test.ts` · `tests/unit/static-check/startApplyInstallHonesty.test.ts`
