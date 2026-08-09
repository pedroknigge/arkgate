# Phase ACS queue run summary (2026-08-09)

**Epic:** Agent contract surface → `arkgate@4.3.0`  
**Plan:** [README.md](./README.md)  
**Roadmap:** `ROADMAP.md` Phase ACS (orders 110–117)  
**Status date:** 2026-08-09 (queue run); publish closed same day

## Queue results

| Item | implement_ok | marked_done | blocking_final | open_bugs_final |
|------|--------------|-------------|----------------|-----------------|
| ACS01 | yes | yes | no | 0 |
| ACS02 | yes | yes | no | 0 |
| ACS03 | yes | yes | no | 0 |
| ACS04 | yes | yes | no | 0 |
| ACS05 | yes | yes | no | 0 |
| ACS06 | yes | yes | no | 0 |
| ACS07 | yes | yes | no | 0 |
| ACS08 | yes | yes | no | 0 |

**Failed list:** empty  
**Engineering `doing`:** none (prepare complete; later published)

## What shipped in prepare (ACS01–ACS08)

| ID | Outcome (prepared tree) |
|----|-------------------------|
| ACS01 | Plan lock; guardrail catalog + scan/process voice; freeze restated |
| ACS02 | Public diagnostic code catalog + docs anchors |
| ACS03 | `ark status --json` / MCP `ark_status` + status-manifest schema |
| ACS04 | Version-matched agent projection (`ark agents-md`); non-enforcing |
| ACS05 | Agent Skills packaging of existing 13 skills (no new names) |
| ACS06 | Stable finding refs (analysis-result 1.5) |
| ACS07 | Maintainer placement A/B under `eval/placement-ab/` |
| ACS08 | Claims 0 Contradicted for ACS; CHANGELOG + `docs/releases/4.3.0.md` prepared, then published |

## Post-queue publication (closed)

Engineering queue for Phase ACS finished at prepare. Maintainer publication completed the same day:

1. Full-matrix CI + Security green on release SHA `65f95a0`
2. Package budgets re-recorded with ACS payload headroom
3. `npm run release:npm -- --dry` (OIDC path) green
4. Signed tag `v4.3.0` + GitHub Release
5. `publish-npm.yml` with `tag=v4.3.0`, `dry_run=false` (run `31295575658`)
6. npm `latest` **4.3.0**, provenance + `gitHead` `65f95a0`
7. Public pointers / release notes flipped to **published** (library `#118`; site push)
8. MCP registry package **4.3.0**

**Out of ACS scope (still open product residual):** `Z09` / `RB-11` (retained adoption + independent close).

## ACS08 publish steps

**Closed.** ACS08 prepare landed with the release tree; npm publish and pointer flip completed. Tree identity and npm `latest` are both **4.3.0**. Authority: [docs/releases/4.3.0.md](../../releases/4.3.0.md), [CHANGELOG.md](../../../CHANGELOG.md).

## Recommended next human action

Phase ACS is **shipped**. Prefer residual honesty pass on any remaining “prepared / 4.2.1 latest” wording in maintainer docs, then product residual `Z09` / `RB-11` or the next ROADMAP epic — not a competing ACS `doing` item.
