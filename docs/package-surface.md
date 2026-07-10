# ArkGate package surface policy

**Product wedge:** write gate · CI gate · co-pilot (plan / loop / skills).  
**Not the wedge:** the optional in-process runtime kernel.

**Public product site:** [arkgate.online](https://www.arkgate.online/) (promise + only flow).  
In-repo `docs/` remains the package/agent reference. Source: GitHub; distribution: npm.

This document is the consumer contract for **what is stable** vs **what is opt-in**.

---

## Stable surfaces (semver-supported)

| Surface | How you use it | Stability notes |
|---------|----------------|-----------------|
| **CLI** | `arkgate` / `arkgate-check` (aliases `ark` / `ark-check`) | Flags and human text may improve; **JSON output shapes** for `--json` (check, doctor, plan, coverage, recommend) are stable within a major. Additive fields OK; removals/renames are major. |
| **MCP tools** | `arkgate-mcp` / `ark://…` resources | Tool names and primary argument shapes are stable within a major. |
| **`ark.config.json`** | Layer globs, rules, include/exclude, forbiddenGlobals, intent prefixes, `peerIsolation`, `dynamicImportAllowlist`, `safety` thresholds | Schema fields documented in playbooks/examples are stable; new optional fields may appear. |
| **Agent skills** | `/ark-*` templates installed by `--install-agent-gates` | Skill *names* and “default flow” are stable; internal skill prose may evolve (e.g. explore dual-plan seed, day-zero origin order). |
| **ESLint subpath** | `arkgate/eslint` | Config-driven layer/import rules; loads consumer `ark.config.json`. |
| **GitHub Action** | `pedroknigge/arkgate` (see `action.yml`) | The `uses:` tag/SHA selects the checker source; `version` remains an optional exact npm compatibility override. |

Gates need **no application code imports**. Most projects only use the CLI + MCP + config.

---

## Opt-in surfaces

| Surface | Import path | Notes |
|---------|-------------|--------|
| **Runtime kernel** | **`arkgate/runtime`** (preferred) | Event bus, intents, policies, sagas, outbox, projections, `createArkKernel` / strict helpers. Optional. Not required for architecture enforcement. Built-in stores are **InMemory reference only** (not production durability) — see [production-hardening.md](./production-hardening.md). |
| **Root package barrel** | `arkgate` | Still re-exports the runtime kernel for **compatibility**. Prefer `arkgate/runtime` for new code. Root may be thinned in a future **major**. |
| **NestJS adapter** | `arkgate/nestjs` | Optional peer `@nestjs/common`. Wires a kernel into Nest DI. |

---

## Recommended imports

```ts
// Preferred — opt-in runtime kernel
import {
  createStrictArkKernel,
  createStrictArkKernelFromConfig,
} from 'arkgate/runtime';

// Still works this major (compat; not preferred for new code)
import { createStrictArkKernel } from 'arkgate';

// Nest adapter
import { ArkModule, InjectArk } from 'arkgate/nestjs';
```

See [production-hardening.md](./production-hardening.md) for runtime operational guidance.

---

## Explicitly unstable / internal

- `bin/lib/*` module layout and private helpers  
- Generated `bin/ark-layer-match.mjs` (edit canonical `src/domain/layerMatch.ts` only)  
- HTML report DOM structure (unless documented as a machine contract)  
- Internal MCP diagnostic fields not listed in agent-guide  

---

## Versioning summary

| Change | Version bump |
|--------|----------------|
| Break CLI JSON field, MCP tool rename, or required `ark.config` field | **major** |
| New optional config field, new CLI flag, additive JSON | **minor** |
| Bugfix with no contract change | **patch** |
| Prefer `arkgate/runtime` over root (docs only; root still exports) | **patch/minor** |
| Remove root kernel re-exports | **major** (with migration notes) |

---

## Release notes (maintainers)

Ship notes for a version live under [releases/](./releases/) (e.g. [2.12.0.md](./releases/2.12.0.md)).
Publish path: signed annotated tag → GitHub Release → `publish-npm.yml` (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
