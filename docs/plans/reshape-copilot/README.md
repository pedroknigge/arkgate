# Reshape co-pilot (Phase X, X04)

ArkGate can prove a tree's *edges* are clean while its *physical shape* rots: hundreds of files
mirroring one domain concept across parallel directories, invisible to every current sensor.
X04 gives the doctor eyes for physical cohesion and gives agents a governed way to execute
reorganizations — one pilot at a time, judgment first, never a codemod.

Decisions are locked in [ADR 0010](../../adr/0010-reshape-copilot-boundary.md). This plan holds
the slices, acceptance criteria, and corpus obligations.

## Field origin (why this exists)

amarilla-platform, 2026-07-16/17 field sessions (2,996 governed files, 12 layers, ENFORCE 100%):

- 211 `route.ts` files under `src/app/api/projects/**` mirrored by 167 `projects*` handlers in
  `src/lib/api-handlers/` — a handful of domain concepts exploded across two parallel trees.
- Zero structural clones among the 123 `api-projects-*` files inspected in the 3.4.0 session:
  merging them is **domain modeling**, not mechanical deduplication.
- With arkgate 3.5.0 fully green (0 violations, 0 smells, governance weight `typical`, design
  fitness clean), the adopter receives **zero signal** about any of this. That blind spot is the
  product gap.

## Goals

1. **See it:** a deterministic, advisory `physicalCohesion` sensor in doctor JSON and the HTML
   report (the X01 parity rule forces the report section to exist from day one).
2. **Plan it:** a reshape plan expressed as the existing T03 architecture change map — proposed,
   never applied; validated by the T02 atomic preflight; convergence checked per T04.
3. **Execute it governed:** an agent runs ONE pilot at a time through the write gate, with a
   Q04-style pilot card (target, move, success signal, kill switch, do-nots) and a re-doctor
   after each pilot.

## Non-goals (hard, from ADR 0010)

- No codemod, ever. No auto-applied moves or merges.
- No file-count/LOC style rules, no "cohesion score" (facts are `notAScore`, W02 discipline).
- Never propose moves under framework-owned paths (Next.js `src/app/**`, `pages/**`).
- Merges are never mechanical-safe: every merge is a judgment card.
- No new skill name — deepen `/ark-loop` (execution) and `/ark-architect`/`/ark-fix` (judgment);
  promoting a dedicated `/ark-reshape` requires a new roadmap item with discovery evidence.

## Slices

### R1 — physicalCohesion sensor (advisory)

Doctor JSON `doctor.physicalCohesion` + report section (`data-advisory="physicalCohesion"`).
MVP signal: **concept sprawl** — one concept token spanning ≥ threshold files across ≥ 2
directories (path-segment extraction handles framework filenames like `route.ts`, where the
concept lives in the directory name). Thresholds are fixed constants calibrated on the corpus
(below), not user tunables.

Acceptance:
- Flags the amarilla `projects` family (route tree + handler tree) in a fixture reproducing its
  shape; stays silent on this repository and on the onboarding-matrix healthy fixtures.
- Advisory invariants: verdict, exit code, `designFitness`, `patternBets` untouched (test-pinned).
- Report section exists (parity guard extends automatically) with honest truncation markers.

### R2 — reshape plan + pilot cards

`--reshape-plan` surface (doctor/plan output): groups a flagged concept into a proposed
target shape rendered as a T03 change map; moves listed per pilot; merges emitted only as
judgment cards (evidence, options, no default). One `nextPilot` at a time (Q04 precedent).

Acceptance:
- The plan validates through the T02 atomic preflight against the current contract (a reshape
  that would create violations is reported as such, never silently emitted).
- Framework-owned paths are excluded from proposed moves (test-pinned on a Next.js fixture).
- No apply path exists anywhere in the slice.

### R3 — skill deepening + field pilot

`/ark-loop` gains the execute-one-pilot loop (read card → move → gate → re-doctor → stop);
`/ark-architect` and `/ark-fix` gain the judgment framing for merge cards. Then one real pilot
on the amarilla worktree (maintainer-supervised, no push/merge) becomes the acceptance evidence.

## Corpus obligations (before R1 lands)

- A fixture reproducing the amarilla shape: `<root>/app/api/<concept>/**/route.ts` × N mirrored
  by `<root>/lib/handlers/<concept>-*.ts` × M.
- Negative fixtures: a healthy feature-foldered tree; this repository itself.
- Calibration numbers recorded in the ADR from live runs on the amarilla worktree (authorized
  test bench, read-only against their tree).
