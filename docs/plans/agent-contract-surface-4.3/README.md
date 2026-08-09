# Agent Contract Surface (4.3.0)

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `todo`/`doing` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) · [Agent guide](../../agent-guide.md)

**Status:** Accepted / engineering active for **4.3.0** (`ACS01`–`ACS05` done; `ACS06`–`ACS08` open)  
**Slug:** `agent-contract-surface-4.3`  
**Kind:** epic  
**Owners:** ArkGate maintainers  
**Last updated:** 2026-08-08 (ACS05 done)  
**Code paths (expected):** `src/domain/`, `bin/`, `templates/skills/`, `schemas/`, `eval/`, `docs/`

## Plan lock (ACS01)

Phase ACS is the **sole engineering epic** for npm **4.3.0**. Plan authority matches
[ROADMAP.md](../../../ROADMAP.md) Phase ACS; no other `todo` engineering epic may take
`doing` without explicit reprioritization in ROADMAP.

Product voice for this train (see [product-voice.md](../../product-voice.md)):

- **Guardrail catalog** — closed vocabularies for sensors, capabilities, diagnostic codes, and
  skill roles (json-render analogy). Agents and copy do not invent free-form rule ids or
  enforcement claims outside the catalog.
- **Scan / process dual depth** — **scan** is deterministic CLI/MCP/engine evidence; **process**
  is skill- and agent-side judgment that coaches placement and remediation. Process never
  decides pass/fail inside the package (deepsec harness shape borrowed; LLM verdict rejected).

### Freeze restated for 4.3.0 (do not start without a new ROADMAP item)

These hold through the **4.3.0** publish train. Inherited hard lines are unchanged.

| Frozen | Why (ACS) |
|--------|-----------|
| New skill **names** (beyond the current 13) | Deepen + package + route only; Agent Skills layout is distribution |
| New architecture presets / policy packs | Field demand + separate promotion; not release filler |
| New ArkRules sensor vocabulary (e.g. konsistent-class symmetry) | Later train seed; needs ADR + demand |
| LLM pass/fail or “process” verdict in the package | Binary deterministic gate; eval may use external agents offline only |
| AGENTS.md / skills / projection as enforcement inputs | Projection is labeled non-authoritative; gate is CLI/hooks/CI |
| Runtime productization | ADR 0004; optional kernel stays experimental |
| False hard-write claims for soft hosts (Cursor/Codex/OpenCode) | Honest activation labels only |
| Numeric trust / health score | Binary gate; inventory counts are not scores |
| Z09 retained-adoption claim close as ACS scope | Parked residual RB-11; does not block ACS engineering |

## Problem

ArkGate 4.2.1 is a strong **write firewall + coach** on the contract plane (layers, ArkRules,
identity handshake, CI/MCP/hooks). Field and ecosystem pressure has shifted:

1. **Agents discover tools via the open skills ecosystem** (`npx skills`, skills.sh), not only
   via `ark --install-agent-gates`. Our 13 skills are powerful but not first-class citizens of
   that distribution channel.
2. **Agent-facing prose drifts from the installed package version.** Next.js now ships
   version-matched `AGENTS.md` / bundled docs (next-skills → canary). Ark still relies on stamped
   templates that can lag the gate binary an agent is actually running.
3. **Diagnostics are actionable but not catalog-linked like modern agent DX.** Codes such as
   `LAYER_IMPORT_VIOLATION` exist; they are not a published, stable, search/docs-linked catalog
   with typed `why`/`fix` surfaces (nostics pattern).
4. **Session truth is fragmented.** Identity, last check, baseline, host activation, and ArkRules
   inventory live on different commands/tools. Agents re-parse prose instead of reading one
   machine snapshot (dev3000 / agent-browser doctor patterns).
5. **Findings are hard to re-address across turns.** Refs are path+message oriented; agents need
   stable finding ids for multi-turn fix loops (agent-browser `@eN` mental model).

A parallel research pass of [Vercel Labs](https://github.com/vercel-labs/) (top-starred repos +
architecture-adjacent tools) confirmed which patterns to **borrow** and which to **reject**.

## Research synthesis (both analyses)

### Borrow (patterns, not dependencies)

