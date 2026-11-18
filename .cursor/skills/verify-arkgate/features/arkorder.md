# ArkOrder

ArkOrder, when the rules file names a few choices, rejects a use-case that writes one of those choices the way it would write a seat count.

## Sub-features

- `xi-field-write` fails `ARKORDER_XI_FIELD_WRITE` for `plan`.

## How to get to it (user POV)

- `npx arkgate-check` on a project with `arkOrder.mode` set to `enforced` and `xiKeys` including `plan`.
- `/ark-order` wires one candidate. The check is the proof.

## Driving it with verify.mjs

Preconditions:

- `tests/fixtures/arkorder-skip-corpus/trees/xi-field-write` is the tree.
- The rules file is `contracts/layers.json` merged with `contracts/arkorder-enforced.json`. The tree does not ship that file itself.

- **Field write.** The driver copies the tree and writes the merged rules file to `ark.config.json`. Then `node bin/ark-check.mjs --root <copy> --no-cache`. Exit code `1`. Output contains `ARKORDER_XI_FIELD_WRITE`.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only arkorder`.

## Gotchas

- The tree without the merged rules file is not this proof. Say so if the merge step did not run.
- Doctor text about billing is not the signal. The signal is `ARKORDER_XI_FIELD_WRITE`.
