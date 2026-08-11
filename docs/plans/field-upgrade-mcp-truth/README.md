# Field upgrade & multi-project MCP truth (post-4.5.5 seed)

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) ·
> [Agent guide — MCP](../../agent-guide.md) · [Upgrade skill](../../../templates/skills/ark-upgrade.md)

**Status:** In progress (Phase FX; target **4.5.6**; `FX01`–`FX11` done; `FX12` publish)  
**Slug:** `field-upgrade-mcp-truth`  
**Kind:** epic seed / field-truth + upgrade self-service + multi-project MCP ergonomics  
**Owners:** product (Pedro) + library maintainers  
**Last updated:** 2026-08-11  
**Target package:** **4.5.6** (patch train when FX01–FX12 land; no “published” claim until FX12)  
**Evidence origin:** consumer field sessions (Superlock web/insights, Predial Web, WHASHARED) on
`/ark-upgrade` 4.3.0→4.5.5 and 4.5.0 adoption — plus product dogfood of multi-project MCP use

---

## Why this seed exists

**4.5.5 shipped** deep-module coach and upgrade `whatsNew`. Field sessions proved two harder
problems remain:

1. **Upgrade package path lies in the happy path.** On 4.3.x (and any train where CLI version ==
   installed `node_modules` version), `ark upgrade --apply` sets `packageInstallSkipped` and never
   consults the registry. Agents must reverse-engineer `shouldSkipArkgateInstall` and run
   `npm install -D arkgate@latest` by hand. Three of three 4.3→4.5.5 field upgrades hit this.

2. **Managed skill truth drifts from package truth.** Without prior `ark.managed.json`, or when
   skills are customized, content-identity **preserves** old skill bodies. Pin can be 4.5.5 while
   on-disk skills still coach 4.3.x. One Superlock package refreshed 52 skills; the sibling
   package refreshed **zero** skill texts (only missing gates created).

3. **Multi-project MCP still hurts the same human.** ArkGate is used across **one or many**
   checkouts per user (Superlock web + insights, Predial, WHASHARED, mother repo). Identity
   binding (4.2.0 `WI01`) fail-closes cross-project *evidence*, but field still sees:
   - long-lived MCP process reporting **stale `arkgateVersion`** after package bump
   - agents/humans switching folders without restart → confusion even when identity would mismatch
   - weak “restart MCP” as a soft next action, not a first-class honesty surface on every tool
   - multi-repo monorepos (multiple `arkgate` pins) without a coherent upgrade playbook

4. **Host / verification / inventory noise.** Manifest default host ≠ active Grok host; post-upgrade
   verification is reinvented per session; rules-inventory treats UX message strings as business
   candidates.

This train is **field self-service truth**: make upgrade, skills, and MCP honest for the real
pattern — *one developer, many projects, one or more hosts*.

---

## Product model (multi-project user)

| Fact | Product implication |
|------|---------------------|
| One user often has N checkouts | MCP must never silently coach project B as project A (already fail-closed on evidence when identity is used correctly) |
| N checkouts share one host process | Stale process after upgrade is a **first-class honesty state**, not a footnote |
| N packages in a monorepo | Per-package pin/skills/manifest; no single “repo is upgraded” claim without package list |
| Agents prefer one MCP server | Prefer **prove project + package version on every call** over assuming process restart always happens |
| CLI is always available | When MCP is stale/mismatched, coach **project-local CLI** as authoritative until restart |

**Non-goal:** automatic transparent switching of a single MCP process to another root without
handshake (that re-opens the WI01 hole). Prefer fail-closed + clear restart/retarget, or an
explicit multi-root protocol if ever designed under a new ADR.

Related shipped work: [workspace-identity-activation-truth](../workspace-identity-activation-truth/README.md)
(4.2.0) — this seed **extends field ergonomics**, not a rewrite of identity.

---

## Freeze (held unless ROADMAP item says otherwise)

| Frozen | Why |
|--------|-----|
| Numeric scores / Excellent ranks | Compass + coach stay `notAScore` |
| New skill **names** beyond 13 | Deepen `/ark-upgrade` (+ others only if needed) |
| New ArkRules **sensor vocabulary** | Out of scope |
| LLM package pass/fail | Deterministic only |
| Soft hosts claiming hard write | Honesty labels only |
| Auto-overwrite customized managed files without consent | Content-identity preserve stays default |
| Silent multi-project MCP retarget without handshake | Fail-closed > convenient wrong |

---

## Ordered backlog

Promote only when IDs appear as `todo`/`doing` in ROADMAP. Suggested phase prefix: **`FX`**
(Field eXperience). Preferred order:

**FX01 → FX02 → FX03 → FX04 → FX05 → FX06 → FX07 → FX08 → FX09 → FX10 → FX11 → FX12**