| Pattern | Source | Ark application |
|---------|--------|-----------------|
| Guardrailed catalog, not free generation | **json-render** | Product voice + sensor/capability closed vocab |
| Version-matched agent projection | **next-skills → Next canary** | Generate agent contract from *this* package version |
| Multi-agent skills install channel | **skills** + **agent-skills** | Agent Skills spec packaging; no new skill *names* |
| Atomic rules → compiled agent doc | **react-best-practices build** | Compact agent block from config + arkrules |
| Stable diagnostic codes + why/fix | **nostics** | Public code catalog + docs anchors |
| Session/status JSON for agents | **dev3000**, **agent-browser doctor** | `ark status --json` (+ MCP) |
| Snapshot + stable refs | **agent-browser** | Finding refs across turns |
| Checked patch / stale reject | **zerolang** | Language for prepare-write + identity stale |
| scan → process language | **deepsec** | CLI sensor vs skill judgment (docs only) |
| Symmetric package/export families | **konsistent** | Optional later sensor (closed vocab ADR) |
| Outer loop + deterministic verify | **ralph-loop-agent** | Deepen `ark-loop` docs: verify = `ark-check` |
| A/B agent eval harness | **agent-eval** | Maintainer `eval/` A/B with/without gates |
| Facts-from-source adoption stages | **design-systems-to-agent-skills** | Deepen adopt stages on disk (later) |
| One-command mechanical fix | **fix-react2shell-next** | Later: dry-run JSON for mechanical-safe only |
| Dep source for agents | **opensrc** | Docs tip only, not core |
| Pure Domain → backends | **scriptc** IR | Keep cli-pure / parity discipline |

### Reject (hard lines unchanged)

| Anti-pattern | Source | Why not |
|--------------|--------|---------|
| LLM pass/fail in package | deepsec process, openreview | ADR / product hard line |
| New skill *names* for migration | vision skills | Freeze: deepen + route |
| New presets/packs as release filler | labs templates | Freeze until field demand |
| Runtime productization | open-agents, coding-agent-template | ADR 0004 |
| Embed browser/security scanner | agent-browser, deepsec | Out of wedge |
| Depend on Vercel Sandbox/AI Gateway | many labs repos | Optional consumer tooling only |

### Positioning (4.3.0 narrative)

> Vercel Labs industrializes **skills distribution and agent harnesses**.  
> ArkGate industrializes the **architecture contract graph** (layers + ArkRules) with the same
> agent-native discipline: version-matched projection, stable codes, one status snapshot, and
> checked apply — **without** an LLM deciding pass/fail.

## Outcome (4.3.0 done when)

1. An agent (any skills-compatible host) can install the **same 13 skills** via Ark install *or*
   Agent Skills–compatible packaging documented for `npx skills`, without new skill names.
2. Install/upgrade/refresh can emit a **version-matched** agent-facing contract projection
   (AGENTS/CLAUDE block or equivalent) derived from the installed `arkgate` version + project
   contract, never as enforcement input.
3. Every public violation code is listed in a **stable catalog** with human/agent `why`/`fix`
   anchors; docs and remediation share the same codes.
4. `ark status --json` (and matching MCP surface if needed) returns one **session/project
   manifest**: identity binding, activation honesty, last check summary, baseline residual,
   rules inventory counts when applicable.
5. Findings carry **stable refs** suitable for multi-turn agent loops (id + ruleId + target key).
6. Maintainer eval has at least one **A/B** “with gates vs without” placement fixture suite
   recorded under `eval/`.
7. Claims matrix + public lanes have **0 Contradicted** for new 4.3.0 statements; package
   published as **arkgate@4.3.0** with signed tag and release notes.

## Users and success

- **Primary:** teams whose coding agents live in the skills ecosystem (Claude, Codex, Cursor,
  Grok, OpenCode, …) and need Ark contract truth without rediscovering CLI flags every session.
- **Secondary:** maintainers proving that gates improve agent placement (eval A/B).
- **Success metrics (binary / honest counts, no score):**
  - Skills install smoke on ≥3 agent path layouts from one package payload.
  - Projection hash/version stamped with package version; drift test green.
  - Catalog coverage: every emitted `ruleId` in fixtures maps to a catalog entry.
  - Status JSON schema export + parity CLI/MCP.
  - Eval A/B recorded pass rates (informational, not product score).

## Scope

| In 4.3.0 | Explicitly later / out |
|----------|-------------------------|
| Agent Skills–compatible packaging of **existing** 13 skills | New skill names |
| Version-matched agent projection generator | Trusting AGENTS.md as enforcement |
| Public diagnostic code catalog + docs anchors | Numeric health score |
| Unified `status --json` (+ MCP if required for parity) | Control-plane / multi-tenant SaaS |
| Stable finding refs on adapter contract | LLM revalidate / deepsec fork |
| Maintainer A/B eval fixtures | Shipping agent-eval as dependency |
| Product voice + claims for guardrail catalog | konsistent-class sensor vocabulary |
| — | One-shot mechanical codemod engine |
| — | visual-json config UI |
| — | Z09 retained-adoption claim close |

## Hard lines (inherited)

- No LLM-derived pass/fail; no enforcement claim from AGENTS.md/skills alone.
- No new skill **names** (ADR 0015 freeze): deepen bodies + packaging only.
- No new architecture presets/packs unless a separate ROADMAP promotion lifts the freeze.
- No silent mechanical apply of judgment-heavy fixes.
- No false hard-write claims for soft hosts (Codex/Cursor/OpenCode).
- Binary gate; no numeric trust score.
- Package stays zero-LLM; eval may use external models offline for maintainer proof only.

