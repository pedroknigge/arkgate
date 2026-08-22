# Premortem transcript — ArkGate 4.6.5

**Date:** 2026-08-22  
**Subject:** Product ArkGate 4.6.5 (npm `arkgate`), canonical repo `pedroknigge/arkgate` on `main`  
**Method:** Klein premortem (prospective hindsight). Frame: six months later, the product has failed.  
**Agents:** 8 parallel deep-dives, one per failure reason.  
**Does not close:** Z09, RB-11, C-028.

Visual report: [premortem-report-20260822.html](premortem-report-20260822.html)

---

## Context collected

### What it is

ArkGate 4.6.5 is a TypeScript architecture write firewall plus a coach. Public promise: “One architecture config. One check. One coach.” Machine-readable `ark.config.json`, PreToolUse hooks where the host supports them, and `arkgate-check --strict-merge` as a **required** GitHub status. Two planes: Layers (always) and ArkRules (opt-in). Product formula from ROADMAP:

```text
product value = writes observed × semantic precision × enforcement strength × retained adoption
```

North star (product voice): a track so simple a newcomer enters, so strict a senior trusts — and the AI ships faster because the design space is small and honest. The contract and deterministic engine decide pass/fail; skills, `AGENTS.md`, and projection are never trusted enforcement inputs.

### Who it is for / who it affects

- TypeScript teams shipping with AI agents: Claude Code, Cursor, Codex, Grok Build, Antigravity, OpenCode.
- Dual audience: vibe-coders (plain doctor) and seniors (JSON, CI, parliament).
- Maintainer: Pedro Knigge (solo / small). Library authoring root, not a consumer app.
- Field program (`docs/field/`): scaffolding only. Cohort **not enrolled**. Z09 / RB-11 **open**.

### What success looks like

Adopt **and retain**. Required GitHub status running `--strict-merge`. Write path actually fires on the host they use. Green means complete analysis. Agents self-correct without weakening the contract. Z09 thresholds (do not lower): ≥8 consented adopters; D30 ≥3/4 and D90 ≥5/8 of the **full** cohort retain required enforcement; missing follow-up = not retained.

### Anchors from the tree (not marketing)

- README host matrix: hard write is operation-scoped and trust-scoped; the shared hard guarantee for every host is required CI. Cursor repair reinjection is not guaranteed. Codex hard write is complete local `apply_patch` only. OpenCode is advisory. Humans and direct `fs` bypass hooks (threat T1/T2).
- GitHub Free often cannot require a status. Doctor 4.6.5 writes `.ark/ci-merge-boundary.json` (`present-but-not-required`, `configured-not-fired`). Hook green ≠ tree green.
- Phase Z engineering (Z01–Z08, Z10) closed; Z09 parked claim gate. `docs/field/` forbids inventing adopter counts.
- Propia.homes field change: edge-clean `--strict-merge` accepted new UI business-policy helpers; doctor reported design residual afterward.
- Release cadence: 4.6.3 and 4.6.4 on 2026-08-18, 4.6.5 on 2026-08-19. Each note still says Z09 open.
- Surface: 13 frozen skill names, five-door autonomy, team parliament, improvement compass, identity handshake, 4-layer self-host vs 11-layer consumer, generated CLI artifacts.
- Frozen: no polyglot, no org control-plane, no new skill names, no LLM verdict.
- “When not to adopt”: no AI agents, hobby CRUD, or teams that will not maintain the contract and required CI.

---

## Raw premortem — eight failure reasons

1. **Installed theater, zero enforcement.** Teams install npm + hooks + skills but never make `--strict-merge` a required GitHub status. Soft hosts and humans bypass the write path. After six months the package is wallpaper. `writes observed × enforcement strength → 0`. Z09 never closes because there is nothing honest to measure.

2. **Honesty breach / one public false-green.** Z09 never closed. A packed consumer or partial analysis reported `goal.met` / ENFORCE, or the Propia.homes pattern repeated (green merge, new business policy in UI). A senior publishes “ArkGate said ENFORCE, the tree was garbage.” The only moat (honesty) evaporates.

