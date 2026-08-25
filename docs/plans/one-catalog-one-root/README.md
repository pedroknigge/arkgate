# One catalog, one root

> **Plan, not implementation authority.** Work items live in [ROADMAP.md](../../../ROADMAP.md)
> Phase HS. ADR: [0025](../../adr/0025-one-project-skill-catalog.md).

**Status:** Implemented on tree **arkgate@4.7.1** (unpublished). Does not close Z09/K01.<br>
**Slug:** `one-catalog-one-root`<br>
**Target:** **arkgate@4.7.1**

## Problem

A developer on one machine has many ArkGate repos and switches Grok / Claude / Codex / Cursor
in the same repo. Today that produces:

1. **Stale skills** — home `$CODEX_HOME/skills` / `~/.claude/skills` lag the project pin.
2. **Two copies in Codex** — Codex lists user + repo; same `name` is not merged.
3. **MCP bound to another project** — home `config.toml` primary vs project `.codex/config.toml`.
4. **ArkRun not on the leftover `/ark-contract` shortcut** — extra vs companion vs place.

## Decision

See ADR 0025. Canonical `.agents/skills`. Visible `arkgate@<version>. ` on `description`
(picker). Skip home writes when the project catalog exists. `--prune-home-duplicates`.
Doctor next action is prune, not `--codex-home --force`.

## Skill routing (no new names)

| Job | Door |
|-----|------|
| Turn ArkRun extra on (advisory) | `/ark-adopt` |
| Tighten extra / layers / ArkRules | `/ark-contract` leftover → adopt/autopilot |
| Install companion + wire one candidate | `/ark-runtime` |
| New kernel-managed file | `/ark-place` |

## Field repair (existing machines)

```bash
npx arkgate-check --install-agent-gates --skills-only --force
npx arkgate-check --install-agent-gates --skills-only --prune-home-duplicates
```

Then restart Codex/Claude/Cursor/Grok. Picker `description` should start with
`arkgate@4.7.1.`. If Codex still lists two rows, the home copy was not pruned.

## Items

`HS01`–`HS05` in ROADMAP. All `done` on this tree. npm publish is a maintainer step.
