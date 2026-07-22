# Reference: commands and artifacts

Product: **ArkGate** (`arkgate`). Prefer `arkgate` / `arkgate-check` / `arkgate-mcp`; aliases
`ark` / `ark-check` / `ark-mcp` work for one major. **arkgate@3.8.0+** supports packed project
TypeScript 5.9/6.0/7.0 with a physically distinct TypeScript 6 analysis host; published 3.7.0
predates that correction: [typescript-support.md](../typescript-support.md).

## Recommendation

```bash
arkgate-check --recommend [--json] [--write-plan]
# alias: ark-check …
```

MCP: `ark_recommend` — same JSON body.

## Adoption plan artifact

`ark-adoption-plan.json` — optional committed record. Fields:

- `archetype`, `preset`, `confidence`
- `phases` (`1` | `2` | `3` layer lists) and `adoptInOrder.phase1|phase2|phase3`
- `matchedSignals` — shape signals that drove the score
- `analogy`, `antiPatterns`, `why`
- `initCommand`, `firstCommand`, `recommendCommand`, `checkCommand`
- `galleryStarter`, `policyPack`

Never weakens the gate; JSON only.

## Policy packs

```bash
ark-check --list-policy-packs [--json]
ark-check --apply-policy-pack <id> [--force]
```

Pack metadata: `templates/policy-packs/enthusiast-*.json`.

## Init and verify

```bash
arkgate start --yes                    # read-only setup preview with non-interactive defaults
arkgate start --yes --apply            # apply exactly that preview
ark init --archetype <id> --yes        # alias path
arkgate-check --doctor [--json]
arkgate-check --coverage [--json]
arkgate-check --plan [--json]          # mechanical-safe vs judgment vs deferred
arkgate-check --strict-config
arkgate-check --strict-merge
arkgate preflight --changes changes.json [--change-map map.json] --json
arkgate-check --report out.html --beginner
arkgate-check --watch
```

In 3.1+, strict merge protects policy changes; preflight checks one complete batch without writing
(`--change-map` adds structural convergence). MCP: `ark_policy_delta`, `ark_prepare_change`.

## Analysis completeness

Current check envelopes use schema `1.3` and require `mode`, `completeness`, and
`completenessReasons`:

| Value | Meaning | Agent rule |
|-------|---------|------------|
| `complete` | All governed files were analyzed | A clean verdict may be trusted |
| `partial` | Governed parse diagnostics left evidence incomplete | Plan goal is false; strict merge fails |
| `unavailable` | No usable TypeScript analysis host | Plan goal is false; CLI exits `2` |

Doctor keeps the parse detail diagnostic, but never call a `partial` or `unavailable` result green.
Single-file lexical checks are always `partial`; use atomic preflight or the full check for a
resolved complete-candidate verdict.

## Plan classes (`--plan --json`)

| `class` | Agent may auto-apply? | Examples (`remediationKind`) |
|---------|----------------------|------------------------------|
| `mechanical-safe` | Yes (validate + rollback) | `type-only-import-move`, `pure-type-file-relocate`, `import-type-from-pure-type-module`, `import-type-of-type-exports` |
| `judgment` | No — propose | free value-import uses, multi-file ports, **W6 port-proof inject** (arity change), infra relocate, cycles |
| `deferred` | No | unclear shape |

## Violation JSON (enthusiast fields)

When present on violations:

- `fixClass` — e.g. `port-inversion`, `file-move`
- `effort` — `small` | `medium`
- `enthusiastHint` — plain English fix guidance
- plan enrichment: `class`, `remediationKind`, `typeOnly`, `sourcePureTypeModule`, `targetTypeOnlyExports`, `namedBindingsTypeOnly`
