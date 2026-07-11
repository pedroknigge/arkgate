# Contributing to Structrail

Thanks for your interest! Structrail is young and contributions of every size are welcome — issues describing real-world adoption friction are as valuable as PRs.

**Source:** this repository. A public Structrail domain is intentionally not advertised before
the external-cutover gate is complete.

**Agents / contributors (git clone only — not in the npm tarball):** this checkout is the
**canonical mother repository** for developing and releasing the `structrail` library — not a
sample app that consumes Structrail. Read `AGENTS.md` (**Identity**) before large changes.

## Setup

<!-- legacy-identity:start external-cutover -->
```bash
git clone https://github.com/pedroknigge/arkgate structrail
cd structrail
npm ci
npm run build        # bin/structrail-mcp.mjs loads dist/, so build first
npm run typecheck
npm run test:confidence # full coverage + critical-module mutation gates
npx structrail-check --root . --config structrail.config.json --strict
npm run check:architecture   # Structrail dogfoods itself
npm run check:identity       # no unapproved legacy public names
npm run check:layer-match    # derived bin/ark-layer-match.mjs must match domain source
npm run check:cli-pure       # remediation + baselineKey derived helpers in sync
npm run test:ts-compat       # consumer matrix TS 5.9 / 6.0 / 7.0 (optional, slower)
```
<!-- legacy-identity:end -->

After editing pure Domain algorithms, regenerate CLI artifacts:

```bash
npm run generate:layer-match   # src/domain/layerMatch.ts
npm run generate:cli-pure      # src/domain/remediation.ts + baselineKey.ts
```

Structrail's library and CLIs support Node >= 18. The repository confidence/release gate requires
Node >= 20 because it runs the current Stryker mutation runner; CI uses Node 20 and publish uses
Node 24. **Runtime dependencies stay minimal:** only `typescript` (JS-API host for the gate when
the project ships TypeScript 7’s version-only main export). Do not add other production deps
without discussion. NestJS and similar stay optional `peerDependencies` + devDependencies.

## Project layout (public GitHub tree)

- `src/kernel/` — optional runtime kernel (registry, event bus, contracts, …)
- `src/eslint/` · `src/nestjs/` — optional adapters
- `bin/` — primary CLIs: `structrail` / `structrail-check` / `structrail-mcp`
<!-- legacy-identity:start v3-compatibility removal=v4 -->
- `compat/arkgate/` — deprecated v3 wrapper that owns `arkgate*` and `ark*` compatibility bins
<!-- legacy-identity:end -->
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
2. **The three gates must agree.** `structrail-check`, `structrail-mcp`, and the ESLint plugin
   share semantics via the standalone `bin/ark-shared.mjs` implementation and the config format.
   If you change classification or rule semantics in one, change it everywhere and add a test
   proving they match.
3. **CI must be green**: typecheck, coverage + mutation confidence, build, and
   `check:architecture` all gate merges.
4. Keep diffs small and boring. No new abstractions without a second concrete use.

## Proposing changes

- **Bug fixes**: open a PR directly. Include a failing test that your fix turns green.
- **Features / behavior changes**: open an issue first. Structrail's value is a small, sharp surface — features that don't survive a short design discussion usually shouldn't exist.

## Releasing (maintainers)

**Version sources that must stay in sync:** `package.json`, `package-lock.json` (root),
`src/version.ts`, `server.json` (MCP registry). Smoke test enforces this.

**Docs for a release:**

1. `CHANGELOG.md` — versioned section (not only Unreleased)
2. `docs/releases/X.Y.Z.md` — human release notes + publish checklist
3. `README.md` / `ROADMAP.md` if user-facing flow or roadmap status changed

```bash
# Bump versions (or land a release PR that already bumps them)
npm version <patch|minor|major> --no-git-tag-version
# Keep server.json + src/version.ts aligned with package.json

# On main, green CI
npm run release:npm -- --dry          # typecheck + confidence + audit + arch + pack dry-run
git tag -s vX.Y.Z -m "structrail vX.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --verify-tag --title "structrail vX.Y.Z" \
  --notes-file docs/releases/X.Y.Z.md   # or --generate-notes
gh workflow run publish-npm.yml -f tag=vX.Y.Z -f dry_run=false
```

Real releases are GitHub-first: the publish workflow requires a signed annotated tag and an
existing GitHub Release, reruns the release gates, publishes to npm with provenance, and uploads
the npm tarball checksum. Local `npm publish` is emergency-only and intentionally not the normal
maintainer path.

## Not sure where to start?

Check [ROADMAP.md](ROADMAP.md) and issues labeled `good first issue`. Opening an issue that says "I tried to adopt Structrail on my codebase and got stuck at X" is a first-class contribution.
