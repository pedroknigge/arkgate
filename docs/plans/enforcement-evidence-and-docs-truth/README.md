# Plan: Enforcement evidence modeling + documentation truth

> **Plan (seeded — Phase EH in the ROADMAP queue).** Library hub: [AGENTS.md](../../../AGENTS.md)<br>
> Related: [ROADMAP.md](../../../ROADMAP.md) · [docs hub](../../README.md) ·
> [product voice](../../product-voice.md) · [claims matrix](../../audit/claims-matrix.md) ·
> [enforcement-truth-at-speed](../enforcement-truth-at-speed/README.md) ·
> [field-gap-closure](../field-gap-closure/README.md) · [ai-gates](../../ai-gates.md)

**Status:** Shipped (Phase EH `EH01`–`EH08`; package **4.1.1 published**)<br>
**Slug:** `enforcement-evidence-and-docs-truth`<br>
**Kind:** epic / product-voice + evidence model + documentation audit<br>
**Owners:** product (Pedro) + library maintainers<br>
**Last updated:** 2026-07-25<br>
**Code path (existing):** `bin/lib/enforcement-honesty.mjs`, `host-support-matrix.mjs`,
`github-enforcement.mjs`, `ci-and-commands.mjs`, `html-report.mjs`, `write-path-*`, doctor/report
surfaces; public docs under `README.md` + `docs/`

---

## Problem

Two related honesty gaps showed up after **ArkGate 4.1.0** shipped:

### A — Field evidence model (Codex / soft hosts)

A real private TypeScript consumer (WAFI) under OpenAI Codex produced
[Codex integration feedback](../../../../WAFI/docs/reports/arkgate-codex-integration-feedback.md)
(2026-07-25). Source-checked against this tree:

1. Doctor collapses a **permanent soft-write host** into global **`Not finished`** with
   `primaryNextAction: null`, even when layers, ArkRules, CI, and pre-commit are ready.
2. **CI runtime green** is conflated with **unavailable branch-protection policy** (GitHub Free
   private HTTP 403 → generic `provider-enforcement-unverified` / `runtimeObserved: false`).
3. Generated workflow uses
   `github.event.pull_request.base.sha || github.event.before` without guarding the all-zero
   first-push SHA → `--fail-on-new-smells` exit 2 on day one.
4. `--report` appends `.ark/` to `.gitignore` via exact-line match and defeats
   `.ark/*` + `!/.ark/golden-pattern.json`.
5. Secondary: repair envelope vs reinjection, ops matrix, `arkgate-check` vs `ark-check` wording,
   Codex home skill-drift noise.

ArkGate is right not to invent hard write for Codex. The gap is **evidence taxonomy and product
voice**, plus two mechanical integration bugs.

### B — Documentation drift (README and the rest)

Product claim and maintainer surface risk:

- Public **README** and lane docs (`use` / `develop` / `ai-gates` / `agent-guide` / configuration /
  package-surface / releases / ROADMAP “Next session”) may lag **4.1.0+** behavior, dual-bin
  naming, doctor headline semantics, host matrix nuance, and CI templates.
- Last bounded [claims matrix](../../audit/claims-matrix.md) is **2026-07-22** (pre–4.1.0 field
  train close and pre–Codex WAFI feedback). Surface coverage was 100% then; **content accuracy**
  vs current code is unverified for the public lanes.
- ROADMAP “Next implementation session” can still describe older prepared versions while README
  markets `4.1.0` on npm — classic dual-truth between maintainer and consumer surfaces.
- Without a deliberate **deep docs audit**, engineering fixes to honesty land in code while the
  front door keeps teaching the old story (or a half-updated one).

**Why now:** field feedback is fresh, 4.1.0 is the published train, and further host polish without
docs truth will widen the dual-truth problem the product exists to prevent.

---

## Outcome

1. **Evidence model:** permanent environment / host limitations never masquerade as unfinished
   architecture debt; CI runtime, provider policy, contract readiness, and local write posture are
   independent facts with actionable next steps where a human can act.
2. **Artifacts:** first-push-safe CI template; report commands do not broaden `.gitignore` or dirty
   a compatible tree.
3. **Documentation truth:** every public claim on the use/develop/README/agent/CI path is
   **code-backed**, audience-correct, and free of stale version or “hard write” lies; residual
   unknowns are explicit in an updated claims matrix — not assumed OK.

---

## Users & success

- **Primary users:** Codex/Cursor/OpenCode adopters; brownfield teams reading README → doctor → CI;
  maintainers shipping honesty fixes without marketing drift.
