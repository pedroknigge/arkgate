# ADR 0009: Effect capabilities are architecture evidence, not a style doctrine

- **Status:** Accepted (fixture obligations met in `tests/fixtures/capability-corpus/` with the
  `u01CapabilityCorpus` structural guard)
- **Date:** 2026-07-15 (proposed) · 2026-07-16 (accepted)
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase U capability vocabulary, config surface, blocking threshold, and the
  architecture-vs-style boundary ([plan](../plans/understandable-execution/README.md))

## Context

ArkGate blocks invalid import edges deterministically, but effects (network, time, randomness,
environment, process, filesystem, persistence) are only partially modeled through
`forbiddenGlobals` and import rules. A boundary can be import-clean while depending on ambient
behavior that neither a human nor an agent can reason about locally. Phase U turns those effects
into deterministic architecture capabilities — without becoming a generic code-quality linter.

The product north star shapes every tie-break below: an architecture co-pilot usable by non-devs
(simple language first) with expert depth behind it (stable IDs, evidence, hashes); big rocks are
proposed, never auto-applied; advisory is always labeled advisory; one contract, one engine.

## Decisions

### D1 — Vocabulary: seven fixed capability IDs; IR extends additively

`network`, `filesystem`, `clock`, `randomness`, `environment`, `process`, `persistence`.

- The vocabulary is **closed**: no user-defined capabilities in the MVP. A fixed set is what makes
  plain-language remediation ("this layer may not touch the clock") and determinism possible; an
  open vocabulary is the slope toward the generic linter the plan's non-goals forbid.
- The analysis IR extends **additively** within its current major (precedent: the analysis-result
  envelope moved `1.0 → 1.1` additively in 3.1.0). No breaking IR change is authorized by Phase U.
- Each ID declares its **evidence source** in the fixture corpus: ambient-global (`clock`,
  `randomness`, `environment`, `process`), import-based (`persistence` via known driver modules;
  `filesystem` via the `node:fs` family — import-based **only** in the MVP: `process.cwd`-style
  APIs belong to the `process` capability), hybrid (`network` = `fetch`/`XMLHttpRequest` globals
  + known client imports).

### D2 — Config: both dialects lower to one semantic space; `pure: true` is the casual surface

- `forbiddenGlobals` is **not deprecated** in 3.x. Internally, both dialects **lower** to the same
  capability space (`"fetch"` → `network`, `"Date.now"` → `clock`): one engine, two config
  dialects, zero migration pressure.
- New per-layer surface (shape finalized in U04 schema work): a capability deny list, plus the
  dual-depth sugar **`pure: true`** — a casual user declares "this layer is pure" and denies all
  seven; experts use the granular list. Absence of the new surface changes no verdict.
- Migration is **proposed, never applied**: doctor may suggest the equivalent capability block for
  existing `forbiddenGlobals`; ArkGate never rewrites the contract itself.

### D3 — Blocking threshold: direct evidence blocks; inference never blocks

The blocker-grade line is drawn by **evidence kind**, not by capability:

- **Direct use in the analyzed file** — a symbol-resolved ambient global or an import of a known
  driver/client module — is blocker-grade from day one. This is the same machinery
  `forbiddenGlobals` and the C04 symbol-aware corpus already proved (aliases, `globalThis`,
  shadowing, type-only exclusions).
- **Transitive inference** ("A calls B which uses the clock") is **out of MVP scope and never
  blocker-grade** in Phase U. Indirect flows are where false positives live, and a false block
  teaches users to route around the gate — the opposite of the product.

### D4 — Ambient mutable state: doctor-only through U07; acknowledgments via sidecar

No config key in the MVP. The U05 sensor is advisory, reported by doctor only. Legitimate stateful
modules (registries, caches, memoization) are acknowledged in an `.ark/` sidecar with a reason,
following the W01 `contract-smell-acks` precedent — same UX, no schema change, no policy-delta
interplay. Any strict mode is a later evidence decision on a completed corpus, never assumed.

### D5 — Performance: lock the method, not the numbers

Two fixed scenarios: cold doctor on the 1k/10k fixtures, and the interactive single-file
hook/prepare-write path (the latency a casual user feels on every write). The locked decision is
the **method**: record a Linux CI baseline first, then set ceilings as baseline plus fixed
headroom (the package-budget pattern), with no per-item ratchet. No numeric threshold is fixed
before the baseline exists (U06 owns the numbers).

### D6 — Policy-delta (T01): classify on the lowered semantic space

Because both dialects lower to one capability space (D2), the T01 transition classifier compares
**lowered policies**, not raw config keys:

- Adding a capability deny (or `pure: true`) → **strengthening**; no acknowledgment.
- Migrating `forbiddenGlobals` entries to an equivalent-or-stronger capability policy →
  **neutral**, even though the old keys disappear — nothing was lost in the lowered set.
- Any real loss in the lowered set → **weakening**; the existing hash-bound acknowledgment path
  applies unchanged.

