# Local multi-worktree check DX (4.8.15 first slice)

**Status:** first slice (`LC01`) — opt-in local cheap path.  
**Does not close** `Z09` / `K01`. No `schemaVersion` bump. No new skill.  
**Later slices:** dogfood #243 / #246 / #247.

Field: Pedro / Amarilla — many git worktrees and branches on one machine
(64 GB Mac). `ark-check` / write-hook analysis felt like one machine-wide
multi-minute block. Related residual: `#205 --changed` still felt expensive
before the scoped-facts fix; dogfood saw doctor / full check ~109 s.

## What analysis does today (measured in this tree)

| Path | Scope | Shared across worktrees? |
|------|--------|--------------------------|
| Write hook / MCP `--hook` | Lexical snippet + import probe for the candidate. `LEXICAL_EVIDENCE_INCOMPLETE` names `ark-check` as authority. | No. Root comes from the payload / cwd. |
| `ark-check --changed --base <ref>` | Touched sources + import closure (`scopeFiles`). File-local ArkRules stay on the touched set. | No. Facts resolve under `--root`. |
| `ark-check` / `--doctor` / `--strict-merge` | Full governed set. | No global analysis lock. |
| Resident MCP / `--resident` | Unix socket under `os.tmpdir()/arkgate-<uid>/<digest>.sock`. Digest includes **realpath of root**. | Parent tmp dir is per-user; **socket is per root**. |
| Hint cache | Process-local `Map`, keyed by `path.resolve(root)`. | Same process only. |
| Legacy `node_modules/.cache/ark-check.json` | Retired (Z04). `--no-cache` is a no-op. | n/a |

There is **no machine-wide analysis flock**. Concurrent worktrees already
compute independently. The choke is **N full-tree TypeScript fact builds**
(or a local script that still calls bare `ark-check` / `--doctor`).

`--changed` already exists. People do not use it when the base ref is
implicit, and CI templates correctly keep `--strict-merge`.

## Options

| # | Option | Tradeoff |
|---|--------|----------|
| **A** | Opt-in `--local` / `ARK_CHECK_LOCAL=1` → reuse `--changed`; require a git base; refuse `--strict-merge` and full-tree report modes | Thinnest. No new schema, cache, or engine. Local can be cheap; CI stays fail-closed. Does not make a forgotten full `ark-check` faster. |
| B | Persist facts under `.ark/` keyed by content hash | Warm reuse across invocations. Invalidation risk. Z04 retired the last on-disk scan cache on purpose. |
| C | Global concurrency cap / nice | Protects one laptop from N full scans. Serializes or throttles across worktrees — a new machine-wide choke. |

**Pick A.** Reuse `--changed`. Keep Contener hard on `--strict-merge`. Write
hooks stay lexical (already). Document that work is per `--root` / worktree.

## Contract

- `--local` turns on `--changed`. Pass `--base <ref>` or let team-base
  discovery find `origin/dev` / `origin/main` / …
- `ARK_CHECK_LOCAL=1` is the same, except it is **ignored** under
  `--strict-merge` and under `--doctor` / `--coverage` / `--plan` / `--report`
  / `--promote` so a leftover env cannot weaken CI or shrink status.
- Explicit `--local --strict-merge` **fails** (exit 2). Contener stays hard.
- JSON adds `local`, `scope: "changed"`, `analysisRoot` (additive).
- Same engine. Not a second verdict. A local pass is not a full-tree
  structural verdict.

## Proof

See [proof.md](proof.md) (filled after the timing run on this tree + two-root
fixture). Tests in `tests/unit/static-check/localCheckDx.test.ts` and
`tests/unit/static-check/checkArgs.test.ts`.
