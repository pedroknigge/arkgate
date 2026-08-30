# ArkGate diagnostic code catalog

> **Source of truth:** Domain module `src/domain/diagnosticCatalog.ts` (public diagnostic catalog).
> Generated CLI mirror: `bin/lib/diagnostic-catalog.mjs`. Catalog schema `1.0`.
> Enforcement remains CLI / hooks / CI — this page is documentation only.

Every public `ruleId` ArkGate emits is listed below with **why** (contract intent) and **fix** (canonical next step).
Live adapter JSON may specialize `nextAction` for evidence (e.g. type-only layer imports); the catalog fix is the stable docs anchor.

Programmatic API (stable root export):

```ts
import {
  DIAGNOSTIC_CATALOG,
  getDiagnosticCatalogEntry,
  diagnosticDocsPath,
  isKnownDiagnosticCode,
} from "arkgate";
```

Link form for agents: `docs/diagnostics.md#RULE_ID` (exact-case HTML anchors below).

## Index

| ruleId | Category | Title |
|--------|----------|-------|
| [`LAYER_IMPORT_VIOLATION`](#LAYER_IMPORT_VIOLATION) | layer | Layer import not allowed |
| [`LAYER_INTENT_REFERENCE_VIOLATION`](#LAYER_INTENT_REFERENCE_VIOLATION) | layer | Intent referenced across a blocked layer edge |
| [`LAYER_REFERENCE_VIOLATION`](#LAYER_REFERENCE_VIOLATION) | layer | Layer reference blocked (snippet / AI gate) |
| [`CIRCULAR_DEPENDENCY`](#CIRCULAR_DEPENDENCY) | layer | Dependency cycle |
| [`FORBIDDEN_GLOBAL`](#FORBIDDEN_GLOBAL) | capability | Forbidden ambient global or dual import |
| [`CAPABILITY_VIOLATION`](#CAPABILITY_VIOLATION) | capability | Denied effect capability |
| [`RAW_EVENT_PUBLISH`](#RAW_EVENT_PUBLISH) | publish | Raw event publish |
| [`PUBLISH_MISSING_SOURCE`](#PUBLISH_MISSING_SOURCE) | publish | Publish missing metadata.source |
| [`PUBLISH_SOURCE_LAYER_MISMATCH`](#PUBLISH_SOURCE_LAYER_MISMATCH) | publish | Publish source layer mismatch |
| [`UNKNOWN_INTENT`](#UNKNOWN_INTENT) | publish | Unknown intent reference |
| [`DYNAMIC_IMPORT_NOT_ALLOWLISTED`](#DYNAMIC_IMPORT_NOT_ALLOWLISTED) | safety | Non-literal dynamic import |
| [`DYNAMIC_REQUIRE_NOT_ALLOWLISTED`](#DYNAMIC_REQUIRE_NOT_ALLOWLISTED) | safety | Non-literal require |
| [`TS_SUPPRESSION_THRESHOLD_EXCEEDED`](#TS_SUPPRESSION_THRESHOLD_EXCEEDED) | safety | @ts-ignore / @ts-nocheck threshold |
| [`ANY_CAST_THRESHOLD_EXCEEDED`](#ANY_CAST_THRESHOLD_EXCEEDED) | safety | Explicit any cast threshold |
| [`IN_MEMORY_STORE_IN_PRODUCTION_SOURCE`](#IN_MEMORY_STORE_IN_PRODUCTION_SOURCE) | safety | In-memory store in production source |
| [`PEER_ISOLATION_DISABLED`](#PEER_ISOLATION_DISABLED) | safety | peerIsolation disabled on a rule |
| [`ARKRULE_STRUCTURE`](#ARKRULE_STRUCTURE) | arkrules | ArkRule structure sensor failed |
| [`ARKRULE_INVARIANT`](#ARKRULE_INVARIANT) | arkrules | ArkRule invariant failed |
| [`ARKRULE_SCOPE_EMPTY`](#ARKRULE_SCOPE_EMPTY) | arkrules | ArkRule appliesTo matched zero files |
| [`INVARIANT_UNCOVERED`](#INVARIANT_UNCOVERED) | arkrules | Invariant without coverage evidence |
| [`ARKRUN_MISSING_ROOT`](#ARKRUN_MISSING_ROOT) | arkrun | No kernel factory in composition roots |
| [`ARKRUN_KERNEL_IN_DOMAIN`](#ARKRUN_KERNEL_IN_DOMAIN) | arkrun | Domain-role layer imports the kernel |
| [`ARKRUN_DIRECT_NEW`](#ARKRUN_DIRECT_NEW) | arkrun | Managed type constructed with new |
| [`ARKRUN_UNDECLARED_EMIT`](#ARKRUN_UNDECLARED_EMIT) | arkrun | Emit name not in raises/sends |
| [`ARKRUN_UNDECLARED_HANDLE`](#ARKRUN_UNDECLARED_HANDLE) | arkrun | Handle name not in reactsTo |
| [`ARKRUN_UNDECLARED_DEPEND`](#ARKRUN_UNDECLARED_DEPEND) | arkrun | Depend name not in uses |
| [`ARKRUN_TRANSPORT_BYPASS`](#ARKRUN_TRANSPORT_BYPASS) | arkrun | Homemade broker or emitter import |
| [`ARKORDER_MISSING_PLANE`](#ARKORDER_MISSING_PLANE) | arkorder | No createOrderPlane in plane roots |
| [`ARKORDER_KERNEL_IN_DOMAIN`](#ARKORDER_KERNEL_IN_DOMAIN) | arkorder | Domain-role layer imports the order plane |
| [`ARKORDER_GENERIC_UPDATE`](#ARKORDER_GENERIC_UPDATE) | arkorder | Generic update of ξ |
| [`ARKORDER_TOO_MANY_PARAMS`](#ARKORDER_TOO_MANY_PARAMS) | arkorder | Too many slow keys |
| [`ARKORDER_INGEST_WRITES_XI`](#ARKORDER_INGEST_WRITES_XI) | arkorder | ingest assigned into ξ |
| [`INVALID_CHANGE_PATH`](#INVALID_CHANGE_PATH) | preflight | Unsafe change path |
| [`DUPLICATE_CHANGE_PATH`](#DUPLICATE_CHANGE_PATH) | preflight | Duplicate path in change set |
| [`DELETE_TARGET_MISSING`](#DELETE_TARGET_MISSING) | preflight | Delete target missing |
| [`CHANGE_SET_EMPTY`](#CHANGE_SET_EMPTY) | preflight | Empty change set |
| [`FACTS_IDENTITY_MISMATCH`](#FACTS_IDENTITY_MISMATCH) | preflight | Base/candidate facts identity mismatch |
| [`CANDIDATE_DELETE_NOT_APPLIED`](#CANDIDATE_DELETE_NOT_APPLIED) | preflight | Candidate still contains deleted path |
| [`CANDIDATE_CHANGE_MISSING`](#CANDIDATE_CHANGE_MISSING) | preflight | Declared change missing from candidate |
| [`CANDIDATE_CONTENT_HASH_MISMATCH`](#CANDIDATE_CONTENT_HASH_MISMATCH) | preflight | Candidate content hash mismatch |
| [`UNDECLARED_CANDIDATE_CHANGE`](#UNDECLARED_CANDIDATE_CHANGE) | preflight | Undeclared candidate change |
| [`ATOMIC_PREFLIGHT_UNAVAILABLE`](#ATOMIC_PREFLIGHT_UNAVAILABLE) | preflight | Atomic preflight unavailable |
| [`DESIGN_SMELL_REGRESSION`](#DESIGN_SMELL_REGRESSION) | preflight | Design smell regression on base-relative ratchet |
| [`ANALYSIS_PARSE_INCOMPLETE`](#ANALYSIS_PARSE_INCOMPLETE) | analysis | Parse incomplete |
| [`LEXICAL_EVIDENCE_INCOMPLETE`](#LEXICAL_EVIDENCE_INCOMPLETE) | analysis | Lexical evidence incomplete |
| [`ANALYSIS_HOST_UNAVAILABLE`](#ANALYSIS_HOST_UNAVAILABLE) | analysis | Analysis host unavailable |
| [`ADAPTER_NOT_ALLOWED_FOR_PORT`](#ADAPTER_NOT_ALLOWED_FOR_PORT) | adapter | Adapter not allowed for port |
| [`FORBIDDEN_PATTERN`](#FORBIDDEN_PATTERN) | snippet-policy | Forbidden regex pattern |
| [`FORBIDDEN_SUBSTRING`](#FORBIDDEN_SUBSTRING) | snippet-policy | Forbidden substring |
| [`FORBIDDEN_IMPORT`](#FORBIDDEN_IMPORT) | snippet-policy | Forbidden import target |
| [`POLICY_VIOLATION`](#POLICY_VIOLATION) | snippet-policy | Policy engine violation |
| [`EXTENSION_ERROR`](#EXTENSION_ERROR) | snippet-policy | AI gate extension error |
| [`AST_ANALYZER_ERROR`](#AST_ANALYZER_ERROR) | snippet-policy | AST analyzer error |
| [`CONFIG_INVALID_DYNAMIC_IMPORT_ALLOWLIST`](#CONFIG_INVALID_DYNAMIC_IMPORT_ALLOWLIST) | config | Invalid dynamicImportAllowlist |
| [`CONFIG_INVALID_SAFETY`](#CONFIG_INVALID_SAFETY) | config | Invalid safety object |
| [`CONFIG_INVALID_SAFETY_THRESHOLD`](#CONFIG_INVALID_SAFETY_THRESHOLD) | config | Invalid safety threshold |
| [`CONFIG_NO_LAYERS`](#CONFIG_NO_LAYERS) | config | No layers configured |
| [`CONFIG_LAYER_WITHOUT_NAME`](#CONFIG_LAYER_WITHOUT_NAME) | config | Layer missing name |
| [`CONFIG_INVALID_FORBIDDEN_GLOBALS`](#CONFIG_INVALID_FORBIDDEN_GLOBALS) | config | Invalid forbiddenGlobals |
| [`CONFIG_LAYER_WITHOUT_PATTERNS`](#CONFIG_LAYER_WITHOUT_PATTERNS) | config | Layer without patterns |
| [`CONFIG_INVALID_LAYER_PATTERN`](#CONFIG_INVALID_LAYER_PATTERN) | config | Invalid layer pattern |
| [`CONFIG_LAYER_PATTERN_NO_MATCHES`](#CONFIG_LAYER_PATTERN_NO_MATCHES) | config | Layer pattern matched no files |
| [`CONFIG_DUPLICATE_LAYER`](#CONFIG_DUPLICATE_LAYER) | config | Duplicate layer name |
| [`CONFIG_RULE_UNKNOWN_FROM_LAYER`](#CONFIG_RULE_UNKNOWN_FROM_LAYER) | config | Rule unknown from layer |
| [`CONFIG_RULE_UNKNOWN_TO_LAYER`](#CONFIG_RULE_UNKNOWN_TO_LAYER) | config | Rule unknown to layer |
| [`CONFIG_AMBIGUOUS_LAYERS`](#CONFIG_AMBIGUOUS_LAYERS) | config | Ambiguous layer classification |
| [`CONFIG_UNCLASSIFIED_FILES`](#CONFIG_UNCLASSIFIED_FILES) | config | Unclassified included files |
| [`ARK_UNKNOWN`](#ARK_UNKNOWN) | meta | Unknown diagnostic |

## Layer and dependency graph

<a id="LAYER_IMPORT_VIOLATION"></a>

### `LAYER_IMPORT_VIOLATION`

**Layer import not allowed**

- **Why:** A module import (or re-export) crosses a layer edge that ark.config.json does not allow. The architecture contract forbids that dependency direction so outer infrastructure cannot leak into pure or inner layers.
- **Fix:** Branch by import kind: constants/types/pure → adopt into DomainModel or SharedKernel (do not invent a port); kernel/events/bootstrap from Persistence → inject a port or move the map to SharedTypes (Persistence must not emit); define a port only when the target is a real use-case. Type-only edges use `import type`. Then preflight again. Do not weaken the layer rule without a hash-bound policy acknowledgement.

<a id="LAYER_INTENT_REFERENCE_VIOLATION"></a>

### `LAYER_INTENT_REFERENCE_VIOLATION`

**Intent referenced across a blocked layer edge**

- **Why:** A string intent (or intent-like reference) names a layer that the file’s layer may not reach under the contract rules — the same plane as import edges, for event/intent coupling.
- **Fix:** Reference that intent from a layer allowed to know about it (usually an adapter or application layer), or relocate the reference — then preflight again.

<a id="LAYER_REFERENCE_VIOLATION"></a>

### `LAYER_REFERENCE_VIOLATION`

**Layer reference blocked (snippet / AI gate)**

- **Why:** Snippet analysis found an intent or string reference that would couple layers in a direction the architecture profile forbids.
- **Fix:** Move the reference to an allowed layer or introduce a port/event boundary, then re-run the snippet gate.

<a id="CIRCULAR_DEPENDENCY"></a>

### `CIRCULAR_DEPENDENCY`

**Dependency cycle**

- **Why:** Two or more modules import each other in a loop. Cycles make ownership unclear and break stable layer direction.
- **Fix:** Extract the shared dependency into a third module, invert one edge behind a port, or merge units that are truly one — then preflight again.

## Capabilities and ambient globals

<a id="FORBIDDEN_GLOBAL"></a>

### `FORBIDDEN_GLOBAL`

**Forbidden ambient global or dual import**

- **Why:** The file’s layer lists this ambient (or its exact import dual, e.g. process / node:process) in forbiddenGlobals. Pure layers must not reach wall-clock, network, process, or similar effects directly.
- **Fix:** Inject the capability through a small port (Clock, HttpPort, Config, …), bind the implementation outside the walled layer, then preflight again.

<a id="CAPABILITY_VIOLATION"></a>

### `CAPABILITY_VIOLATION`

**Denied effect capability**

- **Why:** The layer denies an effect capability (network, filesystem, clock, randomness, environment, process, persistence) and the candidate uses that effect via ambient or import evidence.
- **Fix:** Define a capability port in the walled layer, bind the implementation in an adapter layer, then preflight again. Never mechanical-safe — port shape is a design decision.

## Publish and intents

<a id="RAW_EVENT_PUBLISH"></a>

### `RAW_EVENT_PUBLISH`

**Raw event publish**

- **Why:** Publish went through a raw string or object instead of a registered intent creator, bypassing Ark intent contracts and tooling.
- **Fix:** Publish through a registered intent creator, then run Ark again.

<a id="PUBLISH_MISSING_SOURCE"></a>

### `PUBLISH_MISSING_SOURCE`

**Publish missing metadata.source**

- **Why:** A strict Ark publish call omitted metadata.source, so the publishing layer cannot be verified.
- **Fix:** Add metadata.source to the publish call, then run Ark again.

<a id="PUBLISH_SOURCE_LAYER_MISMATCH"></a>

### `PUBLISH_SOURCE_LAYER_MISMATCH`

**Publish source layer mismatch**

- **Why:** metadata.source resolves to a different layer than the file performing the publish.
- **Fix:** Use a source intent owned by the same layer as this file, or move the publish call to the owning layer.

<a id="UNKNOWN_INTENT"></a>

### `UNKNOWN_INTENT`

**Unknown intent reference**

- **Why:** Snippet analysis saw an intent string that is not registered in the intent registry / profile under check.
- **Fix:** Register the intent or use a known intent name from the project registry, then re-run the gate.

## Safety thresholds and dynamic loading

<a id="DYNAMIC_IMPORT_NOT_ALLOWLISTED"></a>

### `DYNAMIC_IMPORT_NOT_ALLOWLISTED`

**Non-literal dynamic import**

- **Why:** A dynamic import(expr) cannot be resolved statically and the file is not on dynamicImportAllowlist. Unresolved dynamics can hide layer edges.
- **Fix:** Rewrite to a static import when possible, or add only reviewed files to dynamicImportAllowlist after human sign-off.

<a id="DYNAMIC_REQUIRE_NOT_ALLOWLISTED"></a>

### `DYNAMIC_REQUIRE_NOT_ALLOWLISTED`

**Non-literal require**

- **Why:** A require(expr) cannot be resolved statically and is not allowlisted — same hide-the-edge risk as dynamic import.
- **Fix:** Prefer static import, or allowlist only reviewed files after sign-off.

<a id="TS_SUPPRESSION_THRESHOLD_EXCEEDED"></a>

### `TS_SUPPRESSION_THRESHOLD_EXCEEDED`

**@ts-ignore / @ts-nocheck threshold**

- **Why:** Count of TypeScript suppressions in governed production source exceeds safety.maxTsSuppressions.
- **Fix:** Remove suppressions by fixing types, or raise the threshold only with an explicit production exception in ark.config.json.

<a id="ANY_CAST_THRESHOLD_EXCEEDED"></a>

### `ANY_CAST_THRESHOLD_EXCEEDED`

**Explicit any cast threshold**

- **Why:** Count of explicit any casts exceeds safety.maxAnyCasts.
- **Fix:** Replace any with precise types, or raise the threshold only with a documented exception.

<a id="IN_MEMORY_STORE_IN_PRODUCTION_SOURCE"></a>

### `IN_MEMORY_STORE_IN_PRODUCTION_SOURCE`

**In-memory store in production source**

- **Why:** Governed production source references an Ark InMemory* store without safety.allowInMemory — durable systems should not ship ephemeral stores by accident.
- **Fix:** Provide a durable store implementation, or set safety.allowInMemory only for an explicitly ephemeral service.

<a id="PEER_ISOLATION_DISABLED"></a>

### `PEER_ISOLATION_DISABLED`

**peerIsolation disabled on a rule**

- **Why:** A same-layer or peer rule disables peerIsolation (or omits it where required), which allows cross-slice coupling the contract otherwise blocks.
- **Fix:** Restore peerIsolation: true, or set safety.allowDisabledPeerIsolation only with a documented production exception.

## ArkRules (structure and invariants)

<a id="ARKRULE_STRUCTURE"></a>

### `ARKRULE_STRUCTURE`

**ArkRule structure sensor failed**

- **Why:** An opt-in ArkRules structure sensor (private state, factory shape, event publish, …) failed on a governed file for a declared arkruleId.
- **Fix:** Restore the declared structure for the ArkRule (see arkruleSource), then preflight again. Do not demote the rule without a hash-bound policy acknowledgement.

<a id="ARKRULE_INVARIANT"></a>

### `ARKRULE_INVARIANT`

**ArkRule invariant failed**

- **Why:** Reserved / remediation-recognized code for invariant-plane failures bound to an ArkRule id (coverage path also emits INVARIANT_UNCOVERED).
- **Fix:** Fix the invariant for the ArkRule declared in arkrules/<Layer>.json, then preflight again. Do not demote without acknowledgement.

<a id="ARKRULE_SCOPE_EMPTY"></a>

### `ARKRULE_SCOPE_EMPTY`

**ArkRule appliesTo matched zero files** · often advisory

- **Why:** An ArkRule’s appliesTo globs matched no governed files — the rule cannot observe what it claims to protect.
- **Fix:** Fix appliesTo globs so they match governed files, or remove the rule. Enforced empty scope fails; advisory empty scope warns.

<a id="INVARIANT_UNCOVERED"></a>

### `INVARIANT_UNCOVERED`

**Invariant without coverage evidence**

- **Why:** An ArkRules invariant is under contract but no covering test title or declared symbol evidence was found (or coverage is partial). Kind is `never-had-tests` (adopt residual) vs `tests-disappeared` (suite exists).
- **Fix:** Add a test title or declared symbol covering the arkruleId, then preflight again. Treat never-had-tests as adopt residual; treat tests-disappeared as a regression. Missing test globs report partial — never fake green.

## ArkRun (opt-in extra)

Live adapters specialize `nextAction` with the call-site name or specifier when present
(casual `enthusiastHint` + engineer `nextAction`). Catalog **Fix** is the stable no-target form.

<a id="ARKRUN_MISSING_ROOT"></a>

### `ARKRUN_MISSING_ROOT`

**No kernel factory in composition roots**

- **Why:** The ArkRun extra is on but no createArkKernel / createStrictArkKernel / createArkKernelFromConfig / createStrictArkKernelFromConfig factory was found in arkRun.compositionRoots, so agents can skip the kernel while the write gate stays green.
- **Fix:** Import createStrictArkKernel from arkgate/runtime (same npm package; @arkgate/runtime is deprecated) and call it in a composition root listed in arkRun.compositionRoots, then preflight again. Never mechanical-safe — factory placement is a design decision.

<a id="ARKRUN_KERNEL_IN_DOMAIN"></a>

### `ARKRUN_KERNEL_IN_DOMAIN`

**Domain-role layer imports the kernel**

- **Why:** A Domain-role layer imports arkgate/runtime, @arkgate/runtime, or kernel types. Domain stays kernel-free; composition roots and adapters own the factory.
- **Fix:** Move the kernel import out of the Domain-role layer into a composition root or adapter. Import from arkgate/runtime (same npm package; @arkgate/runtime is deprecated), then preflight again. Never mechanical-safe.

<a id="ARKRUN_DIRECT_NEW"></a>

### `ARKRUN_DIRECT_NEW`

**Managed type constructed with new**

- **Why:** A managed non-Domain file constructs an admitted type with new outside an ArkRun composition-root factory, skipping kernel resolve/registration.
- **Fix:** Resolve the type from the kernel instead of constructing it with new, then preflight again. Never mechanical-safe — rewiring construction is a design decision.

<a id="ARKRUN_UNDECLARED_EMIT"></a>

### `ARKRUN_UNDECLARED_EMIT`

**Emit name not in raises/sends**

- **Why:** A publisher / publish / raise / send call-site literal is not listed in the file’s raises or sends declaration.
- **Fix:** Add the existing call-site name to raises or sends on the managed component, then preflight again. Mechanical-safe only when that literal already exists and the edit is the declaration list; inventing a new emit stays judgment.

<a id="ARKRUN_UNDECLARED_HANDLE"></a>

### `ARKRUN_UNDECLARED_HANDLE`

**Handle name not in reactsTo**

- **Why:** A subscribe / registerHandler call-site literal is not listed in the file’s reactsTo declaration.
- **Fix:** Add the existing call-site name to reactsTo on the managed component, then preflight again. Mechanical-safe only when that literal already exists and the edit is the declaration list; inventing a new handle stays judgment.

<a id="ARKRUN_UNDECLARED_DEPEND"></a>

### `ARKRUN_UNDECLARED_DEPEND`

**Depend name not in uses**

- **Why:** A resolve / resolveSingleton call-site literal is not listed in the file’s uses declaration.
- **Fix:** Add the existing call-site name to uses on the managed component, then preflight again. Mechanical-safe only when that literal already exists and the edit is the declaration list; inventing a new depend stays judgment.

<a id="ARKRUN_TRANSPORT_BYPASS"></a>

### `ARKRUN_TRANSPORT_BYPASS`

**Homemade broker or emitter import**

- **Why:** A managed layer imports a closed broker/queue/emitter specifier (EventEmitter, queue clients, …) instead of the ArkRun kernel transport.
- **Fix:** Send through the ArkRun kernel transport instead of importing that broker or emitter, then preflight again. Never mechanical-safe — homemade buses stay judgment.

## ArkOrder (opt-in extra)

Haken slaving: few slow keys (ξ) determine derived fast state. Field ingest never mints a pattern.

<a id="ARKORDER_MISSING_PLANE"></a>

### `ARKORDER_MISSING_PLANE`

**No createOrderPlane in plane roots**

- **Why:** The ArkOrder extra is on but no createOrderPlane factory was found in arkOrder.planeRoots, so agents can skip the pattern plane while the write gate stays green.
- **Fix:** Import createOrderPlane from arkgate/order and call it in a plane root listed in arkOrder.planeRoots, then preflight again. Never mechanical-safe — factory placement is a design decision.

<a id="ARKORDER_KERNEL_IN_DOMAIN"></a>

### `ARKORDER_KERNEL_IN_DOMAIN`

**Domain-role layer imports the order plane**

- **Why:** A Domain-role layer imports arkgate/order. Domain stays plane-free; planeRoots own the factory.
- **Fix:** Move the arkgate/order import out of the Domain-role layer into a plane root or adapter, then preflight again. Never mechanical-safe.

<a id="ARKORDER_GENERIC_UPDATE"></a>

### `ARKORDER_GENERIC_UPDATE`

**Generic update of ξ**

- **Why:** A call to update/patch/set on the order plane rewrites the slow pattern. Haken slaving forbids generic ξ mutation.
- **Fix:** Use release() to freeze ξ or proposeRelease() for a pattern change with blast radius, then preflight again. Never mechanical-safe.

<a id="ARKORDER_TOO_MANY_PARAMS"></a>

### `ARKORDER_TOO_MANY_PARAMS`

**Too many slow keys**

- **Why:** ξ has more keys than arkOrder.maxXiKeys. Haken requires a few slow modes, not a dump of microstate.
- **Fix:** Cut ξ to the slow keys that actually slave the rest, then preflight again. Never mechanical-safe.

<a id="ARKORDER_INGEST_WRITES_XI"></a>

### `ARKORDER_INGEST_WRITES_XI`

**ingest assigned into ξ**

- **Why:** An ingest() result is written into a Release or ξ store. ingest may absorb or escalate; it never mints a pattern.
- **Fix:** Keep ingest results as absorb/escalate only. Change ξ with proposeRelease + release. Never mechanical-safe.

## Atomic preflight and change sets

<a id="INVALID_CHANGE_PATH"></a>

### `INVALID_CHANGE_PATH`

**Unsafe change path**

- **Why:** A change set entry is not a safe, non-empty project-relative path (absolute, escape, empty, or NUL).
- **Fix:** Use canonical project-relative paths only in the atomic change set, then preflight again.

<a id="DUPLICATE_CHANGE_PATH"></a>

### `DUPLICATE_CHANGE_PATH`

**Duplicate path in change set**

- **Why:** The atomic change set lists more than one operation for the same path.
- **Fix:** Collapse to one create/update/delete per path, then preflight again.

<a id="DELETE_TARGET_MISSING"></a>

### `DELETE_TARGET_MISSING`

**Delete target missing**

- **Why:** A delete operation targets a path that is not present in the supplied base tree.
- **Fix:** Remove the delete, or include the file in the base tree facts, then preflight again.

<a id="CHANGE_SET_EMPTY"></a>

### `CHANGE_SET_EMPTY`

**Empty change set**

- **Why:** Atomic preflight was invoked with no create, update, or delete operations.
- **Fix:** Provide at least one change operation, then preflight again.

<a id="FACTS_IDENTITY_MISMATCH"></a>

### `FACTS_IDENTITY_MISMATCH`

**Base/candidate facts identity mismatch**

- **Why:** Base and candidate resolved facts disagree on resolver, compiler, evidence requirements, or package identity — verdicts would not be comparable.
- **Fix:** Regenerate both fact snapshots with the same resolver/compiler/evidence requirements, then preflight again.

<a id="CANDIDATE_DELETE_NOT_APPLIED"></a>

### `CANDIDATE_DELETE_NOT_APPLIED`

**Candidate still contains deleted path**

- **Why:** Facts claim a delete, but the candidate tree still includes the path.
- **Fix:** Ensure the candidate facts apply the delete (path absent), then preflight again.

<a id="CANDIDATE_CHANGE_MISSING"></a>

### `CANDIDATE_CHANGE_MISSING`

**Declared change missing from candidate**

- **Why:** The change set declares a create/update whose path is missing from candidate facts.
- **Fix:** Include the new content in the candidate facts (or drop the operation), then preflight again.

<a id="CANDIDATE_CONTENT_HASH_MISMATCH"></a>

### `CANDIDATE_CONTENT_HASH_MISMATCH`

**Candidate content hash mismatch**

- **Why:** The candidate file content hash does not match the hash expected for the declared change.
- **Fix:** Rebuild candidate facts from the exact proposed content, then preflight again.

<a id="UNDECLARED_CANDIDATE_CHANGE"></a>

### `UNDECLARED_CANDIDATE_CHANGE`

**Undeclared candidate change**

- **Why:** Candidate facts differ from base for a path that was not listed in the explicit change set.
- **Fix:** Declare every path that changes in the atomic change set, then preflight again.

<a id="ATOMIC_PREFLIGHT_UNAVAILABLE"></a>

### `ATOMIC_PREFLIGHT_UNAVAILABLE`

**Atomic preflight unavailable**

- **Why:** The host/MCP path could not run the atomic preflight engine (missing facts, incomplete setup, or unsupported mode).
- **Fix:** Use resolved-candidate facts / ark_prepare_change with a complete batch, or fall back to ark-check on disk. Do not treat missing preflight as green.

<a id="DESIGN_SMELL_REGRESSION"></a>

### `DESIGN_SMELL_REGRESSION`

**Design smell regression on base-relative ratchet**

- **Why:** Compared to the base ref, the candidate introduces a created-path `domain-logic-in-ui` file under `--strict-merge`, or introduces or worsens a blocking design-smell class under `--fail-on-new-smells`.
- **Fix:** Move the new UI business rule out of the created file (or revert a `--fail-on-new-smells` regression), then re-run with the same base ref.

## Analysis host and completeness

<a id="ANALYSIS_PARSE_INCOMPLETE"></a>

### `ANALYSIS_PARSE_INCOMPLETE`

**Parse incomplete**

- **Why:** Governed source could not be fully parsed; evidence includes the TypeScript diagnostic (line + message). Incremental mid-edit parse is normal for agents. Contract `exclude` paths skip the write hook.
- **Fix:** Finish the source or fix the reported syntax error, then re-run `npx arkgate-check`. The write hook does not deny solely on mid-edit parse. Partial never means pass.

<a id="LEXICAL_EVIDENCE_INCOMPLETE"></a>

### `LEXICAL_EVIDENCE_INCOMPLETE`

**Lexical evidence incomplete**

- **Why:** Single-file validation cannot prove project module resolution. The write hook is already the verdict.
- **Fix:** Re-run `npx arkgate-check --root . --config ark.config.json`, or treat the hook deny as final. Do not call `ark_prepare_change` from a hook deny.

<a id="ANALYSIS_HOST_UNAVAILABLE"></a>

### `ANALYSIS_HOST_UNAVAILABLE`

**Analysis host unavailable**

- **Why:** No usable TypeScript / analysis host was available for this invocation.
- **Fix:** Install a supported TypeScript version visible to the project, then re-run. Unavailable analysis is fail-closed.

## Port adapters

<a id="ADAPTER_NOT_ALLOWED_FOR_PORT"></a>

### `ADAPTER_NOT_ALLOWED_FOR_PORT`

**Adapter not allowed for port**

- **Why:** Runtime/port wiring selected an adapter implementation that the architecture profile does not allow for that port.
- **Fix:** Bind an allowed adapter for the port, or adjust the profile with an explicit policy decision — then re-run.

## Snippet / AICodeGate policy

<a id="FORBIDDEN_PATTERN"></a>

### `FORBIDDEN_PATTERN`

**Forbidden regex pattern**

- **Why:** Snippet content matched a project or profile forbiddenPatterns rule.
- **Fix:** Remove or rewrite the matching code so the pattern no longer matches, then re-run the snippet gate.

<a id="FORBIDDEN_SUBSTRING"></a>

### `FORBIDDEN_SUBSTRING`

**Forbidden substring**

- **Why:** Snippet content contained a forbidden substring from the AI gate options/profile.
- **Fix:** Remove the forbidden substring, then re-run the snippet gate.

<a id="FORBIDDEN_IMPORT"></a>

### `FORBIDDEN_IMPORT`

**Forbidden import target**

- **Why:** Snippet imported or required a module listed as forbidden for the active profile.
- **Fix:** Import an allowed module or inject the dependency behind a port, then re-run.

<a id="POLICY_VIOLATION"></a>

### `POLICY_VIOLATION`

**Policy engine violation**

- **Why:** A registered Policy failed on the snippet or generated code under evaluation.
- **Fix:** Adjust the code to satisfy the named policy, or change the policy only through an explicit contract decision.

<a id="EXTENSION_ERROR"></a>

### `EXTENSION_ERROR`

**AI gate extension error**

- **Why:** A registered AICodeGate extension threw while analyzing the snippet.
- **Fix:** Fix or remove the failing extension; do not ignore extension failures as pass.

<a id="AST_ANALYZER_ERROR"></a>

### `AST_ANALYZER_ERROR`

**AST analyzer error**

- **Why:** Built-in AST/symbol analysis failed (host error or unexpected analyzer exception).
- **Fix:** Ensure TypeScript host and snippet are valid; re-run. If the analyzer crashes on valid input, file a bug with a minimal fixture.

## Configuration diagnostics

<a id="CONFIG_INVALID_DYNAMIC_IMPORT_ALLOWLIST"></a>

### `CONFIG_INVALID_DYNAMIC_IMPORT_ALLOWLIST`

**Invalid dynamicImportAllowlist** · often advisory

- **Why:** dynamicImportAllowlist is present but not an array of file globs.
- **Fix:** Set dynamicImportAllowlist to an array of project-relative globs (or omit it).

<a id="CONFIG_INVALID_SAFETY"></a>

### `CONFIG_INVALID_SAFETY`

**Invalid safety object** · often advisory

- **Why:** The safety field is present but not an object.
- **Fix:** Use a safety object with optional maxTsSuppressions, maxAnyCasts, allowInMemory, allowDisabledPeerIsolation.

<a id="CONFIG_INVALID_SAFETY_THRESHOLD"></a>

### `CONFIG_INVALID_SAFETY_THRESHOLD`

**Invalid safety threshold** · often advisory

- **Why:** A safety threshold (maxTsSuppressions / maxAnyCasts) is not a non-negative integer.
- **Fix:** Set each threshold to a non-negative integer.

<a id="CONFIG_NO_LAYERS"></a>

### `CONFIG_NO_LAYERS`

**No layers configured** · often advisory

- **Why:** ark.config.json has no file layers, so import-boundary enforcement cannot classify files.
- **Fix:** Declare at least one layer with name + patterns (or run ark start / a preset).

<a id="CONFIG_LAYER_WITHOUT_NAME"></a>

### `CONFIG_LAYER_WITHOUT_NAME`

**Layer missing name** · often advisory

- **Why:** A configured layer entry has no name.
- **Fix:** Give every layer a unique non-empty name.

<a id="CONFIG_INVALID_FORBIDDEN_GLOBALS"></a>

### `CONFIG_INVALID_FORBIDDEN_GLOBALS`

**Invalid forbiddenGlobals** · often advisory

- **Why:** A layer’s forbiddenGlobals is not an array of strings; the entry is ignored.
- **Fix:** Use an array of strings (e.g. ["fetch", "Date.now"]).

<a id="CONFIG_LAYER_WITHOUT_PATTERNS"></a>

### `CONFIG_LAYER_WITHOUT_PATTERNS`

**Layer without patterns** · often advisory

- **Why:** A named layer has no file patterns and will never classify files.
- **Fix:** Add patterns globs that match the layer’s source tree.

<a id="CONFIG_INVALID_LAYER_PATTERN"></a>

### `CONFIG_INVALID_LAYER_PATTERN`

**Invalid layer pattern** · often advisory

- **Why:** A layer pattern is not a valid glob / failed to compile.
- **Fix:** Fix the pattern syntax for that layer.

<a id="CONFIG_LAYER_PATTERN_NO_MATCHES"></a>

### `CONFIG_LAYER_PATTERN_NO_MATCHES`

**Layer pattern matched no files** · often advisory

- **Why:** A layer pattern matched zero included files (often a typo or include mismatch).
- **Fix:** Adjust the pattern or include roots so governed files match.

<a id="CONFIG_DUPLICATE_LAYER"></a>

### `CONFIG_DUPLICATE_LAYER`

**Duplicate layer name** · often advisory

- **Why:** The same layer name appears more than once in configuration.
- **Fix:** Rename or merge duplicate layer entries.

<a id="CONFIG_RULE_UNKNOWN_FROM_LAYER"></a>

### `CONFIG_RULE_UNKNOWN_FROM_LAYER`

**Rule unknown from layer** · often advisory

- **Why:** A dependency rule references a source layer name that is not declared.
- **Fix:** Fix the rule’s from field to a declared layer name.

<a id="CONFIG_RULE_UNKNOWN_TO_LAYER"></a>

### `CONFIG_RULE_UNKNOWN_TO_LAYER`

**Rule unknown to layer** · often advisory

- **Why:** A dependency rule references a target layer name that is not declared.
- **Fix:** Fix the rule’s to field to a declared layer name.

<a id="CONFIG_AMBIGUOUS_LAYERS"></a>

### `CONFIG_AMBIGUOUS_LAYERS`

**Ambiguous layer classification** · often advisory

- **Why:** Some files match multiple layers at equal specificity; classification falls back to declaration order.
- **Fix:** Disambiguate overlapping patterns so each file has one clear layer owner.

<a id="CONFIG_UNCLASSIFIED_FILES"></a>

### `CONFIG_UNCLASSIFIED_FILES`

**Unclassified included files** · often advisory

- **Why:** Included source files match no layer pattern; import rules will not enforce on them.
- **Fix:** Extend layer patterns or narrow include so every governed file is classified.

## Meta

<a id="ARK_UNKNOWN"></a>

### `ARK_UNKNOWN`

**Unknown diagnostic**

- **Why:** A diagnostic lacked a stable ruleId/code; adapters may emit this fallback so agents never see an empty id.
- **Fix:** Resolve the underlying finding without weakening ark.config.json, then run Ark again. Prefer fixing the producer to emit a catalogued ruleId.

## Related

- [Agent guide](agent-guide.md) — CLI / MCP / skills
- [Configuration](configuration.md) — ark.config.json
- [Package surface](package-surface.md) — stable exports
- [Product voice](product-voice.md) — guardrail catalog language
- [AI gates](ai-gates.md) — host install and scanner envelope
