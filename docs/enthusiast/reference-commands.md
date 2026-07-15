# Reference: commands and artifacts

Product: **ArkGate** (`arkgate`). Prefer `arkgate` / `arkgate-check` / `arkgate-mcp`; aliases
`ark` / `ark-check` / `ark-mcp` work for one major. TypeScript 5–7: [typescript-support.md](../typescript-support.md).

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
arkgate-check --report out.html --beginner
arkgate-check --watch
```

## Contract transitions and complete changes (3.1+)

```bash
arkgate-check --strict-merge --policy-base-ref origin/main
arkgate preflight --changes changes.json --json
arkgate preflight --changes changes.json --change-map map.json --json
```

Strict merge blocks unacknowledged weaker or judgment-required policy changes. Preflight reads one
complete create/update/delete source batch without writing. An optional schema `1.0` map reports
structural convergence (`satisfied`, `missing`, `contradictory`, `unplanned`), never behavioral
completion. MCP equivalents: `ark_policy_delta`, `ark_prepare_change`. See
[configuration](../configuration.md) for hash-bound acknowledgements.

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
