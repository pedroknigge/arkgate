---
name: ark-upgrade
description: Upgrade ArkGate through a content-identity preview, preserve customized files, and verify the active host and architecture contract.
---

# /ark-upgrade — managed ArkGate upgrade

Upgrade the published `arkgate` package and its managed gates without treating a
filename, package version, or similar-looking file as proof of ownership. The
preview is the source of truth: inspect it before applying anything.

For greenfield onboarding, start with `/ark-architect` (or
`ark-check --recommend`); for a brownfield repository, use `/ark-adopt` before
this upgrade flow.

## Dual engine (mandatory)

Use the semantic sensor (`ark-check --doctor --json` plus the strict contract
check) and direct inspection of every managed file the preview will change.
Neither signal replaces the other.


## Dual plane — layers + ArkRules (mandatory, except /ark-runtime)

ArkGate has **two opt-in planes**. The user chooses which to use; you **always label** findings so they never blur.

| Plane | What it protects | Where it lives | Sensors / tools |
|-------|------------------|----------------|-----------------|
| **Layers** (inter-layer) | Who may import whom, capabilities, pure/forbiddenGlobals, peerIsolation | `ark.config.json` → `layers[]`, `rules[]` | graph check, baseline edges, doctor coverage % |
| **ArkRules** (intra-layer) | Structure inside a layer + domain invariants as data | `arkRules` map + `arkrules/<ExactLayerName>.json` | structure sensors, invariant coverage, `--rules-inventory`, doctor `rulesUnderContract` |

**Rules for every report / answer:**
1. Prefix each finding or next step with **`[Layer]`** or **`[ArkRules]`** (or a two-column table with those headers).
2. Never call an import-edge violation an “invariant” or an aggregate sensor a “layer deny.”
3. Absence of `arkRules` is **valid** — do not force ArkRules unless the user wants them or residual inventory clearly wants a pilot.
4. Editing `arkrules/*` or promoting modes is **`/ark-contract`**; fixing code under a structure sensor is **`/ark-fix`** / **`/ark-loop`** (judgment, never invent mechanical-safe).
5. CLI helpers: `ark-check --rules-inventory --json`, doctor JSON `rulesUnderContract`, sensors emit `ARKRULE_*` / `INVARIANT_UNCOVERED` with `evidence.arkruleId`.


### Upgrade + ArkRules
- Refresh skills + note if templates gained ArkRules deepen; do not force consumers to adopt `arkRules`.
- After upgrade: doctor `rulesUnderContract` if map exists; dual-truth note if `--no-install` left package pin old.

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
| `customized` | User content diverged without a competing managed base. | Preserve it. |
| `conflicted` | Both managed base and user content diverged. | Preserve and require explicit consent. |
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

   - Preferred: always use the project-local CLI —
     `npx arkgate upgrade …` or
     `node node_modules/arkgate/bin/ark.mjs upgrade …`
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

3. **Update and re-preview.** If the registry is newer, run (project-local CLI):

   ```bash
   npx arkgate upgrade --apply
   ```

   This updates through the detected package manager and hands control to the new
   package for a fresh preview. Review that new preview; do not assume the old
   candidate and new candidate are identical. If already on the latest package,
   retain the current read-only preview.

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
   `--accept-conflicts`. Never add it merely to make the run green. Run a second
   preview and require `summary.changed: 0`.

5. **Verify enforcement and architecture.** Run
   `npx arkgate-check --doctor --json` (or the project-local `ark-check`) and
   the same fail-closed architecture command used by managed apply (normally
   `npx arkgate-check --root . --config ark.config.json --strict-merge --json`).
   Require `completeness: "complete"` and `ok: true`. Treat provider-unavailable CI
   required-check evidence as `unverified`, never as proof that merges are
   blocked. If new violations appear, hand off to `/ark-fix` for a small set or
   `/ark-loop` / `/ark-autopilot` for residual debt; do not regenerate a baseline
   without explicit approval.

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
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** (or `n/a` if unused)
- **Handoff:** `/ark-…`, CLI action, or `none`
- **Incomplete?** `no` or `yes — <missing work>`

If a required verification did not run or a conflict remains blocked, report the
task incomplete. Deferred hosts (including Codex when inactive) never make Incomplete? yes.
