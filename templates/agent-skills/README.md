# ArkGate Agent Skills package

> **Generated layout (ACS05).** Do not edit SKILL.md files here by hand.
> Author skill bodies in `templates/skills/<name>.md`, then run
> `npm run generate:agent-skills`. Drift: `npm run check:agent-skills`.

This directory is the **Agent Skills–compatible** packaging of the same **13**
`/ark-*` skills shipped as flat templates for Ark install. **No new skill names.**

Package version when last generated context: **arkgate@4.7.2**
Schema: agent-skills package contract `1.0`

## Skills (frozen catalog)

- `ark-adopt`
- `ark-architect`
- `ark-autopilot`
- `ark-contract`
- `ark-coverage`
- `ark-explain`
- `ark-explore`
- `ark-fix`
- `ark-loop`
- `ark-place`
- `ark-runtime`
- `ark-think`
- `ark-upgrade`

## Install — Ark (host write path + skill catalogs)

Preferred when you also want hooks/MCP/CI wiring:

```bash
npx ark-check --install-agent-gates --skills-only --force
# or full host install (hooks + MCP + skills):
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok,antigravity,opencode
```

## Install — skills ecosystem (`npx skills`)

From this package directory (checkout or `node_modules/arkgate`):

```bash
# Local path (after npm install arkgate, or from a git checkout)
npx skills add ./templates/agent-skills
# or:
npx skills add ./node_modules/arkgate/templates/agent-skills

# GitHub tree (Agent Skills package root)
npx skills add https://github.com/pedroknigge/arkgate/tree/main/templates/agent-skills

# List without installing
npx skills add ./templates/agent-skills --list
```

Skills are **process** depth (host judgment + routing). They are **not** enforcement.
Enforcement is `ark-check` / host write hooks / required CI (`--strict-merge`).

See [docs/agent-guide.md](../../docs/agent-guide.md#install-skills-ark-and-ecosystem).
