# Five-door autonomy (skills beyond CLI)

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) ·
> [Product voice](../../product-voice.md)

**Status:** Prepared for **arkgate@4.6.1** (Phase SK; SK01–SK06; SK07 publish pending)  
**Slug:** `five-door-autonomy`  
**Kind:** epic seed / skill process (same 13 names)  
**Owners:** product (Pedro) + library maintainers  
**Last updated:** 2026-08-14  
**Target package:** **4.6.1** (patch — five-door process; prepared, not published)

---

## Why

The 13 skills taught agents to run CLI and ask OK. Users ended up saying “implement ArkGate
full” in prose. Day-to-day work is five doors. Invoking a door **is** the approval. CLI/MCP
stay sensor + gate. No package LLM pass/fail.

**Silent** auto-apply remains forbidden: the compact router must not reshape the tree unasked.
Invoking `/ark-adopt` or `/ark-autopilot` is asked.

---

## Five doors (emphasize)

| Door | Job |
|------|-----|
| `/ark-adopt` | Session 0: mark the path (greenfield scaffold + brownfield honesty) |
| `/ark-place` | New feature: name home **and write** |
| `/ark-autopilot` | Apply / tighten (plan A + one Shape refactor) |
| `/ark-explore` | Map only (open the tree; do not write) |
| `/ark-upgrade` | Preview then apply in the same turn |

The other names stay installed (never-downgrade home catalog, Agent Skills, eval). They are
**shortcuts** to these doors.

---

## Freeze (held)

| Frozen | Why |
|--------|-----|
| New skill **names** | Deepen + route only |
| New sensors / scores | Out of scope |
| LLM package pass/fail | Deterministic gate only |
| Weaken `ark.config.json` | Policy-delta engine |
| Invent `mechanical-safe` kinds | Closed classifier |
| Delete skill files | Home catalog + eval fixtures keep names |

---

## Ordered backlog

Phase prefix: **`SK`**. Preferred order: **SK01 → SK02 → SK03 → SK04 → SK05**.

| ID | Size | Outcome |
|----|-----:|---------|
| `SK01` | S | ROADMAP + this seed + product-voice autonomy contract |
| `SK02` | L | Rewrite the 5 door bodies; generate agent-skills |
| `SK03` | M | Thin the other 8 to shortcuts |
| `SK04` | M | Compass / router / doctor / MCP pointers → five doors |
| `SK05` | M | Public docs emphasis |
| `SK06` | M | Prepare arkgate@4.6.1 |
| `SK07` | L | Publish npm/MCP + site 4.6.1 |

---

## Acceptance

- Adopt / place / autopilot / upgrade **require writes** (or upgrade apply) in-turn; explore
  **requires** opened source, not CLI-only.
- The 5 doors do not `STOP — invoke /ark-X` for work they now absorb.
- Doctor / compass / router skill refs prefer the 5 (plus docs/CLI).
- `check:agent-skills`, `check:cli-pure`, `check:architecture` green.
- Eval fixtures that look for `ark-architect` / `ark-place` names still resolve.
