# V01 performance evidence

`npm run bench:scale -- --sizes 1000,10000,50000 --runs 5 --fail-budget --json` emits schema
`3` evidence for fresh cold scans, cache-free one-shot warm scans, and canonical
resolved-facts analysis. Fixture creation and candidate resolution are outside the timed sections.

The generated fixtures contain mixed TS/JS and ESM/CJS modules, relative and alias imports,
workspaces, and a symlink signal. Cold samples run in fresh child processes with `--no-cache`.
Z04 retired `node_modules/.cache/ark-check.json` because its pre-resolved-facts entries could become
a second semantic authority. Warm samples therefore assert that the legacy cache remains absent,
that every cold/warm JSON verdict is byte-identical, and that the 50k one-shot warm p95 stays under
the same frozen 30 second ceiling. The Z07 canonical-analysis sample resolves one changed candidate,
computes a validated public-API oracle, and then times only reevaluation of the resolver's immutable
in-process facts. Oracle/result bytes, verdict, facts hash, and candidate-tree hash must match; the
changed candidate must have a distinct identity. The initial local recording (Darwin arm64,
Node 26.4.0, 20 fresh workers) measured 20.851 ms p95 for the analysis-only stage. Three comparable
Linux Node 20 distributions then measured 84.023, 81.066, and 84.568 ms p95. Because the earlier
50 ms proposal could not be reached on that runner without changing the endpoint or caching a
verdict, Z07 armed a reviewed 100 ms ceiling before closure. Budget mode takes 20 samples only at
the preregistered 10k target and one parity sample at the non-target 1k/50k fixture sizes.

The committed budget targets Ubuntu `latest` with Node 20. Peak RSS is child-process maximum RSS
from `/usr/bin/time` on Linux and is bounded at 1 GiB. CI writes `performance.v3.json` and uploads
it as the candidate-SHA-tied performance artifact. Budget changes require measured evidence and
review; the runner never rewrites this file.

`hook-path-bench.mjs` schema `4` records a fresh-process hook fallback and the same payload through
the opt-in resident MCP evaluator. Every resident sample still starts a fresh lightweight launcher;
only TypeScript, the gate, and policy/compiler inputs stay resident, and no allow/deny result is
cached. One discarded prime is excluded, byte-for-byte status/stdout/stderr parity is required, and
policy/compiler identity drift forces the one-shot fallback. Doctor retains comparable cold and
one-shot-warm distributions, then measures fresh `ark-check` clients against canonical facts in the
resident MCP. The public `ark-check` entry keeps this resident client lightweight and dynamically
loads the full one-shot runtime only for fallback. Dynamic doctor surfaces are recomputed; only the
immutable facts snapshot is reused.
`--no-cache` remains an explicit legacy flag, and exact bytes plus an unchanged fixture are required.
