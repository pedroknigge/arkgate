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
npm run check:agent-skills    # Agent Skills layout vs flat templates (ACS05)
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

## CI profiles (PR slim vs full matrix)

`.github/workflows/ci.yml` selects a **profile** via `scripts/ci-profile.mjs` so everyday PRs
stay fast while release safety stays on the full path. Tiers: **docs_only** / **hygiene** /
**code** (PR slim) / **full_matrix**.

| Profile | When | What runs |
|---------|------|-----------|
| **PR slim** (`code`, default) | Ordinary `pull_request` without a full-matrix trigger and not docs-only/hygiene | `build` with **`npm run test:coverage`** (no mutation), adapter parity, Z07, fuzz, Node smoke, architecture gate; **1** packed-TS cell (Node 20 + npm, still TS 5/6/7 in-process); **1** gallery PM (npm); onboarding **\*/small** only; `fail-fast: true` on product matrices. Performance budgets only when changed paths touch analysis/gate/hook/bench surfaces (or on full matrix). |
| **Full matrix** | `push` to `main`; PR label **`full-matrix`** or **`release`**; branch name matching `feat/4.1*`, `feat/*release*`, `release/*`, or containing `release-prepare` | Same core jobs plus **`npm run test:confidence`** (coverage + mutation), complete 4×3 packed-TS cells, all three gallery PMs, all 12 onboarding shards, performance budgets, `fail-fast: false`. |
| **Docs/plans-only** (`docs_only`) | PR changes only under `docs/**`, `*.md`, license/notice (no code/package surface) **and** no full-matrix trigger | Required **`build`** (coverage path) + architecture; packed/gallery/onboarding/OS portability/perf and other heavy jobs skipped. Required **TypeScript compatibility gate** still reports success when the packed matrix is **explicitly** not scheduled (`run_packed=false`). |
| **Hygiene** | PR changes only docs/markdown **plus** root `package-lock.json` (and optionally root `package.json` **when the lock also changes**), and/or allowlisted release-surface tests such as `tests/unit/static-check/q06ReleaseSurfaces.test.ts` — **and** no full-matrix trigger | Same required **`build`** quality as PR slim (`test:coverage`, typecheck, architecture, security audit); skips onboarding, gallery, OS portability, packed consumer matrices, and the other heavy jobs that docs-only skips. Root **`package.json` alone** stays on the **code** path (packaging fields need packed matrices). Label **`full-matrix`** if you need the full path on a hygiene-shaped PR. |

**Why slim PR skips mutation:** mutation is slow and remains mandatory on full-matrix / main and
on every npm publish path (`scripts/release-npm.mjs`, `.github/workflows/publish-npm.yml`). Do
not treat a green slim PR as a substitute for release confidence.

**Force full matrix on a PR:** add label `full-matrix` or `release` (workflow listens for
`labeled` / `unlabeled`), or use a release-prep branch name such as `feat/4.1.0-…`.

**Branch-name footgun:** `feat/*release*` is intentionally broad (safety bias). Names like
`feat/release-notes` or `feat/release-docs-typo` also get the full matrix (including mutation),
even if the diff is docs-only. Prefer ordinary names for non-release work, or accept the cost.

Security workflow (CodeQL / Semgrep / dependency review) is unchanged and always runs on PRs.

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

**Current release:** [docs/releases/4.7.0.md](docs/releases/4.7.0.md) (`arkgate@4.7.0` prepared).
**Current published release:** [docs/releases/4.6.7.md](docs/releases/4.6.7.md) (`arkgate@4.6.7` on npm `latest`).

**Prior published:** [docs/releases/4.6.6.md](docs/releases/4.6.6.md) (`arkgate@4.6.6`).
**Previous:** [docs/releases/4.6.5.md](docs/releases/4.6.5.md) · [docs/releases/4.6.4.md](docs/releases/4.6.4.md) · [docs/releases/4.6.3.md](docs/releases/4.6.3.md) · [docs/releases/4.6.2.md](docs/releases/4.6.2.md) · [docs/releases/4.6.1.md](docs/releases/4.6.1.md) · [docs/releases/4.6.0.md](docs/releases/4.6.0.md) · [docs/releases/4.5.7.md](docs/releases/4.5.7.md) · [docs/releases/4.5.6.md](docs/releases/4.5.6.md) · [docs/releases/4.5.5.md](docs/releases/4.5.5.md) · [docs/releases/4.5.0.md](docs/releases/4.5.0.md) · [docs/releases/4.4.0.md](docs/releases/4.4.0.md) · [docs/releases/4.3.0.md](docs/releases/4.3.0.md).
