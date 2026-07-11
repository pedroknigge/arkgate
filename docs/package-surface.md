# Structrail package surface policy

**Product wedge:** write gate · CI gate · co-pilot (plan / loop / skills).  
**Not the wedge:** the optional in-process runtime kernel.

In-repo `docs/` is the package/agent reference; distribution is npm. A public Structrail
domain is not advertised until the external-cutover gate is complete.

This document is the consumer contract for **what is stable** vs **what is experimental**.

---

## Stable surfaces (semver-supported)

| Surface | How you use it | Stability notes |
|---------|----------------|-----------------|
| **CLI** | `structrail` / `structrail-check` | Flags and human text may improve; **JSON output shapes** for `--json` (check, doctor, plan, coverage, recommend) are stable within a major. Additive fields OK; removals/renames are major. |
| **MCP tools** | `structrail-mcp` / `structrail://…` resources | Tool names and primary argument shapes are stable within a major. |
| **`structrail.config.json`** | Layer globs, rules, include/exclude, forbiddenGlobals, intent prefixes, `peerIsolation`, `dynamicImportAllowlist`, `safety` thresholds | Schema fields documented in playbooks/examples are stable; new optional fields may appear. |
| **Agent skills** | `/structrail-*` templates installed by `--install-agent-gates` | Skill *names* and “default flow” are stable; internal skill prose may evolve (e.g. explore dual-plan seed, day-zero origin order). |
| **ESLint subpath** | `structrail/eslint` | Config-driven layer/import rules; loads consumer `structrail.config.json`. |
| **GitHub Action** | Repository `action.yml` | The `uses:` tag/SHA selects the checker source; `version` remains an optional exact npm compatibility override. |

Gates need **no application code imports**. Most projects only use the CLI + MCP + config.

<!-- legacy-identity:start v3-compatibility -->
### Deprecated v3 compatibility

The separate `arkgate@3` wrapper retains the v2 imports, six `arkgate*`/`ark*` bins,
`ark.config.json`, `ARK_*`, `ark://…`, `ark_*`, and `/ark-*` for all of v3. Those names are
compatibility-only and have a removal target no earlier than v4. See the
[migration guide](./migrations/arkgate-to-structrail.md).
<!-- legacy-identity:end -->

---

## Experimental opt-in surfaces

These APIs are shipped for evaluation and compatibility, but they are **not production-ready
product claims**. Static architecture enforcement does not depend on them.

| Surface | Import path | Notes |
|---------|-------------|--------|
| **Runtime kernel** | **`structrail/runtime`** (preferred) | Experimental event bus, intents, policies, sagas, outbox, projections, and strict helpers. Not required for architecture enforcement. Built-in stores are **InMemory reference only** (not production durability) — see [production-hardening.md](./production-hardening.md). |
| **Root package barrel** | `structrail` | Still re-exports the experimental runtime kernel for **compatibility**. Prefer `structrail/runtime` when evaluating it. Root may be thinned in a future **major**. |
| **NestJS adapter** | `structrail/nestjs` | Experimental optional peer `@nestjs/common`; wires a kernel into Nest DI. |

---

## Recommended imports

```ts
// Preferred path when evaluating the experimental runtime kernel
import {
  createStrictStructrailKernel,
  createStrictStructrailKernelFromConfig,
} from 'structrail/runtime';

// Still works this major (compat; not preferred for new code)
import { createStrictStructrailKernel } from 'structrail';

// Nest adapter
import { StructrailModule, InjectStructrail } from 'structrail/nestjs';
```

See [production-hardening.md](./production-hardening.md) for requirements an eventual
production deployment would need to satisfy; it is not a readiness certification.

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
| Break CLI JSON field, MCP tool rename, or required `structrail.config` field | **major** |
| New optional config field, new CLI flag, additive JSON | **minor** |
| Bugfix with no contract change | **patch** |
| Prefer `structrail/runtime` over root (docs only; root still exports) | **patch/minor** |
| Remove root kernel re-exports | **major** (with migration notes) |

---

## Release notes (maintainers)

Ship notes for a version live under [releases/](./releases/) (e.g. [2.12.0.md](./releases/2.12.0.md)).
Publish path: signed annotated tag → GitHub Release → `publish-npm.yml` (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
