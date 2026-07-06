---
name: ark-fix
description: Resolve Ark architecture violations at the root cause — fix the code (ports, adapters, moves), never weaken the contract. Runs ark-check, fixes, verifies.
---

# /ark-fix — Fix architecture violations properly

You are resolving violations reported by `ark-check` or by the Ark write gate.
Work autonomously end to end: diagnose, fix, verify. Do not ask the user to
paste output you can generate yourself.

## Operating rules

- First action: run `ark-check --root . --config ark.config.json --json`
  (add `--baseline .ark-baseline.json` if that file exists) to get the current
  violation list. If the user quoted a specific gate block, start from that one.
- **Check `summary` before fixing code.** If `summary.concentrated` is true — most
  violations are ONE edge — the fix is almost certainly the CONTRACT, not N code
  changes: app-land is reaching a framework/kernel through a sanctioned entrypoint,
  or a layer needs splitting into a public surface + internals. Stop and hand off to
  `/ark-contract`; don't port-and-adapter your way through hundreds of false
  positives. Fix code only for the genuine, scattered minority.
- **Fix value edges before type-only ones.** `summary` splits `valueCount` (real
  runtime coupling) from `typeOnlyCount` (`import type …` — erased at compile time, no
  runtime dependency). Prioritize the value edges; a `typeOnly: true` violation almost
  always just means a type lives in the wrong layer (see the type-only pattern below).
- **Never weaken the gate.** Do not edit `ark.config.json`, add allowed edges,
  delete rules, or regenerate the baseline to make a violation disappear. The fix
  lives in the code. If you become convinced the contract itself is wrong, stop
  and say so with your reasoning — changing the contract is `/ark-contract` and a
  human decision.
- Take defaults silently and list them at the end. Stop only for destructive
  moves (deleting files, rewriting public APIs).

## How to fix each violation class

- **Forbidden cross-layer import** (e.g. domain imports a persistence adapter):
  invert the dependency. Define a port (interface) in the layer that needs the
  capability, implement it in the layer that has it, and inject the
  implementation at composition time. Read `ark://manifest` (MCP) or
  `ark.config.json` to see which layers may see which.
- **File in the wrong layer**: if the import is legitimate but the file lives in
  the wrong directory, move the file to the layer it behaves like and update
  imports. Prefer the smallest move that makes the graph legal.
- **Forbidden global in domain** (`fetch`, `process`, `Date.now`, `Math.random`, …):
  inject the capability. Add a port (e.g. `Clock`, `IdGenerator`, `HttpPort`)
  with the impure implementation outside the domain, and pass it in.
- **Intent prefix mismatch**: rename the intent to the layer's declared prefix,
  or move the handler to the layer that owns that prefix.
- **Type-only inversion** (a lower layer `import type`s something from an upper layer,
  e.g. a domain module importing a type that happens to live in a UI hook): move the
  TYPE down to the layer that owns it (e.g. `src/lib/<domain>/types.ts`), and re-export
  it from the original module for back-compat (`export type { X } from "@/lib/<domain>/types"`)
  so no consumer breaks. This is the highest-volume, safest adoption fix — verify with
  `tsc --noEmit`. It often also breaks a circular dependency that ran through the hook.
  Two cases where the move is NOT mechanical — stop and flag instead of forcing it:
  (a) the type extends a persistence/ORM row (e.g. a Drizzle schema type) — moving it to a
  domain layer would couple domain→Persistence (the write gate will block it), so it needs a
  domain-owned type or port, not a move; (b) the source file mixes the type with runtime
  logic (stubs, helpers, mock builders) — split the types into their own module first, then
  move.

Fix ALL reported violations that share a root cause in one pass — one port in a
shared module beats N per-file patches. Match the codebase's existing naming and
port conventions before inventing new ones.

## Verify and report

After edits, run `ark-check --root . --config ark.config.json --strict-config`
(plus the project's test command if one exists in `package.json`). If the check
still fails, keep fixing — do not end the turn with a red check unless you are
blocked on a genuine contract question.

Report: violations fixed (before → after count), what pattern you applied
(in plain language — assume the reader may not know what a "port" is: one line
of definition), defaults taken, anything intentionally left for the user.