3. **Complexity tax killed the one-check promise.** Newcomers bounce at `ark start` when the compact router names five doors, two planes, and a parliament. Seniors who installed 4.3 drown in the 4.6.x honesty train. Voice says simple; the installed surface is a second OS. Adoption dies at the door.

4. **Host adapter treadmill.** Cursor / Claude / Codex change PreToolUse schemas. Hooks go `configured-not-fired`. Teams hear “broken” and uninstall hooks. One maintainer cannot keep six hosts current. The 4.6.3–4.6.4 Codex payload scramble becomes the permanent operating model.

5. **Maintainer bottleneck / bus factor.** Pedro is the product, the claim gate, the host matrix, docs truth, and the release train. Z09 cannot close because the same person cannot enroll eight external adopters while chasing Codex payloads. One burnout week or one unpatched host break = product death.

6. **Good-enough substitutes win.** Teams choose ESLint import + a 40-line `AGENTS.md` + required `tsc`. The write-firewall wedge is invisible until you have been burned; most teams have not paid that cost. The category never forms. npm curiosity does not become retained required-CI.

7. **Contract decay after “success.”** They adopted, ENFORCE light on, then baselines ratchet (T5), `peerIsolation: false`, no stewards, mixed PRs, `--changed` skipped. Six months later the contract describes whatever the last agent wrote. Dashboards still say ENFORCE. A naive Z09 counts the corpse as retained.

8. **The coach ate the gate.** Five-door, explore theater, compass lenses, deepening coach. Agents map instead of write. Seniors who wanted teeth get liturgy and churn. Identity shifts from a check to a curriculum.

---

## Deep analyses (one agent per reason)

### 1. Installed theater, zero enforcement

**Story.** 4.6.5 shipped an honest doctor: `.ark/ci-merge-boundary.json` marks hook *configured-not-fired*, per-host writePath, and CI *present-but-not-required*. The field kit is scaffolding; Z09/RB-11 stays OPEN. Adoption was counted as `npm i arkgate` + hooks + skills. Screenshots showed a green doctor, `ark.config.json` in tree, PreToolUse on Cursor/Claude. Nobody asked whether `arkgate-check --strict-merge` was a **required** GitHub status.

Week 3 was the cut. Three “adopters” on GitHub Free: the job runs, branch protection cannot require the context. Doctor writes it; the team ignores it. Cursor hosted, incomplete/hosted Codex, OpenCode (advisory), and humans/`fs` (T1/T2) never hit the hook. Repair is not re-injected. Local green ≠ tree green. README already said the hard guarantee is required merge, not the hook. “When not to adopt” asked teams not to install if they would not keep the contract or required CI. They installed anyway.

At day 90 the Z09 checklist opens: ≥8 consented, D30 ≥3/4, D90 ≥5/8 with required enforcement. Zero repos with required status. No clock to start. At six months the package is present and nobody feels it. Wallpaper. Z09 does not close because there is nothing honest to measure.

**Underlying assumption.** Installing npm + hooks + skills would, by inertia, turn `ark-check --strict-merge` into a required GitHub status.

**Early warning signals.**

- Count of `.ark/ci-merge-boundary.json` with CI *present-but-not-required* vs repos whose branch protection requires the `ark-check --strict-merge` context. If the first grows and the second is 0, this has already started.
- Doctor 4.6.5: hook *configured-not-fired*, or hook green with 0 PreToolUse denials in 14 days — write path does not fire; merge does not either.

### 2. Honesty breach / public false-green

**Story.** In August 2026, 4.6.5 closed Z01–Z08 and Z10. Z09/RB-11 stayed `parked`. `docs/field/` forbade inventing adopters. Nobody preregistered the 12-repo × 4-host × 3-package-manager matrix or the ≥8 cohort. Each release repeated “Does not close Z09.” A2 and A7 (“only `complete` analysis may satisfy `goal.met`”; “strict = complete”) were treated as won on the lab tarball. The moat was rewritten: *Don’t show green if we could not verify. False done is forbidden.*

