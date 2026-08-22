# Changelog

All notable changes to ArkGate (`arkgate`; formerly `ark-runtime-kernel`) are documented here or
in the immutable pre-2.0 archive linked below.

## Unreleased

## 4.6.6 — 2026-08-22

**Patch** over **4.6.5**. Phase AL corrective honesty plus a slimmer public docs surface.
**No required config migration.** Does not close Z09. AL05 stays parked.

**Status: current** (shipping as `arkgate@4.6.6`; see `docs/releases/4.6.6.md`).

### Changed

- **D0 adopted (AL01):** a tree is adopted only when a required GitHub status runs
  `arkgate-check --strict-merge`, or `.ark/adoption-stance.json` records explicit
  `stance: "advisory-only"`. Doctor / start / status no longer sound like success from
  `AGENTS.md` or a workflow file alone. `operatingMode: enforce` stays contract-fit
  (`ok` / `goal.met` / `--strict-merge` unchanged). Does not close Z09.

- **`--strict-merge` / `--strict` created-path design delta (AL02):** the advertised merge
  command now evaluates `domain-logic-in-ui` for **created** files versus the Git merge
  base (`--base-ref`, then `ARK_POLICY_BASE_REF`, then `origin/$GITHUB_BASE_REF`, then
  local discovery). Historical residual and a stronger rule in an **existing** UI file
  stay green. Missing base skips the check (does not exit 2), matching Action first-push
  / EH04. `--fail-on-new-smells --base-ref` remains the full new+worsened-on-touched-paths
  ratchet (Z10 unchanged). The GitHub Action needs no extra flags: `--strict` inherits
  `ARK_POLICY_BASE_REF`.

- **Stewards or Adapt (AL03):** empty `stewards[]` cannot print Healthy ENFORCE (doctor
  unfinished residual `empty-stewards`; `operatingMode` stays `enforce`). T4 weakening
  and T5 `--update-baseline` require `--contract-session` even with an empty list;
  `--policy-ack` remains the hash tooth. `--force` does not skip the session. Does not
  flip all `--strict-merge` to team preflight when the list is empty.

- **First-run noun cut (AL04):** `ark start --help`, `ark start` preview, and the first
  doctor screen each stay at **≤12** product nouns. Default `arkgate-check --doctor` is
  compact; `--doctor --all` prints Details. Compass and deep-module coach stay in JSON and
  drop from human output. No new skill names, scores, or LLM verdicts.

- **Docs surface:** npm `CHANGELOG.md` keeps Unreleased + 4.6.x (pre-4.6 in
  `docs/archive/CHANGELOG-pre-4.6.md`). Live `ROADMAP.md` is the current queue; full
  history is archived. README / use lead with adopted = required merge status.

## 4.6.5 — 2026-08-19

**Patch** over **4.6.4**. Adoption, placement, doctor, upgrade, and write-path honesty for
existing Next.js trees and multi-host teams. **No required config migration.**

**Status: published** (on npm `latest` until 4.6.6 lands; see `docs/releases/4.6.5.md`).

### Changed

- **Adopt starter:** existing trees get SharedKernel (types/constants), CompositionRoot (wiring),
  and `src/**/domain/**`. Flattened `src/lib/**` is not dumped into Application. Adopt writes
  `.ark/golden-pattern.json` (load-bearing for place).
- **Place:** `filePath` is required (fail-closed). Never invents `components/*.tsx` or defaults
  to Presentation.
- **LAYER_IMPORT nextAction:** branches by import kind — constants/types → Domain/SharedKernel;
  kernel/events from Persistence → do not emit; port only for a real use-case.
- **Reserved empty globs:** `reserved` / `allowEmpty` so `--strict-config` does not fail on
  future houses. Typo warning only if the glob is not reserved.
- **Parse / lexical:** `ANALYSIS_PARSE_INCOMPLETE` includes the TypeScript line + message.
  Contract `exclude` paths skip the write hook. Incremental mid-edit parse does not deny.
  `LEXICAL_EVIDENCE_INCOMPLETE` hook deny does not tell the agent to call `ark_prepare_change`.
