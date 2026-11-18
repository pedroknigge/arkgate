# recommend

Recommend names a shape for the tree it was pointed at.

## Sub-features

- `json` includes an `archetype` field.

## How to get to it (user POV)

- `npx arkgate-check --recommend`
- `/ark-adopt` uses a recommendation when the rules file is still missing.

## Driving it with verify.mjs

Preconditions:

- Fixture `eval/cases/domain-forbidden-global` is present.

- **JSON.** Run `node bin/ark-check.mjs --root eval/cases/domain-forbidden-global --recommend --json --no-cache`. Exit code `0`. Output contains `"archetype":`.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only recommend`.

## Gotchas

- The archetype string can change when the fixture changes. The proof checks that the field is present.
- Recommend does not write `ark.config.json`. `start --apply` is the command that does.
