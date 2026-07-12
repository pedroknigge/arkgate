# Migrate from `ark-runtime-kernel` → **ArkGate** (`arkgate`)

**Same product.** Only the npm name and primary CLI names changed.
Config, baselines, and `/ark-*` skills stay.

| | Before | After |
|--|--------|--------|
| Package | `ark-runtime-kernel` | **`arkgate`** |
| Product name | Ark | **ArkGate** |
| Check CLI | `ark-check` | **`arkgate-check`** (alias `ark-check` still works) |
| MCP CLI | `ark-mcp` | **`arkgate-mcp`** (alias `ark-mcp` still works) |
| Setup CLI | `ark` | **`arkgate`** (alias `ark` still works) |
| Config | `ark.config.json` | **unchanged** |
| Baseline | `.ark-baseline.json` | **unchanged** |
| Skills | `/ark-autopilot`, … | **unchanged** |
| GitHub | `pedroknigge/ark-runtime-kernel` | **`pedroknigge/arkgate`** (old URL redirects) |

---

## Fast path (recommended)

```bash
# 1) Swap the dependency
npm uninstall ark-runtime-kernel
npm install -D arkgate
# pnpm: pnpm remove ark-runtime-kernel && pnpm add -D arkgate
# yarn: yarn remove ark-runtime-kernel && yarn add -D arkgate

# 2) Refresh gates, skills, MCP templates
npx arkgate-check --install-agent-gates --force

# 3) Verify
npx arkgate-check --doctor
npx arkgate-check --root . --config ark.config.json --strict-config
```

One-liner if the old bin is still on the path after installing `arkgate`:

```bash
npx arkgate upgrade
```

(`ark upgrade` works too — both install `arkgate@latest` and refresh gates.)

### TypeScript 7

If the project uses **TypeScript 7** as `tsc`, the gate still works: ArkGate embeds a JS-API
TypeScript host and falls back when `require('typescript')` is version-only. See
[typescript-support.md](typescript-support.md). Optional dual-install (TS 6 for tools + TS 7
CLI) is documented there.

### MCP args (avoid double binary)

`.mcp.json` / `.cursor/mcp.json` must look like:

```json
"args": ["arkgate-mcp", "--root", ".", "--config", "ark.config.json"]
```

**Not** `["ark-mcp", "arkgate-mcp", …]` — that breaks MCP stdio. Fixed by
`npx arkgate-check --install-agent-gates --migrate-commands` (ArkGate ≥ 2.4.0).

---

## What to change in your repo

### `package.json`

```diff
- "ark-runtime-kernel": "^2.0.1"
+ "arkgate": "^2.1.0"
```

Scripts:

```diff
- "check:architecture": "ark-check --root . --config ark.config.json --strict-config"
+ "check:architecture": "arkgate-check --root . --config ark.config.json --strict-config"
```

(`ark-check` still works as a compat alias for one major.)

### CI / GitHub Actions

```diff
- run: npx ark-check --root . --config ark.config.json --strict-config
+ run: npx arkgate-check --root . --config ark.config.json --strict-config
```

Composite action:

```diff
- uses: pedroknigge/ark-runtime-kernel@main
+ uses: pedroknigge/arkgate@main
```

### MCP (Claude / Cursor / `.mcp.json`)

```json
{
  "mcpServers": {
    "ark": {
      "command": "npx",
      "args": ["arkgate-mcp", "--root", ".", "--config", "ark.config.json"]
    }
  }
}
```

Then restart the agent / reload MCP.

### Codex

Re-register so home MCP points at this project with the new bin:

```bash
npx arkgate-check --install-agent-gates --tools codex --force
# optional home skills:
npx arkgate-check --install-agent-gates --codex-home --force
```

### Grok

```bash
npx arkgate-check --install-agent-gates --tools grok --force
```

Or edit `.grok/config.toml` → `args` use `arkgate-mcp`.

### TypeScript imports (runtime / Nest / ESLint only)

The runtime and Nest surfaces are currently **experimental**; migrating the package name does not
require adopting them. Static CLI/MCP enforcement remains the supported product path.

```diff
- import { createStrictArkKernelFromConfig } from 'ark-runtime-kernel';
+ import { createStrictArkKernelFromConfig } from '@arkgate/runtime';

- import { ArkModule } from 'ark-runtime-kernel/nestjs';
+ import { ArkModule } from '@arkgate/runtime/nestjs';

- import ark from 'ark-runtime-kernel/eslint';
+ import ark from 'arkgate/eslint';
```

If you only used the CLI + MCP (most projects), **no import changes**.  
Surface policy: [package-surface.md](package-surface.md).

---

## What you can ignore

- Renaming `ark.config.json` — not required  
- Renaming `/ark-*` skills — not required  
- Re-running full adopt/architect — not required unless you want a fresh plan  

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `npm warn deprecated ark-runtime-kernel` | Swap dep to `arkgate` (this guide) |
| `ark-check: not found` after uninstall | Use `npx arkgate-check` or reinstall `arkgate` |
| MCP still launches old package | Update `.mcp.json` / Codex / Grok config; restart agent |
| pnpm blocks new package age | Wait for cooling-off or pin exact version `arkgate@2.1.0` |

---

## Why the rename

`ark-runtime-kernel` suggested a runtime framework. The product is the **architecture co-pilot / write+CI gate** for AI TypeScript. npm name is now **`arkgate`**.

Questions: [github.com/pedroknigge/arkgate](https://github.com/pedroknigge/arkgate)
