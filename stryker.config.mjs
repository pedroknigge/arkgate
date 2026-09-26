// @ts-check

/**
 * Selective L5 mutation islands (not whole-repo completeness).
 *
 * Cost gate: `npm run test:mutation` is required on full-matrix CI + publish
 * (`test:confidence` / release-npm / publish-npm), not on PR-slim coverage-only.
 * DF04 pure truth paths (peerIsolation fail-closed, policyDelta ack match,
 * invariant promote honesty) are additional named groups — never a claim of
 * monorepo-wide mutation coverage.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
    related: false,
  },
  // Named enforcement boundaries from ROADMAP S02 + DF04 pure truth islands.
  // Ranges keep the gate focused on product decisions instead of presentation
  // strings and entry shells.
  mutate: [
    'bin/lib/enforcement-profiles.mjs:10-92',
    'bin/lib/write-path-capabilities.mjs:39-176',
    'bin/lib/write-path-detect.mjs:11-32',
    'bin/lib/write-path-detect.mjs:47-47',
    'bin/lib/write-path-detect.mjs:62-62',
    // Fail-open tooth (#231) inserted ahead of mode===none. Keep the two
    // decisions; skip 88-99 presentation (hookPath/label fallbacks are
    // unhit for current hosts → NoCoverage string mutants).
    'bin/lib/write-path-detect.mjs:77-87',
    'bin/lib/write-path-detect.mjs:100-118',
    'bin/lib/analysis-completeness.mjs:9-27',
    // 4.8.4 pinned 74-114 (the whole function). classifiedFileCount + JSDoc
    // growth moved the greenfield exemption and refuse return past 114.
    'bin/lib/analysis-completeness.mjs:81-141',
    'bin/lib/resolved-candidate-facts.mjs:736-786',
    // managed-upgrade force-preserve covered by fieldGapS4 unit tests; not in critical
    // mutation groups for 4.1.0 (NoCoverage noise on toml-section branch residual).
    'bin/lib/resident-hook.mjs:115-162',
    'bin/lib/ast-scan.mjs:11-42',
    'bin/lib/ast-scan.mjs:301-322',
    'bin/lib/ast-scan.mjs:411-427',
    'bin/ark-shared.mjs:450-475',
    // STRUCTURE freeze target + non-freezable SCOPE_EMPTY + baselineKey join
    // (type-only fields above line 40 are not executable — do not pin them).
    'src/domain/baselineKey.ts:40-120',
    // 4.0: migrateArkConfig critical slices (excludes redundant throw-only / guard noise).
    // 547 is an equivalent mutant: forcing the typeof guard true routes a
    // non-string schemaVersion to the unknown-version throw, same message.
    // Retargeted after LO01 owners + trustBoundary shifted the 4.8.4 pins
    // (467-473 had landed on validateLayerOwners guards; 529 on JSDoc).
    // #297 added sharedImportsSlice one line above these pins.
    'src/domain/configContract.ts:543-546',
    'src/domain/configContract.ts:548-549',
    'src/domain/configContract.ts:569-570',
    'src/domain/configContract.ts:575-576',
    'src/domain/configContract.ts:585-587',
    'src/domain/configContract.ts:598-598',
    'src/domain/configContract.ts:605-605',
    'src/domain/configContract.ts:614-617',
    'src/domain/configContract.ts:628-628',
    // DF04 — selective pure truth islands (fail-closed / ack / promote honesty).
    // peerIsolationDecision is the killable fail-closed core; findDeniedEdgeDecision wires it.
    // #297 inserted the shared-imports-slice hop; retargeted to the same function.
    // Slice-id JSDoc (#308) added eight lines above the function; same body.
    'src/domain/layerMatch.ts:625-652',
    // AP02 (#264) shifted the helper; a later sharedImportsSlice compare shifted it again.
    // Retargeted to the same policyDeltaAcknowledgementMatches body.
    'src/domain/policyDelta.ts:970-999',
    // #291 declaration witness shifted formatCoverageDiscards / budgetDetail /
    // canPromoteInvariant. Pins stay on those decisions, not on symbolPresent.
    'src/domain/invariantCoverage.ts:171-190',
    'src/domain/invariantCoverage.ts:293-297',
    'src/domain/invariantCoverage.ts:430-471',
    'src/kernel/semanticAnalysis.ts:18-49',
    'src/kernel/semanticAnalysis.ts:78-258',
    'src/kernel/workflow/Saga.ts:188-238',
  ],
  testFiles: [
    'tests/unit/workflow/workflowEngine.test.ts',
    'tests/unit/domain/baselineKey.test.ts',
    'tests/unit/domain/peerIsolation.test.ts',
    'tests/unit/domain/policyDelta.test.ts',
    'tests/unit/domain/invariantCoverage.test.ts',
    'tests/unit/static-check/configContract.test.ts',
    'tests/unit/static-check/writePathDetect.test.ts',
    'tests/unit/static-check/writePathHostCapabilities.test.ts',
    'tests/unit/static-check/t05EnforcementLadder.test.ts',
    'tests/unit/static-check/enforcementProfiles.test.ts',
    'tests/unit/static-check/criticalBranchCoverage.test.ts',
    'tests/unit/static-check/mutationCritical.test.ts',
    'tests/unit/static-check/z02Completeness.test.ts',
    'tests/unit/static-check/emptyAnalysisRefusal.test.ts',
    'tests/unit/static-check/cursorHardWrite.test.ts',
    'tests/unit/analysis/z04ResolvedFactsResolver.test.ts',
    'tests/unit/static-check/z06ManagedUpgrade.test.ts',
    'tests/unit/static-check/fieldGapS4.test.ts',
    'tests/unit/static-check/writePathCapabilitiesCoverage.test.ts',
    'tests/unit/mcp/residentHook.test.ts',
    'tests/unit/analysis/semanticAnalysis.test.ts',
    'tests/property/baselineKey.property.test.ts',
    'tests/property/layerMatch.property.test.ts',
    'tests/property/policyDelta.property.test.ts',
    'tests/property/invariantCoverage.property.test.ts',
  ],
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // 4.1.0 field surface: measured mutation score ~88–89 on clean candidates.
  // Keep high aspirational; break under measured with small headroom.
  // Selective islands only — not a whole-repo mutation completeness claim.
  thresholds: { high: 90, low: 87, break: 87 },
  concurrency: 2,
  timeoutMS: 10000,
  // Vitest imports frozen support tables before per-mutant activation. Their exact
  // values are unit-tested; mutate executable decisions without false static survivors.
  ignoreStatic: true,
  cleanTempDir: 'always',
  ignorePatterns: [
    'coverage',
    'internal',
    '.gstack',
    '.orderfield',
    // Directory symlinks (AGY01 catalog). Stryker copyfile dies EISDIR on them.
    // Keep .grok/hooks so the mutation dry-run still dogfoods repair-capable write.
    '.grok/skills',
    '.agents/skills',
  ],
};

export default config;
