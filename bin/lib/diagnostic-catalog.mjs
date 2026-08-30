/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/diagnosticCatalog.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/diagnostic-catalog.mjs). Zero Node I/O.
 */

/** Product-relative docs path (shipped in the npm tarball when listed in package files). */
export const DIAGNOSTIC_DOCS_RELATIVE_PATH = 'docs/diagnostics.md';
/** Schema id for serializing the catalog snapshot (agents / install projection). */
export const DIAGNOSTIC_CATALOG_SCHEMA_VERSION = '1.0';
function entry(ruleId, category, title, why, fix, extras) {
    return {
        ruleId,
        title,
        why,
        fix,
        docsAnchor: ruleId,
        category,
        ...(extras?.oftenAdvisory ? { oftenAdvisory: true } : {}),
    };
}
/**
 * Closed public catalog. Order is stable (category groups, then ruleId) for
 * deterministic serialization and docs generation.
 *
 * Every production-emitted `ruleId` must appear here. Remediation switch cases
 * and adapter nextAction branches are parity-tested against this list.
 */
export const DIAGNOSTIC_CATALOG = Object.freeze([
    // ── layer / graph ────────────────────────────────────────────────────────
    entry('LAYER_IMPORT_VIOLATION', 'layer', 'Layer import not allowed', 'A module import (or re-export) crosses a layer edge that ark.config.json does not allow. The architecture contract forbids that dependency direction so outer infrastructure cannot leak into pure or inner layers.', 'Branch by import kind: constants/types/pure → adopt into DomainModel or SharedKernel (do not invent a port); kernel/events/bootstrap from Persistence → inject a port or move the map to SharedTypes (Persistence must not emit); define a port only when the target is a real use-case. Type-only edges use `import type`. Then preflight again. Do not weaken the layer rule without a hash-bound policy acknowledgement.'),
    entry('LAYER_INTENT_REFERENCE_VIOLATION', 'layer', 'Intent referenced across a blocked layer edge', 'A string intent (or intent-like reference) names a layer that the file’s layer may not reach under the contract rules — the same plane as import edges, for event/intent coupling.', 'Reference that intent from a layer allowed to know about it (usually an adapter or application layer), or relocate the reference — then preflight again.'),
    entry('LAYER_REFERENCE_VIOLATION', 'layer', 'Layer reference blocked (snippet / AI gate)', 'Snippet analysis found an intent or string reference that would couple layers in a direction the architecture profile forbids.', 'Move the reference to an allowed layer or introduce a port/event boundary, then re-run the snippet gate.'),
    entry('CIRCULAR_DEPENDENCY', 'layer', 'Dependency cycle', 'Two or more modules import each other in a loop. Cycles make ownership unclear and break stable layer direction.', 'Extract the shared dependency into a third module, invert one edge behind a port, or merge units that are truly one — then preflight again.'),
    // ── capability / ambient ─────────────────────────────────────────────────
    entry('FORBIDDEN_GLOBAL', 'capability', 'Forbidden ambient global or dual import', 'The file’s layer lists this ambient (or its exact import dual, e.g. process / node:process) in forbiddenGlobals. Pure layers must not reach wall-clock, network, process, or similar effects directly.', 'Inject the capability through a small port (Clock, HttpPort, Config, …), bind the implementation outside the walled layer, then preflight again.'),
    entry('CAPABILITY_VIOLATION', 'capability', 'Denied effect capability', 'The layer denies an effect capability (network, filesystem, clock, randomness, environment, process, persistence) and the candidate uses that effect via ambient or import evidence.', 'Define a capability port in the walled layer, bind the implementation in an adapter layer, then preflight again. Never mechanical-safe — port shape is a design decision.'),
    // ── publish / intents ────────────────────────────────────────────────────
    entry('RAW_EVENT_PUBLISH', 'publish', 'Raw event publish', 'Publish went through a raw string or object instead of a registered intent creator, bypassing Ark intent contracts and tooling.', 'Publish through a registered intent creator, then run Ark again.'),
    entry('PUBLISH_MISSING_SOURCE', 'publish', 'Publish missing metadata.source', 'A strict Ark publish call omitted metadata.source, so the publishing layer cannot be verified.', 'Add metadata.source to the publish call, then run Ark again.'),
    entry('PUBLISH_SOURCE_LAYER_MISMATCH', 'publish', 'Publish source layer mismatch', 'metadata.source resolves to a different layer than the file performing the publish.', 'Use a source intent owned by the same layer as this file, or move the publish call to the owning layer.'),
    entry('UNKNOWN_INTENT', 'publish', 'Unknown intent reference', 'Snippet analysis saw an intent string that is not registered in the intent registry / profile under check.', 'Register the intent or use a known intent name from the project registry, then re-run the gate.'),
    // ── safety thresholds / dynamic ──────────────────────────────────────────
    entry('DYNAMIC_IMPORT_NOT_ALLOWLISTED', 'safety', 'Non-literal dynamic import', 'A dynamic import(expr) cannot be resolved statically and the file is not on dynamicImportAllowlist. Unresolved dynamics can hide layer edges.', 'Rewrite to a static import when possible, or add only reviewed files to dynamicImportAllowlist after human sign-off.'),
    entry('DYNAMIC_REQUIRE_NOT_ALLOWLISTED', 'safety', 'Non-literal require', 'A require(expr) cannot be resolved statically and is not allowlisted — same hide-the-edge risk as dynamic import.', 'Prefer static import, or allowlist only reviewed files after sign-off.'),
    entry('TS_SUPPRESSION_THRESHOLD_EXCEEDED', 'safety', '@ts-ignore / @ts-nocheck threshold', 'Count of TypeScript suppressions in governed production source exceeds safety.maxTsSuppressions.', 'Remove suppressions by fixing types, or raise the threshold only with an explicit production exception in ark.config.json.'),
    entry('ANY_CAST_THRESHOLD_EXCEEDED', 'safety', 'Explicit any cast threshold', 'Count of explicit any casts exceeds safety.maxAnyCasts.', 'Replace any with precise types, or raise the threshold only with a documented exception.'),
    entry('IN_MEMORY_STORE_IN_PRODUCTION_SOURCE', 'safety', 'In-memory store in production source', 'Governed production source references an Ark InMemory* store without safety.allowInMemory — durable systems should not ship ephemeral stores by accident.', 'Provide a durable store implementation, or set safety.allowInMemory only for an explicitly ephemeral service.'),
    entry('PEER_ISOLATION_DISABLED', 'safety', 'peerIsolation disabled on a rule', 'A same-layer or peer rule disables peerIsolation (or omits it where required), which allows cross-slice coupling the contract otherwise blocks.', 'Restore peerIsolation: true, or set safety.allowDisabledPeerIsolation only with a documented production exception.'),
    // ── ArkRules ─────────────────────────────────────────────────────────────
    entry('ARKRULE_STRUCTURE', 'arkrules', 'ArkRule structure sensor failed', 'An opt-in ArkRules structure sensor (private state, factory shape, event publish, persistence write outside an aggregate, …) failed on a governed file for a declared arkruleId.', 'Restore the declared structure for the ArkRule (see arkruleSource), then preflight again. Do not demote the rule without a hash-bound policy acknowledgement.'),
    entry('ARKRULE_INVARIANT', 'arkrules', 'ArkRule invariant failed', 'Reserved / remediation-recognized code for invariant-plane failures bound to an ArkRule id (coverage path also emits INVARIANT_UNCOVERED).', 'Fix the invariant for the ArkRule declared in arkrules/<Layer>.json, then preflight again. Do not demote without acknowledgement.'),
    entry('ARKRULE_SCOPE_EMPTY', 'arkrules', 'ArkRule appliesTo matched zero files', 'An ArkRule’s appliesTo globs matched no governed files — the rule cannot observe what it claims to protect.', 'Fix appliesTo globs so they match governed files, or remove the rule. Enforced empty scope fails; advisory empty scope warns.', { oftenAdvisory: true }),
    entry('INVARIANT_UNCOVERED', 'arkrules', 'Invariant without coverage evidence', 'An ArkRules invariant is under contract but no covering test title or declared symbol evidence was found (or coverage is partial). Kind is never-had-tests (adopt residual) vs tests-disappeared (suite exists).', 'Add a test title or declared symbol covering the arkruleId, then preflight again. Treat never-had-tests as adopt residual; treat tests-disappeared as a regression. Missing test globs report partial — never fake green. When the message reports an exhausted file budget, raise coverage.maxFiles (or narrow coverage.testGlobs) in ark.config.json.'),
    entry('INVARIANT_COVERAGE_OUTSIDE_ROOTS', 'arkrules', 'Covering test outside the declared coverage roots', 'The only test naming this invariant sits outside coverage.coverageRoots — the places the project declares its runner executes. ArkGate matches declared text and never executes tests, so it cannot tell whether that file is ever run: coverage there is a test that exists, not a test that runs.', 'Move the test under a declared coverage root, or add its root to coverage.coverageRoots in ark.config.json. Advisory: it never fails strict, but promotion to enforced refuses on it.', { oftenAdvisory: true }),
    // ── ArkRun (opt-in extra; RN05 dual-depth nextAction) ────────────────────
    entry('ARKRUN_MISSING_ROOT', 'arkrun', 'No kernel factory in composition roots', 'The ArkRun extra is on but no createArkKernel / createStrictArkKernel / createArkKernelFromConfig / createStrictArkKernelFromConfig factory was found in arkRun.compositionRoots, so agents can skip the kernel while the write gate stays green.', 'Import createStrictArkKernel from arkgate/runtime (same npm package; @arkgate/runtime is deprecated) and call it in a composition root listed in arkRun.compositionRoots, then preflight again. Never mechanical-safe — factory placement is a design decision.'),
    entry('ARKRUN_KERNEL_IN_DOMAIN', 'arkrun', 'Domain-role layer imports the kernel', 'A Domain-role layer imports arkgate/runtime, @arkgate/runtime, or kernel types. Domain stays kernel-free; composition roots and adapters own the factory.', 'Move the kernel import out of the Domain-role layer into a composition root or adapter. Import from arkgate/runtime (same npm package; @arkgate/runtime is deprecated), then preflight again. Never mechanical-safe.'),
    entry('ARKRUN_DIRECT_NEW', 'arkrun', 'Managed type constructed with new', 'A managed non-Domain file constructs an admitted type with new outside an ArkRun composition-root factory, skipping kernel resolve/registration.', 'Resolve the type from the kernel instead of constructing it with new, then preflight again. Never mechanical-safe — rewiring construction is a design decision.'),
    entry('ARKRUN_UNDECLARED_EMIT', 'arkrun', 'Emit name not in raises/sends', 'A publisher / publish / raise / send call-site literal is not listed in the file’s raises or sends declaration.', 'Add the existing call-site name to raises or sends on the managed component, then preflight again. Mechanical-safe only when that literal already exists and the edit is the declaration list; inventing a new emit stays judgment.'),
    entry('ARKRUN_UNDECLARED_HANDLE', 'arkrun', 'Handle name not in reactsTo', 'A subscribe / registerHandler call-site literal is not listed in the file’s reactsTo declaration.', 'Add the existing call-site name to reactsTo on the managed component, then preflight again. Mechanical-safe only when that literal already exists and the edit is the declaration list; inventing a new handle stays judgment.'),
    entry('ARKRUN_UNDECLARED_DEPEND', 'arkrun', 'Depend name not in uses', 'A resolve / resolveSingleton call-site literal is not listed in the file’s uses declaration.', 'Add the existing call-site name to uses on the managed component, then preflight again. Mechanical-safe only when that literal already exists and the edit is the declaration list; inventing a new depend stays judgment.'),
    entry('ARKRUN_TRANSPORT_BYPASS', 'arkrun', 'Homemade broker or emitter import', 'A managed layer imports a closed broker/queue/emitter specifier (EventEmitter, queue clients, …) instead of the ArkRun kernel transport.', 'Send through the ArkRun kernel transport instead of importing that broker or emitter, then preflight again. Never mechanical-safe — homemade buses stay judgment.'),
    entry('ARKORDER_MISSING_PLANE', 'arkorder', 'No createOrderPlane in plane roots', 'The ArkOrder extra is on but no createOrderPlane factory was found in arkOrder.planeRoots, so agents can skip the pattern plane while the write gate stays green.', 'Import createOrderPlane from arkgate/order and call it in a plane root listed in arkOrder.planeRoots, then preflight again. Never mechanical-safe — factory placement is a design decision.'),
    entry('ARKORDER_KERNEL_IN_DOMAIN', 'arkorder', 'Domain-role layer imports the order plane', 'A Domain-role layer imports arkgate/order. Domain stays plane-free; planeRoots own the factory.', 'Move the arkgate/order import out of the Domain-role layer into a plane root or adapter, then preflight again. Never mechanical-safe.'),
    entry('ARKORDER_GENERIC_UPDATE', 'arkorder', 'Generic update of ξ', 'A call to update/patch/set on the order plane rewrites the slow pattern. Haken slaving forbids generic ξ mutation.', 'Use release() to freeze ξ or proposeRelease() for a pattern change with blast radius, then preflight again. Never mechanical-safe.'),
    entry('ARKORDER_TOO_MANY_PARAMS', 'arkorder', 'Too many slow keys', 'ξ has more keys than arkOrder.maxXiKeys. Haken requires a few slow modes, not a dump of microstate.', 'Cut ξ to the slow keys that actually slave the rest, then preflight again. Never mechanical-safe.'),
    entry('ARKORDER_INGEST_WRITES_XI', 'arkorder', 'ingest assigned into ξ', 'An ingest() result is written into a Release or ξ store. ingest may absorb or escalate; it never mints a pattern.', 'Keep ingest results as absorb/escalate only. Change ξ with proposeRelease + release. Never mechanical-safe.'),
    entry('ARKORDER_XI_FIELD_WRITE', 'arkorder', 'Slow key written around the order plane', 'A managed-layer file imports a persistence driver and writes a declared arkOrder.xiKeys name. Field events absorb or escalate; they do not PATCH the slow pattern.', 'Keep invoices, seats, hours, and logs on ingest. Change the slow key with proposeRelease + release, then preflight again. Never mechanical-safe.'),
    // ── atomic preflight / change set ────────────────────────────────────────
    entry('INVALID_CHANGE_PATH', 'preflight', 'Unsafe change path', 'A change set entry is not a safe, non-empty project-relative path (absolute, escape, empty, or NUL).', 'Use canonical project-relative paths only in the atomic change set, then preflight again.'),
    entry('DUPLICATE_CHANGE_PATH', 'preflight', 'Duplicate path in change set', 'The atomic change set lists more than one operation for the same path.', 'Collapse to one create/update/delete per path, then preflight again.'),
    entry('DELETE_TARGET_MISSING', 'preflight', 'Delete target missing', 'A delete operation targets a path that is not present in the supplied base tree.', 'Remove the delete, or include the file in the base tree facts, then preflight again.'),
    entry('CHANGE_SET_EMPTY', 'preflight', 'Empty change set', 'Atomic preflight was invoked with no create, update, or delete operations.', 'Provide at least one change operation, then preflight again.'),
    entry('FACTS_IDENTITY_MISMATCH', 'preflight', 'Base/candidate facts identity mismatch', 'Base and candidate resolved facts disagree on resolver, compiler, evidence requirements, or package identity — verdicts would not be comparable.', 'Regenerate both fact snapshots with the same resolver/compiler/evidence requirements, then preflight again.'),
    entry('CANDIDATE_DELETE_NOT_APPLIED', 'preflight', 'Candidate still contains deleted path', 'Facts claim a delete, but the candidate tree still includes the path.', 'Ensure the candidate facts apply the delete (path absent), then preflight again.'),
    entry('CANDIDATE_CHANGE_MISSING', 'preflight', 'Declared change missing from candidate', 'The change set declares a create/update whose path is missing from candidate facts.', 'Include the new content in the candidate facts (or drop the operation), then preflight again.'),
    entry('CANDIDATE_CONTENT_HASH_MISMATCH', 'preflight', 'Candidate content hash mismatch', 'The candidate file content hash does not match the hash expected for the declared change.', 'Rebuild candidate facts from the exact proposed content, then preflight again.'),
    entry('UNDECLARED_CANDIDATE_CHANGE', 'preflight', 'Undeclared candidate change', 'Candidate facts differ from base for a path that was not listed in the explicit change set.', 'Declare every path that changes in the atomic change set, then preflight again.'),
    entry('ATOMIC_PREFLIGHT_UNAVAILABLE', 'preflight', 'Atomic preflight unavailable', 'The host/MCP path could not run the atomic preflight engine (missing facts, incomplete setup, or unsupported mode).', 'Use resolved-candidate facts / ark_prepare_change with a complete batch, or fall back to ark-check on disk. Do not treat missing preflight as green.'),
    entry('DESIGN_SMELL_REGRESSION', 'preflight', 'Design smell regression on base-relative ratchet', 'Compared to the base ref, the candidate introduces a created-path domain-logic-in-ui file under --strict-merge, or introduces or worsens a blocking design-smell class under --fail-on-new-smells.', 'Move the new UI business rule out of the created file (or revert a --fail-on-new-smells regression), then re-run with the same base ref.'),
    // ── analysis completeness / host ─────────────────────────────────────────
    entry('ANALYSIS_PARSE_INCOMPLETE', 'analysis', 'Parse incomplete', 'Governed source could not be fully parsed; evidence includes the TypeScript diagnostic (line + message). Incremental mid-edit parse is normal for agents. Contract exclude paths skip the write hook.', 'Finish the source or fix the reported syntax error, then re-run `npx arkgate-check`. The write hook does not deny solely on mid-edit parse. Partial never means pass.'),
    entry('LEXICAL_EVIDENCE_INCOMPLETE', 'analysis', 'Lexical evidence incomplete', 'Single-file validation cannot prove project module resolution. The write hook is already the verdict.', 'Re-run `npx arkgate-check --root . --config ark.config.json`, or treat the hook deny as final. Do not call ark_prepare_change from a hook deny.'),
    entry('ANALYSIS_HOST_UNAVAILABLE', 'analysis', 'Analysis host unavailable', 'No usable TypeScript / analysis host was available for this invocation.', 'Install a supported TypeScript version visible to the project, then re-run. Unavailable analysis is fail-closed.'),
    entry('ADAPTER_NOT_ALLOWED_FOR_PORT', 'adapter', 'Adapter not allowed for port', 'Runtime/port wiring selected an adapter implementation that the architecture profile does not allow for that port.', 'Bind an allowed adapter for the port, or adjust the profile with an explicit policy decision — then re-run.'),
    // ── AI snippet gate policy surface ───────────────────────────────────────
    entry('FORBIDDEN_PATTERN', 'snippet-policy', 'Forbidden regex pattern', 'Snippet content matched a project or profile forbiddenPatterns rule.', 'Remove or rewrite the matching code so the pattern no longer matches, then re-run the snippet gate.'),
    entry('FORBIDDEN_SUBSTRING', 'snippet-policy', 'Forbidden substring', 'Snippet content contained a forbidden substring from the AI gate options/profile.', 'Remove the forbidden substring, then re-run the snippet gate.'),
    entry('FORBIDDEN_IMPORT', 'snippet-policy', 'Forbidden import target', 'Snippet imported or required a module listed as forbidden for the active profile.', 'Import an allowed module or inject the dependency behind a port, then re-run.'),
    entry('POLICY_VIOLATION', 'snippet-policy', 'Policy engine violation', 'A registered Policy failed on the snippet or generated code under evaluation.', 'Adjust the code to satisfy the named policy, or change the policy only through an explicit contract decision.'),
    entry('EXTENSION_ERROR', 'snippet-policy', 'AI gate extension error', 'A registered AICodeGate extension threw while analyzing the snippet.', 'Fix or remove the failing extension; do not ignore extension failures as pass.'),
    entry('AST_ANALYZER_ERROR', 'snippet-policy', 'AST analyzer error', 'Built-in AST/symbol analysis failed (host error or unexpected analyzer exception).', 'Ensure TypeScript host and snippet are valid; re-run. If the analyzer crashes on valid input, file a bug with a minimal fixture.'),
    // ── config diagnostics ───────────────────────────────────────────────────
    entry('CONFIG_INVALID_DYNAMIC_IMPORT_ALLOWLIST', 'config', 'Invalid dynamicImportAllowlist', 'dynamicImportAllowlist is present but not an array of file globs.', 'Set dynamicImportAllowlist to an array of project-relative globs (or omit it).', { oftenAdvisory: true }),
    entry('CONFIG_INVALID_SAFETY', 'config', 'Invalid safety object', 'The safety field is present but not an object.', 'Use a safety object with optional maxTsSuppressions, maxAnyCasts, allowInMemory, allowDisabledPeerIsolation.', { oftenAdvisory: true }),
    entry('CONFIG_INVALID_SAFETY_THRESHOLD', 'config', 'Invalid safety threshold', 'A safety threshold (maxTsSuppressions / maxAnyCasts) is not a non-negative integer.', 'Set each threshold to a non-negative integer.', { oftenAdvisory: true }),
    entry('CONFIG_NO_LAYERS', 'config', 'No layers configured', 'ark.config.json has no file layers, so import-boundary enforcement cannot classify files.', 'Declare at least one layer with name + patterns (or run ark start / a preset).', { oftenAdvisory: true }),
    entry('CONFIG_LAYER_WITHOUT_NAME', 'config', 'Layer missing name', 'A configured layer entry has no name.', 'Give every layer a unique non-empty name.', { oftenAdvisory: true }),
    entry('CONFIG_INVALID_FORBIDDEN_GLOBALS', 'config', 'Invalid forbiddenGlobals', 'A layer’s forbiddenGlobals is not an array of strings; the entry is ignored.', 'Use an array of strings (e.g. ["fetch", "Date.now"]).', { oftenAdvisory: true }),
    entry('CONFIG_LAYER_WITHOUT_PATTERNS', 'config', 'Layer without patterns', 'A named layer has no file patterns and will never classify files.', 'Add patterns globs that match the layer’s source tree.', { oftenAdvisory: true }),
    entry('CONFIG_INVALID_LAYER_PATTERN', 'config', 'Invalid layer pattern', 'A layer pattern is not a valid glob / failed to compile.', 'Fix the pattern syntax for that layer.', { oftenAdvisory: true }),
    entry('CONFIG_LAYER_PATTERN_NO_MATCHES', 'config', 'Layer pattern matched no files', 'A layer pattern matched zero included files (often a typo or include mismatch). Reserved/allowEmpty houses do not emit this.', 'Adjust the pattern or include roots, or mark the layer reserved/allowEmpty if the glob is a future house.', { oftenAdvisory: true }),
    entry('CONFIG_DUPLICATE_LAYER', 'config', 'Duplicate layer name', 'The same layer name appears more than once in configuration.', 'Rename or merge duplicate layer entries.', { oftenAdvisory: true }),
    entry('CONFIG_RULE_UNKNOWN_FROM_LAYER', 'config', 'Rule unknown from layer', 'A dependency rule references a source layer name that is not declared.', 'Fix the rule’s from field to a declared layer name.', { oftenAdvisory: true }),
    entry('CONFIG_RULE_UNKNOWN_TO_LAYER', 'config', 'Rule unknown to layer', 'A dependency rule references a target layer name that is not declared.', 'Fix the rule’s to field to a declared layer name.', { oftenAdvisory: true }),
    entry('CONFIG_AMBIGUOUS_LAYERS', 'config', 'Ambiguous layer classification', 'Some files match multiple layers at equal specificity; classification falls back to declaration order.', 'Disambiguate overlapping patterns so each file has one clear layer owner.', { oftenAdvisory: true }),
    entry('CONFIG_UNCLASSIFIED_FILES', 'config', 'Unclassified included files', 'Included source files match no layer pattern; import rules will not enforce on them.', 'Extend layer patterns or narrow include so every governed file is classified.', { oftenAdvisory: true }),
    // ── meta ─────────────────────────────────────────────────────────────────
    entry('ARK_UNKNOWN', 'meta', 'Unknown diagnostic', 'A diagnostic lacked a stable ruleId/code; adapters may emit this fallback so agents never see an empty id.', 'Resolve the underlying finding without weakening ark.config.json, then run Ark again. Prefer fixing the producer to emit a catalogued ruleId.'),
]);
const BY_ID = new Map(DIAGNOSTIC_CATALOG.map((item) => [item.ruleId, item]));
/** All public ruleIds in catalog order. */
export const DIAGNOSTIC_RULE_IDS = Object.freeze(DIAGNOSTIC_CATALOG.map((item) => item.ruleId));
export function isKnownDiagnosticCode(ruleId) {
    return typeof ruleId === 'string' && ruleId.length > 0 && BY_ID.has(ruleId);
}
/**
 * True when the code is catalogued or is an ArkRule-family id handled by the
 * ARKRULE_* prefix fallback in remediation (structure sensors may add members later
 * only via catalog + ROADMAP — prefix alone is not a license for free-form ids).
 */
