# Develop with ArkGate

**Write. Check. Ship.**

For **developers** integrating ArkGate into a product repo: agents, CI, config, brownfield, and power tools.

When the agent writes a bad import, the write doesn’t land. The same check fails the pull
request. Not an API Gateway. Not a folder linter. Without a required CI status,
`ark.config.json` is just documentation. ArkGate is import rules. ArkRules, ArkRun,
and ArkOrder are optional — policies, an experimental runtime, and the extra that
stops slow product decisions being CRUD. Not a second install.

If you only want the happy path, start at [use.md](use.md). Optional ArkOrder
(library + sensors, not a service): [arkorder.md](arkorder.md).

### Why it exists

AI coding agents generate code at unprecedented speeds, but they tend to take the shortest path. If an agent needs data in a Domain layer, it might directly import a database adapter. Left unchecked, this creates spaghetti code and technical debt at light speed.

Traditional linters catch these architectural violations in CI *after* the agent has finished its work, breaking the flow.

ArkGate solves this by shifting the check to the exact moment of writing. By intercepting file writes through IDE hooks or MCP, it ensures that if the agent writes a bad import, the write doesn't land. The agent gets immediate feedback and can self-correct before saving to disk.

---

## Default integration

```bash
npm install -D arkgate typescript
npx arkgate start --apply
npx arkgate-check --doctor
```

Make the import-rules check a **required** merge **status context** (GitHub/GitLab/etc.). The CLI
command is `arkgate-check --strict-merge` / `ark-check --strict-merge` — the hard boundary is
requiring that job’s status, not merely adding a workflow file:

```yaml
- run: npx arkgate-check --root . --config ark.config.json --strict-merge
# or: uses: pedroknigge/arkgate@<tag-or-SHA>
```

