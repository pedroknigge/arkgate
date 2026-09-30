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
    // hostHookFileMergeable through the end of validateHardWriteRequest.
    'bin/lib/enforcement-profiles.mjs:32-133',
    // The pinned-npx import and prefix line moved the same code to 40-178.
    'bin/lib/write-path-capabilities.mjs:40-178',
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
    // Receiver-trace merges shifted the same resolver body to 739-789; the memory
    // pass (lazy source reads, path reuse, resolution memo) shifted it to 786-839.
    'bin/lib/resolved-candidate-facts.mjs:787-840',
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
    // #308 sliceIdentity schema shifted the same decisions by seven lines.
    // #326 childSlices schema shifted the same migrateArkConfig decisions by 17 lines.
    // #326 PR2 deny-cross-parent schema description shifted them by five.
    // #326 PR3 siblings object schema plus validateChildSliceSiblings shifted them by 89.
    // JSON.parse moved 90 because the new load call sits above it.
    // #326 PR4 child allowedCrossSlice schema plus validator shifted them by 94.
    // The load pin includes the new call. JSON.parse moved 95.
    // #326 PR5 sliceAliases schema plus validateChildSliceAliases shifted the same
    // decisions. The load pin includes the new call. JSON.parse is 1111.
    // The slice-wall split (configContractSlices.ts) moved them to 557-643; one
    // validateSliceContract call replaces the three slice validators.
    // The shared schema walker (schemaValidation.ts, jscpd dedupe) moved the same
    // decisions up by 136 lines; JSON.parse is 547.
    'src/domain/configContract.ts:461-464',
    'src/domain/configContract.ts:466-467',
    'src/domain/configContract.ts:487-488',
    'src/domain/configContract.ts:493-494',
    'src/domain/configContract.ts:503-505',
    'src/domain/configContract.ts:515-515',
    'src/domain/configContract.ts:522-522',
    'src/domain/configContract.ts:531-536',
    'src/domain/configContract.ts:547-547',
    // DF04 — selective pure truth islands (fail-closed / ack / promote honesty).
    // peerIsolationDecision is the killable fail-closed core; findDeniedEdgeDecision wires it.
    // #297 inserted the shared-imports-slice hop. Slice-id JSDoc and #308
    // sliceIdentity helpers shifted peerIsolationDecision again; retargeted to the same function.
    // #326 inserted SliceVerdict types above the same function. #326 PR2 widened
    // sharedImportsSlice and SliceReasonId above it. #326 PR3 inserted the siblings
    // object type above it. #326 PR4 inserted child allowedCrossSlice above it.
    // #326 PR5 inserted the SliceAlias type above it. Same peerIsolationDecision body.
    // #335/#336 mode, stop, and ratchet types above it moved it to 895-922; the
    // stars-identity JSDoc correction moved it to 897-924; the memory pass
    // sliceFolders parse cache moved it to 923-950.
    'src/domain/layerMatch.ts:959-986',
    // AP02 (#264) shifted the helper; sharedImportsSlice and #308 sliceIdentity
    // compares shifted it again. Same policyDeltaAcknowledgementMatches body.
    // #326 compareChildSlices shifted the same function by 93 lines.
    // #326 PR3 sibling enforce-list compare shifted it to 1129-1158.
    // #326 PR4 child allowance widening compare shifted it to 1207-1236.
    // #326 PR5 compareSliceAliases shifted it to 1250-1279.
    // #335 stopAt and #336 ratchet compares shifted it to 1298-1327.
    // #341 arkRules path compare shifted it to 1345-1374; the stringListDelta
    // helper (jscpd dedupe) shifted it to 1354-1383.
    'src/domain/policyDelta.ts:1354-1383',
    // #291 declaration witness shifted formatCoverageDiscards / budgetDetail /
    // canPromoteInvariant. #307/#310 classifyCoverage shifted them again.
    // #322 declaration-miss shifted them once more.
    // Pins stay on those decisions, not on the classifier.
    'src/domain/invariantCoverage.ts:234-253',
    'src/domain/invariantCoverage.ts:754-758',
    'src/domain/invariantCoverage.ts:893-942',
    'src/kernel/semanticAnalysis.ts:18-49',
    'src/kernel/semanticAnalysis.ts:78-258',
    // runtimeIds removed the module sequence above Saga: same body at 186-236.
    'src/kernel/workflow/Saga.ts:186-236',
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
    // Local agent worktrees (git-excluded) carry their own symlinked skill
    // catalogs; copying them into the sandbox dies ENOTSUP.
    '.claude/worktrees',
  ],
};

export default config;
