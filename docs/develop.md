# Develop with ArkGate

For **developers** integrating ArkGate into a product repo: agents, CI, config, brownfield, and power tools.

If the AI writes an illegal import, the write is rejected. The same check fails the pull
request. Not an API Gateway. Not a folder linter. Without a required CI status,
`ark.config.json` is just documentation.

If you only want the happy path, start at [use.md](use.md).

---

## Default integration

```bash
npm install -D arkgate typescript
npx arkgate start --apply
npx arkgate-check --doctor
```

Make the architecture check a **required** merge **status context** (GitHub/GitLab/etc.). The CLI
command is `arkgate-check --strict-merge` / `ark-check --strict-merge` — the hard boundary is
requiring that job’s status, not merely adding a workflow file:

```yaml
- run: npx arkgate-check --root . --config ark.config.json --strict-merge
# or: uses: pedroknigge/arkgate@<tag-or-SHA>
```

Generated workflows also gate `--fail-on-new-smells --base-ref` so a first push with an all-zero
`github.event.before` still runs the full merge gate without a broken delta (see
[ai-gates.md](ai-gates.md#ci-backstop)).

---

## Host write path (honesty)

Local write hardness **differs by host**. CI required status is the shared hard merge gate.

| Host | Local write | MCP | Merge |
|------|-------------|-----|-------|
| Claude · Grok · Antigravity | Pre-write block when installed + trusted | Advisory | Required status context |
| Cursor | Pre-write block for Write/StrReplace when `.cursor/hooks.json` is trusted | Advisory | Required status context |
| Codex CLI · local Desktop/App Server | Pre-write block for complete `apply_patch` when `.codex/hooks.json` is trusted | Advisory | Required status context |
| OpenCode | Warning only (not blocked) | Advisory | Required status context |

Full matrix and install commands: [ai-gates.md](ai-gates.md) · canonical table in [README](../README.md#host-enforcement-support).

```bash
# All common hosts (examples)
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok
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

The companion **ArkRun** kernel (`@arkgate/runtime`) is experimental, a separate package,
and not the day-zero product. `createStrictArkKernel` is the factory (per instance; no
process-wide singleton). The kernel is not bundled in the `arkgate` tarball. Built-in
stores are in-memory **reference only** — not production durability; `K01` stays parked.
See [configuration.md](configuration.md), [package-surface.md](package-surface.md), and
[production-hardening.md](production-hardening.md).

---

## Migrate from `ark-runtime-kernel`

Same product, new package name: [migrate-from-ark-runtime-kernel.md](migrate-from-ark-runtime-kernel.md).

---

## Improve the library

If you are changing ArkGate itself (not just adopting it): [CONTRIBUTING.md](../CONTRIBUTING.md).

← [All docs](README.md) · [Use path](use.md)
