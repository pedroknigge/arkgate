---
name: ark-place
description: "Where does new code go? Names the layer, directory, and naming for a new artifact from the contract, and scaffolds it there. Autonomous."
arkVersion: 2.0.1
---

# /ark-place — Where does this code go?

The user describes something they need to build (a saga, a background job, an
event handler, a repository, an HTTP client, a use case, a projection, …).
Your job: name the layer it belongs to, the directory, the naming convention,
and — if they asked to build it — scaffold it there correctly.

**No artifact given?** If the skill is invoked with nothing to place, don't error
and don't guess — the artifact is the one thing only the user knows. Read the
contract (step 1) and print the placement map from it: one row per declared layer
with what belongs there, its directory, and which layers it may/may not import,
plus the not-yet-adopted `suggestedLayers` as a footnote. Then ask what they want
to place. That map is derived entirely from the repo, so producing it is real work,
not a stalling question.

## Steps

1. **Read the contract, not your intuition.** If the `ark` MCP server is available,
   call the **`ark_place`** tool with the target file path — it returns the layer,
   its forbidden globals, and exactly which layers the file may / must not import,
   straight from the contract (no guessing). Otherwise load `ark.config.json` and the
   `ark://manifest` MCP resource (it includes `suggestedLayers` with conventional
   directories for layers not yet adopted). The project's `AGENTS.md` placement table,
   if present, is authoritative too.
2. **Classify the artifact** by what it does, not what it's called:
   - Pure business rules/entities/value objects → domain-model layer.
   - Orchestrates a use case, no I/O of its own → application layer.
   - Talks to a database, queue, API, filesystem → an adapter layer on the side
     that matches the direction (driven/persistence vs driving/http).
   - Reacts to events, long-running coordination (saga/workflow), scheduled
     jobs, projections → the event/workflow layers if the config declares them.
3. **Answer concretely**: layer name, target directory (from the layer's
   `patterns`), intent-name prefix if the layer declares `intentPrefixes`, and
   which layers it may/may not import (from `rules`).
4. **If the layer isn't adopted yet** (suggested but no directory): say so,
   give the conventional directory from `suggestedLayers`, and offer
   `/ark-contract` to adopt it — don't silently drop the code into a
   wrong-but-existing layer.
5. **If asked to create it**: scaffold the file(s) in place, following the
   nearest existing sibling's style, and any port/adapter split the rules force.

## Operating rules

- Never ask "which layer do you prefer?" — the contract decides; you translate.
  Only surface a question when the artifact genuinely spans two legal designs
  with different trade-offs, and then recommend one.
- Explain the placement in one plain-language sentence ("this goes in
  `src/domain` because it's a business rule that shouldn't know about the
  database") — assume the user may be new to layered architecture.

## Related onboarding

- Run **after** shape adoption: `/ark-architect` or `ark init --archetype` on greenfield;
  `/ark-adopt` on brownfield.
- `ark-check --recommend` / MCP `ark_recommend` picks phase-1 dirs; gallery starters in
  `examples/*-starter/` show correct placement per archetype.
- Related demos: `docs/demos/` (write-gate self-correction, brownfield, autopilot).

## Verify and report

If you created files, run `ark-check --root . --config ark.config.json
--strict-config` and make it pass. Report: placement + why, files created (if
any), and the import rules the new code must respect going forward.
