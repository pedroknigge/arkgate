# Contributing to ArkGate

Thanks for your interest! ArkGate is young and contributions of every size are welcome — issues describing real-world adoption friction are as valuable as PRs.

**Product site:** [arkgate.online](https://www.arkgate.online/) · **Source:** this repository.

## Setup

```bash
git clone https://github.com/pedroknigge/arkgate
cd arkgate
npm ci
npm run build        # bin/ark-mcp.mjs loads dist/, so build first
npx vitest run       # full test suite (npm test starts watch mode)
npm run typecheck
npx arkgate-check --root . --config ark.config.json --strict
npm run check:architecture   # ArkGate dogfoods itself
npm run check:layer-match    # derived bin/ark-layer-match.mjs must match domain source
npm run check:cli-pure       # remediation + baselineKey derived helpers in sync
npm run test:ts-compat       # consumer matrix TS 5.9 / 6.0 / 7.0 (optional, slower)
```

After editing pure Domain algorithms, regenerate CLI artifacts:

```bash
npm run generate:layer-match   # src/domain/layerMatch.ts
npm run generate:cli-pure      # src/domain/remediation.ts + baselineKey.ts
```

Node >= 18. **Runtime dependencies stay minimal:** only `typescript` (JS-API host for the gate when the project ships TypeScript 7’s version-only main export). Do not add other production deps without discussion. NestJS and similar stay optional `peerDependencies` + devDependencies.

## Project layout (public GitHub tree)

- `src/kernel/` — optional runtime kernel (registry, event bus, contracts, …)
- `src/eslint/` · `src/nestjs/` — optional adapters
- `bin/` — dual CLIs: `arkgate` / `arkgate-check` / `arkgate-mcp` + aliases `ark` / `ark-check` / `ark-mcp`
- `templates/` — playbook, policy packs, agent skills (shipped on npm; install via `--install-agent-gates`)
- `docs/` — **user-facing** docs only (enthusiast track, ai-gates, TypeScript support, demos, …)
- `examples/` · `tests/` · `eval/` — examples and quality harnesses
- `ROADMAP.md` — public product roadmap

### What is *not* on GitHub / npm

Maintainer-only planning, freeze checklists, marketing funnels, and local field notes live in
a local **`internal/`** directory (gitignored). Do not commit it. The npm package is further
restricted by the `"files"` list in `package.json` — only `bin`, `dist`, `templates`, and a
docs subset ship to consumers.

## Rules of the road

1. **Every behavior change needs a test.** CLI behavior is tested by executing the real binaries against temp fixtures (see `tests/unit/static-check/arkCheck.test.ts` for the pattern).
2. **The three gates must agree.** `arkgate-check` / `ark-check`, `arkgate-mcp` / `ark-mcp`, and the ESLint plugin share semantics via `bin/ark-shared.mjs` and the config format — if you change classification or rule semantics in one, change it everywhere and add a test proving they match.
3. **CI must be green**: typecheck, tests, build, and `check:architecture` all gate merges.
4. Keep diffs small and boring. No new abstractions without a second concrete use.

## Proposing changes

- **Bug fixes**: open a PR directly. Include a failing test that your fix turns green.
- **Features / behavior changes**: open an issue first. ArkGate's value is a small, sharp surface — features that don't survive a short design discussion usually shouldn't exist.

## Releasing (maintainers)

```bash
npm version <patch|minor|major> --no-git-tag-version
npm run release:npm -- --dry
git tag -s vX.Y.Z -m "arkgate vX.Y.Z"
gh release create vX.Y.Z --verify-tag --generate-notes
gh workflow run publish-npm.yml -f tag=vX.Y.Z -f dry_run=false
```

Real releases are GitHub-first: the publish workflow requires a signed annotated tag and an
existing GitHub Release, reruns the release gates, publishes to npm with provenance, and uploads
the npm tarball checksum. Local `npm publish` is emergency-only and intentionally not the normal
maintainer path.

## Not sure where to start?

Check [ROADMAP.md](ROADMAP.md) and issues labeled `good first issue`. Opening an issue that says "I tried to adopt ArkGate on my codebase and got stuck at X" is a first-class contribution.
