---
name: ark-explain
description: Explain this project's architecture in plain language and generate the showcase HTML report — layers, rules, coverage, gates, and why the contract exists.
---

# /ark-explain — Understand this project's architecture

The user wants to understand the architecture, a specific rule, or why the gate blocked them.

## When / not when

| Use `/ark-explain` when… | Do **not** use it when… |
|--------------------------|-------------------------|
| Plain-language tour of layers/rules/report | Decision-grade recon / dual-plan → `/ark-explore` |
| “Why did the gate block me?” pedagogy | Apply fixes → `/ark-fix` / `/ark-autopilot` |
| Generate / walk HTML showcase report | Fitness numbers only → `/ark-coverage`; brownfield action → `/ark-adopt` |
Your job is to **teach with this repo's real data** and leave a shareable visual artifact.

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | CLI / MCP / contract sensors — exit codes, plan kinds, coverage numbers, install status |
| **Exploratory** | You open **this** repo's real files and product surface before concluding |

The CLI is a **sensor**, never the whole job. Claiming done without the exploratory bar for this skill is **incomplete**.



## Dual plane — layers + ArkRules (mandatory, except /ark-runtime)

ArkGate has **two opt-in planes**. The user chooses which to use; you **always label** findings so they never blur.

| Plane | What it protects | Where it lives | Sensors / tools |
|-------|------------------|----------------|-----------------|
| **Layers** (inter-layer) | Who may import whom, capabilities, pure/forbiddenGlobals, peerIsolation | `ark.config.json` → `layers[]`, `rules[]` | graph check, baseline edges, doctor coverage % |
| **ArkRules** (intra-layer) | Structure inside a layer + domain invariants as data | `arkRules` map + `arkrules/<ExactLayerName>.json` | structure sensors, invariant coverage, `--rules-inventory`, doctor `rulesUnderContract` |

**Rules for every report / answer:**
1. Prefix each finding or next step with **`[Layer]`** or **`[ArkRules]`** (or a two-column table with those headers).
2. Never call an import-edge violation an “invariant” or an aggregate sensor a “layer deny.”
3. Absence of `arkRules` is **valid** — do not force ArkRules unless the user wants them or residual inventory clearly wants a pilot.
4. Editing `arkrules/*` or promoting modes is **`/ark-contract`**; fixing code under a structure sensor is **`/ark-fix`** / **`/ark-loop`** (judgment, never invent mechanical-safe).
5. CLI helpers: `ark-check --rules-inventory --json`, doctor JSON `rulesUnderContract`, sensors emit `ARKRULE_*` / `INVARIANT_UNCOVERED` with `evidence.arkruleId`.


### Explain + ArkRules
- HTML/plain tour: section **Layers** and section **Rules under contract (ArkRules)** —
  when `arkRules` is active the showcase lists **per-layer counts**, **structure sensors**
  (id / sensor / mode), **uncovered** invariants (call them out), and a **covered sample**.
  Inactive map stays a short opt-in note. Counts are never a score.
- Spoken tour: name 2–4 real invariant IDs and one structure sensor from this repo’s
  `arkrules/*` (open the files — do not invent). Residual candidates → `--rules-inventory`.
- **Teach the product model (required when arkRules is active):**
  - **[Layer]** = dependency direction / purity / capabilities.
  - **[ArkRules] structure** = module-shape **heuristics** (orchestration-only, thin-adapter, …);
    enforced is not proof of Domain extraction.
  - **[ArkRules] invariants** = named business policies as **data + coverage evidence**
    (symbol/test); not a runtime engine and not a substitute for behavior tests.
  - Green edges + covered catalog ≠ elegant Shape (design-weak residual stays honest).
- Never merge Layers and ArkRules into one “architecture score.”

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
   - `origin.json` / `origin.html` — frozen **day-zero** report (`ark start`/`ark init`
     freezes this **right after** `ark.config.json`, before agent docs/CI templates)
   - `latest.json` / `latest.html` — every run
   - `history/*.json` — last ~20 machine-readable points for later tooling

   If origin already exists, the HTML includes **Evolution vs origin** (score, governed%,
   violations, files per layer). Do not delete origin unless the user explicitly wants a
   new baseline (`--reset-origin`).

2. Tell the user the path to `ark-report.html` and `.ark/reports/origin.html`.
   Mention `.ark/` should stay gitignored (Ark appends that on first report when possible).

3. **Open the report in the default browser** (mandatory when `ark-report.html` exists and
   this is a local interactive session — skip only in CI/headless or if the user said not to):

   Detect OS and run **one** simple open (best-effort; do not fail the skill if open fails):

   | OS | Command |
   |----|---------|
   | **macOS** | `open ark-report.html` |
   | **Linux** | `xdg-open ark-report.html` |
   | **Windows** | `start ark-report.html` (cmd) or `Invoke-Item ark-report.html` (PowerShell) |

   One-liner that picks the host OS (from the project root, after the report was written):

   ```bash
   # macOS / Linux / Windows (Git Bash or similar)
   case "$(uname -s 2>/dev/null || echo unknown)" in
     Darwin*) open ark-report.html ;;
     Linux*)  xdg-open ark-report.html ;;
     MINGW*|MSYS*|CYGWIN*|Windows_NT) start ark-report.html 2>/dev/null || cmd.exe /c start ark-report.html ;;
     *) open ark-report.html 2>/dev/null || xdg-open ark-report.html 2>/dev/null || true ;;
   esac
   ```

   Prefer the absolute path if the cwd is not the project root. This only opens the file in
   the **default browser** — no special flags, no browser selection.

4. Optionally also run:

   ```bash
   npx ark-check --coverage
   npx ark-check --doctor
   npx ark-check --plan
   ```

   so your spoken explanation matches the report's governed%, operating mode
   (SUGGEST / ADAPT / ENFORCE), and the plan's safe-to-auto vs decision counts.

The HTML report is the visual twin of this skill: architecture map, files per layer,
dependency direction, matrix, violations, **ArkRules under contract** (when mapped),
enforcement points, Ark fitness score, and a **Senior diagnostics** block (coupling
fan-in/out, deny density, purity surface, pattern forensics, baseline taxonomy) for
tech leads.

When explaining the **plan**, name the four `mechanical-safe` remediation kinds only
(type-only move, pure-type file relocate, `import type` of pure-type modules,
`import-type-of-type-exports` for named type exports from mixed modules; W6 port-proof inject is judgment when proof holds) — everything
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
  - **open that HTML in the default browser** (step 3 above: `open` / `xdg-open` / `start`)
    if you have not already — so the user sees the showcase without hunting for the file

## Related

- Onboarding: `/ark-architect`, `ark-check --recommend`, `docs/enthusiast/README.md`
- Brownfield: `/ark-adopt`, `docs/brownfield-adoption.md`
- Autopilot: `/ark-autopilot` after the user understands the contract

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run (include report + browser-open command when used)
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome (include `ark-report.html` path; note if browser open was attempted)
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** (or `n/a` if unused)
- **Handoff:** `/ark-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

Prefer **Incomplete?** `yes` if the showcase report was generated but the browser-open step was
skipped without CI/headless/user-opt-out reason.

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
