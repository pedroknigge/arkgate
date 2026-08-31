# Layer description — project the caption that already exists

> **Plan, not implementation authority.** Code and executable schemas decide whether a
> claim is true. Work starts only when item IDs appear as `doing`/`todo` in
> [ROADMAP.md](../../../ROADMAP.md). Hub: [AGENTS.md](../../../AGENTS.md) ·
> [Configuration](../../configuration.md) · [ADR index](../../adr/README.md)

**Status:** In progress (`LD01` done — [ADR 0035](../../adr/0035-layer-description-projection.md) accepted; `LD02` done — policyHash omits `layers[].description`; `LD03` done — place / prepare-write / MCP JSON project `description`; `LD04` done — doctor JSON + human, coverage JSON, HTML Purpose column; `LD05`–`LD06` `todo`; target **4.8.7**).<br>
**Slug:** `layer-description-projection`<br>
**Kind:** epic / contract caption projection<br>
**Prefix:** `LD`<br>
**Owners:** product (Pedro) + library maintainers<br>
**Last updated:** 2026-08-31<br>
**Target package:** additive patch **`arkgate@4.8.7`** over published **4.8.6**.
**No `schemaVersion` bump** — `layers[].description` already exists on the layer
object (optional string, `minLength: 1`).<br>
**Code path (when doing):** `src/domain/effectiveContract.ts` (hash), place /
doctor / coverage / report adapters, `templates/skills/ark-adopt.md` +
`ark-place.md` (`generate:agent-skills`)

Does **not** close `Z09` / residual `RB-11` or `K01`. Does **not** add a schema
key. Does **not** add a skill name. Absence of `description` stays silent and
must **not** invent residual.

---

## 0. The finding

The contract already has the atom the product asked for:

```json
"layers": [{ "name": "Application", "patterns": ["src/application/**"], "description": "Purchase requests — from asked to received." }]
```

Measured against `src/domain/` and `schemas/`, not from memory:

| Evidence | Path |
|----------|------|
| Optional field | `src/domain/configTypes.ts` `description?: string` |
| Schema | `configContract.ts` `$defs.layer.properties.description` (`minLength: 1`) |
| Kernel copies it | `ArchitectureProfile.ts` `description: layer.description` |
| HTML report | `bin/lib/html-report.mjs` (column, or "See ark.config.json" / —) |
| Policy-pack blurbs | `templates/policy-packs/*/layerDescriptions` applied in `bin/ark-check-runtime.mjs` |
| 11-layer preset generics | `ArchitectureProfile.ts` (`'Rich domain model, business rules, and domain events.'`) |

What is **missing** is the *use*:

| Surface | Today |
|---------|-------|
| `ark.config.json` | Field accepted |
| HTML report | Purpose column shows caption when present (`LD04`); fallback — / See ark.config.json when absent |
| `ark_place` / prepare-write / MCP | Projected when present (`LD03`); omitted when absent |
| doctor / coverage | Projected when present (`LD04`); omitted when absent; never a residual |
| Skills adopt / place | Glossary is process; they do not write or read the field with teeth |
| `docs/configuration.md` | **Does not name** `layers[].description` |
| `policyHash` | Omits the string (`LD02`); same strip as `stewards` (`effectiveContractPolicyPayload`) |

A consumer can write the caption and an agent still locates files as if the
folder were only a glob. Before LD02, changing “pedidos In Contract” to a typo
fix was a **policy-hash change** — caption wearing import-rule teeth.

The grain is the **layer** (one slow phrase per house), not each file.

---

## 1. Locked decisions (LD01 produces the ADR)

Authority is the accepted ADR ([0035](../../adr/0035-layer-description-projection.md)). This section is the index.

