# coverage

Coverage reports how many files in scope sit in a layer.

## Sub-features

- `json` prints a governed percent for the one-file fixture.

## How to get to it (user POV)

- `npx arkgate-check --coverage`
- `/ark-coverage` reads that output and explains it. The CLI is the proof.

## Driving it with verify.mjs

Preconditions:

- Fixture `eval/cases/domain-forbidden-global` has one file under `src/domain/`.

- **JSON.** Run `node bin/ark-check.mjs --root eval/cases/domain-forbidden-global --coverage --json --no-cache`. Exit code `0`. Output contains `"percent": 100`.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only coverage`.

## Gotchas

- A governed percent is not a pass on the forbidden global. Run the core gate for that.
- `--coverage` does not install gates and does not write the rules file.
