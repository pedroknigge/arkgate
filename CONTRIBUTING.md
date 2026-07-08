# Contributing to Ark

Thanks for your interest! Ark is young and contributions of every size are welcome — issues describing real-world adoption friction are as valuable as PRs.

## Setup

```bash
git clone https://github.com/pedroknigge/ark-runtime-kernel
cd ark-runtime-kernel
npm ci
npm run build        # bin/ark-mcp.mjs loads dist/, so build first
npx vitest run       # full test suite (npm test starts watch mode)
npm run typecheck
npx ark-check --root . --config ark.config.json --strict-config
npm run check:architecture   # Ark dogfoods itself
```

Node >= 18. Zero runtime dependencies is a hard constraint: anything under `dependencies` in `package.json` will be rejected. Optional integrations (like the NestJS adapter) use optional `peerDependencies` + devDependencies only.

## Project layout (public GitHub tree)

- `src/kernel/` — optional runtime kernel (registry, event bus, contracts, …)
- `src/eslint/` · `src/nestjs/` — optional adapters
- `bin/` — `ark`, `ark-check`, `ark-mcp` (product CLIs)
- `templates/` — playbook, policy packs, agent skills (shipped on npm)
- `docs/` — **user-facing** docs only (enthusiast track, ai-gates, demos, …)
- `examples/` · `tests/` · `eval/` — examples and quality harnesses
- `ROADMAP.md` — public product roadmap

### What is *not* on GitHub / npm

Maintainer-only planning, freeze checklists, marketing funnels, and local field notes live in
a local **`internal/`** directory (gitignored). Do not commit it. The npm package is further
restricted by the `"files"` list in `package.json` — only `bin`, `dist`, `templates`, and a
docs subset ship to consumers.

## Rules of the road

1. **Every behavior change needs a test.** CLI behavior is tested by executing the real binaries against temp fixtures (see `tests/unit/static-check/arkCheck.test.ts` for the pattern).
2. **The three gates must agree.** `ark-check`, `ark-mcp`, and the ESLint plugin share semantics via `bin/ark-shared.mjs` and the config format — if you change classification or rule semantics in one, change it everywhere and add a test proving they match.
3. **CI must be green**: typecheck, tests, build, and `check:architecture` all gate merges.
4. Keep diffs small and boring. No new abstractions without a second concrete use.

## Proposing changes

- **Bug fixes**: open a PR directly. Include a failing test that your fix turns green.
- **Features / behavior changes**: open an issue first. Ark's value is a small, sharp surface — features that don't survive a short design discussion usually shouldn't exist.

## Releasing (maintainers)

```bash
npm version <patch|minor|major>
npm run release:npm          # verifies, builds (prepack), publishes
```

## Not sure where to start?

Check [ROADMAP.md](ROADMAP.md) and issues labeled `good first issue`. Opening an issue that says "I tried to adopt Ark on my codebase and got stuck at X" is a first-class contribution.