- **Success metrics:**
  - Codex whole-tree green project is **not** labeled solely `Not finished` for `soft-write-host`.
  - Report still states Codex local writes are advisory/bypassable.
  - Successful CI run ≠ required status; GitHub Free 403 → `unavailable-plan` (or equivalent) with
    concrete next action.
  - First push with zero `before` SHA passes generated workflow.
  - HTML report does not append broad `.ark/` when `.ark/*` + exception already covers intent.
  - **Docs audit:** claims matrix refreshed with verdicts OK / Partial / Contradicted / Missing;
    zero Contradicted rows on public lanes before calling the epic closed; README and lane entries
    agree with `host-support-matrix`, doctor JSON shape (post-EH code), and published version truth.
- **Non-goals:** hard-write for Codex; new skill names; numeric architecture score; Z09 retention
  cohort; runtime productization; wholesale docs rewrite for style alone.

---

## MVP scope

| In MVP | Later / out |
|--------|-------------|
| Deep documentation audit (inventory + claims matrix + fix Contradicted/Partial on public lanes) | Marketing site rewrite, non-English localization |
| Split project readiness vs host/environment capability in doctor honesty | Full ops-matrix UI polish beyond JSON + report card |
| CI runtime vs provider-policy reason codes (incl. plan 403) | Org-wide GitHub App policy products |
| First-push-safe workflow (+ action.yml + ai-gates snippet) | Non-GitHub CI generators |
| `.gitignore` Ark-ignore matcher (no broader rule after negation) | General gitignore rewrite engine |
| Repair envelope emitted vs reinjection guaranteed; CLI vs status context copy | Claiming Codex reinjection hard |
| Product-voice + README/use/develop/ai-gates/agent-guide sync for EH behavior | Historical appendix archaeology |

---

## Workstreams

### Workstream 0 — Deep documentation review (gate before / alongside EH code)

**Intent:** `audit` then selective `integrate` (documentation-manager). **Code wins.**

This is not a light proofread. It is a **claims-vs-code** pass over every public authority, with
artifacts a maintainer can re-run.

#### 0.1 Inventory (read-only)

| Lane | Authority paths | Audit question |
|------|-----------------|----------------|
| Front door | `README.md` | Version badge, one-minute path, host matrix, CI wording, dual bins |
| Use | `docs/use.md`, `docs/product-voice.md`, `docs/enthusiast/` | Flow matches doctor; soft-host honesty; no false finished |
| Develop | `docs/develop.md`, `docs/ai-gates.md`, `docs/agent-guide.md`, `docs/configuration.md`, `docs/brownfield-adoption.md`, `docs/package-surface.md`, `docs/typescript-support.md` | Install/hooks/CI match generators; Codex section; dual-bin; ArkRules |
| Contribute | `CONTRIBUTING.md`, `ROADMAP.md` (Next session), `Agents.md` knowledge map | Queue truth; version pins; plan table |
| Releases | `CHANGELOG.md`, `docs/releases/*`, npm claim in README | Prepared vs published; no dual latest |
| Generated / templates | `templates/`, `action.yml`, hook snippets in docs | Same base-ref and status names as code |
| History (spot) | `docs/plans/*`, `docs/field/*`, `docs/audit/claims-matrix.md` | Not product front door; mark stale seeds |

#### 0.2 Claims matrix refresh

Re-open / extend [docs/audit/claims-matrix.md](../../audit/claims-matrix.md):

| Claim class | Examples | Verdict rule |
|-------------|----------|--------------|
| Version truth | “4.1.0 on npm latest” | Match `package.json` + npm/registry or mark Unverifiable |
| Host hardness | Codex hard write / repair | Must match `host-support-matrix.mjs` |
| Doctor semantics | “Not finished”, primary next action | Match `enforcement-honesty.mjs` (pre- and post-EH) |
| CLI names | `arkgate-check` vs `ark-check` | Dual-bin legal; status context named explicitly |
| CI template | base-ref, fail-on-new-smells | Match `ci-and-commands.mjs` / `action.yml` |
| ArkRules | opt-in, notAScore, dual plane | Match config + engine |
| Package surface | stable vs experimental | Match `package.json` exports + package-surface.md |

Deliverable: matrix dated **this audit**, with counts and top Contradicted/Partial list.

#### 0.3 README deep pass (explicit)

Treat README as the highest-risk surface:

