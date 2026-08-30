# Use ArkGate

**Write. Check. Ship.**

For **anyone** shipping TypeScript with an AI coding agent.

**When the agent writes a bad import, the write doesn’t land. The same check fails the pull request.**

Not an API Gateway. Not a folder linter. If the check is not required on the PR, the config
is just documentation.

---

## In one minute

```bash
npm install -D arkgate typescript
npx arkgate start                 # preview what will change
npx arkgate start --apply         # install compact config + host router + CI plan
npx arkgate-check --doctor        # status — one next step
npx arkgate-check --doctor --all  # full details
```

Then keep working with your agent. Stuck? Run `--doctor` and do action **#1**. Compact first; `--all` for details.

| Stuck on… | Do this |
|-----------|---------|
| Unsure | `npx arkgate-check --doctor` |
| Agent broke architecture | Fix the edge doctor names (or re-run check) |
| Code is green but still a mess | Leftover design work — see below |
| New ArkGate version | Follow doctor / upgrade guidance |

Full skill pack is **optional** (expert depth). Day-to-day: compact router + doctor is enough.

---

## When not to adopt

Skip ArkGate (or treat it as overkill) when:

- The project has **no AI coding agents** and **no multi-layer integration boundaries** worth pinning.
- It is a **single-developer hobby CRUD** with no pressure to keep layers honest over time.
- The team will **not** maintain `ark.config.json` layers or make `arkgate-check --strict-merge` a
  **required** GitHub status context — without that, the rules file is just documentation and a
  warning at write time can be ignored.

