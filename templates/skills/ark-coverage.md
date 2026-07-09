---
name: ark-coverage
description: Deep-audit this project's real code + Ark adoption gaps. CLI is a sensor only — you must read source, propose concrete remediations, and optional manifest/intent mining. Ranked report with "así te lo re-soluciono".
---

# /ark-coverage — Deep coverage + capability gaps

You audit how this repo uses ArkGate **and** what the **real source tree** needs next.
Work autonomously. End with a ranked report that includes a concrete fix plan.

## Anti-wrapper rule (mandatory)

**Forbidden:** reporting only `ark-check --coverage/--doctor/--json` paraphrase, gate checklists, or "unused capability" tables with no source evidence.

**Required before you finish:**
1. Run CLI as **sensor** (`--coverage --json`, `--doctor`, normal `--json` for `summary`).
2. **Read real source** in the top ungoverned / high-coupling clusters (minimum **8 files** across at least **3 directories** that matter). Prefer `src/core/**`, `domain/**`, adapters, etc.
3. Deliver **“Así te lo re-soluciono”** — file-level moves, contract globs, intent/manifest proposals, not only “run /ark-contract”.

If you did not open source files, the skill is **not complete**.

## Operating modes (detected — not user-picked)

| Mode | User meaning | What you tell them |
|------|----------------|--------------------|
| **Suggest / Setup** | Thin or new tree | “Ark will propose a starting shape — you don’t switch a mode.” |
| **Adapt / Align** | Contract ≠ folders or open debt | “Gates don’t fully protect you yet — classify + fix plan.” |
| **Enforce / Guard** | Coverage + clean edges | “You arrived here — keep CI/write gates on.” |

Never say “your architecture is guarded” while `goal.met` is false or governed% is low.

## Related onboarding

- **Greenfield:** low governed% → `/ark-architect` or `ark-check --recommend`.
- **Brownfield:** `/ark-adopt` + this skill’s deep map — **not** `/ark-architect`.
- **Business rules / intents loose in the tree:** also cover in **Así te lo re-soluciono** (mine → `intentPrefixes` / Domain placement / kernel `defineIntent` stubs). Full apply path is `/ark-adopt` or `/ark-contract` deep mode.

## Checklist (sensor + code)

1. Config + `ark-check --strict-config` (note: dead preset globs are advisory; unclassified files still fail strict).
2. Baseline policy (orphan empty file? wire or delete).
3. Write gates + `/ark-*` skills per detected agent.
4. CI workflow + monorepo install reality (`frontend/package.json`?).
5. ESLint `arkgate/eslint` if ESLint exists.
6. Domain `forbiddenGlobals`.
7. **Governed%** + full unclassified + `suggestions` from `--coverage --json`.
8. Concentrated edges in check `summary` → contract smell, not N freezes.
9. `layersWithoutRules`.
10. Runtime kernel / Nest only if deps prove it — never force-fit Next+Python.

## Deep code pass (the model job)

For each top cluster (e.g. `frontend/src/core/threads`, `components/workspace`):

- Who imports whom (App→Presentation? Domain→App?).
- Is “core” really application, UI, or mixed?
- Loose business logic: `calculate*`, `can*`, `validate*`, policy numbers, publish/intent strings without registry.
- Propose: layer home, `ark.config.json` patterns, optional Domain extract, intent names (`Domain.*` / `Application.*`).

## Output format

1. **Headline honesty** — governed%, mode, violations, false-green risk (one paragraph).
2. **Code map** — clusters you read + what you found (paths).
3. **Ranked table**

| # | Gap | Evidence (path or CLI) | Así te lo re-soluciono (concrete) |

4. **Manifiesto / reglas de negocio** (if any candidates): list proposed intents / Domain files / config edits.
5. Offer: “Apply top N?” — apply only if user agrees; then re-run strict check.

## Done criteria

- ≥8 source files read and cited.
- At least one **Así te lo re-soluciono** block with real paths.
- CLI numbers used as evidence, not as the whole report.
