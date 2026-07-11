# Reference: commands and artifacts

Product: **Structrail** (`structrail`). Commands: `structrail`, `structrail-check`, and `structrail-mcp`.
TypeScript 5–7: [typescript-support.md](../typescript-support.md).

## Recommendation

```bash
structrail-check --recommend [--json] [--write-plan]
```

MCP: `structrail_recommend` — same JSON body.

## Adoption plan artifact

`structrail-adoption-plan.json` — optional committed record. Fields:

- `archetype`, `preset`, `confidence`
- `phases` (`1` | `2` | `3` layer lists) and `adoptInOrder.phase1|phase2|phase3`
- `matchedSignals` — shape signals that drove the score
- `analogy`, `antiPatterns`, `why`
- `initCommand`, `firstCommand`, `recommendCommand`, `checkCommand`
- `galleryStarter`, `policyPack`

Never weakens the gate; JSON only.

## Policy packs

```bash
structrail-check --list-policy-packs [--json]
structrail-check --apply-policy-pack <id> [--force]
```

Pack metadata: `templates/policy-packs/enthusiast-*.json`.

## Init and verify

```bash
structrail start --yes                    # guided setup + plan
structrail init --archetype <id> --yes
structrail-check --doctor [--json]
structrail-check --coverage [--json]
structrail-check --plan [--json]          # mechanical-safe vs judgment vs deferred
structrail-check --strict-config
structrail-check --report out.html --beginner
structrail-check --watch
```

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
