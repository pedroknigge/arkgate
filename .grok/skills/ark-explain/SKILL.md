---
name: ark-explain
description: Explain this project's architecture in plain language and generate the showcase HTML report — layers, rules, coverage, gates, and why the contract exists.
arkVersion: 2.9.1
---

# /ark-explain — Understand this project's architecture

The user wants to understand the architecture, a specific rule, or why the gate blocked them.
Your job is to **teach with this repo's real data** and leave a shareable visual artifact.

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | CLI / MCP / contract sensors — exit codes, plan kinds, coverage numbers, install status |
| **Exploratory** | You open **this** repo's real files and product surface before concluding |

The CLI is a **sensor**, never the whole job. Claiming done without the exploratory bar for this skill is **incomplete**.


## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents** and the task splits cleanly (e.g. multiple
dirs to sample), fan out read-only scouts; otherwise **fall back to sequential**.
Parent merges and still emits the **### Completion** contract. Never parallel-write
the same files or weaken the gate.

## Always do this first (showcase report)

1. Run the full HTML report (uses the real contract + coverage + gates):

   ```bash
   npx ark-check --root . --config ark.config.json --report ark-report.html
   ```

   Prefer the project's package-manager runner if gates already emit one
   (`pnpm … exec ark-check` / `yarn` / `npx`).

   This also maintains snapshots under **`.ark/reports/`**:
   - `origin.json` / `origin.html` — frozen **first** report (start of the journey)
   - `latest.json` / `latest.html` — every run
   - `history/*.json` — last ~20 machine-readable points for later tooling

   If origin already exists, the HTML includes **Evolution vs origin** (score, governed%,
   violations, files per layer). Do not delete origin unless the user explicitly wants a
   new baseline (`--reset-origin`).

2. Tell the user the path to `ark-report.html` and `.ark/reports/origin.html`.
   Mention `.ark/` should stay gitignored (Ark appends that on first report when possible).

3. Optionally also run:

   ```bash
   npx ark-check --coverage
   npx ark-check --doctor
   npx ark-check --plan
   ```

   so your spoken explanation matches the report's governed%, operating mode
   (SUGGEST / ADAPT / ENFORCE), and the plan's safe-to-auto vs decision counts.

The HTML report is the visual twin of this skill: architecture map, files per layer,
dependency direction, matrix, violations, enforcement points, Ark fitness score, and a
**Senior diagnostics** block (coupling fan-in/out, deny density, purity surface, pattern
forensics, baseline taxonomy) for tech leads.

When explaining the **plan**, name the four `mechanical-safe` remediation kinds only
(type-only move, pure-type file relocate, `import type` of pure-type modules,
`import-type-of-type-exports` for named type exports from mixed modules) — everything
else is judgment/deferred and must not be auto-applied.

## Spoken / written explanation

1. **Load the real contract**: `ark.config.json`, `ark://manifest` if available, `AGENTS.md`.
2. **If asked generally** ("explain the architecture"), produce a guided tour:
   - Operating mode + governed% (honest: low coverage means green checks almost nothing).
   - Each major layer: name, purpose, one real file from this repo, file count if known.
   - Dependency direction in one short diagram (ASCII is fine).
   - Enforcement points that are actually on: write gate, CI, ESLint, baseline.
   - If a DI/kernel framework border exists, explain public surface vs internals.
3. **If asked about a specific rule or block**, answer with: the rule, the consequence it
   prevents, and the sanctioned fix (usually a port). If they want it fixed now:
   **STOP — do not continue this skill as complete.** **STOP — fix requested: invoke /ark-fix.**
   This skill stays read-only.
4. **If asked "what's a port/adapter/saga…"**, two sentences + this-repo example or conventional path.

## Operating rules

- Prefer generating the HTML report even when the question is narrow — then zoom the prose.
- Read-only for source code: this skill does not refactor product files (writing the report
  HTML is fine).
- Calibrate depth: one-rule questions get a paragraph; full tours get structure + report.
- Every jargon term gets a one-line plain definition on first use.
- End with:
  - the strict check from `package.json` (or `ark-check --root . --config ark.config.json --strict-config`)
  - `/ark-place` for "where does new code go?"
  - the path to `ark-report.html`

## Related

- Onboarding: `/ark-architect`, `ark-check --recommend`, `docs/enthusiast/README.md`
- Brownfield: `/ark-adopt`, `docs/brownfield-adoption.md`
- Autopilot: `/ark-autopilot` after the user understands the contract

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Handoff:** `/ark-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
