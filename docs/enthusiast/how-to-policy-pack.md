# How to apply an enthusiast policy pack

Policy packs are thin enthusiast variants over the same preset factories as `structrail init --preset`.

## List packs

```bash
npx structrail-check --list-policy-packs
npx structrail-check --list-policy-packs --json
```

Available packs:

- `enthusiast-hexagonal`
- `enthusiast-layered`
- `enthusiast-feature-sliced`
- `enthusiast-monorepo`

## Apply

```bash
npx structrail-check --apply-policy-pack enthusiast-hexagonal
npx structrail-check --root . --config structrail.config.json --strict-config
```

Use `--force` to overwrite an existing `structrail.config.json`.

Monorepo packs detect workspace roots from `package.json` / `pnpm-workspace.yaml` the same way `--init --preset monorepo` does.

## Packs vs archetypes

| You know… | Start with |
|-----------|------------|
| Application shape (todo app, API, …) | `structrail-check --recommend` → `structrail init --archetype` |
| Preset name only | `--apply-policy-pack enthusiast-<preset>` |

`structrail-adoption-plan.json` from `--write-plan` includes a suggested `policyPack` id matching the recommended preset.
