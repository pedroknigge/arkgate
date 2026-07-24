# Field dogfood (maintainer)

Offline-first regression scaffold for field gaps observed against mother **arkgate 4.1.0+**.

This is **not** a product surface and is **not** published on npm. It exists so maintainers can re-lock known false-green and DX gaps without cloning the 7-repo lab on every PR.

## Against what

| Tree | How |
|------|-----|
| **Mother** (this repo) | `npm run build` then local `bin/ark-check.mjs` / `bin/ark.mjs` |
| **Consumer clone** | Optional; pin local package via `file:` or `npm pack` — not required for smoke |

Do **not** treat npm `latest` as the field target while the branch is ahead of publish.

## Run smoke (CI-cheap)

From repo root (after `npm ci`):

```bash
npm run test:field-dogfood-smoke
# or
node scripts/field-dogfood/smoke.mjs
```

What it does:

1. Reads [`gap-assertions.json`](./gap-assertions.json) — gap IDs, slices, vitest paths.
2. Soft-skips assertions whose feature probe is absent (e.g. monorepo walk-up until S2 lands).
3. Runs the linked **unit** suites (parity, productHonesty fixtures, design-weak post-green, ESLint aliases, Plan B skill surface).

No network. No external repo clones.

## Gap assertion manifest

| Field | Meaning |
|-------|---------|
| `id` | Field gap id from `docs/plans/field-gap-closure/` |
| `status` | `closed` / `open` / `tracking` |
| `check` | `unit` (must run) or `soft` (skip until feature present) |
| `vitest` | Test files that lock the behavior |
| `featureProbe` | Optional probe key in `smoke.mjs` |
| `softSkipIf` | Human reason when skipped |

Notable locks:

| Gap | Expectation |
|-----|-------------|
| `DL-PARITY-TEST` | Type-only edges flag but `ok:true` / non-blocking |
| `P0C-ESLINT-UNVERIFIED` | `@/*` resolve + ESLint + CLI dual-driver |
| `DL-PLANB-SKILL-DEPTH` | Skills ship Plan B one-pilot checklist + kill-switch |
| `FG-EMPTY-PLAN-A-DESIGN-WEAK` | Empty plan A + designWeak ⇒ unfinished, Shape door |
| `productHonesty-unfinished-with-violations` | Honesty unfinished while residual sensors fire |
| `NEW-MONOREPO-CWD-WALKUP` | Soft-skip until S2 walk-up exists |

## Full lab (optional, network)

For a hostile multi-repo pass before a minor:

- Plan: [`docs/plans/field-gap-closure/README.md`](../../docs/plans/field-gap-closure/README.md)
- Workflow: [`.grok/workflows/pre-release-field-dogfood.rhai`](../../.grok/workflows/pre-release-field-dogfood.rhai)

That path clones real repos and is **not** required for `test:field-dogfood-smoke`.

## Extending

1. Add or close a row in `gap-assertions.json`.
2. Prefer a permanent fixture under `tests/fixtures/` + unit test over network.
3. Keep smoke offline so PR CI can run it cheaply.