| D | Decision |
|---|----------|
| D1 | **Reuse `layers[].description`.** Do not add `purpose`, `caption`, `folderBlurb`, or `include[].note` in this epic. One key. |
| D2 | Copy is **app context** (what this folder is *in the product*), not architecture jargon. Preset generics may stay as fallback; adopt prefers glossary / product map. |
| D3 | **Absence is silent.** Missing description never fails `--strict-config`, never invents doctor residual, never flips `valid`. `minLength: 1` when the key is written stays (empty string is invalid JSON for the field). |
| D4 | **Strip from `policyHash`** the same way `stewards` is stripped (`effectiveContractPolicyPayload`). A caption-only edit is **neutral** and does not need a weakening ack. Import rules stay the teeth. |
| D5 | **Project, do not enforce.** `ark_place` / prepare-write / MCP place JSON, doctor JSON + human, coverage JSON, HTML report (already). Status may carry a thin copy. Never a score. Never a second verdict ([ADR 0026](../../adr/0026-gate-waist-facts-in-verdict-out.md)). |
| D6 | **Adopt writes; place reads.** Session 0 (`/ark-adopt`) fills `description` when the product map or glossary names the house. `/ark-place` prints it next to layer + globs. No new skill names. No LLM filler. |
| D7 | **Not per file.** Not per directory except as the layer that owns those globs. Monorepo package roots are later (`include[].note`) — out of this epic. |
| D8 | Compact starter / `ark start` may omit the field. Policy-pack `layerDescriptions` stay valid. This mother 4-layer config may add captions only if they describe *this library*, not a consumer app. |

---

## 2. Queue

Live statuses live in [ROADMAP.md](../../../ROADMAP.md). Seed:

| ID | Depends | Size | Outcome |
|----|---------|------|---------|
| `LD01` | — | M | ADR **0035** accepted: D1–D8. Plan lock only — no adapter code. |
| `LD02` | LD01 | M | `policyHash` omits `layers[].description` (documented next to `stewards`). Caption-only delta is neutral. Tests. `generate:cli-pure` if Domain changes. |
| `LD03` | LD01 | M | `ark_place` / prepare-write / MCP placement JSON include `description` when present. Tests. |
| `LD04` | LD01 | M | Doctor JSON + human, coverage JSON, HTML report parity. Absence → no residual. Never a score. |
| `LD05` | LD03 | M | Deepen `/ark-adopt` (write caption in session 0) and `/ark-place` (read). `generate:agent-skills` / `check:agent-skills`. No `/ark-describe`. |
| `LD06` | LD02+LD04+LD05 | S | `docs/configuration.md` + package-surface; public example of an app-context caption; tests that pin projection. |

Serial: `LD01 → LD02 → LD03 → LD04 → LD05 → LD06`. `LD03`/`LD04` may proceed after
`LD01` in parallel only if engineering splits with an explicit note; ROADMAP stays
one `doing`.

---

## 3. Placement in this tree

| Layer | Path |
|-------|------|
| DomainModel | policy-hash strip + types if needed (`generate:cli-pure`) |
| Kernel | unchanged (profile already copies `description`) |
| Tooling | place, doctor, coverage, report, skills |
| FrameworkAdapters | empty |

Root `arkgate` export does not grow a caption API. CLI/MCP already load the layer object.

---

## 4. What we will not build

- a new config key
- per-file or per-directory wiki
- LLM that invents descriptions
- residual / fail-closed when the field is missing
- caption as merge teeth or weakening
- `include[].note` (later, if monorepo roots need their own slow phrase)
- a new skill name
- re-opening 4.8.6 (published; this is a later patch)

---

## 5. Kill switches

- New key instead of `layers[].description` → stop.
- Absence invents doctor residual or flips `valid` → bug.
- Caption-only edit requires policy-ack / weakening → revert LD02.
- `/ark-describe` or a 14th skill name → forbidden ([ADR 0015](../../adr/0015-arkrules-migration-skills.md)).
- Place still omits the field after LD03 → the epic did not land.

---

## 6. Success

A consumer writes one sentence per layer in `ark.config.json`. `/ark-place`
returns that sentence next to the layer name and globs. Doctor and the HTML
report show the same text. Changing the sentence does **not** change
`policyHash` and does **not** need a weakening ack. A tree with no descriptions
is byte-for-byte as silent as today on Layers verdicts.

## Related

- Roadmap: Phase **LD** `LD01`–`LD06` (orders 232–237)
- ADR: [0035](../../adr/0035-layer-description-projection.md) accepted (`LD01`)
- Does not close: `Z09` / `K01`
