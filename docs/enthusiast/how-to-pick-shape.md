# How to pick your application shape

## Terminal

```bash
npx structrail-check --recommend
npx structrail-check --recommend --json
npx structrail-check --recommend --write-plan   # also writes structrail-adoption-plan.json
```

## MCP (agents)

Call tool **`structrail_recommend`** — same JSON as `--recommend --json`.

## Skill

Run **`/structrail-architect`** on a greenfield or early-adoption repo.

## What to read in the output

| Field | Meaning |
|-------|---------|
| `archetype` | Application shape id (`crud-product`, `api-backend`, …) |
| `preset` | Named Structrail layout (`hexagonal`, `layered`, `feature-sliced`, `monorepo`) |
| `confidence` | How sure the scorer is from repo signals |
| `adoptInOrder.phase1` | Folders to create first |
| `analogy` | Plain-language mental model |
| `antiPatterns` | What Structrail will block later |
| `firstCommand` | Usually `structrail init --archetype <id> --yes` |

Framework names appear only as secondary `toolHints` in JSON — never as the archetype label.

## Low confidence?

If `confidence < 0.5`, ask:

1. Will this app save data between sessions?
2. Is this one app or several in one repository?

Then re-run `--recommend` or continue with `/structrail-architect`.

## Reference

Full archetype table: [reference-archetypes.md](reference-archetypes.md). Source of truth:
`templates/architecture-playbook.json`.
