# ArkRules

ArkRules checks structure inside a layer. The fixture's bad `Order` class fails the private-state sensor.

## Sub-features

- `bad-aggregate` fails `ARKRULE_STRUCTURE` for `aggregate-private-state`.

## How to get to it (user POV)

- `npx arkgate-check` on a project whose rules file points at `arkrules/DomainModel.json`.
- `/ark-contract` edits those extra rules. The check is the proof.

## Driving it with verify.mjs

Preconditions:

- `tests/fixtures/arkrules-poc-enforcement` still contains `Order.bad.ts` and `Order.good.ts`.

- **Bad aggregate.** The driver copies the fixture, renames `src/domain/Order.bad.ts` to `src/domain/Order.ts`, and deletes `Order.good.ts`. Then `node bin/ark-check.mjs --root <copy> --no-cache`. Exit code `1`. Output contains `ARKRULE_STRUCTURE` and `aggregate-private-state`.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only arkrules`.

## Gotchas

- The fixture stores both shapes. Running the check in place does not select the bad class. The rename is the precondition.
- A second violation about `coverageRoots` can appear. The proof does not require it. Do not delete the private-state line from the report to make the output shorter.
