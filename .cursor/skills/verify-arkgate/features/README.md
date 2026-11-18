# ArkGate verification map

This directory is the user-path map for ArkGate. The driver executes `docs/feature-map.json`. Read this index, then the feature file, before driving one feature by hand.

## Baseline preconditions

- Repository root of this ArkGate checkout.
- `npm ci` and `npm run build` have been run. `node .cursor/skills/verify-arkgate/verify.mjs --doctor` prints `doctor ok`.
- Proofs that write files use a temp copy. Do not install gates or apply `start` in the checkout.
- Temp directories are outside the checkout so a parent `ark.config.json` is not picked up.

## Driving conventions

- Run `node .cursor/skills/verify-arkgate/verify.mjs` for every feature in this index.
- Run `node .cursor/skills/verify-arkgate/verify.mjs --only <id>` for one feature. `<id>` is the feature file name without `.md`.
- Treat argv in `docs/feature-map.json` as literal.
- Keep quoted signals unchanged. `FORBIDDEN_GLOBAL` is not the same claim as "the check failed".

## Proof and skip reporting

- The evidence file is `/tmp/arkgate-verify-evidence.txt`. Cleanup of temp copies must leave that file in place.
- A skipped entry point is not verified by a different command. Say which command you did not run, and why.
- OpenCode has no `--hook` line. Do not report it as a hard write hook because the other hosts have one.

## Feature entry contract

Each feature file has an H1, one paragraph, then `Sub-features`, `How to get to it (user POV)`, `Driving it with verify.mjs`, and `Gotchas`.

## Features

- [Core gate](./core-gate.md) covers the write hook and `--strict-merge`.
- [start](./start.md) covers preview and `--apply`.
- [doctor](./doctor.md) covers `ark-check --doctor`.
- [coverage](./coverage.md) covers `ark-check --coverage`.
- [recommend](./recommend.md) covers `ark-check --recommend`.
- [ArkRules](./arkrules.md) covers an enforced structure sensor.
- [ArkRun](./arkrun.md) covers a kernel import in the domain.
- [ArkOrder](./arkorder.md) covers a direct write of a named choice.
- [Host hooks](./host-hooks.md) covers one install for each supported host.
- [MCP server](./mcp.md) covers initialize and `validate_code`.
- [Skills](./skills.md) covers the project skill catalog.
