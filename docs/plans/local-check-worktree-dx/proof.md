# LC01 proof — local multi-worktree check

Measured on `linux x64 Intel(R) Xeon(R) Processor x4` at 2026-09-12T10:27:03.665Z.
This checkout: `/workspace`.

Numbers are wall times from `scripts/local-check-dx-proof.mjs`. They are
evidence, not a product SLA. `--local` reuses `--changed`; it does not
invent a second engine.

## Mother tree (this repo)

| Invocation | Wall | Exit | Notes |
|---|---:|---:|---|
| full `ark-check --json` | 1327 ms | 0 | whole governed set |
| `--local --base HEAD --json` | 693 ms | 0 | dirty worktree (this slice); scoped `--changed` path |
| `--changed --base HEAD --json` | 735 ms | 0 | same engine path |
| `--local --strict-merge` | — | 2 | refused (Contener) |

Local JSON: `{"local":true,"scope":"changed"}` (not a cheap empty-diff exit — files in this slice were dirty).

## 40-file fixture (one dirty file)

| Invocation | Wall | Exit |
|---|---:|---:|
| full `ark-check --json` | 260 ms | 0 |
| `--local --base HEAD --json` | 257 ms | 0 |

## Two-root isolation

Two independent git fixtures, each with one dirty governed file.

| Fact | Observed |
|------|----------|
| Root A `ok` / `local` | true / true |
| Root B `ok` / `local` | true / true |
| `analysisRoot` differs | true |
| Shared analysis lock | none (no global flock; sockets are per-root digest) |
| Sequential pair wall | 497 ms |

Overlap concurrency (Promise.all, two dirty roots) is asserted in
`tests/unit/static-check/localCheckDx.test.ts`.

## Bound (honest)

`--local` does not make `--doctor` or `--strict-merge` faster. Import
closure can still be large when a barrel file sits on the diff. Full-tree CI
stays the merge line. Write hooks stay lexical; they do not run this check.