- **WritePath / CI honesty:** `.ark/ci-merge-boundary.json` — hook configured-not-fired,
  per-host writePath (Claude hard vs Cursor soft), CI present-but-not-required, GitHub Free
  cannot require. Hook green is not tree green.
- **Upgrade:** preview default is hosts keep (union `--tools` with existing). Apply installs
  the bumped package unless `--no-install`. Projection writes AGENTS.md and CLAUDE.md.
  Prefer project `.agents/skills`; home must not duplicate the catalog.
- **Doctor JSON:** stable envelope `{ schemaVersion, envelope: "doctor", ok, doctor }`.
  ENFORCE + empty plan A → Shape, not reinstall gates. Distinguishes installed vs stale skills.
- **Graph scan:** threshold scales with included file count (floor 2500, cap 8000) so a
  ~3300-file Next.js tree is not deferred.
- **INVARIANT_UNCOVERED:** `never-had-tests` (adopt residual) vs `tests-disappeared` (regression).
- **CLI-first:** identity handshake is optional when the CLI already resolved the root.

## 4.6.4 — 2026-08-18

**Patch** over **4.6.3**. `ark upgrade` now tells Codex users how to activate the local
`apply_patch` boundary after upgrading: refresh the project hook, restart Codex/local Desktop,
trust the exact hook definition, and verify `doctor.writePath` after a governed patch.
**No required config migration.**

**Status: published** (see `docs/releases/4.6.4.md`).

### Changed

- **Upgrade JSON:** `whatsNew.items` includes stable id `codex-hard-write` with the exact
  `--install-agent-gates --tools codex --force` command and evidence to inspect.
- **Upgrade human output:** **Suggested improvements** prints the same refresh/restart/trust/check
  path on preview and apply, including nothing-to-apply previews.
- **Upgrade skill:** flat and Agent Skills guidance tells Codex to exercise a governed
  `apply_patch` and keeps hosted/specialized/shell/direct/incomplete/human paths CI-backed.
- **Stale MCP fail-closed:** when process version no longer matches the project install,
  `ark_identity` reports non-authoritative evidence and project tools return
  `PROCESS_PACKAGE_STALE` until restart/retarget.
- **Global CLI handoff:** a modern stale global `ark upgrade` delegates the original invocation
  to the project-local `node_modules/arkgate/bin/ark.mjs` instead of managing from the wrong PATH
  version. Pre-4.6.4 globals still require one `npx arkgate upgrade` entry.

## 4.6.3 — 2026-08-18

**Patch** over **4.6.2**. Codex CLI and local ChatGPT Desktop/App Server now get a
runtime-proven pre-write block for complete `apply_patch` calls. ArkGate accepts the current
`tool_input.command` payload, while incomplete, hosted, specialized, shell/direct, and human
write paths remain CI-backed. **No required config migration.**

**Status: published** (npm `latest` from signed tag `v4.6.3`; OIDC run `32167523804`;
see `docs/releases/4.6.3.md`).

### Changed

- **Codex hook payload:** current `PreToolUse` `apply_patch` bodies are read from
  `tool_input.command`; historical patch/input/content fields stay compatible.
- **Operation-scoped hard write:** a complete trusted and runtime-observed local patch can report
  `hard:true` and exit `2` before disk mutation. Hook files alone stay unverified.
- **Honesty surfaces:** host matrix, doctor/status, `--require-write-hook codex`, onboarding,
  upgrade self-service, skills, and public docs now share the same boundary.
- **All-path backstop:** required `arkgate-check --strict-merge` CI remains mandatory. MCP stays
  advisory and repair reinjection is not claimed.

## 4.6.2 — 2026-08-16

**Patch** over **4.6.1**. First-contact copy: a newcomer (human or coding agent) sees what
to do in a few lines — `arkgate` / `arkgate-check --help`, start wrap-up, doctor light +
#1, write-gate deny, SessionStart, MCP tool order, and the five doors. Same 13 skill names.
**No required config migration.**

