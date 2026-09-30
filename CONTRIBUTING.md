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
npm run check:agent-skills    # Agent Skills layout + 100% product coverage (four planes + north star)
npm run check:duplication     # jscpd copy/paste gate (threshold 0; generated mirrors ignored)
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
4. **CI green:** typecheck, `check:duplication`, coverage on PRs, build, `check:architecture`.
   Mutation runs on `main` and at publish.
5. **Small diffs.** No new abstraction without a second concrete use.
   A copied block of 80+ tokens fails `check:duplication`: extract a shared helper in the
   right layer. When two blocks must diverge, wrap one in `// jscpd:ignore-start` /
   `// jscpd:ignore-end` with the reason on the start line. A new generated mirror
   (`generate:*` output) goes into `.jscpd.json` `ignore`.
6. **Honest docs.** Do not claim npm-published status before `npm view` succeeds.
   Packed `README.md` and `docs/README.md` must not say npm `latest` remains an
   older version than this package — this tarball publishes as `latest`.
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

**PR proof (viewable before Ready):** stills and video go in the PR body, not in
the branch. Never commit screenshots or recordings.

- **Still:** `![caption](https://github.com/user-attachments/assets/…)` — that
  URL must be the image itself (`image/png` / `image/jpeg`). Any public URL
  with that content-type also works.
- **Video:** put `https://github.com/user-attachments/assets/…` alone on its
  own line. GitHub plays `video/mp4`. A poster image is not a video.
- **How:** drag-drop into the GitHub PR box, or
  `gh pr create --attach still.png --attach walkthrough.mp4` /
  `gh pr edit --attach still.png --attach walkthrough.mp4` (needs a user
  token; a GitHub App token cannot upload user-attachments).
- **Not this:** a markdown link to
  `https://cursor.com/agents/…/artifacts?path=…`. That page is HTML, so GitHub
  shows a link instead of the picture ([#206](https://github.com/pedroknigge/arkgate/pull/206)).

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
`server.json`, and the composite Action pin in `docs/ai-gates.md`
(`uses: pedroknigge/arkgate@vX.Y.Z`; a test fails when it drifts).

**Must write:** a [CHANGELOG.md](CHANGELOG.md) line for the version.

Packed front doors (`README.md`, `docs/README.md`) and this version's
CHANGELOG section must not say npm `latest` remains an older version.
Write those lines for the tarball. `npm run check:package-files` refuses
the waiting-room pin.

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
- MCP Registry: `mcp-publisher validate server.json && mcp-publisher publish server.json`.
  The descriptor launches `npx arkgate@X.Y.Z mcp --root .` (npx runs the bin named
  after the package; no `--config`, so a fresh project without `ark.config.json` still
  starts); `tests/publish/pack-restore.test.ts` starts that exact argv from the packed
  tarball, with and without a config. **Republish the descriptor after the first npm
  release that has the `mcp` route.** Entries already on the registry pin arkgate
  versions through 4.8.23, which have no route: `npx arkgate@4.8.23 arkgate-mcp` still
  ends in "Unknown command" whatever a later tarball accepts. Check with
  `curl -s 'https://registry.modelcontextprotocol.io/v0/servers?search=io.github.pedroknigge/arkgate'`.
- Signed tags (`git tag -s`) — still accepted. Set
  `ARK_REQUIRE_SIGNED_RELEASE_TAG=true` on the publish workflow only if you want
  signed-only again.

### Registry state for deprecated `@arkgate/runtime`

The deprecation notice npm prints at install time comes from the registry, not from
the package. Expected state, and the commands that set it (a maintainer with publish
rights on `@arkgate/runtime` runs them once; nothing in CI does):

```bash
npm deprecate '@arkgate/runtime@*' 'Deprecated (ADR 0031): install arkgate and import from "arkgate/runtime" (Nest adapter: "arkgate/nestjs").'
npm dist-tag add @arkgate/runtime@0.1.0-experimental.2 latest
npm view @arkgate/runtime deprecated dist-tags --json   # check
```

Moving `latest` to the last build (`0.1.0-experimental.2`, same as `experimental`)
means a bare `npm i @arkgate/runtime` gets the last build and the migration message,
not the first build and npm's generic "no longer supported" text. No new version of
the companion is published, so the `description` and README "Migrate" block in
`packages/runtime/` stay in git only; the `npm deprecate` message is the one users see.
Until a maintainer runs these commands, the registry still shows the generic text and
`latest` → `0.1.0-experimental.0`.
