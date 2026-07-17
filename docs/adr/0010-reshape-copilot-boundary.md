# ADR 0010: Physical cohesion is advisory evidence; reshape is judgment, executed one pilot at a time

- **Status:** Accepted (fixture obligations met in `x04PhysicalCohesion.test.ts`: positive
  amarilla-shape fixture, healthy-tree and self-hosting negatives, pinned advisory invariants;
  the X01 parity guard covers the report section; live run on the amarilla worktree reproduced
  the calibration table exactly — 4 mirrored concepts, pilot at `src/lib/repositories` (124))
- **Date:** 2026-07-17
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase X, X04 — the physicalCohesion sensor, the reshape plan surface, the
  execution model, and the hard lines ([plan](../plans/reshape-copilot/README.md))

## Context

ArkGate proves edges; it is blind to physical shape. The amarilla field sessions (3.4.0 and
3.5.0/3.6-dev, 2026-07-16/17) showed a fully green flagship adopter — 0 violations, 0 smells,
governance weight `typical`, design fitness clean — whose tree holds domain concepts exploded
across mirrored directory families. Measured with the calibration prototype (concept clusters
per anchor directory, path-segment extraction for framework filenames):

| Tree | Concept | Anchor clusters |
|---|---|---|
| amarilla | `projects` | `src/app/api` (221) · `src/lib/api-handlers` (146) · `src/lib/repositories` (124) · `src/app/(dashboard)` (61) |
| amarilla | `timesheet` | `src/app/api` (100) · `src/lib/repositories` (44) · `src/lib/api-handlers` (28) |
| amarilla | `people` | `src/app/api` (82) · `src/lib/repositories` (24) |
| amarilla | `process` | `src/app/api` (45) · `src/lib/api-handlers` (24) · `src/lib/repositories` (20) |
| arkgate (self) | max any concept | 18 (under every threshold below) |

Two prior facts shape the design: the 3.4.0 session found **zero structural clones** among the
inspected `api-projects-*` files (merging them is domain modeling, not deduplication), and React
hook conventions (`use-*`: 189 files across ~185 directories) show that raw file count without
concentration is healthy — the signal must be **clusters**, never totals.

The product north star applies unchanged: plain language first, expert depth behind it; big
rocks proposed, never auto-applied; advisory is always labeled advisory.

## Decisions

### D1 — physicalCohesion is a doctor advisory: facts, never a score or gate input

`doctor.physicalCohesion` reports concept clusters (concept, anchors, counts, mirrored flag)
with `notAScore: true` (W02 discipline). It never changes the verdict, exit code,
`designFitness`, or `patternBets`, and never blocks a gate — pinned by test. The HTML report
section exists from day one because the X01 parity guard fails CI without it.

### D2 — Concept extraction is deterministic path/name tokenization

- Non-framework filenames: the first meaningful basename token (camelCase/kebab tokenization;
  noise tokens `use|api|get|set|app|lib` skipped; minimum length 3).
- Framework filenames (`route|page|layout|index|loading|error|template|default|not-found|middleware|action(s)|handler`):
  the concept is the **topmost** meaningful path segment (skipping `src|app|api|lib|pages|components|utils|helpers|hooks|server|client|shared|common`,
  dynamic segments `[…]`, and route groups `(…)`); the **anchor** is the path above that segment.
  This groups `src/app/api/projects/[id]/tasks/route.ts` under concept `projects`, anchor
  `src/app/api`.
- Same heuristic class as W01's layer-role regexes: a miss costs a warning line, never a verdict.

### D3 — Fixed thresholds, calibrated on the field corpus, not user tunables

A concept is reported when `maxCluster ≥ 40` OR at least two anchors hold `≥ 20` files each
(the mirrored shape). Findings are ranked by `maxCluster` and capped (top 5) with an honest
`truncated` count. On the corpus above this yields amarilla's four genuinely exploded families
and zero findings on this repository — the constants live in code with this table as their
provenance and change only with new corpus evidence.

### D4 — The reshape plan is a T03 change map: proposed, never applied

When the sensor fires, the plan surface emits a **proposed** target shape per concept as an
architecture change map (ADR 0006 shape). Moves carry `from`/`to` paths only; the T02 atomic
preflight validates the destination against the live contract (a reshape that would create
violations is reported as invalid, never silently emitted); T04 convergence applies to the
resulting tree. No apply path exists anywhere in X04.

### D5 — One pilot at a time (Q04 discipline)

The plan exposes exactly one `nextPilot` card: `pilotTarget`, `move`, `successSignal`
(re-doctor: the cluster count drops and the verdict stays green), `killSwitch` (revert the move
set; nothing else moved), `doNot[]`. Never a multi-concept batch; after each pilot, re-doctor
before the next card exists.

### D6 — Moves are proposals; merges are judgment cards; nothing is a codemod

File moves preserve content byte-identical and are still only proposed. File merges are emitted
exclusively as judgment cards (evidence and options, no default action) — the zero-clones field
fact makes any mechanical merge wrong by construction. `neverMechanicalSafe: true` on every
reshape surface.

### D7 — Framework-owned paths are fixed by convention

Anchors under Next.js `src/app/**` or `pages/**` (when Next.js is detected in the tree) are
reported as `fixedByConvention: true` and excluded from every proposed move — the route tree is
where the framework demands it. The reshape proposal targets only convention-free anchors
(amarilla: handlers and repositories may consolidate; the route tree may not move).

### D8 — No new skill name: deepen `/ark-loop`, `/ark-architect`, `/ark-fix`

The roadmap freeze holds. `/ark-loop` gains the pilot-execution loop; `/ark-architect` and
`/ark-fix` gain merge-card judgment framing. Promoting a dedicated `/ark-reshape` requires a new
roadmap item backed by field discovery problems, not this ADR.

### D9 — Non-goals (hard)

No LOC/function-length/file-count style rules; no cohesion score; no strict mode; no
auto-apply; no rewrite proposals. The sensor reports shape facts; the plan proposes physical
placement; humans and agents judge.

## Fixture obligations before Accepted

1. A positive fixture reproducing the amarilla shape (`app/api/<concept>/**/route.ts` mirrored
   by `lib/handlers/<concept>-*.ts` and `lib/repositories/<concept>-*.ts`).
2. Negative fixtures: this repository (self-hosting test) and a healthy feature-foldered tree.
3. Advisory invariants pinned: verdict/`designFitness`/`patternBets` byte-identical with the
   sensor firing vs absent.
4. The parity guard proves the report section renders (automatic via X01).

## Consequences

The doctor finally *sees* the mirrored-explosion pathology and says so in plain language, while
the gate stays exactly as strict as before. Reorganization becomes a governed loop an agent can
run without ever holding apply authority. The cost is heuristic: concept extraction will misread
some names — accepted, because every output is advisory and each miss costs one warning line.
