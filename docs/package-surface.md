# ArkGate package surface policy

**Product wedge:** write gate · CI gate · co-pilot (plan / loop / skills).  
**Not the wedge:** the optional in-process runtime kernel.

**Public product site:** [arkgate.online](https://www.arkgate.online/) (promise + only flow).
In-repo `docs/` remains the package/agent reference. Source: GitHub; distribution: npm.

This document is the consumer contract for **what is stable** vs **what is experimental**.

---

## Stable surfaces (semver-supported)

| Surface | How you use it | Stability notes |
|---------|----------------|-----------------|
| **CLI** | `arkgate` / `arkgate-check` (aliases `ark` / `ark-check`) | Flags and human text may improve; **JSON output shapes** for `--json` (check, doctor, plan, coverage, recommend) are stable within a major. Additive fields OK; removals/renames are major. |
| **Doctor design fitness (P02+)** | `ark-check --doctor --json` → `doctor.designFitness`, `doctor.designSmells[]` | Additive. Stable smell `id`s: `io-under-application`, `handler-in-persistence`, `god-module`, `domain-logic-in-ui`, `facade-sql-in-routes`, `mixed-pattern-cluster`, `soft-contract`. Each smell has `evidence[]` paths and `fix`. Does **not** fail the gate by itself. |
| **Plan pattern B (P03+)** | `ark-check --plan --json` → `plan.patternBets[]`, `plan.goal.designWeak` | Additive. Each bet: `id`, `smellId`, `pilot`, `evidence`, `successSignal`, `killSwitch`, **`neverMechanicalSafe: true`**, `class: "judgment"`. **Never** auto-applied by loop/autoPatch; not a `remediationKind` mechanical-safe. `goal.met` remains edge honesty only. |
| **MCP tools** | `arkgate-mcp` / `ark://…` resources | Tool names and primary argument shapes are stable within a major. |
| **`ark.config.json`** | Layer globs, rules, include/exclude, forbiddenGlobals, intent prefixes, `peerIsolation`, `dynamicImportAllowlist`, `safety` thresholds | Versioned by `schemaVersion`; unknown fields fail closed and migrations preserve the previous supported major. |
| **`arkgate/schema/analysis-result`** | Public CLI/MCP/hook diagnostic envelope (`schemaVersion`, `valid`, `diagnostics`) | Versioned JSON Schema; committed v1 compatibility fixture protects rule, severity, location, and evidence fields. |
| **Config JSON Schema** | `arkgate/schema` or `arkgate/schema/ark.config.schema.json` | Stable package resource subpaths for editor completion and contract tooling. |
| **Agent skills** | `/ark-*` templates installed by `--install-agent-gates` | Skill *names* and “default flow” are stable; internal skill prose may evolve (e.g. explore dual-plan seed, day-zero origin order). |
| **ESLint subpath** | `arkgate/eslint` | Config-driven layer/import rules; loads consumer `ark.config.json`. |
| **GitHub Action** | `pedroknigge/arkgate` (see `action.yml`) | The `uses:` tag/SHA selects the checker source; `version` remains an optional exact npm compatibility override. |

Gates need **no application code imports**. Most projects only use the CLI + MCP + config.

---

## Experimental opt-in surfaces

These APIs are shipped for evaluation and compatibility, but they are **not production-ready
product claims**. Static architecture enforcement does not depend on them.

| Surface | Import path | Notes |
|---------|-------------|--------|
| **Runtime kernel** | **`@arkgate/runtime`** | Separate 0.x package, published under the `experimental` tag. Event bus, intents, policies, sagas, event buffer, projections, and strict helpers. Built-in stores are **InMemory reference only**. |
| **Runtime migration shim** | `arkgate/runtime` | Deprecated forwarder to `@arkgate/runtime`; contains no implementation and is removed in ArkGate 4. |
| **NestJS adapter** | `@arkgate/runtime/nestjs` | Experimental optional peer `@nestjs/common`; the deprecated `arkgate/nestjs` path forwards here. |

---

## Recommended imports

```ts
// Preferred path when evaluating the experimental runtime kernel
import { createStrictArkKernel, createStrictArkKernelFromConfig } from '@arkgate/runtime';

// Nest adapter
import { ArkModule, InjectArk } from '@arkgate/runtime/nestjs';
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
| Break CLI JSON field, MCP tool rename, or required `ark.config` field | **major** |
| New optional config field, new CLI flag, additive JSON | **minor** |
| Bugfix with no contract change | **patch** |
| Additive experimental runtime API | `@arkgate/runtime` prerelease/minor |
| Remove deprecated `arkgate/runtime` forwarding shim | ArkGate **4.0** |

---

## Release notes (maintainers)

Ship notes for a version live under [releases/](./releases/) (e.g. [2.12.0.md](./releases/2.12.0.md)).
Publish path: signed annotated tag → GitHub Release → `publish-npm.yml` (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
