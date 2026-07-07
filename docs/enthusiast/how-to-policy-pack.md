# How to apply an enthusiast policy pack

Policy packs are thin enthusiast variants over the same preset factories as `ark init --preset`.

## List packs

```bash
npx ark-check --list-policy-packs
npx ark-check --list-policy-packs --json
```

Available packs:

- `enthusiast-hexagonal`
- `enthusiast-layered`
- `enthusiast-feature-sliced`
- `enthusiast-monorepo`

## Apply

```bash
npx ark-check --apply-policy-pack enthusiast-hexagonal
npx ark-check --root . --config ark.config.json --strict-config
```

Use `--force` to overwrite an existing `ark.config.json`.

Monorepo packs detect workspace roots from `package.json` / `pnpm-workspace.yaml` the same way `--init --preset monorepo` does.

## Packs vs archetypes

| You know… | Start with |
|-----------|------------|
| Application shape (todo app, API, …) | `ark-check --recommend` → `ark init --archetype` |
| Preset name only | `--apply-policy-pack enthusiast-<preset>` |

`ark-adoption-plan.json` from `--write-plan` includes a suggested `policyPack` id matching the recommended preset.