Generated workflows also gate `--fail-on-new-smells --base-ref` so a first push with an all-zero
`github.event.before` still runs the full required CI check without a broken delta (see
[ai-gates.md](ai-gates.md#ci-backstop)).

---

## Host write path (honesty)

Local write hardness **differs by host**. CI required status is the shared hard merge line.

| Host | Local write | MCP | Merge |
|------|-------------|-----|-------|
| Claude · Grok · Antigravity | Hook rejects the write when installed + trusted | Advisory | Required status context |
| Cursor | Hook rejects Write/StrReplace when `.cursor/hooks.json` is trusted | Advisory | Required status context |
| Codex CLI · local Desktop/App Server | Hook rejects complete `apply_patch` when `.codex/hooks.json` is trusted | Advisory | Required status context |
| OpenCode | Warning only (not blocked) | Advisory | Required status context |

Full matrix and install commands: [ai-gates.md](ai-gates.md) · canonical table in [README](../README.md#host-enforcement-support).

```bash
# All common hosts (examples)
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok,antigravity
npx arkgate-check --install-agent-gates --tools antigravity   # alias: agy
npx arkgate-check --install-agent-gates --tools opencode
# Full /ark-* skill pack (optional expert depth)
npx arkgate-check --install-agent-gates --skills-only --force
```

Doctor reports what is actually installed and observed (`writePath` / enforcement state). Installed
files alone do not imply `hard:true` without runtime evidence where the product requires it.
Codex hosted tools, specialized opt-out paths, shell/direct filesystem writes, and incomplete
patch reconstruction remain outside the local hard claim and rely on required CI.

**Evidence split (Phase EH):** soft-write hosts keep `soft-write-host` in evidence without forcing
global **Not finished** when the contract is ready. With `ARK_DOCTOR_GITHUB=1`, successful CI runs
can show `runtimeObserved: true` even when branch-protection policy is plan-unavailable
(`unavailable-plan` on GitHub Free private); `hard: false` until the status is required.

---

## Contract and placement

| Concern | Doc / tool |
|---------|------------|
| Layers, rules, globs | [configuration.md](configuration.md) · `ark.config.json` |
| ArkRules (structure + invariants) | [configuration.md](configuration.md#arkrules-intra-layer-opt-in) · `arkRules` / `arkrules/*` · skill `/ark-adopt` (session 0) or `/ark-autopilot` |
| Rules inventory (brownfield) | `arkgate-check --rules-inventory` · MCP `ark_rules_inventory` |
| Which rules can be enforced | `arkgate-check --sensors` (the map) · `arkgate-check --promote [<ruleId>] [--apply]` (the price) · [agent-guide](agent-guide.md#which-rules-can-be-enforced---sensors---promote) |
| Stable package API | [package-surface.md](package-surface.md) |
| Diagnostic codes (`ruleId` why/fix) | [diagnostics.md](diagnostics.md) · root `DIAGNOSTIC_CATALOG` |
| Session / project status snapshot | `ark status --json` · MCP `ark_status` · [session recipe](agent-guide.md#session-recipe-agent-turn) · schema `arkgate/schema/status-manifest` |
| Status compass honesty | `improvementCompass.mode`: `full` \| `subset` \| `unavailable` · residual ⊆ doctor when `full` · [package-surface](package-surface.md) |
| Managed upgrade self-service | `ark upgrade --json` → `selfService` (activation labels + customized preserve) · [package-surface](package-surface.md) |
| Stale MCP/global CLI recovery | `processPackage.processStale` → non-authoritative + `PROCESS_PACKAGE_STALE`; modern outside-tree `ark upgrade` hands off to project-local CLI |
| Version-matched AGENTS projection | `ark agents-md` · [agent-guide](agent-guide.md) · **non-authoritative** (never enforces) |
| Stable finding refs (`findingRef` / `targetKey`) | analysis-result schema **1.5** · [agent-guide](agent-guide.md) · [package-surface](package-surface.md) |
| Agent Skills layout (same 13 names) | `templates/agent-skills/` · [agent-guide](agent-guide.md#install-skills-ark-and-ecosystem) · `npx skills add …` |
| Where new code goes | MCP `ark_place` · skill `/ark-place` (respects layer **and** structure sensors) |
| Preflight multi-file change | MCP `ark_prepare_change` · `ark preflight --changes …` |
| Write snippet preflight | MCP `ark_prepare_write` |

Prefer prepare/preflight before the host commits disk. Mechanical-safe patches only for proven kinds; judgment stays explicit (all ArkRules structure/invariant fixes are judgment).

### Dual-plane labeling

Agent skills (except experimental `/ark-runtime`) must label residual as **`[Layer]`** vs **`[ArkRules]`**. Doctor JSON exposes `rulesUnderContract` and, when the CLI is ahead of `package.json`, `packageVersionTruth` (dual-truth after `upgrade --no-install`).

---

## Brownfield and Shape

Existing messy trees: [brownfield-adoption.md](brownfield-adoption.md).

Phases in short:

1. **Align** — contract matches reality (not false green)  
2. **Stabilize** — baseline freezes real debt; ratchet only new violations  
3. **Shape** — design residual (plan B), one pilot at a time, never silent codemod  

Sensors:

```bash
npx arkgate-check --plan
npx arkgate-check --coverage
npx arkgate-check --doctor --json   # stable envelope { schemaVersion, envelope:"doctor", ok, doctor }
```

`--doctor --json` payload lives only under `doctor`. Doctor also writes `.ark/ci-merge-boundary.json`
(writePath per host, hook configured-not-fired, CI present-but-not-required, GitHub Free cannot
require). Hook green is not tree green. Doctor residual lenses never flip `valid` / strict-merge alone. Product path:
[use.md — Improvement compass](use.md#improvement-compass-not-a-score).

Agent reference (tools, skills, dual path): [agent-guide.md](agent-guide.md).

---

## TypeScript boundary

Project TypeScript 5 / 6 / 7: [typescript-support.md](typescript-support.md).  
Incomplete analysis (`partial` / `unavailable`) cannot satisfy plan or strict merge.

---

## Common power commands

```bash
npx arkgate start --tools <host> --apply
npx arkgate-check --doctor --json
npx arkgate-check --plan --json
npx arkgate-check --coverage
npx arkgate-check --baseline
npx arkgate status --json           # session/project snapshot (not a score)
npx arkgate agents-md               # preview managed AGENTS block
npx arkgate agents-md --write       # embed/refresh projection markers
npx arkgate preflight --changes changes.json --json
npx arkgate upgrade --json          # managed content preview
npx arkgate upgrade --apply
npx arkgate-check --changed --base origin/dev
npx arkgate-check --against origin/dev
npx arkgate status --vs origin/dev
```

---

## Team parliament (law vs feature)

`ark.config.json`, `arkrules/*`, and `.ark-baseline.json` are a **constitution**. A product PR
must not amend them. Optional `stewards` (GitHub handle or email) makes loosen / baseline-grow
steward-only. Doctor `stewardNudge` asks who owns the law or shows list drift — never invents
names. Details: [configuration.md](configuration.md#team-parliament-law-vs-feature).

---

## Optional ArkRun extra and kernel

Gates need **no** runtime kernel. Optional **`arkRun`** on `ark.config.json` (schema `1.2`)
is a *gate* extra: kernel usage + complete declarations on the same write/CI plane as
Layers and ArkRules. Absence is silent. Compact starters leave it off.

The **ArkRun** kernel (`arkgate/runtime`) is experimental, an opt-in extra of package `arkgate`,
and not the day-zero product. `createStrictArkKernel` is the factory (per instance; no
process-wide singleton). The kernel ships as `arkgate/runtime` in the same tarball.
`@arkgate/runtime` is deprecated. Built-in stores are in-memory **reference only** —
not production durability; `K01` stays parked.
See [configuration.md](configuration.md), [package-surface.md](package-surface.md), and
[production-hardening.md](production-hardening.md).

---

## Optional ArkOrder extra and plane

Layers can be green while the agent still PATCHes `plan` as if it were `seatCount`.
Optional **`arkOrder`** on `ark.config.json` (schema `1.3`) is the extra that makes
those few slow product decisions a write rule: field events absorb or escalate;
a generic `update` of the plan does not land. Absence is silent. Compact starters
leave it off.

The plane is `arkgate/order` in package `arkgate`, not a second install.
`createOrderPlane` is the factory. Call it only in `arkOrder.planeRoots`. Domain
stays plane-free. Empty `planeRoots` in `enforced` mode fails closed
(`ARKORDER_MISSING_PLANE`). In-memory. Not durable. Does not replace ArkRun.

Copy [examples/arkorder-billing/](../examples/arkorder-billing/) (`plan` / `cycle` /
`tenancy`) and rename the keys. Posting an invoice is absorbed; changing plan is a
new release. See [configuration.md](configuration.md) and
[package-surface.md](package-surface.md).

---

## Migrate from `ark-runtime-kernel`

Same product, new package name: [migrate-from-ark-runtime-kernel.md](migrate-from-ark-runtime-kernel.md).

---

## Improve the library

If you are changing ArkGate itself (not just adopting it): [CONTRIBUTING.md](../CONTRIBUTING.md).

← [All docs](README.md) · [Use path](use.md)
