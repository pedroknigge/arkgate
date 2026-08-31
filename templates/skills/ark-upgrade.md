---
name: ark-upgrade
description: Upgrade ArkGate. Preview first, keep customized files, then apply.
---

# /ark-upgrade — managed ArkGate upgrade

**When:** bump the published `arkgate` package and refresh managed gates.
**Not when:** session 0 (`/ark-adopt`) or leftover design (`/ark-explore`).

## Steps

1. Preview: `arkgate upgrade` (no writes). Default is **hosts keep** — do not retire other hosts’ skills.
2. Apply in this turn: `arkgate upgrade --apply` (installs the bumped package unless `--no-install`). Needs `--plan-digest` when applying managed files.
3. Re-run `arkgate-check --doctor`. Customized files stay unless you pass `--accept-conflicts` / `--refresh-skills`.

## Checklist

- Preview unions `--tools` with hosts already in the repo. Multi-agent trees keep every host.
- Apply must run the package install of the new pin. Do not skip `npm install` unless `--no-install` is explicit.
- Refresh AGENTS.md **and** CLAUDE.md (same projection schema).
- Prefer project `.agents/skills`. Do not duplicate the catalog into `~/.codex/skills`.

The preview is the source of truth. Do not treat a filename or package version as proof of ownership.

## Autonomy contract

Invoking this skill **is** the approval. Preview, then `--apply` **in this turn**.
Stopping at preview is incomplete unless the probe failed or a conflict needs
`--accept-conflicts` / `--refresh-skills` consent.

For session 0, start with `/ark-adopt` (or `ark-check --recommend`); brownfield
honesty is `/ark-adopt` before this upgrade flow.

## Improvement compass (process preflight)

When doctor is available, read `doctor.improvementCompass` (or the human **Improvement compass** section).
Name 1–3 **residual** lenses in plain language before skill-shopping. Always `notAScore` — never invent
0–10 scores or Excellent/Good ranks.

**What the user should feel next:** fewer blocked AI writes, clearer folders, safer domain — then jargon.

**Anti false-done:** empty plan A + leftover design work → **Incomplete? yes**. Green imports alone
are not “architecture finished.”

**AI-easy architecture:** ports over concrete I/O in domain; one concern per module; golden pattern for
new files; place before write (`/ark-place` / prepare-write).

**Out of scope (honest):** scalability/performance, full app-security tooling (SAST), and full resilience
patterns are **out-of-scope** lenses — say so; do not invent Ark enforcement for them.

**After upgrade:** refresh projection; re-doctor; compass residual still drives process, not scores.

## Suggested improvements (what to try next)

After `ark upgrade` (preview or apply), read JSON **`whatsNew`** or the human **Suggested improvements**
block (also on preview when nothing to apply). It lists concrete try/inspect actions for this package
line (advisory only — not a score):

1. **Deep-module coach** — `ark-check --doctor` → `doctor.deepModuleCoach` (hot paths + deepening)
2. **Improvement compass** — residual lenses on doctor/HTML (not a score)
3. **Session recipe** — `ark status --json` honesty modes; doctor when mode is not full
4. **Two-axis done** — architecture residual vs feature/ticket residual (Enforce green ≠ feature done)
5. **Self-service honesty** — upgrade `selfService` write-path labels + customized preserve
6. **Registry-aware upgrade** — `reasonCode` / `suggestedInstallCmd` when package install is skipped or needed
7. **Skill drift + refresh** — `skillDrift`; opt-in `--refresh-skills` for customized skill rewrite
8. **Multi-project MCP** — `processPackage` mismatch/stale on every MCP tool; restart after package bump
9. **Codex hard write refresh** — run
   `npx arkgate-check --install-agent-gates --tools codex --force`, restart Codex/local Desktop,
   review and trust the exact hook, then inspect `doctor.writePath` after a governed
   `apply_patch`. Only a complete runtime-observed local patch is hard; every other path still
   relies on required CI.
10. **Stale process recovery** — a stale Ark MCP is non-authoritative and project tools return
    `PROCESS_PACKAGE_STALE` until restart/retarget. If a modern global `ark upgrade` is older than
    the project install, it hands the same invocation to the project-local CLI instead of managing
    the project from the stale PATH binary.

Never invent gate verdicts from these suggestions. Missing residual is honest empty, not green.

## Field truth (package install + skills + multi-project MCP)

