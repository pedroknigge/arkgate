# Team parliament (law vs feature)

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) ·
> [Product voice](../../product-voice.md)

**Status:** Prepared for **arkgate@4.6.1** (Phase TW; TW01–TW08 done; ships with SK06/SK07)  
**Slug:** `team-parliament`  
**Kind:** epic seed / enforcement (same engine; no org plane)  
**Owners:** product (Pedro) + library maintainers  
**Last updated:** 2026-08-14  
**Target package:** **4.6.1** (same train as five-door autonomy)

---

## Why

ArkGate is a copilot for one writer and one checkout. Most field repos are a parliament:
many agent sessions, long-lived branches, rationed CI, humans who must ignore Ark, and a
small set of stewards who own the constitution.

Invoking `/ark-adopt` is approval to mark the path. It is **not** approval to amend the
law inside a product PR. The lock lives in the **gate**, not in skill discipline.

---

## Three teeth

1. **Law is a different change type.** `ark.config.json`, `arkrules/*`, and
   `.ark-baseline.json` must not ship in the same diff as product source unless the
   check is an explicit `--contract-session`. Loosen and baseline-grow are steward-only
   when `stewards` is set.
2. **Ratchet vs the branch you merge to.** `--against <base>` compares new violation
   keys to the baseline (and law) of that ref — not only the file on HEAD.
3. **A check a small PR can pay.** `--changed --base` scans touched sources. Personas
   are budget presets (`touch` / `contributor` / `agent` / `steward`), not new modes of
   light. `ark status --vs <base>` prints pin / contract / baseline drift in one line.

---

## Non-goals

- Org chart, dashboard, or IAM product
- Forcing skills onto humans
- Hardening PreToolUse to cover people who never hit the hook
- Autopilot that coordinates many agents
- New Suggest/Adapt/Enforce modes
- A second strengthen/loosen classifier (reuse policy-delta)

---

## Queue

| ID | Size | Outcome |
|----|------|---------|
| `TW01` | S | ROADMAP + this seed + product-voice |
| `TW02` | L | Mixed deny, stewards, `--contract-session`, `--contract-diff` |
| `TW03` | M | Baseline records + `--against` |
| `TW04` | L | `--changed --base`, personas, `status --vs` |
| `TW05` | M | Public docs + skill copy |
| `TW06` | S | Doctor/adopt detect several hands and ask for stewards |
| `TW07` | S | Drift: team grew or CODEOWNERS ahead of `stewards[]` |
| `TW08` | S | Steward identity is GitHub handle or email (not git display name) |

Same 13 skill names. Historical changelogs stay as shipped.
