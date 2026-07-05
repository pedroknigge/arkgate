---
name: ark-contract
description: Safely evolve ark.config.json — add or adjust layers, rules, forbiddenGlobals, intent prefixes — validating with strict ark-check before and after. The one sanctioned way to change the architecture contract.
---

# /ark-contract — Evolve the architecture contract safely

You are editing `ark.config.json` — the machine-readable contract every gate
(write gate, CI, ESLint, runtime) enforces. Changes here alter what ALL agents
and humans are allowed to write, so the bar is: smallest change, validated,
explained.

## Steps

1. **Snapshot first** — run `npx ark-check --root . --config ark.config.json
   --json` and save the result. You must be able to show what the change
   legalized or newly forbids.
2. **Make the smallest edit** that achieves the user's intent:
   - **New layer**: add `{ name, patterns }`; add `intentPrefixes` if the
     project uses intent naming; wire explicit `rules` edges to its neighbors —
     a layer with no rules is ungoverned, so default to denying edges that match
     the project's existing direction of dependencies.
   - **New rule**: prefer adding a DENIED edge (tightening). For an ALLOWED
     edge (loosening), first check whether any current code depends on it — if
     nothing needs it, don't add it (a permission nobody uses is future debt).
   - **forbiddenGlobals**: adding one to a domain layer may reveal existing
     violations — run the check, and if there are hits, fix them (`/ark-fix`
     patterns). If they are too numerous to fix now, freezing them in the
     baseline is a valid stopgap but requires explicit user approval first (it
     silences the new violations); never skip the guard because the code is
     dirty today.
3. **Validate** — `npx ark-check --root . --config ark.config.json
   --strict-config` (strict makes config warnings fail; that's intended here).
4. **Diff the impact** — compare violations before/after. New violations from a
   tightening are expected: list them and fix them now if the set is small. If
   it's large, freezing them in the baseline is a valid stopgap but requires
   explicit user approval (it silences the new violations).

## Operating rules

- **Loosening the contract to silence a violation is refused by default.** If
  the user asks for an allowed-edge whose only motivation is one red check,
  explain the port/adapter alternative first (one plain-language paragraph) and
  only proceed if they confirm they want the architectural exception.
- Keep rules explicit: when adding a layer, state in the report which edges you
  denied and why, so a novice reading it learns the dependency direction.
- Update generated rule files if the contract summary embedded in them changed:
  re-run `npx ark-check --install-agent-gates` (no `--force`; mention any
  skipped-because-customized files).

## Verify and report

End with a passing strict check (or a committed baseline decision). Report:
the exact config diff, before/after violation counts, what is now
possible/forbidden in one sentence each, and any follow-ups.
