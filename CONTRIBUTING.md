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
npm run check:agent-skills    # Agent Skills layout vs flat templates + dogfood .agents/.grok skill links
```

After editing pure Domain algorithms, regenerate CLI artifacts:

```bash
npm run generate:layer-match
npm run generate:cli-pure
# After editing templates/skills/*.md:
npm run generate:agent-skills
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
| `templates/` | Skills (flat + Agent Skills layout), hooks, playbooks (shipped on npm) |
| `docs/` | Product + develop + contribute docs ([map](docs/README.md)) |
| `tests/` · `eval/` | Quality harnesses |
| `scripts/field-dogfood/` | Maintainer offline field gap smoke (`npm run test:field-dogfood-smoke`) |
| `ROADMAP.md` | Implementation queue — **one `doing` at a time** |

`packages/runtime` is the experimental **ArkRun** kernel (`@arkgate/runtime`; separate publish;
not in the `arkgate` tarball).

Maintainer-only local notes may live under gitignored `internal/` — never commit field secrets.

---

## Rules of the road

1. **Behavior change ⇒ test.** Prefer real CLI binaries against temp fixtures.
2. **Gates agree.** CLI, MCP, ESLint share semantics; change them together.
3. **Incomplete analysis cannot look green** (`complete | partial | unavailable`).
4. **CI green:** typecheck, coverage on PRs, build, `check:architecture`.
   Mutation runs on `main` and at publish.
5. **Small diffs.** No new abstraction without a second concrete use.
6. **Honest docs.** Do not claim npm-published status before `npm view` succeeds.
   Product copy follows [docs/product-voice.md](docs/product-voice.md).

---

## Proposing changes

- **Bug fixes:** PR with a failing test that goes green.
- **Features / behavior:** open an issue first — keep the public surface small.

**Agent reports (human confirms first):** if a session finds a bug, false green, false red,
missing doc, or improvable behavior **in ArkGate**, draft one GitHub issue for **this**
repository (`pedroknigge/arkgate`, or `package.json` `repository.url`), ask the human in the
loop to confirm send, then `gh issue create` with the logged-in account. One finding per issue;
include repro commands, version, and measured evidence. Never auto-file. Never file ArkGate
defects on a consumer product repo. Recipe:
[agent-guide — Session recipe](docs/agent-guide.md#session-recipe-agent-turn).

Good first contributions: adoption friction reports, host-install honesty, docs in the
**use / develop / contribute** lanes (not unsolicited epic rewrites).

Queue: [ROADMAP.md](ROADMAP.md) · issues labeled `good first issue`.

---

## CI (this repo)

Everyday PRs stay on **slim** CI (coverage, not mutation). That is the path for a
version-bump / prepare PR.

**Full matrix** (mutation + every packed / gallery / onboarding cell) runs on
`push` to `main`, or when you add the `full-matrix` label. Nothing else selects
it — not a `release` label, not a branch name.

Docs-only and lockfile hygiene PRs skip the heavy matrices on purpose. Mutation
still runs before every npm publish (`scripts/release-npm.mjs`). A green slim PR
is not a substitute for that publish gate.

Security workflow (CodeQL / Semgrep / dependency review) still runs on every PR.

---

## Publish (maintainers)

Boring path. No extra labels. No extra notes file.

**Must match:** `package.json`, root `package-lock.json`, `src/version.ts`,
`server.json`.

**Must write:** a [CHANGELOG.md](CHANGELOG.md) line for the version.

Then:

1. Open a normal PR. Slim CI is the default. Do **not** add a `release` label.
2. After merge, create an **annotated** tag (unsigned is fine):

```bash
git tag -a vX.Y.Z -m "arkgate vX.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "arkgate vX.Y.Z" --notes "See CHANGELOG.md"
gh workflow run publish-npm.yml -f tag=vX.Y.Z -f dry_run=false
```

That is the whole bar: slim CI green + version bump + CHANGELOG + annotated tag +
GitHub Release + `publish-npm` provenance.

If the annotated tag and GitHub Release already exist, do not retag and do not
bump. Dispatch the same workflow for that tag.

Tree version: `package.json`. What npm `latest` is: `npm view arkgate version`.
Older notes live under [docs/releases/](docs/releases/).

### Optional (not gates)

- Label `full-matrix` if you want mutation on the PR. `push` to `main` already
  runs that path.
- `docs/releases/X.Y.Z.md` — historical notes. Not required.
- MCP registry, website sync, leftover `@arkgate/runtime` republish — after npm
  `latest` if you want them. Not required to ship a patch.
- Signed tags (`git tag -s`) — still accepted. Set
  `ARK_REQUIRE_SIGNED_RELEASE_TAG=true` on the publish workflow only if you want
  signed-only again.