- [ ] Choose-your-path and one-minute path still match product voice + doctor control plane.
- [ ] Host support table matches matrix (Codex/Cursor/OpenCode advisory; no hard-write lie).
- [ ] Required merge boundary language: **required status**, not “CI file present.”
- [ ] Dual bins (`arkgate*` / `ark*`) consistent; no single-bin exclusive teaching.
- [ ] Version strip and release links match publish truth (or say “prepared”).
- [ ] Links into use/develop/docs hub resolve; no orphan anchors.
- [ ] No leftover Phase/3.x marketing that contradicts 4.x train without labeling history.

#### 0.4 Apply fixes (docs-only items can land without EH code)

Priority order when matrix is ready:

1. **Contradicted** public claims (must fix or demote).
2. **Partial** on README / use / ai-gates / agent-guide.
3. Maintainer surfaces (ROADMAP Next session, Agents map) so agents stop re-teaching stale truth.
4. Template/doc snippets that generate wrong CI (may block on EH code for base-ref).

#### 0.5 Documentation acceptance (workstream 0 close)

- [ ] Claims matrix refreshed; **0 Contradicted** on public lanes (Use + Develop + README + package-surface).
- [ ] Every Partial has an owner ID in Phase EH or an explicit `wontfix` rationale.
- [ ] README reviewed end-to-end against code (checklist 0.3 signed off in PR body).
- [ ] `docs/README.md` hub rows still point at real authorities; no silent new front door.
- [ ] Product-voice table updated if doctor headline vocabulary changes under EH.
- [ ] No broad rewrite of `docs/archive/` or historical plans unless they are linked as current truth.

---

### Workstream 1 — Evidence model (doctor / honesty)

Suggested diagnostic shape (proposal; not current API):

```json
{
  "contract": {
    "layers": "ready",
    "arkRules": "ready",
    "wholeTreeGoverned": true
  },
  "host": {
    "name": "codex",
    "localWriteBoundary": "advisory",
    "repairEnvelopeEmitted": true,
    "repairReinjectionGuaranteed": false
  },
  "repository": {
    "preCommit": "active",
    "ciConfigured": true,
    "latestCiRun": "success",
    "requiredStatus": "unavailable-plan",
    "hardMergeBoundary": false
  },
  "headline": "Contract ready; repository merge protection is not enforced"
}
```

Rules:

- Keep `hard-write: false` for Codex/Cursor/OpenCode.
- Do **not** drop `soft-write-host` from evidence — **reclassify** it out of “architecture unfinished.”
- Reserve `Not finished` for actionable project/contract debt.
- `primaryNextAction` null only when truly nothing to do **and** headline is not a false failure.

### Workstream 2 — Mechanical integration fixes

| Fix | Primary files |
|-----|----------------|
| First-push base-ref guard | `bin/lib/ci-and-commands.mjs`, `action.yml`, `docs/ai-gates.md` |
| `.gitignore` Ark coverage | `bin/lib/html-report.mjs` + regression test for `.ark/*` + `!/.ark/golden-pattern.json` |

### Workstream 3 — Secondary precision (P2/P3)

- Split repair envelope emission vs reinjection guarantee in host matrix / doctor.
- Optional operation matrix (apply_patch / nested / shell / pre-commit).
- User-facing CLI vs GitHub status context strings.
- Throttle Codex-home skill drift warnings (session-once or doctor/install only).

---

## Phase EH — ordered slices (ROADMAP IDs)

| Order | ID | Size | Depends on | Outcome |
|---:|---|---:|---|---|
| 101 | `EH01` | M | — | **Deep docs audit:** inventory + refreshed claims matrix; README 0.3 checklist; list of Contradicted/Partial with owners |
| 102 | `EH02` | S | `EH01` (or parallel if no doc dep) | Fix Contradicted/Partial **docs-only** public claims; sync ROADMAP Next session + Agents plan row; no code behavior change required |
| 103 | `EH03` | S | — | `.gitignore` exact-line → recognize `.ark/*` / exceptions; no dirty worktree; regression test |
| 104 | `EH04` | S | — | Generated workflow + action + ai-gates: first-push-safe base-ref (cat-file or skip delta) |
| 105 | `EH05` | M | — | Split project readiness vs soft-write / environment posture; headline + `primaryNextAction` rules; tests |
| 106 | `EH06` | M | `EH05` | CI runtime observed vs provider policy (`unavailable-plan` for known 403); doctor JSON + human copy |
| 107 | `EH07` | S | `EH05`, `EH06` | Repair envelope vs reinjection; CLI vs status-context copy; optional ops matrix minimum |
| 108 | `EH08` | M | `EH02`–`EH07` | **Docs apply for behavior change:** product-voice, README, use, develop, ai-gates, agent-guide, package-surface as needed; claims matrix residual 0 Contradicted; CHANGELOG |

