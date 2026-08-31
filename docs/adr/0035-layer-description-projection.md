# ADR 0035: Layer description projection

- **Status:** Accepted (`LD01`)
- **Date:** 2026-08-31
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase LD / LD01 — project existing
  `layers[].description` as an app-context caption; strip it from
  `policyHash`; do not enforce absence
  ([plan](../plans/layer-description-projection/README.md))
- **Amends:** none. Extends the `stewards` strip in
  `effectiveContractPolicyPayload` to `layers[].description` (LD02
  implements). Does not add a schema key
- **Does not amend:** ADR 0026 waist; ADR 0015 no new skill names; no
  `schemaVersion` bump. Does **not** close `K01` / `Z09`

## Context

The contract already has the atom the product asked for:

```json
"layers": [{ "name": "Application", "patterns": ["src/application/**"], "description": "Purchase requests — from asked to received." }]
```

Measured against `src/domain/` and `schemas/`, not from memory:

- optional field: `src/domain/configTypes.ts` `description?: string`
- schema: `configContract.ts` `$defs.layer.properties.description` (`minLength: 1`)
- kernel copies it: `ArchitectureProfile.ts` `description: layer.description`
- HTML report already shows it (or fallback / —)
- policy-pack blurbs stay in `templates/policy-packs/*/layerDescriptions`
- `policyHash` includes the string; `stewards` is the only strip today
  (`effectiveContractPolicyPayload`)

What is missing is the *use*:

| Surface | Today |
|---------|-------|
| `ark.config.json` | Field accepted |
| HTML report | Shown (or fallback / —) |
| `ark_place` / prepare-write / MCP | Not in the placement JSON |
| doctor / coverage / status | Not a folder caption |
| Skills adopt / place | Glossary is process; they do not write or read the field with teeth |
| `docs/configuration.md` | Does not name `layers[].description` |
| `policyHash` | Includes the string |

A consumer can write the caption and an agent still locates files as if the
folder were only a glob. Changing “pedidos In Contract” to a typo fix is a
**policy-hash change**. That is caption wearing import-rule teeth.

The grain is the **layer** (one slow phrase per house), not each file.

## Decisions

### D1 — Reuse `layers[].description`

Do not add `purpose`, `caption`, `folderBlurb`, or `include[].note` in this
epic. One key. The optional string already exists; `minLength: 1` when the
key is written stays.

### D2 — Copy is app context

The sentence is what this folder is *in the product*, not architecture
jargon. Preset generics may stay as fallback; adopt prefers glossary /
product map.

### D3 — Absence is silent

Missing `description` never fails `--strict-config`, never invents doctor
residual, never flips `valid`. Empty string is invalid JSON for the field.
A tree with no descriptions stays as silent as today on Layers verdicts.

### D4 — Strip from `policyHash` like `stewards`

`effectiveContractPolicyPayload` omits `layers[].description` the same way
it omits `stewards`. A caption-only edit is **neutral** and does not need a
weakening ack. Import rules stay the teeth.

### D5 — Project, do not enforce

`ark_place` / prepare-write / MCP place JSON, doctor JSON + human, coverage
JSON, HTML report (already). Status may carry a thin copy. Never a score.
Never a second verdict
([ADR 0026](0026-gate-waist-facts-in-verdict-out.md)).

### D6 — Adopt writes; place reads

Session 0 (`/ark-adopt`) fills `description` when the product map or
glossary names the house. `/ark-place` prints it next to layer + globs. No
new skill names. No LLM filler.

### D7 — Not per file

Not per directory except as the layer that owns those globs. Monorepo
package roots are later (`include[].note`) — out of this epic.

### D8 — Compact starter may omit the field

`ark start` and compact starters may omit `description`. Policy-pack
`layerDescriptions` stay valid. This mother 4-layer config may add captions
only if they describe *this library*, not a consumer app.

## Names this ADR requires (and forbids)

Required public name: existing `layers[].description`. No new key. No
`schemaVersion` bump.

Forbidden: `purpose`, `caption`, `folderBlurb`, `include[].note` (this
epic), `/ark-describe`, a 14th skill name, residual or fail-closed when
the field is missing, caption as merge teeth or weakening, treating a
caption-only edit as a policy change.

## Consequences

- LD02–LD06 implement these decisions. LD01 is plan lock — no adapter,
  source, schema, or test changes.
- Public sentence after LD06: a consumer writes one sentence per layer in
  `ark.config.json`. `/ark-place` returns that sentence next to the layer
  name and globs. Doctor and the HTML report show the same text. Changing
  the sentence does **not** change `policyHash` and does **not** need a
  weakening ack.
- Target additive **`arkgate@4.8.7`** over published **4.8.6**. This ADR
  does not claim 4.8.7 published.

## Alternatives considered

| Option | Why not |
|--------|---------|
| New key (`purpose` / `caption` / `folderBlurb`) | Field already exists; second source of truth |
| Keep description in `policyHash` | Caption-only edit looks like weakening |
| Fail closed when missing | Compact starter and brownfield become residuals |
| `/ark-describe` skill | Skill-name freeze ([ADR 0015](0015-arkrules-migration-skills.md)) |
| Per-file or per-directory notes | Grain is the layer; `include[].note` is later |

## Related

- Waist: [ADR 0026](0026-gate-waist-facts-in-verdict-out.md)
- Skills: [ADR 0015](0015-arkrules-migration-skills.md)
- Plan: [layer-description-projection](../plans/layer-description-projection/README.md)