In November a packed Next.js consumer (TS7, aliases) lost the JS-API fallback. Compiler-free preflight did not resolve what the TypeScript CLI did. `--plan --json` returned `goal.met: true` with `partial` analysis. CI required `--strict-merge` on layer edges: clean. Design-delta (`domain-logic-in-ui`) was opt-in and not in the job. The agent read doctor #1: ENFORCE + empty plan A → Shape, do not reinstall gates. The PR was titled ENFORCE. New `can*` / `policy*` helpers landed in UI — the same Propia.homes lag: green merge, design residual *after*.

In February 2027 a staff engineer publishes the tree and the JSON. *“ArkGate said ENFORCE, the tree was garbage.”* Green Layers ≠ design. MCP on disk ≠ this process; `writePath` and `.ark/ci-merge-boundary.json` already said that and nobody read them as the verdict. Maintainers open ROADMAP: Z09 parked, C-028 Partial, zero independent signatures. They cannot defend “false done is forbidden.” The moat was copy.

**Underlying assumption.** Closing engineering slices plus honesty copy equals a verified field verdict: `--strict-merge` / `goal.met` / ENFORCE imply complete analysis and new-code shape, even though Z09 does not exist and design-delta is opt-in.

**Early warning signals.**

1. PRs with `--strict-merge` exit 0 and, on the same SHA, doctor with design residual / non-empty `patternBets` / `domain-logic-in-ui` on touched paths (Propia lag), **or** `goal.met: true` with `completeness !== complete`.
2. Z09 still `parked` and preregistered cohort = 0 while the public product still sells ENFORCE and “false done is forbidden.”

### 3. Complexity tax

**Story.** The lead clones the repo and runs `npx arkgate start` as `docs/use.md` promises: one minute. The preview is not a check. The “compact” router (≤5 files, 25 KB, day-zero) names the five doors. Under that, two planes. Under that, `stewardNudge`. Doctor — promised as one light and action #1 — prints Suggest/Adapt/Enforce, leftover design, `improvementCompass` (lenses, not a score), write-path honesty, and asks whether there are stewards. They have not written product. They close the terminal.

The senior who froze 4.3 (13 skills, status JSON, catalog) opens 4.6.x: “no required config migration,” “same 13 names.” On top: five-door, parliament (mixed-PR deny, `--changed --base`), `ark_identity` + `projectId`, deep-module coach, and the 4.6.0–4.6.5 honesty burst. ROADMAP forbade new names; it deepened the 13. Eight shortcuts remain installed. Green is no longer a verdict: it is Layers, ArkRules, Shape residual, or law vs feature. They stop running doctor.

At six months the funnel dies at the door. Whoever reaches `--strict-merge` already had an internal architect. The newcomer never chose a door. The senior did not read 18 plans. The voice is still simple. The surface is a second OS.

**Underlying assumption.** Grouping 13 skills into five doors and calling the router “compact” reduces mental load without deleting installed surface.

**Early warning signals.**

- Percent of `start --apply` that within 14 days do not execute doctor action #1 (or do not run `--strict-merge`).
- Distinct product nouns in the first human output of `ark start` + first `doctor` (threshold: >12).

### 4. Host adapter treadmill

**Story.** October 2026. Claude Code changes the PreToolUse matcher: `Write|Edit|MultiEdit` no longer matches. Installed `.claude/settings.json` files from 4.6.5 stay as they were. Doctor writes `.ark/ci-merge-boundary.json` with `hook.state: configured-not-fired`. Nobody reads it. Agents write to disk. The first term of the value formula — *writes observed* — drops to zero on the host that was “hard.”

November. Cursor moves `StrReplace` to another envelope. Repair was already not re-injected; now the hook does not fire. Codex, three months after 4.6.3 (`tool_input.command`) and 4.6.4 (restart/trust + `PROCESS_PACKAGE_STALE`), moves the `apply_patch` body again. The maintainer publishes 4.6.6, 4.6.7, 4.6.8: the same scramble train, now permanent. Six hosts × N operations × each payload change. Grok and Antigravity desync in the same window. OpenCode was already advisory; Claude, Cursor, and Codex become advisory de facto. T6 stacks: stale global MCP, fail-closed, while the local hook also does not fire.