| Situation | Honest product behavior |
|-----------|-------------------------|
| CLI version == `node_modules` but npm registry is ahead | `--apply` **installs** (does not false-skip). Inspect `reasonCode: BEHIND_REGISTRY`. |
| Offline / `npm view` failed | May skip with `REGISTRY_UNAVAILABLE` + `suggestedInstallCmd` — do not invent a version. |
| Skills customized after install | Preserved by default. Preview `skillDrift` shows counts. **`--refresh-skills`** rewrites customized *skills* only with consent. |
| Conflicted managed assets | Still need `--accept-conflicts`. Never silent overwrite of true edits. |
| Multiple checkouts / monorepo packages | One `expectedRoot` per project; upgrade **each** pin; restart MCP after bump; prefer project-local CLI until identity matched **and** process version aligns. |
| Stale `~/.claude/skills`, `~/.grok/skills`, or `~/.gemini/config/skills` | Shared homes should be the newest ArkGate on the machine (additive; never downgrade). Refresh: `--install-agent-gates --skills-only --agent-homes --force`. Project skills may lag with the pin. Antigravity’s global catalog still refreshes when the project `.agents/skills` already exists. |
| Active host not in `--tools` / manifest | Preview `hostSelection` notes it and suggests `--tools` expansion. |

**Post-apply:** read `postUpgradeChecks` (advisory). Confirm pin↔CLI, run doctor (compass + deepModuleCoach),
`agents-md --check`, `ark status --json`, and MCP version note if MCP was used.


## Dual engine (mandatory)

Use the semantic sensor (`ark-check --doctor --json` plus the strict contract
check) and direct inspection of every managed file the preview will change.
Neither signal replaces the other.


## MCP workspace binding (mandatory)

Before any `ark_*` MCP tool, call `ark_identity` with `project.expectedRoot` set to the exact
workspace root. Continue only when `binding.status === "matched"` and `authoritative === true`;
retain `projectIdentity.projectId`, then pass both `expectedRoot` and `expectedProjectId` under
`project` on every later MCP call. If identity is missing, mismatched, unverified, or the root is
uncertain, do not consume MCP analysis: use the workspace-local CLI and report that MCP
restart/retargeting is required. `ark://manifest` never satisfies this preflight.

**Process package honesty:** every tool response includes `processPackage` (`processArkgateVersion`,
`projectInstalledVersion`, `processPackageMismatch` / `processStale`, `nextAction`). After
`npm install arkgate@…`, **restart/retarget MCP** so process version matches install. From 4.6.4,
a stale MCP is non-authoritative: `ark_identity` diagnoses it and project tools return
`PROCESS_PACKAGE_STALE` until restart. Prefer project-local CLI meanwhile. A modern stale global
`ark upgrade` hands off automatically; pre-4.6.4 globals need one `npx arkgate upgrade` entry.

## Dual plane — layers + extras (mandatory, except /ark-runtime)

ArkGate has **always-on Layers** plus opt-in extras. The user chooses extras; you **always label** findings so they never blur. Absence of an extra is silent and valid. Skills never enforce. ArkOrder is an extra **inside** the `arkgate` package (`arkgate/order`), not a second install.

| Plane | What it protects | Where it lives | Sensors / tools |
|-------|------------------|----------------|-----------------|
| **Layers** (inter-layer) | Who may import whom, capabilities, pure/forbiddenGlobals, peerIsolation | `ark.config.json` → `layers[]`, `rules[]` | graph check, baseline edges, doctor coverage % |
| **ArkRules** (intra-layer) | Structure inside a layer + domain invariants as data | `arkRules` map + `arkrules/<ExactLayerName>.json` | structure sensors, invariant coverage, `--rules-inventory`, doctor `rulesUnderContract` |
| **ArkRun** (extra) | Kernel usage + complete declarations; information package `decisionTape` `{ xiHash, event, residual }` | `arkRun` on `ark.config.json` (schema `1.2+`); factory `arkgate/runtime`; **`kernelRoots` preferred**, `compositionRoots` alias | `ARKRUN_*`, doctor `arkRun` (`notAScore`) |
| **ArkOrder** (extra) | Operational pattern (ξ vs s). Valve: first `release()`, later ξ is `proposeRelease` then `apply`; `refreshSigma`; ingest residual `absorb \| escalate_up \| hold` + `reasonCode`; capacity pack as data; in-memory `ReleaseStore` | `arkOrder` on `ark.config.json` (schema `1.3+`); factory `arkgate/order` | `ARKORDER_*` |

**Rules for every report / answer:**
1. Prefix each finding or next step with **`[Layer]`** or **`[ArkRules]`** or **`[ArkRun]`** or **`[ArkOrder]`** (or a table with those headers).
2. Never call an import-edge violation an “invariant” or an aggregate sensor a “layer deny.”
3. Absence of `arkRules` is **valid** — do not force ArkRules unless the user wants them or residual inventory clearly wants a pilot.
4. After upgrade, leftover architecture work is **`/ark-autopilot`** (never invent `mechanical-safe`).
5. CLI helpers: `ark-check --rules-inventory --json`, doctor JSON `rulesUnderContract`, sensors emit `ARKRULE_*` / `INVARIANT_UNCOVERED` with `evidence.arkruleId`.
6. Schema `1.3` extras stay off unless already on. Pin teaches `arkgate/runtime` (same tarball), not the deprecated companion. Do not invent `/ark-run` or `/ark-order`.