| ID | Size | Priority | Track | Outcome |
|----|-----:|----------|-------|---------|
| `FX01` | M | P0 | Upgrade package | **Registry-aware package bump:** if registry (or pin-range) latest **>** installed, `upgrade --apply` must **not** skip install solely because CLI == node_modules; install path bumps pin/lock to target (documented: `latest` vs pin policy) |
| `FX02` | S | P0 | Upgrade package | **Machine + human skip truth:** every skip emits structured JSON (`packageInstallSkipped`, `reasonCode`, `installedVersion`, `cliVersion`, `registryLatest?`, `suggestedInstallCmd`) + human one-liner with exact recovery command |
| `FX03` | M | P1 | Skills | **Skill content drift honesty:** preview/JSON lists `stale` / `customized` / `wouldRefresh` vs package templates; doctor or upgrade surfaces “skills on disk older than package (customized)” advisory |
| `FX04` | M | P1 | Skills | **Opt-in skill refresh path:** documented command/flag (e.g. consent-bound refresh of customized skills that match *prior* package identity, or explicit accept list) — **never** silent overwrite of true user edits |
| `FX05` | S | P1 | Upgrade process | **Post-upgrade verification block** in `/ark-upgrade` + upgrade human/JSON: pin==CLI, `agents-md --check`, doctor (compass + deepModuleCoach), status mode, MCP version note if present |
| `FX06` | L | P0 | MCP multi-project | **MCP multi-project field truth:** every MCP response (or identity envelope) makes **process package version + projectId + binding** impossible to miss; stale process after upgrade → explicit `processStale` / restart nextAction; multi-checkout guidance in agent-guide + skill (one user, N projects); fail-closed remains; optional: document recommended host patterns (per-workspace MCP vs shared) |
| `FX07` | S | P2 | Host honesty | **Active host vs managed manifest:** preview/doctor note when detected host ∉ selected tools/manifest; suggest `--tools <active>` |
| `FX08` | S | P2 | Upgrade surface | **whatsNew early path:** human + JSON suggestions available on **preview** even when package already current / nothing to apply (not only post-4.5.5 apply path); registry-behind path points at FX01 recovery |
| `FX09` | S | P3 | Inventory | **Inventory noise control:** downrank or classify UX message-string / pure copy constants so they do not crowd business-rule pilots (process + inventory projection, not new sensors) |
| `FX10` | M | P0 | Quality gate | **Run `/review` (gstack pre-landing review)** on the full FX change set vs `main`/PR base: critical + informational, fix-first for auto-fixable issues, escalate ASK items; no land until review clean or decisions recorded |
| `FX11` | M | P0 | Release prep | **Prepare 4.5.6 100%:** version bump surfaces, CHANGELOG, `docs/releases/4.5.6.md` checklist (prepared), README/hub/package-surface honesty (not “published” yet), product voice / agent-guide / use / brownfield deltas for FX features, skill bodies + agent-skills 1:1, full audit (q06-style release surfaces, claims vs code, freezes), `release:npm --dry` + architecture/tests green |
| `FX12` | L | P0 | Release train | **Publish everywhere + web:** land PR(s) to protected `main`, signed tag `v4.5.6`, GH Release, OIDC npm `latest`, MCP registry `io.github.pedroknigge/arkgate@4.5.6`, flip docs Status **published**, update **arkgate-site** (changelog/4.5.6, MESSAGING, llms, homepage ribbon/field copy for FX story — not version-only find-replace), verify `npm view arkgate version` → **4.5.6** |

**Related seeds (do not duplicate):**

| Seed | Relationship |
|------|----------------|
| Golden upgrade path matrix | Hosts × package managers matrix **proof** after FX01–FX02 land |
| Monorepo activation playbook | Complements FX06/FX07 for multi-package workspaces |
| Z09 / RB-11 | Unrelated claim-gate residual |

---

## Item detail

### FX01 — Registry-aware package bump

**Field bug:** `shouldSkipArkgateInstall` treats “CLI version == installed version” as done, so
`upgrade --apply` never reaches `@latest` while registry is ahead.

**Acceptance:**

- With installed `X` and registry `Y > X`, first-class upgrade path installs/bumps without
  requiring the user to invent `npm install -D arkgate@latest`
- Documented policy: default target (`latest` vs caret pin expansion) is explicit in help + docs
- Focused tests: skip only when already at target; do **not** skip when behind registry (injectable
  registry version for unit tests — no live network required in CI)
- Offline / registry unreachable: honest `registryUnavailable` path (do not invent a bump)

**Non-goals:** auto-bump major without pin policy; mutating unrelated deps.

---

### FX02 — Skip install machine + human truth

**Acceptance:**