**Status: published** (on npm `latest`; see `docs/releases/4.6.2.md`).

### Changed

- **First-run help:** `arkgate --help` and `arkgate-check --help` are short; encyclopedia
  text is `--help --all`. `arkgate upgrade --help` is preview vs apply.
- **Start wrap-up:** doctor → `/ark-adopt` session 0 (not `/ark-autopilot` as step 1).
- **Doctor:** operating-mode light + primary next action #1 print first.
- **Write-gate deny:** `blocked {file} — {reason}` then `Next:` (move the import / `/ark-place`).
  Rule id on a following line. No “call ark_manifest”.
- **Agents:** SessionStart points at `/ark-adopt` or `arkgate-check --doctor`. `ark_identity`
  is first. `ark_check` is a scan (pass/fail/incomplete), not a yes/no architecture score.
  `server.json` first sentence is the layers definition.
- **Skills:** five doors open with when + steps. Shortcuts are not the first-run menu.
- **Status:** `nextAction` is `map-leftover-design` when leftover design work remains
  (never `stay-enforced`).
- **npm `description`:** `One architecture config. One check. One coach.` (not “co-pilot”).
- **`docs/use.md`:** Cursor hard-blocks Write/StrReplace when hooks are trusted;
  Codex/OpenCode stay advisory.

## 4.6.1 — 2026-08-14

**Patch** over **4.6.0**. Five-door autonomy (skills write or map in-turn; CLI is sensor +
gate) plus team parliament (law vs feature: stewards, mixed-PR deny, ratchet vs the merge
base, cheap `--changed` check). Same 13 skill names. Steward identity is a GitHub handle or
email, not git `user.name`. **No required config migration.**

**Status: published** (on npm `latest`; see `docs/releases/4.6.1.md`).

### Added

- **Five-door autonomy (SK01–SK05):** `/ark-adopt`, `/ark-place`, `/ark-autopilot`,
  `/ark-explore`, `/ark-upgrade` write or map in the same turn. The other eight names stay
  installed as shortcuts. Invoking a door is the approval; the CLI does not apply the change.
- **Team parliament (TW01–TW08):** mixed law+product deny; optional `stewards` (GitHub handle
  or email); `--contract-session` / `--contract-diff` / `--changed --base` / `--against` /
  `--persona` / `--author`; `ark status --vs`; doctor `stewardNudge` (ask or show list drift).
  `stewards` is excluded from the policy hash.

### Changed

- Doctor, compact router, and public lanes prefer the five doors. Historical changelogs stay
  as shipped.
- Published 4.6.1 tarball `README.md` still banners 4.6.0 (packed at `1eadc96` before the
  pointer flip). Tree README on `main` is current. No 4.6.2 for that banner.

## 4.6.0 — 2026-08-12

**Minor** over **4.5.7**. Understandable Ark: doctor, HTML, skills, and public docs use common
software words (import rules, leftover design work, pre-write block) while **ArkGate** and
**ArkRules** stay as product names. Shared Claude/Grok agent homes get the same monotonic
“always latest” floor Codex already had. **No required config migration.** JSON field names
and `ruleId`s stay stable. No new skill names, sensors, or scores.

**Status: published** (on npm `latest`; see `docs/releases/4.6.0.md`).

### Added

- **Shared Claude/Grok home skills:** `--claude-home`, `--grok-home`, and `--agent-homes`
  write monotonic home catalogs (Codex-parity lock + floor). Doctor reports stale
  `~/.claude/skills` / `~/.grok/skills` when those catalogs exist. Temp/upgrade `--root`
  never mutates default user homes.

### Changed

- **Human language:** doctor, HTML report, compact router, skills, and public lanes prefer
  common terms. Leftover design work replaces “design-weak” in human copy; JSON `designWeak`
  is unchanged.

## 4.5.7 and earlier

Pre-4.6 history lives in the maintainer archive, not the npm changelog:
[docs/archive/CHANGELOG-pre-4.6.md](docs/archive/CHANGELOG-pre-4.6.md).
