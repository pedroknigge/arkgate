# ArkRules claims audit (AR19)

**Date:** 2026-07-24  
**Scope:** Public statements about ArkRules reproducible from a clean checkout of this train.

| Claim | Authority | How to reproduce |
|-------|-----------|------------------|
| Optional `arkRules` map on config 1.1 | ADR 0012 · `schemas/ark.config.schema.json` | `loadArkConfigContract` with/without `arkRules` |
| Sibling ArkRules schema 1.0 | `schemas/ark.arkrules.schema.json` | `loadArkRulesContract` fixtures |
| Fail-closed missing references | `resolveEffectiveContract` / CLI effective-contract-load | Missing file → diagnostic |
| policyHash covers active ArkRules | `loadContract` options | Edit arkrules content → hash changes |
| Adapter evidence arkruleId/Source | analysis-result schema 1.4 | `toAdapterDiagnostic` tests |
| Deprecated root runtime forwarders removed | package.json exports | No `./runtime` or `./nestjs` |
| Class-shape facts 1.1 | resolved-candidate-facts schema | Optional `classShapes` |
| Tier-1 sensors block when enforced | `evaluateArkRuleSensors` | arkRuleSensors.test.ts |
| Invariant coverage / promotion gate | `evaluateInvariantCoverage` · `canPromoteInvariant` | invariantCoverage.test.ts |
| Rules inventory deterministic | `buildRulesInventory` | rulesInventory.test.ts |
| Doctor/HTML rules under contract | doctor + `data-advisory="rulesUnderContract"` | report parity + doctor JSON |
| No executable core evaluator | ADR 0016 | Docs + absence of predicate runner in core |
| Migration via existing skills | ADR 0015 | No new skill basenames under templates/skills |

**Clean-checkout gate (maintainer):**

```bash
npm ci
npm run typecheck
npm run test:confidence   # or focused AR suites when full confidence is too heavy
npm run check:cli-pure
npm run check:architecture
npm run build
```

All Phase AR (`AR01`–`AR19`) items are closed on this train when ROADMAP statuses are `done`.
