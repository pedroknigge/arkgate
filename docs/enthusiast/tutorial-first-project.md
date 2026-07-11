# Tutorial: your first Structrail-governed project

This tutorial walks one path end-to-end. You need Node 18+ and a new empty folder.

## 1. Create the project

```bash
mkdir my-app && cd my-app
npm init -y
npm install -D structrail typescript
```

## 2. Discover your application shape

```bash
npx structrail-check --recommend
```

Read the **archetype** (application shape, not “Next.js” or “Prisma”), the **preset**,
and **phase-1 layers**. If you are unsure, answer the two questions the agent skill
may ask: “Will this save data?” and “Is this one app or several in one repo?”

Optional machine-readable record:

```bash
npx structrail-check --recommend --write-plan
# -> structrail-adoption-plan.json (safe to commit as a team adoption record)
```

## 3. Adopt the contract

Non-interactive (recommended for scripts):

```bash
npx structrail init --archetype crud-product --yes
```

Or apply an enthusiast policy pack directly:

```bash
npx structrail-check --list-policy-packs
npx structrail-check --apply-policy-pack enthusiast-hexagonal
```

## 4. Scaffold phase-1 folders

Create only the directories listed under phase 1 — for a CRUD product typically:

```
src/domain/
src/application/
src/presentation/   # or pages/, components/, http/
src/adapters/       # persistence implementations
```

Or copy a [gallery starter](../enthusiast/how-to-gallery-starter.md) and run `npm install && npm run check`.

## 5. Install agent gates

```bash
npx structrail-check --install-agent-gates
```

This installs `/structrail-architect`, `/structrail-place`, `/structrail-autopilot`, and the other `/structrail-*` skills for Claude, Cursor, Codex, Grok, and other detected hosts.

## 6. Verify honestly

```bash
npx structrail-check --doctor
npx structrail-check --coverage
npx structrail-check --root . --config structrail.config.json --strict-config
```

Report `governed.percent` truthfully. An empty layer is fine; an ungoverned `lib/` folder is not.

## 7. Build a feature with the agent

Invoke `/structrail-architect` once at the start, then `/structrail-place` for each new file. The agent
should place use cases in `application/`, ports in `domain/`, and never import the database
into `domain/`.

## Next steps

- [How to pick your shape](how-to-pick-shape.md)
- [Public demos](../demos/)
- [Brownfield adoption](../brownfield-adoption.md) if you already have code
