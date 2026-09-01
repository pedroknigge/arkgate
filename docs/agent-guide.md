# ArkGate — Agent Integration Guide

**Write. Check. Ship.**
**When the agent writes a bad import, the write doesn’t land. The same check fails the pull request.**
This guide is the **develop** reference for agents and codegen: write hooks, advisory MCP tools,
CI, and `/ark-*` skills. Not an API Gateway. Not a folder linter.

- Product path (anyone): [use.md](use.md)  
- Integration overview: [develop.md](develop.md)  
- Docs hub: [README.md](README.md)  

Guarantees differ by host; start with the
[canonical host support matrix](../README.md#host-enforcement-support). The operation-scoped
local / all-path CI split is a deliberate trade-off, not a gap: covered local hooks block early,
MCP warns, and a required merge status is the one boundary every write path can share.

CLI names: prefer **`arkgate` / `arkgate-check` / `arkgate-mcp`**; aliases `ark` / `ark-check` /
`ark-mcp` still work for one major. **arkgate@3.8.0+** tests packed project TypeScript
**5.9.3 / 6.0.3 / 7.0.2** and uses an exact, physically distinct TypeScript 6 analysis host when
the project API is unusable. See the distribution and completeness boundary in
[typescript-support.md](typescript-support.md). Product English and progressive-disclosure rules:
[product-voice.md](product-voice.md).

### Default path (4.0.0)

```text
ark start → ark start --apply → ark-check --doctor
  day to day: compact router / MCP place + validate + check
  guided work: install skill pack → /ark-autopilot
  optional: arkRules map + arkrules/*.json (intra-layer; starts advisory)
```

`arkgate-check --doctor` shows what's wrong and what to do first. From **4.0.0**, doctor may
also report **`rulesUnderContract`** (ArkRules counts) and **`packageVersionTruth`** when the
CLI is ahead of the package.json pin. The compact router from `ark start` is enough for normal
feature work. Full `/ark-*` skills are **expert depth** and label residual **`[Layer]`** vs
**`[ArkRules]`** (except experimental `/ark-runtime`):

```bash
npx ark-check --install-agent-gates --skills-only --force
```

### Write-path honesty

Claude/Grok/Antigravity/Cursor can hard-block listed PreToolUse / preToolUse ops when installed
and trusted (Cursor: `Write` / `StrReplace` via `.cursor/hooks.json`). Codex CLI and local
ChatGPT Desktop/App Server can hard-block a complete `apply_patch` through a trusted
`.codex/hooks.json`; installed files stay unverified until a fresh covered invocation. Hosted
tools, specialized opt-out paths, shell/direct writes, incomplete patch reconstruction, and
OpenCode remain CI-backed or advisory. For every host, the repository-wide hard boundary is a
**required GitHub status context** that runs `arkgate-check --strict-merge` (alias
`ark-check --strict-merge`) — the CLI name is not the status context name. Soft-write or
unverified-hook evidence alone does not mean the project is unfinished. See
[ai-gates.md](ai-gates.md) and the README host matrix.

Surface the same plane from the CLI: pair **`ark status --json`** (activation facts) with
**`ark-check --doctor`** (`doctor.writePath`) — operation-scoped local hard evidence where
observed, then **required** merge status as the all-path boundary. Product path:
[use.md — What you get](use.md#what-you-get) ·
[README host matrix](../README.md#host-enforcement-support).

**MCP project identity (4.2.0):** before trusting project-specific MCP evidence, call
`ark_identity` with `project.expectedRoot` set to the exact project's absolute root. Reuse that
root plus the returned `projectIdentity.projectId` on every later Ark tool call. A descendant
path is authoritative only when that matching project id is also supplied. Only
`binding.status: "matched"` with `authoritative: true` is authoritative; calls that omit the
expectation remain compatible but are explicitly `unverified`.

### Session recipe (agent turn)

Default loop for each agent session (product language — no inventing residual):

1. **Bind identity** — call `ark_identity` with `project.expectedRoot` = exact absolute project
   root. Reuse root + returned `projectId` on later tools. Only `binding.status: "matched"` with
   `authoritative: true` is authoritative.
2. **Read status** — `ark status --json` / MCP `ark_status` for identity, write-path activation,
   last-check summary, residual lens ids (`improvementCompass`), and primary next action.
3. **Act** — address residual / next action / stable `findingRef` from diagnostics. Never invent
   green residual lenses. Projection, skills, and AGENTS.md never enforce.
4. **Doctor when compass mode is not full** — if `improvementCompass.mode` is `subset` or
   `unavailable`, run `ark-check --doctor` (and `--json` for the full 15-lens map) before treating
   residual as complete. When mode is `full`, status residual ids are a subset of doctor residual
   for the same facts.

```bash
npx ark status --json --expected-root /abs/project/root
# mode !== full → full residual map:
npx ark-check --doctor --json
```

`--doctor --json` is a stable envelope (4.6.5+): `{ "schemaVersion": "1.0", "envelope": "doctor", "ok": boolean, "doctor": { … } }`.
Payload lives only under `doctor`. Do not parse sibling root keys as the doctor object.

Doctor also writes `.ark/ci-merge-boundary.json` (hook configured-not-fired, per-host writePath,
CI present-but-not-required, GitHub Free cannot require). Read that file — do not grep `node_modules`.
Hook green is not tree green (scripted edits bypass PreToolUse).

CLI-first: if the local CLI already resolved the project root, identity handshake is optional.
Do not wait on MCP “still connecting”. The same projection schema is merged into `AGENTS.md` and `CLAUDE.md`.

Product path: [use.md — Session recipe](use.md#session-recipe-agent-turn).

### Multi-project MCP and upgrade honesty (4.5.6)

One human often has **N checkouts** and **N package pins**. Product rules:

| Rule | Why |
|------|-----|
| One checkout = one `project.expectedRoot` | Identity (WI01) fail-closes cross-project evidence when used correctly |
| After `npm install arkgate@…`, restart/retarget Ark MCP | Process `arkgateVersion` is startup-loaded; long-lived MCP can lag install |
| Read `processPackage` on every tool response | `processPackageMismatch` / `processStale` + `nextAction` when process ≠ project install |
| Stale MCP in 4.6.4+ | `ark_identity` stays diagnostic; project tools return `PROCESS_PACKAGE_STALE` and top-level `authoritative:false` until restart |
| Prefer project-local CLI until versions align | A modern stale global `ark upgrade` hands off automatically; pre-4.6.4 globals need one `npx arkgate upgrade` entry |
| Upgrade each package that pins arkgate | Monorepo “done” is not one package’s pin |
| Registry-aware `ark upgrade --apply` | Does not false-skip when CLI == pin but registry is ahead; skip JSON has `reasonCode` + `suggestedInstallCmd` |
| Skills: `skillDrift` + optional `--refresh-skills` | Customized skill bodies stay preserved unless you opt in; never silent overwrite of true edits |

```bash
npx arkgate upgrade --json          # skillDrift, whatsNew, hostSelection
npx arkgate upgrade --apply         # registry-aware package step, then re-preview
# digest-bound apply + optional skill refresh:
npx arkgate upgrade --apply --no-install --plan-digest sha256:… --refresh-skills
```

### Two-axis done recipe

Architecture residual and feature residual are **separate axes**. Never collapse them:

| Axis | Where truth lives | Done means |
|------|-------------------|------------|
| **1. Architecture residual** | `ark status` / `ark-check --doctor` / improvement compass (scan) | Edges honest under the contract; residual lenses / design-weak addressed or deliberately deferred |
| **2. Feature / ticket residual** | User brief, PR, tracker (process **outside** the package) | Requested behavior matches acceptance; product QA |

**Enforce green ≠ feature done.** Green edges (or quiet residual lenses) only clear axis 1.
Axis 2 is never a package LLM verdict or second scoreboard — agents and humans judge the ticket.

Optional Completion bullet for skills: **Done axes** — architecture residual | feature residual.
Compact router restates the same rule for day-zero installs.

### Improvement compass (doctor + status)

`ark-check --doctor` (human + `--json`) projects residual architecture work as a closed set of
**lenses** (`doctor.improvementCompass`). Always `notAScore: true`. Never feeds `valid`,
strict-merge exit, or plan `goal.met`. Out-of-scope lenses (scalability, app security tooling,
full resilience) stay honest. Product path: [use.md — Improvement compass](use.md#improvement-compass-not-a-score).
Package surface row: [package-surface.md](package-surface.md).

**Status snapshot:** `ark status --json` / MCP `ark_status` project a thin `improvementCompass`
with explicit honesty **`mode`**: `full` \| `subset` \| `unavailable` (always `notAScore: true`).
Incomplete facts → `subset` / `unavailable` + reason — **never invent green residual**. Residual
never flips gate verdicts and never alone rewrites status `nextAction` as a score. When mode is
not `full`, follow the [session recipe](#session-recipe-agent-turn) and run doctor.

Compact router and skills read residual lenses in plain language; green edges alone are never
“architecture finished” while residual remains.

### Unified status snapshot (4.3+)

For one machine-readable session/project manifest (identity binding, honest write-path activation,
last-check summary, rules residual counts, primary next action, improvement-compass residual map)
use:

```bash
npx ark status --json
# optional identity check (matched vs stale):
npx ark status --json --expected-root /abs/project/root
```

MCP parity tool: **`ark_status`** (same envelope; pass `project.expectedRoot` after `ark_identity`).
Schema: `arkgate/schema/status-manifest`. Never prompts; under `CI=1` JSON is forced. **Not a
score** — counts, honesty modes, and residual ids only. Write-path interpretation of activation vs
merge teeth is under [Write-path honesty](#write-path-honesty).

**Stable finding refs (4.3):** every factory-emitted diagnostic on CLI JSON, MCP analysis
envelopes, and opt-in hook repair payloads (`ARK_REPAIR_JSON`) carries:

| Field | Meaning |
|-------|---------|
| `findingRef` | Compact multi-turn id (`fnv1a-` + 8 hex). Re-address the same finding without fuzzy text match. |
| `targetKey` | Baseline-compatible freeze identity (`ruleId\|file\|from\|to\|target`, with `#N` for duplicates). **Same plane as `--baseline`** — refs never orphan freezes. |
| `docsCodePath` | Package-relative catalog anchor (`docs/diagnostics.md#RULE_ID`). |

Line/message drift across agent turns does not change `findingRef` / `targetKey`. Schema:
`arkgate/schema/analysis-result` **`1.5`**. Multi-turn fixture:
`tests/fixtures/finding-refs/multi-turn-stability.json`.

**Version-matched agent projection (4.3):** install/upgrade embeds a managed AGENTS.md
block stamped with the installed `arkgate` version plus a compact contract summary (layers +
diagnostic short list). Regenerate after package upgrade without clobbering customized regions
outside the markers:

```bash
npx ark agents-md              # preview
npx ark agents-md --write      # merge managed block only
npx ark agents-md --check      # exit 1 on version/stamp drift
npx ark agents-md --stdout     # print block only
```

The projection is **non-authoritative**. Enforcement is `ark-check` / host write hooks / required
CI (`--strict-merge`) — never AGENTS.md, skills, or this projection. Root API:
`buildAgentProjectionBlock` / `mergeAgentProjectionDocument`.

**Agent Skills packaging (4.3):** the same frozen **13** skill names are also shipped as
an Agent Skills–compatible package under `templates/agent-skills/<name>/SKILL.md` for hosts that
install via `npx skills` (in addition to Ark `--install-agent-gates`). See
[Install skills — Ark and ecosystem](#install-skills-ark-and-ecosystem). No new skill names.
Skill bodies coach residual lenses and anti false-done; they never enforce.

## Architecture playbook and `ark-check --recommend`

Before generating project structure, agents should read the **tool-agnostic application
shape** that fits the repository — not a vendor stack label. Ark ships a versioned playbook
at `templates/architecture-playbook.json` (also in the npm package under `templates/`).

Each of the twelve archetypes (`crud-product`, `api-backend`, `frontend-surface`,
`library-sdk`, `cli-utility`, `worker-pipeline`, `event-coordinator`,
`integration-bridge`, `multi-app-workspace`, `prototype-spike`,
`vertical-slice-product`, `ddd-bounded-contexts`) maps to:

- a named Ark preset (`hexagonal`, `layered`, `feature-sliced`, `monorepo`, `ui-surface`, `vertical-slice`, or `ddd-bounded-contexts`),
- phased 11-layer adoption (phase 1–3),
- plain-language analogy and anti-patterns,
- optional book references for depth only.

Scoring is **deterministic** and source/graph-first. Ark discovers package units and roots from
workspace manifests, `tsconfig`/`jsconfig` references, package exports and entrypoints, plus
conventional `src`/`source` directories. Runtime and peer dependencies contribute framework
signals; dev-only dependencies are reported but do not determine the application shape. Docs,
examples, and test packages are reported separately and excluded from root-product inference.
Framework packages may appear as secondary `toolHints` in JSON output — never as the primary
archetype id.

All playbook labels, analogies, anti-patterns, and `--recommend` prose are **English**
(`locale: "en"` in the playbook). Agents should present them as-is unless a future locale
pack is explicitly loaded.

### Terminal

```bash
npx ark-check --recommend
npx ark-check --recommend --json
```

`--recommend` does not require `ark.config.json`. It exits `0` and prints a progressive
adoption plan: archetype id, preset, `confidence`, `runnerUp`, `why` (shape signals),
structured positive/negative `evidence`, discovered `signals.packageUnits`,
`adoptInOrder.phase1`, `firstCommand` (`ark init --archetype …`), and `checkCommand`.
When the top two shapes are close or projected governed coverage is below 90%, JSON sets
`requiresConfirmation: true` and explains why in `confirmationReasons`.

Human output highlights phase-1 layers and the analogy; JSON is the stable contract for
MCP `ark_recommend` and the `/ark-adopt` skill (leftover name `/ark-architect` is a shortcut).

### Terminal onboarding (Phase B)

```bash
npx ark start --yes                           # preferred read-only preview: shape → contract → host → CI
npx ark start --yes --apply                   # apply exactly the previewed compact setup
npx ark init --archetype crud-product --yes   # non-interactive: shape → preset → origin → gates
npx ark init                                    # TTY wizard: pick application shape (1–8), not a framework
npx ark-check --doctor                          # includes "New here?" when coverage is low or config is fresh
npx ark-check --report beginner.html --beginner # simplified HTML for enthusiasts
npx ark-check --ratchet-cores                   # require populated core layers after raw graph is green
npx ark-check --watch                           # debounced re-check when governed files change
```

**Day-zero origin (2.12+):** `ark init` freezes `.ark/reports/origin.*` before writing agent
docs or CI templates. Compact `ark start` previews first and keeps the applied setup small
(budget: 8 files / 32 KB including project `.mcp.json`);
run `ark-check --report ark-report.html` explicitly when you want to establish an origin/evolution
baseline. Do not `--reset-origin` unless the user explicitly wants a new baseline.
`ark-check --report --no-archive` still creates `origin.*` on the first report (or on an explicit
reset) and refreshes `latest.*`; it skips only the timestamped JSON file under
`.ark/reports/history/`.
Snapshots record best-effort, shell-free Git provenance (`HEAD`, attached branch, and dirty
worktree state). Evolution keeps raw metrics visible across ArkGate upgrades, but an Ark score
delta is comparable—and therefore rendered—only when origin and current snapshots use the same
ArkGate version.

Once the **raw** graph has zero violations (the baseline is deliberately ignored) and governed
coverage is at least 50%, `ark-check --ratchet-cores` changes `optional: true` to
`optional: false` for populated core layers in `ark.config.json`. Empty cores remain optional.
The command refuses active raw violations or low coverage; re-run `ark-check --doctor` after it.

To remove a compact host integration, preview `ark start --remove-host <host>` and add `--apply`
only after review. Ark removes only its exact compact artifacts, leaves customized files untouched
as unresolved decisions, and restores the integration with `ark start --tools <host> --apply`.

**Five doors (emphasize):** `/ark-adopt` = session 0 (greenfield scaffold + brownfield honesty —
write the path). `/ark-place` = new feature (place **and write**). `/ark-autopilot` = apply
plan A + one Shape refactor (invoke = approval). `/ark-explore` = map + dual-plan seed (no
apply). `/ark-upgrade` = preview then apply in-turn. Other `/ark-*` names stay installed as
**shortcuts**. Empty plan A is not “architecture healthy” if leftover design remains.

**Team parliament:** adopt is a **contract session** (law-only). Feature work must not edit
`ark.config.json` / `arkrules/*` / `.ark-baseline.json`. Prefer
`ark-check --changed --base <merge-ref>` in local gates. `--contract-diff` + `--author`
when `stewards` is set (`--author` is a GitHub handle or email, not git `user.name`).
`ark status --vs <ref>` prints pin / contract / baseline drift.

**Design fitness (3.0.1+ / Phase Q 3.0.3):** after checked edges are clean, doctor can still
report **SUGGEST / ADAPT / ENFORCE · design-weak** using the mode it actually observed; a weak
design does not imply that enforcement is active.

```bash
npx ark-check --doctor --json   # designFitness, designSmells[].outcome, postGreenPath, goldenPattern, pilotLoop
npx ark-check --plan --json     # plan.goal.designWeak + plan.patternBets[] + plan.pilotLoop
npx ark-check --doctor --fail-on-new-smells --base-ref origin/main --json # opt-in new/worsened design delta
```

**Post-green path (Q01):** when design-weak, doctor sets `postGreenPath` / `primaryNextAction`
(`clarify-for-ai`) — **one** Shape door: `/ark-explore` shape-focus → dual-plan B, then
`/ark-autopilot` applies one pilot. Do not skill-shop coverage/think for the same residual.

**Pilot loop (Q04):** when design-weak, `pilotLoop.nextPilot` is **one** extraction card
(pilot target, move, success, kill-switch). Apply **that one pilot only**, then re-doctor.
Success = reduced smell evidence on pilot paths; residual outside the pilot may remain.
Never select seed/fixture/demo/migration/generated files as god-module pilots. A real UI business
rule moves Domain → Application → UI; local permission/UI-state helpers are not selected by their
`canEdit`-style name alone. Never multi-pilot batch; never mechanical-safe; never claim healthy
finished while design-weak.

**AI-velocity evidence (Q05):** deterministic fixture bench (no live LLM) compares the same
feature add on design-weak vs golden-path trees. Run `npm run eval:ai-velocity`; metric is
`placementTurns` (agent-equivalent steps to the DomainModel home). Method is stored next to
the number in `eval/ai-velocity-report.json`. See
[the evaluation guide](https://github.com/pedroknigge/arkgate/blob/main/eval/README.md).

Smell **ids** (stable JSON) plus **outcome** lines (plain language, Q02) on each
`designSmells[]` object — prefer `outcome` for humans; keep `id` for automation:

| id | Outcome (what to do / why the AI struggles) |
|----|-----------------------------------------------|
| `io-under-application` | Business code reaches DB/APIs directly — put I/O behind a port/adapter |
| `handler-in-persistence` | Static framework HTTP imports (`next/server`), `defineRoute` calls, or handler bodies under Persistence-role storage folders — move transport to API/UI |
| `god-module` | Huge multi-job files — split the pilot by concern |
| `domain-logic-in-ui` | can*/calculate* in UI — move pure rules into Domain |
| `facade-sql-in-routes` | Routes import ORM/SQL — keep queries in repository/adapter |
| `mixed-pattern-cluster` | Several layout styles — pick one golden pattern + pilot |
| `soft-contract` | Layers without deny rules — add real walls, not soft green |

**Contract health (W01):** doctor JSON also carries `contractHealth` — a meta-lint of the
contract itself (never of the code): `contract-bidirectional-allow` (both directions explicitly
allowed between two layers), `contract-peripheral-depends-core` (audit/observability layer allowed
into orchestration/persistence), `contract-lateral-adapter-allow` (adapter layer allowed into a
sibling adapter layer; X03 — an adapter into its OWN family's infra base, e.g.
`PaymentsAdapters -> PaymentsInfra`, is the sanctioned direction and does not fire),
`contract-dead-rule` (rule references an empty or unknown layer, or is a
same-layer no-op; `optional: true` layers are exempt). Advisory only: it never changes the
verdict, `designFitness`, or `patternBets` — layer roles come from name heuristics, so treat a
miss as a warning to read, not a defect to silence. A deliberate edge is acknowledged in
`.ark/contract-smell-acks.json` (`{ acks: [{ id, edge, reason, reviewBy? }] }`); `acknowledged` counts
applied acks only, and a malformed sidecar or edge string suppresses nothing. X02 — acks have a
lifecycle: an optional `reviewBy` (`YYYY-MM-DD`) marks when the exception must be re-reviewed;
past that date the ack stops applying and the smell returns annotated (`(ack expired …)`).
Undated acks keep applying but are counted in `contractHealth.ackLifecycle.undated` — give
migration acks a date so they cannot fossilize. X05 — acks matching no detected edge are listed
as `ackLifecycle.stale`: fix the edge string or delete the entry. X06 — the family-infra
carve-out also matches mid-name families (`HoursPersistenceAdapters -> PersistenceInfrastructure`).

**Effect capabilities (U03, evidence-only):** the public analysis IR reports typed capability
uses for seven closed ids (`network`, `filesystem`, `clock`, `randomness`, `environment`,
`process`, `persistence`) through `analyzeProject(...).ir.capabilityUses`. The CLI/hook adapters
add symbol-aware ambient evidence internally (shadowing/type-only/`globalThis` handled); the
pure IR carries the import-based subset it can prove from content alone. `collectCapabilityUses`
and `CAPABILITY_IDS` are internal implementation exports, not exports from `arkgate`; the related
public low-level root helper is `collectForbiddenCapabilityUses`. Direct evidence only.
**Walls (U04) are opt-in:** a layer with `capabilities: { deny: ["clock", …] }` or
`pure: true` (deny all seven) turns matching evidence into judgment-class
`CAPABILITY_VIOLATION` findings with a port-injection `nextAction`; absence changes no verdict.
One violation, one voice: ambient uses covered by `forbiddenGlobals` stay `FORBIDDEN_GLOBAL`.
Policy-delta classifies the ambient surface on the lowered capability space (equivalent
migration = neutral; lowered loss = weakening). Vocabulary and lowering:
`src/domain/capabilities.ts` / ADR 0009.

**Ambient state (U05, advisory + opt-in):** `doctor.ambientState` flags module-scope `let`/`var`
in `pure: true` layers only. Acknowledge deliberate registries/caches in
`.ark/ambient-state-acks.json` (`{ acks: [{ file, name, reason }] }`) or move the state behind a
port. Advisory only — never blocks, never feeds `designFitness`; no strict mode exists.

**Physical cohesion + reshape pilot (X04, advisory):** `doctor.physicalCohesion` reports concept
clusters per anchor directory (concentration, not volume — dispersed hooks never fire) with
fixed corpus-calibrated thresholds; anchors under `app/`/`pages/` are `fixedByConvention` and
never move. `reshapePilot.nextPilot` is a **proposed** one-at-a-time card (`moveSample`,
`movesTotal`, `successSignal`, `killSwitch`, `doNot[]`): run it only via `/ark-loop` through the
write gate + atomic preflight; merges are `/ark-adopt` / `/ark-autopilot` judgment cards. `notAScore`, never a
verdict/`designFitness` input; there is no apply path.

**Reshape decision memory (Y01):** when the team accepts, defers, or rejects that target, record
the explicit verdict in `.ark/reshape-decisions.json` using the card's exact
`decisionTarget` (`concept` + complete sorted `anchors`), a non-empty `reason`, and optional
`reviewBy` (`YYYY-MM-DD`). Current rejected/deferred decisions hide only the repeated pilot card;
the physical facts keep rendering. Accepted keeps the same `/ark-loop` path. Expired/malformed
dates and decisions whose anchor set changed no longer apply; doctor/report list them. The golden
pattern is never parsed to infer a decision — cite it in `reason` when it explains the layout.

```json
{
  "schemaVersion": "1",
  "decisions": [
    {
      "concept": "projects",
      "anchors": ["src/app/api", "src/lib/api-handlers", "src/lib/repositories"],
      "verdict": "rejected",
      "reason": "These role directories are our thin-shell-handlers-data golden layout.",
      "reviewBy": "2027-01-31"
    }
  ]
}
```

**Governance weight (W02):** `contractHealth.governanceWeight` reports raw facts (layers, rules,
governed files, files/layer, rules/layer) plus a fixed band (`heavy` / `typical` / `light` /
`unknown`) with fixed wording. It is explicitly `notAScore` — never a gate input. Read `heavy` as
"justify the next layer/rule with demonstrated pressure", never as "delete layers"; read `light`
as "a boundary may be missing where violations concentrate".

Each smell also has `evidence[]` paths and `message` (technical detail). Plan **B** bets include
`pilot`, `successSignal`, `killSwitch`, and **`neverMechanicalSafe: true`** — loop/autoPatch must
ignore them. For judgment I/O moves use **extraction cards**
([brownfield-adoption.md](brownfield-adoption.md) §6). Multi-PR residual may optionally be
persisted as a short Shape plan under the repo; not a gate requirement.

**Full-skill agent co-pilot:** after explicitly installing the `/ark-*` pack, use
`/ark-autopilot` (explore-first, dual plan A remediation + B pattern bets). Recon without
applying: `/ark-explore`. The default compact router uses MCP/CLI directly. Never treat empty
`--plan` steps as “architecture healthy” when `designWeak` / non-empty `patternBets` remain, or
when `plan.completeness !== "complete"`. Partial and unavailable analysis force `goal.met: false`.

`ark init --archetype <id>` maps playbook ids to named presets (`hexagonal`, `layered`,
`feature-sliced`, `monorepo`). With `--yes` and no archetype, Ark auto-selects from
`--recommend` scoring.

`ark-check --json` violations include enthusiast-oriented fields when present:
`fixClass` (e.g. `port-inversion`, `file-move`), `effort` (`small` | `medium`), and
`enthusiastHint` (plain English). `--doctor --json` exposes `doctor.newHere` with
`recommendCommand` and `initCommand` when the nudge applies.

### Deploy-path quality (lint/types before the host build)

Some frameworks run **ESLint and/or typecheck inside the production build** (Next.js by
default: “Linting and checking validity of types”). Architecture can be green while the
**deploy host** is the first place a `no-explicit-any` or unused-import error appears.

Ark does **not** reimplement general ESLint rules. `--doctor` / adoption gaps **do**
detect, for **any** consumer repo (framework signals only — deps, scripts, CI files):

| Gap id | When |
|--------|------|
| `deploy-path-lint-script-missing` | Build embeds ESLint; no `lint` / `eslint` script |
| `deploy-path-lint-not-in-ci` | Lint script exists; CI workflows never run it |
| `deploy-path-lint-no-ci` | Build embeds ESLint; no CI workflows at all |
| `deploy-path-typecheck-script-missing` | Build typechecks; no `typecheck` script |
| `deploy-path-typecheck-not-in-ci` | Typecheck script exists; CI never runs it |

Respects `eslint.ignoreDuringBuilds: true` in `next.config.*`. Recommended pre-merge
order (universal): `lint` → `typecheck` → `arkgate-check` / `check:architecture` → `build`.

### Empty scope, include roots, and contract adopt

When `include` matches **zero** TS/JS files, plan/doctor treat that as **not done**
(`goal.emptyScope`, adoption gap `empty-scope`) — never “clean architecture.”

The **verdict path refuses** in that state rather than passing: a plain or `--strict`
`ark-check` over zero governed files exits 1 with `ANALYSIS_COVERS_NO_FILES`, because
every rule is vacuously satisfied on an empty set. It fires when source exists under the
analyzed root and the contract governs none of it, or when the analyzed root is not the
root you asked for (a contract found outside `--root` makes ArkGate adopt the contract's
directory). A genuinely greenfield repo — no governable source anywhere under the root
you asked for — still passes, so `ark init` can land a contract before the code.

"Source exists" is answered by a probe the contract cannot steer: it ignores `exclude`
(otherwise `exclude: ["**"]` would buy a green), skips dot-directories, never follows a
symlink, skips `*.config.*` (a repo whose only TS is `vite.config.ts` is greenfield, not
a mismatch), and stops at 200 files — the message says *at least N* when it did.

The commands below are exempt on purpose: they are how the refusal gets diagnosed and
fixed, so `--plan`, `--coverage` and `--doctor` still exit 0 on an empty scope and report
`empty-scope`. **Do not gate CI on a report mode** — gate on `ark-check` / `--strict`.

```bash
npx ark-check --suggest-include --json    # workspaces + nested package.json+TS roots
npx ark-check --adopt-contract --write  # expand include + UI patterns (no rule weakening)
npx ark-check --coverage
```

Polyglot repos: Ark only governs TypeScript/JS. Point include at package roots that have sources.

### Which rules can be enforced (`--sensors`, `--promote`)

Promotion — moving a rule from `advisory` to `enforced` — used to be discovered
by trial. Edit the ArkRules JSON, wait for a full run (~160s on a real
repository), read the result, `git checkout` it back. Four attempts before the
map was clear, and one of them ended in a rejection naming a sensor id the
author had never typed: a rule called `types-only` refused with *"sensor
`no-anemic-model` is Tier-2 advisory-only"*.

Both surfaces are read-only by default and neither invents a second opinion:
they project the same declarations the gate reads.

```bash
npx ark-check --sensors [--json]              # the map: what can ever be enforced
npx ark-check --promote [--json]              # the price: what enforcing would cost, one run
npx ark-check --promote <ruleId> --apply      # write mode "enforced" into that rule's own file
```

**`--sensors`** lists every sensor ArkGate ships — ArkRules, ArkRun and
ArkOrder — with its plane, its tier and whether it can *ever* be enforced, so
Tier-2 shows up before you write the rule rather than after you wait for a run.
ArkOrder: `proposeRelease` then `apply`; `refreshSigma`; ingest residual;
capacity pack; `ReleaseStore`; ArkRun `decisionTape`. No `/ark-order` skill.
It also says *how*: only the ArkRules plane is promoted per rule; ArkRun and
ArkOrder are switched by the plane-level `arkRun.mode` / `arkOrder.mode`, and
`--promote --apply` writes ArkRules documents only.
Underneath it lists every rule the contract actually declares, each with its
local id, the sensor it delegates to, the layer, the file it was declared in,
its current mode, and the reason it can or cannot be promoted. Three things
block a promotion, and the surface names which one fired:

- **`tier-2-advisory-only`** — the sensor is a heuristic (`no-anemic-model`,
  `arkrun-skip-resolve`). Advisory forever; the contract rejects `enforced`.
- **`no-structure-teeth`** — `invariant-coverage` as a *structure* entry emits
  nothing (coverage is judged per entry in `invariants`), so enforcing it would
  change nothing. Promote the invariant instead.
- **`no-coverage-evidence`** — an invariant whose evidence does not support
  promotion. The text is `canPromoteInvariant`'s own, so this surface can never
  promise a promotion the gate then refuses.

It needs no TypeScript and runs no analysis: the contract, the ArkRules
documents it points at, and the coverage evidence walk (a filesystem walk plus a
text match — ArkGate never executes a test). Exit 0 on a report, **2** when the
contract or its ArkRules references will not load, or when the governed-file
scan itself fails — reporting every invariant as uncovered because ArkGate could
not collect the inputs would be our limitation printed as a fact about your
tests.

**`--promote`** adds the price. Advisory rules are already evaluated on every
run, so the findings each one produces are sitting in the analysis that just
happened, stamped with the rule that produced them: **one** run prices **every**
declared rule, which is the whole difference from the loop it replaces. A
promotable advisory rule with zero findings today is a free promotion; one with
seven is seven findings that stop being warnings and start failing the gate.

Findings are counted per `<sourceFile>#<ruleId>`, not per bare id. Rule ids are
unique inside one ArkRules document, not across them, so two layer files may
both declare `shared-id` — keyed on the id alone their findings pool and each
row reports the other's as its own.

**A price the run could not measure is never printed as a price.** Two things
qualify the numbers, and both are named above them rather than left implied:

- **Incomplete analysis.** Parse failures suppress findings, so the count is a
  floor, not the cost.
- **The classification floor.** Below it every enforced ArkRules finding is
  demoted to a warning, so promoting buys a label and not a tooth — the gate
  would still pass. `wouldBlock` drops to zero and the run says so. Classify
  more of the tree (`--coverage`) before promoting.

Plan by default — there is no `--dry-run` anywhere in `bin/`. `--apply` needs
one named rule id: `--promote <ruleId> --apply`, or `--promote=<ruleId>` when
the id starts with `-`. It refuses a bare `--promote --apply` rather than
rewriting the contract in bulk behind a single flag, refuses an id declared in
two documents rather than silently writing the first, and refuses to make a
contract change on a cost this run did not measure. `--promote` cannot be
combined with a mode that answers first (`--sensors`, `--coverage`, `--plan`,
`--doctor`, …) — that printed the report and exited 0 having written nothing —
nor with `--changed` / `--against` / `--baseline`, which narrow or suppress the
findings the price is made of.

The write binds to the rule that was priced (an edit that changed its sensor in
between is refused), writes every byte before it truncates so a failed write
cannot leave the project without a loadable contract, and names its refusals:
`symlink`, `hard-link`, `not-utf8`, `outside-root`, `short-write`. A document
that was already indented keeps its indentation and trailing newline; a minified
one comes back pretty-printed, because the write is a JSON round-trip rather
than a targeted text edit. Exit 0 for a preview or a successful write, 1 for an
unknown rule id or a refused write, 2 for bad arguments or ArkRules references
that will not load.

### Literal path drift after a rename (`--path-drift`)

A repo path written inside a **string, a comment or a docstring** is invisible to
the rest of the gate: `tsc` resolves imports, not strings, and ESLint does not
either. A rename therefore compiles green and the reference lies afterwards.

```bash
npx ark-check --path-drift --base-ref origin/main          # preview
npx ark-check --path-drift --base-ref origin/main --write  # apply the anchored fixes
npx ark-check --path-drift --base-ref origin/main --all    # + the unanchored sweep
```

Two modes, because they make different claims:

- **Anchored** (default) — the referenced path is gone and exactly one rename in
  `git diff --find-renames <base-ref>` says where it went. A finding
  (`LITERAL_PATH_DRIFT`) normally carries a replacement written in the author's
  own form (alias stays alias, relative is recomputed relative, a path with no
  include-root prefix keeps its coordinate space); the fix is one-directional
  and `--write` applies it. Exit 1 while anchored drift remains. Three things
  must hold before a replacement is offered at all: a rename explains the
  reference, the destination itself resolves (otherwise the "fix" only moves the
  drift), and the destination is path-shaped — a git path is raw bytes, and a
  destination containing a quote or a newline would edit the program rather than
  repair a reference. A finding that clears the first two but whose destination
  leaves its own alias root is reported with the target only and marked *rewrite
  by hand*; `--write` never touches it, so the summary counts writable
  replacements separately.
- **Unanchored** (`--all`) — a literal that looks like a repo path and does not
  resolve, with nothing to say where it went (`LITERAL_PATH_UNRESOLVED`).
  Advisory: never written, never fails a run. It is opt-in because ArkGate
  cannot tell a dead reference from an illustrative one, and reporting the
  difference as if it could would be our limitation stated as a fact about your
  code. The **count is always printed**, listed or not.

Three exit codes, so a pipeline can tell the three outcomes apart from the
status alone:

| exit | meaning |
| --- | --- |
| `0` | anchored mode ran and nothing is left |
| `1` | anchored drift remains |
| `2` | anchored mode could not run (no usable base ref) — this run proved nothing |

A green tick is printed only for `0`. With no usable base ref the run prints
`○ Anchored mode did not run` and exits `2`: a tick, or a zero status, over a
check that never happened is the false green this pass exists to remove.

`--write` refuses rather than risks the file, and every refusal is named in the
output: a symlinked leaf or parent (`symlink`), a hard link to a file the repo
does not own (`hard-link`), content that is not valid UTF-8 (`not-utf8` — a
whole-file rewrite would replace the offending byte with U+FFFD), a token that
has moved since the scan (`token-moved`), and anything resolving outside the
root (`outside-root`). The read-modify-write goes through a single
`O_NOFOLLOW` descriptor, so the path is never resolved twice.

The rename set is taken against the working tree, so a rename that is staged
but not yet committed is covered — the moment the drift is cheapest to fix. (A
bare `mv` without `git add` is invisible to rename detection: its destination is
untracked.) Without a usable base ref the
run says so instead of printing a green.

The pass reads the contract for one thing only — `include`, to learn which
prefixes a path may be written under — and ignores `exclude`: a contract must not
be able to hide drift from the pass that reports it, and a contract too broken to
parse is no reason to stop looking either. Scope: every text format where a repo
path is written by hand (`.ts .tsx .mts
.cts .js .jsx .mjs .cjs .css .scss .json .md`) — deliberately wider than the
TS/TSX gate the type-aware passes use, because a comment is not code and the
class was first found in a `.css` file. Generated files are skipped, and every
file the walk refuses is counted by reason in the output.

### Presets

- `hexagonal` / `layered` / `feature-sliced` / `monorepo` / **`ui-surface`** (UI/Vite/Remotion-style) / **`vertical-slice`** (features/* + peerIsolation) / **`ddd-bounded-contexts`** (contexts/*/domain|application|infra + shared kernel)

### Cycle policy

```json
{ "cyclePolicy": "strict" }
```

- `strict` (default): value cycles fail the check  
- `soft` / `framework-soft`: value cycles are **warnings** only  
- `off`: skip cycle detection  

Type-only edges never form cycles (codegen-safe).

### Generated files and type-only cycles

By default Ark **does not scan** common codegen paths:

- `**/*.gen.ts`, `**/*.gen.tsx`
- `**/*.generated.ts`, `**/*.generated.tsx`

Override with `"excludeGenerated": false` or extend with top-level `"exclude": ["**/vendor/**"]`
in `ark.config.json`.

**Circular dependencies** are computed on **value/runtime** import edges only. A cycle
closed solely by `import type` (common with generated route trees) is **not** reported as
`CIRCULAR_DEPENDENCY`. Value cycles still fail.

### MCP `ark_recommend` and `/ark-adopt` (Phase C)

The `ark-mcp` server exposes **`ark_recommend`** — same JSON as
`ark-check --recommend --json`. Call it (or invoke `/ark-adopt`) before
generating project structure on greenfield or early-adoption repos.

`ark-mcp --session-context` appends a one-line enthusiast hint when governed
coverage is low or the config is fresh:

```
New to Ark? /ark-adopt or: arkgate-check --doctor
```

The `/ark-adopt` skill ships in `templates/skills/ark-adopt.md` (leftover
`/ark-architect` is a shortcut) and installs via `ark-check --install-agent-gates`.

### Adoption plan artifact (Phase E)

```bash
npx ark-check --recommend --write-plan
# writes ark-adoption-plan.json (optional commit; never weakens the gate)
```

Includes `archetype`, `preset`, `adoptInOrder`, `galleryStarter`, and suggested
`policyPack` (`enthusiast-<preset>`).

### Enthusiast policy packs (Phase E)

```bash
npx ark-check --list-policy-packs
npx ark-check --apply-policy-pack enthusiast-hexagonal   # or layered, feature-sliced, monorepo
```

Packs delegate to the same preset factories as `ark init --preset`; layer
descriptions are shorter enthusiast copy. Metadata: `templates/policy-packs/`.

### Enthusiast documentation track

Diátaxis pages under [docs/enthusiast/](enthusiast/README.md) — tutorial, how-to,
reference, and explanation for the full path (recommend → init → gallery → gates → verify).

### Agent workflow (before codegen)

**Default path first:** `ark start` → `ark start --apply` → `ark-check --doctor`. Do action #1; do not skill-shop around it.

Greenfield / empty-tree **depth** (only when doctor or a thin tree points here — not a second day-zero curriculum):

1. Run `ark-check --recommend --json` or MCP `ark_recommend`.
2. Read `archetype`, `preset`, and `adoptInOrder.phase1` — scaffold only those directories first.
3. Run `ark init --archetype <id> --yes`, `--apply-policy-pack enthusiast-<preset>`, or `ark init --preset <preset> --yes` when no `ark.config.json` exists (or let `ark start --apply` install the compact contract).
4. Optional: `--write-plan` for `ark-adoption-plan.json`; copy a gallery starter from `examples/README.md`.
5. Use `/ark-place` or `ark_place` for individual files after the contract exists.
6. Re-check with `ark-check --doctor`, then `ark-check --root . --config ark.config.json --strict`.

### Golden pattern for new code (Q03)

When the team has picked **one** layout style for *new* files (after Shape / pilot),
you may record it as an optional side-car:

```json
// .ark/golden-pattern.json
{
  "schemaVersion": "1",
  "name": "vertical-slice features",
  "norm": "New features live under src/features/<slice>/; shared only in src/shared/.",
  "newCodeHome": "src/features/",
  "examplePath": "src/features/billing/createInvoice.ts"
}
```

| Rule | Meaning |
|------|---------|
| **Optional** | Missing file is fine — no claim, no error. |
| **Advisory** | `ark_place` / `ark_prepare_write` and doctor attach `goldenPattern` for **new** code only. |
| **Not a gate** | Does **not** ENFORCE, does **not** clear design-weak, does not replace `ark.config.json`. |
| **Malformed** | Invalid JSON or missing `name`/`norm` → `invalid: true`; fix or delete — do not treat as guidance. |

Legacy paths stay migrate-on-touch; the golden norm limits where agents put **new** code.

### Write protocol (2.10+ / Track W)

Prefer preparing the write before the host commits it to disk:

| Surface | Role |
|---------|------|
| MCP **`ark_prepare_write`** | Place + constrain + validate + optional `autoPatch` + `judgmentBrief` + contentHash + optional `goldenPattern` in one call |
| MCP **`ark_prepare_change`** | Validate one complete create/update/delete batch in memory; optional `changeMap` also returns structural convergence; never writes |
| CLI **`ark preflight --changes <file> --json`** | Same atomic verdict and map convergence for hosts/scripts that do not call MCP |
| Write-gate **`autoPatch`** | Mechanical-safe **import type** rewrites only; post-patch lexical validation must pass or the patch is discarded. It remains `partial`/non-green until complete-candidate preflight. |
| PreToolUse **`--hook-repair`** | On deny: `ARK_REPAIR_JSON` / `ARK_AUTOPATCH_JSON` on stderr (still exit 2 — never silent write) |
| Opt-in design delta | `--fail-on-new-smells --base-ref <ref>` blocks only new/worsened supported smells; missing base fails closed; schema: `arkgate/schema/design-delta` |
| Doctor **`writePath`** | Schema-backed support/assets/runtime/operation/bypass/required/`hard` evidence; only fresh covered-operation proof permits `hard:true` |
| Doctor **`goldenPattern`** | Optional Q03 advisory summary (`present` / `invalid`); never clears design-weak |

**Published 3.7.0 limitation:** its compiler-free atomic graph can miss aliases/workspace edges.
The current source candidate closes that divergence through versioned resolved-candidate facts;
API, bundle, CLI, MCP, complete-patch hook, and final strict check share the same candidate evidence.
Lexical/single-snippet feedback remains explicitly partial and non-green. The normal strict gate is
still the required final merge boundary.

Port-proof inject binding is **judgment** for auto-apply (signature/arity change), not write-path autoPatch.
Full reference: [ai-gates.md](ai-gates.md). Loop-cost harness: `npm run eval:loop-cost`.

Blocking diagnostics carry one deterministic `nextAction` in both human and JSON output. Complete
Codex `ApplyPatch` payloads use the same atomic batch engine as CLI/MCP before single-file safety
checks; this improves early feedback without upgrading Codex's bypassable hook to a universal hard
boundary. Removing `AGENTS.md`, skills, or session context never changes the contract verdict.

Do not invent layers outside the 11-layer profile or named presets. Unrecognized
directories (`utils/`, `lib/`) must be classified explicitly via `/ark-adopt`.

**Brownfield** (existing messy repo): use `/ark-adopt` and [brownfield-adoption.md](brownfield-adoption.md). `/ark-architect` is a leftover shortcut to the same door.

## Supported agent hosts

**Day zero** is the compact path from `ark start` / `ark start --apply` (router + write path + CI plan) — not the full skill pack.

Wire write-gate + MCP for the active host; add the full `/ark-*` skill pack only as **expert depth** (`--skills-only` or full install when you want guided autopilot):

```bash
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok,antigravity,opencode
# expert pack on an existing compact install:
# npx ark-check --install-agent-gates --skills-only --force
# alias: npx ark-check --install-agent-gates --tools claude,cursor,codex,grok
```

| Host | Installed paths | Skills path |
|------|-----------------|-------------|
| Claude Code | `.claude/settings.json` hook + `.mcp.json` / `claude mcp add` | **Repo:** `.claude/skills/<name>/SKILL.md`; **home:** `$CLAUDE_HOME/skills` (default `~/.claude/skills`, `--claude-home`) |
| Cursor | `.cursor/mcp.json` + `.cursor/rules/ark.mdc` | **Repo:** `.agents/skills/<name>/SKILL.md` (same catalog as Codex). Do not also copy into `.cursor/commands/` or `$CODEX_HOME/skills` — Cursor lists every path it scans. |
| OpenAI Codex | `.codex/config.toml` (project primary, relative `--root .`; configured on disk is not runtime-active until restart + `ark_identity` match); optional legacy `$CODEX_HOME/config.toml` fallback uses absolute roots and scoped secondaries — see [ai-gates.md](ai-gates.md) | **Repo:** `.agents/skills/<name>/SKILL.md`; **home:** `$CODEX_HOME/skills/<name>/SKILL.md` (`--codex-home`) |
| **Grok Build** | `.grok/hooks/ark-write-gate.json` + `.grok/config.toml` / `.mcp.json` | **Repo:** `.grok/skills/<name>/SKILL.md`; **home:** `$GROK_HOME/skills` (default `~/.grok/skills`, `--grok-home`) |
| Google Antigravity | `.agents/hooks.json` + `.agents/mcp_config.json` (+ `GEMINI.md` for shared Gemini consumers) | **Repo:** `.agents/skills/<name>/SKILL.md`; **home:** `$ANTIGRAVITY_HOME/skills` (default `~/.gemini/config/skills`, `--antigravity-home`) |
| OpenCode | `opencode.json` MCP (`type: local`; advisory) | `.opencode/skills/<name>/SKILL.md` |

This is a path reference, not a guarantee table. Full copy-paste setups:
[ai-gates.md](ai-gates.md). Skill inventory: main
[README](../README.md#other-skills-only-when-you-need-them).
When several repositories share one machine, repo catalogs stay pinned and isolated; unchanged
skill bodies are not rewritten for a version stamp. Shared **home** catalogs (Codex since 4.2;
Claude/Grok since 4.6; Antigravity since 4.8.5) are the machine floor: always latest additive, never downgrade. Refresh
with `--agent-homes` (or `--claude-home` / `--grok-home` / `--antigravity-home` / `--codex-home`). Absent home trees
are normal — doctor stays quiet until `ark-*` skills exist there. Pre-4.2 binaries ignore Codex
home metadata and lock, so upgrade legacy repos before they write the optional Codex home
catalog. See [AI gates — Codex skill catalog](ai-gates.md#codex-skill-catalog-skillmd-not-flat-prompts)
and [shared Claude/Grok/Antigravity homes](ai-gates.md#shared-claude--grok-home-skills).

### Install skills — Ark and ecosystem {#install-skills-ark-and-ecosystem}

The same **13** skill names ship two ways. **No new skill names** (4.3 freeze): packaging and
routing only.

| Channel | What it installs | When to use |
|---------|------------------|-------------|
| **Ark install** | Host skill catalogs + optional hooks/MCP/CI wiring via `--install-agent-gates` | Default for projects that want write-path gates and version-stamped managed catalogs |
| **Agent Skills ecosystem** (`npx skills`) | The Agent Skills layout only (`<name>/SKILL.md`) into host skill dirs | Hosts already on the open skills channel; discovery without running Ark install |

**Canonical authoring source:** flat `templates/skills/<name>.md` (Ark install reads these).

**Agent Skills package root** (generated, 1:1 content): `templates/agent-skills/<name>/SKILL.md`
— ships in the npm tarball under `templates/`. Drift guard: `npm run check:agent-skills`.

```bash
# Ark — expert skill pack (preferred when you also want gates)
npx ark-check --install-agent-gates --skills-only --force

# Ecosystem — from installed package or a git checkout
npx skills add ./node_modules/arkgate/templates/agent-skills
npx skills add ./templates/agent-skills
# GitHub tree:
npx skills add https://github.com/pedroknigge/arkgate/tree/main/templates/agent-skills
# List without installing:
npx skills add ./node_modules/arkgate/templates/agent-skills --list
```

Frozen names: `ark-adopt`, `ark-architect`, `ark-autopilot`, `ark-contract`, `ark-coverage`,
`ark-explain`, `ark-explore`, `ark-fix`, `ark-loop`, `ark-place`, `ark-runtime`, `ark-think`,
`ark-upgrade`. Root API: `ARK_SKILL_NAMES` / `validateAgentSkillsPackage` (Domain
`agentSkillsPackage`). Skills are **process** depth — they never decide pass/fail; enforcement
remains `ark-check` / hooks / CI.

For an optional executable adoption check, copy the shipped template into a Vitest/Jest suite
after installing ArkGate:

```bash
mkdir -p tests
cp node_modules/arkgate/templates/tests/ark-adoption-gaps.test.ts tests/ark-adoption-gaps.test.ts
```

It checks real on-disk contract, MCP, skill, and report artifacts; it does not mock the gate.

## ArkRun kernel: contract discovery

The **ArkRun** kernel (`arkgate/runtime`) is currently **experimental** and is not required for
static gate adoption or presented as production-ready. From **4.8.0** it lives in the same
`arkgate` tarball (ADR 0031). `@arkgate/runtime` is **deprecated leftover** — do not
`npm i @arkgate/runtime` for new work. If you are evaluating it, prefer
`createStrictArkKernel()`. Each call creates an isolated instance — there is no process-wide
singleton. It wires the registry, graph,
policies, event bus, audit trail, event contracts, outbox, observability,
projections, metadata, workflow engine, and 11-layer architecture profile:

```ts
import {
  createStrictArkKernel,
} from 'arkgate/runtime';

const ark = createStrictArkKernel();
// ... define intents, event contracts, metadata, projections, and workflows through ark.*

const contract = ark.manifest().toJSON();
// contract.intents, policies, entities, graph, architecture, eventContracts,
// contract.observability, projections
```

Use `arkgate/runtime` only when evaluating the experimental ArkRun kernel. One install:
`npm install arkgate`. The stable `arkgate` **root** export remains the gate (no kernel factory).
`@arkgate/runtime` is a deprecated leftover 0.x companion (`experimental` dist-tag) for existing
pins. Package surface policy: [package-surface.md](package-surface.md).

Agents should read `contract` and `ark.observability.report()` before generating or modifying code.

## Naming Conventions

| Prefix | Layer | Example |
|--------|-------|---------|
| `Domain.*` | Domain events & entities | `Domain.Order.OrderPlaced` |
| `Application.*` | Use cases / orchestration | `Application.PlaceOrder` |
| `Adapter.Persistence.*` | Persistence adapters | `Adapter.Persistence.OrderRepo` |
| `Adapter.Integration.*` | External integrations | `Adapter.Integration.PaymentGateway.Charge` |
| `Workflow.*` | Sagas / long-running processes | `Workflow.OrderFulfillment` |
| `Job.*` | Background jobs / scheduling | `Job.InventoryRebuild` |
| `Presentation.*` | UI/API adapters | `Presentation.Api.PlaceOrder` |
| `Reporting.*` | Read models / projections | `Reporting.OrderSummary` |
| `Metadata.*` | Metadata and extension contracts | `Metadata.OrderSchema` |
| `Security.*`, `Audit.*`, `Observability.*` | Cross-cutting concerns | `Audit.OrderHistory` |
| `Kernel.*` | Ark-owned governance signals | `Kernel.PolicyViolation` |

Declare relationships at definition time:

```ts
registry.define('Application.PlaceOrder', {
  dependsOn: ['Domain.Order.OrderPlaced'],
  produces: ['Domain.Order.OrderPlaced'],
});
```

Strict kernels also enforce the **observed** producer→event layer flow at publish time
(`enforceObservedLayerFlow: 'hard'` by default). If a published event's real source and
intent cross a forbidden layer boundary — e.g. a `Adapter.Persistence.*` source producing
a `Domain.*` event — the publish throws `ObservedLayerFlowViolationError` before the event
reaches history, outbox, or subscribers. Use `'soft'` to record `layer.observedViolation`
trace/audit records without blocking, or `'off'` to disable. Agents should name the event's
`source` honestly: it is checked against the layer matrix, not just the intent name.

Strict kernels also require published events to have a registered source intent
and a matching event contract:

```ts
const OrderPlaced = registry.define<
  'Domain.Order.OrderPlaced',
  { orderId: string; amount: number }
>('Domain.Order.OrderPlaced');

registry.define('Application.PlaceOrder', {
  produces: ['Domain.Order.OrderPlaced'],
});

ark.eventContracts.register({
  intent: 'Domain.Order.OrderPlaced',
  version: '1',
  allowAdditionalFields: false,
  schema: {
    orderId: { type: 'string', required: true },
    amount: { type: 'number', required: true },
  },
});

const publisher = ark.publisher('Application.PlaceOrder');

await publisher.publish(OrderPlaced, { orderId: 'o1', amount: 99 }, {
  eventVersion: '1',
});
```

Agents should prefer `ark.publisher(sourceIntent).publish(...)` over direct
`eventBus.publish(...)`. Source-bound publishers stamp `metadata.source` internally and
reject attempts to override it with a different source.

Interceptors may enrich event payloads, but they must remain add-only:

```ts
ark.eventBus.registerInterceptor(OrderPlaced, ({ intercept }) => {
  intercept({ auditTag: 'checkout' });
}, 'audit-tag');
```

If an interceptor overwrites an existing field or violates the registered event
contract, Ark records `interceptor.error` and keeps delivering the original event.

## Code Generation Validation

Use `createAICodeGate()` for early lexical feedback on agent-generated source snippets, then run
complete-candidate preflight before merging:

```ts
import * as ts from 'typescript';

const gate = createAICodeGate({
  intents: registry.list(),
  enforceIntentAllowlist: true,
  architectureProfile: elevenLayerProfile,
  typescript: ts,
  extensions: [/* optional external AST analyzers implementing AIGateExtension */],
});

const result = gate.validate(generatedSource, {
  filePath: 'src/domain/order.ts',
  agentId: 'agent-1',
  layer: 'DomainModel',
});
if (!result.lexicalValid) {
  for (const v of result.violations) {
    console.log(v.code, v.message, v.suggestion);
  }
}
// result.valid remains false: call ark_prepare_change / preflightResolvedChange,
// then run the final strict repository check.
```

Passing the `typescript` module enables built-in AST/symbol checks for dependencies, forbidden
ambient globals, raw publish calls, missing `metadata.source`, and source-layer mismatches.
`ark-mcp` enables these checks automatically when TypeScript is available. The exact supported
syntax and unresolved-dynamic policy are documented in
[Scanner soundness envelope](ai-gates.md#scanner-soundness-envelope).

Relevant violation codes include `LAYER_IMPORT_VIOLATION`, `FORBIDDEN_GLOBAL`,
`DYNAMIC_IMPORT_NOT_ALLOWLISTED`, `DYNAMIC_REQUIRE_NOT_ALLOWLISTED`, `RAW_EVENT_PUBLISH`,
`PUBLISH_MISSING_SOURCE`, `PUBLISH_SOURCE_LAYER_MISMATCH`, `FORBIDDEN_PATTERN`,
`FORBIDDEN_SUBSTRING`, `FORBIDDEN_IMPORT`, `POLICY_VIOLATION`, `UNKNOWN_INTENT`,
`LAYER_REFERENCE_VIOLATION`, `EXTENSION_ERROR`, and `AST_ANALYZER_ERROR`.

**Full catalog (ACS02):** every public `ruleId` with why/fix anchors lives in
[diagnostics.md](diagnostics.md) (stable fragment `#RULE_ID`) and the root API
`DIAGNOSTIC_CATALOG` / `getDiagnosticCatalogEntry` / `diagnosticDocsPath`. Agents must not
invent free-form rule ids outside that closed vocabulary.

Use `ark-check` in CI for repository-level checks that need real file paths:

```bash
npx ark-check --root . --config ark.config.json
```

### Monorepo tooling (Turborepo / Nx)

Use **`ark init --preset monorepo`** (or archetype `multi-app-workspace`). Ark does **not**
reimplement the Nx project graph. It maps conventional trees:

| Tooling | Typical roots | Ark `include` fallback |
|---------|---------------|------------------------|
| Turborepo | `apps/`, `packages/` | `packages`, `apps`, `libs` |
| Nx | `apps/`, `libs/` | same |

Layers still match by folder **name** (`**/domain/**`, `**/application/**`, …) across packages.
Doctor surfaces `turbo.json` / `nx.json` as monorepo tooling hints.

### Nest modular monolith

Prefer **`hexagonal`** with Nest filename overlays (`*.controller.ts` / services). If you
literally have `src/contexts/*` bounded contexts, use **`ddd-bounded-contexts`**. Do not
invent a separate Nest-only engine — modules map to `src/**/domain/**` style globs already.

### Clean / Onion aliases

`ark init --preset clean-architecture` and `--preset onion-architecture` are **aliases** of
`hexagonal` (same layer matrix). Prefer the hexagonal name in docs; aliases exist for
discoverability.

### Peer isolation (cross-slice bans)

Classic rules deny **layer A → layer B** always. **Same-layer is always allowed** unless a
rule sets `peerIsolation: true`.

`peerIsolation: true` + `allowed: false` means: deny **only when importer and importee
resolve to different slice ids** (works for same-layer *and* cross-layer pairs). Same-slice
edges are not denied by that rule.

```json
{
  "from": "Features",
  "to": "Features",
  "allowed": false,
  "peerIsolation": true
}
```

- **Denied:** `src/features/auth/**` → `src/features/payments/**` (different slice id).
- **Allowed:** same-slice imports when both paths classify; classic non-peerIsolation denies still apply across layers.
- **`sliceFolders`:** optional parent segments (default: inferred from layer globs).
- **Fail-closed:** missing paths, empty/unresolvable slice folders, or unclassifiable either side → **deny** via peerIsolation (cannot prove same-slice).
- **`sharedRoots`** (4.8.4): roots the repo declares shared on purpose (`["ui", "hooks", "lib/permissions"]`). A file under a declared shared root is evidence, not an unclassifiable path, so fail-closed stops firing on every shared file. **Anchored** — the root starts the path, optionally after one `src/` or `app/`; write deeper or monorepo roots out (`packages/web/src/ui`) or glob them, and a bare `*` / `**` is refused. A path that still resolves to a slice keeps its slice.
- **`allowedCrossSlice`** (4.8.4): `[{ "from": "features/checkout", "to": "features/catalog" }]` — one directed slice→slice edge the repo declares on purpose. The reverse still denies.
- **The denial names its reason:** `cross-slice edge a → b` (a fact about the code) vs `unclassifiable path (…)`, `no slice folders`, `no path evidence` (facts about the evidence ArkGate had).
- Promoting a genuinely shared slice to its own layer remains the recommended model; the two declarations exist so ArkGate can enforce a repo that deliberately chose otherwise.
- Enforced by `ark-check`, `arkgate/eslint`, and `ark-mcp` (path-aware edges and path-less intent refs share the same SoT).
- Fixes are **judgment** (not mechanical-safe).

Agents can generate a config from the project's actual directory layout instead of inventing layer mappings:

```bash
npx ark-check --init
```

Or print the full 11-layer template to adapt manually:

```bash
npx ark-check --print-config eleven-layer
```

Example config:

```json
{
  "include": ["src"],
  "layers": [
    {
      "name": "DomainModel",
      "patterns": ["src/domain/**"],
      "intentPrefixes": ["Domain."]
    },
    {
      "name": "PersistenceAdapters",
      "patterns": ["src/adapters/persistence/**"],
      "intentPrefixes": ["Adapter.Persistence."]
    },
    {
      "name": "ApplicationOrchestration",
      "patterns": ["src/application/**"],
      "intentPrefixes": ["Application."]
    }
  ],
  "rules": [
    {
      "from": "DomainModel",
      "to": "PersistenceAdapters",
      "allowed": false
    }
  ]
}
```

`ark-check` resolves relative, alias, package/workspace, `import =`, `import()` and `require()` edges
plus intent/publish evidence. It uses the nearest `tsconfig.json` unless `--tsconfig` is set;
importless type references are out.

Each run parses the full candidate and ignores retired `.cache/ark-check.json`; `--no-cache` is a
no-op. Z07 owns the identity-keyed snapshot after exact cold/warm parity.

Doctor JSON gives parse totals, deterministic top 12 and overflow. `partial` forces
`goal.met`/`valid`/`ok` false and strict exit `1`; unavailable exits `2`. Non-strict is advisory.

Config warnings stay advisory unless CI opts into `--strict-config`.

Use the optional ESLint plugin for fast local feedback aligned with CI:

```js
import ark from 'arkgate/eslint';

export default [
  ark.configs.recommended,
];
```

Rules: `ark/no-domain-infra-imports` (exact parity for on-disk, in-scope static relative
imports/exports; resolved CLI/preflight is authoritative outside that envelope),
`ark/no-forbidden-globals` (per-layer `forbiddenGlobals`),
`ark/no-denied-capabilities` (per-layer capability deny sets),
`ark/no-arkrun-kernel-in-domain` / `ark/no-arkrun-direct-new` /
`ark/no-arkrun-transport-bypass` (ArkRun extra; silent when absent; import / `new`
envelope only), `ark/no-raw-event-publish`, and
`ark/require-publish-source`. See [ai-gates.md](ai-gates.md).

## Runtime Observability

The event bus exposes a standard trace format:

```ts
const bus = createEventBus({
  maxHistorySize: 1000,
  auditTrail,
  traceSinks: [(record) => otelBridge(record)],
  onSoftViolation: (result, event) => { /* advisory policies */ },
  onHandlerError: (err, event, intent) => { /* subscriber failures */ },
});

await bus.publish(intent, payload);
const trace = bus.getTrace();
// trace[].type includes 'event.published', 'event.rawPublish', 'event.intercepted',
// 'interceptor.error', 'policy.hardViolation', 'policy.softViolation', 'handler.error'
```

Native audit records are available through `auditTrail.query()`. Projection
state and checkpoints are available through `ProjectionRegistry`.

`ark.observability.report()` compares declared productions with observed runtime
flows. Use `observedButUndeclared` as a high-signal review queue for hidden coupling.

For tests, use `createArkTestHarness(ark)` to inspect events, traces, audit,
outbox, and observability snapshots without reaching into private internals.

## Extension Points (External Layers)

Implement these interfaces in **external** packages — not inside the Ark core:

| Interface | Purpose |
|-----------|---------|
| `AIGateExtension` | Plug in AST/semantic analyzers for codegen validation |
| `Policy` | Custom architectural rules via `definePolicy()` |
| `LayerFlowRule` | Layer isolation via `defineLayerPolicy()` |
| `WorkflowStore` | Persist workflow snapshots outside memory |
| `ReadModelStore` | Persist projection/read-model state outside memory |
| `AuditStore` | Persist audit records outside memory |
| `OutboxStore` | Persist event outbox records outside memory |
| `EventInterceptor` | Add-only event enrichment before delivery |

## Ports and Adapters

When generating adapter code, prefer ports with explicit ownership and allowlists:

```ts
const PaymentGateway = definePort<PaymentGatewayPort>('PaymentGateway', {
  ownerLayer: 'ApplicationOrchestration',
  intent: 'Application.Port.PaymentGateway',
  allowedAdapters: ['Adapter.Integration.StripePaymentGateway'],
});

createAdapter(PaymentGateway, stripeAdapter, {
  name: 'Adapter.Integration.StripePaymentGateway',
  layer: 'IntegrationAdapters',
  requiredKeys: ['charge'],
});
```

`createAdapter` rejects adapter names/intents not listed in `allowedAdapters`; use
`checkAdapterGovernance(adapter)` when a tool needs a non-throwing result.

Preset: `elevenLayerProfile` plus `defineArchitectureProfilePolicy()` forbids invalid declared dependencies across the 11-layer profile. `architecturalPolicies.cleanArchitectureMatrix()` remains available for the older four-prefix model.

Runtime support depth varies by design. Layers with dedicated kernel modules:
DomainModel/ApplicationOrchestration (intents, policies), WorkflowSagaEngine
(workflow engine), PersistenceAdapters (adapters, outbox), ReportingReadModels
(projections), ExtensibilityMetadata (metadata registry), SecurityAuditObservability
(audit trail, drift reporter), Kernel (event bus, graph, manifest).
PresentationAdapters, IntegrationAdapters, and BackgroundJobsScheduling are
**boundary-only on purpose**: Ark governs what they may import and publish, but does
not replace your web framework, HTTP clients, or job scheduler.

## Write-Path Gate (MCP)

The strongest place to constrain an AI agent is the moment it writes a file, not after.
`arkgate-mcp` / `ark-mcp` exposes ArkGate over MCP (JSON-RPC over stdio; it prefers a usable
project TypeScript API, then exact `typescript-ark-host@6.0.3`) so a host can gate
the write path:

For a complete multi-file candidate, use `ark preflight --changes changes.json --json` or MCP
`ark_prepare_change`. Add `--change-map map.json` (or MCP `changeMap`) only for an explicit schema
`1.0` structural plan. Ark binds its normalized `changeMapHash` and compares the full candidate
against the current supplied base. `convergence.findings` separates satisfied, missing,
contradictory, and unplanned paths/edges; any structural mismatch rejects the batch. No map is
required, and `behavioralCompletion` remains `not-evaluated` even when structure converges.

```bash
npx ark-mcp --root . --config ark.config.json [--manifest ark.manifest.json]
```

- **Identity handshake** — first call `ark_identity` with:

  ```json
  {
    "project": {
      "expectedRoot": "/absolute/exact-project-root"
    }
  }
  ```

  Then reuse both `expectedRoot` and the returned `projectIdentity.projectId` as
  `project.expectedProjectId` on every later Ark tool call. `expectedProjectId` without
  `expectedRoot` can detect the wrong id, but it remains non-authoritative because it does not
  prove the current workspace root. The first handshake requires the exact project root; a
  contained descendant becomes authoritative only on later calls that also send the matching
  project id.
- **Tool `ark_manifest`** — authoritative contract discovery after the identity handshake.
  Serve an exported `ark.manifest().toJSON()` via `--manifest`. Without that flag, the tool uses
  every active layer and the effective rules from `ark.config.json`; the strict 11-layer profile
  is the fallback only when the project config declares no layers. Call it with the same root +
  project id expectation.
- **Resource `ark://manifest`** — compatibility discovery for standard MCP `resources/read`
  clients. That protocol request has no portable project-expectation field, so Ark always marks
  this resource `unverified` and non-authoritative. It never substitutes for `ark_manifest` in
  a project verdict.

The server exposes these thirteen tools. Every tool accepts the additive
`project: { expectedRoot, expectedProjectId? }` input:

| Tool | Primary input and purpose |
|------|---------------------------|
| `ark_identity` | `{ project: { expectedRoot, expectedProjectId? } }`: return the canonical root/config, stable project id, contract identity, and live runtime identity; use it before every other project-bound surface. |
| `ark_manifest` | No non-project args: return the machine-readable architecture contract with an authoritative binding after the identity handshake. |
| `validate_code` | `{ source, layer?, filePath? }`: validate one snippet; infer the layer from `filePath` when possible; return an error result when invalid. |
| `ark_check` | `{ strict?, baseline? }`: run the full project architecture check. `verdict` separates `identity`, `completeness`, `graph`, `coverage`, `gates`, and `overallOk`; no individual green fact substitutes for the combined verdict. |
| `ark_policy_delta` | `{ baseConfig, candidateConfig?, acknowledgement? }`: classify a complete contract transition; never edits the contract. |
| `ark_coverage` | No args: report per-layer counts, every unclassified file, unmatched layers, and missing rule edges. |
| `ark_place` | `{ filePath?, description? }`: resolve or propose a governed home and return its import/global constraints. |
| `ark_prepare_write` | `{ source, filePath?, description?, layer? }`: compose placement and snippet validation, with hashes and a mechanical-safe patch when available. |
| `ark_prepare_change` | `{ changes, changeMap? }`: preflight one complete create/update/delete batch in memory; never writes files. |
| `ark_recommend` | No args: return the deterministic application-shape plan used by `ark-check --recommend --json`. |
| `ark_suggest_include` | No args: propose TypeScript/JavaScript include roots from workspaces and nested packages. |
| `ark_rules_inventory` | No args: inventory possible intra-layer rules using configured layer evidence when available; test/fixture/seed/migration surfaces and narrow technical constants are excluded from extraction pilots. Counts are not a score. |
| `ark_status` | No non-project args: return the unified status-manifest envelope (identity binding, honest write-path activation, last-check summary, rules residual counts, primary next action). Same shape as `ark status --json`. Prefer after `ark_identity`. Never a score. |

Every project-bound tool success, tool error, and JSON-RPC error data carries:

```json
{
  "projectIdentity": {
    "schemaVersion": "1.0",
    "projectId": "sha256:…",
    "resolvedRoot": "/absolute/project",
    "resolvedConfigPath": "/absolute/project/ark.config.json",
    "arkgateVersion": "4.2.0",
    "contractHash": "sha256:…",
    "contractSource": "project",
    "runtimeId": "process-specific",
    "processStartedAt": "2026-07-30T00:00:00.000Z"
  },
  "binding": {
    "status": "matched",
    "authoritative": true
  },
  "authoritative": true
}
```

`projectId` stays stable across process restarts and contract edits; `runtimeId` and
`processStartedAt` identify this live process. Binding states are:

- `matched` — canonical `expectedRoot` is the exact project root, or it is a contained
  descendant and the caller also supplied the matching project id; `authoritative` is `true`;
- `unverified` — no expectation was supplied, or only the id matched; callable for legacy
  clients, but `authoritative` is `false`;
- `mismatch` — invalid/wrong root or id; `authoritative` is `false` and Ark returns
  `PROJECT_ROOT_MISMATCH`, `PROJECT_ID_MISMATCH`, or `INVALID_PROJECT_EXPECTATION`.

Roots, configs, manifests, TypeScript configs, and project-bound tool paths are canonicalized
through real paths. A config or file path outside the bound project fails before Ark returns
placement, golden-pattern, Layers, or ArkRules evidence. The MCP process never retargets itself
from tool input; disjoint projects need disjoint processes. The compatibility `ark://manifest`
resource also carries the identity envelope, but its binding is always `unverified` and
non-authoritative.

For `ark_check`, treat `verdict.overallOk` as the combined control-plane fact. It can be true only
when the binding is matched, analysis is complete, the graph is valid, coverage is complete
(non-empty, 100% governed, zero unclassified files), and both local-write and CI-merge gate state
are active. The underlying CLI fields remain present for diagnosis, but are not an authoritative
whole-project green on their own.

Current diagnostic envelopes use schema `1.5` and require `mode`,
`completeness: "complete" | "partial" | "unavailable"`, and structured
`completenessReasons`. Factory-emitted diagnostics carry stable `findingRef`, baseline-compatible
`targetKey`, and `docsCodePath` (ACS06). Resolved results expose `policyHash`, `resolverIdentity`,
`factsHash`, and `candidateTreeHash`; MCP `ark_check` mirrors CLI `ok`. Single-file
`validate_code`, `ark_prepare_write`, and `createAICodeGate().validate()` are named lexical
compatibility surfaces: they may expose `lexicalValid`, but remain partial and `valid:false` until
complete-candidate preflight. Consumer-owned 1.0–1.4 `AdapterResult` values remain accepted by the
public union (refs optional on those older envelopes).

For hook-based enforcement, `ark-mcp --hook` runs one-shot: it reads a PreToolUse payload
from stdin, validates the post-edit file content, and exits `2` with violations on stderr
to block the write (`0` to allow). `--root-env` accepts a prioritized comma-separated
environment-variable list; ArkGate uses the first populated value and otherwise keeps
the explicit `--root` fallback. Working Claude Code configuration
(`.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx ark-mcp --hook --root . --root-env CLAUDE_PROJECT_DIR"
          }
        ]
      }
    ]
  }
}
```

Register the server itself in `.mcp.json` so the agent can handshake with `ark_identity`, call
`ark_manifest`, and use `validate_code` on demand:

```json
{
  "mcpServers": {
    "ark": { "command": "npx", "args": ["ark-mcp", "--root", ".", "--config", "ark.config.json"] }
  }
}
```

On Claude/Grok, the installed PreToolUse hook makes matched writes an enforced checkpoint. Cursor
does the same for Write/StrReplace, and Codex CLI/local Desktop does so for complete
`apply_patch` calls after trust and runtime observation. MCP registration by itself remains
advisory on every host because the agent must call the tool.

Decision rationale: [ADR 0017 — MCP verdicts require explicit project identity](adr/0017-mcp-project-identity-binding.md).

## ArkRun kernel workflow (not the default path)

This section is for adopters who **opt into** the experimental **ArkRun** kernel
(`arkgate/runtime`; `@arkgate/runtime` is deprecated leftover). Construct it with `createStrictArkKernel` (per instance; no process-wide
singleton). It is **not** the Beautiful Path day-zero curriculum. Default remains: `ark start` →
doctor → compact router (and `/ark-autopilot` only after the skill pack).

1. **Read** manifest via `ark.manifest().toJSON()`
2. **Generate** code using registered intents, profiles, metadata, projections, and workflow definitions
3. **Inspect snippets** with `createAICodeGate().validate(source, { layer })` (lexical, partial)
4. **Validate the complete candidate** with `ark_prepare_change` or `ark-check --root . --config ark.config.json`
5. **Lint** with `arkgate/eslint` recommended rules
6. **Wire** relationships via `registry.define(..., { dependsOn, produces })`
7. **Register** event contracts before publishing in strict mode
8. **Observe** runtime via `bus.getTrace()`, `auditTrail.query()`, outbox records, projection checkpoints, and `ark.observability.report()`
9. **Optional loopback inspector** via `ark.startInspector()` — JSON facts only (see below); poll with `ark-dashboard` / `arkgate-dashboard` when you want a terminal view

### Dev inspector queue endpoints and dashboard bins

`startInspector()` / `startArkRunInspector()` bind loopback only, refuse
`NODE_ENV=production`, and lazy-load HTTP. The kernel exposes JSON monitor facts
(snapshot / graph / queue endpoints) — not a TUI.

| Method + path | Role |
|---------------|------|
| `GET /snapshot` (also `/`) | Information package + transport + observability snapshot |
| `GET /events` | SSE of the same snapshot |
| `GET /graph` | `requestGraph` slice (+ Mermaid helper) |
| `GET /outbox` | Outbox monitor: `available`, `pendingCount`, `failedCount`, `pending[]` / `failed[]` row summaries (`id`, `status`, `attempts`, optional `intent` / `error` / `updatedAt`) — **no event payloads** |
| `GET /workflows` | Workflows monitor: counts + `workflows[]` summaries (`id`, `name`, `status`, optional `currentStep` / `error`) |

Dual package bins **`ark-dashboard`** and **`arkgate-dashboard`**
(`bin/ark-dashboard.mjs`) poll `--url` (default `http://127.0.0.1:3000/snapshot`)
and sibling `/outbox` + `/workflows` on an interval (`--interval`, 200–60000 ms).
ANSI escape sequences + polling only — no React, Ink, or Blessed. There is no
`ark dashboard` dispatcher subcommand; invoke the dashboard bins directly.
Presentation stays in Tooling (`bin/`); do not couple a TUI into `src/kernel`.
