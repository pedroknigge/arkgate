# Core gate

The same bad domain edit is blocked when a host is about to write it, and again by the check a pull request runs.

## Sub-features

- `write-hook` denies a new domain file that calls `Date.now()`.
- `pr-strict-merge` fails `ark-check --strict-merge` on the existing forbidden global, after the pull-request workflow is installed.

## How to get to it (user POV)

- The host PreToolUse hook runs `arkgate-mcp --hook` on Write, StrReplace, or the host's patch tool.
- CI runs `npx arkgate-check --strict-merge`.
- `/ark-autopilot` is the skill that edits code until that check is clean.

## Driving it with verify.mjs

Preconditions:

- `node .cursor/skills/verify-arkgate/verify.mjs --doctor` prints `doctor ok`.
- Fixture `eval/cases/domain-forbidden-global` still has `Date.now()` in `src/domain/invoice.ts`.

- **Write hook.** Run proof `write-hook`. The driver sends a Write payload for a new file `src/domain/clock.ts` whose body is `export const t = Date.now();`. Exit code `2`. Stderr contains `blocked` and `FORBIDDEN_GLOBAL`. The file is not created.
- **Pull request.** Run proof `pr-strict-merge` on a temp copy. The driver installs Cursor gates, then runs `node bin/ark-check.mjs --root <copy> --strict-merge --no-cache`. The workflow file contains `--strict-merge`. Exit code `1`. Output contains `FORBIDDEN_GLOBAL`.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only core-gate` prints `PASS` for both proofs.

## Gotchas

- Rewriting `src/domain/invoice.ts` with the same `Date.now()` call is existing debt. The hook allows that edit. The proof uses a new file.
- `--strict-merge` on a tree without `AGENTS.md`, `.mcp.json`, and a workflow reports missing gates and does not reach `FORBIDDEN_GLOBAL`. Install gates first.
- The hook's stderr says the one-file result is provisional. `--strict-merge` is the project verdict. Both belong in the report.
