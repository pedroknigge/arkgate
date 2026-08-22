# Desktop inventory — `arkgate-check --strict-merge` (2026-08-22)

**Not Z09 close. Not an enrolled cohort. Not required-status proof.**

Owner decision (orchestration gate `gate_4a7f7a94cc66`):

1. Ship AL01–AL04 honesty now.
2. Scan Desktop for trees that already run `--strict-merge` and locally pass.
3. Patch `latest` may ship fast; space **4.7 / 4.8 / 5**.
4. OpenCode unknown. **Cursor and Codex stay PreToolUse-enforced** (owner: they work). Do not cut those hosts.

Scan root: `/Users/pedroknigge/Desktop`. Excluded: ArkGate mother fixtures/eval/examples, the site, and trees without `ark.config.json`.

## Blocker for AL05 / required-status

Every GitHub remote probed today is **private**. Branch-protection API returns **403**
“Upgrade to GitHub Pro or make this repository public to enable this feature” (GitHub Free
cannot require a status on private repos). `Amarilla-David/amarilla-platform` returned 404
on protection (still private).

So: workflow **present** and local `--strict-merge` **green** ≠ D0 adopted as
`required-merge`. Until a repo can require the `ark-check` context (public, or GitHub Pro),
the honest stance is `present-but-github-free-cannot-require` or a written
`.ark/adoption-stance.json` `stance: "advisory-only"`.

## Trees with `--strict-merge` in CI and local check **exit 0**

| Desktop path | Origin | Pin | Local `--strict-merge` | CI command |
|--------------|--------|-----|------------------------|------------|
| `SUPERLOCK/01-superlock/10-producto/web` | `pedroknigge/superlock-web` | `^4.6.2` | pass | `--strict-merge` (+ fail-on-new-smells when base SHA exists) |
| `PREDIAL WEB` | `pedroknigge/web-predial-ar` | `^4.5.5` | pass (+ baseline) | `--strict-merge --baseline` |
| `WHASHARED` | `pedroknigge/shared.inbox.grok.build` | `^4.6.0` | pass | `--strict-merge` |
| `SYNCPIPEDRIVE` | `pedroknigge/superlock-whatsapp-pipedrive-sync` | `^4.3.0` | pass (TS7 JS-API fallback warning) | `--strict-merge` (+ fail-on-new-smells when base exists) |
| `WETRAVEL` | no `origin` | `4.1.1` | pass (2 ArkRules advisories) | `--strict-merge` in `ci.yml` and `ark-check.yml` |

## Also on Desktop (not the “andan bien + --strict-merge CI” cut)

| Desktop path | Origin | Pin | Notes |
|--------------|--------|-----|--------|
| `AMARILLA APP/clean/amarilla-platform` | `Amarilla-David/amarilla-platform` | `4.6.5` | CI **has** `--strict-merge`; local `--strict-merge` **exit 1** because 4.6.5 `--require-gates` does not see `pnpm exec ark-check` in the workflow. Architecture likely fine; detector miss. |
| `SUPERLOCK/.../insights` | `pedroknigge/superinsights` | `^4.5.5` | Local `--strict-merge` pass; **CI is `--strict-config --require-gates`**, not `--strict-merge`. |
| `PROPIA/app.propia.homes` | `pedroknigge/propia.homes` | `3.9.1` | CI `--strict-merge`; no local `node_modules/arkgate`. Field hole that motivated Z10. |
| `WAFI` | `pedroknigge/WAFI` | `4.1.0` | CI `--strict-merge`; no local install. |
| `AMARILLA APP/d2d.amarilla.us.v3` | no origin | `^3.8.2` | CI `--strict-merge`; no local install. |
| `ARK/test/amarilla/amarilla-platform-test` | `pedroknigge/amarilla-platform-test` | `^4.0.0` | Test clone; CI `--strict-merge`. Not a product partner. |
| `JimeApp` | not a git repo | none | Workflow is `--strict-config --require-gates` only. |
| `ARK/v1` | mother | dogfood | `--strict` in CI. Not an external adopter. |

## Suggested first three (still not enrolled)

If/when required-status becomes possible, start with:

1. `pedroknigge/superlock-web` (current pin, baseline, local green)
2. `pedroknigge/web-predial-ar` (baseline, local green)
3. `Amarilla-David/amarilla-platform` (pin 4.6.5, other owner) **or** `pedroknigge/shared.inbox.grok.build`

Do **not** start Z09 clocks. Do **not** count these as D0 required-merge until GitHub can require the check or each tree writes `advisory-only`.