**Parallelism note:** `EH03`/`EH04` may start before `EH01` completes if a P0 field bug is burning; **`EH08` must not close** until audit (`EH01`) + code slices that change user-visible semantics are reflected. Prefer `EH01` early so docs work is not pure guesswork.

**One `doing` at a time** still applies in ROADMAP.

---

## Acceptance criteria (epic close)

1. [x] Green whole-tree Codex project is not globally `Not finished` **solely** because of soft-write host.
2. [x] Report still clearly says Codex local writes are advisory and bypassable.
3. [x] Successful CI run and unavailable branch-protection API are separate facts.
4. [x] GitHub Free/private HTTP 403 → actionable plan-limitation state.
5. [x] Generated workflow passes first push with all-zero `github.event.before`.
6. [x] HTML report does not broaden `.gitignore` or dirty a compatible worktree.
7. [x] Repair-envelope emission and host reinjection guarantees are separate capabilities.
8. [x] User-facing text distinguishes CLI command from GitHub status context.
9. [x] Layers and ArkRules remain independent and `notAScore`.
10. [x] **Documentation:** deep audit complete; public lanes have 0 Contradicted claims; README checklist signed; post-behavior docs (`EH08`) match shipped doctor/CI/host copy.

### Reproduction (code slices)

```bash
npx ark-check --root . --config ark.config.json --doctor --json
ARK_DOCTOR_GITHUB=1 npx ark-check --root . --config ark.config.json --doctor --json
npx ark-check --root . --config ark.config.json \
  --strict-merge --fail-on-new-smells \
  --base-ref 0000000000000000000000000000000000000000
git diff --exit-code
npx ark-check --root . --config ark.config.json --report ark-report.html --no-open
git diff -- .gitignore
```

### Reproduction (docs audit)

```bash
# Claims vs code spot-checks (extend during EH01)
rg -n "hard write|Not finished|soft-write|4\\.1\\.0|arkgate-check --strict" \
  README.md docs/use.md docs/develop.md docs/ai-gates.md docs/agent-guide.md
node -e "console.log(require('./package.json').version)"
# Compare host matrix source of truth
rg -n "hard-write|codex|repair-payload" bin/lib/host-support-matrix.mjs
```

---

## Dependencies & risks

- **Depends on:** 4.1.0 field train as baseline; does not wait for Z09.
- **Blocked by:** nothing hard; GitHub API plan limitations are environmental facts to model, not fix.
- **Risks:**
  - Softening the headline so users ignore real CI backstop → mitigate with explicit advisory card.
  - Docs-only PR that “sounds” fixed while doctor JSON still unfinished → `EH08` after code.
  - Audit scope explosion into archive/plans → stick to public lanes + claims matrix.
- **Open decisions:** exact JSON field names for readiness split (lock in `EH05` tests, not prose alone).

---

## Hard lines (inherited)

- No fake hard-write for Codex/Cursor/OpenCode.
- No numeric architecture score.
- No LLM pass/fail.
- Advisory stays labeled advisory.
- Code wins over documentation; docs never excuse broken gates.

---

## Related field sources

- WAFI report (consumer, outside this repo path):  
  `/Users/pedroknigge/Desktop/WAFI/docs/reports/arkgate-codex-integration-feedback.md`
- Package locations cited there:  
  `bin/lib/host-support-matrix.mjs`, `enforcement-honesty.mjs`, `write-path-detect.mjs`,
  `write-path-capabilities.mjs`, `github-enforcement.mjs`, `ci-and-commands.mjs`, `html-report.mjs`,
  `docs/ai-gates.md`

---

## Promotion

When Phase EH closes in ROADMAP:

1. Mark this plan **Shipped** (or Superseded if renamed).
2. Leave claims matrix as the durable audit artifact under `docs/audit/`.
3. Do **not** invent a feature pack unless a new stable public API surface ships; behavior-only honesty is package behavior + docs authority updates.
4. Update Agents product-plans table status and ROADMAP Next session.

## Related

- ROADMAP Phase EH (`EH01`–`EH08`)
- Prior honesty phases: [enforcement-truth-at-speed](../enforcement-truth-at-speed/README.md), [field-gap-closure](../field-gap-closure/README.md)
- Product voice: [docs/product-voice.md](../../product-voice.md)
