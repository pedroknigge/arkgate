# Field feedback — `amarilla-platform` audit against `arkgate@4.9.3` (ArkOrder focus)

**Date received:** 2026-11-27 (via Orca orchestration, live terminal `term_f854d64c-fca5-4869-8495-c0dde43168e0`)
**Source:** real consumer audit of `amarilla-platform` running `arkgate@4.9.3`
**Disposition:** all five findings implemented on the 4.9.4 tree (ROADMAP `FB01`–`FB05`).
Reply sent to the source terminal: `msg_7e64786da83d` (2026-11-27).

## 1. Bug — `doctor.arkOrder.residual` (and `arkRun`) always `0` in advisory mode

- 4.9.3 evidence: `bin/lib/doctor-advisories.mjs` `attachExtraDoctorSections(...)` received only
  `activeViolations`; advisory `ARKORDER_*` findings live in `warnings`, so
  `ark-check --doctor --json` reported `residual: {count: 0, ruleIds: []}` while
  `ark-check --json` carried 4 `ARKORDER_XI_FIELD_WRITE` in `warnings`
  ("Residual: none on this scan" was a lie).
- **Fix (FB01):** warnings join the extra-plane residual — `doctor-plan.mjs` passes
  `options.warnings` through `computeDoctorAdvisories`, the report path and
  `buildReportDepthPayload` do the same for the HTML twin. Verified with the repro shape:
  advisory arkOrder + a `set({ plan: 'pro' })` write →
  `doctor.arkOrder.residual = {count: 2, ruleIds: [ARKORDER_MISSING_PLANE, ARKORDER_XI_FIELD_WRITE]}`.

## 2. Bug + AST gap — `extractArkOrderXiFieldWritesFromSource` was still whole-file regex

- 4.9.3 evidence: `src/domain/arkOrderFacts.ts:380-406` (unlike the release-key-count and
  TTL extractors, already AST). Two failure modes:
  - **2a. Lookahead backtracking:** `\bkey\s*:\s*(?!string\b|…|[A-Z])` — with a space after the
    colon (`role: Role | null | undefined`), `\s*` backtracks to 0 spaces, the lookahead tests
    the space instead of `Role`, and a type annotation fires.
  - **2b. Unscoped matches:** any driver import + any write elsewhere made the key match
    `db.select({ role: … })`, `Map.set(k, { role: … })`, and read mappers
    `return { role: record.role }` (3/3 real false positives:
    `qaqc-activity-repository.ts:1004`, `qaqc-issue-repository.ts:423`, `eos-team-repository.ts:88`).
- **Fix (FB02):** TS-AST extractor — evidence is an object literal passed to an ORM write
  method (`.set|.values|.update|.create|.upsert|.insert`, including Prisma's `data:` payload),
  a mutating `entity.key =` / `this.key =` assignment, or a SQL write column
  (`INSERT INTO … (<key>)`, `UPDATE … SET <key> =`). Type annotations, SELECT projections,
  read mappers, and `Map.set(k, {…})` are never evidence. The lexical fallback keeps the
  corrected value-head test (no backtracking).

## 3. Enhancement — `snake_case` vs `camelCase` xiKeys (Drizzle / Prisma vs SQL)

- 4.9.3 evidence: with `xiKeys` declaring `seat_holder_person_id`, ORM writes use
  `seatHolderPersonId`; the sensor matched only the literal string — 0 hits on 6 of 7 keys.
- **Fix (FB03):** declared keys match their mechanical `snake_case` ↔ `camelCase` aliases
  (both directions) in the AST, the fallback, and the SQL column evidence.

## 4. Enhancement — export `sigmaHashOf` / `xiHashOf` from `arkgate/order`

- 4.9.3 evidence: `ReleaseStore.load()` validates `hash`, `xiHash`, `sigmaHash` fail-closed,
  but the package only exported `hashOf(xi, sigma)` — consumers instantiated a throwaway
  `createOrderPlane()` and called `.release()` just to get `sigmaHash`
  (`src/lib/features/management/eos/order-plane.ts:282-291`).
- **Fix (FB04):** `arkgate/order` exports `xiHashOf` / `sigmaHashOf` (aliases of
  `hashXiIdentity` / `hashSigmaIdentity`).

## 5. Minor DX — `--sensors` marks shared ids ambiguous without guidance

- 4.9.3 evidence: `thin-adapter` declared in `PersistenceAdapters.json`,
  `PresentationAdapters.json`, and `ExternalPortal.json` → `ambiguousIds: 1` with no
  disambiguating key.
- **Fix (FB05):** ambiguous rows carry `declaredIn` (sibling documents) plus the
  rename-or-edit guidance; `--promote --apply` already refused to guess.

## Verification status at handoff

- `check:js`, `typecheck`, `knip`, `check:architecture`, generated-artifact parity: green.
- Repro-shaped live checks for FB01, FB02/03 (false positives gone, aliases + SQL hit),
  and FB05 recorded in this session; full vitest run is the remaining release gate.
