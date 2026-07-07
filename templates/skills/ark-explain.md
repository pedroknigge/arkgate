---
name: ark-explain
description: Explain this project's architecture in plain language — the layers, why each import rule exists, and what to do when the gate blocks you.
---

# /ark-explain — Understand this project's architecture

The user wants to understand the architecture, a specific rule, or why the
gate just blocked them. Your job is to teach, not to lecture: plain language,
this project's real files as examples, no unexplained jargon.

## Steps

1. **Load the real contract**: `ark.config.json`, the `ark://manifest` MCP
   resource if available, and `AGENTS.md`. Everything you explain must come
   from these plus the actual source tree — not from generic architecture
   theory.
2. **If asked generally** ("explain the architecture"), produce a guided tour:
   - Each layer: name, its directory, one sentence of purpose, and ONE real
     file from this repo as an example.
   - The dependency direction in one diagram (ASCII arrows are fine): who may
     import whom, who may not.
   - The enforcement points: write gate (blocks bad edits as you type),
     `ark-check` in CI (blocks bad merges), ESLint (in-editor), baseline
     (old violations frozen, new ones blocked) — one sentence each, only the
     ones actually configured in this repo.
   - How much is actually governed: run `ark-check --coverage` and report
     `governed.percent`. Be honest — if it's low, say a green check only covers
     that fraction; the rest is unchecked, not verified clean.
   - If the repo uses a DI/kernel framework (dcouplr, NestJS, a custom kernel),
     explain the border principle: Ark guards the boundary AROUND it — a declared
     public surface app code may import — and treats the framework's internals as a
     black box it does not police. That's why the contract has a `*Api`/`*Internal`
     split, if it does.
3. **If asked about a specific rule or block** ("why can't domain import the
   repo?"), answer with: the rule from the config, the practical consequence it
   prevents (couple the business rules to the database and you can't test or
   swap either), and the sanctioned way to do what they wanted (usually a port —
   define the interface where you need it, implement it where the capability
   lives; offer `/ark-fix` to do it).
4. **If asked "what's a port/adapter/saga/projection/outbox"**, define it in
   two sentences with a this-repo example if one exists, or the conventional
   directory it would live in if not.

## Operating rules

- Read-only: this skill never edits files.
- Calibrate depth to the question — a one-rule question gets a paragraph, not
  the full tour.
- Every jargon term gets a one-line plain definition on first use.
- End with the two commands worth memorizing: the strict check from
  `package.json` (or `ark-check --root . --config ark.config.json
  --strict-config`) and `/ark-place` for "where does new code go".
- For a general tour, offer the visual version: `ark-check --report
  ark-report.html` writes a self-contained HTML report (layer map, import
  matrix, violations, live gates) — a shareable artifact for a PR or onboarding.
  It's generated output: suggest adding it to `.gitignore`, not committing it.

## Related onboarding

- New builders: point to `/ark-architect`, `ark-check --recommend`, and `docs/enthusiast/README.md`.
- Violation JSON fields `fixClass`, `effort`, `enthusiastHint` explain fixes in plain English.
- Brownfield adoption: `/ark-adopt` and `docs/brownfield-adoption.md` — different job than explaining an existing contract.