Teams hear doctor as “it’s broken.” They uninstall hooks. CI `--strict-merge` stays green. The write path — the only place ArkGate blocked *before* disk — is dead. The product required “no hard without fresh runtime/provider evidence.” It complied. The value did not.

**Underlying assumption.** The PreToolUse schema of six hosts is a stable, enumerable surface that one maintainer can chase with reactive patches.

**Early warning signals.**

- Weekly *writes observed / write attempts* by host. Alarm: >30% drop with CI still green.
- Percent of field `doctor --json` with `hook.state === configured-not-fired` or `writePath.hard:false` despite hooks on disk. If it exceeds 15% on two “hard” hosts (Claude/Cursor/Codex) at once, the 4.6.3–4.6.4 train is already the operating model.

### 5. Maintainer bottleneck

**Story.** On 18 August 2026 Pedro publishes **4.6.3** (Codex hard write) and the same day **4.6.4** (upgrade + `PROCESS_PACKAGE_STALE`). On the 19th, **4.6.5** (adopt/place/doctor honesty). Three `latest` in 36 hours. Each `docs/releases/*.md` ends the same way: *Z09 / RB-11 still open*. The publish checklist — protected `main` PR, signed tag, `publish-npm.yml`, `mcp-publisher`, arkgate-site flip — is executed by one person. ROADMAP says *one doing at a time*. `docs/plans/` holds 18 epics. The Z plan’s “library maintainers” field is Pedro. He dogfoods the mother tree, updates `claims-matrix`, patches Claude/Cursor/Codex, triages Dependabot, and keeps `packages/runtime` “not the product” but still needing an independent install.

In October OpenAI changes the `apply_patch` body again. The 4.6.3 runtime-proven claim dies in 48 hours. 4.6.6 and 4.6.7 ship on a Sunday. Z09 requires a signed matrix, **≥8 consented adopters** (D30 ≥3/4, D90 ≥5/8; *missing follow-up = not retained*), and a reviewer who **did not implement** Z08/Z10/Z09. That reviewer does not exist: the only person who understands `doctor.writePath` and the 4-host × 12-repo × 3-package-manager matrix is the one who ships. Propia.homes and two other repos stop answering D30. Nobody enrolls. Z09 stays `parked` since 3.8.0.

In February 2027 Pedro stops for a week. A host break goes unpatched. `npm latest` rots. AGENTS.md hygiene (green CI, Dependabot, clean tree) does not run. The repo remains a museum: documented honesty, 18 plans, experimental runtime still in the tarball, zero operators.

**Underlying assumption.** One human can be release train, claim gate, host matrix, and enroll-er of eight external adopters, and that ROADMAP “one doing” protects them.

**Early warning signals.**

- **Cadence vs Z09:** ≥2 `4.6.x` patches in ≤48 h *and* the sentence “Z09 still open” in *N* consecutive release notes (already N≥15 since 3.8.0).
- **Single identity:** 100% of signed tags / publish checklists with one author, and **0** reviewer identity preregistered in the Z09 manifesto.

### 6. Good-enough substitutes

**Story.** In September 2026, 4.6.5 already had an honest README: *Why not only ESLint / Nx / cruiser?* and *When not to adopt*. The typical trial staff engineer read that as a license. In the “architecture for AI” PR, the 40-minute stack won: `eslint-plugin-import` + boundaries, a 40-line `AGENTS.md`, required `tsc`. `npx arkgate` stayed in a demo clone. Doctor asked for a contract, skills, MCP `ark_identity`, Action `--strict-merge`. Nobody paid that without a prior burn.

In November, Cursor Rules + Bugbot and Claude Project instructions occupied the mental slot of “the agent stays in bounds.” The wedge (write firewall + coach, not a boundary linter) is only felt on hard PreToolUse or a merge that blocks. On soft hosts the write path stays advisory: the agent crosses a layer, the human pastes another paragraph into `AGENTS.md`, CI is green via `tsc`. TypeScript-only and no org control-plane: no mandate. In Slack, “arkgate / Archgate?” kills the pitch. Nx tags and dependency-cruiser cover the graph the lead already understands.

