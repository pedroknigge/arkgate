# Skills

`--install-agent-gates --skills-only` writes the project skill catalog under `.agents/skills`.

## Sub-features

- `catalog` writes `ark-adopt`, `ark-runtime`, and `ark-order`.

## How to get to it (user POV)

- `npx arkgate-check --install-agent-gates --skills-only`
- The names you type are `/ark-adopt`, `/ark-place`, `/ark-autopilot`, `/ark-explore`, `/ark-upgrade`, `/ark-runtime`, and `/ark-order`.

## Driving it with verify.mjs

Preconditions:

- Doctor prints `doctor ok`.
- The command runs in a temp copy of `eval/cases/domain-forbidden-global`.

- **Catalog.** Run `node bin/ark-check.mjs --root <copy> --install-agent-gates --skills-only --force`. Exit code `0`. Output contains `.agents/skills/ark-adopt/SKILL.md`.
- **Files.** `ark-adopt` contains `name: ark-adopt` and `arkgate@`. `ark-runtime` contains `name: ark-runtime`. `ark-order` contains `name: ark-order`.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only skills`.

## Gotchas

- `--skills-only` does not install write hooks. Host hooks are a separate proof.
- The version after `arkgate@` changes when the package version changes. The proof checks the prefix.