### Upgrade + ArkRules
- Refresh skills + note if templates gained ArkRules deepen; do not force consumers to adopt `arkRules`.
- After upgrade: doctor `rulesUnderContract` if map exists; dual-truth note if `--no-install` left package pin old.

### Upgrade + extras
- Schema `1.3` extras (`arkRun` / `arkOrder`) stay off unless already on. Do not turn extras on during upgrade.
- Pin teaches `arkgate/runtime` (same tarball). `@arkgate/runtime` is deprecated. Do not send agents to `packages/runtime/README.md` as the kernel guide.
- After 4.8.2, customized skills may lag — opt-in `--refresh-skills` with consent so the frozen 13 names pick up four-plane deepen. No new skill names.

## Safety contract

- Always invoke the **project-local** CLI (`npx arkgate` /
  `node node_modules/arkgate/bin/ark.mjs`). Bare PATH `ark` / `arkgate` is unsafe
  when a global 2.x install shadows the project (mutative legacy upgrade).
- `ark upgrade` (managed era) is read-only. It reports the selected profile and hosts, every
  managed asset, its content state, and the exact next command.
- The first `ark upgrade --apply` updates the dependency and lockfile, then runs
  the newly installed CLI to produce another read-only preview. It does **not**
  apply that preview's gate or skill changes.
- The post-update/no-install preview's `nextCommand` includes
  `--plan-digest <sha256:…>` and applies only that exact candidate. A changed file
  or selection invalidates the digest instead of being overwritten.
- Missing or conflicted assets previously recorded as managed require explicit
  `--accept-conflicts`. Stop and obtain user consent before using it.
- Customized files are preserved. Unrelated source files and similar filenames
  are never adopted. The command never writes a Codex home or another global
  directory implicitly.
- Do not combine this flow with legacy `--force`, `--migrate-commands`, or
  `--codex-home` repair commands. Diagnose any older adoption debt separately.

## Read the states

| State | Meaning | Action |
|---|---|---|
| `current` | Content identity matches the candidate. | Record/adopt safely; metadata-only stamps may refresh. |
| `stale` | Recorded managed content still matches its old identity. | Safe candidate replacement. |
| `missing` | Candidate is absent. | Create if new; require consent if a recorded asset was deleted. |
| `customized` | User content diverged without a competing managed base. | Preserve it. Opt-in rewrite for **skills only**: `--refresh-skills`. |
| `conflicted` | Both managed base and user content diverged. | Preserve and require explicit consent (`--accept-conflicts`). |
| `retired` | A recorded asset is no longer selected by the candidate. | Preserve its file and manifest identity; take no action. |

## Procedure

1. **Resolve the project CLI (mandatory before any upgrade command).** Prefer the
   **project-local** binary — never bare `ark` / `arkgate` from PATH unless you
   prove it is this project's install.

   Resolution order:

   1. `node node_modules/arkgate/bin/ark.mjs` from the repository root (both `arkgate`
      and `ark` package bins map to this file).
   2. Package-manager exec from the project: `npx arkgate`, `pnpm exec arkgate`,
      `yarn arkgate`, etc.

   **Do not** use bare `ark` / `arkgate` from PATH unless `which ark` (or the
   resolved realpath) is under this project's `node_modules/arkgate`, or the
   binary reports the **same** version as `node_modules/arkgate/package.json` and
   supports managed upgrade.

   **Capability probe (abort if missing):** run
   `node node_modules/arkgate/bin/ark.mjs upgrade --help` (or the resolved local
   equivalent) and require a **managed upgrade** surface — help text must mention
   `--plan-digest` (and read-only `upgrade --json` preview). If the only available
   CLI is old (global Homebrew / npm global 2.x, or any binary whose help lacks
   `--plan-digest`), **stop**: skill incomplete; do **not** preview or apply.
   Global 2.x `ark upgrade` is mutative and can rewrite managed skills, forcing a
   later `--accept-conflicts` recovery.

   **Recovery (preferred → optional):**

   - Preferred: package-manager runner from project / `--root`
     (`npx arkgate upgrade …` / `pnpm exec arkgate upgrade …` / `yarn arkgate upgrade …`).
     This works when arkgate is **hoisted** and a nested package has no shallow
     `node_modules/arkgate`.
   - Secondary: `node node_modules/arkgate/bin/ark.mjs upgrade …` from the
     **workspace install root** (not a nested package lacking a local install).
   - Optional: refresh a global install with `npm i -g arkgate@latest` only if the
     user wants a global binary; still prefer project-local for this procedure.

   Record the resolved CLI path/version, read
   `node_modules/arkgate/package.json`, query `npm view arkgate version`, identify
   the repository package manager, and open the intervening entries in the
   shipped `CHANGELOG.md` (fall back to registry or release notes and name that
   source). Do not infer “latest” from `node_modules` alone.

