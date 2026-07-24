# Contributing to ArkGate

This guide is for people who **improve the ArkGate library** (this repository), not for product
teams that only install `arkgate` in an app.

| You want to… | Go here instead |
|--------------|-----------------|
| Use ArkGate on a product | [docs/use.md](docs/use.md) |
| Wire hosts, CI, brownfield | [docs/develop.md](docs/develop.md) |
| Docs map | [docs/README.md](docs/README.md) |

**Product site:** [arkgate.online](https://www.arkgate.online/) · **Source:** this repository.

**Agents / library authors:** this checkout is the **canonical mother repository** for developing
and releasing the `arkgate` package — not a sample consumer app. Read `AGENTS.md` (**Identity**)
before large changes.

---

## Setup

```bash
git clone https://github.com/pedroknigge/arkgate
cd arkgate
npm ci
npm run build                 # bin/ark-mcp.mjs loads dist/
npm run typecheck
npm run test:confidence       # coverage + critical-module mutation gates
npx arkgate-check --root . --config ark.config.json --strict
npm run check:architecture    # dogfood
npm run check:layer-match
npm run check:cli-pure
```

After editing pure Domain algorithms, regenerate CLI artifacts:

```bash
npm run generate:layer-match
npm run generate:cli-pure
# analysis-engine / packaged-tooling: see package.json scripts
```

Node ≥ 18 for library/CLIs. Confidence/release gates use Node ≥ 20 (Stryker). Runtime deps stay
minimal (`typescript-ark-host` exact). Do not add production deps without discussion.

---

## Layout (what you edit)

| Path | Role |
|------|------|
| `src/domain/` | Pure contracts and algorithms |
| `src/kernel/` | Gate analysis / preflight core |
| `src/eslint/` | Editor adapter |
| `bin/` | CLIs (`arkgate*` + `ark*`) |
| `templates/` | Skills, hooks, playbooks (shipped on npm) |
| `docs/` | Product + develop + contribute docs ([map](docs/README.md)) |
| `tests/` · `eval/` | Quality harnesses |
| `ROADMAP.md` | Implementation queue — **one `doing` at a time** |

`packages/runtime` is the experimental companion package (separate publish).

Maintainer-only local notes may live under gitignored `internal/` — never commit field secrets.

---

## Rules of the road

1. **Behavior change ⇒ test.** Prefer real CLI binaries against temp fixtures.
2. **Gates agree.** CLI, MCP, ESLint share semantics; change them together.
3. **Incomplete analysis cannot look green** (`complete | partial | unavailable`).
4. **CI green:** typecheck, confidence, build, `check:architecture`.
5. **Small diffs.** No new abstraction without a second concrete use.
6. **Honest docs.** Do not claim npm-published status before `npm view` succeeds.
   Product copy follows [docs/product-voice.md](docs/product-voice.md).

---

## Proposing changes

- **Bug fixes:** PR with a failing test that goes green.
- **Features / behavior:** open an issue first — keep the public surface small.

Good first contributions: adoption friction reports, host-install honesty, docs in the
**use / develop / contribute** lanes (not unsolicited epic rewrites).

Queue: [ROADMAP.md](ROADMAP.md) · issues labeled `good first issue`.

---

## Releasing (maintainers)

**Version sources (must match):** `package.json`, root `package-lock.json`, `src/version.ts`,
`server.json`.

**Docs for a release:**

1. `CHANGELOG.md` — versioned section  
2. `docs/releases/X.Y.Z.md` — notes + checklist  
3. README / docs hub only if the product path changed  

```bash
npm version <patch|minor|major> --no-git-tag-version
# align server.json + src/version.ts

npm run release:npm -- --dry
git tag -s vX.Y.Z -m "arkgate vX.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --verify-tag --title "arkgate vX.Y.Z" \
  --notes-file docs/releases/X.Y.Z.md
gh workflow run publish-npm.yml -f tag=vX.Y.Z -f dry_run=false
```

Normal path is GitHub Release + signed tag + provenance publish. Root workflow publishes
**`arkgate` only** — not `@arkgate/runtime`.

MCP registry after npm `latest`:

```bash
mcp-publisher login github -token "$(gh auth token)"
mcp-publisher validate server.json && mcp-publisher publish server.json
```

**Current published release:** [docs/releases/3.9.2.md](docs/releases/3.9.2.md) (`arkgate@3.9.2`).