- JSON always includes skip/refusal package fields when install did not run
- `suggestedInstallCmd` uses package-manager-aware `packageInstallArgv` (pnpm `-w`, etc.)
- Human stdout shows the same recovery in one copy-paste line
- Agents can branch without reading `upgrade-command.mjs` source

---

### FX03 — Skill content drift honesty

**Acceptance:**

- Upgrade preview summarizes skill/template drift: counts by state + sample paths
- Distinguishes: **stale** (safe update), **customized** (preserved), **missing**, **current**
- Optional doctor advisory when package version ≫ skill body generation (heuristic / manifest age)
- Never claims “skills upgraded” when only package pin moved

**Evidence from field:** Superlock insights = pin 4.5.5 + skills preserved; web = 52 skill updates.

---

### FX04 — Opt-in skill refresh

**Acceptance:**

- Explicit user/agent consent path to refresh customized skills that are **known prior package
  identities** (or listed paths), not arbitrary customized files
- Conflicts / true edits still require consent / remain blocked
- Documented in `/ark-upgrade` and package-surface
- Tests: true customized content not overwritten; prior-template customized can refresh when flagged

---

### FX05 — Post-upgrade verification block

**Acceptance:**

- `/ark-upgrade` Completion requires a fixed checklist (or runs sensors and reports):
  1. package pin ↔ CLI
  2. `agents-md --check` (or projection stamp)
  3. doctor slice: compass + deepModuleCoach present / honest
  4. `ark status` mode if available
  5. MCP process version note if MCP was used
- Upgrade JSON may include `postUpgradeChecks[]` advisory results (`notAScore`, not gate)

---

### FX06 — MCP multi-project field truth

**Problem restated:** same user, many projects. Problems are not only “wrong contract evidence”
(partially solved by WI01) but **process lifecycle and operator clarity**.

**Acceptance (minimum):**

- When MCP `arkgateVersion` ≠ project installed package version → structured honesty
  (`processPackageMismatch` or equivalent) + nextAction restart/retarget; **do not** present
  analysis as fully current
- Identity + binding + `arkgateVersion` + `projectId` remain required for authoritative evidence
  (restate; tighten docs/skills so agents always pass `expectedRoot` / `expectedProjectId`)
- Agent-guide + `/ark-upgrade` + compact router: **multi-project recipe**  
  “one checkout = one expectedRoot; after upgrade restart MCP; prefer project-local CLI until
  identity matched and versions align”
- Doctor/status (if cheap): surface last-known MCP dual-truth without requiring a second product
- Focused tests: mismatch envelope; matched+version-aligned happy path
- **Docs:** recommended host setups for multi-repo users (workspace-scoped MCP config vs single
  global server) — honesty, not a new daemon product

**Non-goals:**

- Auto-switch bound root mid-process without handshake
- Guaranteeing all hosts implement multi-root MCP correctly (host variance stays honest)
- Claiming MCP is a hard write gate

**Stretch (only if promoted with ADR):** multi-root registry inside one process with per-call
binding — larger design; not default FX06.

---

### FX07 — Host selection honesty

**Acceptance:**

- If active/detected host is not in upgrade `--tools` / managed host set, human + JSON note it
- Suggest exact `--tools` expansion; do not silently ignore `.grok` skills for a Grok user

---

### FX08 — whatsNew early

**Acceptance:**

- Preview (read-only) always can show `whatsNew` for the **running package line**
- When behind registry, combine with FX01/FX02 recovery (don’t imply coach is current until bump)
- Still `notAScore` / never gate

---

### FX09 — Inventory message noise

**Acceptance:**

- Rules inventory (or projection) classifies or downranks pure UX copy / error-message string
  constants vs behavioral limits (thresholds, windows, roles)
- Documented so adopt/contract pilots don’t treat every string as an invariant
- No new sensor vocabulary

---

### FX10 — `/review` on the FX change set

**Outcome:** No 4.5.6 land without a full **gstack `/review`** (or equivalent pre-landing review
skill) against the base branch.

**Acceptance:**

- Run `/review` on the PR / working tree that contains FX01–FX09 (and any follow-up fixes)
- Cover critical checklist categories + informational; specialists if effort elevated
- Auto-fix mechanical issues; record user decisions on ASK / wontfix
- Review log / outcome clean enough to ship (0 open critical; open info either fixed or accepted)
- Do **not** skip review because “tests are green”

**Non-goals:** Replacing CI; shipping without human override on true product disagreements.

---

### FX11 — Prepare documents & audit for npm **4.5.6** (100% ready, not published)

**Outcome:** Tree is release-ready for **arkgate@4.5.6** while honesty stays **prepared**
(never claim npm `latest` until FX12).

**Acceptance:**

- Version identity aligned: `package.json` / lock / `server.json` / `src/version.ts` / dual bins
  story → **4.5.6**
