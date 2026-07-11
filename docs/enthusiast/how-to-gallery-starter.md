# How to use a gallery starter

Gallery starters are minimal phase-1 scaffolds with a passing `structrail-check --strict-config`.

## Copy a starter

```bash
cp -R path/to/structrail/examples/crud-product-starter/. .
npm install
npm run check
```

Pick by archetype — see [examples/README.md](../../examples/README.md).

## When to use a starter vs hexagonal-order-api

| Need | Use |
|------|-----|
| Fast baseline layout | `*-starter/` gallery |
| Runnable API + break exercises | `hexagonal-order-api/` |

## After copying

1. Run `structrail-check --doctor`
2. Install gates: `structrail-check --install-agent-gates`
3. Use `/structrail-place` for new files
4. Optionally commit `structrail-adoption-plan.json` from `--write-plan` alongside `structrail.config.json`
