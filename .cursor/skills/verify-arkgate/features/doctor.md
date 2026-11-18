# doctor

Doctor prints the project status and the next action. It is not the merge check.

## Sub-features

- `status` names the tree and the governed-file line.

## How to get to it (user POV)

- `npx arkgate-check --doctor`
- `npx arkgate-check --doctor --all` for the long form. The proof uses the short form.

## Driving it with verify.mjs

Preconditions:

- Doctor of this checkout prints `doctor ok`.
- Fixture `eval/cases/domain-forbidden-global` is unchanged.

- **Status.** Run `node bin/ark-check.mjs --root eval/cases/domain-forbidden-global --doctor --no-cache`. Exit code `0`. Output contains `Ark doctor` and `Governed:`.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only doctor`.

## Gotchas

- Exit code `0` here does not mean the fixture is free of violations. The same tree fails the core gate.
- The header is colored. Match the words `Ark doctor`, not a raw escape sequence.