## Public contract sketches

### Status manifest (sketch)

```json
{
  "schemaVersion": "1.0",
  "arkgateVersion": "4.3.0",
  "projectIdentity": { "projectId": "…", "resolvedRoot": "…", "binding": "matched" },
  "activation": { "writePath": "hard|advisory|unavailable", "host": "…", "honestLabel": "…" },
  "lastCheck": {
    "at": "ISO-8601|null",
    "verdict": "pass|fail|incomplete|null",
    "activeViolations": 0,
    "frozenResidual": 0
  },
  "rules": {
    "arkRulesLoaded": true,
    "inventoried": 0,
    "underContract": 0,
    "frozenResidual": 0
  },
  "nextAction": { "id": "…", "summary": "…" }
}
```

### Finding ref (sketch)

```json
{
  "findingRef": "sha256:…",
  "ruleId": "LAYER_IMPORT_VIOLATION",
  "arkruleId": null,
  "targetKey": "baseline-compatible-key",
  "path": "src/…",
  "docsCodeUrl": "https://…/diagnostics#LAYER_IMPORT_VIOLATION"
}
```

### Agent projection (sketch)

- Generated from: package version + effective contract summary + code catalog short list.
- Labeled non-authoritative: “enforcement is ark-check / hooks / CI, not this file.”
- Regenerable: `ark agents-md` (or install flag) without rewriting customized human sections
  when content-identity matches (WI skill idempotence discipline).

Exact schema versions and field names land in Domain + package exports during `ACS02`–`ACS04`.

## Work items (ROADMAP Phase ACS)

| ID | Size | Depends | Outcome |
|----|------|---------|---------|
| `ACS01` | S | — | **Done** — plan locked; product-voice catalog/guardrails + scan/process; freeze restated for 4.3.0 |
| `ACS02` | M | `ACS01` | **Done** — public diagnostic code catalog (Domain + docs anchors); remediation/`why`/`fix` keyed by stable `ruleId`; parity fixtures |
| `ACS03` | M | `ACS01` | **Done** — `ark status --json` (+ MCP `ark_status`); schema export; identity/activation/last-check/rules counts; CI-safe no-prompt |
| `ACS04` | M | `ACS02` | **Done** — version-matched agent projection (`ark agents-md`); install/upgrade embed; drift tests; non-enforcement labeling |
| `ACS05` | M | `ACS01` | **Done** — Agent Skills–compatible packaging of existing 13 skills; agent-guide install via skills ecosystem; no new names |
| `ACS06` | M | `ACS02`, `ACS03` | Stable finding refs on adapter surfaces (CLI JSON, MCP, repair payload); multi-turn fixture |
| `ACS07` | M | `ACS05` | Maintainer A/B eval: agent placement with Ark gates vs without; recorded under `eval/`; README eval lane |
| `ACS08` | S | `ACS02`–`ACS07` | Claims matrix + public lanes; CHANGELOG; `docs/releases/4.3.0.md`; signed publish **4.3.0** |

One `doing` at a time. Detailed acceptance per item lives in ROADMAP when the item is `todo`/`doing`.

## Sequencing

```text
ACS01 (voice + plan lock)
   ├── ACS02 (codes) ──┐
   ├── ACS03 (status) ─┼── ACS06 (finding refs)
   └── ACS05 (skills packaging) ── ACS07 (eval A/B)
              ACS02 ── ACS04 (agent projection)
                         └── ACS08 (claims + release)
```

Parallelism is only at the plan level; implementation still serializes via ROADMAP `doing`.

## Later train (not 4.3.0 — seed only)

| Seed | Inspiration | Gate to promote |
|------|-------------|-----------------|
| Family/export symmetry sensor | konsistent | ADR sensor vocab + field demand |
| Adoption stages on disk | design-systems-to-agent-skills | Deepen ark-adopt; no new skill name |
| Mechanical-safe one-shot CLI | fix-react2shell | NeverMechanicalSafe discipline tests |
| opensrc tip in agent-guide | opensrc | Docs-only anytime |
| Companion evaluator | ADR 0016 | Separate cycle |

## Evidence required for ACS08 close

- Clean checkout: build, architecture check, coverage/mutation gates, package verify.
- Focused tests for catalog, status schema, projection drift, finding refs, skills packaging layout.
- Eval A/B artifacts committed or path-documented under `eval/`.
- Claims matrix row updates; 0 new Contradicted for 4.3.0 statements.
- Signed tag `v4.3.0`, GitHub Release, npm `latest` via Trusted Publishing.

## Non-goals reminder

4.3.0 is **agent contract surface** excellence on top of the already-shipped 4.0–4.2 enforcement
core. It is not a second ArkRules sensor epic, not Z09 claim close, and not a Vercel Labs clone.
