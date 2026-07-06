---
name: ark-contract
description: Safely edit ark.config.json (layers, rules, forbiddenGlobals, intent prefixes), validated with strict ark-check. The one sanctioned way to change the architecture contract.
---

# /ark-contract — Evolve the architecture contract safely

You are editing `ark.config.json` — the machine-readable contract every gate
(write gate, CI, ESLint, runtime) enforces. Changes here alter what ALL agents
and humans are allowed to write, so the bar is: smallest change, validated,
explained.

**No change described?** If invoked with no specific edit, don't guess and don't
edit anything — the intent is the user's to give. Take the snapshot (step 1) and
present the evolution options grounded in THIS contract: adopt a `suggestedLayers`
layer, tighten a permitted/implicit edge to denied, add `forbiddenGlobals` to a
pure layer, or move a file between layers. While reading the config, surface any
real classification inconsistency you notice (e.g. an HTTP-client file sitting in
a non-integration layer via a fallback pattern) — but before calling a move a
"clean config change", check the file's actual imports against the target layer's
rules (see step 2's move bullet). Then ask which change to make. Reading the
contract to produce that is real work, not a stalling question.

## Steps

1. **Snapshot first** — run `ark-check --root . --config ark.config.json
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
   - **Split a layer into a public surface + internals (the facade fix)**: when a
     check's `summary` shows most violations are ONE edge into a layer (e.g. all of
     app-land importing a kernel/framework), the contract — not the code — is wrong.
     Split the target layer in two: a `<Layer>Api` layer whose patterns cover the
     sanctioned entrypoints app code is meant to import (the target subtrees the
     breakdown points at, e.g. `kernel/app/**`, `kernel/events.ts`), and keep the rest
     as `<Layer>Internal`. Allow the edge into the surface, deny it into internals.
     This legalizes the intended dependency while still forbidding reach-arounds — it
     collapses a wall of false positives to ~0. This is how Ark stays compatible with a
     DI framework: it guards the border, not the framework's insides.
     The surface patterns overlap the internal catch-all, and that is fine: ark-check
     resolves the MOST SPECIFIC pattern per file, so `kernel/app/**` wins over
     `kernel/**` regardless of layer order. Where app code today reaches into internals
     for a legitimate entrypoint, do NOT rewrite every call site: add a barrel module
     inside the surface layer (e.g. `src/kernel/app/facade.ts`) that re-exports exactly
     those entrypoints, then repoint the reach-around imports to the barrel. It is
     behavior-preserving (verify with `tsc --noEmit`) and the imports are now legal.
   - **forbiddenGlobals**: adding one to a domain layer may reveal existing
     violations — run the check, and if there are hits, fix them (`/ark-fix`
     patterns). If they are too numerous to fix now, freezing them in the
     baseline is a valid stopgap but requires explicit user approval first (it
     silences the new violations); never skip the guard because the code is
     dirty today.
   - **Move a file to another layer**: only a config change if the file's
     imports are ALREADY legal under the target layer's rules. Read the file's
     imports, resolve each to its layer, and check the target may import that
     layer. If the file mixes concerns the target can't reach (e.g. an HTTP
     client that also reads a persistence-layer cache, where
     `Integration → Persistence` is denied), moving it BREAKS the contract —
     that's a refactor (split the file so the pure part moves), not a config
     edit. Say so instead of recommending the move; don't discover it only after
     editing the config.
3. **Validate** — `ark-check --root . --config ark.config.json
   --strict-config` (strict makes config warnings fail; that's intended here).
4. **Diff the impact** — compare violations before/after. New violations from a
   tightening are expected: list them and fix them now if the set is small; if
   it's large, the baseline stopgap from step 2 applies (approval required).

## Operating rules

- **Loosening the contract to silence a violation is refused by default.** If
  the user asks for an allowed-edge whose only motivation is one red check,
  explain the port/adapter alternative first (one plain-language paragraph) and
  only proceed if they confirm they want the architectural exception.
- Keep rules explicit: when adding a layer, state in the report which edges you
  denied and why, so a novice reading it learns the dependency direction.
- Update generated rule files if the contract summary embedded in them changed:
  re-run `ark-check --install-agent-gates` (no `--force`; mention any
  skipped-because-customized files).

## Verify and report

End with a passing strict check (or a committed baseline decision). Report:
the exact config diff, before/after violation counts, what is now
possible/forbidden in one sentence each, and any follow-ups.