Lowering must be **coverage-faithful**, and bare capability ids are not fine-grained enough:
classification happens on **coverage atoms** — `ambient:<entry>` for every known ambient-map
entry a surface covers (prefix-expanded: fg `Date` covers `ambient:Date` AND `ambient:Date.now`;
fg `process` covers `ambient:process.env` too) plus `import:<capability>` for a wall's module
dimension (forbiddenGlobals never cover imports). Any lost atom is weakening: `fetch` →
`XMLHttpRequest`, `Date` → `Date.now`, and wall → forbiddenGlobals all classify as weakening;
fg → equivalent-or-stronger wall retains every atom and typically classifies **strengthening**
(added import atoms) — never requiring an acknowledgment in that direction. Unlowerable custom
globals keep the raw key-by-key comparison.

Without this rule, every legitimate migration trips the weakening guard and users learn to
acknowledge reflexively — which destroys the guard's meaning.

### D7 — Surface ownership: one violation, one voice

| Surface | Owns the question |
|---|---|
| Layer import rules | Who may import whom (declared edges between the project's layers) |
| Capability walls (U04) | What a layer may *do* (effects on the world, incl. persistence drivers) |
| Design smells (P02) | Lived-code heuristics — advisory, plan B only |
| Contract smells (W01) | The contract's own shape — advisory meta-lint |

Deduplication rule: when one piece of evidence (same file, same import) violates both a layer
rule and a capability wall, **one finding is emitted** — the layer rule wins when it exists (it is
the surface the user declared); the wall speaks only where no edge rule covers the case. Both
paths emit the same stable `nextAction` ("define a Clock/Random/HTTP/storage port; bind it outside
the pure layer"). Overlapping design smells reference the capability ID in their evidence instead
of emitting a competing remediation.

### D8 — Governance weight (W02): capability policies are a fact, not a rule count

Capability policies do **not** count as "rules" in the `governanceWeight` ratios: the bands were
calibrated on edge-rule density, and drifting wall adopters toward `heavy` would punish exactly
the behavior the product recommends. `governanceWeight` gains a raw `capabilityPolicies` count
(facts stay honest) that does not participate in banding this cycle; re-banding requires field
data.

## Non-goals (restated hard lines)

No mandatory inlining, LOC/function-length rules, class bans, generic `const` lint, style or
trust scoring, from-scratch rewrites, new skill basenames, preset packs, runtime features, general
codemods, or LLM-derived verdicts. Effects/state are modeled only where they change architectural
reasoning.

## Consequences

- The lowering decision (D2) is load-bearing: it makes D6 mechanical and keeps one engine
  authoritative across both config dialects.
- `pure: true` translates the entire phase into casual language, aligned with the co-pilot north
  star; experts keep granular lists and stable evidence underneath.
- Direct-evidence-only blocking (D3) bounds the false-positive surface to machinery that already
  passed the adversarial corpus, at the cost of not catching indirect flows in the MVP — an
  explicitly accepted, documented limit.
- U03 implements evidence per D1/D3; U04 implements config + walls per D2/D6/D7/D8; U05 follows
  D4; U06 follows D5.
- **Known limits recorded by the U03 adversarial review** (documented envelope, revisit at U04):
  a workspace/aliased package literally named like a driver (`pg`, `redis`) classifies by name —
  compiler-free matching never consults resolution; the module duals of ambient globals map to a
  single capability (`node:process` → `process` only — an environment read through the imported
  binding is undercounted until U04 decides the dual; `node:crypto` is deliberately absent);
  the pure engine and the symbol collector anchor multi-line imports at different lines, so the
  D7 dedup key must not require line equality across engines; alias chains can yield more than
  one evidence entry for one logical use — counts are evidence, never a metric.

## Fixture obligations (U01 exit — met)

The corpus lives at `tests/fixtures/capability-corpus/` (`manifest.v1.json`, 25 cases + the D6
policy pair) and is guarded structurally by `tests/unit/static-check/u01CapabilityCorpus.test.ts`
until U03 makes it executable. Per capability ID and applicable evidence source:

- **Positives:** at least one per declared evidence source, including the adversarial
  `globalThis` alias (which must still detect — S05 precedent, so it is a *positive*, not a
  negative).
- **Negatives per ambient-global source:** local shadowing, plus type-position-only use of a
  value global (`Date` used solely as a type annotation) for at least one capability.
- **Negatives per import-based source:** `import type` (must not count), and — for every
  import-based capability (`persistence`/`network`/`filesystem`) — a non-driver import with a
  similar name (`pgn-parser`, `refetch-hints`, `fsm-machine`): no substring matching.
- **Policy-allowed:** one legitimate adapter-layer persistence use — detection fires, the layer
  policy allows it, the verdict stays green (D7). The corpus carries the wiring artifact
  (`adapter-policy.config.json`) assigning the case to a no-deny adapter layer, so U04 does not
  invent the policy later.
- **D6 lowered-policy pair:** `policy-delta/` holds base + neutral-migration + real-weakening
  configs with expected classifications; marked non-executable until U04's schema lands.
