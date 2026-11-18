# ArkRun

ArkRun, when the rules file turns it on, rejects a domain file that imports the kernel.

## Sub-features

- `kernel-in-domain` fails `ARKRUN_KERNEL_IN_DOMAIN`.

## How to get to it (user POV)

- `npx arkgate-check` on a project with `arkRun.mode` set to `enforced`.
- `/ark-runtime` is the skill that wires one candidate. The check is the proof.

## Driving it with verify.mjs

Preconditions:

- `tests/fixtures/arkrun-sensors/kernel-in-domain/src/domain/order.ts` imports `@arkgate/runtime`.

- **Kernel import.** Run `node bin/ark-check.mjs --root tests/fixtures/arkrun-sensors/kernel-in-domain --no-cache`. Exit code `1`. Output contains `ARKRUN_KERNEL_IN_DOMAIN`.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only arkrun`.

## Gotchas

- A warning about an empty `ApplicationOrchestration` pattern can print first. The proof signal is the `ARKRUN_KERNEL_IN_DOMAIN` line.
- This fixture does not start a kernel process. It proves the gate sees the import.
