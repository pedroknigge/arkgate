# Demo: enthusiast → `/ark-architect` → `ark_place` funnel

End-to-end funnel for a new builder: pick the application shape, adopt phase-1 layers,
then place the first real feature file with the agent.

## Scenario

> "I want a todo app that saves tasks in a database."

## Steps

### 1. Recommend the shape (terminal or MCP)

```bash
mkdir my-todo && cd my-todo
git init
npm init -y

npx ark-check --recommend
# Archetype: crud-product — Product with UI and stored data
# Preset: hexagonal
```

Or invoke MCP tool `ark_recommend` from your agent.

### 2. Run `/ark-architect` (or equivalent manual steps)

The skill should:

1. Call `ark_recommend` / `ark-check --recommend --json`
2. Run `ark init --archetype crud-product --yes`
3. Scaffold `src/domain`, `src/application`, `src/presentation`, `src/adapters`
4. Run `ark-check --doctor` and report `governed.percent`

### 3. Clone the gallery baseline (optional shortcut)

```bash
cp -R /path/to/ark/examples/crud-product-starter/. .
npm install
npm run check
```

Point the user at [examples/crud-product-starter](../examples/crud-product-starter/README.md).

### 4. Install agent gates

```bash
npx ark-check --install-agent-gates
```

### 5. Place the first feature with `/ark-place`

Prompt the agent:

> Add `src/application/add-todo.ts` — a use case that creates a todo through the repository port.

`/ark-place` should:

- Name **ApplicationOrchestration** and `src/application/`
- Scaffold the file with imports from `src/domain` only (port types)
- **Not** import `src/adapters` from the new use case

Verify:

```bash
npx ark-check --root . --config ark.config.json --strict-config
```

### 6. Attempt the anti-pattern (should block)

Ask the agent to "put Prisma in domain for speed." The write-gate or CI check should
block `src/domain` importing persistence. The agent should invert behind
`TodoRepository` instead.

## What this proves

- Enthusiast intent maps to `crud-product` without naming a vendor stack.
- Phase-1 structure exists before feature codegen.
- `/ark-place` continues the same contract `/ark-architect` started.
- Gates block the most common cheat (database in domain).

## Related docs

- [docs/agent-guide.md](../docs/agent-guide.md)
- [templates/skills/ark-architect.md](../templates/skills/ark-architect.md)
- [templates/skills/ark-place.md](../templates/skills/ark-place.md)