- `CHANGELOG.md`: Unreleased / 4.5.6 section covers FX01–FX09 user-visible outcomes
- `docs/releases/4.5.6.md`: full notes + maintainer checklist all **`[ ]`** until FX12
- Public docs updated for shipped FX behavior: agent-guide (upgrade + multi-project MCP),
  package-surface, use/develop as needed, product-voice if new terms; **no** false published
- Skills: deepen `/ark-upgrade` (and any touched skills); `check:agent-skills` green
- Audit: q06 release-surface tests updated for 4.5.6 **prepared** posture; architecture + focused
  + coverage floors; `npm run release:npm -- --dry` green
- Site **not** required to claim published yet; optional draft branch for 4.5.6 copy is OK
- Mother repo + site readiness list written in release notes “prepare” section

**Non-goals:** OIDC publish; MCP registry publish; flipping Status to published (that is FX12).

---

### FX12 — Publish everywhere + update web

**Outcome:** **arkgate@4.5.6** is on npm `latest` and all public surfaces match.

**Acceptance:**

1. Land FX code + FX11 prep via protected-`main` PR(s); CI green
2. Signed tag `v4.5.6` + GitHub Release from `docs/releases/4.5.6.md`
3. OIDC `publish-npm.yml` success; `npm view arkgate version` → **4.5.6**; `gitHead` matches
4. `mcp-publisher validate` + `publish` → `io.github.pedroknigge/arkgate@4.5.6`
5. Docs flip: release notes Status **published**, checklist `[x]`, README/hub/CONTRIBUTING/
   package-surface “current published” → 4.5.6
6. **arkgate-site:** new `changelog/4.5.6/`, index + MESSAGING + llms + homepage ribbon/field
   cards tell the **FX field-truth** story (registry-aware upgrade, multi-project MCP honesty,
   skill drift) — not only a version string swap; `check-site` green; deploy main
7. ROADMAP / AGENTS plan status: FX train shipped in 4.5.6

**Non-goals:** Claiming published before registry proof; skipping site copy rewrite (see 4.5.5
skeptic lesson).

---

## Consumer playbook notes (not library code, but product docs)

Ship as part of FX05/FX06 docs (or monorepo seed):

| Audience | Guidance |
|----------|----------|
| Multi-package monorepo | Upgrade **each** package that pins arkgate; don’t claim monorepo done from one package |
| Multi-checkout user | Per-window/workspace MCP or always pass identity; restart after bump |
| After 4.3→4.5.x | Until FX01: document manual `npm i -D arkgate@latest` then digest apply |
| Skills customized | Decide refresh (FX04) vs preserve; document the choice |

---

## Non-goals (epic)

- Closing Z09 / RB-11
- New architecture presets / policy packs
- New skill names or ArkRules sensors
- Runtime kernel productization
- Replacing content-identity with “always overwrite skills”
- Org multi-tenant control plane

---

## Promotion gate

Do not start engineering until:

1. Owner adds Phase **FX** rows to ROADMAP with one-`doing` policy  
2. Plan lock freezes version target as **4.5.6** (patch) unless owner renames  
3. FX01/FX02 called out as **field P0**; FX10–FX12 are the mandatory close-out train  
4. One `doing` at a time; FX10 after engineering FX01–FX09; FX11 after review clean; FX12 last

Until promotion this file is **narrative backlog only**.

---

## Success metrics (field)

| Signal | Before (field) | After this train |
|--------|----------------|------------------|
| 4.3→latest upgrade | Manual npm after false skip | One documented upgrade path bumps package |
| Sibling packages | One refreshes skills, one doesn’t, unnoticed | Drift counts visible; refresh opt-in |
| MCP after bump | Process still reports old version | Explicit mismatch + restart coach |
| Multi-project day | Silent wrong-context fear | Identity + version dual-truth every call |
| Agent time on upgrade | 20+ tool steps reverse-engineering skip | Branch on `reasonCode` + `suggestedInstallCmd` |
| Ship quality | Land without structured review | FX10 `/review` clean before prep |
| Public truth | Site/docs lag or version-only swap | FX11 prepared + FX12 published 4.5.6 + site story |

---

## Related shipped trains

- [deep-module-coach](../deep-module-coach/README.md) (4.5.5) — coach + whatsNew surface to keep honest
- [domain-fitness-session-truth](../domain-fitness-session-truth/README.md) (4.5.0) — status honesty modes
- [workspace-identity-activation-truth](../workspace-identity-activation-truth/README.md) (4.2.0) — MCP project binding
- [improvement-compass](../improvement-compass/README.md) (4.4.0) — residual lenses
- Golden upgrade matrix / monorepo playbook — post-4.5 seeds (coordinate, don’t fork)
