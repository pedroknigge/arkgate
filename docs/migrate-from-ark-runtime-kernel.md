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

**arkgate@3.8.0+** (including **3.9.x** and **4.0.0**) installs a physically distinct exact TypeScript 6
analysis host and reports required `complete | partial | unavailable` state, so project TypeScript 7
cannot deduplicate away the JS-API fallback and incomplete analysis cannot satisfy plan or strict
merge. Prefer **`arkgate@latest`** once **4.0.0** is published, or pin the version you intend.
If you are still on **3.7.0 or earlier**, upgrade: that release predates the correction (package
managers could remove the fallback; unavailable `--plan --json` could report `goal.met: true`).
Keep the project's TypeScript/`tsc` unchanged; require `completeness: complete` from the final
strict check. See [typescript-support.md](typescript-support.md) and
[4.0.0 release notes](releases/4.0.0.md).

### 4.0.0 — root runtime forwarders removed (breaking)

Subpaths **`arkgate/runtime`** and **`arkgate/nestjs`** were **removed** in 4.0.0 (AR04).
**4.8.0 restores them as real extras** of package `arkgate` ([ADR 0031](adr/0031-one-package-extras-deprecate-companion.md)).
`@arkgate/runtime` is deprecated. Optional **ArkRules** (`arkRules` map + `arkrules/*.json`)
are additive and do not change inter-layer verdicts when absent.

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
+ "arkgate": "^4.0.0"
```

Prefer `arkgate@latest` for a fresh migration (after **4.0.0** publish), or pin an exact version intentionally.
Until 4.0.0 is on npm `latest`, the registry may still serve **3.9.2**.

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

The **ArkRun** kernel (`arkgate/runtime`) and Nest surfaces are currently **experimental**;
migrating the package name does not require adopting them. Prefer `createStrictArkKernel` (per
instance; no process-wide singleton). Static CLI/MCP enforcement remains the supported product path.

```diff
- import { createStrictArkKernelFromConfig } from 'ark-runtime-kernel';
+ import { createStrictArkKernelFromConfig } from 'arkgate/runtime';

- import { ArkModule } from 'ark-runtime-kernel/nestjs';
+ import { ArkModule } from 'arkgate/nestjs';

- import ark from 'ark-runtime-kernel/eslint';
+ import ark from 'arkgate/eslint';
```

From **4.8.0**, install `arkgate` and import `arkgate/runtime`. `@arkgate/runtime` is
deprecated. The `arkgate/eslint` migration is available now.

### ArkGate 4 / AR04 — root runtime forwarders removed

If you previously imported:

```ts
import { … } from 'arkgate/runtime';
import { … } from 'arkgate/nestjs';
```

those root subpaths were **gone in 4.0–4.7**. From **4.8.0** they are **real** extras of
package `arkgate` again ([ADR 0031](adr/0031-one-package-extras-deprecate-companion.md)).
`@arkgate/runtime` is deprecated:

```ts
import { … } from 'arkgate/runtime';
import { … } from 'arkgate/nestjs';
```

The stable gate (`arkgate` root, `arkgate/eslint`, CLIs, MCP, schemas) is unchanged. Gates need
no app runtime. Surface policy: [package-surface.md](package-surface.md).

If you only used the CLI + MCP (most projects), **no import changes**.

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
| TS7 plan/check says `partial` or `unavailable` | Do not accept the plan as green; upgrade to **arkgate@3.8.0** or later, then require `completeness: complete` |
| `Cannot find module 'arkgate/runtime'` after 4.0 and before 4.8 | That window used `@arkgate/runtime`. From **4.8.0** import `arkgate/runtime` again (real subpath, ADR 0031). |
| pnpm blocks new package age | Wait for cooling-off or prefer `arkgate@latest`; if policy requires an exact pin, check `npm view arkgate version` and pin that version |

---

## Why the rename

`ark-runtime-kernel` suggested a runtime framework. The product is the **architecture co-pilot / write+CI gate** for AI TypeScript. npm name is now **`arkgate`**.

Questions: [github.com/pedroknigge/arkgate](https://github.com/pedroknigge/arkgate)