2. **Preview managed content.** Using the **project-local** CLI from step 1
   (never a bare PATH `ark` that failed the probe), run:

   ```bash
   npx arkgate upgrade --json
   # or: node node_modules/arkgate/bin/ark.mjs upgrade --json
   ```

   Pass `--root <path>` and `--tools <active-host>` when selection would otherwise
   be ambiguous. Open the reported files that matter to this repository. Confirm
   that customized files remain non-applying and that any deletion/conflict is
   blocked.

3. **Update and re-preview.** If the registry is newer **or** CLI == pin but registry is ahead
   (field false-skip is fixed), run (project-local CLI):

   ```bash
   npx arkgate upgrade --apply
   ```

   This updates through the detected package manager (registry-aware) and hands control to the new
   package for a fresh preview. On skip, read `reasonCode` / `suggestedInstallCmd` — agents must not
   invent recovery. Review the new preview; do not assume old and new candidates are identical.
   If already current (`ALREADY_CURRENT`), retain the read-only preview and still read `whatsNew`
   + `skillDrift`.

   For pnpm repositories with `minimumReleaseAge`, use the repository's existing
   trusted first-party exception mechanism when the new release is still cooling
   off, and prove `pnpm install --frozen-lockfile` succeeds.

4. **Apply only the reviewed candidate.** When there are no blocked assets, run
   the preview's **exact** `nextCommand` as emitted (JSON field / human “Apply the
   exact preview with: …”). That command is already **project-local**
   (`npx arkgate` / `pnpm exec arkgate` / `yarn arkgate` — never bare PATH `ark`).
   Do **not** rewrite it to bare `ark upgrade`; pasting through a global 2.x PATH
   reintroduces the mutative footgun. Shape:

   ```bash
   npx arkgate upgrade --apply --no-install --plan-digest <preview-digest>
   ```

   If recorded deletion/conflict recovery is desired, ask first and then add
   `--accept-conflicts`. Never add it merely to make the run green.

   If customized **skills** should match package templates after pin bump, ask first and add
   `--refresh-skills` on the digest-bound apply (or a new preview that includes the flag). Never
   add it merely to make the run green. Run a second preview and require `summary.changed: 0`
   (unless more deliberate refreshes remain).

5. **Verify enforcement and architecture (post-upgrade checks).** Read apply JSON
   `postUpgradeChecks` when present. Also run:
   `npx arkgate-check --doctor --json` (or the project-local `ark-check`) and
   the same fail-closed architecture command used by managed apply (normally
   `npx arkgate-check --root . --config ark.config.json --strict-merge --json`).
   Require `completeness: "complete"` and `ok: true`. Confirm `doctor.improvementCompass` and
   `doctor.deepModuleCoach` honesty. Run `npx arkgate agents-md --check` and
   `npx arkgate status --json`. If MCP was used, restart MCP after package bump and re-bind
   identity. Treat provider-unavailable CI required-check evidence as `unverified`, never as proof
   that merges are blocked.    If new violations appear, hand off to `/ark-autopilot`; do not regenerate a baseline without
   explicit approval.

## Active host vs deferred hosts

**Active host:** its repo-local gate, skills, MCP/advisory surface, doctor evidence,
and strict check must be coherent before completion.

**Deferred hosts:** inactive hosts may remain untouched and must be named with a
future repair command when relevant. Deferred hosts never make Incomplete? `yes`
once the active host and shared repository surfaces are verified. A temporary
upgrade path or an actively selected host is not deferred.

The managed manifest retains the selected host set, so a later preview does not
silently switch to a different host. Home-level Codex setup is separate and is
never an implicit side effect of this skill.

## Subagent fan-out (optional, host-dependent)

Parallelize independent preview, changelog, and enforcement checks when the
host supports isolated subagents; otherwise fall back to sequential execution.

## Completion contract (skill incomplete if missing)

Skill incomplete if missing any required verification or any field below.

End with exactly this structure:

### Completion
- **Sensor:** commands/tools run
- **Opened:** real project and changelog paths read
- **Active host:** host and verified status
- **Deferred hosts:** `none` or host plus future action
- **Result:** old → new version and managed-upgrade outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** vs **[ArkRun]** vs **[ArkOrder]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Handoff:** `/ark-…`, CLI action, or `none`
- **Incomplete?** `no` or `yes — <missing work>`

If a required verification did not run or a conflict remains blocked, report the
task incomplete. Deferred hosts (including Codex when inactive) never make Incomplete? yes.
