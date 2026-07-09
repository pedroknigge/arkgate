---
name: ark-adopt
description: Brownfield onboarding — match contract to real code, classify ungoverned dirs, mine loose business rules into the Ark manifest/intents, freeze only real debt. Deep source analysis required.
---

# /ark-adopt — Bring Ark into an existing codebase

Goal: contract reflects reality, most code governed, only genuine debt frozen with a burn-down.
A green check over a wrong contract is a **false green**.


## Related onboarding

- **Greenfield:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match contract to reality; do not force a starter preset.
- **Default path:** `ark start` → `/ark-autopilot` → `ark-check --doctor`.

## Anti-wrapper rule (mandatory)

**Forbidden:** only running `--init` / `--update-baseline` / coverage JSON without reading the tree.

**Required:**
1. CLI sensor: `--coverage --json`, check `--json` (`summary`), doctor.
2. **Read real source** in largest ungoverned dirs and top import edges (min **10 files**).
3. **“Así te lo re-soluciono”** — concrete layer globs, file moves, and manifest/intent proposals.
4. Never freeze a concentrated edge without investigating contract smell.

## Guiding principle

Ark protects the **boundary around** a framework, not its internals. Nest/DI public surface = one layer; internals black box.

## Steps

1. **Config** — missing → `ark-check --init` (detection). Keep existing unless asked to regenerate.
2. **Check + diagnose** — `summary.concentrated` / dominant edge → fix contract first, don’t freeze.
3. **Classify ungoverned** — use coverage `suggestions`; add layers/patterns via `/ark-contract`.
4. **Mine business rules → manifiesto** (model job — this is why the skill exists):
   - Scan for loose domain: validators, pricing/policy functions, `can*`/`calculate*`, magic business constants, publish/intent strings, logic in UI/hooks that belongs in Domain.
   - Propose: Domain files, `intentPrefixes`, intent names (`Domain.*` / `Application.*`), kernel `defineIntent` stubs if runtime is used.
   - Apply config through `/ark-contract` discipline; move pure rules into Domain when safe; validate with ark-check.
   - Deliver section **“Así te lo re-soluciono en el manifiesto”** with before/after contract snippets.
5. **Freeze only real debt** — `--update-baseline` (zero debt → **no empty baseline file** left behind).
6. **Gates + skills** — `--install-agent-gates` (CI monorepo-aware when `frontend/package.json` exists).
7. **Ratchet plan** — ranked edges + which are false positives avoided.

## Operating modes

Explain modes as **detected stages** (Setup / Align / Guard), not user settings.

## Verify

`ark-check --root . --config ark.config.json --strict-config` (+ baseline only if non-empty file retained).
Report: governed% before/after, files written, frozen count, false positives avoided, manifest/intent proposals applied or deferred.

## Never

- Freeze false positives to get green.
- Force runtime kernel over existing Nest/DI.
- Claim Enforce while governed% is low or core bags ungoverned.