export function isCataloguedOrArkRuleFamily(ruleId) {
    if (typeof ruleId !== 'string' || ruleId.length === 0)
        return false;
    if (BY_ID.has(ruleId))
        return true;
    return ruleId.startsWith('ARKRULE_');
}
export function getDiagnosticCatalogEntry(ruleId) {
    if (typeof ruleId !== 'string' || ruleId.length === 0)
        return undefined;
    return BY_ID.get(ruleId);
}
/** Fragment for docs links, e.g. `#LAYER_IMPORT_VIOLATION`. */
export function diagnosticDocsFragment(ruleId) {
    const entryOrId = getDiagnosticCatalogEntry(ruleId)?.docsAnchor ?? ruleId;
    return `#${entryOrId}`;
}
/**
 * Repo-relative docs path with fragment (for agents and JSON).
 * Package consumers resolve against the installed package root or GitHub tree.
 */
export function diagnosticDocsPath(ruleId) {
    return `${DIAGNOSTIC_DOCS_RELATIVE_PATH}${diagnosticDocsFragment(ruleId)}`;
}
/** Catalog snapshot for JSON export / agent projection (stable field order). */
export function serializeDiagnosticCatalog() {
    return {
        schemaVersion: DIAGNOSTIC_CATALOG_SCHEMA_VERSION,
        docsPath: DIAGNOSTIC_DOCS_RELATIVE_PATH,
        codes: DIAGNOSTIC_CATALOG,
    };
}
/**
 * Static catalog fix for a ruleId when no live violation context is available.
 * Live adapters should still use deterministicNextAction for specialized edges.
 */
export function catalogFixForRuleId(ruleId) {
    return getDiagnosticCatalogEntry(ruleId)?.fix;
}
/**
 * Static catalog why for a ruleId (agent “why” surface).
 */
export function catalogWhyForRuleId(ruleId) {
    return getDiagnosticCatalogEntry(ruleId)?.why;
}
