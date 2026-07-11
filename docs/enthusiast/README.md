# ArkGate — Architecture Co-pilot (enthusiast track)

Plain-language onboarding for builders who use AI agents but are not professional
developers. This track follows [Diátaxis](https://diataxis.fr/): tutorial, how-to,
reference, and explanation. Package: **`arkgate`** (CLI: `arkgate` / `arkgate-check`;
aliases `ark` / `ark-check` still work).

## How ArkGate talks to you

**Entry style** — who is driving: *newbie* (`ark start` / `/ark-autopilot`) vs *expert* (individual commands).

**Operating mode** — what Ark is doing right now (one contract underneath):

| Mode | Meaning |
|------|---------|
| **Suggest** | Propose an application shape and install a starter contract. |
| **Adapt** | Match the contract to your real layout / raise governed coverage. |
| **Enforce** | The contract covers the real code and checked edges are clean; host/CI guarantees remain separate. |

`ark start` and `ark-check --plan` will not claim "everything is guarded" while governed coverage is near zero. On Nest/Next/express starters, init also merges **framework filename conventions** into the layer globs so day-one coverage is real.

## Start here

| Type | Document | You will… |
|------|----------|-----------|
| **Tutorial** | [First project in 15 minutes](tutorial-first-project.md) | Walk the full path once: recommend → init → verify |
| **How-to** | [Pick your application shape](how-to-pick-shape.md) | Run `--recommend` / `ark_recommend` and read the plan |
| **How-to** | [Use a gallery starter](how-to-gallery-starter.md) | Copy a phase-1 scaffold that matches your archetype |
| **How-to** | [Apply an enthusiast policy pack](how-to-policy-pack.md) | Write `ark.config.json` from a named preset |
| **How-to** | [Install agent gates](how-to-agent-gates.md) | Wire the host-appropriate write path and `/ark-*` skills |
| **Reference** | [Archetypes and presets](reference-archetypes.md) | Look up playbook ids, presets, and phase-1 layers |
| **Reference** | [Commands and artifacts](reference-commands.md) | `--recommend`, `--write-plan`, `ark-adoption-plan.json`, fix-class JSON |
| **Explanation** | [Why application shape matters](explanation-application-shape.md) | Understand shapes vs frameworks and progressive phases |

## Public demos (Phase D)

Reproducible scripts — no video required:

- [Write-gate self-correction](../demos/01-write-gate-self-correction.md)
- [Brownfield baseline adoption](../demos/02-brownfield-baseline-adoption.md)
## Gallery starters

| Archetype | Directory |
|-----------|-----------|
| `crud-product` | [examples/crud-product-starter](../../examples/crud-product-starter/) |
| `api-backend` | [examples/api-backend-starter](../../examples/api-backend-starter/) |
| `worker-pipeline` | [examples/worker-pipeline-starter](../../examples/worker-pipeline-starter/) |
| `multi-app-workspace` | [examples/multi-app-workspace-starter](../../examples/multi-app-workspace-starter/) |

Deep teaching example (runnable API + break exercises): [hexagonal-order-api](../../examples/hexagonal-order-api/).

## Brownfield vs greenfield

| Situation | Use |
|-----------|-----|
| New or empty repo | `/ark-architect`, `ark-check --recommend`, gallery starters |
| Existing messy codebase | `/ark-adopt`, [brownfield playbook](../brownfield-adoption.md) |

## Related

- [Agent integration guide](../agent-guide.md)
- [Public demos](../demos/)
- [Examples index](../../examples/README.md)
