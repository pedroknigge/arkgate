# Reference: commands and artifacts

## Recommendation

```bash
ark-check --recommend [--json] [--write-plan]
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
ark init --archetype <id> --yes
ark-check --doctor [--json]
ark-check --coverage [--json]
ark-check --strict-config
ark-check --report out.html --beginner
ark-check --watch
```

## Violation JSON (enthusiast fields)

When present on violations:

- `fixClass` — e.g. `port-inversion`, `file-move`
- `effort` — `small` | `medium`
- `enthusiastHint` — plain English fix guidance