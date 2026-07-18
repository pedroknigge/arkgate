# Tutorial: your first Ark-governed project

This tutorial walks one path end-to-end. You need Node 18+ and a new empty folder.

## 1. Create the project

```bash
mkdir my-app && cd my-app
npm init -y
npm install -D arkgate typescript
```

## 2. Discover your application shape

```bash
npx ark-check --recommend
```

Read the **archetype** (application shape, not “Next.js” or “Prisma”), the **preset**,
and **phase-1 layers**. If you are unsure, answer the two questions the agent skill
may ask: “Will this save data?” and “Is this one app or several in one repo?”

Optional machine-readable record:

```bash
npx ark-check --recommend --write-plan
# -> ark-adoption-plan.json (safe to commit as a team adoption record)
```

## 3. Adopt the contract

Non-interactive (recommended for scripts):

```bash
npx ark init --archetype crud-product --yes
```

Or apply an enthusiast policy pack directly:

```bash
npx ark-check --list-policy-packs
npx ark-check --apply-policy-pack enthusiast-hexagonal
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
npx ark-check --install-agent-gates
```

This installs `/ark-architect`, `/ark-place`, `/ark-autopilot`, and the other `/ark-*` skills for Claude, Cursor, Codex, Grok, and other detected hosts.

## 6. Verify honestly

```bash
npx ark-check --doctor
npx ark-check --coverage
npx ark-check --root . --config ark.config.json --strict-config
```

Report `governed.percent` truthfully. An empty layer is fine; an ungoverned `lib/` folder is not.

## 7. Build a feature with the agent

Invoke `/ark-architect` once at the start, then `/ark-place` for each new file. The agent
should place use cases in `application/`, ports in `domain/`, and never import the database
into `domain/`.

## Next steps

- [How to pick your shape](how-to-pick-shape.md)
- [Public demos](https://github.com/pedroknigge/arkgate/tree/main/docs/demos)
- [Brownfield adoption](../brownfield-adoption.md) if you already have code
