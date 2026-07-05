---
name: ark-fix
description: Resolve Ark architecture violations at the root cause — fix the code (ports, adapters, moved files), never weaken the contract. Runs ark-check itself, fixes, verifies, reports.
---

# /ark-fix — Fix architecture violations properly

You are resolving violations reported by `ark-check` or by the Ark write gate.
Work autonomously end to end: diagnose, fix, verify. Do not ask the user to
paste output you can generate yourself.

## Operating rules

- First action: run `npx ark-check --root . --config ark.config.json --json`
  (add `--baseline .ark-baseline.json` if that file exists) to get the current
  violation list. If the user quoted a specific gate block, start from that one.
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

Fix ALL reported violations that share a root cause in one pass — one port in a
shared module beats N per-file patches. Match the codebase's existing naming and
port conventions before inventing new ones.

## Verify and report

After edits, run `npx ark-check --root . --config ark.config.json --strict-config`
(plus the project's test command if one exists in `package.json`). If the check
still fails, keep fixing — do not end the turn with a red check unless you are
blocked on a genuine contract question.

Report: violations fixed (before → after count), what pattern you applied
(in plain language — assume the reader may not know what a "port" is: one line
of definition), defaults taken, anything intentionally left for the user.
