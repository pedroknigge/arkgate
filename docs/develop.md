# Develop with ArkGate

For **developers** integrating ArkGate into a product repo: agents, CI, config, brownfield, and power tools.

If you only want the happy path, start at [use.md](use.md).

---

## Default integration

```bash
npm install -D arkgate typescript
npx arkgate start --apply
npx arkgate-check --doctor
```

Make the architecture check a **required** merge status (GitHub/GitLab/etc.):

```yaml
- run: npx arkgate-check --root . --config ark.config.json --strict-merge
# or: uses: pedroknigge/arkgate@<tag-or-SHA>
```

`--strict-merge` (or compatibility `--strict`) is the repository-wide hard boundary for every agent host.

---

## Host write path (honesty)

Local write hardness **differs by host**. CI required status is the shared hard merge gate.

| Host | Local write | MCP | Merge |
|------|-------------|-----|-------|
| Claude · Grok · Antigravity | Hard PreToolUse when installed + trusted | Advisory | Required status |
| Codex · OpenCode | Best-effort / advisory | Advisory | Required status |
| Cursor | Advisory only | Advisory | Required status |

Full matrix and install commands: [ai-gates.md](ai-gates.md) · canonical table in [README](../README.md#host-enforcement-support).

```bash
# All common hosts (examples)
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok
npx arkgate-check --install-agent-gates --tools antigravity   # alias: agy
npx arkgate-check --install-agent-gates --tools opencode
# Full /ark-* skill pack (optional expert depth)
npx arkgate-check --install-agent-gates --skills-only --force
```

Doctor reports what is actually installed and observed (`writePath` / enforcement state). Installed files alone do not imply `hard:true` without runtime evidence where the product requires it.

---

## Contract and placement

| Concern | Doc / tool |
|---------|------------|
| Layers, rules, globs | [configuration.md](configuration.md) · `ark.config.json` |
| Stable package API | [package-surface.md](package-surface.md) |
| Where new code goes | MCP `ark_place` · skill `/ark-place` |
| Preflight multi-file change | MCP `ark_prepare_change` · `ark preflight --changes …` |
| Write snippet preflight | MCP `ark_prepare_write` |

Prefer prepare/preflight before the host commits disk. Mechanical-safe patches only for proven kinds; judgment stays explicit.

---

## Brownfield and Shape

Existing messy trees: [brownfield-adoption.md](brownfield-adoption.md).

Phases in short:

1. **Align** — contract matches reality (not false green)  
2. **Stabilize** — baseline freezes real debt; ratchet only new violations  
3. **Shape** — design residual (plan B), one pilot at a time, never silent codemod  

Sensors:

```bash
npx arkgate-check --plan
npx arkgate-check --coverage
npx arkgate-check --doctor --json
```

Agent reference (tools, skills, dual path): [agent-guide.md](agent-guide.md).

---

## TypeScript boundary

Project TypeScript 5 / 6 / 7: [typescript-support.md](typescript-support.md).  
Incomplete analysis (`partial` / `unavailable`) cannot satisfy plan or strict merge.

---

## Common power commands

```bash
npx arkgate start --tools <host> --apply
npx arkgate-check --doctor --json
npx arkgate-check --plan --json
npx arkgate-check --coverage
npx arkgate-check --baseline
npx arkgate preflight --changes changes.json --json
npx arkgate upgrade --json          # managed content preview
npx arkgate upgrade --apply
```

---

## Optional experimental runtime

Gates need **no** runtime kernel. `@arkgate/runtime` is experimental, separate package, not the day-zero product. See [package-surface.md](package-surface.md) and [production-hardening.md](production-hardening.md).

---

## Migrate from `ark-runtime-kernel`

Same product, new package name: [migrate-from-ark-runtime-kernel.md](migrate-from-ark-runtime-kernel.md).

---

## Improve the library

If you are changing ArkGate itself (not just adopting it): [CONTRIBUTING.md](../CONTRIBUTING.md).

← [All docs](README.md) · [Use path](use.md)