In those cases a boundary linter or editor rules may be enough; see [README — Why not only ESLint / Nx / cruiser?](../README.md#why-not-only-eslint--nx--cruiser). When you *do* adopt, day-to-day honesty is still: advisory write on soft hosts → required merge status. Surface that with `npx arkgate-check --doctor` or `npx arkgate status --json` ([agent guide — Write-path honesty](agent-guide.md#write-path-honesty)).

### Why it exists

AI coding agents write code at unprecedented speeds, but they tend to take the shortest path to solve a problem. If an agent needs data in a Domain layer, it might directly import a database adapter. Left unchecked, this creates spaghetti code and technical debt at light speed.

Traditional linters catch these architectural violations in CI *after* the agent has finished its work, breaking the flow and requiring manual intervention.

ArkGate solves this by shifting the check to the exact moment of writing. By intercepting file writes, it ensures that if the agent writes a bad import, the write doesn't land. The agent gets immediate feedback and can self-correct before the code even touches your disk.

---

## What you get

| When | What happens |
|------|----------------|
| While the agent writes | The write doesn’t land, or you get a warning (depends on the host) |
| Before merge | Make the Ark job a **required GitHub status context** running `arkgate-check --strict-merge` (alias `ark-check`). Until that status is required — or you write `.ark/adoption-stance.json` with `stance: "advisory-only"` — status will not call the tree adopted. |
| Anytime | Status: Setup / In progress / Ready (+ needs a refactor if leftover design work remains) |

**Cursor:** the hook rejects Write/StrReplace when `.cursor/hooks.json` is trusted.
**Codex CLI / local Desktop:** the hook rejects a complete `apply_patch` when
`.codex/hooks.json` is trusted and the operation is observed. Hosted/specialized paths,
shell/direct writes, and incomplete patches still rely on CI. **OpenCode:** local write stays
advisory (warning only, not blocked). An unverified host hook is environment evidence, not
unfinished architecture; **Not finished** is reserved for real project/config debt.

ArkGate is **not** an API Gateway, a folder linter, a web framework, ORM, or app runtime.
The config only binds when the write doesn’t land and CI is required.

### The product (you choose the extras)

| | Plain English | Default |
|--|---------------|---------|
| **ArkGate** (layers) | Import rules. The write doesn’t land. The PR fails. | Always — this is the product |
| **ArkRules** | Optional policies *inside* a layer. | Off until you turn it on (start may ship advisory templates) |
| **ArkRun** | Optional experimental runtime (`arkgate/runtime`) | Off. In-memory. Not Postgres. |
| **ArkOrder** | Stops the agent rewriting the few slow product decisions as CRUD (`arkgate/order`) | Off. Name `xiKeys` (plan / protocol, not `projectId`). Invoices and seats still flow. In-memory. Not durable. |

Start always gives you **layers**. Compact starters do **not** turn on ArkRun or
ArkOrder. No extras is fine — only ArkGate runs. Leftovers are labeled
**`[Layer]`** vs **`[ArkRules]`** vs **`[ArkRun]`** vs **`[ArkOrder]`**. Green
imports ≠ elegant design. Green imports also ≠ a frozen billing plan. ArkRun ≠
durable stores. ArkOrder does not replace ArkRun.

### New modules vs config edits

**Happy path:** put a new module under an existing layer directory/glob (`layers[].patterns`). Usually
**no** `ark.config.json` edit — the file classifies and the existing rules apply.

**Touch the rules file only when** you invent a new boundary (new layer or allow/deny edge), leave an
ungoverned path under `include`, or need a capability / forbidden-global exception. Optional ArkRules
`appliesTo` globs narrow invariants inside a layer; empty `appliesTo: []` fails closed. Full field
list: [configuration.md](configuration.md).

---

## Status lights (not settings)

| Light | Means | Your move |
|-------|--------|-----------|
| **Suggest** | New or thin project | Finish `start`, re-run doctor |
| **Adapt** | Not fully protected yet | Doctor action #1 until clean |
| **Enforce** | Import edges honest, and no new UI business-rule files vs merge-base | Keep write path + CI |
| **Enforce · leftover design work** | Edges clean; leftover design on existing files is still messy | Shape door — not “done” |

**Green edges ≠ elegant design.** Empty remediation plan is not “architecture finished” if design residual remains.

**Two-axis done:** (1) architecture residual via status/doctor/compass; (2) feature/ticket residual
outside the package. **Enforce green ≠ feature done.**

---

## When the gate is green but the code is still messy

That is **Shape** work (plan B) — suggested, never auto-applied as silent magic.

1. Doctor confirms leftover design work (and residual lenses on the improvement compass)  
2. Guided map / dual plan (skill pack: `/ark-explore` then `/ark-autopilot` applies one refactor)  
3. One small refactor at a time · re-run doctor  

**Teams:** do not amend `ark.config.json` in a product PR. Local gate:
`npx arkgate-check --changed --base origin/dev`. Law-only PRs use
`--contract-session` (stewards own loosen / baseline-grow). Checkout honesty:
`npx arkgate status --vs origin/dev`.

Install skills only when you want that guided path:

```bash
npx arkgate-check --install-agent-gates --skills-only --force
# optional: refresh shared Claude/Grok/Codex home skills (never downgrades)
# npx arkgate-check --install-agent-gates --skills-only --agent-homes --force
```

---

## Session recipe (agent turn)

Short loop so agents do not invent residual or re-run doctor every message:

1. **Bind identity** — MCP: call `ark_identity` with `project.expectedRoot` set to the project’s
   exact absolute root; reuse that root plus the returned `projectId` on later Ark tools. CLI:
   pass `--expected-root /abs/project/root` on `ark status` when you need matched vs stale binding.
2. **Read status** — `npx ark status --json` (or MCP `ark_status`) for identity, write-path
   activation honesty, last-check summary, residual lens ids, and primary next action.
3. **Act** — work the residual / next action / stable `findingRef` from check diagnostics. Do not
   invent green residual lenses. Green edges alone are never “architecture finished.”
4. **Doctor when status is incomplete** — if status `improvementCompass.mode` is **`subset`** or
   **`unavailable`** (or compass facts are missing), run `npx ark-check --doctor` (add `--json` for
   the full 15-lens map) before treating residual as complete. When mode is **`full`**, status
   residual ids are a safe subset of doctor residual for the same facts.

```bash
npx ark status --json --expected-root /abs/project/root
# when mode is not full:
npx ark-check --doctor
npx ark-check --doctor --json   # doctor.improvementCompass
```

Details: [agent-guide — Session recipe](agent-guide.md#session-recipe-agent-turn) ·
[package surface — status / compass](package-surface.md).

---

## Improvement compass (not a score)

Doctor shows an **improvement compass**: a closed set of architecture **lenses** (separation of
concerns, dependency inversion, domain alignment, …) projected from existing sensors.

```text
Improvement compass (not a score)
  Residual: Separation of concerns · Dependency inversion · Domain alignment
  Out of scope (honest): Scalability · App security tooling · Full resilience patterns
  Next: /ark-explore — one pilot at a time after map
```

| Fact | Meaning |
|------|---------|
| Always `notAScore` | No 0–10, no Excellent/Good ranks, no averages |
| Residual lenses | What still matters for cleaner, AI-easy code |
| Out of scope | Performance/APM, SAST, full resilience — use other tools |
| Never a gate input | Residual alone does **not** fail CI or flip `valid` |

JSON: `ark-check --doctor --json` → `doctor.improvementCompass` (full lenses + `topResidual`).  
Status also projects a thin residual map with honesty **`mode`**: `full` \| `subset` \| `unavailable`
(always `notAScore`) — see [Session recipe](#session-recipe-agent-turn).  
Human doctor prints the short section above.

### Align → Stabilize → Shape

| Phase | Goal | Done when (plain English) |
|-------|------|---------------------------|
| **Align** | Contract matches the tree | Include/layers honest; no false-green freeze |
| **Stabilize** | Edges under Enforce | Real debt only in baseline; write path + CI honest |
| **Shape** | One golden pattern + pilots | Residual lenses shrink pilot by pilot — never silent multi-pilot |

Green edges under **Enforce · leftover design work** mean Align/Stabilize may be fine while Shape remains open.
Empty plan A is **not** “architecture finished.”

---

## Tutorials and demos

- Plain-language track: [enthusiast/](enthusiast/README.md)  
- First project tutorial: [enthusiast/tutorial-first-project.md](enthusiast/tutorial-first-project.md)  
- Demos: [demos/](demos/)  

---

## Next depth

| Need | Doc |
|------|-----|
| Hosts, CI, MCP, brownfield, power CLI | [develop.md](develop.md) |
| Agent/CLI/MCP reference (status, skills, compass JSON) | [agent-guide.md](agent-guide.md) |
| Wire a specific agent host | [ai-gates.md](ai-gates.md) |
| Improve the library | [CONTRIBUTING.md](../CONTRIBUTING.md) |

← [All docs](README.md)
