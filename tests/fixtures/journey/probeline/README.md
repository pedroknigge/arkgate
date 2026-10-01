# Probeline

A zero-dependency ESM project used as a packed-tarball journey fixture for the
invariant probe (ADR 0039). Tests run with `node:test`, so nothing is installed
or fetched at test time.

- `INV-WINDOW-KILLED`: the refund window guard is pinned by a day-30 and a
  day-31 test. Every change the probe makes is caught → `killed`.
- `INV-TOTAL-SURVIVES`: the order-total test checks the happy path only.
  Removing the negative-total `throw` goes unnoticed → `survived`.
- `INV-UNREACHED`: the currency test loads the file but never calls
  `roundToCents` → `not-reached`.
- `INV-TYPE-ONLY`: the symbol is a TypeScript `interface`, a declaration with
  no behavior to change → `unprobeable`.

After `--probe-invariants --write`, `--promote` refuses the survivor and the
unreached invariant with blocker `probe-survived` and allows the killed one.
