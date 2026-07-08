---
name: ark-explain
description: Explain this project's architecture in plain language and generate the showcase HTML report — layers, rules, coverage, gates, and why the contract exists.
---

# /ark-explain — Understand this project's architecture

The user wants to understand the architecture, a specific rule, or why the gate blocked them.
Your job is to **teach with this repo's real data** and leave a shareable visual artifact.

## Always do this first (showcase report)

1. Run the full HTML report (uses the real contract + coverage + gates):

   ```bash
   npx ark-check --root . --config ark.config.json --report ark-report.html
   ```

   Prefer the project's package-manager runner if gates already emit one
   (`pnpm … exec ark-check` / `yarn` / `npx`).

2. Tell the user the path to `ark-report.html` and that they can open it in a browser.
   Mention it is a **generated artifact** — suggest adding `ark-report.html` to `.gitignore`
   if it is not already ignored.

3. Optionally also run:

   ```bash
   npx ark-check --coverage
   npx ark-check --doctor
   ```

   so your spoken explanation matches the report's governed% and operating mode
   (SUGGEST / ADAPT / ENFORCE).

The HTML report is the visual twin of this skill: architecture map, files per layer,
dependency direction, matrix, violations, enforcement points, and an Ark fitness score.

## Spoken / written explanation

1. **Load the real contract**: `ark.config.json`, `ark://manifest` if available, `AGENTS.md`.
2. **If asked generally** ("explain the architecture"), produce a guided tour:
   - Operating mode + governed% (honest: low coverage means green checks almost nothing).
   - Each major layer: name, purpose, one real file from this repo, file count if known.
   - Dependency direction in one short diagram (ASCII is fine).
   - Enforcement points that are actually on: write gate, CI, ESLint, baseline.
   - If a DI/kernel framework border exists, explain public surface vs internals.
3. **If asked about a specific rule or block**, answer with: the rule, the consequence it
   prevents, and the sanctioned fix (usually a port) — offer `/ark-fix`.
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