In February 2027 Z09 is still `parked`: the ≥8 consented cohort was never enrolled. The formula’s last factor is zero. npm curiosity downloads. Almost nobody leaves `arkgate-check --strict-merge` as a required status at D30/D90. The category “architecture write firewall” does not exist. The slot is host-native rules + linter + `tsc`.

**Underlying assumption.** The wedge becomes visible *before* the agent burn, and there are enough burns to pay contract + required CI versus ESLint + AGENTS.md + `tsc`.

**Early warning signals.**

- **D14 conversion:** % of installs / `ark start` that have a required Action running `--strict-merge`. If <15%, the wedge is not seen.
- **Empty Z09:** 0 of 8 consented adopters at 90 days post-4.6.5; or D30 required-CI retention <75% (plan threshold: ≥3/4).

### 7. Contract decay after “success”

**Story.** Week 1. Adopt on a Nest brownfield. Writes `golden-pattern.json`, freezes 47 cuts in `.ark-baseline.json`. Doctor: Enforce. TW06 asks for stewards; nobody gives a handle or email. Empty `stewards[]` = no team lock: mixed-PR deny, loosen, and baseline-grow do not require an author. `--strict-merge` does not turn the lock on. CI leaves the job required. A Z09 that only looks at “package + job + required-status” would already say retained.

Month 2. Humans edit in the IDE (T2: they never hit the write hook). A PR mixes `ark.config.json` with product. The local gate does not run `--changed --base origin/main`. Place would fail-closed on `filePath`; the agent does not move code: it sets `peerIsolation: false`, empties `rules[]`, and signs the hash-bound policy-delta ack (T4). Next sprint: `--update-baseline` opens 12 keys (T5). `stewards` is not in the policy hash. The dashboard still says Enforce. Leftover design ≠ healthy is in the voice; nobody looks.

Month 6. The contract describes what the last agent wrote. `golden-pattern.json` is archaeology. Enforce light on. Z09 counts the corpse.

**Underlying assumption.** Enforce + installed package + required-status prove a living contract, when parliament is opt-in and T4/T5 can be signed without a steward.

**Early warning signals.**

1. Empty `stewards[]` ≥30 days post-adopt with `doctor.stewardNudge` emitted (or CODEOWNERS ahead, TW07).
2. Net Δ >0 of keys in `.ark-baseline.json`, or T4 weakening acks in PRs without `--contract-session`.

### 8. The coach ate the gate

**Story.** In 4.4.0 the compass (IC, `notAScore`) shipped as a lens projection, “never a gate input.” In 4.5.5 DC put module/seam/deletion-test vocabulary into explore, think, place. In 4.6.0 PL rewrote surfaces into plain language. In 4.6.1 SK, doctor, seeing ENFORCE · design-weak, stopped returning a check and pointed at `postGreenPath` → `/ark-explore` (shape-focus, dual-plan B, extraction cards). The freeze (“no new skill names, no LLM verdict”) was kept: the 13 names stayed, eight as shortcuts. The firewall was not weakened in code. It was diluted in ritual.

Six months later a senior opens a domain PR. The PreToolUse hook still measures writes. The agent does not write: it invokes explore, opens ≥12 files, fills Completion, Dual-plan seed, kill-switch. Autopilot applies A (empty, `goal.met`) and proposes B “with user OK.” The human approves maps. Nobody touches `ark.config.json`. Team parliament (TW) adds another liturgy: stewards, mixed-PR deny. The person who came for teeth sees a curriculum. Churn: exactly those seniors. The north-star (“write firewall plus a coach”) was read backwards: the coach became the product; the gate, a sensor nobody uses to ship.

**Underlying assumption.** If the contract decides validity, the coach can be inflated (lenses, five doors, explore-first) without moving the first value term — writes observed.

**Early warning signals.**

- Ratio of `/ark-explore` invocations ÷ PreToolUse writes per session > 1 (maps > patches).
- Percent of post-green sessions that end in dual-plan B with no apply, and churn of adopters with >1 year who cite “liturgy / not a check.”

