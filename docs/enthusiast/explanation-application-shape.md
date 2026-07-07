# Explanation: why application shape matters

Ark separates **what you are building** from **which framework you installed**.

A “todo app with a database” is an application shape (`crud-product`). Next.js, Vite, or
Prisma are detection signals that may raise confidence — they do not define the archetype
label shown to you or your agent.

## Progressive phases

Phase 1 is deliberately small (typically 2–4 layers). Phase 2 and 3 unlock when you
describe new capabilities (payments, email, background jobs, sagas). This keeps enthusiasts
from drowning in the full 11-layer profile on day one.

## Honesty over green

`ark-check --strict-config` and `--coverage` report how much of the tree is actually
governed. A passing check over 40% of files is not success — Ark says so explicitly.

## Shapes map to presets, not ad-hoc folders

Every suggestion traces to `templates/architecture-playbook.json`, named presets, or
enthusiast policy packs. Agents must not invent `utils/` or `helpers/` as ungoverned dumping
grounds — classify via `/ark-contract`.

## When not to use enthusiast onboarding

Existing large codebases need `/ark-adopt` and the [brownfield playbook](../brownfield-adoption.md):
diagnose, fix the contract, freeze only real debt, burn down in order.