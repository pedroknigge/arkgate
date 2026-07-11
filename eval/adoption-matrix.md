# External adoption matrix (Q4) — scaffold

**Status:** template only. Full Q4 DoD requires ≥12 published clean-room runs — **not done**.

## Dimensions (fill per run)

| Field | Values |
|-------|--------|
| Archetype | greenfield hexagonal · brownfield layered · monorepo · Next UI · Nest API · library |
| Host | Claude · Cursor · Codex · Grok |
| Package manager | npm · pnpm · yarn |
| Tree size | small (<100) · medium · large |
| Path | `ark start` / `ark init` / `/ark-adopt` |
| Time-to-Enforce | minutes / agent turns |
| turns-to-green | median |
| false-block | count |
| CHEATED | 0/1 |
| Manual interventions | count |
| P0/P1 open | none / list |

## Runs log

| # | Date | Repo/fixture | Archetype | Host | PM | Size | Enforce? | Notes |
|---|------|--------------|-----------|------|-----|------|----------|-------|
| 1 | | | | | | | | _pending_ |

## How to run a cell

1. Clean clone or fixture under a temp root.  
2. Install arkgate; `ark start` or adopt path.
3. Record doctor operating mode, writePath, violations.  
4. Attach loop-cost / plan metrics when using agents.  
5. Append a row; never mark ROADMAP Q4 `done` until ≥12 cells + no open P0/P1.
