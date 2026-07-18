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