---

## Synthesis

### 1. Most probable failure

**Installed theater, zero enforcement.** It is already the path the product’s own “when not to adopt” describes. Z09 has no enrolled cohort. GitHub Free cannot require status. Soft and partial hosts dominate the agent market. Doctor already emits the exact evidence (`present-but-not-required`, `configured-not-fired`) and the product still treats install as a win. Substitutes (reason 6) are the same death seen from the buyer side.

### 2. Most dangerous failure

**A public false-green.** Less certain than wallpaper, more lethal. Honesty is the only declared moat. Propia.homes already happened once. One staff tweet with `goal.met` + partial analysis, or ENFORCE read as “the tree is good,” and no voice patch recovers “false done is forbidden.” Maintainer collapse (reason 5) is the continuity killer; false-green is the trust killer. Trust dies first.

### 3. Hidden assumption

**Honest doctor JSON + an install equals retained required enforcement in the field.** The product treats “we told the truth” as if that converted CI to required, named stewards, and kept the contract alive. Closing Z01–Z08 and Z10 while Z09 stays parked is the tell: honesty engineering substituted for field proof. One human cannot be release train, claim gate, six-host matrix, and enroll-er of eight external adopters.

### 4. Revised plan

1. **Redefine “adopted” this week.** D0 = proof of a required GitHub status running `--strict-merge`, or a written `advisory-only` ack in `.ark/adoption-stance.json`. Without that, doctor cannot sound like success. Addresses failure 1.
2. **Enroll 3 design partners, not 8 theater installs.** Use `docs/field/cohort-retention-checklist.md`. If there are not 3 with required-status, the product has no field. Stop shipping honesty patches as a Z09 substitute. Addresses failures 1 and 6.
3. **Close the Propia hole for new code.** Design-delta (or equivalent) on for files created in the candidate inside `--strict-merge`, or change ENFORCE copy so it never implies new-code shape. Packed TS7 + aliases fixture: `goal.met` forbidden when `completeness !== complete`. Addresses failure 2.
4. **Freeze the coach for 30 days.** Zero explore/compass/skill-body deepen. ROADMAP `doing` = adapter health or noun-cut on `start`+doctor (≤12). Addresses failures 3 and 8.
5. **Cut hosts or add an operator.** Stop chasing OpenCode / hosted Codex / untrusted Cursor as if they were hard. Name a second person who can publish, or a fortnightly cadence maximum. Addresses failures 4 and 5.
6. **Stewards or Adapt.** Empty `stewards[]` 30 days post-adopt cannot read as healthy ENFORCE. T4/T5 and baseline-grow require `--contract-session`. Z09 must not count wallpaper. Addresses failure 7.

### 5. Pre-launch checklist

1. Inventory known field trees: *required* status vs `present-but-not-required`. If required = 0, there is no adoption to measure (failures 1 / 6).
2. Run a packed consumer with aliases: assert no adapter emits `goal.met: true` when analysis is not `complete` (failure 2).
3. Count product nouns in the first human output of `ark start` + first `doctor`. Cut until ≤12 (failure 3).
4. Doctor: empty `stewards[]` post-adopt does not display as ENFORCE “healthy finished” (failure 7).
5. Name a second publisher or lock cadence to ≤1 release / 14 days. Ban three `latest` in 36 hours (failures 5 / 4).

---

## Sources opened

- `README.md` — product path, host matrix, when-not-to-adopt
- `ROADMAP.md` — product mandate, value formula, freezes
- `docs/product-voice.md` — north star, false-done forbidden
- `docs/use.md` — start flow, host honesty
- `docs/threat-model.md` — T1–T12, residual risk
- `docs/plans/enforcement-truth-at-speed/README.md` — Z residual, Propia.homes, Z09 parked
- `docs/field/README.md`, `docs/field/cohort-retention-checklist.md` — cohort not enrolled
- `CHANGELOG.md` / 4.6.3–4.6.5 — patch treadmill
- `package.json` — 4.6.5 surface
