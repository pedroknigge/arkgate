# ACS07 — Placement A/B (with gates+skills vs without)

Maintainer evaluation only. **Not a product score.** **Not a release blocker** when external
API keys or live agents are absent.

## Purpose

Compare agent-equivalent **placement** outcomes:

1. **without-gates** — no Ark skills package available; wrong-layer placement as the
   agent-equivalent failure mode.
2. **with-gates** — architecture contract + Agent Skills markers (`ark-place`,
   `ark-architect` from the ACS05 packaging layout) available; correct layered placement.

Skills are **process** (coaching). Enforcement remains deterministic `ark-check` / hooks / CI.
This suite never asks the package for an LLM pass/fail verdict.

## Dry mode (CI-safe, default)

```bash
npm run eval:placement-ab
node eval/placement-ab-run.mjs --dry
ARK_PLACEMENT_AB_OUT=/tmp/report.json node eval/placement-ab-run.mjs
```

For each task under `tasks.json`:

1. Run `ark-check --json` on `fixtures/<id>/without-gates` (must fail with ≥1 layer violation).
2. Run `ark-check --json` on `fixtures/<id>/with-gates` (must pass with 0 violations).
3. Assert Agent Skills markers exist only on the with-gates arm.
4. Match oracle metrics (`layerViolations`, `misplacedFiles`, `skillsPresent`).
5. Write the report.

Exit **0** only when all fixtures verify and `placementImproved` is true
(with-gates fewer violations + skills present on with-gates only).

## Results path

| Artifact | Path |
|----------|------|
| Dry report | `eval/placement-ab-report.json` |
| Template | `eval/placement-ab/results/RESULTS.template.json` |
| Live optional | `eval/placement-ab/results/live-report.json` |

Copy the template when recording a maintainer offline live run. Keep `notAProductScore: true`.

## Live mode (optional, offline)

```bash
node eval/placement-ab-run.mjs --mode live
```

Without `ARK_EVAL_AGENT_CMD` / `ARK_PLACEMENT_AB_AGENT_CMD`, exits **0** with
`skipped-no-agent` so CI and clean checkouts never fail for missing keys.

To run a real offline agent: materialize each fixture arm, give the task `prompt`, let the
agent edit, re-run `ark-check`, and record rates in `results/live-report.json` using the
template fields. Prefer dry mode for any automated gate.

## Adding a task

1. Add `fixtures/<id>/{without-gates,with-gates}/` with the same `ark.config.json` contract
   shape on both arms.
2. without-gates: intentional wrong placement (violates the contract); **no**
   `.agents/skills/`.
3. with-gates: correct placement; include
   `.agents/skills/ark-place/SKILL.md` and `.agents/skills/ark-architect/SKILL.md`
   (fixture markers are enough for dry mode).
4. Append oracle metrics to `tasks.json`.
5. Run `npm run eval:placement-ab` and the unit test.

## Related

- Broader enthusiast prompt bank: `eval/comparative-run.mjs`
- Placement turns (golden vs design-weak): `eval/ai-velocity-run.mjs`
- Live remediation cases: `eval/run.mjs`
