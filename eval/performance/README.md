# V01 performance evidence

`npm run bench:scale -- --sizes 1000,10000,50000 --runs 5 --fail-budget --json` emits schema
`1` evidence for fresh cold scans, real `ark-check` warm-cache scans, and public-API
`analyzeChange` measurements. Fixture creation is outside the timed sections.

The generated fixtures contain mixed TS/JS and ESM/CJS modules, relative and alias imports,
workspaces, and a symlink signal. Cold samples run in fresh child processes with `--no-cache`.
Warm samples prime then reuse `node_modules/.cache/ark-check.json`; the report verifies cache hits
by matching its file keys to the live source tree. Incremental samples use the built public package
from `dist/index.js`, preserve policy and unchanged-content hashes, and measure only
`analyzeChange`.

The committed budget targets Ubuntu `latest` with Node 20. Peak RSS is child-process maximum RSS
from `/usr/bin/time` on Linux and is bounded at 1 GiB. CI writes `performance.v1.json` and uploads
it as the candidate-SHA-tied performance artifact. Budget changes require measured evidence and
review; the runner never rewrites this file.
