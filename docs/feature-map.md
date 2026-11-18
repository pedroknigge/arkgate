# ArkGate feature map

`docs/feature-map.json` is the map the driver runs. Each feature has `reach` (command, hook, or skill) and `proofs` (fixture, command, expected signal).

Hand recipes for the same ids are in `.cursor/skills/verify-arkgate/features/`.

```bash
node .cursor/skills/verify-arkgate/verify.mjs
```

Paste the report under `## Evidence` in the pull request.

| Feature | How you reach it | What proves it |
| --- | --- | --- |
| core-gate | `arkgate-check --strict-merge`, host `arkgate-mcp --hook`, `/ark-autopilot` | New `Date.now()` write on `eval/cases/domain-forbidden-global` exits 2 with `FORBIDDEN_GLOBAL`. After gate install, `--strict-merge` exits 1 with `FORBIDDEN_GLOBAL`. |
| start | `arkgate start`, `arkgate start --apply`, `/ark-adopt` | Preview of that fixture with the rules file removed prints `create ark.config.json` and leaves the file absent. Apply with `--skip-package-manager` writes `ark.config.json`. |
| doctor | `arkgate-check --doctor` | Same fixture. Exit 0. Output contains `Ark doctor` and `Governed:`. |
| coverage | `arkgate-check --coverage`, `/ark-coverage` | `--coverage --json` exits 0 and contains `"percent": 100`. |
| recommend | `arkgate-check --recommend`, `/ark-adopt` | `--recommend --json` exits 0 and contains `"archetype":`. |
| arkrules | `arkgate-check`, `/ark-contract` | `tests/fixtures/arkrules-poc-enforcement` with `Order.bad.ts` renamed to `Order.ts` exits 1 with `ARKRULE_STRUCTURE` and `aggregate-private-state`. |
| arkrun | `arkgate-check`, `/ark-runtime` | `tests/fixtures/arkrun-sensors/kernel-in-domain` exits 1 with `ARKRUN_KERNEL_IN_DOMAIN`. |
| arkorder | `arkgate-check`, `/ark-order` | `tests/fixtures/arkorder-skip-corpus/trees/xi-field-write` plus the enforced contract exits 1 with `ARKORDER_XI_FIELD_WRITE`. |
| host-hooks | `arkgate-check --install-agent-gates --tools claude,cursor,codex,grok,antigravity,opencode` | Temp copy. Claude, Cursor, Codex, Grok, and Antigravity files contain `--hook`. Cursor has `"failClosed": true`. `opencode.json` contains `arkgate-mcp` and no `--hook`. |
| mcp | `arkgate-mcp`, then `validate_code` | Initialize returns `"name":"arkgate"`. `validate_code` on a new domain `Date.now()` file returns `FORBIDDEN_GLOBAL`. |
| skills | `arkgate-check --install-agent-gates --skills-only` | Temp copy writes `.agents/skills/ark-adopt`, `ark-runtime`, and `ark-order`. Adopt's file contains `arkgate@`. |
