# Threat model — ArkGate

**Scope:** architecture write/CI gates, agent hooks/MCP, and the experimental optional runtime.
**Not in scope:** full org identity platforms, browser XSS in consumer apps, or npm registry
infrastructure beyond how this package is published.

## Assets

| Asset | Why it matters |
|-------|----------------|
| `ark.config.json` contract | Defines what agents may import; weaken it → silent architectural debt |
| Write hook (`arkgate-mcp --hook`) | Hard local boundary only for installed/trusted Claude/Grok hook operations |
| CI `ark-check --strict-merge` | Repository check for every host; merge blocking requires a required status |
| Baselines (`.ark-baseline.json`) | Freezes debt; abuse silences real violations |
| Published npm tarball + Action SHA | Supply-chain integrity of the gate itself |
| Experimental runtime kernel | Event/saga state; InMemory is not durable |

## Actors

- **AI agent** (Claude / Cursor / Codex / Grok) with tool write access; see the
  [canonical host support matrix](../README.md#host-enforcement-support)
- **Human developer** editing files outside hooks (IDE, git apply)  
- **CI runner** on PRs / main  
- **Maintainer / attacker** with publish or PR privileges  

## Threats (STRIDE-light)

| ID | Threat | Impact | Mitigations (shipped) |
|----|--------|--------|------------------------|
| T1 | Agent bypasses hook (direct `fs` / alternate tool) | Ungoverned code lands | CI gate; optional pre-commit (Q3); doctor ladder never upgrades installed files to active/hard proof |
| T2 | Human commits without agent path | Same as T1 | `templates/hooks/pre-commit-ark`; branch protection + required check (Q3 external) |
| T3 | CI job missing / not required | Merge green without architecture | doctor `enforcement-ci-*` gaps; `--strict-merge`; required-status remains locally `unverified` |
| T4 | Config weakened (`peerIsolation: false`, empty rules) | False green | semantic policy-delta guard in strict merge; hash-bound explicit acknowledgement; present-state safety diagnostics |
| T5 | Baseline ratcheted open | Debt reintroduced | baseline unused/stale signals; occurrence keys |
| T6 | Dual MCP bin / wrong root | Gate points at wrong tree | migrate-commands; Codex fail-closed temp roots |
| T7 | Malicious dependency in publish | Compromised gate | signed tags, npm provenance, dependency-review, CodeQL, Semgrep, `verify-package-files` |
| T8 | Path traversal in hooks/check | Read/write outside project | root resolution + under-root import resolve |
| T9 | Runtime InMemory mistaken for durable | Data loss | durability stance docs + safety InMemory production detector |
| T10 | Repair payload silently applied | Unexpected rewrites | repair never writes; host must re-inject; exit 2 on deny |
| T11 | Prompt context is mistaken for enforcement | Verdict changes after compaction or missing skills | contract/tree inputs only; no-context eval compares hashes and adapter evidence |
| T12 | Partial multi-file hook validation misses a cross-file edge | Invalid batch reaches disk | complete `apply_patch` events use atomic preflight; incomplete/bypassable paths rely on CI |

## Trust boundaries

```
Claude/Grok host --PreToolUse--> arkgate-mcp (hard only for observed covered operation)
Codex ApplyPatch  --PreToolUse--> arkgate-mcp (atomic feedback; bypassable/non-hard host profile)
Any MCP host     --tool call----> arkgate-mcp (advisory validation)
Human IDE        --disk/git-----> working tree
working tree     --PR-----------> CI ark-check --strict-merge
npm publish <-- signed tag ---  GitHub Release + provenance
```

## Residual risk (accepted)

- Branch protection is **external GitHub state** — doctor reports honestly when unavailable.  
- External adoption and independent-audit evidence are release snapshots bound to pinned commits;
  they do not prove every repository layout or future host version.
- Live multi-agent loop-cost remains optional (`ARK_EVAL_LOOP_LIVE`).

## Verification hooks

| Check | Command |
|-------|---------|
| Package allowlist | `node scripts/verify-package-files.mjs` |
| Module budgets | `node scripts/check-module-budgets.mjs` |
| Security CI | `.github/workflows/security.yml` |
| Audit (prod deps) | `npm run security:audit` |
| Architecture | `npm run check:architecture` |
