# Ark — Internal Roadmap (maintainer)

Tactical, prioritized work queue. Complements the product-facing `ROADMAP.md`.
This is where release sequencing, open decisions, and the discovery log live.

Last updated: 2026-07-08 (field-hardened 2.0 local; PR #14 not yet refreshed).

## Release train

| Version | Theme | Status | Gate to ship |
|---------|-------|--------|--------------|
| **1.11.0 → 1.16.0** | Guide / brownfield / upgrade | **PUBLISHED** | — |
| **1.17.0** | Co-pilot Phase F — `ark-check --plan` | **PUBLISHED** | — |
| **1.18.0** | Co-pilot Phase G — `ark start` | **PUBLISHED** | — |
| **1.19.0** | Co-pilot Phase H — `/ark-loop` | **PUBLISHED** (on `main`) | — |
| **2.0.0** | Co-pilot milestone (I+J) + **field-hardening** | **Branch** `feat/co-pilot-2.0` · **PR #14 open** · field fixes **local only** until commit/push | See freeze checklist below |
| **post-2.0** | Broaden `mechanical-safe` with evals; classifier corpus growth | Planned | Per-phase |
| ongoing | Trust hardening (signed tags, etc.) | Partial (provenance done) | Can ride any release |

### PR / branch reality (read this first)

| Layer | What it contains |
|-------|------------------|
| **`main`** | Through 1.19.0 (Phases F–H published as minors). |
| **PR #14 / `origin/feat/co-pilot-2.0`** | One commit: I+J only (`/ark-autopilot`, proof tests, demo, version bump 2.0.0). **Does not yet include field-hardening.** |
| **Local working tree on `feat/co-pilot-2.0`** | PR #14 content **+** honesty/overlays/modes/pnpm/TS/detection (~800 LOC). **Must commit + push before merge** if 2.0 should ship the hardend product. |

**2.0 is a milestone major, not an API break.** Deprecated aliases (`AIGateViolation.code`, `layeredArchitectureRules()`) stay.

---

## 2.0.0 freeze scope

### IN — must ship in 2.0 (already implemented locally unless noted)

| Area | Deliverable | Where |
|------|-------------|--------|
| **I** | `/ark-autopilot` skill (compose start → plan → loop → enforce) | templates/skills, PR #14 |
| **I** | Newbie / expert entry styles, one contract | skill + docs, PR #14 |
| **J** | Classifier corpus (zero false mechanical-safe) | tests, PR #14 |
| **J** | Demo `docs/demos/03-copilot-autopilot.md` | PR #14 |
| **J** | Enforcement handoff test (`ark start` leaves gates) | tests, PR #14 |
| **Honesty** | `goal.met` requires meaningful governed% (≥50%); plan embeds `governedPercent` | bin (local) |
| **Honesty** | `ark start` wrap-up: SUGGEST / ADAPT / ENFORCE — never false “guards everything” | bin (local) |
| **Detection** | Skip dot-dirs in shape signals (no `.github` → workflows false positive) | bin (local) |
| **Detection** | Nest / Next / express / library signals + playbook weights | bin + playbook (local) |
| **Coverage** | Framework layout overlays on init/preset (Nest/Next/express/library globs) | bin (local) |
| **PM** | pnpm runner: `verify-deps-before-run=false` (no IGNORED_BUILDS dead-end) | bin (local) |
| **TS** | Resolve typescript from project; `--plan` works coverage-only if TS missing | bin (local) |
| **Docs** | ROADMAP / CHANGELOG / enthusiast / autopilot skill / co-pilot-plan aligned | local + partial PR |

### OUT of 2.0 — next, not the major

| Item | Why later |
|------|-----------|
| Broaden `mechanical-safe` (file move, verbatim SQL→repo) | Needs eval corpus; false-safe sinks trust |
| Full ESLint parity with every CI rule | Ongoing quality, not co-pilot milestone |
| Signed release tags mandatory | Trust track; provenance already in place |
| Runtime package split | Product focus stays gate/co-pilot |
| Locale packs, docs site | Growth, not release-critical |
| Codemod engine | Explicitly never |
| Auto-apply judgment / big rocks | Explicitly never |

### Release gate checklist (before merge + publish)

- [ ] Commit field-hardening on `feat/co-pilot-2.0` and push (updates PR #14)
- [ ] CI green on PR head
- [ ] `npm run test:run` + `check:architecture` + `typecheck` + `build` local green
- [ ] Field matrix still honest: Nest/Next/lib/express governed% meaningful, no false-green  
      (`~/Desktop/ARK/beta-field-test/run-matrix.mjs`)
- [ ] CHANGELOG 2.0.0 reads as the full story (I+J + field-hardening)
- [ ] README does not promise stale runners / false “always guarded”
- [ ] Pedro go-ahead → merge PR #14 → GitHub Release `v2.0.0` → Publish npm  
      (prefer not same-day spam of minors; this is the batched major)

---

## North Star (owner: Pedro)

**Dream:** non-developer installs Ark → Ark analyzes → proposes shape in plain language →
user accepts → agent (driven by Ark) plans and improves architecture incrementally →
`ark-check` validates → gates enforce. Ark **proposes, adjusts, then enforces**.

**Arc:** Gate (v1) → Guide (1.11–1.16) → **Co-pilot (2.0)**.

**Two entry styles × three operating modes × one contract:**

| | Newbie entry | Expert entry |
|--|--------------|--------------|
| Default path | `ark start` + `/ark-autopilot` | pieces: init / contract / plan / fix / gate |
| Modes | **suggest** → **adapt** → **enforce** (Ark reports which) | same modes, manual control |

Hard lines: agent edits, Ark validates; no codemod engine; big rocks always human; code only.

### Primitives status

| # | Capability | Status |
|---|------------|--------|
| 1 | Analyze + propose (plain language) | ✅ recommend, start, archetypes, framework signals |
| 2 | Accept → plan / roadmap | ✅ init, write-plan, adopt |
| 3 | Work classification | ✅ `--plan` (type-only = mechanical-safe; bias judgment) |
| 4 | Worktree apply loop | ✅ `/ark-loop` |
| 5 | Autopilot orchestration | ✅ `/ark-autopilot` |
| 6 | Tiered UX | ✅ newbie/expert entry styles |
| 7 | Enforcement handoff | ✅ start installs gates + test |
| 8 | Honesty in autonomy | ✅ governed% in goal; modes; field matrix |

---

## Post-2.0 priorities

### P0 (depth / trust)

1. **Broaden mechanical-safe** only with labeled evals (file relocation, verbatim infra).
2. **Grow classifier corpus** from real brownfield runs (amarilla-style).
3. **Signed tags / release verification** for a co-pilot that edits repos.

### P1

4. ESLint plugin stays aligned with CI resolver rules.
5. Optional Nest/Next **policy packs** if overlays need more than filename globs.
6. Soft-install or stronger peer messaging for `typescript` on bare repos.

### P2 / later

7. Docs site, locales, runtime package split, more framework adapters only if justified.

---

## Open decisions (carry past 2.0)

1. **When to remove** `AIGateViolation.code` / `layeredArchitectureRules()` — not in 2.0.
2. **Runtime package split** — only after gate/co-pilot adoption is the clear wedge.
3. **How aggressive library overlay** (`src/**/*.ts` → DomainModel) — field OK at 100% governed; watch false domain purity hits.

---

## Discovery log (summary)

Field feedback rounds 1–10 on amarilla/PREDIAL (1.10→1.14 era) drove honesty, baseline concentration guard, write-gate parity (1.12 Option A), exclude globs, mature-repo routing, upgrade/migrate-commands.

**Beta field matrix (2.0, 2026-07-08)** — packed tarball on public starters:

| Repo | Archetype | Governed% | False-green |
|------|-----------|-----------|-------------|
| NestJS typescript-starter | api-backend | ~80% | no |
| Next Tailwind starter (pnpm) | frontend-surface | ~86% | no |
| node-typescript-boilerplate | library-sdk | ~100% | no |
| express boilerplate | api-backend | ~63% | no |

Pre-hardening: 0% governed + “meets contract” + workflows contamination. Post-hardening: fixed.

Harness (not in npm package): `../beta-field-test/run-matrix.mjs`, `FINDINGS.md`.

Full historical rounds remain in git history of this file prior to the 2.0 freeze rewrite.

---

## Notes

- Work lands on feature branches (PR flow). Do not publish without go-ahead.
- Prefer **one major 2.0** over another same-day minor storm (pnpm `minimumReleaseAge`).
- Private product scores: `docs/internal-roadmap.md` (gitignored from some views; keep aligned).
