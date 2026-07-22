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

**arkgate@3.8.1** (current stable) installs a physically distinct exact TypeScript 6 analysis host
and reports required `complete | partial | unavailable` state, so project TypeScript 7 cannot
deduplicate away the JS-API fallback and incomplete analysis cannot satisfy plan or strict merge.
If you are still on **3.7.0 or earlier**, upgrade: that release predates the correction (package
managers could remove the fallback; unavailable `--plan --json` could report `goal.met: true`).
Keep the project's TypeScript/`tsc` unchanged; require `completeness: complete` from the final
strict check. See [typescript-support.md](typescript-support.md) and
[3.8.1 release notes](releases/3.8.1.md).

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
+ "arkgate": "^3.8.1"
```

`3.8.1` is the current stable version when this guide was updated; prefer `arkgate@latest` for a
fresh migration unless your repository intentionally pins an exact version.

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

Re-register the project MCP binding with the new bin:

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

The `@arkgate/runtime` lines show the intended package boundary, not a currently available npm
install: the companion is not yet present in the registry and the root release workflow does not
publish it. Verify with `npm view @arkgate/runtime dist-tags --json`; until a separate
experimental publication exists, migrate runtime imports only when evaluating a built local
`packages/runtime` source checkout. The `arkgate/eslint` migration is available now.

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
| TS7 plan/check says `partial` or `unavailable` | Do not accept the plan as green; upgrade to **arkgate@3.8.1** or later, then require `completeness: complete` |
| pnpm blocks new package age | Wait for cooling-off or prefer `arkgate@latest`; if policy requires an exact pin, check `npm view arkgate version` and pin that version (currently `arkgate@3.8.1`) |

---

## Why the rename

`ark-runtime-kernel` suggested a runtime framework. The product is the **architecture co-pilot / write+CI gate** for AI TypeScript. npm name is now **`arkgate`**.

Questions: [github.com/pedroknigge/arkgate](https://github.com/pedroknigge/arkgate)
