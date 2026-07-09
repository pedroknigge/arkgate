# Roadmap — Architecture Co-pilot for AI TypeScript

**What this is:** a **machine-readable architecture contract** for TypeScript, enforced when
AI agents write code and again before merge — plus a **co-pilot** that plans and drives safe
cleanup without lying about coverage.

**What this is not:** a web framework, ORM, job runner, or “runtime kernel” product. An optional
runtime API may exist; it is not the wedge.

**npm:** [`arkgate`](https://www.npmjs.com/package/arkgate) (product **ArkGate**; formerly `ark-runtime-kernel`).  
**Product shape:** write gate (`arkgate-mcp`) · CI gate (`arkgate-check`) · plan / goal / loop · agent skills.

---

## North star

**Gate → Guide → Co-pilot** (shipped through 2.0.x).

One contract, two entries:

| Entry | Who | Path |
|-------|-----|------|
| **Newbie** | Builders who ship with agents, not architecture jargon | `start` + autopilot skill |
| **Expert** | Leads who want precise contract + CI | `init` / plan / fix / strict check |

Three **operating modes** (what the tool is doing — not who you are):

- **Suggest** — shape a thin/greenfield tree  
- **Adapt** — raise governed coverage / match real layout; freeze only real debt  
- **Enforce** — gates honestly hold; clean plan with ~0% governed is *not* enforce  

**Hard lines (never planned):** codemod engine; auto-applying judgment-heavy “big rocks”;
false-green “healthy” with no real coverage.

### Audience strategy (natural path)

The product is **dev-grade** (staff eng would trust the gate) and **newbie-perfect** (co-pilot
interface, plain language) *because* the bar stays high — not because it was diluted.

1. **Now** — best architecture gate + co-pilot for **TypeScript + AI agents** (real market).  
2. **Next** — deeper safe autonomy + evals (so newbies don’t stall and experts don’t distrust).  
3. **Then** — teams (CI, baselines, reports, light ownership).  
4. **Later** — org-scale monorepo / control-plane only if a de-facto standard emerges.  
5. **Identity** — successor package name that doesn’t say “runtime kernel” (see below).

We do **not** optimize first for “Meta/Google monorepo platform.” That is a later order of
magnitude. We optimize for **agents that write TS in real product repos** — where the same
gate serves experts and newbies.

---

## Shipped (through 2.0.1)

### Gate & honesty

- Write gate + CI + optional runtime; minimal runtime deps (`typescript` JS-API host for the gate)  
- Governed %, baselines, concentration guards, layer `exclude`, mature-repo routing  
- `goal.met` requires meaningful coverage; suggest / adapt / enforce modes  
- Framework overlays (Nest/Next/express/library), pnpm-safe runner, **TypeScript 5 / 6 / 7** load + fallback  
- Mechanical-safe depth: type-only move · pure-type file relocate · `import type` of pure-type modules  

### Guide & onboarding

- Architecture playbook, `--recommend`, enthusiast track, policy packs, gallery starters  

### Co-pilot

- `--plan` · `start` · `/…-loop` · `/…-autopilot` · classifier corpus (zero false mechanical-safe)  
- Showcase HTML report + origin/latest/history under `.ark/reports/`  

### Agent hosts

- Claude Code · Cursor · Codex · **Grok Build** (MCP + hooks + skills)  
- Eleven agent skills (autopilot, loop, architect, adopt, contract, place, fix, explain, …)  

### Trust (partial)

- npm provenance, security workflows, no install lifecycle scripts  

---

## Identity — ArkGate (`arkgate`) — locked

Product and package identity:

| | |
|--|--|
| **Product** | **ArkGate** — architecture co-pilot / write+CI gate for AI TypeScript |
| **npm** | `arkgate` |
| **CLI** | `arkgate`, `arkgate-check`, `arkgate-mcp` |
| **Compat bins** | `ark`, `ark-check`, `ark-mcp` (one major) |
| **Config** | `ark.config.json` (unchanged for now) |
| **Skills** | `/ark-*` (same contract family) |
| **Predecessor** | `ark-runtime-kernel` (npm **deprecated**) |
| **GitHub** | [pedroknigge/arkgate](https://github.com/pedroknigge/arkgate) (old `…/ark-runtime-kernel` URL redirects) |

Same codebase; not a greenfield rewrite.

---

## Now — after 2.0.x (product depth)

Ordered by leverage for the dual audience:

### P0 — make the co-pilot pay without lying

1. **Broaden `mechanical-safe`** with labeled evals.  
   **Shipped:** (a) type-only import edges, (b) pure-type **file** relocate when the whole
   source file is type-surface (`sourcePureTypeModule` + type-only edge), (c) static
   value-syntax import of pure-type modules (`targetTypeOnlyExports`).  
   **Deferred (static proof insufficient):** verbatim infra relocation of value modules.  
   Bias remains: false “safe” is worse than an extra human approval.  
2. **Grow classifier corpus** — **shipped** precision corpus + pure unit + field Nest starter.  
3. **Release trust:** **shipped** — `scripts/verify-release-tag.mjs` fail-closed on unsigned
   tags by default; `ARK_ALLOW_UNSIGNED_RELEASE_TAG=true` intentional override (CI documents it).  

### P1 — quality & install DX

4. ~~ESLint plugin parity with CI layer/import + purity rules~~ → **shipped in 2.5.0 train**
   (`arkgate/eslint` loads `ark.config.json`; dual-driver tests with `arkgate-check`).  
5. Framework policy packs only if filename overlays are not enough.  
6. Codex multi-project MCP DX (avoid last-wins home config).  
7. ~~Clearer messaging when TypeScript is missing / TS7~~ → **shipped**
   ([docs/typescript-support.md](docs/typescript-support.md), load fallback, CI matrix 5/6/7).  
8. ~~Identity cutover~~ → **done as ArkGate / `arkgate`** (deprecate predecessor package).  
9. Adopt TS 7.1+ stable programmatic API when Microsoft ships it (extend `usableTypescript`).  
10. ~~Adoption completeness (doctor hosts/MCP/codex/origin)~~ → **shipped 2.4.0**.  

### Next iteration — maintainability debt (post-2.5.0)

11. ~~**Split / modularize `bin/ark-check.mjs`**~~ → **shipped in 2.6.0** — `bin/lib/` modules:
    `agent-gates`, `html-report`, `doctor-plan`, `violations`; entry `ark-check.mjs` is the scan/CLI shell.  
12. ~~**Single source of truth for layer globs**~~ → **shipped in 2.6.0** — pure matcher in
    `bin/ark-layer-match.mjs` (CLI) + `src/domain/layerMatch.ts` (eslint); Tooling may import DomainModel;
    parity tests lock both implementations.

### P2 — growth surfaces (not prerequisites)

12b. ~~**Deploy-path adoption (lint/types before host build)**~~ → **shipped (2.6.1 train)** —
    doctor flags Next/CRA/Nuxt-style “ESLint/typecheck in production build” without a local/CI
    parity path (universal signals; does not reimplement ESLint rules).  
13. Deployed docs site (content already under `docs/`).  
14. Optional locale packs (English canonical).  
15. Optional split of runtime API into a secondary package.  
16. Team features: stronger report/export, baseline burn-down UX, package-scoped debt.  

### Later / only if pulled by demand

- Incremental checks + ownership-aware contracts for huge monorepos  
- Deeper “agent control plane” (org policy inheritance, audit bus)  
- Polyglot — only if the TS agent wedge is solid  

---

## Not planned

- Reimplementing Temporal/Restate-style orchestrators  
- Growing production deps beyond the intentional TypeScript gate host  
- Becoming a web framework, job runner, ORM, or deploy platform  
- Ad-hoc layer guesses outside playbook/presets  
- **Codemod/AST-rewrite engine** — agents edit; the gate decides what lands  
- **Silent auto-apply of judgment refactors**  

---

## How we measure “good”

| Audience | Signal |
|----------|--------|
| Newbie | Completes `start` → autopilot without learning “hexagonal”; no false “you’re done” |
| Expert | Trusts deny reasons; baseline/coverage honesty; no gate bypass culture |
| Team | CI red on real debt only; governed% trends up; agents self-correct on write |
| Package | Name and docs describe gate/co-pilot — never “runtime kernel” as the product |

---

## Contributing

Issues and PRs: [github.com/pedroknigge/arkgate](https://github.com/pedroknigge/arkgate)
(repo name may follow the package successor).

For onboarding misfires, include archetype id and `ark-check --recommend --json` (or successor CLI).
