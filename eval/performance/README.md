# V01 performance evidence

`npm run bench:scale -- --sizes 1000,10000,50000 --runs 5 --fail-budget --json` emits schema
`2` evidence for fresh cold scans, cache-free one-shot warm scans, and public-API
`analyzeChange` measurements. Fixture creation is outside the timed sections.

The generated fixtures contain mixed TS/JS and ESM/CJS modules, relative and alias imports,
workspaces, and a symlink signal. Cold samples run in fresh child processes with `--no-cache`.
Z04 retired `node_modules/.cache/ark-check.json` because its pre-resolved-facts entries could become
a second semantic authority. Warm samples therefore assert that the legacy cache remains absent,
that every cold/warm JSON verdict is byte-identical, and that the 50k one-shot warm p95 stays under
the same frozen 30 second ceiling. Z07 owns the identity-keyed snapshot replacement. Incremental
samples use the built public package from `dist/index.js`, preserve policy and unchanged-content
hashes, and measure only `analyzeChange`.

The committed budget targets Ubuntu `latest` with Node 20. Peak RSS is child-process maximum RSS
from `/usr/bin/time` on Linux and is bounded at 1 GiB. CI writes `performance.v2.json` and uploads
it as the candidate-SHA-tied performance artifact. Budget changes require measured evidence and
review; the runner never rewrites this file.

`hook-path-bench.mjs` schema `3` records a fresh-process hook fallback and the same payload through
the opt-in resident MCP evaluator. Every resident sample still starts a fresh lightweight launcher;
only TypeScript, the gate, and policy/compiler inputs stay resident, and no allow/deny result is
cached. One discarded prime is excluded, byte-for-byte status/stdout/stderr parity is required, and
policy/compiler identity drift forces the one-shot fallback. The same report retains cold and
one-shot-warm doctor distributions in fresh processes with identical argv, fixture, and cache-free
state. `--no-cache` remains an explicit legacy flag while no Ark cache exists. Doctor evidence keeps
`residentWarm: null` until the separate doctor pilot exists; one-shot warm is never relabeled as
resident or as a 10x result.
